from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy import func

from app.core.deps import CurrentUser, DbSession
from app.core.errors import NotFound
from app.core.rate_limit import ai_limiter
from app.models.chat import ChatMessage, Conversation
from app.models.project import Project
from app.schemas.common import Message
from app.schemas.generation import (
    ChatIn, ChatMessageOut, ChatOut, CitationOut, ConversationOut, SearchIn, SearchOut,
)
from app.services.chat import answer_question
from app.services.retrieval import search as semantic_search

router = APIRouter(tags=["chat & search"])


def _own_project(db, user, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.owner_id != user.id:
        raise NotFound("Project")
    return project


def _message_out(m: ChatMessage) -> ChatMessageOut:
    out = ChatMessageOut.model_validate(m)
    out.citations = [
        CitationOut(
            marker=c.marker, segment_id=c.segment_id, asset_id=c.asset_id,
            asset_name=c.asset_name, modality=c.modality, quote=c.quote,
            start_sec=c.start_sec, end_sec=c.end_sec, page_number=c.page_number,
            slide_number=c.slide_number, relevance=c.relevance,
            locator_label=(
                f"page {c.page_number}" if c.page_number is not None else
                f"slide {c.slide_number}" if c.slide_number is not None else
                f"{int(c.start_sec)//60:02d}:{int(c.start_sec)%60:02d}" if c.start_sec is not None
                else ""
            ),
        )
        for c in sorted(m.citations, key=lambda x: x.marker)
    ]
    return out


@router.post("/chat", response_model=ChatOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(ai_limiter)])
async def chat(payload: ChatIn, user: CurrentUser, db: DbSession):
    project = _own_project(db, user, payload.project_id)

    if payload.conversation_id:
        conversation = db.get(Conversation, payload.conversation_id)
        if conversation is None or conversation.owner_id != user.id:
            raise NotFound("Conversation")
    else:
        conversation = Conversation(
            owner_id=user.id, project_id=project.id,
            title=payload.message[:80], selected_asset_ids=payload.asset_ids,
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    if payload.asset_ids:
        conversation.selected_asset_ids = payload.asset_ids

    db.add(ChatMessage(conversation_id=conversation.id, role="user", content=payload.message))
    db.commit()

    scope = payload.asset_ids or list(conversation.selected_asset_ids or [])
    message, mode, follow_ups = await answer_question(
        db, user.id, project.id, payload.message,
        conversation=conversation, asset_ids=scope or None,
    )
    return ChatOut(
        conversation_id=conversation.id, message=_message_out(message),
        retrieval_mode=mode, follow_ups=follow_ups,
    )


@router.get("/projects/{project_id}/conversations", response_model=list[ConversationOut])
def list_conversations(project_id: str, user: CurrentUser, db: DbSession):
    _own_project(db, user, project_id)
    rows = (
        db.query(Conversation).filter(Conversation.project_id == project_id)
        .order_by(Conversation.updated_at.desc()).limit(50).all()
    )
    counts = dict(
        db.query(ChatMessage.conversation_id, func.count(ChatMessage.id))
        .filter(ChatMessage.conversation_id.in_([r.id for r in rows] or [""]))
        .group_by(ChatMessage.conversation_id).all()
    )
    out = []
    for row in rows:
        item = ConversationOut.model_validate(row)
        item.message_count = counts.get(row.id, 0)
        out.append(item)
    return out


@router.get("/conversations/{conversation_id}", response_model=list[ChatMessageOut])
def get_conversation(conversation_id: str, user: CurrentUser, db: DbSession):
    conversation = db.get(Conversation, conversation_id)
    if conversation is None or conversation.owner_id != user.id:
        raise NotFound("Conversation")
    return [_message_out(m) for m in conversation.messages]


@router.delete("/conversations/{conversation_id}", response_model=Message)
def delete_conversation(conversation_id: str, user: CurrentUser, db: DbSession):
    conversation = db.get(Conversation, conversation_id)
    if conversation is None or conversation.owner_id != user.id:
        raise NotFound("Conversation")
    db.delete(conversation)
    db.commit()
    return Message(detail="Conversation deleted")


@router.post("/search", response_model=SearchOut)
async def search(payload: SearchIn, user: CurrentUser, db: DbSession):
    """Semantic search across every modality in a project."""
    _own_project(db, user, payload.project_id)
    hits, mode = await semantic_search(
        db, payload.project_id, payload.query,
        asset_ids=payload.asset_ids or None, limit=payload.limit,
        kinds=payload.kinds or None,
    )
    return SearchOut(
        results=[CitationOut(**h.to_citation(i)) for i, h in enumerate(hits, start=1)],
        mode=mode, total=len(hits),
    )
