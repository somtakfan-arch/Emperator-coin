"""Userbot power features on the OWNER's own account (MTProto / Telethon).

One persistent client that also keeps the account "online". Every capture is
best-effort and wrapped so a failure here never touches the main bot. All
captures go to the account's Saved Messages ("me") by default.

Features (each gated by its own env flag):
  • SAVE_ONETIME  — download view-once (one-time) media before it self-destructs.
  • ANTIDELETE    — recover deleted messages in private chats and groups
                    (never bots, never broadcast channels). Text always; media
                    up to ANTIDELETE_MEDIA_MB (0 = text/caption only).
  • GHOST         — mirror incoming private messages to Saved so they can be read
                    without opening the chat (no read receipt).
  • GROUP self-destruct — delete the owner's OWN group messages after N seconds.
  • Owner commands (typed in any chat, auto-removed after running):
        .dl   (reply to media)  — download it to Saved, even if forwarding is
                                  restricted / it's protected content.
        .purge N                — delete your own last N messages in this chat.
        .join <link>            — join a channel/group by link or invite.

Enabled only when USERBOT_SESSION + TG_API_ID + TG_API_HASH are set.
Secrets live only in the environment, never in git.
"""
import asyncio
import io
import logging
import os
import re
import time
from collections import OrderedDict

from . import userbot  # reuse API_ID / API_HASH / SESSION / enabled() / ALWAYS_ONLINE

logger = logging.getLogger(__name__)

LOG_TARGET = os.environ.get("USERBOT_LOG_TARGET", "me")

SAVE_ONETIME = os.environ.get("USERBOT_SAVE_ONETIME", "1") == "1"
ANTIDELETE = os.environ.get("USERBOT_ANTIDELETE", "1") == "1"
ANTIDELETE_MEDIA_MB = int(os.environ.get("USERBOT_ANTIDELETE_MEDIA_MB", "0"))
GHOST = os.environ.get("USERBOT_GHOST", "0") == "1"
GROUP_SELFDESTRUCT_SEC = int(os.environ.get("USERBOT_GROUP_SELFDESTRUCT_SEC", "0"))
COMMANDS = os.environ.get("USERBOT_COMMANDS", "1") == "1"
SPAM_MAX = int(os.environ.get("USERBOT_SPAM_MAX", "30"))
SPAM_INTERVAL = float(os.environ.get("USERBOT_SPAM_INTERVAL", "1.0"))
_SPAM_RE = re.compile(r"^\.spam\s+(\d+)\s+(.+)$", re.DOTALL)
ONLINE = userbot.ALWAYS_ONLINE
ONLINE_PING_SEC = userbot.ONLINE_PING_SEC

# ---- in-memory message cache for anti-delete (bounded LRU) --------------------
_CACHE_MAX = 6000
_by_key = OrderedDict()   # (chat_id, msg_id) -> entry
_by_id = {}               # msg_id -> entry (fallback when delete gives no chat)


def _cache_put(chat_id, msg_id, entry):
    key = (chat_id, msg_id)
    _by_key[key] = entry
    _by_id[msg_id] = entry
    _by_key.move_to_end(key)
    while len(_by_key) > _CACHE_MAX:
        old_key, old = _by_key.popitem(last=False)
        if _by_id.get(old_key[1]) is old:
            _by_id.pop(old_key[1], None)


def _cache_get(chat_id, msg_id):
    if chat_id is not None:
        e = _by_key.get((chat_id, msg_id))
        if e:
            return e
    return _by_id.get(msg_id)


def enabled() -> bool:
    return userbot.enabled()


