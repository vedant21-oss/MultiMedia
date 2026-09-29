"""Storage abstraction so local disk can be swapped for S3/GCS in production."""
from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path


class StorageBackend(ABC):
    @abstractmethod
    def save(self, key: str, data: bytes) -> str: ...

    @abstractmethod
    def save_stream(self, key: str, chunks) -> tuple[str, int]: ...

    @abstractmethod
    def path(self, key: str) -> Path:
        """Local filesystem path. Remote backends materialise to a temp file."""

    @abstractmethod
    def delete(self, key: str) -> None: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...

    @abstractmethod
    def size(self, key: str) -> int: ...
