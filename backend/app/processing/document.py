"""Document text extraction with page/slide provenance.

All of this runs without any AI key, which is what makes demo mode genuinely
useful rather than a stub.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

# A page with less text than this is probably a scan, so try OCR.
OCR_TRIGGER_CHARS = 60


@dataclass(slots=True)
class PageBlock:
    """One page, slide, or logical chunk, with the locator the UI cites."""

    index: int               # 1-based
    text: str
    kind: str = "document_page"
    title: str = ""
    tables: list[list[list[str]]] = field(default_factory=list)
    used_ocr: bool = False
    notes: str = ""


def extract(path: Path, mime_type: str) -> tuple[list[PageBlock], dict[str, Any]]:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return extract_pdf(path)
    if suffix == ".docx":
        return extract_docx(path)
    if suffix == ".pptx":
        return extract_pptx(path)
    if suffix in (".txt", ".md", ".csv", ".json", ".srt", ".vtt"):
        return extract_text_file(path)
    raise ValueError(f"No document extractor for {suffix}")


# --------------------------------------------------------------------------- #
# PDF
# --------------------------------------------------------------------------- #

def extract_pdf(path: Path) -> tuple[list[PageBlock], dict[str, Any]]:
    import fitz  # PyMuPDF

    blocks: list[PageBlock] = []
    ocr_pages = 0

    with fitz.open(path) as doc:
        meta = {
            "page_count": doc.page_count,
            "pdf_title": (doc.metadata or {}).get("title", ""),
            "pdf_author": (doc.metadata or {}).get("author", ""),
            "is_encrypted": doc.is_encrypted,
        }

        for i, page in enumerate(doc, start=1):
            text = (page.get_text("text") or "").strip()
            used_ocr = False

            if len(text) < OCR_TRIGGER_CHARS:
                ocr_text = _ocr_pdf_page(page)
                if len(ocr_text) > len(text):
                    text, used_ocr = ocr_text, True
                    ocr_pages += 1

            tables: list[list[list[str]]] = []
            try:
                for table in page.find_tables().tables:
                    rows = [[(c or "").strip() for c in row] for row in table.extract()]
                    if rows:
                        tables.append(rows)
            except (AttributeError, RuntimeError, ValueError):
                pass  # table finding is best-effort

            if text or tables:
                blocks.append(
                    PageBlock(index=i, text=text, kind="document_page", used_ocr=used_ocr, tables=tables)
                )

    meta["ocr_pages"] = ocr_pages
    meta["is_scanned"] = ocr_pages > 0 and ocr_pages >= meta["page_count"] / 2
    return blocks, meta


def _ocr_pdf_page(page) -> str:
    """Rasterise a page and OCR it. Returns '' when tesseract is unavailable."""
    try:
        import io

        import pytesseract
        from PIL import Image

        pix = page.get_pixmap(dpi=200)
        image = Image.open(io.BytesIO(pix.tobytes("png")))
        return (pytesseract.image_to_string(image) or "").strip()
    except Exception as exc:  # noqa: BLE001 - OCR is optional, never fatal
        log.debug("PDF OCR unavailable for page: %s", exc)
        return ""


# --------------------------------------------------------------------------- #
# DOCX / PPTX / plain text
# --------------------------------------------------------------------------- #

def extract_docx(path: Path) -> tuple[list[PageBlock], dict[str, Any]]:
    import docx

    document = docx.Document(str(path))
    chunks: list[str] = []
    headings: list[str] = []

    for para in document.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        style = (para.style.name or "").lower() if para.style else ""
        if style.startswith("heading"):
            headings.append(text)
            chunks.append(f"\n## {text}")
        else:
            chunks.append(text)

    tables: list[list[list[str]]] = []
    for table in document.tables:
        rows = [[cell.text.strip() for cell in row.cells] for row in table.rows]
        if rows:
            tables.append(rows)
            chunks.append("\n" + "\n".join(" | ".join(r) for r in rows))

    body = "\n".join(chunks).strip()
    # Word has no fixed pages; chunk at ~3500 chars on paragraph boundaries.
    blocks = [
        PageBlock(index=i + 1, text=part, kind="document_page")
        for i, part in enumerate(_chunk(body, 3500))
    ]
    return blocks, {"page_count": len(blocks), "headings": headings[:40], "table_count": len(tables)}


def extract_pptx(path: Path) -> tuple[list[PageBlock], dict[str, Any]]:
    from pptx import Presentation

    prs = Presentation(str(path))
    blocks: list[PageBlock] = []

    for i, slide in enumerate(prs.slides, start=1):
        lines: list[str] = []
        title = ""
        for shape in slide.shapes:
            if shape.has_text_frame:
                text = shape.text_frame.text.strip()
                if not text:
                    continue
                if not title and shape == slide.shapes.title:
                    title = text
                lines.append(text)
            if getattr(shape, "has_table", False):
                rows = [[c.text.strip() for c in row.cells] for row in shape.table.rows]
                lines.append("\n".join(" | ".join(r) for r in rows))

        notes = ""
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
            notes = slide.notes_slide.notes_text_frame.text.strip()

        body = "\n".join(lines).strip()
        if body or notes:
            blocks.append(
                PageBlock(index=i, text=body, kind="slide", title=title or f"Slide {i}", notes=notes)
            )

    return blocks, {"page_count": len(prs.slides), "slide_count": len(prs.slides)}


def extract_text_file(path: Path) -> tuple[list[PageBlock], dict[str, Any]]:
    raw = path.read_text(encoding="utf-8", errors="replace")
    blocks = [
        PageBlock(index=i + 1, text=part, kind="document_page")
        for i, part in enumerate(_chunk(raw, 3500))
    ]
    return blocks, {"page_count": len(blocks), "char_count": len(raw)}


def _chunk(text: str, size: int) -> list[str]:
    """Split on paragraph boundaries, never mid-sentence."""
    if not text.strip():
        return []
    paragraphs = text.split("\n")
    out, buf = [], ""
    for para in paragraphs:
        if len(buf) + len(para) + 1 > size and buf:
            out.append(buf.strip())
            buf = ""
        buf += para + "\n"
    if buf.strip():
        out.append(buf.strip())
    return out
