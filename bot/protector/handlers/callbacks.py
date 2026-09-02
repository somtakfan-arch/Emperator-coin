"""Инлайн-кнопки: капча и одобрение новичков в карантине."""

from __future__ import annotations

from aiogram import Bot, F, Router
from aiogram.types import CallbackQuery

from .. import moderation
from ..guard import Guard

router = Router(name="callbacks")


@router.callback_query(F.data.startswith("cap:"))
async def on_captcha(query: CallbackQuery, guard: Guard, bot: Bot) -> None:
    if query.message is None:
        await query.answer("Сообщение недоступно.", show_alert=True)
        return
    _, raw_user_id, answer = query.data.split(":", 2)
    if str(query.from_user.id) != raw_user_id:
        await query.answer("Это не твоя капча 🙂", show_alert=True)
        return
    chat_id = query.message.chat.id
    result = await guard.captcha.solve(chat_id, query.from_user, answer)
    if result is None:
        await query.answer("Капча уже неактуальна.", show_alert=True)
    elif result:
        await query.answer("Готово, добро пожаловать!")
    else:
        await query.answer("Неверно. Осталась одна попытка.", show_alert=True)


@router.callback_query(F.data.startswith(("apr:", "bna:")))
async def on_moderation_button(query: CallbackQuery, guard: Guard, bot: Bot) -> None:
    if query.message is None:
        await query.answer("Сообщение недоступно.", show_alert=True)
        return
    action, raw_user_id = query.data.split(":", 1)
    if not raw_user_id.lstrip("-").isdigit():
        await query.answer()
        return
    user_id = int(raw_user_id)
    chat_id = query.message.chat.id

    if not (
        guard.is_owner(query.from_user.id)
        or await moderation.is_admin(bot, chat_id, query.from_user.id)
    ):
        await query.answer("Только для админов.", show_alert=True)
        return

    if action == "apr":
        await moderation.unmute(bot, chat_id, user_id)
        await query.answer("Пропущен.")
        await moderation.safe(
            query.message.edit_text(
                f"✅ Участник <code>{user_id}</code> одобрен "
                f"({query.from_user.full_name})."
            ),
            "правка сообщения карантина",
        )
        await guard.record(chat_id, user_id, "approved", str(query.from_user.id), notify=False)
        return

    await moderation.ban(bot, chat_id, user_id)
    await query.answer("Забанен.")
    await moderation.safe(
        query.message.edit_text(
            f"⛔️ Участник <code>{user_id}</code> забанен ({query.from_user.full_name})."
        ),
        "правка сообщения карантина",
    )
    await guard.record(chat_id, user_id, "quarantine_ban", str(query.from_user.id))
