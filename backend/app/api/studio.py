"""Thumbnail studio, brand profiles, library, calendar and analytics."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func

from app.ai import registry
from app.ai.base import AIResult
from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, OwnedAsset
from app.core.errors import AppError, NotFound
from app.core.rate_limit import ai_limiter
from app.models.enums import AssetStatus, DraftStatus, Modality, Platform
from app.models.generation import GeneratedContent
from app.models.job import ProcessingJob
from app.models.media import ContentSegment, MediaAsset
from app.models.planner import CalendarEntry, Notification, SocialConnection
from app.models.project import Project
from app.models.user import BrandProfile
from app.processing import video as vid
from app.prompts.templates import THUMBNAIL_CONCEPTS, fence
from app.schemas.common import ORMModel, Message
from app.schemas.video import ThumbnailIn, ThumbnailsOut
from app.services.thumbnails import SIZES, render
from app.storage.local import get_storage

router = APIRouter(tags=["studio"])


def _own_project(db, user, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.owner_id != user.id:
        raise NotFound("Project")
    return project


# --------------------------------------------------------------------------- #
# Thumbnail studio
# --------------------------------------------------------------------------- #

@router.post("/thumbnails/{media_id}/concepts", response_model=ThumbnailsOut,
             dependencies=[Depends(ai_limiter)])
async def thumbnail_concepts(asset: OwnedAsset, db: DbSession):
    storage = get_storage()
    frames: list[dict[str, Any]] = []

    if asset.modality == Modality.VIDEO:
        out_dir = storage.path(f"{asset.owner_id}/{asset.project_id}/derived/{asset.id}/frames")
        src = storage.path(asset.storage_key)
        existing = sorted(out_dir.glob("frame_*.jpg")) if out_dir.exists() else []
        if not existing and src.exists():
            existing = [f.path for f in vid.extract_frames(src, out_dir, count=12)]
        root = storage.path("")
        frames = [
            {"time_sec": round(int(Path(f).stem.split("_")[-1]) / 1000, 2),
             "key": str(Path(f).relative_to(root))}
            for f in existing
        ]

    context = "\n".join(filter(None, [
        f"TITLE: {asset.title}",
        f"SUMMARY: {asset.summary}",
        f"TOPICS: {', '.join(str(t) for t in (asset.topics or [])[:8])}",
        f"KEY POINTS:\n" + "\n".join(f"- {p}" for p in (asset.extra or {}).get("key_points", [])[:8]),
    ]))

    def fallback() -> AIResult:
        words = [str(t) for t in (asset.topics or [])][:3] or (asset.title or "Your video").split()[:3]
        base = " ".join(words).title()
        return AIResult(
            data={"concepts": [
                {"headline": base[:40], "subtext": asset.title[:60],
                 "visual_direction": "Use a representative frame from the video.",
                 "composition": comp, "palette": ["#7C3AED", "#0EA5E9"],
                 "rationale": "Template concept built from the extracted topics.",
                 "image_prompt": "", "best_frame_hint": ""}
                for comp in ("left-text", "bottom-bar", "centered")
            ]},
            source="demo",
        )

    if registry.is_live() and context.strip():
        result = await registry.run_template(
            THUMBNAIL_CONCEPTS,
            [{"text": f"Design thumbnail concepts for this video.\n\n{fence(context)}"}],
            demo_fallback=fallback,
        )
    else:
        result = fallback()

    return ThumbnailsOut(
        concepts=result.data.get("concepts", [])[:5],
        frames=frames,
        mode=result.source,
        image_generation=settings.IMAGE_PROVIDER,
        note=(
            "Image generation is not configured, so concepts are rendered over real frames "
            "from your video using text-overlay templates."
            if settings.IMAGE_PROVIDER == "none" else ""
        ),
    )


@router.post("/thumbnails/{media_id}/render")
def render_thumbnail(
    payload: ThumbnailIn, asset: OwnedAsset, user: CurrentUser,
    preset: str = Query(default="youtube"),
):
    """Composites a headline over a chosen frame and returns a downloadable JPEG."""
    if preset not in SIZES:
        raise AppError(f"Unknown preset. Choose from {list(SIZES)}", 400, "bad_preset")
    if not payload.headline.strip():
        raise AppError("A headline is required", 400, "missing_headline")

    storage = get_storage()
    background: Path | None = None

    if asset.modality == Modality.VIDEO and payload.frame_time_sec is not None:
        out_dir = storage.path(f"{asset.owner_id}/{asset.project_id}/derived/{asset.id}/frames")
        src = storage.path(asset.storage_key)
        if src.exists():
            picked = vid.extract_frames(src, out_dir, at_times=[payload.frame_time_sec])
            background = picked[0].path if picked else None
    elif asset.modality == Modality.IMAGE:
        background = storage.path(asset.storage_key)

    dest = storage.path(
        f"{user.id}/{asset.project_id}/derived/{asset.id}/thumbnails/{preset}-{abs(hash(payload.headline)) % 10**8}.jpg"
    )
    render(
        background, dest,
        headline=payload.headline, subtext=payload.subtext,
        template=payload.template, size=SIZES[preset], palette=payload.palette,
    )
    return FileResponse(
        dest, media_type="image/jpeg",
        headers={"Content-Disposition": f'attachment; filename="thumbnail-{preset}.jpg"'},
    )


@router.get("/thumbnails/presets")
def thumbnail_presets():
    return {
        "presets": {k: {"width": w, "height": h} for k, (w, h) in SIZES.items()},
        "templates": ["left-text", "right-text", "centered", "bottom-bar"],
        "image_provider": settings.IMAGE_PROVIDER,
    }


# --------------------------------------------------------------------------- #
# Brand profiles
# --------------------------------------------------------------------------- #

class BrandIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)
    tone: str = Field(default="professional", max_length=40)
    audience: str = Field(default="", max_length=200)
    preferred_phrases: str = Field(default="", max_length=1000)
    banned_phrases: str = Field(default="", max_length=1000)
    writing_rules: str = Field(default="", max_length=2000)
    emoji_policy: str = Field(default="sparing", max_length=20)
    is_default: bool = False


class BrandOut(ORMModel):
    id: str
    name: str
    description: str
    tone: str
    audience: str
    preferred_phrases: str
    banned_phrases: str
    writing_rules: str
    emoji_policy: str
    is_default: bool
    created_at: datetime


@router.get("/brand-profiles", response_model=list[BrandOut])
def list_brands(user: CurrentUser, db: DbSession):
    return db.query(BrandProfile).filter(BrandProfile.owner_id == user.id).order_by(
        BrandProfile.is_default.desc(), BrandProfile.name
    ).all()


@router.post("/brand-profiles", response_model=BrandOut, status_code=status.HTTP_201_CREATED)
def create_brand(payload: BrandIn, user: CurrentUser, db: DbSession):
    if payload.is_default:
        db.query(BrandProfile).filter(BrandProfile.owner_id == user.id).update({"is_default": False})
    brand = BrandProfile(owner_id=user.id, **payload.model_dump())
    db.add(brand)
    db.commit()
    db.refresh(brand)
    return brand


@router.patch("/brand-profiles/{brand_id}", response_model=BrandOut)
def update_brand(brand_id: str, payload: BrandIn, user: CurrentUser, db: DbSession):
    brand = db.get(BrandProfile, brand_id)
    if brand is None or brand.owner_id != user.id:
        raise NotFound("Brand profile")
    if payload.is_default:
        db.query(BrandProfile).filter(BrandProfile.owner_id == user.id).update({"is_default": False})
    for field, value in payload.model_dump().items():
        setattr(brand, field, value)
    db.commit()
    db.refresh(brand)
    return brand


@router.delete("/brand-profiles/{brand_id}", response_model=Message)
def delete_brand(brand_id: str, user: CurrentUser, db: DbSession):
    brand = db.get(BrandProfile, brand_id)
    if brand is None or brand.owner_id != user.id:
        raise NotFound("Brand profile")
    db.delete(brand)
    db.commit()
    return Message(detail="Brand profile deleted")


# --------------------------------------------------------------------------- #
# Library — unified search across uploads and generated content
# --------------------------------------------------------------------------- #

@router.get("/library")
def library(
    user: CurrentUser, db: DbSession,
    project_id: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=200),
    kind: str = Query(default="all", pattern="^(all|assets|content)$"),
    favorites_only: bool = Query(default=False),
    limit: int = Query(default=60, ge=1, le=200),
):
    assets: list[dict[str, Any]] = []
    content: list[dict[str, Any]] = []

    if kind in ("all", "assets"):
        query = db.query(MediaAsset).filter(MediaAsset.owner_id == user.id)
        if project_id:
            query = query.filter(MediaAsset.project_id == project_id)
        if favorites_only:
            query = query.filter(MediaAsset.is_favorite.is_(True))
        if q:
            like = f"%{q.lower()}%"
            query = query.filter(
                func.lower(MediaAsset.original_filename).like(like)
                | func.lower(MediaAsset.title).like(like)
                | func.lower(MediaAsset.summary).like(like)
                | func.lower(MediaAsset.full_text).like(like)
            )
        assets = [
            {
                "id": a.id, "kind": "asset", "project_id": a.project_id,
                "title": a.title or a.original_filename, "subtitle": a.summary[:180],
                "modality": a.modality, "status": a.status, "is_favorite": a.is_favorite,
                "thumbnail": bool(a.thumbnail_key), "created_at": a.created_at,
                "size_bytes": a.size_bytes, "duration_sec": a.duration_sec, "tags": a.tags,
            }
            for a in query.order_by(MediaAsset.created_at.desc()).limit(limit).all()
        ]

    if kind in ("all", "content"):
        query = db.query(GeneratedContent).filter(GeneratedContent.owner_id == user.id)
        if project_id:
            query = query.filter(GeneratedContent.project_id == project_id)
        if favorites_only:
            query = query.filter(GeneratedContent.is_favorite.is_(True))
        if q:
            like = f"%{q.lower()}%"
            query = query.filter(
                func.lower(GeneratedContent.title).like(like)
                | func.lower(GeneratedContent.body).like(like)
            )
        content = [
            {
                "id": c.id, "kind": "content", "project_id": c.project_id,
                "title": c.title or c.content_type, "subtitle": c.body[:180],
                "content_type": c.content_type, "platform": c.platform, "status": c.status,
                "is_favorite": c.is_favorite, "generation_source": c.generation_source,
                "created_at": c.created_at, "tags": c.tags,
            }
            for c in query.order_by(GeneratedContent.created_at.desc()).limit(limit).all()
        ]

    return {"assets": assets, "content": content, "total": len(assets) + len(content)}


# --------------------------------------------------------------------------- #
# Calendar / planner
# --------------------------------------------------------------------------- #

class CalendarIn(BaseModel):
    project_id: str
    title: str = Field(min_length=1, max_length=300)
    scheduled_for: datetime
    platform: str = Field(default=Platform.NONE)
    notes: str = Field(default="", max_length=2000)
    content_id: str | None = None
    campaign: str = Field(default="", max_length=160)
    status: str = Field(default=DraftStatus.DRAFT)


class CalendarUpdateIn(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    scheduled_for: datetime | None = None
    platform: str | None = None
    notes: str | None = Field(default=None, max_length=2000)
    status: str | None = None
    campaign: str | None = Field(default=None, max_length=160)


class CalendarOut(ORMModel):
    id: str
    project_id: str
    content_id: str | None = None
    title: str
    notes: str
    platform: str
    scheduled_for: datetime
    status: str
    campaign: str
    published_at: datetime | None = None


@router.get("/calendar", response_model=list[CalendarOut])
def list_calendar(
    user: CurrentUser, db: DbSession,
    project_id: str | None = Query(default=None),
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
):
    query = db.query(CalendarEntry).filter(CalendarEntry.owner_id == user.id)
    if project_id:
        query = query.filter(CalendarEntry.project_id == project_id)
    if start:
        query = query.filter(CalendarEntry.scheduled_for >= start)
    if end:
        query = query.filter(CalendarEntry.scheduled_for <= end)
    return query.order_by(CalendarEntry.scheduled_for).limit(500).all()


@router.post("/calendar", response_model=CalendarOut, status_code=status.HTTP_201_CREATED)
def create_calendar(payload: CalendarIn, user: CurrentUser, db: DbSession):
    _own_project(db, user, payload.project_id)
    entry = CalendarEntry(owner_id=user.id, **payload.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.patch("/calendar/{entry_id}", response_model=CalendarOut)
def update_calendar(entry_id: str, payload: CalendarUpdateIn, user: CurrentUser, db: DbSession):
    entry = db.get(CalendarEntry, entry_id)
    if entry is None or entry.owner_id != user.id:
        raise NotFound("Calendar entry")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/calendar/{entry_id}", response_model=Message)
def delete_calendar(entry_id: str, user: CurrentUser, db: DbSession):
    entry = db.get(CalendarEntry, entry_id)
    if entry is None or entry.owner_id != user.id:
        raise NotFound("Calendar entry")
    db.delete(entry)
    db.commit()
    return Message(detail="Entry removed")


@router.get("/social/connections")
def social_connections(user: CurrentUser, db: DbSession):
    """Publishing is not wired to any platform.

    The planner schedules and tracks status locally and never reports a post as
    published, because no OAuth integration exists to confirm it.
    """
    rows = {
        c.platform: c
        for c in db.query(SocialConnection).filter(SocialConnection.owner_id == user.id).all()
    }
    return {
        "publishing_enabled": False,
        "explanation": (
            "Direct publishing needs a registered developer app and OAuth credentials for "
            "each platform. Until one is connected CreatorAI will schedule and remind, but "
            "never claim a post was published."
        ),
        "platforms": [
            {
                "platform": p,
                "connected": p in rows and rows[p].is_connected,
                "account_name": rows[p].account_name if p in rows else "",
                "setup_required": [
                    f"Register a developer app for {p}",
                    "Add the client id/secret to backend environment variables",
                    "Complete the OAuth consent flow",
                ],
            }
            for p in (Platform.YOUTUBE, Platform.INSTAGRAM, Platform.LINKEDIN,
                      Platform.TIKTOK, Platform.X, Platform.FACEBOOK)
        ],
    }


# --------------------------------------------------------------------------- #
# Analytics
# --------------------------------------------------------------------------- #

@router.get("/analytics/overview")
def analytics_overview(
    user: CurrentUser, db: DbSession,
    project_id: str | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=365),
):
    """Content-production analytics.

    These are CreatorAI's own numbers. They are NOT platform engagement metrics
    (views, likes, reach) — no social analytics API is connected.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    def scope(query, model):
        query = query.filter(model.owner_id == user.id)
        return query.filter(model.project_id == project_id) if project_id else query

    assets_q = scope(db.query(MediaAsset), MediaAsset)
    content_q = scope(db.query(GeneratedContent), GeneratedContent)
    jobs_q = scope(db.query(ProcessingJob), ProcessingJob)

    by_modality = dict(
        scope(db.query(MediaAsset.modality, func.count(MediaAsset.id)), MediaAsset)
        .group_by(MediaAsset.modality).all()
    )
    by_type = dict(
        scope(db.query(GeneratedContent.content_type, func.count(GeneratedContent.id)), GeneratedContent)
        .group_by(GeneratedContent.content_type).all()
    )
    by_platform = dict(
        scope(db.query(GeneratedContent.platform, func.count(GeneratedContent.id)), GeneratedContent)
        .group_by(GeneratedContent.platform).all()
    )
    by_status = dict(
        scope(db.query(GeneratedContent.status, func.count(GeneratedContent.id)), GeneratedContent)
        .group_by(GeneratedContent.status).all()
    )
    job_status = dict(jobs_q.with_entities(ProcessingJob.status, func.count(ProcessingJob.id))
                      .group_by(ProcessingJob.status).all())

    succeeded = job_status.get("succeeded", 0)
    failed = job_status.get("failed", 0)
    total_jobs = succeeded + failed

    daily_assets = _daily(db, MediaAsset, user.id, project_id, since)
    daily_content = _daily(db, GeneratedContent, user.id, project_id, since)

    avg_ms = scope(db.query(func.avg(MediaAsset.processing_ms)), MediaAsset).filter(
        MediaAsset.processing_ms > 0
    ).scalar()

    return {
        "disclaimer": (
            "These are content-production metrics generated inside CreatorAI. They are not "
            "platform engagement metrics — no social analytics API is connected."
        ),
        "window_days": days,
        "totals": {
            "assets": assets_q.count(),
            "assets_ready": assets_q.filter(MediaAsset.status == AssetStatus.READY).count(),
            "assets_failed": assets_q.filter(MediaAsset.status == AssetStatus.FAILED).count(),
            "videos_processed": by_modality.get(Modality.VIDEO, 0),
            "generated_content": content_q.count(),
            "drafts": by_status.get(DraftStatus.DRAFT, 0),
            "scheduled": by_status.get(DraftStatus.SCHEDULED, 0),
            "segments_indexed": scope(db.query(ContentSegment), ContentSegment).count(),
            "storage_used_bytes": user.storage_used_bytes,
            "storage_quota_bytes": settings.USER_QUOTA_MB * 1024 * 1024,
        },
        "processing": {
            "succeeded": succeeded,
            "failed": failed,
            "success_rate": round(succeeded / total_jobs * 100, 1) if total_jobs else None,
            "avg_processing_ms": int(avg_ms) if avg_ms else 0,
        },
        "by_modality": by_modality,
        "by_content_type": by_type,
        "by_platform": by_platform,
        "by_status": by_status,
        "daily": {"assets": daily_assets, "content": daily_content},
    }


