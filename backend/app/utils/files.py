"""Filename safety, hashing and modality detection."""
from __future__ import annotations

import hashlib
import re
import unicodedata
from pathlib import Path

from app.models.enums import Modality

# Extension -> (mime, modality). The browser's Content-Type is advisory only.
EXTENSION_MAP: dict[str, tuple[str, str]] = {
    # video
    ".mp4": ("video/mp4", Modality.VIDEO),
    ".mov": ("video/quicktime", Modality.VIDEO),
    ".webm": ("video/webm", Modality.VIDEO),
    ".mkv": ("video/x-matroska", Modality.VIDEO),
    ".avi": ("video/x-msvideo", Modality.VIDEO),
    # audio
    ".mp3": ("audio/mpeg", Modality.AUDIO),
    ".wav": ("audio/wav", Modality.AUDIO),
    ".m4a": ("audio/mp4", Modality.AUDIO),
    ".aac": ("audio/aac", Modality.AUDIO),
    ".ogg": ("audio/ogg", Modality.AUDIO),
    ".flac": ("audio/flac", Modality.AUDIO),
    # image
    ".jpg": ("image/jpeg", Modality.IMAGE),
    ".jpeg": ("image/jpeg", Modality.IMAGE),
    ".png": ("image/png", Modality.IMAGE),
    ".webp": ("image/webp", Modality.IMAGE),
    ".gif": ("image/gif", Modality.IMAGE),
    ".bmp": ("image/bmp", Modality.IMAGE),
    ".heic": ("image/heic", Modality.IMAGE),
    # documents
    ".pdf": ("application/pdf", Modality.DOCUMENT),
    ".docx": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Modality.DOCUMENT,
    ),
    ".pptx": (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        Modality.PRESENTATION,
    ),
    # text
    ".txt": ("text/plain", Modality.TEXT),
    ".md": ("text/markdown", Modality.TEXT),
    ".csv": ("text/csv", Modality.TEXT),
    ".json": ("application/json", Modality.TEXT),
    # subtitles
    ".srt": ("application/x-subrip", Modality.SUBTITLE),
    ".vtt": ("text/vtt", Modality.SUBTITLE),
}

ALLOWED_EXTENSIONS = frozenset(EXTENSION_MAP)


def classify(filename: str) -> tuple[str, str, str]:
    """-> (extension, mime_type, modality). Raises ValueError if unsupported."""
    ext = Path(filename).suffix.lower()
    if ext not in EXTENSION_MAP:
        raise ValueError(
            f"Unsupported file type '{ext or filename}'. "
            f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )
    mime, modality = EXTENSION_MAP[ext]
    return ext, mime, modality


_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


def safe_filename(filename: str, max_length: int = 120) -> str:
    """Strip directory components and anything that could escape the storage root.

    Defends against path traversal ("../../etc/passwd"), NUL bytes, unicode
    look-alikes and absolute paths.
    """
    name = unicodedata.normalize("NFKD", filename).encode("ascii", "ignore").decode()
    name = name.replace("\x00", "")
    # PurePath handles both / and \ separators regardless of host OS
    name = Path(name.replace("\\", "/")).name
    name = _UNSAFE.sub("_", name).strip("._")
    if not name:
        name = "file"
    stem, dot, ext = name.rpartition(".")
    if dot:
        return f"{stem[: max_length - len(ext) - 1]}.{ext}"
    return name[:max_length]


def sha256_file(path: Path, chunk_size: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        while chunk := fh.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def human_size(num_bytes: int) -> str:
    value = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            return f"{value:.0f} {unit}" if unit == "B" else f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} GB"
