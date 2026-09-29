"""Create the schema at startup, for hosts where `alembic upgrade` can't run
as a separate step (Vercel). Idempotent: existing tables are left alone."""
from __future__ import annotations

import logging

from sqlalchemy import text

from app.core.config import settings
from app.db.base import Base
from app.db.session import engine

log = logging.getLogger(__name__)


def init_db() -> None:
    import app.models  # noqa: F401 - registers every table on Base.metadata

    if settings.is_postgres:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(bind=engine)
    log.info("Database schema ready")
