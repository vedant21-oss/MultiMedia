"""Vercel entry point: serves the FastAPI backend under /api on the same
domain as the frontend, so the browser never needs a separate API URL."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

# Serverless defaults. Anything set in Vercel's Environment Variables wins.
os.environ.setdefault("STORAGE_DIR", "/tmp/creatorai-storage")  # only /tmp is writable
# Vercel's Storage integrations (Neon, Supabase) name the connection string
# differently depending on the prefix chosen when connecting; accept them all.
for _name in ("DATABASE_URL", "POSTGRES_URL", "STORAGE_DATABASE_URL", "STORAGE_URL",
              "NEON_DATABASE_URL", "SUPABASE_DB_URL", "DATABASE_URL_UNPOOLED"):
    if os.environ.get(_name):
        os.environ["DATABASE_URL"] = os.environ[_name]
        break
else:
    # No database attached yet: works, but /tmp is per-instance, so sessions
    # break across Vercel instances. Attach Neon under Storage to fix that.
    os.environ["DATABASE_URL"] = "sqlite:////tmp/creatorai.db"
os.environ.setdefault("RUN_JOBS_INLINE", "true")   # no background work after responding
os.environ.setdefault("AUTO_CREATE_TABLES", "true")
os.environ.setdefault("ENV", "production")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("MAX_UPLOAD_MB", "4")        # Vercel caps request bodies at 4.5 MB

from app.core.config import settings  # noqa: E402
from app.db.init import init_db  # noqa: E402
from app.main import app  # noqa: E402,F401  - Vercel serves this ASGI app

if settings.AUTO_CREATE_TABLES:
    try:
        init_db()
    except Exception as exc:  # noqa: BLE001 - a racing cold start may create tables first
        import logging

        logging.getLogger("creatorai").warning("init_db skipped: %s", exc)
