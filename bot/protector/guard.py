"""Общий контекст бота: настройки, БД, окна, капча, журнал."""

from __future__ import annotations

import html
import logging
import time

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError

from .captcha import CaptchaService
from .config import Config
from .runtime import Runtime
from .storage import MemberState, Storage

log = logging.getLogger("bed-protector")


class Guard:
    def __init__(self, bot: Bot, config: Config) -> None:
        self.bot = bot
        self.config = config
        self.storage = Storage(config.db_path)
        self.runtime = Runtime()
        self.captcha = CaptchaService(bot, self.storage, self.runtime)

    def settings(self, chat_id: int) -> dict[str, bool | int | str]:
        return self.storage.settings(chat_id)

    def is_owner(self, user_id: int) -> bool:
        return user_id in self.config.owner_ids

    def is_new_user(self, chat_id: int, user_id: int, state: MemberState | None) -> bool:
        """Новичок = мало сообщений И недавно вошёл. Доверенных не трогаем."""
        cfg = self.settings(chat_id)
        if state is None:
            return True
        if state.trusted:
            return False
        if state.messages >= int(cfg["new_user_messages"]):
            return False
        age_hours = (time.time() - state.joined_at) / 3600 if state.joined_at else 0
        return age_hours < float(cfg["new_user_hours"])

    async def report(self, chat_id: int, text: str) -> None:
        """Пишет в лог-чат группы или в глобальный лог-чат."""
        target = int(self.settings(chat_id).get("log_chat_id") or 0) or self.config.log_chat_id
        if not target:
            return
        try:
            await self.bot.send_message(target, text, disable_web_page_preview=True)
        except TelegramAPIError as err:
            log.warning("не удалось написать в лог-чат %s: %s", target, err)

    async def alert_owners(self, text: str) -> None:
        for owner_id in self.config.owner_ids:
            try:
                await self.bot.send_message(owner_id, text, disable_web_page_preview=True)
            except TelegramAPIError:
                continue

    async def record(
        self, chat_id: int, user_id: int, kind: str, detail: str = "", *, notify: bool = True
    ) -> None:
        self.storage.log_event(chat_id, user_id, kind, detail)
        if notify:
            await self.report(
                chat_id,
                f"🛡 <b>{html.escape(kind)}</b>\nчат: <code>{chat_id}</code>\n"
                f"юзер: <code>{user_id}</code>\n{html.escape(detail)}",
            )

    def shutdown(self) -> None:
        self.captcha.cancel_all()
        self.storage.close()
