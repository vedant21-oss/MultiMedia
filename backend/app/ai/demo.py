"""Demo mode: what CreatorAI does when no AI provider key is configured.

Design rule: demo mode never invents facts. Text extraction (PyMuPDF, OCR,
python-docx/pptx), frame extraction and scene detection all run for real
because they need no API key. Only the *generative* layer is replaced, and it
is replaced with EXTRACTIVE output assembled from the user's own source text.

Everything produced here is tagged source="demo" and the UI badges it, so demo
output can never be mistaken for a real model response.
"""
from __future__ import annotations

import hashlib
import math
import re
from collections import Counter
from typing import Any

from app.ai.base import AIResult
from app.core.config import settings

DEMO_NOTICE = (
    "Demo mode — assembled directly from your uploaded source text, with no AI model. "
    "Add GEMINI_API_KEY to backend/.env for real generation."
)

_STOPWORDS = frozenset("""
a an and are as at be been but by can could did do does for from had has have he her his how i if
in into is it its me my no not of on or our out over said she should so than that the their them
then there these they this to too us was we were what when where which who why will with would you
your it's i'm we're don't just like really very
""".split())

_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
_WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z'-]+")


# --------------------------------------------------------------------------- #
# Deterministic lexical embeddings
# --------------------------------------------------------------------------- #

def demo_embed(texts: list[str]) -> tuple[list[list[float]], str]:
    """Hashed bag-of-words vectors, L2-normalised.

    This is lexical, not semantic — it matches on shared vocabulary rather than
    meaning. Search still works well enough to be useful and is fully offline;
    it is clearly reported as "lexical" in the API response.
    """
    dims = settings.EMBED_DIMENSIONS
    vectors: list[list[float]] = []

    for text in texts:
        vec = [0.0] * dims
        words = [w.lower() for w in _WORD_RE.findall(text or "")]
        content = [w for w in words if w not in _STOPWORDS and len(w) > 2]
        if not content:
            vectors.append(vec)
            continue
        counts = Counter(content)
        for word, count in counts.items():
            # Two hashes per word reduces collision damage in a 768-dim space.
            for salt in (b"a", b"b"):
                digest = hashlib.blake2b(word.encode("utf-8") + salt, digest_size=8).digest()
                idx = int.from_bytes(digest, "big") % dims
                vec[idx] += 1.0 + math.log(count)
        norm = math.sqrt(sum(v * v for v in vec))
        vectors.append([v / norm for v in vec] if norm else vec)

    return vectors, "demo-lexical-hashing"


# --------------------------------------------------------------------------- #
# Extractive helpers
# --------------------------------------------------------------------------- #

def _sentences(text: str, limit: int = 400) -> list[str]:
    clean = re.sub(r"\s+", " ", text or "").strip()
    return [s.strip() for s in _SENTENCE_RE.split(clean) if len(s.strip()) > 25][:limit]


def keywords(text: str, top: int = 12) -> list[str]:
    words = [w.lower() for w in _WORD_RE.findall(text or "")]
    counts = Counter(w for w in words if w not in _STOPWORDS and len(w) > 3)
    return [w for w, _ in counts.most_common(top)]


def rank_sentences(text: str, top: int = 6) -> list[str]:
    """Classic frequency-based extractive summarisation."""
    sents = _sentences(text)
    if not sents:
        return []
    freq = Counter(
        w.lower() for w in _WORD_RE.findall(text) if w.lower() not in _STOPWORDS and len(w) > 3
    )
    if not freq:
        return sents[:top]
    peak = max(freq.values())
    scored = []
    for i, sentence in enumerate(sents):
        words = [w.lower() for w in _WORD_RE.findall(sentence)]
        if not words:
            continue
        score = sum(freq.get(w, 0) / peak for w in words) / math.sqrt(len(words))
        # Mild preference for earlier sentences, which usually carry the thesis
        score *= 1.0 + max(0.0, (len(sents) - i) / (len(sents) * 4))
        scored.append((score, i, sentence))
    scored.sort(reverse=True)
    picked = sorted(scored[:top], key=lambda t: t[1])
    return [s for _, _, s in picked]


def demo_summary(text: str, title: str = "") -> dict[str, Any]:
    points = rank_sentences(text, 5)
    kws = keywords(text, 10)
    return {
        "title": title or (points[0][:70] if points else "Untitled source"),
        "summary": " ".join(points[:3]) if points else "No extractable text in this source.",
        "key_points": points,
        "topics": kws[:6],
        "keywords": kws,
        "demo_notice": DEMO_NOTICE,
    }


# --------------------------------------------------------------------------- #
# Generation
# --------------------------------------------------------------------------- #

_PLATFORM_SHAPE = {
    "instagram": ("", 2200, 8),
    "tiktok": ("", 2200, 6),
    "x": ("", 280, 3),
    "linkedin": ("", 3000, 5),
    "facebook": ("", 2000, 4),
    "youtube": ("", 5000, 8),
}


