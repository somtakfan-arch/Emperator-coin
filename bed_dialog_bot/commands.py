import asyncio
import logging
import re
import time

from telegram import Message
from telegram.error import RetryAfter
from telegram.ext import ContextTypes

from . import config, formatting
from .storage import Storage

logger = logging.getLogger(__name__)

SPAM_WINDOW_SECONDS = 45

_BAN_RE = re.compile(r"^\.ban\s+(\d+)\s*$")
_UNBAN_RE = re.compile(r"^\.unban\s*$")
_SPAM_RE = re.compile(r"^\.spam\s+(\d+)\s+(.+)$", re.DOTALL)
_HELP_RE = re.compile(r"^\.help\s*$")

HELP_TEXT = (
    "Команды (пишутся прямо в чат с собеседником):\n\n"
    ".ban <минуты> — забанить собеседника на N минут. Telegram не позволяет "
    "боту по-настоящему блокировать или удалять чужие сообщения, поэтому бот "
    "вместо этого автоматически отвечает собеседнику, пока бан активен.\n"
    ".unban — снять бан раньше времени\n"
    ".spam <количество> <сообщение> — отправить сообщение N раз подряд "
    f"(максимум {config.FREE_SPAM_MAX} сообщений за {SPAM_WINDOW_SECONDS} секунд, "
    f"с премиумом — до {config.PREMIUM_SPAM_MAX})\n"
    ".help — этот список команд"
)


async def _edit_command_message(context: ContextTypes.DEFAULT_TYPE, business_connection_id: str, chat_id: int, message_id: int, text: str) -> None:
    # Bot API has no way to delete a business message, only edit it — this is
    # how the raw ".command" text typed into the real chat gets hidden.
    try:
        await context.bot.edit_message_text(
            chat_id=chat_id,
            message_id=message_id,
            business_connection_id=business_connection_id,
            text=text,
        )
    except Exception:
        logger.exception("Failed to edit command message %s in chat %s", message_id, chat_id)


async def try_handle_owner_command(
    message: Message,
    context: ContextTypes.DEFAULT_TYPE,
    storage: Storage,
    owner_chat_id: int,
) -> bool:
    text = message.text
    if not text or not text.startswith("."):
        return False

    bcid = message.business_connection_id
    chat_id = message.chat_id
    message_id = message.message_id

    is_premium = storage.is_premium(message.from_user.id)
    bot_username = context.bot.username

    def mark(value: str) -> str:
        return formatting.with_watermark(value, bot_username, is_premium)

    ban_match = _BAN_RE.match(text)
    if ban_match:
        minutes = int(ban_match.group(1))
        storage.set_ban(bcid, chat_id, int(time.time()) + minutes * 60)
        await _edit_command_message(
            context, bcid, chat_id, message_id, mark(f"Вы забанены на {minutes} мин.")
        )
        return True

    if _UNBAN_RE.match(text):
        storage.clear_ban(bcid, chat_id)
        await _edit_command_message(context, bcid, chat_id, message_id, mark("Вы разбанены."))
        return True

    spam_match = _SPAM_RE.match(text)
    if spam_match:
        max_count = config.PREMIUM_SPAM_MAX if is_premium else config.FREE_SPAM_MAX
        count = max(1, min(int(spam_match.group(1)), max_count))
        spam_text = spam_match.group(2)
        # Only the first message carries the watermark — repeating it under
        # every copy of a spam run would bury the actual text.
        await _edit_command_message(context, bcid, chat_id, message_id, mark(spam_text))
        interval = SPAM_WINDOW_SECONDS / count
        for _ in range(count - 1):
            await asyncio.sleep(interval)
            try:
                await context.bot.send_message(chat_id=chat_id, business_connection_id=bcid, text=spam_text)
            except RetryAfter as e:
                await asyncio.sleep(e.retry_after)
                await context.bot.send_message(chat_id=chat_id, business_connection_id=bcid, text=spam_text)
        return True

    if _HELP_RE.match(text):
        await _edit_command_message(context, bcid, chat_id, message_id, mark("🤖"))
        await context.bot.send_message(chat_id=owner_chat_id, text=mark(HELP_TEXT))
        return True

    return False
