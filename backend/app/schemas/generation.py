from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.enums import ContentType, Platform, Tone
from app.schemas.common import ORMModel


class GenerateIn(BaseModel):
    project_id: str
    content_type: str = Field(description=f"One of: {', '.join(ContentType.ALL)}")
    asset_ids: list[str] = Field(default_factory=list, description="Empty means the whole project")
    platform: str = Field(default=Platform.NONE)
    tone: str = Field(default=Tone.PROFESSIONAL)
    language: str = Field(default="English", max_length=40)
    audience: str = Field(default="", max_length=200)
    length: str = Field(default="medium", description="short | medium | long")
    variations: int = Field(default=3, ge=1, le=5)
    brand_profile_id: str | None = None
    extra_instructions: str = Field(default="", max_length=1500)
    keywords: list[str] = Field(default_factory=list)


class CitationOut(ORMModel):
    """ORM-enabled so it can be validated straight off a MessageCitation row."""

    marker: int = 1
    segment_id: str | None = None
    asset_id: str | None = None
    asset_name: str = ""
    asset_title: str = ""
    modality: str = ""
    kind: str = ""
    quote: str = ""
    start_sec: float | None = None
    end_sec: float | None = None
    page_number: int | None = None
    slide_number: int | None = None
    locator_label: str = ""
    relevance: float = 0.0


class ContentOut(ORMModel):
    id: str
    project_id: str
    content_type: str
    platform: str
    title: str
    body: str
    structured: Any = None
    tone: str
    language: str
    audience: str
    length: str
    status: str
    is_favorite: bool
    tags: str
    variant_index: int
    model_used: str
    generation_source: str
    prompt_template: str
    prompt_version: str
    source_asset_ids: list[Any] = []
    tokens_used: int = 0
    generation_ms: int = 0
    created_at: datetime
    updated_at: datetime
    citations: list[CitationOut] = []
    version_count: int = 0


class GenerateOut(BaseModel):
    items: list[ContentOut]
    mode: str
    sources_note: str = ""
    sources_used: list[dict[str, Any]] = []


class ContentUpdateIn(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    body: str | None = None
    structured: Any = None
    status: str | None = None
    is_favorite: bool | None = None
    tags: str | None = Field(default=None, max_length=500)
    note: str = Field(default="", max_length=300)


class VersionOut(ORMModel):
    id: str
    version: int
    title: str
    body: str
    structured: Any = None
    edited_by_user: bool
    note: str
    created_at: datetime


class SearchIn(BaseModel):
    project_id: str
    query: str = Field(min_length=2, max_length=500)
    asset_ids: list[str] = Field(default_factory=list)
    limit: int = Field(default=12, ge=1, le=50)
    kinds: list[str] = Field(default_factory=list)


class SearchOut(BaseModel):
    results: list[CitationOut]
    mode: str
    total: int


class ChatIn(BaseModel):
    project_id: str
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = None
    asset_ids: list[str] = Field(default_factory=list)


class ChatMessageOut(ORMModel):
    id: str
    role: str
    content: str
    confidence: str = ""
    generation_source: str = "live"
    latency_ms: int = 0
    created_at: datetime
    citations: list[CitationOut] = []


class ChatOut(BaseModel):
    conversation_id: str
    message: ChatMessageOut
    retrieval_mode: str
    follow_ups: list[str] = []


class ConversationOut(ORMModel):
    id: str
    project_id: str
    title: str
    selected_asset_ids: list[Any] = []
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
