"""Importing this package registers every table on Base.metadata."""
from app.models.chat import ChatMessage, Conversation, MessageCitation
from app.models.generation import ContentCitation, ContentVersion, GeneratedContent
from app.models.job import ProcessingJob
from app.models.media import ContentSegment, MediaAsset
from app.models.planner import AuditEvent, CalendarEntry, Notification, SocialConnection
from app.models.project import Folder, Project
from app.models.user import BrandProfile, User

__all__ = [
    "AuditEvent", "BrandProfile", "CalendarEntry", "ChatMessage", "ContentCitation",
    "ContentSegment", "ContentVersion", "Conversation", "Folder", "GeneratedContent",
    "MediaAsset", "MessageCitation", "Notification", "ProcessingJob", "Project",
    "SocialConnection", "User",
]
