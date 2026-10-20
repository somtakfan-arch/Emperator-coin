"""Optional userbot: changes the OWNER's REAL Telegram birthday every day.

The Bot API cannot set an account's birthdate, so this uses MTProto (Telethon)
on the owner's own user session. Enabled ONLY when USERBOT_SESSION +
TG_API_ID + TG_API_HASH are set — so it affects exactly one account: the
owner's. "Eternal birthday": every day at a set time the birthday jumps to the
next day, so once the clock rolls over it's always "birthday today".

Secrets live ONLY in the environment, never in git. Telethon is imported lazily.
On each set it also posts a confirmation to the account's own Saved Messages,
so the owner can see it worked.
"""
import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

API_ID = int(os.environ.get("TG_API_ID", "0") or 0)
API_HASH = os.environ.get("TG_API_HASH", "")
SESSION = os.environ.get("USERBOT_SESSION", "")
TZ_OFFSET = int(os.environ.get("BIRTHDAY_TZ_OFFSET", "3"))
SET_HOUR = int(os.environ.get("BIRTHDAY_SET_HOUR", "23"))
SET_MIN = int(os.environ.get("BIRTHDAY_SET_MINUTE", "59"))


def enabled() -> bool:
    return bool(API_ID and API_HASH and SESSION)


async def set_birthday(day: int, month: int, year=None, notify: bool = True):
    """Set the account's birthday. Returns (ok: bool, detail: str)."""
    try:
        from telethon import TelegramClient
        from telethon.sessions import StringSession
        from telethon.tl.functions.account import UpdateBirthdayRequest
        from telethon.tl.types import Birthday
    except Exception as e:
        return False, f"import telethon failed: {e!r}"

    client = TelegramClient(StringSession(SESSION), API_ID, API_HASH)
    try:
        await asyncio.wait_for(client.connect(), timeout=60)
    except Exception as e:
        return False, f"connect failed: {e!r}"
    try:
        if not await client.is_user_authorized():
            return False, "session not authorized"
        await client(UpdateBirthdayRequest(birthday=Birthday(day=day, month=month, year=year)))
        if notify:
            try:
                await client.send_message(
                    "me", f"🎂 День рождения установлен на {day:02d}.{month:02d}. "
                          "Автоматически от Bed Dialog.")
            except Exception:
                pass
        return True, f"{day:02d}.{month:02d}"
    except Exception as e:
        return False, f"updateBirthday failed: {e!r}"
    finally:
        try:
            await client.disconnect()
        except Exception:
            pass


async def birthday_loop(application=None) -> None:
    """Every day at SET_HOUR:SET_MIN (local), set the birthday to the next day."""
    if not enabled():
        return
    logger.info("🎂 Userbot birthday loop started (daily → next day at %02d:%02d UTC%+d).",
                SET_HOUR, SET_MIN, TZ_OFFSET)

    async def _report(ok: bool, detail: str, when: str):
        msg = (f"🎂 {when}: birthday set to {detail} ✅" if ok
               else f"🎂 {when}: birthday NOT set — {detail} ❌")
        (logger.info if ok else logger.error)(msg)
        # Best-effort: also DM the bot owner so failures are visible in Telegram.
        if application is not None:
            try:
                from . import config
                await application.bot.send_message(chat_id=config.BACKUP_CHAT_ID, text=msg)
            except Exception:
                pass

    # Immediate set on startup — verifies the session and sets "today" now.
    try:
        now0 = datetime.now(timezone.utc) + timedelta(hours=TZ_OFFSET)
        ok0, det0 = await set_birthday(now0.day, now0.month)
        await _report(ok0, det0, "startup")
    except Exception as e:
        logger.exception("Startup birthday set crashed: %r", e)

    last_fired = None
    while True:
        try:
            now = datetime.now(timezone.utc) + timedelta(hours=TZ_OFFSET)
            if (now.hour, now.minute) >= (SET_HOUR, SET_MIN) and last_fired != now.date():
                nxt = now + timedelta(days=1)
                ok, det = await set_birthday(nxt.day, nxt.month)
                last_fired = now.date()
                await _report(ok, det, "daily")
        except Exception:
            logger.exception("Birthday loop error")
        await asyncio.sleep(30)
