from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api import auth, chat, generate, media, projects, studio, system, video
from app.core.config import settings
from app.core.errors import register_error_handlers
from app.workers import jobs

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(levelname)-7s %(name)s: %(message)s",
)
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("creatorai")


@asynccontextmanager
async def lifespan(_: FastAPI):
    import asyncio

    jobs.bind_loop(asyncio.get_running_loop())
    log.info("CreatorAI starting — env=%s, AI=%s", settings.ENV, "live" if settings.ai_configured else "DEMO MODE")
    if not settings.ai_configured:
        log.warning(
            "No valid GEMINI_API_KEY. Running in demo mode: extraction, OCR, FFmpeg "
            "and search all work; generation is extractive and badged 'Demo'."
        )
    yield
    await jobs.shutdown()
    log.info("CreatorAI stopped")


app = FastAPI(
    title="CreatorAI API",
    description=(
        "Multimodal content studio. Upload video, audio, images and documents; "
        "the pipeline normalises them into searchable, citable segments and "
        "generates platform-ready content grounded in those sources."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)

register_error_handlers(app)

for router in (
    system.router, auth.router, projects.router, media.router,
    generate.router, chat.router, video.router, studio.router,
):
    app.include_router(router, prefix=settings.API_PREFIX)


@app.get("/", include_in_schema=False)
def root():
    return {
        "service": "CreatorAI API",
        "version": app.version,
        "docs": "/docs",
        "health": f"{settings.API_PREFIX}/health",
    }