def demo_generate(content_type: str, source_text: str, params: dict[str, Any]) -> AIResult:
    """Build a usable draft out of the user's own words, clearly marked as demo."""
    platform = (params.get("platform") or "none").lower()
    points = rank_sentences(source_text, 8)
    kws = keywords(source_text, 14)
    hashtags = " ".join("#" + re.sub(r"[^a-z0-9]", "", k) for k in kws[:6] if len(k) > 3)

    if not points:
        body = (
            "There is no extractable text in the selected sources yet.\n\n"
            "Upload a document, image or text file — those are read without an AI key. "
            "Audio and video transcription needs GEMINI_API_KEY."
        )
        return AIResult(data={"title": "Nothing to work with", "body": body}, source="demo")

    if content_type in ("caption", "instagram_post", "tiktok_caption", "facebook_post", "x_post"):
        _, limit, tag_count = _PLATFORM_SHAPE.get(platform, ("", 2200, 6))
        hook = points[0]
        body = f"{hook}\n\n" + "\n\n".join(f"• {p}" for p in points[1:4])
        tags = " ".join(("#" + re.sub(r"[^a-z0-9]", "", k)) for k in kws[:tag_count] if len(k) > 3)
        body = f"{body}\n\n{tags}"[:limit]
        title = hook[:80]

    elif content_type == "linkedin_post":
        body = (
            f"{points[0]}\n\n"
            + "\n\n".join(points[1:5])
            + f"\n\nWhat's your experience with this?\n\n{hashtags}"
        )
        title = points[0][:80]

    elif content_type in ("youtube_title",):
        body = "\n".join(p[:90] for p in points[:5])
        title = "Title options"

    elif content_type == "youtube_description":
        body = (
            " ".join(points[:3])
            + "\n\nIn this video:\n"
            + "\n".join(f"- {p[:90]}" for p in points[:6])
            + f"\n\n{hashtags}"
        )
        title = points[0][:80]

    elif content_type in ("blog_article", "newsletter", "press_release"):
        sections = [points[i : i + 2] for i in range(0, min(len(points), 8), 2)]
        parts = [f"## {kws[i].title() if i < len(kws) else 'Key points'}\n\n" + " ".join(s)
                 for i, s in enumerate(sections)]
        body = f"{points[0]}\n\n" + "\n\n".join(parts)
        title = points[0][:90]

    elif content_type in ("video_script", "short_script"):
        beats = points[:6]
        lines = [f"[HOOK]\n{beats[0]}", ""]
        for i, beat in enumerate(beats[1:], start=1):
            lines += [f"[BEAT {i}]", beat, ""]
        lines += ["[CTA]", "Follow for more."]
        body = "\n".join(lines)
        title = "Script draft"

    elif content_type in ("study_notes", "show_notes"):
        body = "\n".join(f"- {p}" for p in points)
        title = "Notes"

    elif content_type == "quiz":
        questions = [
            {
                "question": f"According to the source, what is described here: \"{p[:110]}…\"?",
                "options": ["See the cited source text", "Not stated", "Partially stated", "Contradicted"],
                "answer_index": 0,
                "explanation": p,
            }
            for p in points[:5]
        ]
        return AIResult(
            data={"title": "Quiz (demo)", "body": DEMO_NOTICE, "structured": {"questions": questions}},
            source="demo",
        )

    elif content_type == "flashcards":
        cards = [{"front": (k.title()), "back": next((p for p in points if k in p.lower()), points[0])}
                 for k in kws[:8]]
        return AIResult(
            data={"title": "Flashcards (demo)", "body": DEMO_NOTICE, "structured": {"cards": cards}},
            source="demo",
        )

    else:
        body = "\n\n".join(points[:6])
        title = points[0][:80]

    return AIResult(data={"title": title, "body": body, "demo_notice": DEMO_NOTICE}, source="demo")


def demo_answer(question: str, segments: list[dict[str, Any]]) -> dict[str, Any]:
    """Extractive, citation-backed answer. Quotes sources; never paraphrases into new claims."""
    if not segments:
        return {
            "answer": (
                "I could not find anything in the selected sources that addresses that question.\n\n"
                f"_{DEMO_NOTICE}_"
            ),
            "confidence": "insufficient_evidence",
            "cited_segment_ids": [],
            "follow_ups": [],
        }

    q_words = {w.lower() for w in _WORD_RE.findall(question) if w.lower() not in _STOPWORDS}
    lines, cited = [], []
    for i, seg in enumerate(segments[:5], start=1):
        text = re.sub(r"\s+", " ", seg.get("text", "")).strip()
        best = max(
            _sentences(text) or [text],
            key=lambda s: len(q_words & {w.lower() for w in _WORD_RE.findall(s)}),
            default=text,
        )
        lines.append(f"{best[:400]} [[{i}]]")
        cited.append(seg["id"])

    return {
        "answer": (
            "Here is what the selected sources actually say, quoted directly:\n\n"
            + "\n\n".join(f"- {line}" for line in lines)
            + f"\n\n_{DEMO_NOTICE}_"
        ),
        "confidence": "medium",
        "cited_segment_ids": cited,
        "follow_ups": [],
    }
