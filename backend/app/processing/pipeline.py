"""The unified multimodal ingestion pipeline.

Every modality is reduced to the same normalised representation: an asset-level
summary plus a list of ContentSegments carrying provenance (timestamp, page,
slide, frame). Those segments are what gets embedded, retrieved and cited.

Extraction (FFmpeg, OpenCV, PyMuPDF, OCR) runs with no API key. Only the
understanding layer needs a provider, and it degrades to extractive demo output.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.ai import registry
from app.ai.base import AIResult
from app.ai.demo import demo_summary, keywords, rank_sentences
from app.core.config import settings
from app.models.enums import AssetStatus, Modality, SegmentKind
from app.models.media import ContentSegment, MediaAsset
from app.processing import document as doc_proc
from app.processing import image as img_proc
from app.processing import probe as ff
from app.processing import video as vid_proc
from app.prompts.templates import UNDERSTANDING_BY_MODALITY, fence
from app.storage.local import get_storage

log = logging.getLogger(__name__)

# Videos longer than this are summarised from extracted audio + sampled frames
# instead of uploading the whole file.
DIRECT_VIDEO_LIMIT_SEC = 15 * 60
TRANSCRIPT_WINDOW_SEC = 30.0


@dataclass(slots=True)
class PendingSegment:
    kind: str
    text: str
    ordinal: int
    start_sec: float | None = None
    end_sec: float | None = None
    page_number: int | None = None
    slide_number: int | None = None
    speaker: str = ""
    frame_key: str = ""
    confidence: float = 1.0
    extra: dict[str, Any] = field(default_factory=dict)


ProgressFn = Any  # Callable[[int, str], None]


async def ingest_asset(db: Session, asset: MediaAsset, progress: ProgressFn = None) -> None:
    """Run the full pipeline for one asset and persist everything it learned."""
    started = time.monotonic()
    storage = get_storage()
    source = storage.path(asset.storage_key)

    def step(pct: int, message: str) -> None:
        asset.progress = pct
        asset.status_message = message
        db.commit()
        if progress:
            progress(pct, message)

    asset.status = AssetStatus.PROCESSING
    asset.error = ""
    step(5, "Reading file…")

    if not source.exists():
        raise FileNotFoundError(f"Stored file is missing: {asset.storage_key}")

    work_dir = storage.path(f"{asset.owner_id}/{asset.project_id}/derived/{asset.id}")
    work_dir.mkdir(parents=True, exist_ok=True)

    if asset.modality == Modality.VIDEO:
        segments, understanding = await _ingest_video(asset, source, work_dir, step)
    elif asset.modality == Modality.AUDIO:
        segments, understanding = await _ingest_audio(asset, source, work_dir, step)
    elif asset.modality == Modality.IMAGE:
        segments, understanding = await _ingest_image(asset, source, work_dir, step)
    elif asset.modality == Modality.SUBTITLE:
        segments, understanding = _ingest_subtitle(asset, source, step)
    else:
        segments, understanding = await _ingest_document(asset, source, step)

    # --- asset-level understanding ---
    data = understanding.data if isinstance(understanding, AIResult) else understanding
    asset.title = str(data.get("title") or asset.original_filename)[:300]
    asset.summary = str(data.get("summary") or "")
    asset.topics = list(data.get("topics") or [])[:20]
    asset.keywords = list(data.get("keywords") or [])[:30]
    asset.language = str(data.get("language") or "")
    asset.analysis_source = understanding.source if isinstance(understanding, AIResult) else "demo"

    full_text = "\n\n".join(s.text for s in segments if s.text)
    asset.full_text = full_text[: settings.MAX_TRANSCRIPT_CHARS]

    extra = dict(asset.extra or {})
    for key in ("key_points", "highlight_candidates", "scenes", "demo_notice"):
        if data.get(key):
            extra[key] = data[key]
    asset.extra = extra

    # --- persist segments ---
    step(80, "Indexing for search…")
    db.query(ContentSegment).filter(ContentSegment.asset_id == asset.id).delete()

    rows: list[ContentSegment] = [
        ContentSegment(
            owner_id=asset.owner_id,
            project_id=asset.project_id,
            asset_id=asset.id,
            kind=seg.kind,
            ordinal=seg.ordinal,
            text=seg.text[:20000],
            start_sec=seg.start_sec,
            end_sec=seg.end_sec,
            page_number=seg.page_number,
            slide_number=seg.slide_number,
            speaker=seg.speaker[:80],
            frame_key=seg.frame_key[:500],
            confidence=seg.confidence,
            token_estimate=max(1, len(seg.text) // 4),
            extra=seg.extra,
        )
        for seg in segments
        if seg.text and seg.text.strip()
    ]
    db.add_all(rows)
    db.flush()

    # --- embeddings ---
    if rows:
        texts = [_embedding_text(asset, r) for r in rows]
        vectors, model, embed_source = await registry.embed_texts(texts)
        for row, vector in zip(rows, vectors, strict=False):
            if vector:
                row.embedding = vector
                row.embedding_model = model
        extra = dict(asset.extra or {})
        extra["embedding_source"] = embed_source
        asset.extra = extra

    asset.status = AssetStatus.READY
    asset.progress = 100
    asset.processing_ms = int((time.monotonic() - started) * 1000)
    asset.status_message = f"{len(rows)} searchable segments"
    db.commit()
    log.info("Ingested %s (%s): %d segments", asset.original_filename, asset.modality, len(rows))


def _embedding_text(asset: MediaAsset, seg: ContentSegment) -> str:
    """Prefix segments with their source so retrieval has a little context."""
    where = ""
    if seg.page_number:
        where = f"page {seg.page_number}"
    elif seg.slide_number:
        where = f"slide {seg.slide_number}"
    elif seg.start_sec is not None:
        where = f"{int(seg.start_sec // 60):02d}:{int(seg.start_sec % 60):02d}"
    return f"[{asset.title or asset.original_filename}{' ' + where if where else ''}] {seg.text}"


# --------------------------------------------------------------------------- #
# Video
# --------------------------------------------------------------------------- #

async def _ingest_video(asset, source: Path, work_dir: Path, step) -> tuple[list[PendingSegment], Any]:
    step(10, "Probing video…")
    info = ff.media_info(source)
    asset.duration_sec = info.get("duration_sec")
    asset.width, asset.height = info.get("width"), info.get("height")
    asset.extra = {**(asset.extra or {}), "media": info}

    step(20, "Detecting scenes…")
    scenes = vid_proc.detect_scenes(source)
    scenes = vid_proc.scene_keyframes(source, scenes, work_dir / "scenes")

    step(30, "Sampling frames…")
    frames = vid_proc.extract_frames(source, work_dir / "frames", count=settings.VIDEO_FRAME_SAMPLES)
    if frames:
        asset.thumbnail_key = _rel_key(frames[len(frames) // 2].path)

    duration = asset.duration_sec or 0.0
    storage = get_storage()

    step(45, "Understanding video with AI…" if registry.is_live() else "AI not configured — demo mode")

    if registry.is_live():
        parts: list[dict] = []
        if duration and duration <= DIRECT_VIDEO_LIMIT_SEC:
            parts.append(await registry.part_for_file(source, asset.mime_type, asset.original_filename))
            note = "The full video is attached."
        else:
            audio_path = ff.extract_audio(source, work_dir / "audio.mp3")
            parts.append(await registry.part_for_file(audio_path, "audio/mpeg", "audio track"))
            for frame in frames:
                parts.append(await registry.part_for_file(frame.path, "image/jpeg", frame.path.name))
            note = (
                f"This video is {duration / 60:.0f} minutes long. Its audio track is attached, "
                f"plus {len(frames)} frames sampled at "
                + ", ".join(f"{f.time_sec:.0f}s" for f in frames)
                + "."
            )
        scene_note = "\n".join(
            f"- scene {i + 1}: {s.start_sec:.1f}s to {s.end_sec:.1f}s" for i, s in enumerate(scenes[:40])
        )
        parts.append({
            "text": (
                f"FILE: {asset.original_filename}\nDURATION: {duration:.1f} seconds\n{note}\n\n"
                f"Scene cuts detected by the video pipeline:\n{scene_note}\n\n"
                "Analyse this video and return the required JSON."
            )
        })
        result = await registry.run_template(
            UNDERSTANDING_BY_MODALITY["video"], parts,
            demo_fallback=lambda: _demo_av_result(asset, scenes, duration),
        )
    else:
        result = _demo_av_result(asset, scenes, duration)

    data = result.data
    segments = _segments_from_av(data, scenes, storage)
    return segments, result


def _rel_key(path: Path) -> str:
    root = get_storage().path("")
    try:
        return str(path.resolve().relative_to(root))
    except ValueError:
        return ""


def _demo_av_result(asset, scenes, duration: float) -> AIResult:
    """Honest demo output: we have real scene/duration data but no transcript."""
    scene_lines = [
        f"Scene {i + 1}: {s.start_sec:.0f}s–{s.end_sec:.0f}s ({s.duration:.0f}s)"
        for i, s in enumerate(scenes[:30])
    ]
    return AIResult(
        data={
            "title": asset.original_filename,
            "summary": (
                f"{duration / 60:.1f} minute {asset.modality} with {len(scenes)} detected "
                f"scene(s). Speech was not transcribed because no AI provider is configured — "
                f"scene boundaries, duration and frames below come from the real media pipeline."
            ),
            "topics": [],
            "keywords": [],
            "key_points": scene_lines,
            "transcript": "",
            "segments": [],
            "scenes": [
                {"start_sec": s.start_sec, "end_sec": s.end_sec,
                 "description": f"Scene {i + 1}", "on_screen_text": ""}
                for i, s in enumerate(scenes)
            ],
            "highlight_candidates": [],
            "demo_notice": (
                "Demo mode: scenes, frames and duration are real. Transcription and "
                "topic analysis need GEMINI_API_KEY."
            ),
        },
        source="demo",
    )


def _segments_from_av(data: dict, scenes, storage) -> list[PendingSegment]:
    """Transcript windows plus one segment per visual scene."""
    segments: list[PendingSegment] = []
    ordinal = 0

    raw = data.get("segments") or []
    windows = _merge_windows(raw, TRANSCRIPT_WINDOW_SEC)
    for win in windows:
        segments.append(
            PendingSegment(
                kind=SegmentKind.TRANSCRIPT, text=win["text"], ordinal=ordinal,
                start_sec=win["start_sec"], end_sec=win.get("end_sec"),
                speaker=win.get("speaker", ""),
            )
        )
        ordinal += 1

    keyframes = {round(s.start_sec, 1): s.keyframe for s in scenes}
    for i, scene in enumerate(data.get("scenes") or []):
        text = " ".join(
            filter(None, [scene.get("description", ""), scene.get("on_screen_text", "")])
        ).strip()
        if not text:
            continue
        start = float(scene.get("start_sec") or 0)
        frame = keyframes.get(round(start, 1))
        segments.append(
            PendingSegment(
                kind=SegmentKind.VIDEO_SCENE, text=text, ordinal=ordinal,
                start_sec=start, end_sec=scene.get("end_sec"),
                frame_key=_rel_key(frame) if frame else "",
                extra={"on_screen_text": scene.get("on_screen_text", ""), "scene_index": i},
            )
        )
        ordinal += 1

    return segments


def _merge_windows(raw: list[dict], target_sec: float) -> list[dict]:
    """Group fine-grained transcript lines into ~30s retrieval windows."""
    windows: list[dict] = []
    current: dict | None = None

    for item in raw:
        try:
            start = float(item.get("start_sec"))
        except (TypeError, ValueError):
            continue
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        end = item.get("end_sec")
        end = float(end) if isinstance(end, (int, float)) else start + 5.0
        speaker = str(item.get("speaker") or "")

        if (
            current is None
            or end - current["start_sec"] > target_sec
            or speaker != current.get("speaker", "")
        ):
            if current:
                windows.append(current)
            current = {"start_sec": start, "end_sec": end, "text": text, "speaker": speaker}
        else:
            current["text"] += " " + text
            current["end_sec"] = end

    if current:
        windows.append(current)
    return windows


# --------------------------------------------------------------------------- #
# Audio
# --------------------------------------------------------------------------- #

async def _ingest_audio(asset, source: Path, work_dir: Path, step) -> tuple[list[PendingSegment], Any]:
    step(15, "Probing audio…")
    info = ff.media_info(source)
    asset.duration_sec = info.get("duration_sec")
    asset.extra = {**(asset.extra or {}), "media": info}
    duration = asset.duration_sec or 0.0

    step(40, "Transcribing…" if registry.is_live() else "AI not configured — demo mode")

    if registry.is_live():
        # Re-encode to mono 16kHz mp3: same words, far fewer bytes.
        upload = source
        if source.stat().st_size > 8 * 1024 * 1024:
            upload = ff.extract_audio(source, work_dir / "audio.mp3")
        parts = [
            await registry.part_for_file(
                upload, "audio/mpeg" if upload != source else asset.mime_type, asset.original_filename
            ),
            {"text": (
                f"FILE: {asset.original_filename}\nDURATION: {duration:.1f} seconds\n\n"
                "Transcribe and analyse this recording. Return the required JSON."
            )},
        ]
        result = await registry.run_template(
            UNDERSTANDING_BY_MODALITY["audio"], parts,
            demo_fallback=lambda: _demo_av_result(asset, [], duration),
        )
    else:
        result = _demo_av_result(asset, [], duration)

    segments = _segments_from_av(result.data, [], get_storage())
    return segments, result


# --------------------------------------------------------------------------- #
# Image
# --------------------------------------------------------------------------- #

async def _ingest_image(asset, source: Path, work_dir: Path, step) -> tuple[list[PendingSegment], Any]:
    step(15, "Reading image…")
    info = img_proc.image_info(source)
    asset.width, asset.height = info.get("width"), info.get("height")
    asset.extra = {**(asset.extra or {}), "image": info}

    step(30, "Running OCR…")
    ocr_text, ocr_conf = img_proc.ocr_image(source)

    try:
        thumb = img_proc.make_thumbnail(source, work_dir / "thumb.jpg")
        asset.thumbnail_key = _rel_key(thumb)
    except Exception as exc:  # noqa: BLE001
        log.info("Thumbnail failed for %s: %s", asset.original_filename, exc)

    step(50, "Describing image with AI…" if registry.is_live() else "AI not configured — demo mode")

    def demo() -> AIResult:
        base = demo_summary(ocr_text, title=asset.original_filename)
        base["visual_description"] = (
            "Visual description needs an AI provider. The text below was read by OCR, which runs locally."
        )
        base["extracted_text"] = ocr_text
        return AIResult(data=base, source="demo")

    if registry.is_live():
        parts = [
            await registry.part_for_file(source, asset.mime_type, asset.original_filename),
            {"text": (
                f"FILE: {asset.original_filename}\nDIMENSIONS: {info.get('width')}x{info.get('height')}\n"
                + (f"\nOCR already read this text from the image (confidence {ocr_conf:.0%}):\n"
                   f"{fence(ocr_text)}\n" if ocr_text else "")
                + "\nAnalyse this image and return the required JSON."
            )},
        ]
        result = await registry.run_template(
            UNDERSTANDING_BY_MODALITY["image"], parts, demo_fallback=demo
        )
    else:
        result = demo()

    data = result.data
    segments: list[PendingSegment] = []
    description = str(data.get("visual_description") or data.get("summary") or "").strip()
    if description:
        segments.append(
            PendingSegment(kind=SegmentKind.IMAGE_DESCRIPTION, text=description, ordinal=0)
        )
    text_in_image = str(data.get("extracted_text") or ocr_text or "").strip()
    if text_in_image:
        segments.append(
            PendingSegment(
                kind=SegmentKind.OCR, text=text_in_image, ordinal=1,
                confidence=ocr_conf or 1.0, extra={"ocr_confidence": ocr_conf},
            )
        )
    return segments, result


# --------------------------------------------------------------------------- #
# Documents, presentations, text, subtitles
# --------------------------------------------------------------------------- #

async def _ingest_document(asset, source: Path, step) -> tuple[list[PendingSegment], Any]:
    step(15, "Extracting text…")
    blocks, meta = doc_proc.extract(source, asset.mime_type)
    asset.page_count = meta.get("page_count")
    asset.extra = {**(asset.extra or {}), "document": meta}

    if not blocks:
        raise ValueError(
            "No text could be extracted from this file. If it is a scan, install "
            "tesseract so OCR can run."
        )

    is_slides = asset.modality == Modality.PRESENTATION
    segments = [
        PendingSegment(
            kind=SegmentKind.SLIDE if b.kind == "slide" else SegmentKind.DOCUMENT_PAGE,
            text="\n".join(filter(None, [b.title, b.text, b.notes])),
            ordinal=i,
            page_number=None if is_slides else b.index,
            slide_number=b.index if is_slides else None,
            confidence=0.85 if b.used_ocr else 1.0,
            extra={"used_ocr": b.used_ocr, "tables": b.tables[:3], "title": b.title},
        )
        for i, b in enumerate(blocks)
    ]

    combined = "\n\n".join(
        f"[{'Slide' if is_slides else 'Page'} {b.index}]\n{b.text}" for b in blocks
    )[: settings.MAX_TRANSCRIPT_CHARS]

    step(45, "Understanding document with AI…" if registry.is_live() else "AI not configured — demo mode")

    def demo() -> AIResult:
        base = demo_summary(combined, title=asset.original_filename)
        base["extracted_text"] = combined[:20000]
        return AIResult(data=base, source="demo")

    if registry.is_live():
        parts = [{
            "text": (
                f"FILE: {asset.original_filename}\n"
                f"{'SLIDES' if is_slides else 'PAGES'}: {len(blocks)}\n\n"
                f"Extracted content, with {'slide' if is_slides else 'page'} markers:\n"
                f"{fence(combined)}\n\nAnalyse it and return the required JSON."
            )
        }]
        result = await registry.run_template(
            UNDERSTANDING_BY_MODALITY["document"], parts, demo_fallback=demo
        )
    else:
        result = demo()

    return segments, result


def _ingest_subtitle(asset, source: Path, step) -> tuple[list[PendingSegment], Any]:
    """SRT/VTT already carry their own timings — parse rather than transcribe."""
    step(30, "Parsing subtitles…")
    import re

    raw = source.read_text(encoding="utf-8", errors="replace")
    pattern = re.compile(
        r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})(.*?)(?=\n\s*\n|\Z)",
        re.DOTALL,
    )
    segments: list[PendingSegment] = []
    for i, m in enumerate(pattern.finditer(raw)):
        start = int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3]) + int(m[4]) / 1000
        end = int(m[5]) * 3600 + int(m[6]) * 60 + int(m[7]) + int(m[8]) / 1000
        text = re.sub(r"<[^>]+>", "", m[9]).strip()
        if text:
            segments.append(
                PendingSegment(
                    kind=SegmentKind.TRANSCRIPT, text=text, ordinal=i,
                    start_sec=round(start, 2), end_sec=round(end, 2),
                )
            )

    full = " ".join(s.text for s in segments)
    asset.duration_sec = segments[-1].end_sec if segments else None
    return segments, AIResult(
        data={
            "title": asset.original_filename,
            "summary": " ".join(rank_sentences(full, 3)) or "Subtitle track.",
            "topics": keywords(full, 6),
            "keywords": keywords(full, 15),
            "key_points": rank_sentences(full, 5),
        },
        source="demo" if not registry.is_live() else "live",
    )
