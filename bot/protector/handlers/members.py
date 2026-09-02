"""Вход/выход участников: капча, антирейд, антиснос (массовые баны от админа)."""

from __future__ import annotations

import html

from aiogram import Bot, F, Router
from aiogram.types import ChatMemberUpdated, InlineKeyboardButton, InlineKeyboardMarkup, Message

from .. import moderation
from ..guard import Guard
from ..heuristics import looks_like_raid_name

router = Router(name="members")

PRESENT = {"member", "administrator", "creator", "restricted"}
GONE = {"left", "kicked"}


def approve_keyboard(user_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Пропустить", callback_data=f"apr:{user_id}"),
                InlineKeyboardButton(text="🚫 Забанить", callback_data=f"bna:{user_id}"),
            ]
        ]
    )


@router.chat_member()
async def on_chat_member(event: ChatMemberUpdated, guard: Guard, bot: Bot) -> None:
    chat_id = event.chat.id
    old, new = event.old_chat_member.status, event.new_chat_member.status
    target = event.new_chat_member.user
    actor = event.from_user

    guard.storage.touch_chat(chat_id, event.chat.title or "")

    if old in GONE and new in PRESENT:
        await _on_join(event, guard, bot)
        return

    if new in GONE and actor and actor.id not in (target.id, bot.id):
        await _on_forced_removal(event, guard, bot)


async def _on_join(event: ChatMemberUpdated, guard: Guard, bot: Bot) -> None:
    chat_id = event.chat.id
    user = event.new_chat_member.user
    cfg = guard.settings(chat_id)

    guard.storage.register_join(chat_id, user.id)

    if user.is_bot:
        # Ботов приводят админы; чужого бота лучше сразу выставить.
        if not await moderation.is_admin(bot, chat_id, event.from_user.id):
            await moderation.kick(bot, chat_id, user.id)
            await guard.record(chat_id, user.id, "bot_kicked", "бота добавил не админ")
        return

    lock = guard.runtime.lockdown(chat_id)
    if bool(cfg["antiraid"]):
        joins = guard.runtime.joins.hit((chat_id,), int(cfg["raid_seconds"]))
        if joins >= int(cfg["raid_joins"]) and not lock.active():
            minutes = int(cfg["raid_lockdown_minutes"])
            guard.runtime.start_lockdown(chat_id, minutes, f"{joins} входов подряд")
            await bot.send_message(
                chat_id,
                "🚨 <b>Обнаружен рейд.</b> Включён карантин на "
                f"{minutes} мин: новые участники не могут писать до одобрения админом.",
            )
            await guard.record(chat_id, 0, "raid_detected", f"{joins} входов за окно")
            await guard.alert_owners(
                f"🚨 Рейд в чате <b>{html.escape(event.chat.title or str(chat_id))}</b>: "
                f"{joins} входов подряд. Включён карантин на {minutes} мин."
            )

    if guard.runtime.lockdown(chat_id).active():
        await moderation.mute(bot, chat_id, user.id, minutes=0)
        suspicious = looks_like_raid_name(user.full_name, user.username)
        await bot.send_message(
            chat_id,
            f"🔒 Карантин: {moderation.mention(user)} ждёт одобрения админа."
            + ("\n⚠️ Профиль похож на одноразовый аккаунт." if suspicious else ""),
            reply_markup=approve_keyboard(user.id),
        )
        await guard.record(
            chat_id, user.id, "quarantined", "вход во время карантина", notify=False
        )
        return

    if bool(cfg["captcha"]):
        await guard.captcha.challenge(
            chat_id, user, int(cfg["captcha_timeout"]), str(cfg["captcha_action"])
        )
    elif bool(cfg["welcome"]):
        await bot.send_message(
            chat_id, f"👋 {moderation.mention(user)}, добро пожаловать в чат!"
        )


async def _on_forced_removal(event: ChatMemberUpdated, guard: Guard, bot: Bot) -> None:
    """Антиснос: один админ выносит людей пачкой — поднимаем тревогу."""
    chat_id = event.chat.id
    actor = event.from_user
    cfg = guard.settings(chat_id)
    if not bool(cfg["antinuke"]):
        return

    count = guard.runtime.admin_actions.hit((chat_id, actor.id), int(cfg["nuke_seconds"]))
    if count < int(cfg["nuke_bans"]):
        return
    guard.runtime.admin_actions.reset((chat_id, actor.id))

    detail = f"{actor.full_name} (id {actor.id}) удалил {count} чел. за {cfg['nuke_seconds']} сек"
    await guard.record(chat_id, actor.id, "nuke_alert", detail, notify=True)
    await guard.alert_owners(
        f"🚨 <b>Похоже на снос чата</b> «{html.escape(event.chat.title or str(chat_id))}»:\n"
        f"{html.escape(detail)}"
    )
    if bool(cfg["antinuke_demote"]):
        demoted = await moderation.safe(
            bot.promote_chat_member(
                chat_id=chat_id,
                user_id=actor.id,
                can_manage_chat=False,
                can_delete_messages=False,
                can_manage_video_chats=False,
                can_restrict_members=False,
                can_promote_members=False,
                can_change_info=False,
                can_invite_users=False,
                can_pin_messages=False,
            ),
            "снятие прав админа",
        )
        await bot.send_message(
            chat_id,
            "🚨 Массовое удаление участников. "
            + (
                f"Права {moderation.mention(actor)} сняты."
                if demoted
                else f"Не удалось снять права {moderation.mention(actor)} — "
                "нужен владелец чата."
            ),
        )
    else:
        await bot.send_message(
            chat_id,
            f"⚠️ {moderation.mention(actor)} удалил {count} участников за "
            f"{cfg['nuke_seconds']} сек. Владелец предупреждён.",
        )


@router.message(F.new_chat_members | F.left_chat_member)
async def clean_service(message: Message, guard: Guard, bot: Bot) -> None:
    if bool(guard.settings(message.chat.id)["delete_service"]):
        await moderation.delete_message(bot, message.chat.id, message.message_id)


@router.my_chat_member()
async def on_bot_status(event: ChatMemberUpdated, guard: Guard, bot: Bot) -> None:
    """Бота добавили в чат — сразу проверяем, хватает ли ему прав."""
    if event.new_chat_member.user.id != bot.id:
        return
    status = event.new_chat_member.status
    if status not in {"administrator", "member"}:
        return
    guard.storage.touch_chat(event.chat.id, event.chat.title or "")
    if status != "administrator":
        await moderation.safe(
            bot.send_message(
                event.chat.id,
                "🛡 Bed Protector на месте, но без прав администратора он бесполезен.\n"
                "Выдай права: <b>удаление сообщений</b>, <b>блокировка участников</b>, "
                "<b>приглашение по ссылке</b>. Потом набери /status.",
            ),
            "приветствие в чате",
        )
        return
    await moderation.safe(
        bot.send_message(
            event.chat.id,
            "🛡 <b>Bed Protector подключён.</b>\n"
            "Защита включена по умолчанию: капча, антифлуд, антиспам, антирейд.\n"
            "Настройки — /settings, проверка прав — /status, справка — /help",
        ),
        "приветствие в чате",
    )
