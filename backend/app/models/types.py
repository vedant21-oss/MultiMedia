"""Embedding column type, chosen from the configured database."""
from __future__ import annotations

from sqlalchemy import JSON

from app.core.config import settings

if settings.is_postgres:  # pragma: no cover - depends on deployment
    from pgvector.sqlalchemy import Vector

    EmbeddingColumn = Vector(settings.EMBED_DIMENSIONS)
    HAS_NATIVE_VECTOR = True
else:
    # SQLite fallback: store the raw list and do cosine similarity in Python.
    EmbeddingColumn = JSON
    HAS_NATIVE_VECTOR = False
