"""RAG: retrieve project segments, answer strictly from them, cite everything."""
from __future__ import annotations

import logging
import time

from sqlalchemy.orm import Session

from app.ai import registry
from app.ai.demo import demo_answer
from app.models.chat import ChatMessage, Conversation, MessageCitation
from app.prompts.templates import RAG_ANSWER, fence
from app.services.retrieval import Hit, build_evidence_block, search

log = logging.getLogger(__name__)


async def answer_question(
    db: Session, user_id: str, project_id: str, question: str,
    *, conversation: Conversation, asset_ids: list[str] | None = None,
) -> tuple[ChatMessage, str, list[str]]:
    started = time.monotonic()

    hits, retrieval_mode = await search(
        db, project_id, question, asset_ids=asset_ids, limit=14
    )

    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(6).all()
    )[::-1]

    if not hits:
        content = (
            "I could not find anything in the selected sources that addresses that.\n\n"
            "Try selecting different sources, or check that your uploads finished processing."
        )
        message = _persist(db, conversation, content, "insufficient_evidence", registry.mode(), [], started)
        return message, retrieval_mode, []

    if registry.is_live():
        convo = "\n".join(f"{m.role}: {m.content[:400]}" for m in history)
        prompt = "\n".join([
            f"QUESTION: {question}",
            f"\nEARLIER IN THIS CONVERSATION:\n{convo}" if convo else "",
            "\nRETRIEVED SOURCE SEGMENTS:",
            fence(build_evidence_block(hits)),
            "\nAnswer using only these segments. Cite inline as [[n]].",
        ])
        result = await registry.run_template(
            RAG_ANSWER, [{"text": prompt}],
            demo_fallback=lambda: _demo_result(question, hits),
        )
        data = result.data
        source = result.source
    else:
        data = demo_answer(question, [{"id": h.segment.id, "text": h.segment.text} for h in hits])
        source = "demo"

    cited_ids = set(data.get("cited_segment_ids") or [])
    # Always attach at least the strongest evidence, even if the model forgot to list ids.
    used = [h for h in hits if h.segment.id in cited_ids] or hits[:4]

    message = _persist(
        db, conversation, str(data.get("answer") or ""),
        str(data.get("confidence") or "medium"), source, used, started,
    )
    return message, retrieval_mode, [str(f) for f in (data.get("follow_ups") or [])][:3]


def _demo_result(question: str, hits: list[Hit]):
    from app.ai.base import AIResult

    return AIResult(
        data=demo_answer(question, [{"id": h.segment.id, "text": h.segment.text} for h in hits]),
        source="demo",
    )


def _persist(db, conversation, content, confidence, source, hits: list[Hit], started) -> ChatMessage:
    message = ChatMessage(
        conversation_id=conversation.id, role="assistant", content=content,
        confidence=confidence, generation_source=source,
        latency_ms=int((time.monotonic() - started) * 1000),
    )
    db.add(message)
    db.flush()

    for marker, hit in enumerate(hits, start=1):
        seg, asset = hit.segment, hit.asset
        db.add(MessageCitation(
            message_id=message.id, segment_id=seg.id, asset_id=asset.id, marker=marker,
            asset_name=asset.original_filename, modality=asset.modality,
            quote=seg.text[:600], start_sec=seg.start_sec, end_sec=seg.end_sec,
            page_number=seg.page_number, slide_number=seg.slide_number,
            relevance=round(hit.score, 4),
        ))
    db.commit()
    db.refresh(message)
    return message
