"""Simple ad-link reward via an adlinkfly-style shortener (GPLinks, exe.io,
shrinkme.io, …).

Far fewer steps than work.ink for the end user:
  tap button → 1 ad page → auto-redirected back to the bot → premium.

We generate a one-time token, create a short link whose destination is the bot
deep-link `t.me/<bot>?start=adkey_<token>`, and hand the user the short link.
When they finish the ad they land back in the bot and the token is redeemed
(single-use, bound to the user who generated it). No key to copy/paste.

Verification is our own token (not the shortener's), so it works with any
adlinkfly-compatible provider — the user just supplies API base + key.
"""
import logging
import secrets
import urllib.parse

import aiohttp

from . import config

log = logging.getLogger(__name__)


def enabled() -> bool:
    return bool(config.ADLINK_API_BASE.strip() and config.ADLINK_API_KEY.strip())


def new_token() -> str:
    return secrets.token_urlsafe(9)


def deep_link(token: str, bot_username: str = "") -> str:
    user = (bot_username or config.ADLINK_BOT_USERNAME).lstrip("@")
    return f"https://t.me/{user}?start=adkey_{token}"


async def shorten(destination: str) -> str:
    """Create a short (monetized) link for `destination`. Returns the short URL,
    or "" on failure."""
    base = config.ADLINK_API_BASE.strip()
    url = f"{base}?api={config.ADLINK_API_KEY}&url={urllib.parse.quote(destination, safe='')}"
    timeout = aiohttp.ClientTimeout(total=20)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as s:
            async with s.get(url) as r:
                data = await r.json(content_type=None)
    except Exception:
        log.exception("adlink shorten failed")
        return ""
    if isinstance(data, dict):
        if str(data.get("status", "")).lower() == "success":
            return data.get("shortenedUrl") or data.get("shortened_url") or ""
        # Some providers return the url without a status field.
        return data.get("shortenedUrl") or data.get("short") or ""
    return ""
