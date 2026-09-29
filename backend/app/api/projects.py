from __future__ import annotations

from fastapi import APIRouter, status
from sqlalchemy import func

from app.core.deps import CurrentUser, DbSession, OwnedProject
from app.models.enums import AssetStatus
from app.models.generation import GeneratedContent
from app.models.media import ContentSegment, MediaAsset
from app.models.project import Project
from app.schemas.common import Message
from app.schemas.project import ProjectIn, ProjectOut, ProjectStats, ProjectUpdateIn

router = APIRouter(prefix="/projects", tags=["projects"])


def compute_stats(db, project_id: str) -> ProjectStats:
    rows = (
        db.query(MediaAsset.status, MediaAsset.modality, func.count(MediaAsset.id),
                 func.coalesce(func.sum(MediaAsset.duration_sec), 0.0))
        .filter(MediaAsset.project_id == project_id)
        .group_by(MediaAsset.status, MediaAsset.modality)
        .all()
    )
    stats = ProjectStats(by_modality={})
    for status_value, modality, count, duration in rows:
        stats.assets += count
        stats.duration_sec += float(duration or 0)
        stats.by_modality[modality] = stats.by_modality.get(modality, 0) + count
        if status_value == AssetStatus.READY:
            stats.ready += count
        elif status_value == AssetStatus.FAILED:
            stats.failed += count
        else:
            stats.processing += count

    stats.segments = (
        db.query(func.count(ContentSegment.id))
        .filter(ContentSegment.project_id == project_id).scalar() or 0
    )
    stats.generated = (
        db.query(func.count(GeneratedContent.id))
        .filter(GeneratedContent.project_id == project_id).scalar() or 0
    )
    stats.duration_sec = round(stats.duration_sec, 1)
    return stats


def to_out(db, project: Project) -> ProjectOut:
    out = ProjectOut.model_validate(project)
    out.stats = compute_stats(db, project.id)
    return out


@router.get("", response_model=list[ProjectOut])
def list_projects(user: CurrentUser, db: DbSession):
    projects = (
        db.query(Project).filter(Project.owner_id == user.id)
        .order_by(Project.updated_at.desc()).all()
    )
    return [to_out(db, p) for p in projects]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectIn, user: CurrentUser, db: DbSession):
    project = Project(owner_id=user.id, **payload.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return to_out(db, project)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project: OwnedProject, db: DbSession):
    return to_out(db, project)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(payload: ProjectUpdateIn, project: OwnedProject, db: DbSession):
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return to_out(db, project)


@router.delete("/{project_id}", response_model=Message)
def delete_project(project: OwnedProject, db: DbSession, user: CurrentUser):
    """Deletes the project, its rows (via cascade) and its files on disk."""
    from app.storage.local import get_storage

    freed = (
        db.query(func.coalesce(func.sum(MediaAsset.size_bytes), 0))
        .filter(MediaAsset.project_id == project.id).scalar() or 0
    )
    storage = get_storage()
    db.delete(project)
    user.storage_used_bytes = max(0, user.storage_used_bytes - int(freed))
    db.commit()
    storage.delete(f"{user.id}/{project.id}")
    return Message(detail="Project deleted")
