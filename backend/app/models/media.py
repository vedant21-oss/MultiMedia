from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    JSON, Boolean, Float, ForeignKey, Index, Integer, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AssetStatus
from app.models.types import EmbeddingColumn

if TYPE_CHECKING:
    from app.models.project import Project


class MediaAsset(Base):
    """One uploaded file, plus everything the pipeline learned about it."""

    __tablename__ = "media_assets"

    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    folder_id: Mapped[str | None] = mapped_column(ForeignKey("folders.id", ondelete="SET NULL"))

    # --- File identity ---
    original_filename: Mapped[str] = mapped_column(String(400), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    modality: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    # SHA-256 of the bytes, used to detect duplicate uploads in a project
    checksum: Mapped[str] = mapped_column(String(64), index=True, default="")

    # --- Pipeline state ---
    status: Mapped[str] = mapped_column(String(20), default=AssetStatus.UPLOADED, index=True)
    status_message: Mapped[str] = mapped_column(String(300), default="")
    error: Mapped[str] = mapped_column(Text, default="")
    progress: Mapped[int] = mapped_column(Integer, default=0)

    # --- Media metadata (probed with ffprobe / Pillow / PyMuPDF) ---
    duration_sec: Mapped[float | None] = mapped_column(Float)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    page_count: Mapped[int | None] = mapped_column(Integer)
    extra: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    # --- Understanding output ---
    title: Mapped[str] = mapped_column(String(300), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    full_text: Mapped[str] = mapped_column(Text, default="")
    topics: Mapped[list[Any]] = mapped_column(JSON, default=list)
    keywords: Mapped[list[Any]] = mapped_column(JSON, default=list)
    language: Mapped[str] = mapped_column(String(20), default="")
    thumbnail_key: Mapped[str] = mapped_column(String(500), default="")
    # Whether the understanding came from a real provider or demo mode
    analysis_source: Mapped[str] = mapped_column(String(10), default="")
    processing_ms: Mapped[int] = mapped_column(Integer, default=0)

    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    tags: Mapped[str] = mapped_column(Text, default="")

    project: Mapped["Project"] = relationship(back_populates="assets")
    segments: Mapped[list["ContentSegment"]] = relationship(
        back_populates="asset", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_media_project_status", "project_id", "status"),)


class ContentSegment(Base):
    """The atom of retrieval and provenance.

    Every modality is normalised into these: a transcript window with
    timestamps, a PDF page, a slide, a video scene with its frame, an OCR
    block. This is what gets embedded, retrieved, and cited.
    """

    __tablename__ = "content_segments"

    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    asset_id: Mapped[str] = mapped_column(
        ForeignKey("media_assets.id", ondelete="CASCADE"), index=True, nullable=False
    )

    kind: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    ordinal: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(Text, nullable=False)

    # --- Provenance. Exactly one family of these is set per segment kind. ---
    start_sec: Mapped[float | None] = mapped_column(Float)
    end_sec: Mapped[float | None] = mapped_column(Float)
    page_number: Mapped[int | None] = mapped_column(Integer)
    slide_number: Mapped[int | None] = mapped_column(Integer)
    speaker: Mapped[str] = mapped_column(String(80), default="")
    frame_key: Mapped[str] = mapped_column(String(500), default="")

    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    token_estimate: Mapped[int] = mapped_column(Integer, default=0)
    extra: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    embedding = mapped_column(EmbeddingColumn, nullable=True)
    embedding_model: Mapped[str] = mapped_column(String(80), default="")

    asset: Mapped["MediaAsset"] = relationship(back_populates="segments")

    __table_args__ = (
        Index("ix_segment_project_kind", "project_id", "kind"),
        Index("ix_segment_asset_ordinal", "asset_id", "ordinal"),
    )

    @property
    def locator(self) -> dict[str, Any]:
        """Human-addressable position inside the original source."""
        out: dict[str, Any] = {}
        if self.start_sec is not None:
            out["start_sec"] = self.start_sec
            out["end_sec"] = self.end_sec
        if self.page_number is not None:
            out["page"] = self.page_number
        if self.slide_number is not None:
            out["slide"] = self.slide_number
        if self.speaker:
            out["speaker"] = self.speaker
        return out
