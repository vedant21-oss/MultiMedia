from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import DraftStatus


class CalendarEntry(Base):
    __tablename__ = "calendar_entries"

    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    content_id: Mapped[str | None] = mapped_column(
        ForeignKey("generated_content.id", ondelete="SET NULL")
    )

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="")
    platform: Mapped[str] = mapped_column(String(20), default="none", index=True)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(20), default=DraftStatus.DRAFT, index=True)
    campaign: Mapped[str] = mapped_column(String(160), default="")
    # Set only when a real platform integration confirms a publish
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    publish_result: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class SocialConnection(Base):
    """Placeholder for a platform OAuth link.

    Tokens are only ever written by a completed OAuth flow. Until a provider is
    actually connected, `is_connected` stays False and the planner refuses to
    claim anything was published.
    """

    __tablename__ = "social_connections"

    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    platform: Mapped[str] = mapped_column(String(20), nullable=False)
    is_connected: Mapped[bool] = mapped_column(Boolean, default=False)
    account_name: Mapped[str] = mapped_column(String(160), default="")
    scopes: Mapped[str] = mapped_column(Text, default="")
    connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Notification(Base):
    __tablename__ = "notifications"

    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, default="")
    level: Mapped[str] = mapped_column(String(20), default="info")
    link: Mapped[str] = mapped_column(String(400), default="")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    owner_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(60), default="")
    entity_id: Mapped[str] = mapped_column(String(64), default="")
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    ip_address: Mapped[str] = mapped_column(String(64), default="")
