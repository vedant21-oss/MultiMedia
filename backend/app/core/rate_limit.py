"""Small in-process rate limiter.

Enough for a single-node deployment and avoids adding Redis. A multi-node
deployment should swap `_Bucket` for a shared store.

Note: the dependency is a closure, not a callable class instance. FastAPI
resolves a dependency's type hints using its `__globals__`, which instances do
not have — with `from __future__ import annotations` active, a class-based
dependency silently degrades into a required `request` *query parameter*.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import Request, status

from app.core.errors import AppError


class _Bucket:
    def __init__(self) -> None:
        self.hits: dict[str, deque[float]] = defaultdict(deque)


def rate_limit(times: int, seconds: int, scope: str) -> Callable[..., Coroutine[Any, Any, None]]:
    bucket = _Bucket()

    def key_for(request: Request) -> str:
        auth = request.headers.get("authorization", "")
        ident = auth[-24:] if auth else (request.client.host if request.client else "anonymous")
        return f"{scope}:{ident}"

    async def dependency(request: Request) -> None:
        from app.core.config import settings

        if settings.ENV == "test":
            return
        now = time.monotonic()
        hits = bucket.hits[key_for(request)]
        cutoff = now - seconds
        while hits and hits[0] < cutoff:
            hits.popleft()
        if len(hits) >= times:
            retry_after = int(seconds - (now - hits[0])) + 1
            raise AppError(
                f"Too many requests. Try again in {retry_after}s.",
                status.HTTP_429_TOO_MANY_REQUESTS,
                "rate_limited",
            )
        hits.append(now)

    return dependency


auth_limiter = rate_limit(times=20, seconds=300, scope="auth")
upload_limiter = rate_limit(times=60, seconds=300, scope="upload")
ai_limiter = rate_limit(times=60, seconds=60, scope="ai")
