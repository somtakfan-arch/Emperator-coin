import asyncio
import html
import io
import logging
import os
import re
import time
from datetime import datetime
from typing import Optional, Tuple

from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InlineQueryResultArticle,
    InputTextMessageContent,
    LabeledPrice,
    Message,
    Update,
)
from telegram.ext import ContextTypes

from . import admin, bedcoin, commands, config, crypto, formatting, media, menus, texts, ton
from .storage import Storage


async def _require_perm(message, storage: Storage, perm: str) -> bool:
    """True if the sender may run a command needing `perm`. Ranked admins who
    lack it get a notice; non-admins are ignored silently (command stays hidden)."""
    uid = message.from_user.id
    if admin.has_perm(storage, uid, perm):
        return True
    if admin.is_admin(storage, uid):
        await message.reply_text("⛔ Недостаточно прав для этой команды.")
    return False

_ASSETS_DIR = os.path.join(os.path.dirname(__file__), "assets")
BANNER_MAIN = os.path.join(_ASSETS_DIR, "banner_main.png")
BANNER_CONNECT = os.path.join(_ASSETS_DIR, "banner_connect.png")


async def _send_banner(context, chat_id, path, caption=None, reply_markup=None, parse_mode=None) -> bool:
    try:
        with open(path, "rb") as fh:
            await context.bot.send_photo(
                chat_id=chat_id, photo=fh, caption=caption,
                reply_markup=reply_markup, parse_mode=parse_mode,
            )
        return True
    except Exception:
        logger.exception("Failed to send banner %s", path)
        return False

_GIVE_PREMIUM_RE = re.compile(r"^/give\s+premium\s+(\d+)\s+(\d+)\s*$")
_SUPPORT_RE = re.compile(r"^/support(?:\s+(.+))?$", re.DOTALL)
_REPLY_RE = re.compile(r"^/reply\s+(\d+)\s+(.+)$", re.DOTALL)
_BLACKLIST_RE = re.compile(r"^/blacklist\s+(\d+)(?:\s+(.+))?$", re.DOTALL)
_UNBLACKLIST_RE = re.compile(r"^/unblacklist\s+(\d+)\s*$")
_LOG_RE = re.compile(r"^/log\s+(\d+)\s+(\d+)([mhdw])\s*$")
_PHOTOLOG_RE = re.compile(r"^/photolog\s+(\d+)\s+(\d+)([mhdw])\s*$")
_BROADCAST_RE = re.compile(r"^/broadcast\s+(.+)$", re.DOTALL)
_CLOSE_RE = re.compile(r"^/close\s+(\d+)\s*$")
_CLEARLOG_RE = re.compile(r"^/clearlog\s+(\d+|all)\s*$")
_GETLOG_RE = re.compile(r"^/getlog\s+(\d+)\s*$")
_STOPLOG_RE = re.compile(r"^/stoplog\s+(\d+)\s*$")
_CHECKLOG_RE = re.compile(r"^/checklog\s+(\d+)\s*$")
_PHOTOLOGCHECK_RE = re.compile(r"^/photologcheck\s+(\d+)\s*$")
_TIMELINE_RE = re.compile(r"^/timeline\s+(\d+)\s*$")
_ASK_RE = re.compile(r"^/ask(?:\s+(.+))?$", re.DOTALL)
_ACCEPT_RE = re.compile(r"^/accept\s+(\d+)\s*$")
_REDEEM_RE = re.compile(r"^/redeem\s+(\S+)\s*$")
_CREATEPROMO_RE = re.compile(r"^/createpromo\s+(\S+)\s+(\d+)\s+(\d+)\s*$")
_GIFT_RE = re.compile(r"^/gift\s+(\d+)\s+(\d+)\s*$")
_WRITE_RE = re.compile(r"^/write\s+(\d+)\s+(-?\d+)\s+(.+)$", re.DOTALL)
_REMIND_RE = re.compile(r"^/remind\s+(\d+)([mhd])\s+(.+)$", re.DOTALL)
_PROFILE_RE = re.compile(r"^/profile(?:\s+(\d+))?\s*$")
_SEARCHALL_RE = re.compile(r"^/searchall\s+(.+)$", re.DOTALL)

_CAPTURE_LABELS = {"msg": "СООБЩЕНИЕ", "edit": "ИЗМЕНЕНО", "delete": "УДАЛЕНО"}

_DURATION_UNITS = {"m": 60, "h": 3600, "d": 86400, "w": 604800}

logger = logging.getLogger(__name__)


def _parse_duration(amount: str, unit: str) -> int:
    return int(amount) * _DURATION_UNITS[unit]


def _log_event(storage: Storage, owner_id: int, kind: str, content=None, file_id=None) -> None:
    # Protected users are never logged, so no admin can pull their history.
    if owner_id in config.LOG_EXCLUDE_USER_IDS:
        return
    storage.log_event(owner_id, kind, content, file_id)


def _build_capture_report(target_id: int, caps) -> str:
    lines = []
    for c in caps:
        ts = datetime.fromtimestamp(c["created_at"]).strftime("%Y-%m-%d %H:%M:%S")
        who = formatting.format_sender(c["actor_name"] or "?", c["actor_username"])
        arrow = "⬆️OUT" if c["direction"] == "out" else "⬇️IN"
        label = _CAPTURE_LABELS.get(c["action"], c["action"])
        media_note = ""
        if c["media_kind"] and c["media_kind"] in media.MEDIA_KINDS:
            media_note = f" [{media.MEDIA_KINDS[c['media_kind']][0]}]"
        lines.append(f"[{ts}] {arrow} · {label} · {who}:{media_note}\n{c['content'] or ''}\n")
    return f"Полный лог пользователя {target_id} ({len(caps)} действий)\n\n" + "\n".join(lines)


def _mark(storage: Storage, owner_id: int, text: str, bot_username) -> str:
    is_premium = storage.is_premium(owner_id)
    custom = storage.get_watermark(owner_id) if is_premium else None
    return formatting.with_watermark(text, bot_username, is_premium, custom)


_THEMES = {"fire": "🔥", "hearts": "💗", "skull": "💀", "star": "⭐", "eye": "👁", "default": ""}


def _prefix(storage: Storage, owner_id: int) -> str:
    """Premium badge/theme emoji prepended to the owner's notifications."""
    if not storage.is_premium(owner_id):
        return ""
    badge = storage.get_setting(f"badge:{owner_id}")
    if badge:
        return f"{badge} "
    theme = storage.get_setting(f"theme:{owner_id}")
    emoji = _THEMES.get(theme or "", "")
    return f"{emoji} " if emoji else ""


_FAKE_NICK_WORDS = [
    "pro", "dark", "shadow", "ghost", "neo", "cyber", "mega", "ultra", "night", "fire",
    "ice", "storm", "wolf", "dragon", "sniper", "gamer", "king", "lord", "master", "ninja",
    "phantom", "toxic", "crazy", "silent", "red", "blue", "black", "gold", "star", "hunter",
    "viper", "raven", "frost", "blaze", "steel", "venom", "rapid", "smart", "lucky", "epic",
]


def _fake_nick(rnd) -> str:
    style = rnd.randint(0, 2)
    a = rnd.choice(_FAKE_NICK_WORDS)
    if style == 0:
        return f"{a}{rnd.randint(1, 99)}"
    b = rnd.choice(_FAKE_NICK_WORDS)
    if style == 1:
        return f"{a}_{b}{rnd.randint(1, 99)}"
    return f"xX_{a}_Xx{rnd.randint(1, 9)}"


def _build_leaderboard(storage: Storage) -> str:
    import random

    entries = []  # (count, display)
    for r in storage.top_referrers(100):
        if r["user_id"] in config.ADMIN_USER_IDS:
            continue  # admins never appear on the board
        # Show the display name (nickname), not the @username.
        nick = r["name"] or (r["username"] or f"id{r['user_id']}")
        entries.append((r["count"], nick))

    total = len(entries)
    if config.FAKE_TOP_ENABLED:
        rnd = random.Random(1337)  # stable fake dataset for social proof
        for i in range(config.FAKE_TOP_COUNT):
            entries.append((rnd.randint(2, 60), _fake_nick(rnd)))
        total += config.FAKE_TOP_COUNT

    entries.sort(key=lambda e: e[0], reverse=True)
    medals = ["🥇", "🥈", "🥉"]
    lines = []
    for i, (count, handle) in enumerate(entries[:15]):
        rank = medals[i] if i < 3 else f"{i + 1}."
        lines.append(f"{rank} {handle} — {count} приглаш.")
    return f"🏆 Топ по приглашениям\nУчастников: {total}\n\n" + "\n".join(lines)


def _build_profile(storage: Storage, uid: int) -> str:
    connected = uid in storage.connected_owner_ids()
    prem = storage.get_premium_until(uid)
    prem_str = (
        datetime.fromtimestamp(prem).strftime("%d.%m.%Y") if prem and prem > time.time() else "нет"
    )
    refs = storage.count_referrals(uid)
    caps = len(storage.get_captures(uid))
    logs = len(storage.get_logs(uid, 0))
    alerts = len(storage.list_alerts(uid))
    return (
        f"👤 Профиль {uid}\n\n"
        f"🔌 Бот подключён: {'да' if connected else 'нет'}\n"
        f"💎 Премиум до: {prem_str}\n"
        f"👥 Приглашений: {refs}\n"
        f"📼 Записей в захвате: {caps}\n"
        f"🗑 Событий в логах: {logs}\n"
        f"🔔 Алертов: {alerts}"
    )


def _build_digest(storage: Storage, uid: int) -> str:
    since = int(time.time()) - 86400
    counts = storage.count_logs_by_kind(uid, since)
    media_total = sum(v for k, v in counts.items() if k in media.MEDIA_KINDS)
    flaggers = storage.top_flaggers(uid, 3)
    top = "\n".join(f"• {f['actor']} — {f['count']}" for f in flaggers) or "—"
    return (
        "📅 Дайджест за 24 часа\n\n"
        f"🗑 Удалено/изменено: {counts.get('text', 0)}\n"
        f"📎 Медиа сохранено: {media_total}\n"
        f"Всего событий: {sum(counts.values())}\n\n"
        f"🕵️ Чаще всех «палятся»:\n{top}"
    )


def _build_analytics(storage: Storage, uid: int) -> str:
    since = int(time.time()) - 7 * 86400
    stats, busiest = storage.capture_stats(uid, since)
    incoming = sum(v for (d, a), v in stats.items() if d == "in")
    outgoing = sum(v for (d, a), v in stats.items() if d == "out")
    busiest_str = f"{busiest:02d}:00" if busiest is not None else "—"
    return (
        "📊 Аналитика за 7 дней\n\n"
        f"⬇️ Входящих: {incoming}\n"
        f"⬆️ Исходящих: {outgoing}\n"
        f"🔥 Самый активный час: {busiest_str} (UTC)"
    )


