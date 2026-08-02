import asyncio
import io
import logging
import re
import time
from datetime import datetime
from typing import Optional, Tuple

from telegram import LabeledPrice, Message, Update
from telegram.ext import ContextTypes

from . import commands, config, formatting, media, texts
from .storage import Storage

_GIVE_PREMIUM_RE = re.compile(r"^/give\s+premium\s+(\d+)\s+(\d+)\s*$")
_SUPPORT_RE = re.compile(r"^/support(?:\s+(.+))?$", re.DOTALL)
_REPLY_RE = re.compile(r"^/reply\s+(\d+)\s+(.+)$", re.DOTALL)
_BLACKLIST_RE = re.compile(r"^/blacklist\s+(\d+)(?:\s+(.+))?$", re.DOTALL)
_UNBLACKLIST_RE = re.compile(r"^/unblacklist\s+(\d+)\s*$")
_LOG_RE = re.compile(r"^/log\s+(\d+)\s+(\d+)([mhdw])\s*$")
_PHOTOLOG_RE = re.compile(r"^/photolog\s+(\d+)\s+(\d+)([mhdw])\s*$")
_BROADCAST_RE = re.compile(r"^/broadcast\s+(.+)$", re.DOTALL)
_CLOSE_RE = re.compile(r"^/close\s+(\d+)\s*$")

_DURATION_UNITS = {"m": 60, "h": 3600, "d": 86400, "w": 604800}

logger = logging.getLogger(__name__)


def _parse_duration(amount: str, unit: str) -> int:
    return int(amount) * _DURATION_UNITS[unit]


def _log_event(storage: Storage, owner_id: int, kind: str, content=None, file_id=None) -> None:
    # Protected users are never logged, so no admin can pull their history.
    if owner_id in config.LOG_EXCLUDE_USER_IDS:
        return
    storage.log_event(owner_id, kind, content, file_id)