async def run(application=None) -> None:
    """Persistent userbot client: online + all enabled power features."""
    if not enabled():
        return
    try:
        from telethon import TelegramClient, events
        from telethon.sessions import StringSession
        from telethon.tl.functions.account import UpdateStatusRequest
        from telethon.tl.functions.channels import JoinChannelRequest
        from telethon.tl.functions.messages import ImportChatInviteRequest
        from telethon.errors import FloodWaitError
    except Exception as e:
        logger.error("userbot_power: import telethon failed: %r", e)
        return

    logger.info(
        "🛰️ userbot_power starting (onetime=%s antidelete=%s media<=%dMB ghost=%s "
        "selfdestruct=%ds commands=%s online=%s)",
        SAVE_ONETIME, ANTIDELETE, ANTIDELETE_MEDIA_MB, GHOST,
        GROUP_SELFDESTRUCT_SEC, COMMANDS, ONLINE,
    )

    async def _notify(text):
        try:
            await _client.send_message(LOG_TARGET, text)
        except Exception:
            logger.exception("userbot_power: notify failed")

    def _who(sender):
        if not sender:
            return "???"
        name = (getattr(sender, "first_name", "") or "") + \
               ((" " + sender.last_name) if getattr(sender, "last_name", None) else "")
        name = name.strip() or getattr(sender, "title", "") or str(getattr(sender, "id", "?"))
        un = getattr(sender, "username", None)
        return f"{name}" + (f" (@{un})" if un else "")

    async def _chat_label(msg):
        try:
            chat = await msg.get_chat()
            return getattr(chat, "title", None) or getattr(chat, "first_name", None) or "личка"
        except Exception:
            return "чат"

    # ---------- handlers --------------------------------------------------
    async def on_new_message(event):
        try:
            msg = event.message
            sender = await event.get_sender()
            is_bot = bool(getattr(sender, "bot", False))

            # 1) one-time (view-once) media → download before it self-destructs.
            ttl = getattr(getattr(msg, "media", None), "ttl_seconds", None)
            if SAVE_ONETIME and ttl and not is_bot:
                try:
                    data = await event.client.download_media(msg, file=bytes)
                    if data:
                        cap = f"📸 Одноразовое медиа от {_who(sender)} (перехвачено)"
                        await event.client.send_file(LOG_TARGET, io.BytesIO(data),
                                                     caption=cap, force_document=False)
                    else:
                        await _notify(f"📸 Одноразовое медиа от {_who(sender)} — скачать не вышло.")
                except Exception:
                    logger.exception("userbot_power: one-time download failed")

            # 2) ghost: mirror incoming PRIVATE messages to Saved (read without
            #    opening the chat, so no read receipt).
            if GHOST and event.is_private and not is_bot and not ttl:
                try:
                    body = msg.text or ("[медиа]" if msg.media else "")
                    await _notify(f"👁 {_who(sender)}:\n{body}")
                    if msg.media:
                        try:
                            await event.client.send_file(LOG_TARGET, msg.media)
                        except Exception:
                            pass
                except Exception:
                    logger.exception("userbot_power: ghost mirror failed")

            # 3) anti-delete cache: private chats + groups (incl. supergroups),
            #    never bots, never broadcast channels. In Telethon a supergroup
            #    is also is_channel, so skip only broadcast (channel & !group).
            if ANTIDELETE and not is_bot and not (event.is_channel and not event.is_group):
                entry = {
                    "who": _who(sender),
                    "text": msg.text or "",
                    "ts": time.time(),
                    "chat_label": await _chat_label(msg),
                    "media_bytes": None,
                    "has_media": bool(msg.media) and not ttl,
                }
                if (entry["has_media"] and ANTIDELETE_MEDIA_MB > 0):
                    try:
                        size = getattr(getattr(msg, "file", None), "size", 0) or 0
                        if size <= ANTIDELETE_MEDIA_MB * 1024 * 1024:
                            entry["media_bytes"] = await event.client.download_media(msg, file=bytes)
                    except Exception:
                        pass
                _cache_put(event.chat_id, msg.id, entry)
        except Exception:
            logger.exception("userbot_power: on_new_message error")

    async def on_deleted(event):
        if not ANTIDELETE:
            return
        try:
            for mid in event.deleted_ids:
                entry = _cache_get(getattr(event, "chat_id", None), mid)
                if not entry:
                    continue
                head = f"🗑 Удалено ({entry['chat_label']}) от {entry['who']}:"
                if entry["media_bytes"]:
                    try:
                        await event.client.send_file(
                            LOG_TARGET, io.BytesIO(entry["media_bytes"]),
                            caption=head + (f"\n{entry['text']}" if entry["text"] else ""))
                        continue
                    except Exception:
                        logger.exception("userbot_power: deleted media resend failed")
                body = entry["text"] or ("[медиа — не сохранено]" if entry["has_media"] else "[пусто]")
                await _notify(f"{head}\n{body}")
        except Exception:
            logger.exception("userbot_power: on_deleted error")

    async def on_own_group_message(event):
        # group self-destruct of the OWNER's own messages.
        if GROUP_SELFDESTRUCT_SEC <= 0:
            return
        try:
            if event.is_private:
                return
            text = (event.message.text or "").strip().lower()
            if text.startswith("."):  # don't nuke command messages here
                return
            chat_id, mid = event.chat_id, event.message.id
            await asyncio.sleep(GROUP_SELFDESTRUCT_SEC)
            try:
                await event.client.delete_messages(chat_id, mid)
            except Exception:
                pass
        except Exception:
            logger.exception("userbot_power: self-destruct error")

    async def on_owner_command(event):
        if not COMMANDS:
            return
        try:
            text = (event.message.text or "").strip()
            low = text.lower()

            # .spam <count> <text> — send <text> count times in THIS chat.
            # Groups/channels only: in private (business) chats the bot handles
            # it, so we don't double-fire.
            sm = _SPAM_RE.match(text)
            if sm and not event.is_private:
                count = max(1, min(int(sm.group(1)), SPAM_MAX))
                body = sm.group(2)
                try:
                    await event.message.edit(body)  # reuse command msg as #1
                except Exception:
                    try:
                        await event.message.delete()
                    except Exception:
                        pass
                for _ in range(count - 1):
                    await asyncio.sleep(SPAM_INTERVAL)
                    try:
                        await event.client.send_message(event.chat_id, body)
                    except FloodWaitError as fw:
                        if getattr(fw, "seconds", 0) > 60:
                            break  # Telegram limited us — stop
                        await asyncio.sleep(fw.seconds + 1)
                    except Exception:
                        pass
                return

            # .dl — download the replied media (even protected) to Saved.
            if low in (".dl", ".save", ".сейв", ".сохрани"):
                reply = await event.message.get_reply_message()
                if reply and reply.media:
                    try:
                        data = await event.client.download_media(reply, file=bytes)
                        who = _who(await reply.get_sender())
                        await event.client.send_file(
                            LOG_TARGET, io.BytesIO(data),
                            caption=f"📥 Скачано от {who} (.dl)")
                    except Exception:
                        logger.exception("userbot_power: .dl failed")
                        await _notify("📥 .dl: не удалось скачать это медиа.")
                try:
                    await event.message.delete()
                except Exception:
                    pass
                return

            # .purge N — delete your own last N messages in this chat.
            if low.startswith(".purge"):
                parts = text.split()
                n = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 10
                n = max(1, min(n, 200))
                ids = []
                async for m in event.client.iter_messages(event.chat_id, from_user="me", limit=n + 1):
                    ids.append(m.id)
                try:
                    await event.client.delete_messages(event.chat_id, ids)
                except Exception:
                    logger.exception("userbot_power: .purge failed")
                return

            # .join <link> — join a channel/group.
            if low.startswith(".join"):
                parts = text.split()
                try:
                    await event.message.delete()
                except Exception:
                    pass
                if len(parts) < 2:
                    return
                link = parts[1].strip()
                try:
                    if "+" in link or "joinchat" in link:
                        h = link.rstrip("/").split("/")[-1].lstrip("+")
                        await event.client(ImportChatInviteRequest(h))
                    else:
                        uname = link.rstrip("/").split("/")[-1].lstrip("@")
                        await event.client(JoinChannelRequest(uname))
                    await _notify(f"➕ Вступил: {link}")
                except Exception as e:
                    await _notify(f"➕ .join не вышло: {e!r}")
                return
        except Exception:
            logger.exception("userbot_power: on_owner_command error")

    # ---------- persistent run loop with reconnect ------------------------
    while True:
        _client = TelegramClient(StringSession(userbot.SESSION), userbot.API_ID, userbot.API_HASH)
        try:
            await asyncio.wait_for(_client.connect(), timeout=60)
            if not await _client.is_user_authorized():
                logger.error("userbot_power: session not authorized")
                await asyncio.sleep(300)
                continue

            if SAVE_ONETIME or ANTIDELETE or GHOST:
                _client.add_event_handler(on_new_message, events.NewMessage(incoming=True))
            if ANTIDELETE:
                _client.add_event_handler(on_deleted, events.MessageDeleted())
            if GROUP_SELFDESTRUCT_SEC > 0:
                _client.add_event_handler(on_own_group_message, events.NewMessage(outgoing=True))
            if COMMANDS:
                _client.add_event_handler(on_owner_command, events.NewMessage(outgoing=True))

            async def _online_pinger():
                if not ONLINE:
                    return
                while _client.is_connected():
                    try:
                        await _client(UpdateStatusRequest(offline=False))
                    except Exception:
                        return
                    await asyncio.sleep(ONLINE_PING_SEC)

            ping_task = asyncio.create_task(_online_pinger())
            logger.info("🛰️ userbot_power connected, handlers registered.")
            try:
                await _client.run_until_disconnected()
            finally:
                ping_task.cancel()
        except Exception:
            logger.exception("userbot_power: run loop error — reconnecting")
        finally:
            try:
                await _client.disconnect()
            except Exception:
                pass
        await asyncio.sleep(15)
