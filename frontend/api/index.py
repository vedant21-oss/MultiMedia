"""Vercel entry point when the project's Root Directory is `frontend`.

The build step copies ../backend/app into api/_backend (Vercel's "include
files outside the root directory" setting makes ../backend visible there),
then this function serves the FastAPI backend under /api on the same domain.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "_backend"))

# Serverless defaults. Anything set in Vercel's Environment Variables wins.
os.environ.setdefault("STORAGE_DIR", "/tmp/creatorai-storage")  # only /tmp is writable
# Works before a database is attached, but /tmp is per-instance and can reset.
# Connect Neon/Supabase (sets DATABASE_URL) for data that persists.
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/creatorai.db")
os.environ.setdefault("RUN_JOBS_INLINE", "true")   # no background work after responding
os.environ.setdefault("AUTO_CREATE_TABLES", "true")
os.environ.setdefault("ENV", "production")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("MAX_UPLOAD_MB", "4")        # Vercel caps request bodies at 4.5 MB

from app.core.config import settings  # noqa: E402
from app.db.init import init_db  # noqa: E402
from app.main import app  # noqa: E402,F401  - Vercel serves this ASGI app

if settings.AUTO_CREATE_TABLES:
    init_db()
