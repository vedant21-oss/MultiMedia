from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import FileResponse, PlainTextResponse

from app.ai import registry
from app.core.deps import CurrentUser, DbSession, OwnedAsset
from app.core.errors import AppError
from app.core.rate_limit import ai_limiter
from app.models.enums import AssetStatus, Modality, SegmentKind
from app.models.media import ContentSegment, MediaAsset
from app.processing import probe as ff
from app.processing import video as vid
from app.processing.subtitles import Cue, split_long_cues, to_srt, to_vtt
from app.prompts.templates import HIGHLIGHT_SELECTION, fence
from app.schemas.media import AssetOut, JobOut
from app.schemas.video import (
    ClipIn, HighlightIn, HighlightOut, HighlightsOut, SegmentsOut, SubtitleIn,
)
from app.storage.local import get_storage
from app.workers import jobs

log = logging.getLogger(__name__)
router = APIRouter(prefix="/video", tags=["video studio"])


def _require_timed(asset: MediaAsset) -> None:
    if asset.modality not in (Modality.VIDEO, Modality.AUDIO):
        raise AppError("This endpoint only works on video or audio assets", 400, "wrong_modality")
    if asset.status != AssetStatus.READY:
        raise AppError("This asset has not finished processing yet", 409, "not_ready")


def _transcript_cues(db, asset: MediaAsset) -> list[Cue]:
    rows = (
        db.query(ContentSegment)
        .filter(
            ContentSegment.asset_id == asset.id,
            ContentSegment.kind == SegmentKind.TRANSCRIPT,
            ContentSegment.start_sec.isnot(None),
        )
        .order_by(ContentSegment.start_sec)
        .all()
    )
    return [
        Cue(
            start=s.start_sec,
            end=s.end_sec if s.end_sec is not None else s.start_sec + 4.0,
            text=s.text,
            speaker=s.speaker,
        )
        for s in rows
    ]


@router.get("/{media_id}/segments", response_model=SegmentsOut)
def segments(asset: OwnedAsset, db: DbSession):
    """Scenes, transcript windows and sampled frames for the studio timeline."""
    _require_timed(asset)
    rows = (
        db.query(ContentSegment)
        .filter(ContentSegment.asset_id == asset.id)
        .order_by(ContentSegment.ordinal)
        .all()
    )
    transcript = [
        {
            "id": s.id, "start_sec": s.start_sec, "end_sec": s.end_sec,
            "speaker": s.speaker, "text": s.text,
        }
        for s in rows if s.kind == SegmentKind.TRANSCRIPT
    ]
    scenes = [
        {
            "id": s.id, "start_sec": s.start_sec, "end_sec": s.end_sec,
            "description": s.text, "frame_key": s.frame_key,
        }
        for s in rows if s.kind == SegmentKind.VIDEO_SCENE
    ]
    if not scenes:
        scenes = [
            {"start_sec": sc["start_sec"], "end_sec": sc["end_sec"], "description": sc.get("description", "")}
            for sc in (asset.extra or {}).get("scenes", [])
        ]

    storage = get_storage()
    frames_dir = storage.path(f"{asset.owner_id}/{asset.project_id}/derived/{asset.id}/frames")
    frames = []
    if frames_dir.exists():
        for f in sorted(frames_dir.glob("frame_*.jpg")):
            try:
                ms = int(f.stem.split("_")[-1])
            except ValueError:
                continue
            frames.append({"time_sec": round(ms / 1000, 2), "key": str(f.relative_to(storage.path("")))})

    return SegmentsOut(
        duration_sec=asset.duration_sec, scenes=scenes, transcript=transcript, frames=frames,
        has_transcript=bool(transcript),
        note="" if transcript else (
            "No transcript available. Transcription needs GEMINI_API_KEY; scene "
            "boundaries and frames below are produced locally by FFmpeg and OpenCV."
        ),
    )


