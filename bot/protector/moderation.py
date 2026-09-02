"""Действия модерации поверх Bot API + безопасные обёртки над ошибками."""

from __future__ import annotations

import html
import logging
from datetime import datetime, timedelta, timezone

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError
from aiogram.types import ChatPermissions, Message, User

log = logging.getLogger("bed-protector")

MUTED = ChatPermissions(
    can_send_messages=False,
    can_send_audios=False,
    can_send_documents=False,
    can_send_photos=False,
    can_send_videos=False,
    can_send_video_notes=False,
    can_send_voice_notes=False,
    can_send_polls=False,
    can_send_other_messages=False,
    can_add_web_page_previews=False,
    can_change_info=False,
    can_invite_users=False,
    can_pin_messages=False,
)

OPEN = ChatPermissions(
    can_send_messages=True,
    can_send_audios=True,
    can_send_documents=True,
    can_send_photos=True,
    can_send_videos=True,
    can_send_video_notes=True,
    can_send_voice_notes=True,
    can_send_polls=True,
    can_send_other_messages=True,
    can_add_web_page_previews=True,
    can_invite_users=True,
)


def mention(user: User) -> str:
    name = html.escape(user.full_name or str(user.id))
    return f'<a href="tg://user?id={user.id}">{name}</a>'


def until(minutes: int) -> datetime | None:
    """Telegram считает ограничение < 30 сек или > 366 дней вечным."""
    if minutes <= 0:
        return None
    return datetime.now(timezone.utc) + timedelta(minutes=minutes)


async def safe(coro, action: str = "") -> bool:
    """Выполняет запрос к API, глотая ожидаемые ошибки прав/гонок."""
    try:
        await coro
        return True
    except TelegramAPIError as err:
        log.warning("не удалось выполнить %s: %s", action or "действие", err)
        return False


async def delete_message(bot: Bot, chat_id: int, message_id: int) -> bool:
    return await safe(bot.delete_message(chat_id, message_id), "удаление сообщения")


async def mute(bot: Bot, chat_id: int, user_id: int, minutes: int = 60) -> bool:
    return await safe(
        bot.restrict_chat_member(
            chat_id=chat_id, user_id=user_id, permissions=MUTED, until_date=until(minutes)
        ),
        "мут",
    )


async def unmute(bot: Bot, chat_id: int, user_id: int) -> bool:
    permissions = OPEN
    try:
        chat = await bot.get_chat(chat_id)
        if chat.permissions:
            permissions = chat.permissions
    except TelegramAPIError:
        pass
    return await safe(
        bot.restrict_chat_member(chat_id=chat_id, user_id=user_id, permissions=permissions),
        "снятие мута",
    )


async def ban(bot: Bot, chat_id: int, user_id: int, minutes: int = 0) -> bool:
    return await safe(
        bot.ban_chat_member(chat_id=chat_id, user_id=user_id, until_date=until(minutes)),
        "бан",
    )


async def unban(bot: Bot, chat_id: int, user_id: int) -> bool:
    return await safe(
        bot.unban_chat_member(chat_id=chat_id, user_id=user_id, only_if_banned=True),
        "разбан",
    )


async def kick(bot: Bot, chat_id: int, user_id: int) -> bool:
    """Кик = бан + мгновенный разбан, иначе человек не сможет вернуться."""
    ok = await ban(bot, chat_id, user_id)
    await unban(bot, chat_id, user_id)
    return ok


async def apply_action(
    bot: Bot,
    action: str,
    chat_id: int,
    user_id: int,
    *,
    mute_minutes: int = 60,
    ban_minutes: int = 0,
) -> str:
    """Единая точка применения наказания по названию из настроек."""
    if action == "mute":
        return "мут" if await mute(bot, chat_id, user_id, mute_minutes) else "ошибка"
    if action == "kick":
        return "кик" if await kick(bot, chat_id, user_id) else "ошибка"
    if action == "ban":
        return "бан" if await ban(bot, chat_id, user_id, ban_minutes) else "ошибка"
    return "удаление"


async def is_admin(bot: Bot, chat_id: int, user_id: int) -> bool:
    try:
        member = await bot.get_chat_member(chat_id, user_id)
    except TelegramAPIError:
        return False
    return member.status in {"creator", "administrator"}


async def bot_can_restrict(bot: Bot, chat_id: int) -> bool:
    try:
        me = await bot.get_chat_member(chat_id, bot.id)
    except TelegramAPIError:
        return False
    return bool(getattr(me, "can_restrict_members", False))


async def target_user(message: Message) -> User | None:
    """Цель команды: ответом на сообщение или через text_mention/@username."""
    if message.reply_to_message and message.reply_to_message.from_user:
        return message.reply_to_message.from_user
    for entity in message.entities or []:
        if entity.type == "text_mention" and entity.user:
            return entity.user
    return None
