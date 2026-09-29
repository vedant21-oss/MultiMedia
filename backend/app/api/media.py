from __future__ import annotations

import hashlib
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlalchemy import func

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, OwnedAsset, OwnedProject
from app.core.errors import AppError, NotFound
from app.core.rate_limit import upload_limiter
from app.models.enums import AssetStatus, JobStatus
from app.models.job import ProcessingJob
from app.models.media import ContentSegment, MediaAsset
from app.processing.pipeline import ingest_asset
from app.schemas.common import Message
from app.schemas.media import AssetDetailOut, AssetOut, AssetUpdateIn, JobOut, SegmentOut, UploadResultOut
from app.storage.local import get_storage
from app.utils.files import classify, safe_filename
from app.workers import jobs

log = logging.getLogger(__name__)
router = APIRouter(tags=["media"])

CHUNK = 1 << 20  # 1 MiB


def _with_counts(db, assets: list[MediaAsset]) -> list[AssetOut]:
    if not assets:
        return []
    counts = dict(
        db.query(ContentSegment.asset_id, func.count(ContentSegment.id))
        .filter(ContentSegment.asset_id.in_([a.id for a in assets]))
        .group_by(ContentSegment.asset_id).all()
    )
    out = []
    for asset in assets:
        item = AssetOut.model_validate(asset)
        item.segment_count = counts.get(asset.id, 0)
        out.append(item)
    return out


async def _ingest_handler(job: ProcessingJob) -> None:
    """Runs inside the worker with its own DB session."""
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        asset = db.get(MediaAsset, job.asset_id)
        if asset is None:
            raise NotFound("Media asset")

        def on_progress(pct: int, message: str) -> None:
            fresh = db.get(ProcessingJob, job.id)
            if fresh:
                fresh.progress = pct
                fresh.step = message
                db.commit()

        await ingest_asset(db, asset, progress=on_progress)

        fresh = db.get(ProcessingJob, job.id)
        if fresh:
            fresh.result = {
                "segments": db.query(func.count(ContentSegment.id))
                .filter(ContentSegment.asset_id == asset.id).scalar() or 0,
                "analysis_source": asset.analysis_source,
            }
            db.commit()
    finally:
        db.close()


