#!/usr/bin/env python3
"""Точка входа Bed Protector.

Запуск:
    python -m venv .venv && .venv/bin/pip install -r bot/requirements.txt
    cp bot/.env.example bot/.env   # и вписать свежий токен от @BotFather
    .venv/bin/python bot/run.py
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from aiogram import Bot, Dispatcher  # noqa: E402
from aiogram.client.default import DefaultBotProperties  # noqa: E402
from aiogram.enums import ParseMode  # noqa: E402
from aiogram.types import BotCommand, BotCommandScopeAllChatAdministrators  # noqa: E402

from protector.config import Config  # noqa: E402
from protector.guard import Guard  # noqa: E402
from protector.handlers import build_router  # noqa: E402

log = logging.getLogger("bed-protector")

ADMIN_COMMANDS = [
    BotCommand(command="help", description="что умеет бот"),
    BotCommand(command="status", description="права бота и режим защиты"),
    BotCommand(command="settings", description="настройки чата"),
    BotCommand(command="set", description="изменить настройку"),
    BotCommand(command="warn", description="предупреждение (ответом)"),
    BotCommand(command="mute", description="мут (ответом)"),
    BotCommand(command="ban", description="бан (ответом)"),
    BotCommand(command="kick", description="исключить (ответом)"),
    BotCommand(command="lock", description="карантин при рейде"),
    BotCommand(command="unlock", description="снять карантин"),
    BotCommand(command="stats", description="сводка событий"),
]


async def _sweeper(guard: Guard) -> None:
    """Чистит счётчики в памяти, чтобы бот не рос по RAM в больших чатах."""
    while True:
        await asyncio.sleep(600)
        guard.runtime.sweep()


async def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    )
    config = Config.from_env()
    bot = Bot(
        token=config.token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    guard = Guard(bot, config)

    dispatcher = Dispatcher()
    dispatcher["guard"] = guard
    dispatcher.include_router(build_router())

    me = await bot.get_me()
    log.info("Bed Protector запущен как @%s (id %s)", me.username, me.id)
    await bot.set_my_commands(ADMIN_COMMANDS, scope=BotCommandScopeAllChatAdministrators())

    sweeper = asyncio.create_task(_sweeper(guard))
    try:
        # chat_member нужен для капчи и антирейда — Telegram шлёт его только по запросу.
        await dispatcher.start_polling(
            bot,
            allowed_updates=dispatcher.resolve_used_update_types(),
            drop_pending_updates=True,
        )
    finally:
        sweeper.cancel()
        guard.shutdown()
        await bot.session.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit) as err:
        if isinstance(err, SystemExit) and err.code:
            raise
        log.info("Остановлен.")
