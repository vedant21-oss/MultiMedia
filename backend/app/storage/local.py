from __future__ import annotations

import shutil
from collections.abc import Iterable
from pathlib import Path

from app.core.config import settings
from app.storage.base import StorageBackend


class LocalStorage(StorageBackend):
    """Files live under STORAGE_DIR/<user_id>/<project_id>/<filename>.

    Every key is resolved and checked against the root, so a crafted key can
    never write or read outside the storage directory.
    """

    def __init__(self, root: Path | None = None) -> None:
        self.root = (root or settings.STORAGE_DIR).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str) -> Path:
        candidate = (self.root / key.lstrip("/")).resolve()
        if not candidate.is_relative_to(self.root):
            raise ValueError(f"Storage key escapes the storage root: {key!r}")
        return candidate

    def save(self, key: str, data: bytes) -> str:
        target = self._resolve(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return key

    def save_stream(self, key: str, chunks: Iterable[bytes]) -> tuple[str, int]:
        target = self._resolve(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        total = 0
        with target.open("wb") as fh:
            for chunk in chunks:
                total += len(chunk)
                fh.write(chunk)
        return key, total

    def path(self, key: str) -> Path:
        return self._resolve(key)

    def delete(self, key: str) -> None:
        target = self._resolve(key)
        if target.is_dir():
            shutil.rmtree(target, ignore_errors=True)
        elif target.exists():
            target.unlink()

    def exists(self, key: str) -> bool:
        try:
            return self._resolve(key).exists()
        except ValueError:
            return False

    def size(self, key: str) -> int:
        target = self._resolve(key)
        return target.stat().st_size if target.exists() else 0


_backend: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _backend
    if _backend is None:
        _backend = LocalStorage()
    return _backend