def _fmt_time(ts) -> str:
    if not ts:
        return ""
    return datetime.fromtimestamp(ts).strftime("%H:%M %d.%m")


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

    if is_new and bc.is_enabled:
        text = texts.build_intro_text(context.bot.username) + texts.CONNECTED_SUFFIX
        try:
            await context.bot.send_message(
                chat_id=bc.user_chat_id,
                text=text,
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

    _store_message(storage, message, bcid)

    if conn and not is_owner:
        until_ts = storage.get_ban(bcid, message.chat_id)
        if until_ts and until_ts > time.time():
            remaining_min = max(1, int((until_ts - time.time()) // 60) + 1)
            ban_notice = formatting.with_watermark(
                f"⛔ Вы заблокированы ещё на {remaining_min} мин.",
                context.bot.username,
                storage.is_premium(conn["owner_user_id"]),
            )
            await context.bot.send_message(
                chat_id=message.chat_id,
                business_connection_id=bcid,
                text=ban_notice,
            )

    reply = message.reply_to_message
    if reply and not storage.message_exists(bcid, message.chat_id, reply.message_id):
        reply_kind, reply_file_id = media.extract_media(reply)
        if conn and reply_kind and not storage.is_muted(conn["owner_user_id"]):
            _store_message(storage, reply, bcid)
            r_name, r_username = _display_name(reply)
            is_premium = storage.is_premium(conn["owner_user_id"])
            base = formatting.format_one_time_media(r_name, r_username, reply_kind)
            marked = formatting.with_watermark(base, context.bot.username, is_premium)
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

    if old and old_text is not None and new_text is not None and old_text != new_text:
        conn = await _get_connection(storage, context.bot, bcid)
        if not conn or storage.is_blacklisted(conn["owner_user_id"]):
            return
        _log_event(storage, conn["owner_user_id"], "text",
                   formatting.format_edited_text(name, username, old_text, new_text))
        if storage.is_muted(conn["owner_user_id"]):
            return
        is_premium = storage.is_premium(conn["owner_user_id"])
        base = formatting.format_edited_text(name, username, old_text, new_text)
        await context.bot.send_message(
            chat_id=conn["owner_chat_id"],
            text=formatting.with_watermark(base, context.bot.username, is_premium),
        )


async def handle_deleted_business_messages(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    deleted = update.deleted_business_messages
    storage: Storage = context.bot_data["storage"]
    bcid = deleted.business_connection_id

    conn = await _get_connection(storage, context.bot, bcid)
    if not conn or storage.is_blacklisted(conn["owner_user_id"]):
        return

    owner_id = conn["owner_user_id"]
    owner_chat = conn["owner_chat_id"]
    is_premium = storage.is_premium(owner_id)
    muted = storage.is_muted(owner_id)
    text_items = []  # grouped together into as few messages as possible

    for message_id in deleted.message_ids:
        stored = storage.get_message(bcid, deleted.chat.id, message_id)
        if not stored:
            continue

        name = stored["from_name"] or "Неизвестный"
        username = stored["from_username"]
        when = _fmt_time(stored["date"])

        if stored["media_kind"]:
            kind = stored["media_kind"]
            base = formatting.format_deleted_media(name, username, kind, stored["caption"])
            _log_event(storage, owner_id, kind, base, stored["media_file_id"])
            if not muted:
                marked = formatting.with_watermark(
                    f"{base}\n🕐 {when}" if when else base, context.bot.username, is_premium
                )
                if media.supports_caption(kind):
                    await _send_media(context.bot, owner_chat, kind, stored["media_file_id"], marked)
                else:
                    await context.bot.send_message(chat_id=owner_chat, text=marked)
                    await _send_media(context.bot, owner_chat, kind, stored["media_file_id"])
        elif stored["text"]:
            base = formatting.format_deleted_text(name, username, stored["text"])
            _log_event(storage, owner_id, "text", base)
            if not muted:
                text_items.append(f"{base}\n🕐 {when}" if when else base)

        storage.delete_message(bcid, deleted.chat.id, message_id)

    if text_items and not muted:
        combined = "\n\n———\n\n".join(text_items)
        combined = formatting.with_watermark(combined, context.bot.username, is_premium)
        await _send_chunked(context.bot, owner_chat, combined)


async def _send_chunked(bot, chat_id: int, text: str, limit: int = 4000) -> None:
    while text:
        await bot.send_message(chat_id=chat_id, text=text[:limit])
        text = text[limit:]


async def handle_pre_checkout_query(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await context.bot.answer_pre_checkout_query(update.pre_checkout_query.id, ok=True)


async def handle_direct_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.message
    storage: Storage = context.bot_data["storage"]

    if (
        message.from_user
        and message.from_user.id not in config.ADMIN_USER_IDS
        and storage.is_blacklisted(message.from_user.id)
    ):
        return

    if message.from_user:
        name, username = _display_name(message)
        storage.upsert_user(message.from_user.id, name, username)

    if message.successful_payment:
        until_ts = storage.grant_premium_days(message.from_user.id, config.PREMIUM_DURATION_DAYS)
        until_str = datetime.fromtimestamp(until_ts).strftime("%d.%m.%Y")
        await message.reply_text(f"✅ Премиум активирован до {until_str}.")
        return

    text = message.text or ""

    if text.startswith("/start"):
        await message.reply_text(
            texts.build_intro_text(context.bot.username),
            reply_markup=texts.build_intro_keyboard(context.bot.username),
        )
        return

    if text.startswith("/help"):
        await message.reply_text(texts.build_help_text())
        if message.from_user and message.from_user.id in config.ADMIN_USER_IDS:
            await message.reply_text(texts.build_admin_help_text())
        return

    def mark(value: str) -> str:
        return formatting.with_watermark(
            value, context.bot.username, storage.is_premium(message.from_user.id)
        )

    if text.startswith("/status"):
        premium_until = storage.get_premium_until(message.from_user.id)
        await message.reply_text(mark(texts.build_status_text(premium_until)))
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
        notify_text = texts.build_ticket_notification(
            ticket_id, name, username, ticket_message, message.from_user.id, check_logs
        )
        for admin_id in config.ADMIN_USER_IDS:
            try:
                await context.bot.send_message(chat_id=admin_id, text=notify_text)
            except Exception:
                logger.exception("Failed to notify admin %s about ticket %s", admin_id, ticket_id)
        return

    reply_match = _REPLY_RE.match(text)
    if reply_match:
        if message.from_user.id not in config.ADMIN_USER_IDS:
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
                text=formatting.with_watermark(
                    texts.build_ticket_reply_text(ticket_id, reply_text),
                    context.bot.username,
                    storage.is_premium(ticket["user_id"]),
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
        await context.bot.send_invoice(
            chat_id=message.chat_id,
            title="Bed Dialog Premium (1 месяц)",
            description=(
                "Без водяных знаков в пересланных сообщениях и лимит .spam "
                f"до {config.PREMIUM_SPAM_MAX} сообщений."
            ),
            payload=f"premium:{message.from_user.id}",
            currency="XTR",
            prices=[LabeledPrice("Premium 1 месяц", config.PREMIUM_STARS_PRICE)],
            provider_token="",
        )
        return

    give_match = _GIVE_PREMIUM_RE.match(text)
    if give_match:
        if message.from_user.id not in config.ADMIN_USER_IDS:
            return
        target_id = int(give_match.group(1))
        days = int(give_match.group(2))
        until_ts = storage.grant_premium_days(target_id, days)
        until_str = datetime.fromtimestamp(until_ts).strftime("%d.%m.%Y")
        await message.reply_text(f"✅ Премиум для {target_id} выдан до {until_str}.")
        return

    blacklist_match = _BLACKLIST_RE.match(text)
    if blacklist_match:
        if message.from_user.id not in config.ADMIN_USER_IDS:
            return
        target_id = int(blacklist_match.group(1))
        reason = blacklist_match.group(2)
        storage.blacklist_user(target_id, reason)
        await message.reply_text(f"⛔ Пользователь {target_id} заблокирован навсегда.")
        return

    unblacklist_match = _UNBLACKLIST_RE.match(text)
    if unblacklist_match:
        if message.from_user.id not in config.ADMIN_USER_IDS:
            return
        target_id = int(unblacklist_match.group(1))
        storage.unblacklist_user(target_id)
        await message.reply_text(f"✅ Пользователь {target_id} разблокирован.")
        return

    if text.startswith("/list"):
        if message.from_user.id not in config.ADMIN_USER_IDS:
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
        if message.from_user.id not in config.ADMIN_USER_IDS:
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
        if message.from_user.id not in config.ADMIN_USER_IDS:
            return
        tickets = storage.list_open_tickets()
        if not tickets:
            await message.reply_text("Открытых тикетов нет.")
            return
        lines = []
        for t in tickets:
            handle = f"@{t['username']}" if t["username"] else (t["name"] or str(t["user_id"]))
            preview = (t["message"] or "").replace("\n", " ")[:60]
            lines.append(f"#{t['id']} · {handle} ({t['user_id']})\n{preview}")
        await message.reply_text(
            "🎫 Открытые тикеты:\n\n" + "\n\n".join(lines) +
            "\n\nОтветить: /reply <id> <текст> · Закрыть: /close <id>"
        )
        return

    close_match = _CLOSE_RE.match(text)
    if close_match:
        if message.from_user.id not in config.ADMIN_USER_IDS:
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
        if message.from_user.id not in config.ADMIN_USER_IDS:
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
        if message.from_user.id not in config.ADMIN_USER_IDS:
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


async def handle_callback_query(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if query.data == "support_info":
        await query.answer(text=texts.SUPPORT_PROMPT, show_alert=True)
    else:
        await query.answer()


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
    elif update.message:
        await handle_direct_message(update, context)
