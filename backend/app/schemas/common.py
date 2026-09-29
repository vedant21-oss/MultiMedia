from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class Message(BaseModel):
    detail: str
    code: str = "ok"


class HealthOut(BaseModel):
    status: str
    env: str
    database: str
    ai_mode: str
    ai: dict[str, Any]
    ffmpeg: bool
    ocr: bool
    queue_depth: int
    version: str
    timestamp: datetime
