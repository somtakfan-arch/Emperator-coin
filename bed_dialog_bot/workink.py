"""work.ink Key-System integration.

Users complete a work.ink link, receive a one-time token, and redeem it in the
bot for premium. The token is verified server-side against work.ink's API so it
can't be faked, and ?deleteToken=1 makes it single-use.

Docs: https://blog.work.ink/using-the-key-system-to-make-money-with-your-software/
"""
import logging

import aiohttp

from . import config

log = logging.getLogger(__name__)

_VALIDATE = "https://work.ink/_api/v2/token/isValid/{token}?deleteToken=1"


def enabled() -> bool:
    return bool(config.WORKINK_LINK_URL.strip())


async def redeem_token(token: str):
    """Validate and consume a work.ink token.

    Returns (ok, reason): ok=True means the token was valid, from our link, and
    is now consumed — the caller should grant the reward. reason is a short
    human string for the failure case.
    """
    token = (token or "").strip()
    if not token:
        return False, "пустой ключ"
    url = _VALIDATE.format(token=token)
    timeout = aiohttp.ClientTimeout(total=20)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url) as resp:
                if resp.status != 200:
                    return False, f"work.ink вернул {resp.status}"
                data = await resp.json()
    except Exception:
        log.exception("work.ink validate failed")
        return False, "не удалось связаться с work.ink"

    if not data.get("valid"):
        return False, "ключ недействителен или уже использован"
    info = data.get("info") or {}
    if config.WORKINK_LINK_ID and int(info.get("linkId", 0)) != config.WORKINK_LINK_ID:
        return False, "ключ не от нашей ссылки"
    return True, "ok"