def _daily(db, model, owner_id: str, project_id: str | None, since: datetime) -> list[dict]:
    day = func.date_trunc("day", model.created_at) if settings.is_postgres else func.date(model.created_at)
    query = db.query(day.label("day"), func.count(model.id)).filter(
        model.owner_id == owner_id, model.created_at >= since
    )
    if project_id:
        query = query.filter(model.project_id == project_id)
    rows = query.group_by("day").order_by("day").all()
    formatted = []
    for d, c in rows:
        if isinstance(d, datetime):
            ds = d.date().isoformat()
        elif hasattr(d, "isoformat"):
            ds = d.isoformat()
        else:
            ds = str(d)
        formatted.append({"date": ds, "count": c})
    return formatted


@router.get("/notifications")
def list_notifications(user: CurrentUser, db: DbSession, unread_only: bool = Query(default=False)):
    query = db.query(Notification).filter(Notification.owner_id == user.id)
    if unread_only:
        query = query.filter(Notification.is_read.is_(False))
    rows = query.order_by(Notification.created_at.desc()).limit(50).all()
    return {
        "notifications": [
            {"id": n.id, "title": n.title, "body": n.body, "level": n.level,
             "link": n.link, "is_read": n.is_read, "created_at": n.created_at}
            for n in rows
        ],
        "unread": db.query(func.count(Notification.id)).filter(
            Notification.owner_id == user.id, Notification.is_read.is_(False)
        ).scalar() or 0,
    }


@router.post("/notifications/read-all", response_model=Message)
def mark_all_read(user: CurrentUser, db: DbSession):
    db.query(Notification).filter(
        Notification.owner_id == user.id, Notification.is_read.is_(False)
    ).update({"is_read": True})
    db.commit()
    return Message(detail="All notifications marked read")
