"""Source-grounded content generation."""
from __future__ import annotations

import logging
import re
import time
from typing import Any

from sqlalchemy.orm import Session

from app.ai import registry
from app.ai.base import AIResult
from app.ai.demo import demo_generate
from app.core.errors import AppError
from app.models.enums import ContentType, GenerationSource
from app.models.generation import ContentCitation, ContentVersion, GeneratedContent
from app.models.media import ContentSegment, MediaAsset
from app.models.project import Project
from app.models.user import BrandProfile
from app.prompts.templates import CONTENT_GENERATION, fence
from app.services.retrieval import collect_context
from app.schemas.generation import GenerateIn

log = logging.getLogger(__name__)

# Strips the provenance headers the retrieval layer adds ("[[id]] file (modality page 3)")
# and the block separators, leaving clean prose for extractive demo generation.
_MARKER_LINE = re.compile(r"^\[\[[0-9a-f]{8,}\]\].*$", re.MULTILINE)
_SEPARATOR = re.compile(r"^-{3,}$", re.MULTILINE)


def strip_markers(text: str) -> str:
    cleaned = _SEPARATOR.sub("", _MARKER_LINE.sub("", text))
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


LENGTH_GUIDE = {
    "short": "Keep it tight: roughly 50-120 words.",
    "medium": "Aim for roughly 150-350 words.",
    "long": "Go in depth: 600-1200 words, with clear sections.",
}

PLATFORM_RULES: dict[str, str] = {
    "instagram": "Instagram caption. Max 2,200 characters. A strong first line (it is the only part shown before 'more'). Line breaks between thoughts. 5-10 relevant hashtags at the end.",
    "tiktok": "TikTok caption. Very short, 100-150 characters. Punchy and conversational. 3-5 hashtags.",
    "x": "A post for X. Hard limit 280 characters including hashtags. One idea only. No thread unless asked.",
    "linkedin": "LinkedIn post. 1,300-2,000 characters. Professional but human. Short paragraphs, one idea per line. End with a question. At most 3 hashtags.",
    "facebook": "Facebook post. 80-250 words, conversational, minimal hashtags.",
    "youtube": "YouTube. Titles under 60 characters so they do not truncate. Descriptions open with a two-line summary, then timestamped chapters when timestamps exist.",
    "blog": "A blog article in markdown: H2 sections, short paragraphs, a clear intro and conclusion.",
    "newsletter": "An email newsletter: subject line, preview text, scannable body, one clear call to action.",
}


