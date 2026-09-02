"""Капча на входе: пока не решил — писать нельзя."""

from __future__ import annotations

import asyncio
import random
import time

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, User

from . import moderation
from .runtime import CaptchaTicket, Runtime
from .storage import Storage

CALLBACK_PREFIX = "cap"


def build_question() -> tuple[str, str, list[str]]:
    """Возвращает (текст вопроса, верный ответ, варианты)."""
    a, b = random.randint(2, 9), random.randint(2, 9)
    op, answer = random.choice((("+", a + b), ("×", a * b)))
    options = {str(answer)}
    while len(options) < 4:
        noise = answer + random.choice([-3, -2, -1, 1, 2, 3, 5, 7])
        if noise > 0:
            options.add(str(noise))
    shuffled = list(options)
    random.shuffle(shuffled)
    return f"{a} {op} {b} = ?", str(answer), shuffled


def keyboard(user_id: int, options: list[str]) -> InlineKeyboardMarkup:
    row = [
        InlineKeyboardButton(
            text=opt, callback_data=f"{CALLBACK_PREFIX}:{user_id}:{opt}"
        )
        for opt in options
    ]
    return InlineKeyboardMarkup(inline_keyboard=[row[:2], row[2:]])


class CaptchaService:
    def __init__(self, bot: Bot, storage: Storage, runtime: Runtime) -> None:
        self.bot = bot
        self.storage = storage
        self.runtime = runtime
        self._timers: dict[tuple[int, int], asyncio.Task] = {}

    async def challenge(self, chat_id: int, user: User, timeout: int, fail_action: str) -> None:
        """Ограничивает новичка и выдаёт задачу."""
        await moderation.mute(self.bot, chat_id, user.id, minutes=0)
        question, answer, options = build_question()
        text = (
            f"👋 {moderation.mention(user)}, добро пожаловать!\n"
            f"Чтобы получить право писать, реши пример: <b>{question}</b>\n"
            f"⏳ У тебя {timeout} сек."
        )
        prompt = await self.bot.send_message(
            chat_id, text, reply_markup=keyboard(user.id, options)
        )
        ticket = CaptchaTicket(
            chat_id=chat_id,
            user_id=user.id,
            answer=answer,
            prompt_message_id=prompt.message_id,
            expires_at=time.monotonic() + timeout,
        )
        self.runtime.pending_captcha[(chat_id, user.id)] = ticket
        self._cancel_timer(chat_id, user.id)
        self._timers[(chat_id, user.id)] = asyncio.create_task(
            self._expire(ticket, timeout, fail_action)
        )

    async def _expire(self, ticket: CaptchaTicket, timeout: int, fail_action: str) -> None:
        try:
            await asyncio.sleep(timeout)
        except asyncio.CancelledError:
            return
        key = (ticket.chat_id, ticket.user_id)
        if self.runtime.pending_captcha.get(key) is not ticket:
            return
        self.runtime.pending_captcha.pop(key, None)
        self._timers.pop(key, None)
        await moderation.delete_message(self.bot, ticket.chat_id, ticket.prompt_message_id)
        if fail_action == "kick":
            await moderation.kick(self.bot, ticket.chat_id, ticket.user_id)
        self.storage.log_event(
            ticket.chat_id, ticket.user_id, "captcha_failed", f"таймаут, действие: {fail_action}"
        )

    async def solve(self, chat_id: int, user: User, given: str) -> bool | None:
        """True — прошёл, False — ошибся, None — капчи для него нет."""
        key = (chat_id, user.id)
        ticket = self.runtime.pending_captcha.get(key)
        if ticket is None:
            return None
        if given != ticket.answer:
            ticket.attempts += 1
            if ticket.attempts < 2:
                return False
            self.runtime.pending_captcha.pop(key, None)
            self._cancel_timer(chat_id, user.id)
            await moderation.delete_message(self.bot, chat_id, ticket.prompt_message_id)
            await moderation.kick(self.bot, chat_id, user.id)
            self.storage.log_event(chat_id, user.id, "captcha_failed", "неверные ответы")
            return False
        self.runtime.pending_captcha.pop(key, None)
        self._cancel_timer(chat_id, user.id)
        await moderation.unmute(self.bot, chat_id, user.id)
        await moderation.delete_message(self.bot, chat_id, ticket.prompt_message_id)
        self.storage.register_join(chat_id, user.id)
        self.storage.log_event(chat_id, user.id, "captcha_passed")
        return True

    def _cancel_timer(self, chat_id: int, user_id: int) -> None:
        task = self._timers.pop((chat_id, user_id), None)
        if task and not task.done():
            task.cancel()

    def cancel_all(self) -> None:
        for task in self._timers.values():
            task.cancel()
        self._timers.clear()
