"""Consistent error envelope: every failure returns {"detail": "...", "code": "..."}"""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.ai.base import AIError, AINotConfigured
from app.core.config import settings
from app.processing.probe import MediaToolError

log = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(self, detail: str, status_code: int = 400, code: str = "error") -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code
        self.code = code


class NotFound(AppError):
    def __init__(self, what: str = "Resource") -> None:
        super().__init__(f"{what} not found", status.HTTP_404_NOT_FOUND, "not_found")


class Forbidden(AppError):
    def __init__(self, detail: str = "You do not have access to this resource") -> None:
        super().__init__(detail, status.HTTP_403_FORBIDDEN, "forbidden")


def _payload(detail: str, code: str, **extra) -> dict:
    return {"detail": detail, "code": code, **extra}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return JSONResponse(status_code=exc.status_code, content=_payload(exc.detail, exc.code))

    @app.exception_handler(AINotConfigured)
    async def _ai_missing(_: Request, exc: AINotConfigured):
        return JSONResponse(
            status_code=503,
            content=_payload(exc.message, "ai_not_configured", demo_mode_available=True),
        )

    @app.exception_handler(AIError)
    async def _ai_error(_: Request, exc: AIError):
        code = "ai_rate_limited" if exc.status == 429 else "ai_error"
        return JSONResponse(
            status_code=exc.status if 400 <= exc.status < 600 else 502,
            content=_payload(exc.message, code, retryable=exc.retryable),
        )

    @app.exception_handler(MediaToolError)
    async def _media_error(_: Request, exc: MediaToolError):
        return JSONResponse(status_code=422, content=_payload(str(exc), "media_error"))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        fields: dict[str, str] = {}
        for err in exc.errors():
            path = ".".join(str(p) for p in err["loc"] if p not in ("body", "query"))
            fields.setdefault(path or "_", err["msg"])
        return JSONResponse(
            status_code=422, content=_payload("Validation failed", "validation_error", fields=fields)
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code, content=_payload(str(exc.detail), f"http_{exc.status_code}")
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        detail = "Internal server error" if not settings.DEBUG else f"{type(exc).__name__}: {exc}"
        return JSONResponse(status_code=500, content=_payload(detail, "internal_error"))
