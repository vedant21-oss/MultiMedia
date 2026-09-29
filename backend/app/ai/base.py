"""Shared types for AI providers."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


class AIError(Exception):
    """Any failure talking to an AI provider."""

    def __init__(self, message: str, status: int = 502, retryable: bool = False) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.retryable = retryable


class AINotConfigured(AIError):
    def __init__(self, provider: str = "Gemini") -> None:
        super().__init__(
            f"{provider} is not configured. Add a real API key to backend/.env "
            f"and restart, or continue in demo mode.",
            status=503,
        )


@dataclass(slots=True)
class Usage:
    prompt_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0

    @classmethod
    def from_gemini(cls, meta: dict[str, Any] | None) -> "Usage":
        meta = meta or {}
        return cls(
            prompt_tokens=meta.get("promptTokenCount", 0),
            output_tokens=meta.get("candidatesTokenCount", 0),
            total_tokens=meta.get("totalTokenCount", 0),
        )


@dataclass(slots=True)
class AIResult:
    """Every AI call returns this, so demo output is never mistaken for live."""

    data: Any
    usage: Usage = field(default_factory=Usage)
    model: str = ""
    source: str = "live"  # "live" | "demo"
    latency_ms: int = 0


# --- Gemini response-schema helpers (OpenAPI subset, uppercase type names) ---

def obj(properties: dict[str, Any], required: list[str] | None = None, desc: str = "") -> dict:
    out: dict[str, Any] = {"type": "OBJECT", "properties": properties}
    if required:
        out["required"] = required
    if desc:
        out["description"] = desc
    return out


def arr(items: dict[str, Any], desc: str = "") -> dict:
    out: dict[str, Any] = {"type": "ARRAY", "items": items}
    if desc:
        out["description"] = desc
    return out


def string(desc: str = "", enum: list[str] | None = None) -> dict:
    out: dict[str, Any] = {"type": "STRING"}
    if desc:
        out["description"] = desc
    if enum:
        out["enum"] = enum
    return out


def number(desc: str = "") -> dict:
    out: dict[str, Any] = {"type": "NUMBER"}
    if desc:
        out["description"] = desc
    return out


def integer(desc: str = "") -> dict:
    out: dict[str, Any] = {"type": "INTEGER"}
    if desc:
        out["description"] = desc
    return out
