from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class ProjectIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=2000)
    context: str = Field(default="", max_length=4000)
    color: str = Field(default="violet", max_length=20)
    tags: str = Field(default="", max_length=500)


class ProjectUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    context: str | None = Field(default=None, max_length=4000)
    color: str | None = Field(default=None, max_length=20)
    tags: str | None = Field(default=None, max_length=500)


class ProjectStats(BaseModel):
    assets: int = 0
    ready: int = 0
    processing: int = 0
    failed: int = 0
    segments: int = 0
    generated: int = 0
    duration_sec: float = 0.0
    by_modality: dict[str, int] = {}


class ProjectOut(ORMModel):
    id: str
    name: str
    description: str
    context: str
    color: str
    tags: str
    created_at: datetime
    updated_at: datetime
    stats: ProjectStats = ProjectStats()