@router.post("/{media_id}/highlights", response_model=HighlightsOut, dependencies=[Depends(ai_limiter)])
async def highlights(payload: HighlightIn, asset: OwnedAsset, db: DbSession):
    """Suggest clip-worthy moments. Recommendations only — never a performance claim."""
    _require_timed(asset)
    cues = _transcript_cues(db, asset)
    duration = asset.duration_sec or 0.0

    if not cues:
        # No transcript: fall back to real scene boundaries, and say so.
        scenes = [
            s for s in (asset.extra or {}).get("scenes", [])
            if payload.min_sec <= (s.get("end_sec", 0) - s.get("start_sec", 0)) <= payload.max_sec
        ][: payload.target_count]
        clips = [
            HighlightOut(
                start_sec=s["start_sec"], end_sec=s["end_sec"],
                title=f"Scene {i + 1}",
                reason="Detected scene boundary. Without a transcript this is a visual cut, not a complete idea.",
                duration_sec=round(s["end_sec"] - s["start_sec"], 2), source="demo",
            )
            for i, s in enumerate(scenes)
        ]
        return HighlightsOut(
            clips=clips, mode="demo",
            note=(
                "These come from visual scene detection only. Add GEMINI_API_KEY so clips "
                "can be chosen by what is actually said."
            ),
        )

    transcript_text = "\n".join(
        f"[{int(c.start)//60:02d}:{int(c.start)%60:02d} - {int(c.end)//60:02d}:{int(c.end)%60:02d}] "
        f"({c.start:.1f}s-{c.end:.1f}s) {c.text}"
        for c in cues
    )
    scenes_text = "\n".join(
        f"- cut at {s.get('start_sec', 0):.1f}s" for s in (asset.extra or {}).get("scenes", [])[:40]
    )

    prompt = (
        f"VIDEO: {asset.original_filename}\nDURATION: {duration:.1f} seconds\n"
        f"TARGET: {payload.target_count} clips, each between {payload.min_sec:.0f} and "
        f"{payload.max_sec:.0f} seconds.\n"
        + (f"PRIORITISE MOMENTS ABOUT: {', '.join(payload.keywords)}\n" if payload.keywords else "")
        + f"\nSCENE CUTS:\n{scenes_text}\n\nTIMESTAMPED TRANSCRIPT:\n{fence(transcript_text)}\n\n"
        "Select the clips now. Every timestamp must exist in the transcript above."
    )

    from app.ai.base import AIResult

    def fallback() -> AIResult:
        picked, i = [], 0
        while i < len(cues) and len(picked) < payload.target_count:
            start = cues[i].start
            j = i
            while j < len(cues) and cues[j].end - start < payload.min_sec:
                j += 1
            end = cues[min(j, len(cues) - 1)].end
            picked.append({
                "start_sec": start, "end_sec": min(end, duration or end),
                "title": cues[i].text[:60],
                "reason": "Contiguous transcript window of the requested length.",
                "transcript_excerpt": " ".join(c.text for c in cues[i : j + 1])[:400],
            })
            i = j + 1
        return AIResult(data={"clips": picked}, source="demo")

    result = await registry.run_template(
        HIGHLIGHT_SELECTION, [{"text": prompt}], demo_fallback=fallback
    )

    clips: list[HighlightOut] = []
    for c in (result.data.get("clips") or [])[: payload.target_count]:
        try:
            start = max(0.0, float(c["start_sec"]))
            end = float(c["end_sec"])
        except (KeyError, TypeError, ValueError):
            continue
        # Never let the model propose a clip past the end of the video.
        if duration:
            end = min(end, duration)
        if end <= start:
            continue
        clips.append(
            HighlightOut(
                start_sec=round(start, 2), end_sec=round(end, 2),
                title=str(c.get("title") or "Clip")[:200],
                reason=str(c.get("reason") or ""),
                transcript_excerpt=str(c.get("transcript_excerpt") or "")[:600],
                suggested_platform=str(c.get("suggested_platform") or ""),
                review_note=str(c.get("review_note") or ""),
                duration_sec=round(end - start, 2), source=result.source,
            )
        )

    return HighlightsOut(
        clips=clips, mode=result.source,
        note="Creative recommendations. Review each clip before publishing.",
    )


async def _clip_handler(job) -> None:
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        parent = db.get(MediaAsset, job.asset_id)
        if parent is None:
            raise FileNotFoundError("Source asset no longer exists")

        params = job.params
        storage = get_storage()
        src = storage.path(parent.storage_key)

        job.step, job.progress = "Preparing…", 10
        db.commit()

        subtitle_path: Path | None = None
        if params.get("burn_subtitles"):
            cues = _transcript_cues(db, parent)
            if cues:
                shifted = split_long_cues(cues)
                text = to_srt(shifted, offset=params["start_sec"])
                subtitle_path = storage.path(
                    f"{parent.owner_id}/{parent.project_id}/derived/{parent.id}/burn.srt"
                )
                subtitle_path.parent.mkdir(parents=True, exist_ok=True)
                subtitle_path.write_text(text, encoding="utf-8")

        job.step, job.progress = "Encoding with FFmpeg…", 40
        db.commit()

        clip_asset = MediaAsset(
            owner_id=parent.owner_id, project_id=parent.project_id,
            original_filename=(params.get("title") or f"{Path(parent.original_filename).stem}-clip") + ".mp4",
            storage_key="", mime_type="video/mp4", modality=Modality.VIDEO, size_bytes=0,
            status=AssetStatus.PROCESSING, status_message="Encoding…",
        )
        db.add(clip_asset)
        db.flush()

        key = f"{parent.owner_id}/{parent.project_id}/{clip_asset.id}/{clip_asset.original_filename}"
        dest = storage.path(key)
        ff.cut_clip(
            src, dest, params["start_sec"], params["end_sec"],
            aspect=params.get("aspect_ratio"), subtitles=subtitle_path,
        )

        job.step, job.progress = "Finalising…", 85
        db.commit()

        info = ff.media_info(dest)
        clip_asset.storage_key = key
        clip_asset.size_bytes = dest.stat().st_size
        clip_asset.duration_sec = info.get("duration_sec")
        clip_asset.width, clip_asset.height = info.get("width"), info.get("height")
        clip_asset.status = AssetStatus.READY
        clip_asset.status_message = "Clip ready"
        clip_asset.title = params.get("title") or "Clip"
        clip_asset.summary = (
            f"Clip from \"{parent.original_filename}\", "
            f"{params['start_sec']:.1f}s–{params['end_sec']:.1f}s"
            + (f", reframed to {params['aspect_ratio']}" if params.get("aspect_ratio") else "")
            + (", subtitles burned in" if params.get("burn_subtitles") and subtitle_path else "")
        )
        clip_asset.extra = {
            "derived_from": parent.id,
            "clip": {k: params.get(k) for k in ("start_sec", "end_sec", "aspect_ratio", "burn_subtitles")},
        }
        parent_user = clip_asset.owner_id
        from app.models.user import User

        user = db.get(User, parent_user)
        if user:
            user.storage_used_bytes += clip_asset.size_bytes

        job.result = {
            "asset_id": clip_asset.id,
            "size_bytes": clip_asset.size_bytes,
            "duration_sec": clip_asset.duration_sec,
            "width": clip_asset.width,
            "height": clip_asset.height,
        }
        db.commit()
    finally:
        db.close()