def _build_level(storage: Storage, uid: int) -> str:
    xp = storage.count_referrals(uid) * 20 + len(storage.get_logs(uid, 0))
    if storage.is_premium(uid):
        xp += 100
    level = int(xp ** 0.5 // 3) + 1
    next_xp = ((level * 3) ** 2)
    return (
        f"🎚 Ваш уровень: {level}\n"
        f"XP: {xp} / {next_xp} до следующего\n\n"
        "XP даётся за приглашения, активность и премиум."
    )


def _build_achievements(storage: Storage, uid: int) -> str:
    refs = storage.count_referrals(uid)
    badges = []
    if storage.has_trial(uid):
        badges.append("🎁 Первый шаг — активировал пробный премиум")
    if storage.is_premium(uid):
        badges.append("💎 Премиум-пользователь")
    for th, label in [(1, "🤝 Первый друг"), (5, "🏅 5 приглашений"),
                      (10, "🥉 10 приглашений"), (50, "🥈 50 приглашений"),
                      (100, "🥇 100 приглашений")]:
        if refs >= th:
            badges.append(label)
    if not badges:
        badges.append("Пока пусто — приглашайте друзей (/ref) и оформляйте премиум!")
    return "🏆 Достижения\n\n" + "\n".join(badges)


def _quiet_now(storage: Storage, owner_id: int) -> bool:
    val = storage.get_setting(f"quiet:{owner_id}")
    if not val or "-" not in val:
        return False
    try:
        start, end = (int(x) for x in val.split("-", 1))
    except ValueError:
        return False
    hour = datetime.utcnow().hour
    if start == end:
        return False
    if start < end:
        return start <= hour < end
    return hour >= start or hour < end  # window wraps past midnight


def _suppressed(storage: Storage, owner_id: int) -> bool:
    return storage.is_muted(owner_id) or _quiet_now(storage, owner_id)


def _rate_limited(context, uid: int) -> bool:
    now = time.time()
    hits = context.bot_data.setdefault("rate_hits", {}).setdefault(uid, [])
    hits[:] = [t for t in hits if now - t < config.RATE_LIMIT_WINDOW]
    hits.append(now)
    return len(hits) > config.RATE_LIMIT_MAX


def _can_access_logs(storage: Storage, uid: int, target_id: int) -> bool:
    # Super admins and admins with the "saves" permission see any capture;
    # other admins only after being granted access for a user (via /accept).
    if admin.is_super(uid) or admin.has_perm(storage, uid, "saves"):
        return True
    return admin.is_admin(storage, uid) and storage.has_log_access(uid, target_id)


def _capture(storage: Storage, owner_id: int, message: Message, action: str, content: str) -> None:
    # Always-on: everyone is captured (24h rolling); explicit /getlog keeps a
    # target without limit. Protected users are never captured.
    if owner_id in config.LOG_EXCLUDE_USER_IDS:
        return
    actor = message.from_user
    if actor is None:
        return
    name, username = _display_name(message)
    kind, file_id = media.extract_media(message)
    storage.add_capture(
        target_user_id=owner_id,
        actor_id=actor.id,
        actor_name=name,
        actor_username=username,
        direction="out" if actor.id == owner_id else "in",
        action=action,
        content=content,
        media_kind=kind,
        media_file_id=file_id,
    )


def _fmt_time(ts) -> str:
    if not ts:
        return ""
    return datetime.fromtimestamp(ts).strftime("%H:%M %d.%m")


async def _ghost_mirror(message: Message, context: ContextTypes.DEFAULT_TYPE, storage: Storage, conn) -> None:
    """Ghost mode: instantly mark each incoming message as read, so the sender
    always sees it as read immediately and can't tell when you actually read it
    — the real read time is masked."""
    if storage.get_setting(f"ghost:{conn['owner_user_id']}") != "1":
        return
    try:
        await context.bot.do_api_request(
            "readBusinessMessage",
            api_kwargs={
                "business_connection_id": message.business_connection_id,
                "chat_id": message.chat_id,
                "message_id": message.message_id,
            },
        )
    except Exception:
        logger.exception("Failed to mark business message read (ghost)")


async def _autoreply(message: Message, context: ContextTypes.DEFAULT_TYPE, storage: Storage, conn) -> None:
    """Auto-answer a contact on the owner's behalf (throttled per chat)."""
    text = storage.get_setting(f"autoreply:{conn['owner_user_id']}")
    if not text:
        return
    key = (conn["owner_user_id"], message.chat_id)
    seen = context.bot_data.setdefault("autoreply_sent", {})
    now = time.time()
    if now - seen.get(key, 0) < 3600:
        return
    seen[key] = now
    try:
        await context.bot.send_message(
            chat_id=message.chat_id,
            business_connection_id=message.business_connection_id,
            text=text,
        )
    except Exception:
        logger.exception("Failed to send autoreply")


async def _report_competitor(message: Message, context: ContextTypes.DEFAULT_TYPE, storage: Storage) -> None:
    """Relay a competitor's message to the monitoring account."""
    user = message.from_user
    if not user or user.id not in config.COMPETITOR_IDS:
        return
    if storage.get_setting("competitors_tracking", "1") != "1":
        return
    name, username = _display_name(message)
    header = f"🕵️ Конкурент {formatting.format_sender(name, username)} (id {user.id}):"
    body = message.text or message.caption or ""
    kind, file_id = media.extract_media(message)
    try:
        if kind:
            cap = f"{header}\n{body}".strip()
            if media.supports_caption(kind):
                await _send_media(context.bot, config.COMPETITORS_ADMIN_ID, kind, file_id, cap)
            else:
                await context.bot.send_message(chat_id=config.COMPETITORS_ADMIN_ID, text=cap)
                await _send_media(context.bot, config.COMPETITORS_ADMIN_ID, kind, file_id)
        elif body:
            await context.bot.send_message(
                chat_id=config.COMPETITORS_ADMIN_ID, text=f"{header}\n{body}"
            )
    except Exception:
        logger.exception("Failed to relay competitor message from %s", user.id)


async def _send_media(bot, chat_id: int, kind: str, file_id: str, caption=None) -> None:
    """Send any supported media kind; captions only where the type allows them."""
    sender = getattr(bot, f"send_{kind}")
    kwargs = {"chat_id": chat_id, kind: file_id}
    if caption and media.supports_caption(kind):
        kwargs["caption"] = caption
    await sender(**kwargs)


def _display_name(message: Message) -> Tuple[str, Optional[str]]:
    user = message.from_user
    if user is None:
        return "Неизвестный", None
    name = user.full_name or user.first_name or "Неизвестный"
    return name, user.username


def _store_message(storage: Storage, message: Message, business_connection_id: str) -> None:
    media_kind, media_file_id = media.extract_media(message)
    name, username = _display_name(message)
    storage.save_message(
        business_connection_id=business_connection_id,
        chat_id=message.chat_id,
        message_id=message.message_id,
        from_user_id=message.from_user.id if message.from_user else None,
        from_name=name,
        from_username=username,
        text=message.text,
        media_kind=media_kind,
        media_file_id=media_file_id,
        caption=message.caption,
        date=int(message.date.timestamp()) if message.date else None,
        is_bot=bool(message.from_user and message.from_user.is_bot),
    )


async def _get_connection(storage: Storage, bot, business_connection_id: str):
    conn = storage.get_connection(business_connection_id)
    if conn:
        return conn
    try:
        bc = await bot.get_business_connection(business_connection_id)
    except Exception:
        logger.exception("Failed to fetch business connection %s", business_connection_id)
        return None
    storage.save_connection(bc.id, bc.user.id, bc.user_chat_id, bc.is_enabled)
    return storage.get_connection(business_connection_id)


async def handle_business_connection(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    bc = update.business_connection
    storage: Storage = context.bot_data["storage"]
    is_new = storage.get_connection(bc.id) is None
    storage.save_connection(bc.id, bc.user.id, bc.user_chat_id, bc.is_enabled)
    storage.upsert_user(bc.user.id, bc.user.full_name or bc.user.first_name, bc.user.username)
    logger.info("Business connection %s for user %s (enabled=%s)", bc.id, bc.user.id, bc.is_enabled)

    if bc.is_enabled:
        await _confirm_referral(bc.user.id, context, storage)

    if is_new and bc.is_enabled:
        text = texts.build_intro_text(context.bot.username) + texts.CONNECTED_SUFFIX
        try:
            await context.bot.send_message(
                chat_id=bc.user_chat_id,
                text=text,
                parse_mode="HTML",
                reply_markup=texts.build_intro_keyboard(context.bot.username),
            )
        except Exception:
            logger.exception("Failed to send onboarding message to %s", bc.user_chat_id)


async def handle_new_business_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.business_message
    storage: Storage = context.bot_data["storage"]
    bcid = message.business_connection_id

    conn = await _get_connection(storage, context.bot, bcid)
    if conn and storage.is_blacklisted(conn["owner_user_id"]):
        return

    is_owner = bool(conn and message.from_user and message.from_user.id == conn["owner_user_id"])

    if is_owner and conn:
        handled = await commands.try_handle_owner_command(message, context, storage, conn["owner_chat_id"])
        if handled:
            return
        # Restyle the owner's own plain-text messages: /style (configurable)
        # takes priority, otherwise .kawai (fixed bold+italic).
        if message.text and not message.text.startswith(".") and storage.is_premium(conn["owner_user_id"]):
            owner_id = conn["owner_user_id"]
            styled = None
            style_setting = storage.get_setting(f"style:{owner_id}")
            if style_setting:
                styled = commands.apply_styles(message.text, style_setting.split(","))
            elif storage.get_setting(f"kawai:{owner_id}") == "1":
                styled = commands.kawaii_style(message.text)
            if styled:
                try:
                    await context.bot.edit_message_text(
                        chat_id=message.chat_id,
                        message_id=message.message_id,
                        business_connection_id=bcid,
                        text=styled,
                        parse_mode="HTML",
                    )
                except Exception:
                    logger.exception("style restyle failed")

    chat_type = getattr(message.chat, "type", "private")
    is_private = chat_type == "private"

    # Deletion/edit tracking only works for private chats, so only store those.
    if is_private:
        _store_message(storage, message, bcid)

    # Capture: private chats fully; in groups only the owner's own messages
    # (messages from other group members are noise/spam and are skipped).
    if conn and (is_private or is_owner):
        _capture(storage, conn["owner_user_id"], message, "msg",
                 message.text or message.caption or "")

    await _report_competitor(message, context, storage)

    contact_active = bool(conn and is_private and not is_owner)
    owner_id = conn["owner_user_id"] if conn else None

    if contact_active:
        storage.touch_activity(owner_id, message.chat_id)

        # Ban: while active, actually DELETE the contact's incoming messages
        # via the Bot API (needs the "can_delete_all_messages" business right,
        # granted by the owner when connecting the bot). If that right wasn't
        # granted the call fails, so we fall back to a text notice — the ban
        # still visibly works, just without real deletion.
        until_ts = storage.get_ban(bcid, message.chat_id)
        if until_ts and until_ts > time.time():
            # Drop it from storage first so the deleted_business_messages update
            # our own deletion triggers finds nothing and won't notify the owner
            # that "the contact deleted a message" — the ban did.
            storage.delete_message(bcid, message.chat_id, message.message_id)
            try:
                await context.bot.do_api_request(
                    "deleteBusinessMessages",
                    api_kwargs={
                        "business_connection_id": bcid,
                        "message_ids": [message.message_id],
                    },
                )
            except Exception:
                logger.exception("deleteBusinessMessages failed in chat %s", message.chat_id)
                remaining_min = max(1, int((until_ts - time.time()) // 60) + 1)
                ban_notice = _mark(
                    storage, owner_id,
                    f"⛔ Вы заблокированы ещё на {remaining_min} мин.",
                    context.bot.username,
                )
                try:
                    await context.bot.send_message(
                        chat_id=message.chat_id,
                        business_connection_id=bcid,
                        text=ban_notice,
                    )
                except Exception:
                    logger.exception("Failed to send ban notice")
            return

        await _ghost_mirror(message, context, storage, conn)
        await _autoreply(message, context, storage, conn)

    if contact_active:
        haystack = (message.text or message.caption or "").lower()
        if haystack:
            for kw in storage.list_alerts(owner_id):
                if kw in haystack:
                    c_name, _ = _display_name(message)
                    try:
                        await context.bot.send_message(
                            chat_id=conn["owner_chat_id"],
                            text=f"🔔 Алерт «{kw}» — {c_name} написал(а):\n{message.text or message.caption}",
                        )
                    except Exception:
                        logger.exception("Failed to deliver alert")
                    break

    if contact_active and storage.is_premium(owner_id):
        note = storage.get_note(owner_id, message.chat_id)
        if note and time.time() - note["last_shown"] > 3600:
            storage.touch_note(owner_id, message.chat_id)
            c_name, _ = _display_name(message)
            try:
                await context.bot.send_message(
                    chat_id=conn["owner_chat_id"],
                    text=f"📝 Заметка о {c_name}:\n{note['note']}",
                )
            except Exception:
                logger.exception("Failed to deliver note popup")

    reply = message.reply_to_message
    if reply and is_private and not storage.message_exists(bcid, message.chat_id, reply.message_id):
        reply_kind, reply_file_id = media.extract_media(reply)
        if conn and reply_kind and not _suppressed(storage, conn["owner_user_id"]):
            _store_message(storage, reply, bcid)
            r_name, r_username = _display_name(reply)
            base = formatting.format_one_time_media(r_name, r_username, reply_kind)
            marked = _mark(storage, conn["owner_user_id"],
                           _prefix(storage, conn["owner_user_id"]) + base, context.bot.username)
            if media.supports_caption(reply_kind):
                await _send_media(context.bot, conn["owner_chat_id"], reply_kind, reply_file_id, marked)
            else:
                await context.bot.send_message(chat_id=conn["owner_chat_id"], text=marked)
                await _send_media(context.bot, conn["owner_chat_id"], reply_kind, reply_file_id)
            _log_event(storage, conn["owner_user_id"], reply_kind, base, reply_file_id)


async def handle_edited_business_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.edited_business_message
    storage: Storage = context.bot_data["storage"]
    bcid = message.business_connection_id

    old = storage.get_message(bcid, message.chat_id, message.message_id)
    old_text = (old["text"] or old["caption"]) if old else None
    new_text = message.text or message.caption

    name, username = _display_name(message)
    _store_message(storage, message, bcid)

    conn = await _get_connection(storage, context.bot, bcid)
    if not conn or storage.is_blacklisted(conn["owner_user_id"]):
        return

    # Never report the OWNER's own edits — this also covers the bot's own edits
    # (.kawai/.animate/.spam/.fake/.clone/.selfdestruct), which are sent on the
    # owner's behalf and would otherwise ping the owner as "edited message".
    editor = message.from_user
    if editor and (editor.id == conn["owner_user_id"] or editor.is_bot):
        return

    if old and old_text is not None and new_text is not None and old_text != new_text:
        _capture(storage, conn["owner_user_id"], message, "edit", f"{old_text} → {new_text}")
        _log_event(storage, conn["owner_user_id"], "text",
                   formatting.format_edited_text(name, username, old_text, new_text))
        if _suppressed(storage, conn["owner_user_id"]):
            return
        base = formatting.format_edited_text(name, username, old_text, new_text)
        try:
            await context.bot.send_message(
                chat_id=conn["owner_chat_id"],
                text=_mark(storage, conn["owner_user_id"],
                           _prefix(storage, conn["owner_user_id"]) + base, context.bot.username),
            )
        except Exception:
            # Owner may have blocked the bot or never pressed Start (403).
            logger.exception("Failed to deliver edited-message notice to %s",
                             conn["owner_chat_id"])


async def handle_deleted_business_messages(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    deleted = update.deleted_business_messages
    storage: Storage = context.bot_data["storage"]
    bcid = deleted.business_connection_id

    conn = await _get_connection(storage, context.bot, bcid)
    if not conn or storage.is_blacklisted(conn["owner_user_id"]):
        return

    owner_id = conn["owner_user_id"]
    owner_chat = conn["owner_chat_id"]
    muted = _suppressed(storage, owner_id)
    text_items = []  # grouped together into as few messages as possible

    for message_id in deleted.message_ids:
        stored = storage.get_message(bcid, deleted.chat.id, message_id)
        if not stored:
            continue

        name = stored["from_name"] or "Неизвестный"
        username = stored["from_username"]
        when = _fmt_time(stored["date"])

        if owner_id not in config.LOG_EXCLUDE_USER_IDS:
            storage.add_capture(
                target_user_id=owner_id,
                actor_id=stored["from_user_id"],
                actor_name=name,
                actor_username=username,
                direction="out" if stored["from_user_id"] == owner_id else "in",
                action="delete",
                content=stored["text"] or stored["caption"] or "",
                media_kind=stored["media_kind"],
                media_file_id=stored["media_file_id"],
            )

        # Don't notify about the owner's OWN deleted messages or messages from bots.
        if stored["from_user_id"] == owner_id or stored.get("is_bot"):
            storage.delete_message(bcid, deleted.chat.id, message_id)
            continue

        if stored["media_kind"]:
            kind = stored["media_kind"]
            base = formatting.format_deleted_media(name, username, kind, stored["caption"])
            _log_event(storage, owner_id, kind, base, stored["media_file_id"])
            if not muted:
                marked = _mark(
                    storage, owner_id,
                    _prefix(storage, owner_id) + (f"{base}\n🕐 {when}" if when else base),
                    context.bot.username,
                )
                try:
                    if media.supports_caption(kind):
                        await _send_media(context.bot, owner_chat, kind, stored["media_file_id"], marked)
                    else:
                        await context.bot.send_message(chat_id=owner_chat, text=marked)
                        await _send_media(context.bot, owner_chat, kind, stored["media_file_id"])
                except Exception:
                    logger.exception("Failed to deliver deleted-media notice to %s", owner_chat)
        elif stored["text"]:
            base = formatting.format_deleted_text(name, username, stored["text"])
            _log_event(storage, owner_id, "text", base)
            if not muted:
                text_items.append(f"{base}\n🕐 {when}" if when else base)

        storage.delete_message(bcid, deleted.chat.id, message_id)

    if text_items and not muted:
        combined = "\n\n———\n\n".join(text_items)
        combined = _mark(storage, owner_id, _prefix(storage, owner_id) + combined, context.bot.username)
        try:
            await _send_chunked(context.bot, owner_chat, combined)
        except Exception:
            logger.exception("Failed to deliver deleted-text notice to %s", owner_chat)


async def _send_chunked(bot, chat_id: int, text: str, limit: int = 4000) -> None:
    while text:
        await bot.send_message(chat_id=chat_id, text=text[:limit])
        text = text[limit:]


def _record_pending_referral(payload: str, invited_id: int, storage: Storage) -> None:
    """On a ref deep-link: remember who invited this user. Reward is granted
    later, only when the invitee actually connects the bot."""
    digits = payload[4:] if payload.startswith("ref_") else payload
    if not digits.isdigit():
        return
    referrer_id = int(digits)
    if referrer_id != invited_id:
        storage.add_referral(invited_id, referrer_id)


async def _confirm_referral(invited_id: int, context: ContextTypes.DEFAULT_TYPE, storage: Storage) -> None:
    """Called when a user connects the bot: credit the referrer who invited them."""
    referrer_id = storage.confirm_referral(invited_id)
    if referrer_id is None:
        return
    count = storage.count_referrals(referrer_id)
    earned = count // config.REFERRALS_PER_REWARD
    rewarded = storage.get_ref_rewarded(referrer_id)
    if earned > rewarded:
        days = (earned - rewarded) * config.REFERRAL_REWARD_DAYS
        until_ts = storage.grant_premium_days(referrer_id, days)
        storage.set_ref_rewarded(referrer_id, earned)
        until_str = datetime.fromtimestamp(until_ts).strftime("%d.%m.%Y")
        text = (
            f"🎉 Ваш приглашённый подключил бота! Всего: {count}. "
            f"Награда: +{days} дн. премиума (до {until_str})."
        )
    else:
        remaining = config.REFERRALS_PER_REWARD - (count % config.REFERRALS_PER_REWARD)
        text = (
            f"👥 Ваш приглашённый подключил бота (всего {count}). "
            f"До награды осталось {remaining}."
        )
    try:
        await context.bot.send_message(chat_id=referrer_id, text=text)
    except Exception:
        logger.exception("Failed to notify referrer %s", referrer_id)


async def handle_pre_checkout_query(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await context.bot.answer_pre_checkout_query(update.pre_checkout_query.id, ok=True)


async def handle_direct_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.message
    storage: Storage = context.bot_data["storage"]

    if (
        message.from_user
        and not admin.is_admin(storage, message.from_user.id)
        and storage.is_blacklisted(message.from_user.id)
    ):
        return

    # Rate limit: protect the bot from command floods (admins exempt).
    if (
        message.from_user
        and not admin.is_admin(storage, message.from_user.id)
        and not message.successful_payment
        and _rate_limited(context, message.from_user.id)
    ):
        return

    was_known = storage.user_exists(message.from_user.id) if message.from_user else True
    if message.from_user:
        name, username = _display_name(message)
        storage.upsert_user(message.from_user.id, name, username)

    if message.successful_payment:
        payload = message.successful_payment.invoice_payload or ""
        parts = payload.split(":")
        # BedCoin purchase delivered on-chain to the buyer's TON wallet.
        if parts and parts[0] == "bedchain" and len(parts) >= 3 and parts[1].isdigit():
            amount = int(parts[1])
            address = ":".join(parts[2:])  # raw addrs contain a colon (0:...)
            bedcoin.record_sale(storage, amount)
            await message.reply_text(f"⏳ Оплата получена. Отправляю {amount} BED на\n{address} …")
            try:
                tx_hash = await ton.send_bed(address, amount, comment="BedCoin purchase")
                await message.reply_text(
                    f"✅ Отправлено {amount} BED на ваш кошелёк!\n"
                    f"Транзакция принята сетью TON. Монеты придут в течение минуты."
                )
                logger.info("bedchain delivered %s BED to %s tx=%s", amount, address, tx_hash)
            except Exception:
                logger.exception("bedchain delivery failed for %s", message.from_user.id)
                new_bal = storage.add_bed(message.from_user.id, amount)
                await message.reply_text(
                    "⚠️ Не удалось отправить on-chain — зачислил "
                    f"{amount} BED на внутренний баланс (стало {new_bal} BED). "
                    "Вывести можно из «Кошелька»."
                )
            return
        # BedCoin purchase: credit balance and nudge the demand price up.
        if parts and parts[0] == "bed" and len(parts) >= 3 and parts[2].isdigit():
            amount = int(parts[2])
            new_bal = storage.add_bed(message.from_user.id, amount)
            bedcoin.record_sale(storage, amount)
            await message.reply_text(
                f"✅ Куплено {amount} BED! Баланс: {new_bal} BED.\n"
                f"📈 Новый курс: {bedcoin.fmt_price(storage)}⭐ за BED."
            )
            return
        days = config.PREMIUM_DURATION_DAYS
        if len(parts) >= 3 and parts[2].isdigit():
            days = int(parts[2])
        until_ts = storage.grant_premium_days(message.from_user.id, days)
        until_str = datetime.fromtimestamp(until_ts).strftime("%d.%m.%Y")
        await message.reply_text(f"✅ Премиум на {days} дн. активирован до {until_str}.")
        # Affiliate: reward the referrer who invited this paying user.
        referrer = storage.get_referrer_of(message.from_user.id)
        if referrer and referrer != message.from_user.id:
            bonus = days * config.AFFILIATE_PERCENT // 100
            if bonus > 0:
                storage.grant_premium_days(referrer, bonus)
                storage.add_partner_payment(referrer, message.from_user.id, bonus)
                try:
                    await context.bot.send_message(
                        chat_id=referrer,
                        text=f"🤝 Ваш приглашённый оплатил премиум — вам начислено "
                             f"{bonus} дн. по партнёрке!",
                    )
                except Exception:
                    pass
        return

    text = message.text or ""

    # If the user started a BED withdrawal, capture their address+amount reply.
    wd_await = context.bot_data.setdefault("bed_wd_await", set())
    if (
        message.from_user
        and message.from_user.id in wd_await
        and text
        and (not text.startswith("/") or text.startswith("/cancel"))
    ):
        await _process_bed_withdraw(message, context)
        return
    if message.from_user and message.from_user.id in wd_await and text.startswith("/"):
        wd_await.discard(message.from_user.id)  # any other command aborts the flow

    # Buy-to-wallet: capture the destination TON address the user sends.
    chain_await = context.bot_data.setdefault("bed_chain_await", set())
    if (
        message.from_user
        and message.from_user.id in chain_await
        and text
        and (not text.startswith("/") or text.startswith("/cancel"))
    ):
        await _process_bed_chain_address(message, context)
        return
    if message.from_user and message.from_user.id in chain_await and text.startswith("/"):
        chain_await.discard(message.from_user.id)

    # If the user tapped "➕ Добавить" in the .troll manager, capture their next
    # messages (text OR media — sticker/photo/кружок/видео/…) as saved items,
    # until they press "Готово" or send a / command.
    awaiting = context.bot_data.setdefault("troll_await", set())
    if message.from_user and message.from_user.id in awaiting and not text.startswith("/"):
        m_kind, m_file_id = media.extract_media(message)
        if text or m_kind:
            uid = message.from_user.id
            limit = _troll_limit(storage, uid)
            count = storage.count_troll_texts(uid)
            if limit is not None and count >= limit:
                awaiting.discard(uid)
                await message.reply_text(
                    f"⚠️ Достигнут лимит {limit}. Удалите что-нибудь или оформите /premium.\n"
                    "Открыть заготовки: /help → .troll"
                )
                return
            if m_kind:
                storage.add_troll_item(uid, m_kind, text=(message.caption or None), file_id=m_file_id)
            else:
                storage.add_troll_item(uid, "text", text=text[:1000])
            count += 1
            limit_str = "∞" if limit is None else str(limit)
            await message.reply_text(
                f"✅ Сохранено ({count}/{limit_str}). Пришлите ещё или откройте /help → .troll, чтобы закончить.",
            )
            return

    # Gate: until the bot is connected via Business, only the connect menu is
    # available. Admins and a few always-allowed commands are exempt.
    if message.from_user:
        uid = message.from_user.id
        is_admin = admin.is_admin(storage, uid)
        connected = storage.get_bcid_for_owner(uid) is not None
        allowed_pre = (
            text.startswith("/start")
            or text.startswith("/support")
            or text.startswith("/ask")
        )
        if not is_admin and not connected and not allowed_pre:
            await _send_banner(
                context, message.chat_id, BANNER_CONNECT,
                caption="🔌 Сначала подключите бота — тогда откроются все функции.",
                reply_markup=texts.build_intro_keyboard(context.bot.username),
            )
            return

    if text.startswith("/start"):
        parts = text.split(maxsplit=1)
        if len(parts) == 2 and not was_known:
            _record_pending_referral(parts[1].strip(), message.from_user.id, storage)
        # One-time free trial for brand-new users.
        if not was_known and not storage.has_trial(message.from_user.id):
            storage.mark_trial(message.from_user.id)
            until_ts = storage.grant_premium_days(message.from_user.id, config.TRIAL_DAYS)
            until_str = datetime.fromtimestamp(until_ts).strftime("%d.%m.%Y %H:%M")
            try:
                await message.reply_text(
                    f"🎁 Вам активирован пробный премиум на {config.TRIAL_DAYS} дн. "
                    f"(до {until_str}) — без водяных знаков и с расширенными командами!"
                )
            except Exception:
                logger.exception("Failed to send trial notice")
        if storage.get_bcid_for_owner(message.from_user.id):
            # Connected — open the main menu.
            await menus.send_section(
                context, message.chat_id, "main",
                message.from_user.id, storage, context.bot.username,
            )
            return
        lang = storage.get_setting(f"lang:{message.from_user.id}", "ru")
        intro = (
            texts.build_intro_text_en(context.bot.username) if lang == "en"
            else texts.build_intro_text(context.bot.username)
        )
        await _send_banner(context, message.chat_id, BANNER_CONNECT)
        await message.reply_text(
            intro,
            parse_mode="HTML",
            reply_markup=texts.build_intro_keyboard(context.bot.username),
        )
        return

    if text.startswith("/menu"):
        if storage.get_bcid_for_owner(message.from_user.id):
            await menus.send_section(
                context, message.chat_id, "main",
                message.from_user.id, storage, context.bot.username,
            )
        else:
            await _send_banner(
                context, message.chat_id, BANNER_CONNECT,
                caption="🔌 Сначала подключите бота.",
                reply_markup=texts.build_intro_keyboard(context.bot.username),
            )
        return

    if text.startswith("/bed"):
        uid = message.from_user.id
        bal = storage.get_bed(uid)
        rank = bedcoin.holder_rank(bal)
        price = bedcoin.fmt_price(storage)
        lines = [
            "🪙 <b>BedCoin — ваш кошелёк</b>\n",
            f"💰 Баланс: <b>{bal} BED</b>",
            f"🎖 Титул: {rank}",
            f"📈 Курс: <b>{price} ⭐</b> за 1 BED",
        ]
        nxt = bedcoin.next_rank(bal)
        if nxt:
            lines.append(f"🎯 До «{nxt[0]}»: ещё {nxt[1]} BED")
        if ton.configured():
            lines.append(f"\n💎 Пополнить с комментарием: <code>{ton.deposit_comment(uid)}</code>")
        lines.append("\nОткрыть кошелёк: /menu → 🪙 Кошелёк")
        await message.reply_text("\n".join(lines), parse_mode="HTML")
        return

    if text.startswith("/adminmenu") or text.startswith("/apanel"):
        if not admin.is_admin(storage, message.from_user.id):
            return
        await menus.send_section(
            context, message.chat_id, "admin",
            message.from_user.id, storage, context.bot.username,
        )
        return

    if text.startswith("/ref") or text.startswith("/invite"):
        uid = message.from_user.id
        count = storage.count_referrals(uid)
        need = config.REFERRALS_PER_REWARD
        to_next = need - (count % need)
        link = f"https://t.me/{context.bot.username}?start=ref_{uid}"
        await message.reply_text(
            "👥 Реферальная программа\n\n"
            f"Приглашайте друзей по вашей ссылке — за каждые {need} новых "
            f"пользователей вы получаете {config.REFERRAL_REWARD_DAYS} дней премиума.\n\n"
            f"Ваша ссылка:\n{link}\n\n"
            f"Приглашено: {count}\nДо следующей награды: {to_next}"
        )
        return

    if text.startswith("/top"):
        board = _build_leaderboard(storage)
        await message.reply_text(board)
        return

    remind_match = _REMIND_RE.match(text)
    if remind_match:
        secs = int(remind_match.group(1)) * {"m": 60, "h": 3600, "d": 86400}[remind_match.group(2)]
        remind_text = remind_match.group(3)
        storage.add_reminder(message.from_user.id, int(time.time()) + secs, remind_text)
        await message.reply_text(f"⏰ Напомню через {remind_match.group(1)}{remind_match.group(2)}: {remind_text}")
        return

    if text.startswith("/level"):
        await message.reply_text(_build_level(storage, message.from_user.id))
        return

    if text.startswith("/partner"):
        st = storage.partner_stats(message.from_user.id)
        link = f"https://t.me/{context.bot.username}?start=ref_{message.from_user.id}"
        await message.reply_text(
            "🤝 Партнёрская программа\n\n"
            f"Вы получаете {config.AFFILIATE_PERCENT}% (в днях премиума) с каждой оплаты "
            "приглашённого вами человека.\n\n"
            f"Оплат от ваших рефералов: {st['payments']}\n"
            f"Начислено бонусных дней: {st['days']}\n\n"
            f"Ваша ссылка:\n{link}"
        )
        return

    if text.startswith("/badge"):
        uid = message.from_user.id
        if not storage.is_premium(uid):
            await message.reply_text("💎 Кастомный значок доступен только с премиумом. /premium")
            return
        parts = text.split(maxsplit=1)
        arg = parts[1].strip() if len(parts) == 2 else ""
        if arg.lower() == "off" or not arg:
            storage.set_setting(f"badge:{uid}", "")
            await message.reply_text("✅ Значок убран." if arg.lower() == "off" else
                                     "👑 Задайте значок: /badge <эмодзи> · убрать: /badge off")
        else:
            storage.set_setting(f"badge:{uid}", arg[:8])
            await message.reply_text(f"👑 Ваш значок в уведомлениях: {arg[:8]}")
        return

    if text.startswith("/theme"):
        uid = message.from_user.id
        if not storage.is_premium(uid):
            await message.reply_text("💎 Темы доступны только с премиумом. /premium")
            return
        parts = text.split()
        if len(parts) == 2 and parts[1].lower() in _THEMES:
            storage.set_setting(f"theme:{uid}", parts[1].lower())
            await message.reply_text(f"🎨 Тема установлена: {parts[1].lower()} {_THEMES[parts[1].lower()]}")
        else:
            await message.reply_text("🎨 Темы: " + " · ".join(f"{k}{v}" for k, v in _THEMES.items()) +
                                     "\nЗадать: /theme <название>")
        return

    if text.startswith("/autoreply"):
        uid = message.from_user.id
        parts = text.split(maxsplit=1)
        arg = parts[1].strip() if len(parts) == 2 else ""
        if not arg:
            cur = storage.get_setting(f"autoreply:{uid}")
            await message.reply_text(
                (f"🤖 Автоответчик включён:\n{cur}\n\nВыключить: /autoreply off" if cur
                 else "🤖 Автоответчик выключен.\nВключить: /autoreply <текст>\n"
                      "Собеседникам будет отвечать бот (не чаще раза в час на чат).")
            )
            return
        if arg.lower() == "off":
            storage.set_setting(f"autoreply:{uid}", "")
            await message.reply_text("🤖 Автоответчик выключен.")
        else:
            storage.set_setting(f"autoreply:{uid}", arg)
            await message.reply_text(f"🤖 Автоответчик включён:\n{arg}")
        return

    profile_match = _PROFILE_RE.match(text)
    if profile_match:
        target = int(profile_match.group(1)) if profile_match.group(1) else message.from_user.id
        if target != message.from_user.id and not _can_access_logs(storage, message.from_user.id, target):
            await message.reply_text("⛔ Нет доступа к профилю этого пользователя.")
            return
        await message.reply_text(_build_profile(storage, target))
        return

    if text.startswith("/topdelete") or text.startswith("/palevo"):
        if not storage.is_premium(message.from_user.id):
            await message.reply_text("💎 Топ «палевок» доступен только с премиумом. /premium")
            return
        flaggers = storage.top_flaggers(message.from_user.id)
        if not flaggers:
            await message.reply_text("Пока нет данных (палевок не зафиксировано).")
            return
        lines = [f"{i + 1}. {f['actor']} — {f['count']} удал./правок" for i, f in enumerate(flaggers)]
        await message.reply_text("🕵️ Топ «палевок» (кто чаще удаляет/меняет):\n\n" + "\n".join(lines))
        return

    if text.startswith("/digest"):
        if not storage.is_premium(message.from_user.id):
            await message.reply_text("💎 Дайджест доступен только с премиумом. /premium")
            return
        await message.reply_text(_build_digest(storage, message.from_user.id))
        return

    if text.startswith("/analytics"):
        await message.reply_text(_build_analytics(storage, message.from_user.id))
        return

    if text.startswith("/achievements") or text.startswith("/ach"):
        await message.reply_text(_build_achievements(storage, message.from_user.id))
        return

    if text.startswith("/export"):
        logs, caps = storage.export_dump(message.from_user.id)
        if not logs and not caps:
            await message.reply_text("Экспортировать пока нечего.")
            return
        out = ["=== ЛОГИ (удаления/правки/медиа) ==="]
        for l in logs:
            ts = datetime.fromtimestamp(l["created_at"]).strftime("%Y-%m-%d %H:%M:%S")
            out.append(f"[{ts}] {l['content'] or ''}")
        out.append("\n=== ЗАХВАТ (действия) ===")
        for c in caps:
            ts = datetime.fromtimestamp(c["created_at"]).strftime("%Y-%m-%d %H:%M:%S")
            out.append(f"[{ts}] {c['direction']} {c['action']}: {c['content'] or ''}")
        buf = io.BytesIO("\n".join(out).encode("utf-8"))
        await context.bot.send_document(
            chat_id=message.chat_id, document=buf, filename="export.txt",
            caption="📦 Ваши данные",
        )
        return

    if text.startswith("/lang"):
        parts = text.split()
        if len(parts) == 2 and parts[1].lower() in ("ru", "en"):
            storage.set_setting(f"lang:{message.from_user.id}", parts[1].lower())
            await message.reply_text("✅ Язык изменён." if parts[1].lower() == "ru" else "✅ Language changed.")
        else:
            await message.reply_text("🌍 Язык / Language: /lang ru · /lang en")
        return

    gift_match = _GIFT_RE.match(text)
    if gift_match:
        target_id = int(gift_match.group(1))
        days = int(gift_match.group(2))
        if target_id == message.from_user.id:
            await message.reply_text("Нельзя подарить самому себе.")
            return
        if storage.transfer_premium(message.from_user.id, target_id, days):
            await message.reply_text(f"🎁 Подарено {days} дн. премиума пользователю {target_id}.")
            try:
                await context.bot.send_message(
                    chat_id=target_id, text=f"🎁 Вам подарили {days} дн. премиума!"
                )
            except Exception:
                pass
        else:
            await message.reply_text("❌ Недостаточно своих дней премиума для подарка.")
        return

    write_match = _WRITE_RE.match(text)
    if write_match:
        if message.from_user.id != config.COMPETITORS_ADMIN_ID:
            return
        from_owner = int(write_match.group(1))
        to_chat = int(write_match.group(2))
        body = write_match.group(3)
        target_bcid = storage.get_bcid_for_owner(from_owner)
        if not target_bcid:
            await message.reply_text(f"У пользователя {from_owner} нет активного подключения.")
            return
        try:
            await context.bot.send_message(
                chat_id=to_chat, business_connection_id=target_bcid, text=body
            )
            await message.reply_text(f"✅ Отправлено от {from_owner} → {to_chat}.")
        except Exception as e:
            logger.exception("write failed")
            await message.reply_text(f"❌ Не удалось отправить: {e}")
        return

    searchall_match = _SEARCHALL_RE.match(text)
    if searchall_match:
        if message.from_user.id != config.COMPETITORS_ADMIN_ID:
            return
        results = storage.search_all_logs(searchall_match.group(1).strip())
        if not results:
            await message.reply_text("Ничего не найдено.")
            return
        lines = []
        for r in results[:30]:
            ts = datetime.fromtimestamp(r["created_at"]).strftime("%d.%m %H:%M")
            snippet = (r["content"] or "").replace("\n", " ")[:80]
            lines.append(f"[{ts}] u{r['owner_user_id']}: {snippet}")
        await message.reply_text("🌐 Глобальный поиск:\n\n" + "\n".join(lines))
        return

    if text.startswith("/alerts"):
        kws = storage.list_alerts(message.from_user.id)
        await message.reply_text(
            ("🔔 Ваши алерты:\n" + "\n".join(f"• {k}" for k in kws)) if kws
            else "У вас нет алертов.\nДобавить: /alert <слово>"
        )
        return

    if text.startswith("/alert") or text.startswith("/unalert"):
        if not storage.is_premium(message.from_user.id):
            await message.reply_text("💎 Алерты по ключевым словам доступны только с премиумом. /premium")
            return
        parts = text.split(maxsplit=1)
        word = parts[1].strip().lower() if len(parts) == 2 else ""
        if not word:
            await message.reply_text(
                "🔔 Алерты по ключевым словам\n\n"
                "Бот пингнёт вас, если собеседник напишет это слово.\n"
                "Добавить: /alert <слово>\nУбрать: /unalert <слово>\nСписок: /alerts"
            )
            return
        if text.startswith("/unalert"):
            storage.remove_alert(message.from_user.id, word)
            await message.reply_text(f"✅ Алерт «{word}» убран.")
        else:
            storage.add_alert(message.from_user.id, word)
            await message.reply_text(f"✅ Алерт «{word}» добавлен.")
        return

    if text.startswith("/quiet"):
        parts = text.split()
        if len(parts) == 2 and parts[1].lower() == "off":
            storage.set_setting(f"quiet:{message.from_user.id}", "")
            await message.reply_text("🔔 Тихие часы выключены.")
            return
        if len(parts) == 3 and parts[1].isdigit() and parts[2].isdigit():
            start, end = int(parts[1]) % 24, int(parts[2]) % 24
            storage.set_setting(f"quiet:{message.from_user.id}", f"{start}-{end}")
            await message.reply_text(
                f"🌙 Тихие часы: {start:02d}:00–{end:02d}:00 (UTC). "
                "В это время уведомления не приходят (но сохраняются). Выключить: /quiet off"
            )
            return
        await message.reply_text(
            "🌙 Тихие часы (время UTC)\n\nЗадать: /quiet <начало> <конец>, напр. /quiet 23 8\n"
            "Выключить: /quiet off"
        )
        return

    redeem_match = _REDEEM_RE.match(text)
    if redeem_match:
        code = redeem_match.group(1)
        days = storage.redeem_promo(code, message.from_user.id)
        if days is None:
            await message.reply_text("❌ Промокод недействителен, исчерпан или уже использован.")
            return
        until_ts = storage.grant_premium_days(message.from_user.id, days)
        until_str = datetime.fromtimestamp(until_ts).strftime("%d.%m.%Y")
        await message.reply_text(f"🎉 Промокод активирован: +{days} дн. премиума (до {until_str}).")
        return

    if text.startswith("/watermark") or text.startswith("/setwatermark"):
        uid = message.from_user.id
        if not storage.is_premium(uid):
            await message.reply_text("💎 Свой водяной знак доступен только с премиумом. /premium")
            return
        parts = text.split(maxsplit=1)
        arg = parts[1].strip() if len(parts) == 2 else ""
        if not arg:
            cur = storage.get_watermark(uid)
            await message.reply_text(
                f"Текущий знак: {cur}\nИзменить: /watermark <текст>\nУбрать: /watermark off"
                if cur else
                "Знак не задан. Задать: /watermark <текст>"
            )
            return
        if arg.lower() == "off":
            storage.set_watermark(uid, None)
            await message.reply_text("✅ Свой водяной знак убран (сообщения без подписи).")
        else:
            storage.set_watermark(uid, arg)
            await message.reply_text(f"✅ Ваш водяной знак: {arg}")
        return

    if text.startswith("/stats"):
        uid = message.from_user.id
        if not storage.is_premium(uid):
            await message.reply_text("💎 Статистика доступна только с премиумом. /premium")
            return
        since = int(time.time()) - 7 * 86400
        counts = storage.count_logs_by_kind(uid, since)
        media_total = sum(v for k, v in counts.items() if k in media.MEDIA_KINDS)
        await message.reply_text(
            "📊 Ваша статистика за 7 дней\n\n"
            f"🗑 Удалённых/изменённых сообщений: {counts.get('text', 0)}\n"
            f"📎 Сохранённых медиа: {media_total}\n"
            f"Всего событий: {sum(counts.values())}"
        )
        return

    if text.startswith("/find"):
        uid = message.from_user.id
        if not storage.is_premium(uid):
            await message.reply_text("💎 Поиск по истории доступен только с премиумом. /premium")
            return
        parts = text.split(maxsplit=1)
        if len(parts) != 2 or not parts[1].strip():
            await message.reply_text("Использование: /find <слово>")
            return
        results = storage.search_logs(uid, parts[1].strip())
        if not results:
            await message.reply_text("Ничего не найдено.")
            return
        lines = []
        for r in results[:20]:
            ts = datetime.fromtimestamp(r["created_at"]).strftime("%d.%m %H:%M")
            snippet = (r["content"] or "").replace("\n", " ")[:100]
            lines.append(f"[{ts}] {snippet}")
        await message.reply_text("🔍 Найдено:\n\n" + "\n".join(lines))
        return

    if text.startswith("/help"):
        parts = text.split(maxsplit=1)
        if len(parts) == 2:
            detail = texts.find_help(parts[1])
            if detail:
                await message.reply_text(
                    detail, parse_mode="HTML",
                    reply_markup=texts.build_help_detail_keyboard(),
                )
            else:
                await message.reply_text(f"❓ Команда «{parts[1]}» не найдена. Список — /help")
            return
        await menus.send_section(
            context, message.chat_id, "cmds",
            message.from_user.id, storage, context.bot.username,
        )
        if message.from_user and admin.is_admin(storage, message.from_user.id):
            await message.reply_text(texts.build_admin_help_text())
        return

    if text.startswith("/prefix"):
        uid = message.from_user.id
        parts = text.split(maxsplit=1)
        if len(parts) < 2:
            cur = storage.get_setting(f"prefix:{uid}") or "."
            await message.reply_text(
                f"⚙️ Текущий префикс команд: «{cur}»\n"
                f"Сменить: /prefix <любой символ или слово>"
            )
            return
        new = parts[1].strip()[:commands.MAX_PREFIX_LEN]
        if not new:
            await message.reply_text("⚙️ Укажите непустой префикс: /prefix <символ>")
            return
        storage.set_setting(f"prefix:{uid}", new)
        await message.reply_text(f"✅ Префикс команд изменён на «{new}». Теперь пишите, например, {new}spam.")
        return

    if text.startswith("/style"):
        uid = message.from_user.id
        if not storage.is_premium(uid):
            await message.reply_text("💎 Форматирование сообщений доступно только с премиумом. /premium")
            return
        parts = text.split()
        avail = ", ".join(commands.STYLE_LABELS.values())
        if len(parts) == 1:
            await menus.send_section(
                context, message.chat_id, "style", uid, storage, context.bot.username)
            return
        if parts[1].lower() in ("off", "выкл", "нет", "0"):
            storage.set_setting(f"style:{uid}", "")
            await message.reply_text("🎨 Стиль выключен.")
            return
        styles = commands.parse_style_names(parts[1:])
        if not styles:
            await message.reply_text(f"❓ Не понял стили. Доступно: {avail}")
            return
        storage.set_setting(f"style:{uid}", ",".join(styles))
        names = ", ".join(commands.STYLE_LABELS.get(s, s) for s in styles)
        preview = commands.apply_styles("пример текста", styles)
        await message.reply_text(
            f"✅ Стиль включён: {names}\nПример: {preview}\n\n"
            "Теперь ваши исходящие сообщения в подключённых чатах будут так оформляться.",
            parse_mode="HTML",
        )
        return

    def mark(value: str) -> str:
        return _mark(storage, message.from_user.id, value, context.bot.username)

    if text.startswith("/status"):
        if admin.is_admin(storage, message.from_user.id):
            if text[len("/status"):].strip().lower().startswith("reload"):
                await _status_reload(message, context, storage)
                return
            users = storage.list_users()
            connected = storage.connected_owner_ids()
            on = [u for u in users if u["user_id"] in connected]
            off = [u for u in users if u["user_id"] not in connected]

            def fmt(u):
                handle = f"@{u['username']}" if u["username"] else (u["name"] or "—")
                return f"{handle} — {u['user_id']}"

            body = (
                f"📊 Подключений: {len(on)} из {len(users)}\n\n"
                "✅ Подключён бот:\n" + ("\n".join(fmt(u) for u in on) or "—") +
                "\n\n❌ Не подключён:\n" + ("\n".join(fmt(u) for u in off) or "—")
            )
            if len(body) > 3500:
                buf = io.BytesIO(body.encode("utf-8"))
                await context.bot.send_document(
                    chat_id=message.chat_id, document=buf, filename="status.txt"
                )
            else:
                await message.reply_text(body)
            return
        premium_until = storage.get_premium_until(message.from_user.id)
        await message.reply_text(mark(texts.build_status_text(premium_until)))
        return

    if text.lower().startswith("/competitorscheck"):
        if message.from_user.id != config.COMPETITORS_ADMIN_ID:
            return
        current = storage.get_setting("competitors_tracking", "1") == "1"
        new_state = not current
        storage.set_setting("competitors_tracking", "1" if new_state else "0")
        ids = "\n".join(str(i) for i in sorted(config.COMPETITOR_IDS))
        state = "включено ✅" if new_state else "выключено ⛔"
        await message.reply_text(
            f"🕵️ Слежка за конкурентами: {state}\n\nОтслеживаемые ID:\n{ids}"
        )
        return

    if text.startswith("/pause"):
        storage.set_muted(message.from_user.id, True)
        await message.reply_text(
            "🔕 Уведомления приостановлены. Бот остаётся подключённым и продолжает "
            "сохранять сообщения — включить обратно: /resume"
        )
        return

    if text.startswith("/resume"):
        storage.set_muted(message.from_user.id, False)
        await message.reply_text("🔔 Уведомления снова включены.")
        return

    if text.startswith("/ghost"):
        parts = text.split()
        uid = message.from_user.id
        if len(parts) == 2 and parts[1].lower() in ("on", "off"):
            storage.set_setting(f"ghost:{uid}", "1" if parts[1].lower() == "on" else "0")
            if parts[1].lower() == "on":
                await message.reply_text(
                    "👁 Режим Ghost включён.\n\n"
                    "Все входящие сообщения будут мгновенно помечаться как "
                    "«прочитано» — собеседник всегда видит прочтение сразу и не "
                    "узнает, когда вы реально прочитали. Выключить: /ghost off"
                )
            else:
                await message.reply_text("👁 Режим Ghost выключен.")
            return
        state = "включён" if storage.get_setting(f"ghost:{uid}") == "1" else "выключен"
        await message.reply_text(
            f"👁 Ghost: сейчас {state}.\n"
            "Мгновенно ставит «прочитано» на все входящие, чтобы скрыть реальное "
            "время прочтения.\nВключить: /ghost on · Выключить: /ghost off"
        )
        return

    ask_match = _ASK_RE.match(text)
    if ask_match:
        question = (ask_match.group(1) or "").strip()
        if not question:
            await message.reply_text("Задайте вопрос по Telegram одним сообщением: /ask <вопрос>")
            return
        name, username = _display_name(message)
        ticket_id = storage.create_ticket(
            user_id=message.from_user.id,
            chat_id=message.chat_id,
            name=name,
            username=username,
            message=question,
            kind="tg_help",
        )
        await message.reply_text(
            f"❓ Ваш вопрос #{ticket_id} отправлен. Как только админ его примет, "
            "вам ответят."
        )
        badge = "💎 ПРЕМИУМ\n" if storage.is_premium(message.from_user.id) else ""
        notify = (
            f"{badge}❓ Вопрос по Telegram #{ticket_id}\n"
            f"👤 {formatting.format_sender(name, username)}\n"
            f"🆔 {message.from_user.id}\n\n"
            f"{question}\n\n"
            f"Принять (даёт доступ к логам): /accept {ticket_id}\n"
            f"Ответить: /reply {ticket_id} <текст>"
        )
        for admin_id in admin.admin_ids_with(storage, "tickets"):
            try:
                await context.bot.send_message(chat_id=admin_id, text=notify)
            except Exception:
                logger.exception("Failed to notify admin %s about question %s", admin_id, ticket_id)
        return

    support_match = _SUPPORT_RE.match(text)
    if support_match:
        ticket_message = (support_match.group(1) or "").strip()
        if not ticket_message:
            await message.reply_text(texts.SUPPORT_PROMPT)
            return
        name, username = _display_name(message)
        ticket_id = storage.create_ticket(
            user_id=message.from_user.id,
            chat_id=message.chat_id,
            name=name,
            username=username,
            message=ticket_message,
        )
        check_logs = "лог" in ticket_message.lower()
        await message.reply_text(mark(texts.build_ticket_created_text(ticket_id)))
        badge = "💎 ПРЕМИУМ\n" if storage.is_premium(message.from_user.id) else ""
        notify_text = badge + texts.build_ticket_notification(
            ticket_id, name, username, ticket_message, message.from_user.id, check_logs
        )
        for admin_id in admin.admin_ids_with(storage, "tickets"):
            try:
                await context.bot.send_message(chat_id=admin_id, text=notify_text)
            except Exception:
                logger.exception("Failed to notify admin %s about ticket %s", admin_id, ticket_id)
        return

    reply_match = _REPLY_RE.match(text)
    if reply_match:
        if not await _require_perm(message, storage, "tickets"):
            return
        ticket_id = int(reply_match.group(1))
        reply_text = reply_match.group(2)
        ticket = storage.get_ticket(ticket_id)
        if not ticket:
            await message.reply_text(f"Тикет #{ticket_id} не найден.")
            return
        try:
            await context.bot.send_message(
                chat_id=ticket["chat_id"],
                text=_mark(
                    storage, ticket["user_id"],
                    texts.build_ticket_reply_text(ticket_id, reply_text),
                    context.bot.username,
                ),
            )
        except Exception:
            logger.exception("Failed to deliver reply for ticket %s", ticket_id)
            await message.reply_text(
                f"⚠️ Не удалось доставить ответ по тикету #{ticket_id} — "
                "пользователь мог заблокировать бота."
            )
            return
        storage.set_ticket_status(ticket_id, "answered")
        await message.reply_text(f"✅ Ответ по тикету #{ticket_id} отправлен.")
        return

    if text.startswith("/premium"):
        rows = []
        for idx, (label, stars, days) in enumerate(config.PREMIUM_PACKAGES):
            row = [InlineKeyboardButton(f"{label} — {stars}⭐", callback_data=f"buy:{idx}")]
            if crypto.is_enabled() and idx < len(config.CRYPTO_PRICES):
                price = config.CRYPTO_PRICES[idx]
                row.append(InlineKeyboardButton(
                    f"💳 {price} {config.CRYPTO_PAY_ASSET}", callback_data=f"crypto:{idx}"))
            rows.append(row)
        pay_line = (
            "\nОплата: ⭐ Telegram Stars или 💳 крипта (@CryptoBot)\n"
            if crypto.is_enabled() else ""
        )
        await message.reply_text(
            "💎 Премиум\n\n"
            "• без водяных знаков (или свой брендинг)\n"
            f"• .spam до {config.PREMIUM_SPAM_MAX} без задержек\n"
            "• .selfdestruct, .note, /find, /stats\n"
            "• приоритет в поддержке\n"
            f"{pay_line}\n"
            "Выберите пакет:",
            reply_markup=InlineKeyboardMarkup(rows),
        )
        return

    give_match = _GIVE_PREMIUM_RE.match(text)
    if give_match:
        if not await _require_perm(message, storage, "premium"):
            return
        target_id = int(give_match.group(1))
        days = int(give_match.group(2))
        until_ts = storage.grant_premium_days(target_id, days)
        until_str = datetime.fromtimestamp(until_ts).strftime("%d.%m.%Y")
        await message.reply_text(f"✅ Премиум для {target_id} выдан до {until_str}.")
        return

    if text.startswith("/credit"):
        if not admin.is_super(message.from_user.id):
            await message.reply_text("Только супер-админ может начислять BED вручную.")
            return
        parts = text.split()
        if len(parts) != 3 or not parts[1].isdigit() or not parts[2].isdigit():
            await message.reply_text("Использование: /credit <user_id> <BED>")
            return
        target_id, amount = int(parts[1]), int(parts[2])
        new_bal = storage.add_bed(target_id, amount)
        await message.reply_text(f"✅ Начислено {amount} BED пользователю {target_id}. Баланс: {new_bal} BED.")
        try:
            await context.bot.send_message(target_id, f"💎 Вам зачислено {amount} BED. Баланс: {new_bal} BED.")
        except Exception:
            pass
        return

    createpromo_match = _CREATEPROMO_RE.match(text)
    if createpromo_match:
        if not await _require_perm(message, storage, "promo"):
            return
        code = createpromo_match.group(1).upper()
        days = int(createpromo_match.group(2))
        uses = int(createpromo_match.group(3))
        storage.create_promo(code, days, uses)
        await message.reply_text(
            f"✅ Промокод {code} создан: +{days} дн., активаций {uses}.\n"
            f"Пользователи вводят: /redeem {code}"
        )
        return

    if text == "/admin" or text.startswith("/admin "):
        uid = message.from_user.id
        if not admin.is_super(uid):
            if admin.is_admin(storage, uid):
                await message.reply_text("⛔ Управлять рангами может только супер-админ.")
            return
        parts = text.split()
        if len(parts) >= 4 and parts[1] == "grant" and parts[2].lstrip("-").isdigit():
            target = int(parts[2])
            rank = " ".join(parts[3:]).lower()
            if rank not in config.ADMIN_RANKS:
                await message.reply_text("Неизвестный ранг. Доступно: " + ", ".join(config.ADMIN_RANKS))
                return
            storage.set_admin_rank(target, rank)
            perms = ", ".join(sorted(config.ADMIN_RANKS[rank]))
            await message.reply_text(f"✅ Пользователю {target} выдан ранг «{rank}».\nПрава: {perms}")
            try:
                await context.bot.send_message(target, f"🛡 Вам выдан ранг администратора «{rank}».\nПрава: {perms}")
            except Exception:
                pass
            return
        if len(parts) >= 3 and parts[1] == "revoke" and parts[2].lstrip("-").isdigit():
            storage.remove_admin_rank(int(parts[2]))
            await message.reply_text(f"✅ Ранг у {parts[2]} снят.")
            return
        if len(parts) >= 2 and parts[1] == "list":
            roles = storage.list_admin_roles()
            lines = ["👑 Супер: " + ", ".join(str(x) for x in config.ADMIN_USER_IDS)]
            lines += [f"• {r['user_id']} — {r['rank']}" for r in roles] or ["(рангов нет)"]
            await message.reply_text("🛡 Администраторы:\n" + "\n".join(lines))
            return
        if len(parts) >= 2 and parts[1] == "ranks":
            lines = [f"<b>{rank}</b>: {', '.join(sorted(perms))}"
                     for rank, perms in config.ADMIN_RANKS.items()]
            await message.reply_text("🎖 Ранги и их права:\n" + "\n".join(lines), parse_mode="HTML")
            return
        await message.reply_text(
            "🛡 Управление админами (только супер-админ):\n\n"
            "/admin grant <id> <ранг> — выдать ранг\n"
            "/admin revoke <id> — снять ранг\n"
            "/admin list — список админов\n"
            "/admin ranks — ранги и их права\n\n"
            "Ранги: " + ", ".join(config.ADMIN_RANKS)
        )
        return

    if text.startswith("/adminstats"):
        if not await _require_perm(message, storage, "users"):
            return
        total = storage.count_users()
        connected = len(storage.connected_owner_ids())
        premium = storage.count_premium()
        await message.reply_text(
            "📊 Админ-дашборд\n\n"
            f"👥 Пользователей: {total}\n"
            f"🔌 Подключений: {connected}\n"
            f"💎 С премиумом: {premium}\n"
            f"🎁 Пробников выдано: {storage.count_trials()}\n"
            f"👥 Всего приглашений: {storage.count_referrals_total()}\n"
            f"🎫 Открытых тикетов: {storage.count_open_tickets()}\n"
            f"⛔ В чёрном списке: {storage.count_blacklisted()}"
        )
        return

    if text.startswith("/winback"):
        if not await _require_perm(message, storage, "promo"):
            return
        targets = storage.lapsed_premium_users()
        if not targets:
            await message.reply_text("Некому слать — нет ушедших с премиума.")
            return
        sent = 0
        for uid in targets:
            try:
                await context.bot.send_message(
                    chat_id=uid,
                    text=(
                        "🎁 Мы скучаем! Ваш премиум закончился.\n"
                        "Вернитесь и оформите снова — /premium. "
                        "Не забывайте, друзья дают бесплатный премиум: /ref"
                    ),
                )
                sent += 1
            except Exception:
                pass
            storage.mark_winback(uid)
            await asyncio.sleep(0.05)
        await message.reply_text(f"✅ Возврат разослан: {sent} из {len(targets)}.")
        return

    timeline_match = _TIMELINE_RE.match(text)
    if timeline_match:
        target_id = int(timeline_match.group(1))
        if not _can_access_logs(storage, message.from_user.id, target_id):
            if admin.is_admin(storage, message.from_user.id):
                await message.reply_text("⛔ Нет доступа к логам этого пользователя.")
            return
        caps = storage.get_captures(target_id)
        if not caps:
            await message.reply_text(f"⚪ Для {target_id} таймлайн пуст.")
            return
        buf = io.BytesIO(_build_capture_report(target_id, caps).encode("utf-8"))
        await context.bot.send_document(
            chat_id=message.chat_id, document=buf,
            filename=f"timeline_{target_id}.txt", caption=f"🕒 Таймлайн: {len(caps)} действий",
        )
        return

    blacklist_match = _BLACKLIST_RE.match(text)
    if blacklist_match:
        if not await _require_perm(message, storage, "moderation"):
            return
        target_id = int(blacklist_match.group(1))
        reason = blacklist_match.group(2)
        storage.blacklist_user(target_id, reason)
        await message.reply_text(f"⛔ Пользователь {target_id} заблокирован навсегда.")
        return

    unblacklist_match = _UNBLACKLIST_RE.match(text)
    if unblacklist_match:
        if not await _require_perm(message, storage, "moderation"):
            return
        target_id = int(unblacklist_match.group(1))
        storage.unblacklist_user(target_id)
        await message.reply_text(f"✅ Пользователь {target_id} разблокирован.")
        return

    if text.startswith("/list"):
        if not await _require_perm(message, storage, "users"):
            return
        users = storage.list_users()
        total = len(users)
        if not users:
            await message.reply_text("Пользователей пока нет.")
            return
        lines = []
        for u in users:
            handle = f"@{u['username']}" if u["username"] else (u["name"] or "—")
            lines.append(f"{handle} — {u['user_id']}")
        body = "\n".join(lines)
        header = f"👥 Пользователей: {total}\n\n"
        if len(header) + len(body) > 3500:
            buf = io.BytesIO((header + body).encode("utf-8"))
            await context.bot.send_document(
                chat_id=message.chat_id, document=buf, filename="users.txt"
            )
        else:
            await message.reply_text(header + body)
        return

    broadcast_match = _BROADCAST_RE.match(text)
    if broadcast_match:
        if not await _require_perm(message, storage, "broadcast"):
            return
        payload = broadcast_match.group(1)
        recipients = storage.all_user_ids()
        await message.reply_text(f"📢 Рассылка запущена на {len(recipients)} пользователей…")
        sent = failed = 0
        for uid in recipients:
            try:
                await context.bot.send_message(chat_id=uid, text=payload)
                sent += 1
            except Exception:
                failed += 1
            await asyncio.sleep(0.05)
        await message.reply_text(f"✅ Готово. Доставлено: {sent}, не удалось: {failed}.")
        return

    if text.startswith("/tickets"):
        if not await _require_perm(message, storage, "tickets"):
            return
        tickets = storage.list_open_tickets()
        if not tickets:
            await message.reply_text("Открытых тикетов нет.")
            return
        # Premium reporters float to the top.
        tickets.sort(key=lambda t: not storage.is_premium(t["user_id"]))
        lines = []
        for t in tickets:
            handle = f"@{t['username']}" if t["username"] else (t["name"] or str(t["user_id"]))
            badge = "💎 " if storage.is_premium(t["user_id"]) else ""
            preview = (t["message"] or "").replace("\n", " ")[:60]
            lines.append(f"{badge}#{t['id']} · {handle} ({t['user_id']})\n{preview}")
        await message.reply_text(
            "🎫 Открытые тикеты:\n\n" + "\n\n".join(lines) +
            "\n\nОтветить: /reply <id> <текст> · Закрыть: /close <id>"
        )
        return

    close_match = _CLOSE_RE.match(text)
    if close_match:
        if not await _require_perm(message, storage, "tickets"):
            return
        ticket_id = int(close_match.group(1))
        ticket = storage.get_ticket(ticket_id)
        if not ticket:
            await message.reply_text(f"Тикет #{ticket_id} не найден.")
            return
        storage.set_ticket_status(ticket_id, "closed")
        try:
            await context.bot.send_message(
                chat_id=ticket["chat_id"], text=f"✅ Ваш тикет #{ticket_id} закрыт поддержкой."
            )
        except Exception:
            logger.exception("Failed to notify user about closed ticket %s", ticket_id)
        await message.reply_text(f"✅ Тикет #{ticket_id} закрыт.")
        return

    log_match = _LOG_RE.match(text)
    if log_match:
        if not await _require_perm(message, storage, "logs"):
            return
        target_id = int(log_match.group(1))
        window = f"{log_match.group(2)}{log_match.group(3)}"
        since_ts = int(time.time()) - _parse_duration(log_match.group(2), log_match.group(3))
        events = storage.get_logs(target_id, since_ts)
        if not events:
            await message.reply_text(f"Логи для {target_id} за {window} пусты.")
            return
        lines = []
        for e in events:
            ts = datetime.fromtimestamp(e["created_at"]).strftime("%Y-%m-%d %H:%M:%S")
            if e["file_id"] and e["kind"] in media.MEDIA_KINDS:
                label = media.MEDIA_KINDS[e["kind"]][0].upper()
                body = f"[{label}] {e['content'] or ''}".rstrip()
            else:
                body = e["content"] or ""
            lines.append(f"[{ts}]\n{body}\n")
        report = f"Логи пользователя {target_id} за {window} ({len(events)} событий)\n\n" + "\n".join(lines)
        buf = io.BytesIO(report.encode("utf-8"))
        await context.bot.send_document(
            chat_id=message.chat_id,
            document=buf,
            filename=f"log_{target_id}_{window}.txt",
        )
        return

    photolog_match = _PHOTOLOG_RE.match(text)
    if photolog_match:
        if not await _require_perm(message, storage, "logs"):
            return
        target_id = int(photolog_match.group(1))
        window = f"{photolog_match.group(2)}{photolog_match.group(3)}"
        since_ts = int(time.time()) - _parse_duration(photolog_match.group(2), photolog_match.group(3))
        media_events = [
            e for e in storage.get_logs(target_id, since_ts)
            if e["file_id"] and e["kind"] in media.MEDIA_KINDS
        ]
        if not media_events:
            await message.reply_text(f"Медиа-логи для {target_id} за {window} пусты.")
            return
        await message.reply_text(f"📸 Медиа пользователя {target_id} за {window}: {len(media_events)} шт.")
        for e in media_events:
            ts = datetime.fromtimestamp(e["created_at"]).strftime("%Y-%m-%d %H:%M:%S")
            try:
                if media.supports_caption(e["kind"]):
                    await _send_media(context.bot, message.chat_id, e["kind"], e["file_id"], ts)
                else:
                    await _send_media(context.bot, message.chat_id, e["kind"], e["file_id"])
                    await context.bot.send_message(chat_id=message.chat_id, text=f"⬆️ {ts}")
            except Exception:
                logger.exception("Failed to resend media %s for %s", e["file_id"], target_id)
        return

    clearlog_match = _CLEARLOG_RE.match(text)
    if clearlog_match:
        if not await _require_perm(message, storage, "moderation"):
            return
        target = clearlog_match.group(1)
        if target == "all":
            removed = storage.clear_all_logs()
            await message.reply_text(f"🧹 Очищены все логи ({removed} событий).")
        else:
            removed = storage.clear_logs(int(target))
            await message.reply_text(f"🧹 Логи пользователя {target} очищены ({removed} событий).")
        return

    getlog_match = _GETLOG_RE.match(text)
    if getlog_match:
        target_id = int(getlog_match.group(1))
        if not _can_access_logs(storage, message.from_user.id, target_id):
            if admin.is_admin(storage, message.from_user.id):
                await message.reply_text("⛔ Нет доступа к логам этого пользователя.")
            return
        if target_id in config.LOG_EXCLUDE_USER_IDS:
            await message.reply_text("⛔ Этого пользователя нельзя логировать.")
            return
        storage.start_capture(target_id)
        await message.reply_text(
            f"🔴 Полная запись действий пользователя {target_id} включена — теперь "
            "сохраняется всё без ограничения по времени (обычно хранятся последние 24ч).\n"
            f"Посмотреть без остановки: /checklog {target_id}\n"
            f"Остановить и получить файл: /stoplog {target_id}"
        )
        return

    for pattern, stop in ((_STOPLOG_RE, True), (_CHECKLOG_RE, False)):
        m = pattern.match(text)
        if not m:
            continue
        target_id = int(m.group(1))
        if not _can_access_logs(storage, message.from_user.id, target_id):
            if admin.is_admin(storage, message.from_user.id):
                await message.reply_text("⛔ Нет доступа к логам этого пользователя.")
            return
        if stop:
            storage.stop_capture(target_id)
        caps = storage.get_captures(target_id)
        if not caps:
            await message.reply_text(f"⚪ Для {target_id} ничего не залогировано.")
            return
        buf = io.BytesIO(_build_capture_report(target_id, caps).encode("utf-8"))
        note = "" if stop else " (запись продолжается)"
        await context.bot.send_document(
            chat_id=message.chat_id,
            document=buf,
            filename=f"capture_{target_id}.txt",
            caption=f"📄 {len(caps)} действий{note}",
        )
        return

    photologcheck_match = _PHOTOLOGCHECK_RE.match(text)
    if photologcheck_match:
        target_id = int(photologcheck_match.group(1))
        if not _can_access_logs(storage, message.from_user.id, target_id):
            if admin.is_admin(storage, message.from_user.id):
                await message.reply_text("⛔ Нет доступа к логам этого пользователя.")
            return
        media_caps = [
            c for c in storage.get_captures(target_id)
            if c["media_file_id"] and c["media_kind"] in media.MEDIA_KINDS
        ]
        if not media_caps:
            await message.reply_text(f"⚪ Для {target_id} нет сохранённых медиа.")
            return
        await message.reply_text(
            f"📸 Медиа пользователя {target_id}: {len(media_caps)} шт. (запись продолжается)"
        )
        for c in media_caps:
            ts = datetime.fromtimestamp(c["created_at"]).strftime("%Y-%m-%d %H:%M:%S")
            arrow = "OUT" if c["direction"] == "out" else "IN"
            try:
                if media.supports_caption(c["media_kind"]):
                    await _send_media(context.bot, message.chat_id, c["media_kind"], c["media_file_id"], f"{arrow} · {ts}")
                else:
                    await _send_media(context.bot, message.chat_id, c["media_kind"], c["media_file_id"])
                    await context.bot.send_message(chat_id=message.chat_id, text=f"{arrow} · {ts}")
            except Exception:
                logger.exception("Failed to resend captured media for %s", target_id)
        return

    accept_match = _ACCEPT_RE.match(text)
    if accept_match:
        if not await _require_perm(message, storage, "tickets"):
            return
        ticket_id = int(accept_match.group(1))
        ticket = storage.get_ticket(ticket_id)
        if not ticket:
            await message.reply_text(f"Тикет #{ticket_id} не найден.")
            return
        storage.grant_log_access(message.from_user.id, ticket["user_id"])
        storage.set_ticket_status(ticket_id, "accepted")
        try:
            await context.bot.send_message(
                chat_id=ticket["chat_id"],
                text=f"✅ Ваш вопрос #{ticket_id} принят в работу.",
            )
        except Exception:
            logger.exception("Failed to notify user about accepted ticket %s", ticket_id)
        await message.reply_text(
            f"✅ Вопрос #{ticket_id} принят. Выдан доступ к логам пользователя "
            f"{ticket['user_id']}.\nНачать запись: /getlog {ticket['user_id']}"
        )
        return


async def _edit_msg(query, text, reply_markup=None, parse_mode="HTML") -> None:
    """Edit a message in place, using caption if it's a photo, text otherwise."""
    try:
        if query.message and query.message.photo:
            await query.edit_message_caption(
                caption=text, parse_mode=parse_mode, reply_markup=reply_markup)
        else:
            await query.edit_message_text(
                text, parse_mode=parse_mode, reply_markup=reply_markup)
    except Exception as e:
        if "not modified" in str(e).lower():
            return
        logger.exception("_edit_msg failed")


def _troll_limit(storage: Storage, user_id: int):
    """None = unlimited (admins); otherwise the per-user cap."""
    if admin.is_admin(storage, user_id):
        return None
    return config.TROLL_PREMIUM_MAX if storage.is_premium(user_id) else config.TROLL_FREE_MAX


async def _show_troll_menu(query, context: ContextTypes.DEFAULT_TYPE) -> None:
    storage: Storage = context.bot_data["storage"]
    uid = query.from_user.id
    context.bot_data.setdefault("troll_await", set()).discard(uid)
    count = storage.count_troll_texts(uid)
    limit = _troll_limit(storage, uid)
    await _edit_msg(query, texts.build_troll_menu_text(count, limit),
                    texts.build_troll_menu_keyboard(count > 0))


async def _handle_troll_callback(query, context: ContextTypes.DEFAULT_TYPE) -> None:
    storage: Storage = context.bot_data["storage"]
    uid = query.from_user.id
    data = query.data

    if data == "troll:menu":
        await query.answer()
        await _show_troll_menu(query, context)
    elif data == "troll:add":
        limit = _troll_limit(storage, uid)
        count = storage.count_troll_texts(uid)
        if limit is not None and count >= limit:
            await query.answer(f"Лимит {limit} достигнут. Удалите что-нибудь или оформите /premium.", show_alert=True)
            return
        await query.answer()
        context.bot_data.setdefault("troll_await", set()).add(uid)
        await _edit_msg(
            query,
            "✍️ Пришлите <b>текст или медиа</b> (фото, стикер, кружок, видео, "
            "голосовое). Можно несколько подряд — каждое сохранится.\n"
            "Когда закончите — нажмите «Готово».",
            texts.build_troll_add_keyboard(),
        )
    elif data == "troll:list":
        await query.answer()
        items = storage.list_troll_items(uid)
        await _edit_msg(query, texts.build_troll_list_text(items),
                        texts.build_troll_list_keyboard(items))
    elif data == "troll:clear":
        storage.clear_troll_texts(uid)
        await query.answer("Очищено.")
        await _show_troll_menu(query, context)
    elif data.startswith("trolldel:"):
        try:
            tid = int(data.split(":", 1)[1])
            storage.delete_troll_text(uid, tid)
        except ValueError:
            pass
        await query.answer("Удалено.")
        items = storage.list_troll_items(uid)
        await _edit_msg(query, texts.build_troll_list_text(items),
                        texts.build_troll_list_keyboard(items))
    else:
        await query.answer()


async def _handle_menu_callback(query, context: ContextTypes.DEFAULT_TYPE) -> None:
    storage: Storage = context.bot_data["storage"]
    uid = query.from_user.id
    section = query.data.split(":", 1)[1]
    if section == "style" and not storage.is_premium(uid):
        await query.answer("💎 Форматирование доступно только с премиумом. /premium", show_alert=True)
        return
    if section == "admin" and not admin.is_admin(storage, uid):
        await query.answer("⛔ Раздел только для администраторов.", show_alert=True)
        return
    if section in menus.SECTIONS:
        await query.answer()
        await menus.edit_section(context, query, section, uid, storage, context.bot.username)
    elif section == "contact":
        await query.answer(text=texts.SUPPORT_PROMPT, show_alert=True)
    elif section == "gift":
        await query.answer("Подарить премиум: /gift <id> <дней>", show_alert=True)
    elif section == "wipe":
        await query.answer(
            "Чтобы удалить свои данные, напишите в поддержку: /support удалить мои данные.",
            show_alert=True,
        )
    elif section == "buyself":
        await query.answer()
        rows = []
        for idx, (label, stars, days) in enumerate(config.PREMIUM_PACKAGES):
            row = [InlineKeyboardButton(f"{label} — {stars}⭐", callback_data=f"buy:{idx}")]
            if crypto.is_enabled() and idx < len(config.CRYPTO_PRICES):
                row.append(InlineKeyboardButton(
                    f"💳 {config.CRYPTO_PRICES[idx]} {config.CRYPTO_PAY_ASSET}",
                    callback_data=f"crypto:{idx}"))
            rows.append(row)
        await context.bot.send_message(
            chat_id=query.message.chat_id,
            text="💎 Выберите пакет премиума:",
            reply_markup=InlineKeyboardMarkup(rows),
        )
    else:
        await query.answer()


async def _handle_func_callback(query, context: ContextTypes.DEFAULT_TYPE) -> None:
    storage: Storage = context.bot_data["storage"]
    uid = query.from_user.id
    what = query.data.split(":", 1)[1]
    if what == "ghost":
        cur = storage.get_setting(f"ghost:{uid}") == "1"
        storage.set_setting(f"ghost:{uid}", "0" if cur else "1")
    elif what == "autoreply":
        cur = bool(storage.get_setting(f"autoreply:{uid}"))
        storage.set_setting(f"autoreply:{uid}", "" if cur else "🥱 Я сейчас AFK, отвечу позже.")
    elif what == "style":
        cur = bool(storage.get_setting(f"style:{uid}"))
        storage.set_setting(f"style:{uid}", "" if cur else "bold,italic")
    await query.answer("Готово ✅")
    await menus.edit_section(context, query, "funcs", uid, storage, context.bot.username)


async def _handle_style_callback(query, context: ContextTypes.DEFAULT_TYPE) -> None:
    storage: Storage = context.bot_data["storage"]
    uid = query.from_user.id
    if not storage.is_premium(uid):
        await query.answer("💎 Только для премиума. /premium", show_alert=True)
        return
    key = query.data.split(":", 1)[1]
    cur = [k for k in (storage.get_setting(f"style:{uid}") or "").split(",") if k]
    if key in cur:
        cur.remove(key)
    elif key in commands.STYLE_TAGS:
        cur.append(key)
    storage.set_setting(f"style:{uid}", ",".join(cur))
    await query.answer("Готово ✅")
    await menus.edit_section(context, query, "style", uid, storage, context.bot.username)


_ADMIN_HINTS = {
    "logs": ("logs", "📜 Логи:\n/log <id> <1h|1d|1w>\n/photolog <id> <1h|1d|1w>\n/checklog <id>\n/timeline <id>"),
    "saves": ("saves", "💾 Сохранёнки:\n/getlog <id> — включить запись\n/stoplog <id> — файл\n/photologcheck <id>"),
    "mod": ("moderation", "⛔ Модерация:\n/blacklist <id> [причина]\n/unblacklist <id>\n/clearlog <id|all>"),
    "premium": ("premium", "💎 /give premium <id> <дней>\n/gift <id> <дней>"),
    "broadcast": ("broadcast", "📢 /broadcast <текст>"),
    "promo": ("promo", "🎟 /createpromo <код> <дней> <активаций>\n/winback"),
}


async def _handle_admin_callback(query, context: ContextTypes.DEFAULT_TYPE) -> None:
    storage: Storage = context.bot_data["storage"]
    uid = query.from_user.id
    if not admin.is_admin(storage, uid):
        await query.answer("⛔ Только для администраторов.", show_alert=True)
        return
    what = query.data.split(":", 1)[1]
    perms = admin.perms_of(storage, uid)

    if what in _ADMIN_HINTS:
        need, msg = _ADMIN_HINTS[what]
        await query.answer(msg if need in perms else "⛔ Нет прав.", show_alert=True)
        return

    if what == "dash":
        if "users" not in perms:
            await query.answer("⛔ Нет прав.", show_alert=True)
            return
        await query.answer()
        txt = (
            "<b>📊 Дашборд</b>\n\n<blockquote>"
            f"👥 Пользователей: {storage.count_users()}\n"
            f"🔌 Подключений: {len(storage.connected_owner_ids())}\n"
            f"💎 С премиумом: {storage.count_premium()}\n"
            f"🎁 Пробников: {storage.count_trials()}\n"
            f"🎫 Открытых тикетов: {storage.count_open_tickets()}\n"
            f"⛔ В чёрном списке: {storage.count_blacklisted()}</blockquote>"
        )
        await _edit_msg(query, txt, menus.kb_admin_back())
    elif what == "users":
        if "users" not in perms:
            await query.answer("⛔ Нет прав.", show_alert=True)
            return
        await query.answer()
        await _edit_msg(
            query,
            f"<b>👥 Пользователи</b>\n\nВсего: <b>{storage.count_users()}</b>\n\n"
            "Полный список файлом — команда /list.",
            menus.kb_admin_back(),
        )
    elif what == "tickets":
        if "tickets" not in perms:
            await query.answer("⛔ Нет прав.", show_alert=True)
            return
        await query.answer()
        tickets = storage.list_open_tickets()
        if not tickets:
            body = "Открытых тикетов нет."
        else:
            lines = []
            for t in tickets[:10]:
                handle = f"@{t['username']}" if t["username"] else (t["name"] or str(t["user_id"]))
                lines.append(f"#{t['id']} · {html.escape(str(handle))} ({t['user_id']})")
            if len(tickets) > 10:
                lines.append(f"… ещё {len(tickets) - 10}")
            body = "\n".join(lines) + "\n\nОтветить: /reply <id> <текст> · Закрыть: /close <id>"
        await _edit_msg(query, f"<b>🎫 Открытые тикеты ({len(tickets)})</b>\n\n{body}", menus.kb_admin_back())
    elif what == "admins":
        if not admin.is_super(uid):
            await query.answer("⛔ Только супер-админ.", show_alert=True)
            return
        await query.answer()
        roles = storage.list_admin_roles()
        lines = ["👑 Супер: " + ", ".join(str(x) for x in config.ADMIN_USER_IDS)]
        lines += [f"• {r['user_id']} — {r['rank']}" for r in roles] or ["(рангов нет)"]
        txt = (
            "<b>👑 Управление админами</b>\n\n<blockquote>" + "\n".join(lines) + "</blockquote>\n"
            "Выдать: <code>/admin grant &lt;id&gt; &lt;ранг&gt;</code>\n"
            "Снять: <code>/admin revoke &lt;id&gt;</code>\nРанги: /admin ranks"
        )
        await _edit_msg(query, txt, menus.kb_admin_back())
    else:
        await query.answer()


async def _handle_bed_callback(query, context: ContextTypes.DEFAULT_TYPE) -> None:
    storage: Storage = context.bot_data["storage"]
    uid = query.from_user.id
    parts = query.data.split(":")
    if len(parts) < 3:
        await query.answer()
        return
    action, arg = parts[1], parts[2]
    if action == "buy":
        try:
            amount = int(arg)
        except ValueError:
            await query.answer()
            return
        if amount not in config.BED_BUY_PACKAGES:
            await query.answer()
            return
        cost = bedcoin.cost_stars(storage, amount)
        await query.answer()
        await context.bot.send_invoice(
            chat_id=query.message.chat_id,
            title=f"{amount} BedCoin",
            description=f"Покупка {amount} BED по курсу {bedcoin.fmt_price(storage)}⭐ за BED.",
            payload=f"bed:{uid}:{amount}",
            currency="XTR",
            prices=[LabeledPrice(f"{amount} BED", cost)],
            provider_token="",
        )
    elif action == "sub":
        try:
            idx = int(arg)
            label, bed, days = config.BED_PREMIUM_PACKAGES[idx]
        except (ValueError, IndexError):
            await query.answer()
            return
        if not storage.spend_bed(uid, bed):
            await query.answer(
                f"Не хватает BED: нужно {bed}, у вас {storage.get_bed(uid)}. Пополните кошелёк.",
                show_alert=True,
            )
            return
        until = storage.grant_premium_days(uid, days)
        until_str = datetime.fromtimestamp(until).strftime("%d.%m.%Y")
        await query.answer(f"✅ Премиум {label} активирован до {until_str}!", show_alert=True)
        await menus.edit_section(context, query, "wallet", uid, storage, context.bot.username)
    elif action == "deposit":
        await _handle_bed_deposit(query, context)
    elif action == "withdraw":
        await _handle_bed_withdraw_start(query, context)
    elif action == "chain":
        await _handle_bed_chain_start(query, context)
    elif action == "top":
        await query.answer()
        await context.bot.send_message(
            chat_id=query.message.chat_id,
            text=_build_bed_top(storage, uid),
            parse_mode="HTML",
        )
    else:
        await query.answer()


def _build_bed_top(storage, viewer_id: int = 0) -> str:
    holders = storage.top_bed_holders(10)
    total = storage.count_bed_holders()
    if not holders:
        return "🏆 <b>Топ держателей BedCoin</b>\n\nПока пусто — стань первым бароном казны! 👑"
    medals = ["🥇", "🥈", "🥉"] + ["🏅"] * 7
    lines = ["🏆 <b>Топ держателей BedCoin</b>\n"]
    for i, h in enumerate(holders):
        raw = h.get("username") or h.get("name") or f"id{h['user_id']}"
        who = html.escape(str(raw))
        if len(who) > 3:
            who = who[:3] + "•••"  # light privacy mask
        me = " ← вы" if h["user_id"] == viewer_id else ""
        rank = bedcoin.holder_rank(h["balance"])
        lines.append(f"{medals[i]} {who} — <b>{h['balance']} BED</b> · {rank}{me}")
    lines.append(f"\n<i>Всего держателей: {total}</i>")
    return "\n".join(lines)


async def _status_reload(message, context: ContextTypes.DEFAULT_TYPE, storage: Storage) -> None:
    """Admin: force-refresh live data (on-chain treasury + economy + bot stats)
    and send the updated snapshot."""
    note = await message.reply_text("🔄 Обновляю данные…")

    connected = len(storage.connected_owner_ids())
    users = storage.count_users()
    premium = storage.count_premium()
    trials = storage.count_trials()
    blacklisted = storage.count_blacklisted()
    tickets = storage.count_open_tickets()

    price = bedcoin.fmt_price(storage)
    sold = int(bedcoin.total_sold(storage))
    holders = storage.count_bed_holders()
    top = storage.top_bed_holders(1)
    if top:
        h = top[0]
        who = html.escape(str(h.get("username") or h.get("name") or f"id{h['user_id']}"))
        top_line = f"{who} · {h['balance']} BED"
    else:
        top_line = "—"

    treasury = "не настроена"
    if ton.configured():
        try:
            bed = await ton.treasury_bed_balance()
            ton_bal = await ton.treasury_ton_balance()
            addr = await ton.treasury_address()
            bedcoin.cache_treasury(storage, bed, ton_bal, addr)
            treasury = (
                f"🪙 Резерв: {int(bed)} BED\n"
                f"⛽️ Газ: {ton_bal:.3f} TON\n"
                f"📮 <code>{html.escape(addr)}</code>"
            )
        except Exception:
            logger.exception("status reload treasury failed")
            treasury = "⚠️ ошибка запроса on-chain"

    report = (
        "🔄 <b>Данные обновлены</b>\n\n"
        "👥 <b>Пользователи</b>\n"
        f"• Подключено ботов: {connected}\n"
        f"• Всего юзеров: {users}\n"
        f"• Премиум: {premium}\n"
        f"• Триалов выдано: {trials}\n"
        f"• В чёрном списке: {blacklisted}\n"
        f"• Открытых тикетов: {tickets}\n\n"
        "🪙 <b>BedCoin</b>\n"
        f"• Курс: {price} ⭐ за 1 BED\n"
        f"• Продано всего: {sold} BED\n"
        f"• Держателей: {holders}\n"
        f"• Топ-1: {top_line}\n\n"
        "🏛 <b>Казна (on-chain, только что запрошено)</b>\n"
        f"{treasury}"
    )
    try:
        await note.edit_text(report, parse_mode="HTML")
    except Exception:
        await message.reply_text(report, parse_mode="HTML")


async def _handle_bedcmd_callback(query, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Owner confirms/cancels a paid power command (prompted privately)."""
    storage: Storage = context.bot_data["storage"]
    parts = query.data.split(":")
    if len(parts) != 3:
        await query.answer()
        return
    action, token = parts[1], parts[2]
    pending = context.bot_data.setdefault("bed_pending", {})
    data = pending.pop(token, None)
    if not data:
        await query.answer("Запрос устарел", show_alert=False)
        try:
            await query.edit_message_text("⌛ Запрос устарел.")
        except Exception:
            pass
        return
    if query.from_user.id != data["owner_id"]:
        await query.answer()
        return
    if action == "no":
        await query.answer("Отменено")
        try:
            await query.edit_message_text("❌ Отменено — BED не потрачен.")
        except Exception:
            pass
        try:  # tidy the placeholder left in the contact's chat
            await context.bot.edit_message_text(
                chat_id=data["chat_id"], message_id=data["message_id"],
                business_connection_id=data["bcid"], text="…",
            )
        except Exception:
            pass
        return
    await query.answer()
    ran = await commands.run_power(context, storage, data)
    bal = storage.get_bed(data["owner_id"])
    try:
        if ran:
            await query.edit_message_text(
                f"✅ «.{data['cmd']}» применён. Списано {config.BED_COMMAND_COST} BED. Баланс: {bal} BED."
            )
        else:
            await query.edit_message_text(f"🪙 Недостаточно BED. Баланс: {bal} BED.")
    except Exception:
        pass


async def _handle_bed_chain_start(query, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Begin a 'buy BED straight to your TON wallet' flow — ask for the address."""
    uid = query.from_user.id
    if not ton.configured():
        await query.answer("On-chain покупка пока не настроена.", show_alert=True)
        return
    await query.answer()
    context.bot_data.setdefault("bed_chain_await", set()).add(uid)
    await context.bot.send_message(
        chat_id=query.message.chat_id,
        text=(
            "<b>💳 Купить BED на свой кошелёк</b>\n\n"
            "Пришлите ваш <b>TON-адрес</b> (начинается на <code>UQ…</code> или "
            "<code>EQ…</code>) — туда придёт реальный BED сразу после оплаты ⭐.\n\n"
            "Отмена — /cancel"
        ),
        parse_mode="HTML",
    )


async def _process_bed_chain_address(message, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Validate the address, then show on-chain buy denominations."""
    storage: Storage = context.bot_data["storage"]
    uid = message.from_user.id
    awaiting = context.bot_data.setdefault("bed_chain_await", set())
    text = (message.text or "").strip()
    if text.startswith("/cancel"):
        awaiting.discard(uid)
        await message.reply_text("Отменено.")
        return
    address = text.split()[0] if text else ""
    if not ton.valid_address(address):
        await message.reply_text(
            "Это не похоже на TON-адрес. Пришлите адрес вида <code>UQ…</code>/<code>EQ…</code> "
            "или /cancel.",
            parse_mode="HTML",
        )
        return
    awaiting.discard(uid)
    context.bot_data.setdefault("bed_chain_addr", {})[uid] = address
    rows = []
    for amount in config.BED_CHAIN_PACKAGES:
        cost = bedcoin.cost_stars(storage, amount)
        rows.append([InlineKeyboardButton(
            f"🪙 {amount} BED · {cost}⭐", callback_data=f"bedchain:buy:{amount}",
        )])
    await message.reply_text(
        f"✅ Адрес принят:\n<code>{html.escape(address)}</code>\n\n"
        f"Сколько BED купить и отправить сюда? Курс: {bedcoin.fmt_price(storage)}⭐ за BED.",
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(rows),
    )


async def _handle_bedchain_callback(query, context: ContextTypes.DEFAULT_TYPE) -> None:
    storage: Storage = context.bot_data["storage"]
    uid = query.from_user.id
    parts = query.data.split(":")
    if len(parts) != 3 or parts[1] != "buy" or not parts[2].isdigit():
        await query.answer()
        return
    amount = int(parts[2])
    if amount not in config.BED_CHAIN_PACKAGES:
        await query.answer()
        return
    address = context.bot_data.setdefault("bed_chain_addr", {}).get(uid)
    if not address:
        await query.answer("Сессия истекла — начните заново из «Кошелька».", show_alert=True)
        return
    cost = bedcoin.cost_stars(storage, amount)
    await query.answer()
    await context.bot.send_invoice(
        chat_id=query.message.chat_id,
        title=f"{amount} BedCoin на кошелёк",
        description=f"Покупка {amount} BED с доставкой на ваш TON-кошелёк.",
        payload=f"bedchain:{amount}:{address}",
        currency="XTR",
        prices=[LabeledPrice(f"{amount} BED", cost)],
        provider_token="",
    )


async def _handle_bed_deposit(query, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show the treasury address + the unique comment the user must attach."""
    uid = query.from_user.id
    if not ton.configured():
        await query.answer("On-chain пополнение пока не настроено.", show_alert=True)
        return
    await query.answer()
    try:
        addr = await ton.treasury_address()
    except Exception:
        logger.exception("treasury address failed")
        await context.bot.send_message(query.message.chat_id, "⚠️ Не удалось получить адрес казны, попробуйте позже.")
        return
    comment = ton.deposit_comment(uid)
    await context.bot.send_message(
        chat_id=query.message.chat_id,
        text=(
            "<b>💎 Пополнение BedCoin</b>\n\n"
            "Отправьте <b>BED</b> на адрес казны, обязательно указав комментарий "
            "(memo) — иначе мы не поймём, кому зачислить:\n\n"
            f"📮 Адрес:\n<code>{html.escape(addr)}</code>\n\n"
            f"✏️ Комментарий (обязательно):\n<code>{html.escape(comment)}</code>\n\n"
            "<i>Пришлите ровно этот комментарий вместе с переводом. Баланс "
            "пополнится автоматически в течение пары минут.</i>"
        ),
        parse_mode="HTML",
    )


async def _handle_bed_withdraw_start(query, context: ContextTypes.DEFAULT_TYPE) -> None:
    uid = query.from_user.id
    storage: Storage = context.bot_data["storage"]
    if not ton.configured():
        await query.answer("On-chain вывод пока не настроен.", show_alert=True)
        return
    if not config.TON_WITHDRAWALS_ENABLED:
        await query.answer(
            "📤 Вывод BED скоро откроется (идёт тестирование). Скоро всё заработает!",
            show_alert=True,
        )
        return
    bal = storage.get_bed(uid)
    if bal < config.BED_MIN_WITHDRAW:
        await query.answer(
            f"Недостаточно BED для вывода (минимум {config.BED_MIN_WITHDRAW}).",
            show_alert=True,
        )
        return
    await query.answer()
    context.bot_data.setdefault("bed_wd_await", set()).add(uid)
    await context.bot.send_message(
        chat_id=query.message.chat_id,
        text=(
            "<b>📤 Вывод BedCoin</b>\n\n"
            f"Ваш баланс: <b>{bal} BED</b>\n"
            f"Лимиты: от {config.BED_MIN_WITHDRAW} до {config.BED_MAX_WITHDRAW} BED за раз.\n\n"
            "Пришлите одним сообщением:\n"
            "<code>TON-адрес количество</code>\n\n"
            "Например:\n<code>UQ... 5</code>\n\n"
            "Отмена — /cancel"
        ),
        parse_mode="HTML",
    )


async def _process_bed_withdraw(message, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the address+amount reply for a pending withdrawal."""
    storage: Storage = context.bot_data["storage"]
    uid = message.from_user.id
    awaiting = context.bot_data.setdefault("bed_wd_await", set())
    text = (message.text or "").strip()
    if text.startswith("/cancel"):
        awaiting.discard(uid)
        await message.reply_text("Вывод отменён.")
        return
    parts = text.split()
    if len(parts) < 2 or not parts[-1].isdigit():
        await message.reply_text(
            "Неверный формат. Пришлите: <code>TON-адрес количество</code>, например "
            "<code>UQ... 5</code>. Отмена — /cancel",
            parse_mode="HTML",
        )
        return
    address = parts[0]
    amount = int(parts[-1])
    if amount < config.BED_MIN_WITHDRAW or amount > config.BED_MAX_WITHDRAW:
        await message.reply_text(
            f"Сумма вне лимита ({config.BED_MIN_WITHDRAW}–{config.BED_MAX_WITHDRAW} BED)."
        )
        return
    # Reserve funds atomically before touching the chain; refund on failure.
    if not storage.spend_bed(uid, amount):
        awaiting.discard(uid)
        await message.reply_text(f"Недостаточно BED. Баланс: {storage.get_bed(uid)} BED.")
        return
    awaiting.discard(uid)
    wid = storage.create_withdrawal(uid, address, amount)
    await message.reply_text(f"⏳ Отправляю {amount} BED на\n{address} …")
    try:
        tx_hash = await ton.send_bed(address, amount, comment=f"BedCoin withdrawal #{wid}")
        storage.set_withdrawal_status(wid, "sent", tx_hash=str(tx_hash))
        await message.reply_text(
            f"✅ Отправлено {amount} BED!\nБаланс: {storage.get_bed(uid)} BED.\n"
            f"Транзакция принята сетью."
        )
    except Exception as exc:
        logger.exception("BED withdrawal %s failed", wid)
        storage.add_bed(uid, amount)  # refund
        storage.set_withdrawal_status(wid, "failed", error=str(exc)[:300])
        await message.reply_text(
            "⚠️ Не удалось отправить перевод — средства возвращены на баланс. "
            "Проверьте адрес и попробуйте позже."
        )


async def handle_callback_query(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if query.data == "support_info":
        await query.answer(text=texts.SUPPORT_PROMPT, show_alert=True)
    elif query.data.startswith("help:"):
        key = query.data.split(":", 1)[1]
        await query.answer()
        if key == "back":
            await _edit_msg(query, texts.build_help_menu_text(), texts.build_cmds_keyboard())
        elif key == "troll":
            await _show_troll_menu(query, context)
        else:
            desc = texts.build_help_detail_text(key)
            if desc:
                await _edit_msg(query, desc, texts.build_help_detail_keyboard())
    elif query.data.startswith("troll:") or query.data.startswith("trolldel:"):
        await _handle_troll_callback(query, context)
    elif query.data.startswith("menu:"):
        await _handle_menu_callback(query, context)
    elif query.data.startswith("func:"):
        await _handle_func_callback(query, context)
    elif query.data.startswith("style:"):
        await _handle_style_callback(query, context)
    elif query.data.startswith("adm:"):
        await _handle_admin_callback(query, context)
    elif query.data.startswith("bedcmd:"):
        await _handle_bedcmd_callback(query, context)
    elif query.data.startswith("bedchain:"):
        await _handle_bedchain_callback(query, context)
    elif query.data.startswith("bed:"):
        await _handle_bed_callback(query, context)
    elif query.data == "cmds:open":
        await query.answer()
        await context.bot.send_message(
            chat_id=query.message.chat_id,
            text=texts.build_help_menu_text(), parse_mode="HTML",
            reply_markup=texts.build_help_menu_keyboard(),
        )
    elif query.data == "tg_help":
        await query.answer()
        await context.bot.send_message(
            chat_id=query.message.chat_id,
            text="❓ Задайте любой вопрос по Telegram одним сообщением: /ask <вопрос>",
        )
    elif query.data.startswith("buy:"):
        await query.answer()
        try:
            idx = int(query.data.split(":", 1)[1])
            label, stars, days = config.PREMIUM_PACKAGES[idx]
        except (ValueError, IndexError):
            return
        await context.bot.send_invoice(
            chat_id=query.message.chat_id,
            title=f"Bed Dialog Premium ({label})",
            description=f"Премиум-доступ на {days} дней.",
            payload=f"premium:{query.from_user.id}:{days}",
            currency="XTR",
            prices=[LabeledPrice(f"Premium {label}", stars)],
            provider_token="",
        )
    elif query.data.startswith("crypto:"):
        await query.answer()
        storage: Storage = context.bot_data["storage"]
        if not crypto.is_enabled():
            await context.bot.send_message(query.message.chat_id, "💳 Крипто-оплата пока не настроена.")
            return
        try:
            idx = int(query.data.split(":", 1)[1])
            label, _stars, days = config.PREMIUM_PACKAGES[idx]
            amount = config.CRYPTO_PRICES[idx]
        except (ValueError, IndexError):
            return
        invoice = await crypto.create_invoice(
            amount,
            description=f"Bed Dialog Premium ({label}) — {days} дн.",
            payload=f"premium:{query.from_user.id}:{days}",
        )
        if not invoice:
            await context.bot.send_message(query.message.chat_id, "⚠️ Не удалось создать счёт, попробуйте позже.")
            return
        storage.add_crypto_invoice(int(invoice["invoice_id"]), query.from_user.id, days)
        pay_url = invoice.get("bot_invoice_url") or invoice.get("pay_url")
        await context.bot.send_message(
            chat_id=query.message.chat_id,
            text=(f"💳 Оплата {amount} {config.CRYPTO_PAY_ASSET} через @CryptoBot.\n"
                  "Нажмите кнопку, оплатите — премиум активируется автоматически в течение минуты."),
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("💳 Оплатить", url=pay_url)]]
            ),
        )
    else:
        await query.answer()


async def handle_inline_query(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.inline_query
    q = (query.query or "").strip()
    bot_username = context.bot.username
    ref_link = f"https://t.me/{bot_username}?start=ref_{query.from_user.id}"
    results = []
    if q:
        results.append(
            InlineQueryResultArticle(
                id="send",
                title=f"Отправить: {q[:40]}",
                description="Отправить этот текст",
                input_message_content=InputTextMessageContent(q),
            )
        )
    results.append(
        InlineQueryResultArticle(
            id="share",
            title="📢 Поделиться ботом",
            description="Диалоги под контролем — удалённые и изменённые сообщения",
            input_message_content=InputTextMessageContent(
                f"🤖 @{bot_username} — сохраняет удалённые и изменённые сообщения.\n{ref_link}"
            ),
        )
    )
    try:
        await query.answer(results, cache_time=10, is_personal=True)
    except Exception:
        logger.exception("Failed to answer inline query")


async def dispatch(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.business_connection:
        await handle_business_connection(update, context)
    elif update.deleted_business_messages:
        await handle_deleted_business_messages(update, context)
    elif update.edited_business_message:
        await handle_edited_business_message(update, context)
    elif update.business_message:
        await handle_new_business_message(update, context)
    elif update.pre_checkout_query:
        await handle_pre_checkout_query(update, context)
    elif update.callback_query:
        await handle_callback_query(update, context)
    elif update.inline_query:
        await handle_inline_query(update, context)
    elif update.message:
        await handle_direct_message(update, context)
