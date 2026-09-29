"""Gemini REST client.

Written directly against the REST API rather than an SDK so that retry,
timeout, file upload and JSON-recovery behaviour are all explicit and testable.
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
import re
import time
from pathlib import Path
from typing import Any

import httpx

from app.ai.base import AIError, AINotConfigured, AIResult, Usage
from app.core.config import settings

log = logging.getLogger(__name__)

API_ROOT = "https://generativelanguage.googleapis.com"
API_VERSION = "v1beta"

RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}
# Inline base64 is cheaper for small files; bigger ones go through the Files API.
INLINE_LIMIT_BYTES = 4 * 1024 * 1024


def _require_key() -> str:
    if not settings.ai_configured:
        raise AINotConfigured("Gemini")
    return settings.gemini_key


def _supports_thinking(model: str) -> bool:
    """thinkingConfig exists on 2.5-era models and newer; older ones reject it."""
    return bool(re.search(r"gemini-(2\.5|3)", model))


class GeminiClient:
    def __init__(self, timeout: float = 300.0) -> None:
        self._timeout = timeout

    # ------------------------------------------------------------------ #
    # transport
    # ------------------------------------------------------------------ #

    async def _request(
        self,
        path: str,
        *,
        method: str = "POST",
        json_body: dict | None = None,
        content: bytes | None = None,
        headers: dict[str, str] | None = None,
        absolute: bool = False,
    ) -> httpx.Response:
        key = _require_key()
        url = path if absolute else f"{API_ROOT}/{API_VERSION}/{path}"
        sep = "&" if "?" in url else "?"
        url = url if "key=" in url else f"{url}{sep}key={key}"

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.request(
                method, url, json=json_body, content=content, headers=headers
            )

        if resp.status_code >= 400:
            message = resp.text
            try:
                message = resp.json().get("error", {}).get("message", resp.text)
            except (ValueError, AttributeError):
                pass
            raise AIError(
                f"Gemini API {resp.status_code}: {message}",
                status=resp.status_code,
                retryable=resp.status_code in RETRYABLE_STATUS,
            )
        return resp

    async def _with_retry(self, fn, attempts: int = 4, base_delay: float = 1.2):
        last: Exception | None = None
        for i in range(attempts):
            try:
                return await fn()
            except AIError as err:
                last = err
                if not err.retryable or i == attempts - 1:
                    raise
                delay = base_delay * (2**i) + random.uniform(0, 0.4)
                log.warning("Gemini %s, retrying in %.1fs (%d/%d)", err.status, delay, i + 1, attempts)
                await asyncio.sleep(delay)
        raise last  # pragma: no cover

    # ------------------------------------------------------------------ #
    # files
    # ------------------------------------------------------------------ #

    async def upload_file(self, path: Path, mime_type: str, display_name: str) -> str:
        """Resumable upload; returns a file URI usable in generateContent."""
        key = _require_key()
        size = path.stat().st_size

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            start = await client.post(
                f"{API_ROOT}/upload/{API_VERSION}/files?key={key}",
                headers={
                    "X-Goog-Upload-Protocol": "resumable",
                    "X-Goog-Upload-Command": "start",
                    "X-Goog-Upload-Header-Content-Length": str(size),
                    "X-Goog-Upload-Header-Content-Type": mime_type,
                    "Content-Type": "application/json",
                },
                json={"file": {"display_name": display_name}},
            )
            if start.status_code >= 400:
                raise AIError(f"Files API start failed: {start.text}", start.status_code)

            upload_url = start.headers.get("x-goog-upload-url")
            if not upload_url:
                raise AIError("Files API did not return an upload URL", 502)

            done = await client.post(
                upload_url,
                headers={
                    "Content-Length": str(size),
                    "X-Goog-Upload-Offset": "0",
                    "X-Goog-Upload-Command": "upload, finalize",
                },
                content=path.read_bytes(),
            )
            if done.status_code >= 400:
                raise AIError(f"Files API upload failed: {done.text}", done.status_code)

        file_obj = done.json().get("file", {})
        return await self._wait_active(file_obj)

    async def _wait_active(self, file_obj: dict, timeout_s: float = 300.0) -> str:
        """Video and audio need server-side processing before they can be referenced."""
        name = file_obj.get("name", "")
        state = file_obj.get("state")
        deadline = time.monotonic() + timeout_s

        while state == "PROCESSING" and time.monotonic() < deadline:
            await asyncio.sleep(2.5)
            resp = await self._request(f"files/{name.removeprefix('files/')}", method="GET")
            file_obj = resp.json()
            state = file_obj.get("state")

        if state != "ACTIVE":
            raise AIError(f"Uploaded file is not usable (state: {state})", 422)
        return file_obj["uri"]

    async def part_for_file(self, path: Path, mime_type: str, display_name: str) -> dict:
        """Choose inline base64 or a Files API reference based on size."""
        if path.stat().st_size <= INLINE_LIMIT_BYTES:
            import base64

            return {
                "inlineData": {
                    "mimeType": mime_type,
                    "data": base64.b64encode(path.read_bytes()).decode("ascii"),
                }
            }
        uri = await self.upload_file(path, mime_type, display_name)
        return {"fileData": {"fileUri": uri, "mimeType": mime_type}}

    # ------------------------------------------------------------------ #
    # generation
    # ------------------------------------------------------------------ #

    async def generate(
        self,
        parts: list[dict],
        *,
        schema: dict | None = None,
        system_instruction: str | None = None,
        temperature: float = 0.3,
        max_output_tokens: int = 8192,
        thinking_budget: int | None = 0,
        model: str | None = None,
    ) -> AIResult:
        model = model or settings.GEMINI_MODEL
        started = time.monotonic()

        generation_config: dict[str, Any] = {
            "temperature": temperature,
            "maxOutputTokens": max_output_tokens,
        }
        if schema is not None:
            generation_config["responseMimeType"] = "application/json"
            generation_config["responseSchema"] = schema
        # Thinking tokens come out of the same output budget; unbounded thinking
        # can consume it entirely and return an empty candidate.
        if thinking_budget is not None and _supports_thinking(model):
            generation_config["thinkingConfig"] = {"thinkingBudget": thinking_budget}

        body: dict[str, Any] = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": generation_config,
            "safetySettings": [
                {"category": c, "threshold": "BLOCK_ONLY_HIGH"}
                for c in (
                    "HARM_CATEGORY_HARASSMENT",
                    "HARM_CATEGORY_HATE_SPEECH",
                    "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    "HARM_CATEGORY_DANGEROUS_CONTENT",
                )
            ],
        }
        if system_instruction:
            body["systemInstruction"] = {"parts": [{"text": system_instruction}]}

        resp = await self._with_retry(
            lambda: self._request(f"models/{model}:generateContent", json_body=body)
        )
        payload = resp.json()

        candidates = payload.get("candidates") or []
        if not candidates:
            reason = (payload.get("promptFeedback") or {}).get("blockReason")
            raise AIError(
                f"Request was blocked ({reason})" if reason else "Model returned no candidates",
                422,
            )

        candidate = candidates[0]
        text = "".join(
            p.get("text", "") for p in (candidate.get("content") or {}).get("parts", [])
        ).strip()

        if not text:
            finish = candidate.get("finishReason")
            raise AIError(
                "The model hit its output limit before producing anything. "
                "Try a shorter source or a smaller requested length."
                if finish == "MAX_TOKENS"
                else f"Model returned empty output (finishReason: {finish})",
                422,
            )

        data: Any = parse_lenient_json(text) if schema is not None else text
        return AIResult(
            data=data,
            usage=Usage.from_gemini(payload.get("usageMetadata")),
            model=model,
            source="live",
            latency_ms=int((time.monotonic() - started) * 1000),
        )

    # ------------------------------------------------------------------ #
    # embeddings
    # ------------------------------------------------------------------ #

    _embed_override: str | None = None

    async def embed(
        self, texts: list[str], task_type: str = "SEMANTIC_SIMILARITY"
    ) -> tuple[list[list[float]], str]:
        """L2-normalised vectors, so cosine similarity is a plain dot product."""
        if not texts:
            return [], self._active_embed_model()

        async def run(model: str) -> list[list[float]]:
            requests = []
            for text in texts:
                req: dict[str, Any] = {
                    "model": f"models/{model}",
                    "content": {"parts": [{"text": text[:8000]}]},
                    "taskType": task_type,
                }
                if model.startswith("gemini-embedding"):
                    req["outputDimensionality"] = settings.EMBED_DIMENSIONS
                requests.append(req)

            resp = await self._with_retry(
                lambda: self._request(
                    f"models/{model}:batchEmbedContents", json_body={"requests": requests}
                )
            )
            return [_normalize(e.get("values", [])) for e in resp.json().get("embeddings", [])]

        model = self._active_embed_model()
        try:
            return await run(model), model
        except AIError as err:
            # Older keys may not expose the newest embedding model.
            if err.status in (400, 404) and model != "text-embedding-004":
                GeminiClient._embed_override = "text-embedding-004"
                fallback = GeminiClient._embed_override
                log.warning("Embedding model %s unavailable, falling back to %s", model, fallback)
                return await run(fallback), fallback
            raise

    def _active_embed_model(self) -> str:
        return GeminiClient._embed_override or settings.GEMINI_EMBED_MODEL

    async def list_models(self) -> list[str]:
        resp = await self._request("models", method="GET")
        return [m["name"].removeprefix("models/") for m in resp.json().get("models", [])]


def _normalize(vector: list[float]) -> list[float]:
    norm = sum(v * v for v in vector) ** 0.5
    return [v / norm for v in vector] if norm else vector


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def parse_lenient_json(text: str) -> Any:
    """Models occasionally wrap JSON in fences or trail a stray token."""
    cleaned = _FENCE.sub("", text.strip())
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    match = re.search(r"[\[{]", cleaned)
    if match:
        start = match.start()
        for end in (cleaned.rfind("}"), cleaned.rfind("]")):
            if end > start:
                try:
                    return json.loads(cleaned[start : end + 1])
                except json.JSONDecodeError:
                    continue
    raise AIError(f"Could not parse model JSON output: {cleaned[:200]}", 502)


gemini = GeminiClient()
