"""Single entry point for AI work. Routes to a live provider or demo mode."""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

from app.ai.base import AIError, AIResult
from app.ai.demo import demo_answer, demo_embed, demo_generate
from app.ai.gemini import gemini
from app.core.config import settings
from app.prompts.templates import PromptTemplate

log = logging.getLogger(__name__)


def is_live() -> bool:
    return settings.ai_configured


def mode() -> str:
    return "live" if is_live() else "demo"


async def run_template(
    template: PromptTemplate,
    parts: list[dict],
    *,
    demo_fallback: Any = None,
) -> AIResult:
    """Execute a prompt template, degrading to demo output on failure.

    A provider outage must never lose the user's upload, so a failed call falls
    back to demo output rather than raising — clearly tagged as demo.
    """
    if not is_live():
        if demo_fallback is None:
            raise AIError("AI is not configured and no demo fallback was supplied", 503)
        return demo_fallback() if callable(demo_fallback) else demo_fallback

    try:
        return await gemini.generate(
            parts,
            schema=template.schema,
            system_instruction=template.build_system(),
            temperature=template.temperature,
            max_output_tokens=template.max_output_tokens,
            thinking_budget=template.thinking_budget,
        )
    except AIError as err:
        if demo_fallback is None:
            raise
        log.warning("AI call for %s failed (%s); using demo fallback", template.name, err.message)
        result = demo_fallback() if callable(demo_fallback) else demo_fallback
        result.source = "demo"
        return result


async def embed_texts(
    texts: list[str], task_type: str = "SEMANTIC_SIMILARITY"
) -> tuple[list[list[float]], str, str]:
    """-> (vectors, model_name, source). Falls back to lexical vectors."""
    if not texts:
        return [], "", mode()
    if is_live():
        try:
            vectors, model = await gemini.embed(texts, task_type=task_type)
            if vectors:
                return vectors, model, "live"
        except AIError as err:
            log.warning("Embedding failed (%s); falling back to lexical vectors", err.message)
    vectors, model = demo_embed(texts)
    return vectors, model, "demo"


async def part_for_file(path: Path, mime_type: str, display_name: str) -> dict:
    return await gemini.part_for_file(path, mime_type, display_name)


async def health() -> dict[str, Any]:
    """Live verification that the key works and the configured models exist."""
    if not is_live():
        return {
            "mode": "demo",
            "reason": "GEMINI_API_KEY is not set (or is a placeholder)",
            "generation_available": False,
            "embeddings_available": True,
            "embeddings_kind": "lexical fallback",
        }
    started = time.monotonic()
    try:
        models = await gemini.list_models()
    except AIError as err:
        return {
            "mode": "degraded",
            "reason": err.message,
            "generation_available": False,
            "embeddings_available": True,
            "embeddings_kind": "lexical fallback",
        }
    return {
        "mode": "live",
        "latency_ms": int((time.monotonic() - started) * 1000),
        "generation_model": settings.GEMINI_MODEL,
        "generation_available": settings.GEMINI_MODEL in models,
        "embedding_model": settings.GEMINI_EMBED_MODEL,
        "embeddings_available": settings.GEMINI_EMBED_MODEL in models,
        "embeddings_kind": "semantic",
        "models_visible": len(models),
        "suggestions": [m for m in models if m.startswith("gemini-")][:8],
    }


__all__ = [
    "AIResult", "demo_answer", "demo_generate", "embed_texts", "health",
    "is_live", "mode", "part_for_file", "run_template",
]
