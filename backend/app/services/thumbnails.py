"""Template thumbnail rendering.

The spec's fallback when no image-generation provider is configured: take a real
frame from the user's video and composite a headline over it. This produces a
genuinely usable thumbnail with zero external dependencies.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]

SIZES = {
    "youtube": (1280, 720),
    "instagram": (1080, 1080),
    "instagram_story": (1080, 1920),
    "tiktok": (1080, 1920),
    "x": (1200, 675),
    "linkedin": (1200, 627),
}


def _font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                continue
    return ImageFont.load_default(size)


def _fit_lines(draw, text: str, font, max_width: int) -> list[str]:
    words, lines, current = text.split(), [], ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=font) > max_width and current:
            lines.append(current)
            current = word
        else:
            current = trial
    if current:
        lines.append(current)
    return lines[:3]


def render(
    background: Path | None,
    dest: Path,
    *,
    headline: str,
    subtext: str = "",
    template: str = "left-text",
    size: tuple[int, int] = (1280, 720),
    palette: list[str] | None = None,
) -> Path:
    width, height = size
    accent = (palette or ["#7C3AED"])[0]
    dest.parent.mkdir(parents=True, exist_ok=True)

    if background and background.exists():
        base = Image.open(background).convert("RGB")
        # Cover-fit the frame, centre-cropping the overflow
        scale = max(width / base.width, height / base.height)
        base = base.resize((int(base.width * scale) + 1, int(base.height * scale) + 1), Image.LANCZOS)
        left, top = (base.width - width) // 2, (base.height - height) // 2
        base = base.crop((left, top, left + width, top + height))
    else:
        base = Image.new("RGB", size, (14, 12, 28))

    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Scrim so text stays legible over any frame
    if template == "left-text":
        draw.rectangle([0, 0, int(width * 0.62), height], fill=(8, 6, 20, 205))
        text_x, text_w, anchor = int(width * 0.06), int(width * 0.50), "la"
    elif template == "right-text":
        draw.rectangle([int(width * 0.38), 0, width, height], fill=(8, 6, 20, 205))
        text_x, text_w, anchor = int(width * 0.44), int(width * 0.50), "la"
    elif template == "bottom-bar":
        draw.rectangle([0, int(height * 0.58), width, height], fill=(8, 6, 20, 215))
        text_x, text_w, anchor = int(width * 0.06), int(width * 0.88), "la"
    else:  # centered
        draw.rectangle([0, 0, width, height], fill=(8, 6, 20, 170))
        text_x, text_w, anchor = width // 2, int(width * 0.84), "ma"

    headline = (headline or "").strip().upper()
    font_size = int(height * 0.13)
    font = _font(font_size)
    lines = _fit_lines(draw, headline, font, text_w)
    while len(lines) > 2 and font_size > int(height * 0.07):
        font_size = int(font_size * 0.88)
        font = _font(font_size)
        lines = _fit_lines(draw, headline, font, text_w)

    line_height = int(font_size * 1.12)
    block_height = line_height * len(lines) + (int(height * 0.07) if subtext else 0)
    y = (height - block_height) // 2 if template != "bottom-bar" else int(height * 0.63)

    for line in lines:
        # Soft shadow for contrast on bright frames
        draw.text((text_x + 3, y + 3), line, font=font, fill=(0, 0, 0, 170), anchor=anchor)
        draw.text((text_x, y), line, font=font, fill=(255, 255, 255, 255), anchor=anchor)
        y += line_height

    if subtext:
        sub_font = _font(int(font_size * 0.42))
        draw.text((text_x, y + int(height * 0.015)), subtext.strip(), font=sub_font,
                  fill=_hex(accent) + (255,), anchor=anchor)

    # Accent rule
    if template in ("left-text", "right-text"):
        bar_x = text_x if template == "left-text" else text_x
        draw.rectangle(
            [bar_x, int(height * 0.12), bar_x + int(width * 0.06), int(height * 0.135)],
            fill=_hex(accent) + (255,),
        )

    composed = Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB")
    composed = composed.filter(ImageFilter.SHARPEN)
    composed.save(dest, "JPEG", quality=90)
    return dest


def _hex(value: str) -> tuple[int, int, int]:
    text = (value or "").lstrip("#")
    if len(text) != 6:
        return (124, 58, 237)
    try:
        return tuple(int(text[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]
    except ValueError:
        return (124, 58, 237)
