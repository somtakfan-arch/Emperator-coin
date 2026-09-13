"""🖼 Render collectible items as real trading-card images (PIL).

Defensive: if PIL or fonts are missing, render_card returns None and callers
fall back to text. Uses DejaVu (Cyrillic) for text and Noto Color Emoji for
the artwork when available, otherwise a rarity emblem.
"""

from __future__ import annotations

import glob
import io

_RARITY_RGB = {
    "common":    (150, 160, 172),
    "rare":      (56, 138, 255),
    "epic":      (176, 84, 232),
    "legendary": (242, 160, 32),
    "mythic":    (236, 52, 92),
}

_DEJAVU_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
]
_EMOJI_CANDIDATES = [
    "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
    "/usr/share/fonts/noto/NotoColorEmoji.ttf",
    "/usr/share/fonts/google-noto-emoji/NotoColorEmoji.ttf",
]

_dejavu_path = None
_emoji_path = None
_resolved = False


def _resolve_fonts():
    global _dejavu_path, _emoji_path, _resolved
    if _resolved:
        return
    _resolved = True
    for p in _DEJAVU_CANDIDATES:
        try:
            open(p, "rb").close()
            _dejavu_path = p
            break
        except Exception:
            continue
    if _dejavu_path is None:
        hits = glob.glob("/usr/share/fonts/**/DejaVuSans*.ttf", recursive=True)
        _dejavu_path = hits[0] if hits else None
    for p in _EMOJI_CANDIDATES:
        try:
            open(p, "rb").close()
            _emoji_path = p
            break
        except Exception:
            continue
    if _emoji_path is None:
        hits = glob.glob("/usr/share/fonts/**/*Emoji*.ttf", recursive=True)
        _emoji_path = hits[0] if hits else None


def _font(size: int):
    from PIL import ImageFont
    _resolve_fonts()
    if _dejavu_path:
        try:
            return ImageFont.truetype(_dejavu_path, size)
        except Exception:
            pass
    try:
        return ImageFont.load_default(size)
    except Exception:
        return ImageFont.load_default()


def _emoji_image(ch: str, px: int):
    """Render a color emoji to an RGBA image of size px, or None."""
    from PIL import Image, ImageDraw, ImageFont
    _resolve_fonts()
    if not _emoji_path:
        return None
    try:
        f = ImageFont.truetype(_emoji_path, 109)  # Noto color emoji is 109px only
        tmp = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
        d = ImageDraw.Draw(tmp)
        d.text((80, 80), ch, font=f, embedded_color=True, anchor="mm")
        return tmp.resize((px, px), Image.LANCZOS)
    except Exception:
        return None


def _wrap(draw, text, font, max_w):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [text]


def render_card(item: dict):
    """item: {name, emoji, rarity, series, serial, max_supply, kind, level}.
    Returns a BytesIO PNG or None."""
    try:
        from PIL import Image, ImageDraw
    except Exception:
        return None
    try:
        W, H = 520, 720
        rc = _RARITY_RGB.get(item.get("rarity"), _RARITY_RGB["common"])
        dark = tuple(int(c * 0.22) + 12 for c in rc)
        img = Image.new("RGB", (W, H), (18, 20, 26))
        d = ImageDraw.Draw(img)
        # outer frame
        d.rounded_rectangle([6, 6, W - 6, H - 6], radius=28, outline=rc, width=10)
        # top ribbon (series)
        d.rounded_rectangle([22, 22, W - 22, 92], radius=16, fill=rc)
        d.text((W / 2, 57), item.get("series", ""), font=_font(30), fill=(18, 18, 22), anchor="mm")
        # art panel
        ax0, ay0, ax1, ay1 = 34, 112, W - 34, H - 232
        d.rounded_rectangle([ax0, ay0, ax1, ay1], radius=20, fill=dark)
        cx, cy = (ax0 + ax1) // 2, (ay0 + ay1) // 2
        em = _emoji_image(item.get("emoji", ""), 300)
        if em is not None:
            img.paste(em, (cx - 150, cy - 150), em)
        else:
            # emblem fallback: rarity disc + first letter
            r = 130
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=rc)
            letter = (item.get("name") or "?").strip()[:1].upper()
            d.text((cx, cy), letter, font=_font(180), fill=(20, 20, 24), anchor="mm")
        # name (wrapped)
        nf = _font(40)
        lines = _wrap(d, item.get("name", ""), nf, W - 80)
        ny = H - 208
        for ln in lines[:2]:
            d.text((W / 2, ny), ln, font=nf, fill=(245, 245, 250), anchor="mm")
            ny += 46
        # rarity label
        rname = {"common": "ОБЫЧНАЯ", "rare": "РЕДКАЯ", "epic": "ЭПИЧЕСКАЯ",
                 "legendary": "ЛЕГЕНДАРНАЯ", "mythic": "МИФИЧЕСКАЯ"}.get(item.get("rarity"), "")
        d.text((W / 2, H - 108), rname, font=_font(28), fill=rc, anchor="mm")
        # serial + optional pet level
        supply = item.get("max_supply", 0)
        serial = f"#{item.get('serial', 0)}" + (f" / {supply}" if supply and supply > 0 else "")
        if item.get("kind") == "pet" and item.get("level"):
            serial += f"   🐾 ур.{item['level']}"
        d.text((W / 2, H - 62), serial, font=_font(30), fill=(220, 220, 226), anchor="mm")
        buf = io.BytesIO()
        img.save(buf, "PNG")
        buf.seek(0)
        buf.name = "card.png"
        return buf
    except Exception:
        return None
