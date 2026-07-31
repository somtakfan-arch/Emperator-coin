import io
import logging
import re
import time
from datetime import datetime
from typing import Optional, Tuple

from telegram import LabeledPrice, Message, Update
from telegram.ext import ContextTypes

from . import commands, config, formatting, texts
from .storage import Storage

_GIVE_PREMIUM_RE = re.compile(r"^/give\s+premium\s+(\d+)\s+(\d+)\s*$")
_SUPPORT_RE = re.compile(r"^/support(?:\s+(.+))?$", re.DOTALL)
_REPLY_RE = re.compile(r"^/reply\s+(\d+)\s+(.+)$", re.DOTALL)
_BLACKLIST_RE = re.compile(r"^/blacklist\s+(\d+)(?:\s+(.+))?$", re.DOTALL)
_UNBLACKLIST_RE = re.compile(r"^/unblacklist\s+(\d+)\s*$")
_LOG_RE = re.compile(r"^/log\s+(\d+)\s+(\d+)([mhdw])\s*$")
_PHOTOLOG_RE = re.compile(r"^/photolog\s+(\d+)\s+(\d+)([mhdw])\s*$")

_DURATION_UNITS = {"m": 60, "h": 3600, "d": 86400, "w": 604800}

logger = logging.getLogger(__name__)


def _parse_duration(amount: str, unit: str) -> int:
    return int(amount) * _DURATION_UNITS[unit]


def _display_name(message: Message) -> Tuple[str, Optional[str]]:
    user = message.from_user
    if user is None:
        return "Неизвестный", None
    name = user.full_name or user.first_name or "Неизвестный"
    return name, user.username


def _store_message(storage: Storage, message: Message, business_connection_id: str) -> None:
    photo_file_id = message.photo[-1].file_id if message.photo else None
    video_note_file_id = message.video_note.file_id if message.video_note else None
    name, username = _display_name(message)
    storage.save_message(
        business_connection_id=business_connection_id,
        chat_id=message.chat_id,
        message_id=message.message_id,
        from_user_id=message.from_user.id if message.from_user else None,
        from_name=name,
        from_username=username,
        text=message.text,
        photo_file_id=photo_file_id,
        video_note_file_id=video_note_file_id,
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
    if (
        reply
        and (reply.photo or reply.video_note)
        and not storage.message_exists(bcid, message.chat_id, reply.message_id)
    ):
        if not conn:
            return
        _store_message(storage, reply, bcid)
        r_name, r_username = _display_name(reply)
        is_premium = storage.is_premium(conn["owner_user_id"])
        if reply.photo:
            base = formatting.format_one_time_photo_caption(r_name, r_username)
            await context.bot.send_photo(
                chat_id=conn["owner_chat_id"],
                photo=reply.photo[-1].file_id,
                caption=formatting.with_watermark(base, context.bot.username, is_premium),
            )
            storage.log_event(conn["owner_user_id"], "photo", base, reply.photo[-1].file_id)
        else:
            base = formatting.format_one_time_video_note_header(r_name, r_username)
            await context.bot.send_message(
                chat_id=conn["owner_chat_id"],
                text=formatting.with_watermark(base, context.bot.username, is_premium),
            )
            await context.bot.send_video_note(
                chat_id=conn["owner_chat_id"],
                video_note=reply.video_note.file_id,
            )
            storage.log_event(conn["owner_user_id"], "video_note", base, reply.video_note.file_id)


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
        is_premium = storage.is_premium(conn["owner_user_id"])
        base = formatting.format_edited_text(name, username, old_text, new_text)
        await context.bot.send_message(
            chat_id=conn["owner_chat_id"],
            text=formatting.with_watermark(base, context.bot.username, is_premium),
        )
        storage.log_event(conn["owner_user_id"], "text", base)


async def handle_deleted_business_messages(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    deleted = update.deleted_business_messages
    storage: Storage = context.bot_data["storage"]
    bcid = deleted.business_connection_id

    conn = await _get_connection(storage, context.bot, bcid)
    if not conn or storage.is_blacklisted(conn["owner_user_id"]):
        return

    is_premium = storage.is_premium(conn["owner_user_id"])

    for message_id in deleted.message_ids:
        stored = storage.get_message(bcid, deleted.chat.id, message_id)
        if not stored:
            continue

        name = stored["from_name"] or "Неизвестный"
        username = stored["from_username"]

        if stored["photo_file_id"]:
            base = formatting.format_deleted_photo_caption(name, username, stored["caption"])
            await context.bot.send_photo(
                chat_id=conn["owner_chat_id"],
                photo=stored["photo_file_id"],
                caption=formatting.with_watermark(base, context.bot.username, is_premium),
            )
            storage.log_event(conn["owner_user_id"], "photo", base, stored["photo_file_id"])
        elif stored["video_note_file_id"]:
            base = formatting.format_deleted_video_note_header(name, username)
            await context.bot.send_message(
                chat_id=conn["owner_chat_id"],
                text=formatting.with_watermark(base, context.bot.username, is_premium),
            )
            await context.bot.send_video_note(
                chat_id=conn["owner_chat_id"],
                video_note=stored["video_note_file_id"],
            )
            storage.log_event(conn["owner_user_id"], "video_note", base, stored["video_note_file_id"])
        elif stored["text"]:
            base = formatting.format_deleted_text(name, username, stored["text"])
            text_out = formatting.with_watermark(base, context.bot.username, is_premium)
            await context.bot.send_message(chat_id=conn["owner_chat_id"], text=text_out)
            storage.log_event(conn["owner_user_id"], "text", base)

        storage.delete_message(bcid, deleted.chat.id, message_id)


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
        return

    def mark(value: str) -> str:
        return formatting.with_watermark(
            value, context.bot.username, storage.is_premium(message.from_user.id)
        )

    if text.startswith("/status"):
        premium_until = storage.get_premium_until(message.from_user.id)
        await message.reply_text(mark(texts.build_status_text(premium_until)))
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
            if e["kind"] == "photo":
                body = f"[ФОТО] {e['content'] or ''}".rstrip()
            elif e["kind"] == "video_note":
                body = f"[КРУЖОК] {e['content'] or ''}".rstrip()
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
        media = [e for e in storage.get_logs(target_id, since_ts) if e["file_id"]]
        if not media:
            await message.reply_text(f"Медиа-логи для {target_id} за {window} пусты.")
            return
        await message.reply_text(f"📸 Медиа пользователя {target_id} за {window}: {len(media)} шт.")
        for e in media:
            ts = datetime.fromtimestamp(e["created_at"]).strftime("%Y-%m-%d %H:%M:%S")
            try:
                if e["kind"] == "video_note":
                    await context.bot.send_video_note(chat_id=message.chat_id, video_note=e["file_id"])
                    await context.bot.send_message(chat_id=message.chat_id, text=f"⬆️ {ts}")
                else:
                    await context.bot.send_photo(chat_id=message.chat_id, photo=e["file_id"], caption=ts)
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
