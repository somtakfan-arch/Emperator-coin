"""Основной конвейер сообщений: антифлуд, антиспам, доверие к участнику."""

from __future__ import annotations

import html

from aiogram import Bot, F, Router
from aiogram.types import Message

from .. import moderation
from ..guard import Guard
from ..heuristics import MessageFacts, analyze, normalize

router = Router(name="messages")

GROUP_TYPES = {"group", "supergroup"}


def _facts(message: Message, is_new_user: bool) -> MessageFacts:
    text = message.text or message.caption or ""
    origin = message.forward_origin
    entities = (message.entities or []) + (message.caption_entities or [])
    return MessageFacts(
        text=text,
        is_forward=origin is not None,
        forward_from_chat=bool(origin and origin.type in {"channel", "chat"}),
        has_entity_link=any(e.type in {"url", "text_link"} for e in entities),
        has_media=bool(message.photo or message.video or message.document or message.animation),
        via_bot=message.via_bot is not None,
        is_new_user=is_new_user,
    )


async def _punish(
    guard: Guard,
    bot: Bot,
    message: Message,
    *,
    action: str,
    reason: str,
    kind: str,
    mute_minutes: int,
) -> None:
    chat_id = message.chat.id
    user = message.from_user
    await moderation.delete_message(bot, chat_id, message.message_id)

    cfg = guard.settings(chat_id)
    warns = guard.storage.add_warn(chat_id, user.id, 0, reason)
    limit = int(cfg["warn_limit"])
    if warns >= limit:
        action = str(cfg["warn_action"])
        reason = f"{reason} (предупреждений: {warns}/{limit})"
        guard.storage.clear_warns(chat_id, user.id)

    applied = await moderation.apply_action(
        bot, action, chat_id, user.id, mute_minutes=mute_minutes
    )
    await guard.record(chat_id, user.id, kind, f"{reason} → {applied}")

    if applied != "удаление":
        await moderation.safe(
            bot.send_message(
                chat_id,
                f"🛡 {moderation.mention(user)} — {applied}. Причина: {html.escape(reason)}.",
            ),
            "уведомление о наказании",
        )


@router.message(F.chat.type.in_(GROUP_TYPES))
@router.edited_message(F.chat.type.in_(GROUP_TYPES))
async def guard_message(message: Message, guard: Guard, bot: Bot) -> None:
    chat_id = message.chat.id
    user = message.from_user
    if user is None or user.is_bot or message.sender_chat is not None:
        return  # анонимные админы и каналы — не наша цель

    # Пока висит капча, писать нельзя: подчищаем всё, что просочилось.
    if (chat_id, user.id) in guard.runtime.pending_captcha:
        await moderation.delete_message(bot, chat_id, message.message_id)
        return

    if guard.is_owner(user.id) or await moderation.is_admin(bot, chat_id, user.id):
        return

    cfg = guard.settings(chat_id)
    state = guard.storage.bump_messages(chat_id, user.id)
    is_new = guard.is_new_user(chat_id, user.id, state)

    if bool(cfg["antiflood"]):
        hits = guard.runtime.flood.hit((chat_id, user.id), int(cfg["flood_seconds"]))
        if hits >= int(cfg["flood_messages"]):
            guard.runtime.flood.reset((chat_id, user.id))
            await _punish(
                guard,
                bot,
                message,
                action=str(cfg["flood_action"]),
                reason=f"флуд ({hits} сообщений за {cfg['flood_seconds']} сек)",
                kind="flood",
                mute_minutes=int(cfg["flood_mute_minutes"]),
            )
            return

    if not bool(cfg["antispam"]):
        return

    verdict = analyze(
        _facts(message, is_new),
        block_links_for_new=bool(cfg["block_links_for_new"]),
        block_forwards_for_new=bool(cfg["block_forwards_for_new"]),
    )

    repeats = guard.runtime.repeats.hit(chat_id, user.id, normalize(message.text or ""))
    if repeats >= 2:
        verdict.add(2, f"повтор одного текста ×{repeats + 1}")

    threshold = int(cfg["spam_threshold"])
    if verdict.score >= threshold:
        await _punish(
            guard,
            bot,
            message,
            action=str(cfg["spam_action"]),
            reason=f"спам [{verdict.summary()}]",
            kind="spam",
            mute_minutes=int(cfg["spam_mute_minutes"]),
        )
        return

    if verdict.score > 0 and is_new and verdict.score >= max(2, threshold - 1):
        await moderation.delete_message(bot, chat_id, message.message_id)
        await guard.record(
            chat_id, user.id, "spam_deleted", verdict.summary(), notify=False
        )
