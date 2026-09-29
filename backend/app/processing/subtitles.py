"""SRT and VTT generation from timed transcript segments."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class Cue:
    start: float
    end: float
    text: str
    speaker: str = ""


def _clock(seconds: float, comma: bool) -> str:
    seconds = max(0.0, float(seconds))
    hours, rem = divmod(int(seconds), 3600)
    minutes, secs = divmod(rem, 60)
    millis = int(round((seconds - int(seconds)) * 1000))
    if millis == 1000:  # rounding can tip over
        millis, secs = 0, secs + 1
    sep = "," if comma else "."
    return f"{hours:02d}:{minutes:02d}:{secs:02d}{sep}{millis:03d}"


def wrap(text: str, width: int = 42, max_lines: int = 2) -> str:
    """Subtitles are unreadable past ~42 characters per line."""
    words, lines, current = text.split(), [], ""
    for word in words:
        if len(current) + len(word) + 1 > width and current:
            lines.append(current)
            current = word
        else:
            current = f"{current} {word}".strip()
    if current:
        lines.append(current)
    if len(lines) > max_lines:
        head = lines[: max_lines - 1]
        head.append(" ".join(lines[max_lines - 1 :])[: width * 2])
        lines = head
    return "\n".join(lines)


def to_srt(cues: list[Cue], *, offset: float = 0.0, line_width: int = 42) -> str:
    out: list[str] = []
    for i, cue in enumerate(cues, start=1):
        start, end = cue.start - offset, cue.end - offset
        if end <= 0:
            continue
        body = wrap(cue.text.strip(), line_width)
        if cue.speaker:
            body = f"[{cue.speaker}] {body}"
        out.append(
            f"{i}\n{_clock(max(0.0, start), True)} --> {_clock(end, True)}\n{body}\n"
        )
    return "\n".join(out)


def to_vtt(cues: list[Cue], *, offset: float = 0.0, line_width: int = 42) -> str:
    out = ["WEBVTT", ""]
    for cue in cues:
        start, end = cue.start - offset, cue.end - offset
        if end <= 0:
            continue
        body = wrap(cue.text.strip(), line_width)
        if cue.speaker:
            body = f"<v {cue.speaker}>{body}"
        out.append(f"{_clock(max(0.0, start), False)} --> {_clock(end, False)}\n{body}\n")
    return "\n".join(out)


def split_long_cues(cues: list[Cue], max_chars: int = 84, max_sec: float = 6.0) -> list[Cue]:
    """Break transcript windows into readable subtitle-length cues."""
    out: list[Cue] = []
    for cue in cues:
        text = cue.text.strip()
        span = max(0.1, cue.end - cue.start)
        if len(text) <= max_chars and span <= max_sec:
            out.append(cue)
            continue

        words = text.split()
        if not words:
            continue
        parts = max(1, max(len(text) // max_chars + 1, int(span // max_sec) + 1))
        per = max(1, len(words) // parts)
        chunks = [" ".join(words[i : i + per]) for i in range(0, len(words), per)]
        slice_len = span / len(chunks)
        for i, chunk in enumerate(chunks):
            out.append(
                Cue(
                    start=cue.start + i * slice_len,
                    end=cue.start + (i + 1) * slice_len,
                    text=chunk,
                    speaker=cue.speaker,
                )
            )
    return out