@router.post("/{media_id}/clip", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def create_clip(payload: ClipIn, asset: OwnedAsset, db: DbSession, user: CurrentUser):
    """Trim, reframe and optionally burn in subtitles. Runs as a background job."""
    if asset.modality != Modality.VIDEO:
        raise AppError("Clipping requires a video asset", 400, "wrong_modality")
    if not ff.ffmpeg_available():
        raise AppError("FFmpeg is not installed on this server", 503, "ffmpeg_missing")
    if asset.duration_sec and payload.start_sec >= asset.duration_sec:
        raise AppError(
            f"start_sec is past the end of the video ({asset.duration_sec:.1f}s)",
            400, "out_of_range",
        )

    job = jobs.create_job(
        db, owner_id=user.id, project_id=asset.project_id, kind="clip",
        asset_id=asset.id, params=payload.model_dump(),
    )
    jobs.submit(job.id, _clip_handler)
    return JobOut.model_validate(job)


@router.post("/{media_id}/subtitles")
def subtitles(payload: SubtitleIn, asset: OwnedAsset, db: DbSession):
    """Download an SRT or VTT built from the stored transcript."""
    _require_timed(asset)
    cues = _transcript_cues(db, asset)
    if not cues:
        raise AppError(
            "This asset has no transcript. Transcription requires GEMINI_API_KEY.",
            409, "no_transcript",
        )

    readable = split_long_cues(cues, max_chars=payload.max_chars)
    render = to_vtt if payload.fmt == "vtt" else to_srt
    body = render(readable, offset=payload.start_sec, line_width=payload.line_width)
    stem = Path(asset.original_filename).stem[:60]
    return PlainTextResponse(
        body,
        media_type="text/vtt" if payload.fmt == "vtt" else "application/x-subrip",
        headers={"Content-Disposition": f'attachment; filename="{stem}.{payload.fmt}"'},
    )


@router.get("/{media_id}/frames")
def frames(asset: OwnedAsset, count: int = Query(default=12, ge=1, le=40)):
    """Sampled frames, for picking a thumbnail background."""
    if asset.modality != Modality.VIDEO:
        raise AppError("Frames are only available for video", 400, "wrong_modality")
    storage = get_storage()
    out_dir = storage.path(f"{asset.owner_id}/{asset.project_id}/derived/{asset.id}/frames")
    src = storage.path(asset.storage_key)
    if not src.exists():
        raise AppError("The stored file is no longer available", 410, "file_gone")

    existing = sorted(out_dir.glob("frame_*.jpg")) if out_dir.exists() else []
    if len(existing) < count:
        existing = [f.path for f in vid.extract_frames(src, out_dir, count=count)]

    root = storage.path("")
    return {
        "frames": [
            {
                "time_sec": round(int(Path(f).stem.split("_")[-1]) / 1000, 2),
                "key": str(Path(f).relative_to(root)),
            }
            for f in existing
        ]
    }


@router.get("/frame")
def get_frame(key: str, user: CurrentUser):
    """Serves a derived frame. The key must live inside the caller's own directory."""
    if not key.startswith(f"{user.id}/"):
        raise AppError("You do not have access to that file", 403, "forbidden")
    path = get_storage().path(key)
    if not path.exists() or path.suffix.lower() not in (".jpg", ".jpeg", ".png"):
        raise AppError("Frame not found", 404, "not_found")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})
