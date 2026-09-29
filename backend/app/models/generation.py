from __future__ import annotations

from typing import Any

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import DraftStatus, GenerationSource


class GeneratedContent(Base):
    """One piece of AI-generated content, always traceable to its sources."""

    __tablename__ = "generated_content"

    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )

    content_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    platform: Mapped[str] = mapped_column(String(20), default="none", index=True)
    title: Mapped[str] = mapped_column(String(300), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    # Structured payload for quizzes, flashcards, calendars, carousels
    structured: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(JSON, default=None)

    # --- Generation parameters, kept so a result can be reproduced ---
    tone: Mapped[str] = mapped_column(String(40), default="professional")
    language: Mapped[str] = mapped_column(String(40), default="English")
    audience: Mapped[str] = mapped_column(String(200), default="")
    length: Mapped[str] = mapped_column(String(40), default="medium")
    brand_profile_id: Mapped[str | None] = mapped_column(
        ForeignKey("brand_profiles.id", ondelete="SET NULL")
    )
    prompt_template: Mapped[str] = mapped_column(String(80), default="")
    prompt_version: Mapped[str] = mapped_column(String(20), default="")
    model_used: Mapped[str] = mapped_column(String(80), default="")
    # "live" or "demo" - the UI badges demo output so it is never mistaken for real
    generation_source: Mapped[str] = mapped_column(String(10), default=GenerationSource.LIVE)

    # Which assets fed this generation
    source_asset_ids: Mapped[list[Any]] = mapped_column(JSON, default=list)
    variant_index: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default=DraftStatus.DRAFT, index=True)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    tags: Mapped[str] = mapped_column(Text, default="")
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    generation_ms: Mapped[int] = mapped_column(Integer, default=0)

    versions: Mapped[list["ContentVersion"]] = relationship(
        back_populates="content", cascade="all, delete-orphan", order_by="ContentVersion.version"
    )
    citations: Mapped[list["ContentCitation"]] = relationship(
        back_populates="content", cascade="all, delete-orphan"
    )


class ContentVersion(Base):
    """Every edit is kept, so nothing a user wrote is ever silently lost."""

    __tablename__ = "content_versions"

    content_id: Mapped[str] = mapped_column(
        ForeignKey("generated_content.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(300), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    structured: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(JSON, default=None)
    edited_by_user: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str] = mapped_column(String(300), default="")

    content: Mapped["GeneratedContent"] = relationship(back_populates="versions")


class ContentCitation(Base):
    """Ties a claim in generated content back to the exact source segment."""

    __tablename__ = "content_citations"

    content_id: Mapped[str] = mapped_column(
        ForeignKey("generated_content.id", ondelete="CASCADE"), index=True, nullable=False
    )
    segment_id: Mapped[str | None] = mapped_column(
        ForeignKey("content_segments.id", ondelete="SET NULL")
    )
    asset_id: Mapped[str | None] = mapped_column(
        ForeignKey("media_assets.id", ondelete="SET NULL")
    )
    quote: Mapped[str] = mapped_column(Text, default="")
    start_sec: Mapped[float | None] = mapped_column(Float)
    page_number: Mapped[int | None] = mapped_column(Integer)
    relevance: Mapped[float] = mapped_column(Float, default=0.0)

    content: Mapped["GeneratedContent"] = relationship(back_populates="citations")
