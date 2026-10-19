"""Optional userbot: changes the OWNER's REAL Telegram birthday every day.

The Bot API cannot set an account's birthdate, so this uses MTProto (Telethon)
on the owner's own user session. It is enabled ONLY when USERBOT_SESSION +
TG_API_ID + TG_API_HASH are set in the environment — so it affects exactly one
account: the owner's. The "eternal birthday" gag: every day at a set time it
sets the birthday to the NEXT day, so once the clock rolls over it's always
"birthday today".

Secrets (session string, api hash) live ONLY in the environment, never in git.
Telethon is imported lazily so the main bot runs fine even if it isn't needed.
"""
import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

API_ID = int(os.environ.get("TG_API_ID", "0") or 0)
API_HASH = os.environ.get("TG_API_HASH", "")
SESSION = os.environ.get("USERBOT_SESSION", "")
# Local time (hours east of UTC) used to decide when "23:59" is — MSK = 3.
TZ_OFFSET = int(os.environ.get("BIRTHDAY_TZ_OFFSET", "3"))
SET_HOUR = int(os.environ.get("BIRTHDAY_SET_HOUR", "23"))
SET_MIN = int(os.environ.get("BIRTHDAY_SET_MINUTE", "59"))


def enabled() -> bool:
    return bool(API_ID and API_HASH and SESSION)


async def set_birthday(day: int, month: int, year=None) -> bool:
    """Set the session account's birthday. Returns True on success."""
    from telethon import TelegramClient
    from telethon.sessions import StringSession
    from telethon.tl.functions.account import UpdateBirthdayRequest
    from telethon.tl.types import Birthday

    client = TelegramClient(StringSession(SESSION), API_ID, API_HASH)
    await client.connect()
    try:
        if not await client.is_user_authorized():
            logger.error("Userbot session is not authorized — birthday not changed.")
            return False
        bday = Birthday(day=day, month=month, year=year)
        await client(UpdateBirthdayRequest(birthday=bday))
        return True
    finally:
        try:
            await client.disconnect()
        except Exception:
            pass


async def birthday_loop() -> None:
    """Every day at SET_HOUR:SET_MIN (local), set the birthday to the next day."""
    if not enabled():
        return
    logger.info("🎂 Userbot birthday loop started (daily → birthday = next day, "
                "at %02d:%02d UTC%+d).", SET_HOUR, SET_MIN, TZ_OFFSET)
    last_fired = None
    while True:
        try:
            now = datetime.now(timezone.utc) + timedelta(hours=TZ_OFFSET)
            if (now.hour, now.minute) >= (SET_HOUR, SET_MIN) and last_fired != now.date():
                nxt = now + timedelta(days=1)
                ok = await set_birthday(nxt.day, nxt.month)
                last_fired = now.date()
                if ok:
                    logger.info("🎂 Birthday set to %02d.%02d", nxt.day, nxt.month)
        except Exception:
            logger.exception("Birthday loop error")
        await asyncio.sleep(30)
