"""String constants used as column values. Kept as plain strings rather than
native PG enums so that adding a value never requires a schema migration."""
from __future__ import annotations


class Modality:
    VIDEO = "video"
    AUDIO = "audio"
    IMAGE = "image"
    DOCUMENT = "document"
    PRESENTATION = "presentation"
    TEXT = "text"
    SUBTITLE = "subtitle"
    OTHER = "other"

    ALL = (VIDEO, AUDIO, IMAGE, DOCUMENT, PRESENTATION, TEXT, SUBTITLE, OTHER)


class JobStatus:
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"

    ACTIVE = (QUEUED, RUNNING)


class AssetStatus:
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class SegmentKind:
    """The unit of provenance. Everything retrievable is one of these."""

    TRANSCRIPT = "transcript"        # start_sec / end_sec
    DOCUMENT_PAGE = "document_page"  # page_number
    SLIDE = "slide"                  # slide_number
    VIDEO_SCENE = "video_scene"      # start_sec + frame image
    IMAGE_DESCRIPTION = "image_description"
    OCR = "ocr"
    TABLE = "table"
    SUMMARY = "summary"


class ContentType:
    CAPTION = "caption"
    YOUTUBE_TITLE = "youtube_title"
    YOUTUBE_DESCRIPTION = "youtube_description"
    VIDEO_SCRIPT = "video_script"
    SHORT_SCRIPT = "short_script"
    INSTAGRAM_POST = "instagram_post"
    LINKEDIN_POST = "linkedin_post"
    TIKTOK_CAPTION = "tiktok_caption"
    X_POST = "x_post"
    FACEBOOK_POST = "facebook_post"
    BLOG_ARTICLE = "blog_article"
    NEWSLETTER = "newsletter"
    SHOW_NOTES = "show_notes"
    STUDY_NOTES = "study_notes"
    QUIZ = "quiz"
    FLASHCARDS = "flashcards"
    CONTENT_CALENDAR = "content_calendar"
    VIDEO_SUMMARY = "video_summary"
    PRESS_RELEASE = "press_release"
    THUMBNAIL_CONCEPT = "thumbnail_concept"

    ALL = (
        CAPTION, YOUTUBE_TITLE, YOUTUBE_DESCRIPTION, VIDEO_SCRIPT, SHORT_SCRIPT,
        INSTAGRAM_POST, LINKEDIN_POST, TIKTOK_CAPTION, X_POST, FACEBOOK_POST,
        BLOG_ARTICLE, NEWSLETTER, SHOW_NOTES, STUDY_NOTES, QUIZ, FLASHCARDS,
        CONTENT_CALENDAR, VIDEO_SUMMARY, PRESS_RELEASE, THUMBNAIL_CONCEPT,
    )


class Platform:
    YOUTUBE = "youtube"
    INSTAGRAM = "instagram"
    LINKEDIN = "linkedin"
    TIKTOK = "tiktok"
    X = "x"
    FACEBOOK = "facebook"
    BLOG = "blog"
    NEWSLETTER = "newsletter"
    NONE = "none"

    ALL = (YOUTUBE, INSTAGRAM, LINKEDIN, TIKTOK, X, FACEBOOK, BLOG, NEWSLETTER, NONE)


class Tone:
    PROFESSIONAL = "professional"
    EDUCATIONAL = "educational"
    FRIENDLY = "friendly"
    CASUAL = "casual"
    ENTERTAINING = "entertaining"
    INSPIRATIONAL = "inspirational"
    TECHNICAL = "technical"
    CUSTOM = "custom"

    ALL = (PROFESSIONAL, EDUCATIONAL, FRIENDLY, CASUAL, ENTERTAINING, INSPIRATIONAL, TECHNICAL, CUSTOM)


class DraftStatus:
    DRAFT = "draft"
    APPROVED = "approved"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class GenerationSource:
    """Whether a result came from a real provider or clearly-labelled demo mode."""

    LIVE = "live"
    DEMO = "demo"
