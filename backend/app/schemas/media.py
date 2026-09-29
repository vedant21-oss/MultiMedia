from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class SegmentOut(ORMModel):
    id: str
    asset_id: str
    kind: str
    ordinal: int
    text: str
    start_sec: float | None = None
    end_sec: float | None = None
    page_number: int | None = None
    slide_number: int | None = None
    speaker: str = ""
    frame_key: str = ""
    confidence: float = 1.0


class AssetOut(ORMModel):
    id: str
    project_id: str
    original_filename: str
    mime_type: str
    modality: str
    size_bytes: int
    status: str
    status_message: str = ""
    error: str = ""
    progress: int = 0
    duration_sec: float | None = None
    width: int | None = None
    height: int | None = None
    page_count: int | None = None
    title: str = ""
    summary: str = ""
    topics: list[Any] = []
    keywords: list[Any] = []
    language: str = ""
    thumbnail_key: str = ""
    analysis_source: str = ""
    processing_ms: int = 0
    is_favorite: bool = False
    tags: str = ""
    created_at: datetime
    extra: dict[str, Any] = {}
    segment_count: int = 0


class AssetDetailOut(AssetOut):
    full_text: str = ""
    segments: list[SegmentOut] = []


class AssetUpdateIn(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    tags: str | None = Field(default=None, max_length=500)
    is_favorite: bool | None = None
    folder_id: str | None = None


class UploadResultOut(BaseModel):
    assets: list[AssetOut]
    job_ids: list[str]
    skipped: list[dict[str, str]] = []
    queue_depth: int = 0


class JobOut(ORMModel):
    id: str
    asset_id: str | None = None
    kind: str
    status: str
    progress: int
    step: str = ""
    error: str = ""
    attempts: int = 0
    result: dict[str, Any] = {}
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
