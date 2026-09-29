"""Semantic retrieval over ContentSegments.

Uses pgvector's cosine distance operator when the database supports it, and
falls back to in-Python cosine similarity otherwise. Vectors are stored
L2-normalised, so cosine similarity is a plain dot product.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.ai import registry
from app.models.media import ContentSegment, MediaAsset
from app.models.types import HAS_NATIVE_VECTOR

log = logging.getLogger(__name__)

# Relevance floors differ by embedding kind because the score distributions do.
# Measured on a fixture project: lexical hashing gives 0.09-0.22 for genuinely
# relevant matches and ~0.03 for an unrelated query (hash collisions), so 0.05
# separates signal from noise. Semantic embeddings sit much higher.
MIN_SCORE_SEMANTIC = 0.25
MIN_SCORE_LEXICAL = 0.08


@dataclass(slots=True)
class Hit:
    segment: ContentSegment
    asset: MediaAsset
    score: float

    def locator_label(self) -> str:
        seg = self.segment
        if seg.page_number is not None:
            return f"page {seg.page_number}"
        if seg.slide_number is not None:
            return f"slide {seg.slide_number}"
        if seg.start_sec is not None:
            total = int(seg.start_sec)
            return f"{total // 60:02d}:{total % 60:02d}"
        return ""

    def to_citation(self, marker: int) -> dict[str, Any]:
        seg, asset = self.segment, self.asset
        return {
            "marker": marker,
            "segment_id": seg.id,
            "asset_id": asset.id,
            "asset_name": asset.original_filename,
            "asset_title": asset.title,
            "modality": asset.modality,
            "kind": seg.kind,
            "quote": seg.text[:600],
            "start_sec": seg.start_sec,
            "end_sec": seg.end_sec,
            "page_number": seg.page_number,
            "slide_number": seg.slide_number,
            "locator_label": self.locator_label(),
            "relevance": round(self.score, 4),
        }


async def search(
    db: Session,
    project_id: str,
    query: str,
    *,
    asset_ids: list[str] | None = None,
    limit: int = 12,
    kinds: list[str] | None = None,
) -> tuple[list[Hit], str]:
    """-> (hits, retrieval_mode). Mode is 'semantic' or 'lexical'."""
    vectors, _model, source = await registry.embed_texts([query], task_type="RETRIEVAL_QUERY")
    if not vectors or not vectors[0]:
        return [], source
    qvec = vectors[0]
    mode = "semantic" if source == "live" else "lexical"

    base = (
        db.query(ContentSegment, MediaAsset)
        .join(MediaAsset, ContentSegment.asset_id == MediaAsset.id)
        .filter(ContentSegment.project_id == project_id)
        .filter(ContentSegment.embedding.isnot(None))
    )
    if asset_ids:
        base = base.filter(ContentSegment.asset_id.in_(asset_ids))
    if kinds:
        base = base.filter(ContentSegment.kind.in_(kinds))

    floor = MIN_SCORE_SEMANTIC if mode == "semantic" else MIN_SCORE_LEXICAL

    if HAS_NATIVE_VECTOR:
        rows = (
            base.add_columns(ContentSegment.embedding.cosine_distance(qvec).label("distance"))
            .order_by("distance")
            .limit(limit * 3)
            .all()
        )
        hits = [Hit(segment=s, asset=a, score=1.0 - float(d)) for s, a, d in rows]
    else:
        hits = [
            Hit(segment=s, asset=a, score=_dot(qvec, _as_list(s.embedding)))
            for s, a in base.limit(2000).all()
        ]
        hits.sort(key=lambda h: h.score, reverse=True)

    return [h for h in hits if h.score >= floor][:limit], mode


def _as_list(embedding) -> list[float]:
    """pgvector hands back a numpy array, whose truthiness raises. Normalise to list."""
    if embedding is None:
        return []
    return list(embedding)


def _dot(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b, strict=False))


def build_evidence_block(hits: list[Hit]) -> str:
    """Numbered, source-attributed evidence for a grounded prompt."""
    lines: list[str] = []
    for i, hit in enumerate(hits, start=1):
        where = hit.locator_label()
        lines.append(
            f"[[{i}]] segment_id={hit.segment.id}\n"
            f"  source  : \"{hit.asset.original_filename}\" ({hit.asset.modality})"
            f"{', ' + where if where else ''}\n"
            f"  content : {hit.segment.text[:1500]}"
        )
    return "\n\n".join(lines)


def collect_context(
    db: Session, project_id: str, asset_ids: list[str] | None, *, char_budget: int = 60000
) -> tuple[str, list[MediaAsset], list[ContentSegment]]:
    """Assemble source text for generation, staying inside a character budget.

    Segments are interleaved across assets so one long video cannot crowd out a
    short PDF the user explicitly selected.
    """
    query = db.query(MediaAsset).filter(
        MediaAsset.project_id == project_id, MediaAsset.status == "ready"
    )
    if asset_ids:
        query = query.filter(MediaAsset.id.in_(asset_ids))
    assets = query.order_by(MediaAsset.created_at).all()
    if not assets:
        return "", [], []

    per_asset: dict[str, list[ContentSegment]] = {}
    for asset in assets:
        per_asset[asset.id] = (
            db.query(ContentSegment)
            .filter(ContentSegment.asset_id == asset.id)
            .order_by(ContentSegment.ordinal)
            .all()
        )

    by_id = {a.id: a for a in assets}
    used: list[ContentSegment] = []
    chunks: list[str] = []
    total = 0
    index = 0

    while total < char_budget:
        progressed = False
        for asset_id, segs in per_asset.items():
            if index >= len(segs):
                continue
            progressed = True
            seg = segs[index]
            asset = by_id[asset_id]
            where = ""
            if seg.page_number is not None:
                where = f" page {seg.page_number}"
            elif seg.slide_number is not None:
                where = f" slide {seg.slide_number}"
            elif seg.start_sec is not None:
                where = f" {int(seg.start_sec) // 60:02d}:{int(seg.start_sec) % 60:02d}"
            block = (
                f"[[{seg.id}]] {asset.original_filename} ({asset.modality}{where})\n{seg.text}"
            )
            if total + len(block) > char_budget:
                progressed = False
                break
            chunks.append(block)
            used.append(seg)
            total += len(block)
        if not progressed:
            break
        index += 1

    return "\n\n---\n\n".join(chunks), assets, used
