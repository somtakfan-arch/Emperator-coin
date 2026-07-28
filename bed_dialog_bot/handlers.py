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

logger = logging.getLogger(__name__)


def _display_name(message: Message) -> Tuple[str, Optional[str]]:
    user = message.from_user
    if user is None:
        return "Неизвестный", None
    name = user.full_name or user.first_name or "Неизвестный"
    return name, user.username


def _store_message(storage: Storage, message: Message, business_connection_id: str) -> None:
    photo_file_id = message.photo[-1].file_id if message.photo else None
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
            await context.bot.send_message(chat_id=bc.user_chat_id, text=text)
        except Exception:
            logger.exception("Failed to send onboarding message to %s", bc.user_chat_id)


async def handle_new_business_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.business_message
    storage: Storage = context.bot_data["storage"]
    bcid = message.business_connection_id

    conn = await _get_connection(storage, context.bot, bcid)
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
            await context.bot.send_message(
                chat_id=message.chat_id,
                business_connection_id=bcid,
                text=f"⛔ Вы заблокированы ещё на {remaining_min} мин.",
            )

    reply = message.reply_to_message
    if reply and reply.photo and not storage.message_exists(bcid, message.chat_id, reply.message_id):
        if not conn:
            return
        _store_message(storage, reply, bcid)
        r_name, r_username = _display_name(reply)
        is_premium = storage.is_premium(conn["owner_user_id"])
        caption = formatting.format_one_time_photo_caption(r_name, r_username)
        caption = formatting.with_watermark(caption, context.bot.username, is_premium)
        await context.bot.send_photo(
            chat_id=conn["owner_chat_id"],
            photo=reply.photo[-1].file_id,
            caption=caption,
        )


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
        if not conn:
            return
        is_premium = storage.is_premium(conn["owner_user_id"])
        text_out = formatting.format_edited_text(name, username, old_text, new_text)
        text_out = formatting.with_watermark(text_out, context.bot.username, is_premium)
        await context.bot.send_message(chat_id=conn["owner_chat_id"], text=text_out)


async def handle_deleted_business_messages(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    deleted = update.deleted_business_messages
    storage: Storage = context.bot_data["storage"]
    bcid = deleted.business_connection_id

    conn = await _get_connection(storage, context.bot, bcid)
    if not conn:
        return

    is_premium = storage.is_premium(conn["owner_user_id"])

    for message_id in deleted.message_ids:
        stored = storage.get_message(bcid, deleted.chat.id, message_id)
        if not stored:
            continue

        name = stored["from_name"] or "Неизвестный"
        username = stored["from_username"]

        if stored["photo_file_id"]:
            caption = formatting.format_deleted_photo_caption(name, username, stored["caption"])
            caption = formatting.with_watermark(caption, context.bot.username, is_premium)
            await context.bot.send_photo(
                chat_id=conn["owner_chat_id"],
                photo=stored["photo_file_id"],
                caption=caption,
            )
        elif stored["text"]:
            text_out = formatting.format_deleted_text(name, username, stored["text"])
            text_out = formatting.with_watermark(text_out, context.bot.username, is_premium)
            await context.bot.send_message(chat_id=conn["owner_chat_id"], text=text_out)

        storage.delete_message(bcid, deleted.chat.id, message_id)


async def handle_pre_checkout_query(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await context.bot.answer_pre_checkout_query(update.pre_checkout_query.id, ok=True)


async def handle_direct_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.message
    storage: Storage = context.bot_data["storage"]

    if message.successful_payment:
        until_ts = storage.grant_premium_days(message.from_user.id, config.PREMIUM_DURATION_DAYS)
        until_str = datetime.fromtimestamp(until_ts).strftime("%d.%m.%Y")
        await message.reply_text(f"✅ Премиум активирован до {until_str}.")
        return

    text = message.text or ""

    if text.startswith("/start") or text.startswith("/help"):
        await message.reply_text(texts.build_intro_text(context.bot.username))
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
    elif update.message:
        await handle_direct_message(update, context)
