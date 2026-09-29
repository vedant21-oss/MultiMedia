"""FFmpeg/ffprobe wrappers. Every call is checked and errors are readable."""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

FFMPEG = shutil.which("ffmpeg")
FFPROBE = shutil.which("ffprobe")


class MediaToolError(RuntimeError):
    pass


def ffmpeg_available() -> bool:
    return bool(FFMPEG and FFPROBE)


def _run(cmd: list[str], timeout: int = 900) -> subprocess.CompletedProcess:
    log.debug("running: %s", " ".join(cmd[:8]))
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise MediaToolError(f"Media processing timed out after {timeout}s") from exc
    except FileNotFoundError as exc:
        raise MediaToolError(
            "FFmpeg is not installed. Install it with `brew install ffmpeg` "
            "(macOS) or `apt-get install ffmpeg` (Linux)."
        ) from exc
    if proc.returncode != 0:
        tail = (proc.stderr or "").strip().splitlines()[-4:]
        raise MediaToolError("FFmpeg failed: " + " | ".join(tail) if tail else "FFmpeg failed")
    return proc


def probe(path: Path) -> dict[str, Any]:
    """Container/stream metadata. Returns {} when the file is not media."""
    if not FFPROBE:
        raise MediaToolError("ffprobe is not installed")
    proc = _run(
        [FFPROBE, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        timeout=120,
    )
    try:
        return json.loads(proc.stdout or "{}")
    except json.JSONDecodeError:
        return {}


def media_info(path: Path) -> dict[str, Any]:
    """Normalised duration/dimensions/codecs, safe to store on the asset."""
    data = probe(path)
    fmt = data.get("format", {})
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)

    def _f(value, default=None):
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    info: dict[str, Any] = {
        "duration_sec": _f(fmt.get("duration")),
        "bitrate": fmt.get("bit_rate"),
        "format_name": fmt.get("format_name", ""),
        "has_audio": audio is not None,
        "has_video": video is not None,
    }
    if video:
        info.update(
            width=video.get("width"),
            height=video.get("height"),
            video_codec=video.get("codec_name", ""),
            fps=_eval_fraction(video.get("avg_frame_rate", "0/0")),
        )
    if audio:
        info.update(
            audio_codec=audio.get("codec_name", ""),
            sample_rate=audio.get("sample_rate", ""),
            channels=audio.get("channels"),
        )
    return info


def _eval_fraction(text: str) -> float | None:
    try:
        num, _, den = text.partition("/")
        return round(float(num) / float(den), 3) if float(den) else None
    except (ValueError, ZeroDivisionError):
        return None


def extract_audio(src: Path, dest: Path, sample_rate: int = 16000) -> Path:
    """Mono 16 kHz MP3 — small enough to upload, good enough to transcribe."""
    if not FFMPEG:
        raise MediaToolError("FFmpeg is not installed")
    dest.parent.mkdir(parents=True, exist_ok=True)
    _run([
        FFMPEG, "-y", "-i", str(src),
        "-vn", "-ac", "1", "-ar", str(sample_rate),
        "-b:a", "64k", "-f", "mp3", str(dest),
    ])
    return dest


def cut_clip(
    src: Path, dest: Path, start: float, end: float,
    aspect: str | None = None, subtitles: Path | None = None,
) -> Path:
    """Trim, optionally reframe to an aspect ratio, optionally burn in subtitles."""
    if not FFMPEG:
        raise MediaToolError("FFmpeg is not installed")
    if end <= start:
        raise MediaToolError("Clip end must be after its start")
    dest.parent.mkdir(parents=True, exist_ok=True)

    filters: list[str] = []
    if aspect and aspect in ASPECT_RATIOS:
        w, h = ASPECT_RATIOS[aspect]
        # Fill the frame, centre-crop the overflow - standard reframe for shorts
        filters.append(f"scale={w}:{h}:force_original_aspect_ratio=increase")
        filters.append(f"crop={w}:{h}")
    if subtitles:
        escaped = str(subtitles).replace("\\", "/").replace(":", r"\:").replace("'", r"\'")
        filters.append(
            f"subtitles='{escaped}':force_style='FontName=Helvetica,FontSize=20,"
            f"PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=2,MarginV=40'"
        )

    cmd = [FFMPEG, "-y", "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", str(src)]
    if filters:
        cmd += ["-vf", ",".join(filters)]
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k"]
    else:
        # No filtering needed: re-encode anyway so the cut lands on exact frames
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac"]
    cmd += ["-movflags", "+faststart", str(dest)]
    _run(cmd)
    return dest


ASPECT_RATIOS: dict[str, tuple[int, int]] = {
    "16:9": (1920, 1080),
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
    "4:5": (1080, 1350),
}
