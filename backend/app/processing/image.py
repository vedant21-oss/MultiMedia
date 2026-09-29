"""Image metadata and OCR. Runs without an AI key."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


def image_info(path: Path) -> dict[str, Any]:
    from PIL import Image

    with Image.open(path) as img:
        info: dict[str, Any] = {
            "width": img.width,
            "height": img.height,
            "mode": img.mode,
            "format": img.format or "",
        }
        exif = getattr(img, "getexif", lambda: None)()
        if exif:
            # Only non-identifying fields; EXIF GPS is deliberately not stored.
            info["exif"] = {
                "make": str(exif.get(271, "")),
                "model": str(exif.get(272, "")),
                "datetime": str(exif.get(306, "")),
            }
    return info


def ocr_image(path: Path) -> tuple[str, float]:
    """-> (text, mean_confidence 0..1). Returns ('', 0.0) if tesseract is missing."""
    try:
        import pytesseract
        from PIL import Image

        with Image.open(path) as img:
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)

        words, confidences = [], []
        for text, conf in zip(data.get("text", []), data.get("conf", []), strict=False):
            text = (text or "").strip()
            try:
                conf_val = float(conf)
            except (TypeError, ValueError):
                continue
            if text and conf_val >= 0:
                words.append(text)
                confidences.append(conf_val)

        if not words:
            return "", 0.0
        return " ".join(words), round(sum(confidences) / len(confidences) / 100.0, 3)
    except Exception as exc:  # noqa: BLE001 - OCR is optional
        log.info("OCR unavailable: %s", exc)
        return "", 0.0


def make_thumbnail(src: Path, dest: Path, size: tuple[int, int] = (640, 360)) -> Path:
    from PIL import Image, ImageOps

    dest.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img.thumbnail(size, Image.LANCZOS)
        img.save(dest, "JPEG", quality=82)
    return dest
