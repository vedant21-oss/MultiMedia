from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.processing.probe import ASPECT_RATIOS


class HighlightIn(BaseModel):
    keywords: list[str] = Field(default_factory=list)
    target_count: int = Field(default=5, ge=1, le=12)
    min_sec: float = Field(default=15.0, ge=3, le=180)
    max_sec: float = Field(default=60.0, ge=5, le=600)


class HighlightOut(BaseModel):
    start_sec: float
    end_sec: float
    title: str
    reason: str
    transcript_excerpt: str = ""
    suggested_platform: str = ""
    review_note: str = ""
    duration_sec: float = 0.0
    source: str = "live"


class HighlightsOut(BaseModel):
    clips: list[HighlightOut]
    mode: str
    note: str = ""


class ClipIn(BaseModel):
    start_sec: float = Field(ge=0)
    end_sec: float = Field(gt=0)
    aspect_ratio: str | None = Field(default=None, description=f"One of {list(ASPECT_RATIOS)}")
    burn_subtitles: bool = False
    title: str = Field(default="", max_length=200)

    @model_validator(mode="after")
    def check_span(self):
        if self.end_sec <= self.start_sec:
            raise ValueError("end_sec must be greater than start_sec")
        if self.end_sec - self.start_sec > 600:
            raise ValueError("Clips are limited to 10 minutes")
        if self.aspect_ratio and self.aspect_ratio not in ASPECT_RATIOS:
            raise ValueError(f"aspect_ratio must be one of {list(ASPECT_RATIOS)}")
        return self


class SubtitleIn(BaseModel):
    fmt: str = Field(default="srt", pattern="^(srt|vtt)$")
    line_width: int = Field(default=42, ge=20, le=80)
    max_chars: int = Field(default=84, ge=30, le=200)
    start_sec: float = Field(default=0.0, ge=0)


class SegmentsOut(BaseModel):
    duration_sec: float | None = None
    scenes: list[dict[str, Any]] = []
    transcript: list[dict[str, Any]] = []
    frames: list[dict[str, Any]] = []
    has_transcript: bool = False
    note: str = ""


class ThumbnailIn(BaseModel):
    headline: str = Field(default="", max_length=60)
    subtext: str = Field(default="", max_length=80)
    frame_time_sec: float | None = None
    template: str = Field(default="left-text")
    palette: list[str] = Field(default_factory=list)


class ThumbnailConceptOut(BaseModel):
    headline: str
    subtext: str = ""
    visual_direction: str = ""
    composition: str = "left-text"
    palette: list[str] = []
    rationale: str = ""
    image_prompt: str = ""
    best_frame_hint: str = ""


class ThumbnailsOut(BaseModel):
    concepts: list[ThumbnailConceptOut]
    frames: list[dict[str, Any]]
    mode: str
    image_generation: str
    note: str = ""