async def generate_content(
    db: Session, user_id: str, project: Project, payload: GenerateIn
) -> tuple[list[GeneratedContent], str, str, list[dict[str, Any]]]:
    """-> (rows, mode, sources_note, sources_used)"""
    if payload.content_type not in ContentType.ALL:
        raise AppError(
            f"Unknown content type '{payload.content_type}'. "
            f"Valid types: {', '.join(ContentType.ALL)}",
            400, "unknown_content_type",
        )

    context, assets, segments = collect_context(db, project.id, payload.asset_ids or None)
    if not assets:
        raise AppError(
            "No processed sources are available. Upload a file and wait for it to finish, "
            "or clear your source selection.",
            400, "no_sources",
        )
    if not context.strip():
        raise AppError(
            "The selected sources have no extracted text yet. Audio and video need "
            "GEMINI_API_KEY to be transcribed.",
            400, "no_text",
        )

    brand = None
    if payload.brand_profile_id:
        brand = db.get(BrandProfile, payload.brand_profile_id)
        if brand and brand.owner_id != user_id:
            brand = None

    started = time.monotonic()

    def demo_fallback() -> AIResult:
        result = demo_generate(payload.content_type, strip_markers(context), payload.model_dump())
        data = result.data
        return AIResult(
            data={
                "variants": [{
                    "title": data.get("title", ""),
                    "body": data.get("body", ""),
                    "rationale": "Extractive draft assembled from your source text.",
                    "hashtags": [],
                    "cited_segment_ids": [s.id for s in segments[:4]],
                    "structured": data.get("structured"),
                }],
                "sources_note": data.get("demo_notice", ""),
            },
            source="demo",
        )

    if registry.is_live():
        prompt = _build_prompt(payload, project, brand, context, assets)
        result = await registry.run_template(
            CONTENT_GENERATION, [{"text": prompt}], demo_fallback=demo_fallback
        )
    else:
        result = demo_fallback()

    variants = result.data.get("variants") or []
    if not variants:
        raise AppError("The model returned no content. Try again.", 502, "empty_generation")

    segment_ids = {s.id for s in segments}
    by_id = {s.id: s for s in segments}
    elapsed = int((time.monotonic() - started) * 1000)
    rows: list[GeneratedContent] = []

    for index, variant in enumerate(variants[: payload.variations]):
        row = GeneratedContent(
            owner_id=user_id,
            project_id=project.id,
            content_type=payload.content_type,
            platform=payload.platform,
            title=str(variant.get("title") or "")[:300],
            body=str(variant.get("body") or ""),
            structured=variant.get("structured") or result.data.get("structured"),
            tone=payload.tone,
            language=payload.language,
            audience=payload.audience,
            length=payload.length,
            brand_profile_id=brand.id if brand else None,
            prompt_template=CONTENT_GENERATION.name,
            prompt_version=CONTENT_GENERATION.version,
            model_used=result.model or ("demo-extractive" if result.source == "demo" else ""),
            generation_source=(
                GenerationSource.DEMO if result.source == "demo" else GenerationSource.LIVE
            ),
            source_asset_ids=[a.id for a in assets],
            variant_index=index,
            tokens_used=result.usage.total_tokens,
            generation_ms=elapsed,
        )
        if variant.get("hashtags"):
            row.tags = " ".join(str(h) for h in variant["hashtags"])[:500]
        db.add(row)
        db.flush()

        db.add(ContentVersion(
            content_id=row.id, version=1, title=row.title, body=row.body,
            structured=row.structured, edited_by_user=False, note="Initial generation",
        ))

        for cited in (variant.get("cited_segment_ids") or [])[:10]:
            if cited in segment_ids:
                seg: ContentSegment = by_id[cited]
                db.add(ContentCitation(
                    content_id=row.id, segment_id=seg.id, asset_id=seg.asset_id,
                    quote=seg.text[:600], start_sec=seg.start_sec,
                    page_number=seg.page_number, relevance=1.0,
                ))
        rows.append(row)

    db.commit()
    for row in rows:
        db.refresh(row)

    sources_used = [
        {"id": a.id, "filename": a.original_filename, "modality": a.modality, "title": a.title}
        for a in assets
    ]
    return rows, result.source, str(result.data.get("sources_note") or ""), sources_used


def _build_prompt(
    payload: GenerateIn, project: Project, brand: BrandProfile | None,
    context: str, assets: list[MediaAsset],
) -> str:
    inventory = "\n".join(
        f"- \"{a.original_filename}\" ({a.modality})"
        + (f", {a.duration_sec:.0f}s" if a.duration_sec else "")
        + (f", {a.page_count} pages" if a.page_count else "")
        for a in assets
    )

    parts = [
        f"TASK: Produce {payload.variations} distinct variation(s) of: {payload.content_type}",
        f"PLATFORM: {payload.platform}",
        PLATFORM_RULES.get(payload.platform, ""),
        f"TONE: {payload.tone}",
        f"LANGUAGE: Write entirely in {payload.language}.",
        f"AUDIENCE: {payload.audience}" if payload.audience else "",
        f"LENGTH: {LENGTH_GUIDE.get(payload.length, LENGTH_GUIDE['medium'])}",
        f"KEYWORDS TO WORK IN NATURALLY: {', '.join(payload.keywords)}" if payload.keywords else "",
    ]

    if project.context:
        parts.append(f"\nPROJECT CONTEXT:\n{project.context}")

    if brand:
        brand_lines = [
            f"\nBRAND VOICE — \"{brand.name}\" (follow this closely):",
            f"- Description: {brand.description}" if brand.description else "",
            f"- Tone: {brand.tone}",
            f"- Audience: {brand.audience}" if brand.audience else "",
            f"- Lean on: {brand.preferred_phrases}" if brand.preferred_phrases else "",
            f"- NEVER use: {brand.banned_phrases}" if brand.banned_phrases else "",
            f"- Rules: {brand.writing_rules}" if brand.writing_rules else "",
            f"- Emoji: {brand.emoji_policy}",
        ]
        parts.append("\n".join(x for x in brand_lines if x))

    if payload.extra_instructions:
        parts.append(f"\nEXTRA INSTRUCTIONS FROM THE USER:\n{payload.extra_instructions}")

    parts += [
        f"\nSOURCES SELECTED ({len(assets)}):\n{inventory}",
        "\nSOURCE CONTENT — each block starts with its segment id in [[double brackets]]:",
        fence(context),
        "\nGenerate the content now. Base every factual statement on the source content "
        "above, and list the segment ids you used in cited_segment_ids.",
    ]
    return "\n".join(p for p in parts if p)
