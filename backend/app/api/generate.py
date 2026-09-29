from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func

from app.core.deps import CurrentUser, DbSession
from app.core.errors import AppError, NotFound
from app.core.rate_limit import ai_limiter
from app.models.enums import ContentType, Platform, Tone
from app.models.generation import ContentCitation, ContentVersion, GeneratedContent
from app.models.project import Project
from app.schemas.common import Message
from app.schemas.generation import (
    CitationOut, ContentOut, ContentUpdateIn, GenerateIn, GenerateOut, VersionOut,
)
from app.services.generation import PLATFORM_RULES, generate_content

router = APIRouter(tags=["generation"])


def _own_project(db, user, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.owner_id != user.id:
        raise NotFound("Project")
    return project


def to_out(db, row: GeneratedContent) -> ContentOut:
    out = ContentOut.model_validate(row)
    out.citations = [
        CitationOut(
            marker=i, segment_id=c.segment_id, asset_id=c.asset_id, quote=c.quote,
            start_sec=c.start_sec, page_number=c.page_number, relevance=c.relevance,
        )
        for i, c in enumerate(row.citations, start=1)
    ]
    out.version_count = (
        db.query(func.count(ContentVersion.id))
        .filter(ContentVersion.content_id == row.id).scalar() or 0
    )
    return out


@router.get("/generate/options")
def generation_options():
    """Everything the Create screen needs to build its form. No hard-coded lists in the UI."""
    return {
        "content_types": list(ContentType.ALL),
        "platforms": list(Platform.ALL),
        "tones": list(Tone.ALL),
        "lengths": ["short", "medium", "long"],
        "platform_rules": PLATFORM_RULES,
        "max_variations": 5,
    }


@router.post(
    "/generate", response_model=GenerateOut,
    status_code=status.HTTP_201_CREATED, dependencies=[Depends(ai_limiter)],
)
async def generate(payload: GenerateIn, user: CurrentUser, db: DbSession):
    project = _own_project(db, user, payload.project_id)
    rows, mode, note, sources = await generate_content(db, user.id, project, payload)
    return GenerateOut(
        items=[to_out(db, r) for r in rows], mode=mode, sources_note=note, sources_used=sources
    )


@router.get("/projects/{project_id}/content", response_model=list[ContentOut])
def list_content(
    project_id: str, user: CurrentUser, db: DbSession,
    content_type: str | None = Query(default=None),
    platform: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    favorites_only: bool = Query(default=False),
    q: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=100, ge=1, le=300),
):
    _own_project(db, user, project_id)
    query = db.query(GeneratedContent).filter(GeneratedContent.project_id == project_id)
    if content_type:
        query = query.filter(GeneratedContent.content_type == content_type)
    if platform:
        query = query.filter(GeneratedContent.platform == platform)
    if status_filter:
        query = query.filter(GeneratedContent.status == status_filter)
    if favorites_only:
        query = query.filter(GeneratedContent.is_favorite.is_(True))
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(
            func.lower(GeneratedContent.title).like(like)
            | func.lower(GeneratedContent.body).like(like)
        )
    rows = query.order_by(GeneratedContent.created_at.desc()).limit(limit).all()
    return [to_out(db, r) for r in rows]


def _own_content(db, user, content_id: str) -> GeneratedContent:
    row = db.get(GeneratedContent, content_id)
    if row is None or row.owner_id != user.id:
        raise NotFound("Content")
    return row


@router.get("/content/{content_id}", response_model=ContentOut)
def get_content(content_id: str, user: CurrentUser, db: DbSession):
    return to_out(db, _own_content(db, user, content_id))


@router.patch("/content/{content_id}", response_model=ContentOut)
def update_content(content_id: str, payload: ContentUpdateIn, user: CurrentUser, db: DbSession):
    """Any edit to the text snapshots a new version, so nothing is lost."""
    row = _own_content(db, user, content_id)
    data = payload.model_dump(exclude_unset=True)
    note = data.pop("note", "")

    text_changed = any(
        field in data and data[field] != getattr(row, field)
        for field in ("title", "body", "structured")
    )
    if text_changed:
        latest = (
            db.query(func.max(ContentVersion.version))
            .filter(ContentVersion.content_id == row.id).scalar() or 0
        )
        db.add(ContentVersion(
            content_id=row.id, version=latest + 1,
            title=data.get("title", row.title), body=data.get("body", row.body),
            structured=data.get("structured", row.structured),
            edited_by_user=True, note=note or "Manual edit",
        ))

    for field, value in data.items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return to_out(db, row)


@router.get("/content/{content_id}/versions", response_model=list[VersionOut])
def list_versions(content_id: str, user: CurrentUser, db: DbSession):
    row = _own_content(db, user, content_id)
    versions = (
        db.query(ContentVersion)
        .filter(ContentVersion.content_id == row.id)
        .order_by(ContentVersion.version.desc()).all()
    )
    return [VersionOut.model_validate(v) for v in versions]


@router.post("/content/{content_id}/restore/{version}", response_model=ContentOut)
def restore_version(content_id: str, version: int, user: CurrentUser, db: DbSession):
    row = _own_content(db, user, content_id)
    target = (
        db.query(ContentVersion)
        .filter(ContentVersion.content_id == row.id, ContentVersion.version == version).first()
    )
    if target is None:
        raise NotFound(f"Version {version}")

    latest = (
        db.query(func.max(ContentVersion.version))
        .filter(ContentVersion.content_id == row.id).scalar() or 0
    )
    db.add(ContentVersion(
        content_id=row.id, version=latest + 1, title=target.title, body=target.body,
        structured=target.structured, edited_by_user=True, note=f"Restored from v{version}",
    ))
    row.title, row.body, row.structured = target.title, target.body, target.structured
    db.commit()
    db.refresh(row)
    return to_out(db, row)


@router.delete("/content/{content_id}", response_model=Message)
def delete_content(content_id: str, user: CurrentUser, db: DbSession):
    db.delete(_own_content(db, user, content_id))
    db.commit()
    return Message(detail="Content deleted")


@router.get("/content/{content_id}/export")
def export_content(content_id: str, user: CurrentUser, db: DbSession,
                   fmt: str = Query(default="md", pattern="^(md|txt|json)$")):
    """Plain-text exports. DOCX/PDF export is handled client-side from markdown."""
    from fastapi.responses import PlainTextResponse, JSONResponse as JR

    row = _own_content(db, user, content_id)
    if fmt == "json":
        return JR(content=to_out(db, row).model_dump(mode="json"))

    if fmt == "md":
        lines = [f"# {row.title}", "", row.body]
        if row.citations:
            lines += ["", "## Sources", ""]
            lines += [
                f"{i}. {c.quote[:160]}…" for i, c in enumerate(row.citations, start=1)
            ]
        if row.generation_source == "demo":
            lines += ["", "> Generated in demo mode (no AI provider configured)."]
        text = "\n".join(lines)
    else:
        text = f"{row.title}\n\n{row.body}"

    filename = (row.title or "content").lower().replace(" ", "-")[:60]
    return PlainTextResponse(
        text,
        headers={"Content-Disposition": f'attachment; filename="{filename}.{fmt}"'},
    )
