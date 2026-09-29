"""Environment-driven configuration. Nothing secret is ever hard-coded."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    # --- App ---
    APP_NAME: str = "CreatorAI"
    ENV: str = "development"
    DEBUG: bool = True
    API_PREFIX: str = "/api"
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Database ---
    # Postgres is required for pgvector similarity search. SQLite is accepted for
    # a quick start; the app then falls back to in-Python cosine similarity.
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/creatorai"

    # --- Auth ---
    JWT_SECRET: str = "dev_only_insecure_secret_change_me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    # --- AI providers (backend only - never sent to the browser) ---
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.8-flash"
    GEMINI_EMBED_MODEL: str = "gemini-embedding-001"
    EMBED_DIMENSIONS: int = 768

    # Speech-to-text: "gemini" (default, no extra deps) or "openai" (Whisper API)
    STT_PROVIDER: str = "gemini"
    OPENAI_API_KEY: str = ""
    OPENAI_STT_MODEL: str = "whisper-1"

    # Image generation: "none" | "gemini" | "openai"
    IMAGE_PROVIDER: str = "none"
    GEMINI_IMAGE_MODEL: str = "gemini-3.1-flash-image"
    OPENAI_IMAGE_MODEL: str = "gpt-image-1"

    # --- Storage ---
    STORAGE_BACKEND: str = "local"
    STORAGE_DIR: Path = BASE_DIR / "storage_data"
    MAX_UPLOAD_MB: int = 500
    USER_QUOTA_MB: int = 2048

    # --- Processing ---
    VIDEO_FRAME_SAMPLES: int = 12
    MAX_TRANSCRIPT_CHARS: int = 200_000
    JOB_CONCURRENCY: int = 2

    @field_validator("GEMINI_API_KEY", mode="after")
    @classmethod
    def _placeholder_key_falls_back_to_dotenv(cls, v: str) -> str:
        # A shell profile exporting GEMINI_API_KEY=YOUR_API_KEY would otherwise
        # hide the real key in backend/.env. Only a non-empty placeholder falls
        # back; an explicit empty value (as the tests set) still means demo mode.
        if not v or cls._is_real_key(v):
            return v
        from dotenv import dotenv_values

        return (dotenv_values(BASE_DIR / ".env").get("GEMINI_API_KEY") or v).strip()

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def _normalise_db_url(cls, v: str) -> str:
        """Supabase, Heroku and Render hand out `postgres://` URLs, which
        SQLAlchemy 2 refuses. Rewrite them to the explicit psycopg2 dialect."""
        v = (v or "").strip()
        if v.startswith("postgres://"):
            v = "postgresql+psycopg2://" + v[len("postgres://"):]
        elif v.startswith("postgresql://"):
            v = "postgresql+psycopg2://" + v[len("postgresql://"):]
        return v

    @field_validator("STORAGE_DIR", mode="before")
    @classmethod
    def _expand(cls, v):
        return Path(v).expanduser().resolve() if v else v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_postgres(self) -> bool:
        return self.DATABASE_URL.startswith("postgresql")

    @staticmethod
    def _is_real_key(value: str) -> bool:
        """Reject placeholders.

        A stray `export GEMINI_API_KEY=YOUR_API_KEY` in a shell profile takes
        priority over the .env file and would otherwise put the app in live mode
        with a key that fails on every call. Demo mode is the safer default.
        """
        v = (value or "").strip()
        if len(v) < 20:
            return False
        upper = v.upper()
        placeholders = ("PASTE", "YOUR_", "YOUR-", "XXX", "CHANGE", "REPLACE", "<", ">", "EXAMPLE", "SECRET_HERE")
        return not any(p in upper for p in placeholders)

    @property
    def ai_configured(self) -> bool:
        """False puts the whole app into clearly-labelled demo mode."""
        return self._is_real_key(self.GEMINI_API_KEY)

    @property
    def openai_configured(self) -> bool:
        return self._is_real_key(self.OPENAI_API_KEY)

    @property
    def gemini_key(self) -> str:
        """The key to actually send, or empty when it is a placeholder."""
        return self.GEMINI_API_KEY.strip() if self.ai_configured else ""

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_MB * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    return s


settings = get_settings()
