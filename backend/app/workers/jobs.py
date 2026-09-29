"""In-process async job queue.

Media work is slow (a video can take minutes) and the free Gemini tier is rate
limited, so uploads return immediately and processing runs here with bounded
concurrency. Progress is written to the database, which is what the UI polls.

This deliberately avoids Celery/Redis: one fewer service to run, and the job
table is the source of truth either way. Swapping in a distributed queue later
means replacing `submit` and keeping the same ProcessingJob contract.
"""
from __future__ import annotations

import asyncio
import logging
import traceback
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.enums import AssetStatus, JobStatus
from app.models.job import ProcessingJob
from app.models.media import MediaAsset

log = logging.getLogger(__name__)

JobHandler = Callable[[ProcessingJob], Awaitable[None]]

_semaphore: asyncio.Semaphore | None = None
_tasks: set[asyncio.Task] = set()
_loop: asyncio.AbstractEventLoop | None = None
MAX_ATTEMPTS = 2


def bind_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Remember the main event loop at startup.

    Sync FastAPI endpoints execute in a threadpool with no running loop, so
    `asyncio.create_task` raises there. Those callers are routed back onto this
    loop instead.
    """
    global _loop
    _loop = loop


def _sem() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(settings.JOB_CONCURRENCY)
    return _semaphore


def queue_depth() -> int:
    return len([t for t in _tasks if not t.done()])


def submit(job_id: str, handler: JobHandler) -> None:
    """Schedule a job. Returns immediately; the caller must already have committed.

    Safe to call from both async endpoints and sync (threadpool) endpoints.
    """
    def schedule() -> None:
        task = asyncio.ensure_future(_run(job_id, handler))
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        if _loop is None or _loop.is_closed():
            raise RuntimeError(
                "No event loop is available to run background jobs. "
                "This usually means the app was not started through its lifespan."
            ) from None
        _loop.call_soon_threadsafe(schedule)
    else:
        schedule()


async def _run(job_id: str, handler: JobHandler) -> None:
    async with _sem():
        db = SessionLocal()
        try:
            job = db.get(ProcessingJob, job_id)
            if job is None or job.status == JobStatus.CANCELLED:
                return

            job.status = JobStatus.RUNNING
            job.attempts += 1
            job.started_at = datetime.now(timezone.utc)
            job.error = ""
            db.commit()

            try:
                await handler(job)
                job = db.get(ProcessingJob, job_id)
                if job and job.status != JobStatus.CANCELLED:
                    job.status = JobStatus.SUCCEEDED
                    job.progress = 100
                    job.step = "Done"
                    job.finished_at = datetime.now(timezone.utc)
                    db.commit()
            except Exception as exc:  # noqa: BLE001 - a failed job must never kill the worker
                log.error("Job %s failed: %s\n%s", job_id, exc, traceback.format_exc())
                db.rollback()
                job = db.get(ProcessingJob, job_id)
                if job:
                    job.status = JobStatus.FAILED
                    job.error = f"{type(exc).__name__}: {exc}"[:1000]
                    job.finished_at = datetime.now(timezone.utc)
                    db.commit()
                    if job.asset_id:
                        asset = db.get(MediaAsset, job.asset_id)
                        if asset:
                            asset.status = AssetStatus.FAILED
                            asset.status_message = "Processing failed"
                            asset.error = job.error
                            db.commit()
        finally:
            db.close()


async def shutdown(timeout: float = 5.0) -> None:
    """Give running jobs a moment to finish on server shutdown."""
    pending = [t for t in _tasks if not t.done()]
    if not pending:
        return
    log.info("Waiting for %d job(s) to finish…", len(pending))
    done, still_running = await asyncio.wait(pending, timeout=timeout)
    for task in still_running:
        task.cancel()


def create_job(db, *, owner_id: str, project_id: str, kind: str,
               asset_id: str | None = None, params: dict | None = None) -> ProcessingJob:
    job = ProcessingJob(
        owner_id=owner_id, project_id=project_id, asset_id=asset_id,
        kind=kind, status=JobStatus.QUEUED, params=params or {},
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job