@router.post(
    "/projects/{project_id}/media",
    response_model=UploadResultOut,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(upload_limiter)],
)
async def upload_media(
    files: list[UploadFile],
    project: OwnedProject,
    user: CurrentUser,
    db: DbSession,
):
    """Accepts up to 10 files, stores them, and queues the pipeline.

    Returns 202 immediately; the client polls asset status for progress.
    """
    if not files:
        raise AppError("No files were received", 400, "no_files")
    if len(files) > 10:
        raise AppError("Upload at most 10 files at a time", 400, "too_many_files")

    storage = get_storage()
    created: list[MediaAsset] = []
    job_ids: list[str] = []
    skipped: list[dict[str, str]] = []

    for upload in files:
        name = upload.filename or "upload"
        try:
            _, mime, modality = classify(name)
        except ValueError as exc:
            skipped.append({"filename": name, "reason": str(exc)})
            continue

        quota_bytes = settings.USER_QUOTA_MB * 1024 * 1024
        if user.storage_used_bytes >= quota_bytes:
            skipped.append({"filename": name, "reason": "Storage quota reached"})
            continue

        safe = safe_filename(name)
        asset = MediaAsset(
            owner_id=user.id, project_id=project.id, original_filename=name[:400],
            storage_key="", mime_type=mime, modality=modality, size_bytes=0,
            status=AssetStatus.UPLOADED, status_message="Uploading…",
        )
        db.add(asset)
        db.flush()  # need asset.id for the storage key

        key = f"{user.id}/{project.id}/{asset.id}/{safe}"
        digest = hashlib.sha256()
        written = 0
        too_large = False

        target = storage.path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("wb") as fh:
            while chunk := await upload.read(CHUNK):
                written += len(chunk)
                if written > settings.max_upload_bytes:
                    too_large = True
                    break
                if user.storage_used_bytes + written > quota_bytes:
                    too_large = True
                    break
                digest.update(chunk)
                fh.write(chunk)

        if too_large:
            storage.delete(key)
            db.delete(asset)
            db.flush()
            skipped.append({
                "filename": name,
                "reason": f"Exceeds the {settings.MAX_UPLOAD_MB} MB limit or your remaining quota",
            })
            continue

        checksum = digest.hexdigest()
        duplicate = (
            db.query(MediaAsset)
            .filter(
                MediaAsset.project_id == project.id,
                MediaAsset.checksum == checksum,
                MediaAsset.id != asset.id,
            ).first()
        )
        if duplicate:
            storage.delete(key)
            db.delete(asset)
            db.flush()
            skipped.append({
                "filename": name,
                "reason": f"Identical to '{duplicate.original_filename}' already in this project",
            })
            continue

        asset.storage_key = key
        asset.checksum = checksum
        asset.size_bytes = written
        asset.status = AssetStatus.PROCESSING
        asset.status_message = "Queued for analysis…"
        user.storage_used_bytes += written
        created.append(asset)

    db.commit()

    for asset in created:
        db.refresh(asset)
        job = jobs.create_job(
            db, owner_id=user.id, project_id=project.id, kind="ingest", asset_id=asset.id
        )
        job_ids.append(job.id)
        jobs.submit(job.id, _ingest_handler)

    if settings.RUN_JOBS_INLINE and created:
        await jobs.drain()
        db.expire_all()

    if not created and skipped:
        raise AppError(
            "; ".join(f"{s['filename']}: {s['reason']}" for s in skipped), 400, "upload_rejected"
        )

    return UploadResultOut(
        assets=_with_counts(db, created), job_ids=job_ids,
        skipped=skipped, queue_depth=jobs.queue_depth(),
    )


@router.get("/projects/{project_id}/media", response_model=list[AssetOut])
def list_media(
    project: OwnedProject,
    db: DbSession,
    modality: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, max_length=200),
):
    query = db.query(MediaAsset).filter(MediaAsset.project_id == project.id)
    if modality:
        query = query.filter(MediaAsset.modality == modality)
    if status_filter:
        query = query.filter(MediaAsset.status == status_filter)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(
            func.lower(MediaAsset.original_filename).like(like)
            | func.lower(MediaAsset.title).like(like)
            | func.lower(MediaAsset.summary).like(like)
        )
    return _with_counts(db, query.order_by(MediaAsset.created_at.desc()).all())


@router.get("/media/{media_id}", response_model=AssetDetailOut)
def get_media(asset: OwnedAsset, db: DbSession):
    segments = (
        db.query(ContentSegment)
        .filter(ContentSegment.asset_id == asset.id)
        .order_by(ContentSegment.ordinal).all()
    )
    out = AssetDetailOut.model_validate(asset)
    out.segments = [SegmentOut.model_validate(s) for s in segments]
    out.segment_count = len(segments)
    return out


@router.patch("/media/{media_id}", response_model=AssetOut)
def update_media(payload: AssetUpdateIn, asset: OwnedAsset, db: DbSession):
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(asset, field, value)
    db.commit()
    db.refresh(asset)
    return AssetOut.model_validate(asset)


@router.delete("/media/{media_id}", response_model=Message)
def delete_media(asset: OwnedAsset, db: DbSession, user: CurrentUser):
    storage = get_storage()
    key_prefix = f"{user.id}/{asset.project_id}/{asset.id}"
    freed = asset.size_bytes
    db.delete(asset)
    user.storage_used_bytes = max(0, user.storage_used_bytes - freed)
    db.commit()
    storage.delete(key_prefix)
    storage.delete(f"{user.id}/{asset.project_id}/derived/{asset.id}")
    return Message(detail="Asset deleted")


