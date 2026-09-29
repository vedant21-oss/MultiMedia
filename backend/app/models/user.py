from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.project import Project


class User(Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    bio: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Storage accounting, enforced on upload
    storage_used_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    projects: Mapped[list["Project"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
    brand_profiles: Mapped[list["BrandProfile"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )


class BrandProfile(Base):
    """A reusable voice the generator adopts: tone, audience, vocabulary, rules."""

    __tablename__ = "brand_profiles"

    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    tone: Mapped[str] = mapped_column(String(40), default="professional")
    audience: Mapped[str] = mapped_column(String(200), default="")
    # Phrases and words to lean on, and to avoid
    preferred_phrases: Mapped[str] = mapped_column(Text, default="")
    banned_phrases: Mapped[str] = mapped_column(Text, default="")
    writing_rules: Mapped[str] = mapped_column(Text, default="")
    emoji_policy: Mapped[str] = mapped_column(String(20), default="sparing")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    owner: Mapped["User"] = relationship(back_populates="brand_profiles")
