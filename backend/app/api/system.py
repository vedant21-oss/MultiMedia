from __future__ import annotations

import shutil
from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import text

from app.ai import registry
from app.core.config import settings
from app.core.deps import DbSession
from app.schemas.common import HealthOut
from app.workers import jobs

router = APIRouter(tags=["system"])

VERSION = "1.0.0"


@router.get("/health", response_model=HealthOut)
async def health(db: DbSession):
    try:
        db.execute(text("SELECT 1"))
        database = "connected"
    except Exception as exc:  # noqa: BLE001
        database = f"error: {type(exc).__name__}"

    return HealthOut(
        status="ok",
        env=settings.ENV,
        database=database,
        ai_mode=registry.mode(),
        ai={
            "configured": settings.ai_configured,
            "generation_model": settings.GEMINI_MODEL,
            "embedding_model": settings.GEMINI_EMBED_MODEL,
            "stt_provider": settings.STT_PROVIDER,
            "image_provider": settings.IMAGE_PROVIDER,
        },
        ffmpeg=bool(shutil.which("ffmpeg")),
        ocr=bool(shutil.which("tesseract")),
        queue_depth=jobs.queue_depth(),
        version=VERSION,
        timestamp=datetime.now(timezone.utc),
    )


@router.get("/health/ai")
async def ai_health():
    """Live check: does the key work, and do the configured models exist?"""
    return await registry.health()


@router.get("/capabilities")
def capabilities():
    """What this deployment can actually do right now.

    The frontend reads this to badge demo-only features honestly instead of
    presenting them as working.
    """
    live = registry.is_live()
    has_ffmpeg = bool(shutil.which("ffmpeg"))
    has_ocr = bool(shutil.which("tesseract"))
    return {
        "ai_mode": registry.mode(),
        "features": {
            "text_extraction": {"available": True, "needs": None},
            "ocr": {"available": has_ocr, "needs": None if has_ocr else "tesseract binary"},
            "video_frames": {"available": has_ffmpeg, "needs": None if has_ffmpeg else "ffmpeg"},
            "scene_detection": {"available": has_ffmpeg, "needs": None if has_ffmpeg else "ffmpeg"},
            "video_clipping": {"available": has_ffmpeg, "needs": None if has_ffmpeg else "ffmpeg"},
            "subtitle_export": {"available": True, "needs": None},
            "subtitle_burn_in": {"available": has_ffmpeg, "needs": None if has_ffmpeg else "ffmpeg"},
            "transcription": {"available": live, "needs": None if live else "GEMINI_API_KEY"},
            "vision_understanding": {"available": live, "needs": None if live else "GEMINI_API_KEY"},
            "content_generation": {
                "available": True,
                "mode": "ai" if live else "extractive demo",
                "needs": None if live else "GEMINI_API_KEY for real generation",
            },
            "semantic_search": {
                "available": True,
                "mode": "semantic embeddings" if live else "lexical fallback",
                "needs": None if live else "GEMINI_API_KEY for semantic search",
            },
            "rag_chat": {
                "available": True,
                "mode": "grounded generation" if live else "extractive quotes",
                "needs": None if live else "GEMINI_API_KEY",
            },
            "image_generation": {
                "available": settings.IMAGE_PROVIDER != "none",
                "fallback": "video frame selection + text-overlay templates",
                "needs": None if settings.IMAGE_PROVIDER != "none" else "IMAGE_PROVIDER + key",
            },
            "social_publishing": {
                "available": False,
                "needs": "Platform OAuth apps. The planner schedules but never claims to publish.",
            },
        },
        "limits": {
            "max_upload_mb": settings.MAX_UPLOAD_MB,
            "user_quota_mb": settings.USER_QUOTA_MB,
            "max_files_per_upload": 10,
        },
    }