@router.get("/media/{media_id}/status", response_model=AssetOut)
def media_status(asset: OwnedAsset, db: DbSession):
    """Lightweight polling endpoint for the upload progress UI."""
    out = AssetOut.model_validate(asset)
    out.segment_count = (
        db.query(func.count(ContentSegment.id))
        .filter(ContentSegment.asset_id == asset.id).scalar() or 0
    )
    return out


@router.post("/media/{media_id}/reprocess", response_model=JobOut, status_code=202)
def reprocess(asset: OwnedAsset, db: DbSession, user: CurrentUser):
    asset.status = AssetStatus.PROCESSING
    asset.status_message = "Re-queued for analysis…"
    asset.error = ""
    asset.progress = 0
    db.commit()
    job = jobs.create_job(
        db, owner_id=user.id, project_id=asset.project_id, kind="ingest", asset_id=asset.id
    )
    jobs.submit(job.id, _ingest_handler)
    return JobOut.model_validate(job)


# --------------------------------------------------------------------------- #
# Secure file delivery
# --------------------------------------------------------------------------- #

def _resolved_file(asset: MediaAsset) -> Path:
    path = get_storage().path(asset.storage_key)
    if not path.exists():
        raise AppError(
            "The stored file is no longer available on this server", 410, "file_gone"
        )
    return path


@router.get("/media/{media_id}/file")
def stream_file(asset: OwnedAsset, request: Request):
    """Serves the original bytes with HTTP range support so media can seek.

    Access is authorised per request; files are never exposed at a public URL.
    """
    path = _resolved_file(asset)
    size = path.stat().st_size
    range_header = request.headers.get("range")

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{safe_filename(asset.original_filename)}"',
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
    }

    if not range_header:
        return FileResponse(path, media_type=asset.mime_type, headers=headers)

    try:
        units, _, span = range_header.partition("=")
        start_s, _, end_s = span.partition("-")
        if units.strip() != "bytes":
            raise ValueError
        start = int(start_s) if start_s else 0
        end = int(end_s) if end_s else size - 1
    except ValueError:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})

    end = min(end, size - 1)
    if start > end or start >= size:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})

    def iterator():
        remaining = end - start + 1
        with path.open("rb") as fh:
            fh.seek(start)
            while remaining > 0:
                data = fh.read(min(CHUNK, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers |= {
        "Content-Range": f"bytes {start}-{end}/{size}",
        "Content-Length": str(end - start + 1),
    }
    return StreamingResponse(iterator(), status_code=206, media_type=asset.mime_type, headers=headers)


@router.get("/media/{media_id}/thumbnail")
def thumbnail(asset: OwnedAsset):
    if not asset.thumbnail_key:
        raise NotFound("Thumbnail")
    path = get_storage().path(asset.thumbnail_key)
    if not path.exists():
        raise NotFound("Thumbnail")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})


# --------------------------------------------------------------------------- #
# Jobs
# --------------------------------------------------------------------------- #

@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: str, db: DbSession, user: CurrentUser):
    job = db.get(ProcessingJob, job_id)
    if job is None or job.owner_id != user.id:
        raise NotFound("Job")
    return JobOut.model_validate(job)


@router.post("/jobs/{job_id}/retry", response_model=JobOut, status_code=202)
def retry_job(job_id: str, db: DbSession, user: CurrentUser):
    job = db.get(ProcessingJob, job_id)
    if job is None or job.owner_id != user.id:
        raise NotFound("Job")
    if job.status in JobStatus.ACTIVE:
        raise AppError("That job is already running", 409, "job_active")

    job.status = JobStatus.QUEUED
    job.progress = 0
    job.error = ""
    db.commit()
    if job.asset_id:
        asset = db.get(MediaAsset, job.asset_id)
        if asset:
            asset.status = AssetStatus.PROCESSING
            asset.error = ""
            db.commit()
    jobs.submit(job.id, _ingest_handler)
    return JobOut.model_validate(job)
