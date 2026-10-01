"""Runtime localization.

Russian is the source language. For any other language, strings are translated
on the fly via a free Google endpoint and cached persistently (per string, per
language) so each unique UI string is translated only once for everyone.

Translation failures degrade gracefully to the original Russian text — the bot
never breaks because a translation call failed or got rate-limited.
"""
import asyncio
import logging
import urllib.parse

import aiohttp

log = logging.getLogger(__name__)

LANGS = {
    "ru": "🇷🇺 Русский",
    "en": "🇬🇧 English",
    "uk": "🇺🇦 Українська",
}
DEFAULT = "ru"


def get_lang(storage, uid) -> str:
    lang = storage.get_setting(f"lang:{uid}")
    return lang if lang in LANGS else DEFAULT


def set_lang(storage, uid, lang: str) -> None:
    if lang in LANGS:
        storage.set_setting(f"lang:{uid}", lang)


async def _google(text: str, lang: str) -> str:
    q = urllib.parse.quote(text)
    url = (f"https://translate.googleapis.com/translate_a/single"
           f"?client=gtx&sl=ru&tl={lang}&dt=t&q={q}")
    timeout = aiohttp.ClientTimeout(total=15)
    for attempt in range(2):
        try:
            async with aiohttp.ClientSession(timeout=timeout) as s:
                async with s.get(url) as r:
                    if r.status == 429:
                        await asyncio.sleep(1.0)
                        continue
                    if r.status != 200:
                        return text
                    data = await r.json(content_type=None)
            return "".join(seg[0] for seg in data[0] if seg and seg[0]) or text
        except Exception:
            log.debug("translate failed", exc_info=True)
            return text
    return text


async def tr(storage, text: str, lang: str) -> str:
    """Translate `text` to `lang` (cached). Returns original on ru/empty/failure."""
    if not text or lang == DEFAULT or lang not in LANGS:
        return text
    key = f"{lang}\x00{text}"
    cached = storage.get_tr(key)
    if cached is not None:
        return cached
    out = await _google(text, lang)
    if out and out != text:
        storage.set_tr(key, out)
    return out


async def localize_keyboard(storage, markup, lang: str):
    """Return a copy of an InlineKeyboardMarkup with translated button labels."""
    if markup is None or lang == DEFAULT:
        return markup
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup
    rows = []
    for row in markup.inline_keyboard:
        new_row = []
        for btn in row:
            label = await tr(storage, btn.text, lang)
            new_row.append(InlineKeyboardButton(
                label,
                callback_data=btn.callback_data,
                url=btn.url,
                api_kwargs=btn.api_kwargs,
            ))
        rows.append(new_row)
    return InlineKeyboardMarkup(rows)
