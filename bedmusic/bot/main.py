from __future__ import annotations

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import BotCommand

from . import db, deposits
from .config import Config
from .handlers import build_router
from .ton import Treasury

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
log = logging.getLogger("bedmusic")

COMMANDS = [
    BotCommand(command="start", description="Знакомство и регистрация"),
    BotCommand(command="menu", description="Главное меню"),
    BotCommand(command="upload", description="Загрузить трек"),
    BotCommand(command="feed", description="Лента свежих треков"),
    BotCommand(command="search", description="Поиск треков и артистов"),
    BotCommand(command="profile", description="Мой профиль"),
    BotCommand(command="wallet", description="Кошелёк и баланс"),
    BotCommand(command="deals", description="Мои сделки"),
    BotCommand(command="help", description="Справка"),
]


async def run() -> None:
    config = Config.from_env()

    await db.connect(config.db_path)
    log.info("database ready at %s", config.db_path)

    bot = Bot(
        token=config.token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    treasury = Treasury(
        mnemonic=config.treasury_mnemonic,
        api_key=config.ton_api_key,
        withdrawals_enabled=config.withdrawals_enabled,
    )
    if treasury.configured:
        log.info(
            "treasury %s | payouts %s",
            treasury.address,
            "enabled" if treasury.withdrawals_enabled else "DISABLED",
        )

    dispatcher = Dispatcher(storage=MemoryStorage())
    dispatcher["config"] = config
    dispatcher["treasury"] = treasury
    dispatcher.include_router(build_router())

    try:
        me = await bot.get_me()
        log.info("starting @%s (%s)", me.username, me.first_name)

        await bot.set_my_commands(COMMANDS)
        # Long polling and a webhook are mutually exclusive; drop any leftovers
        # from a previous deploy so restarts don't replay a backlog.
        await bot.delete_webhook(drop_pending_updates=True)

        watcher = asyncio.create_task(
            deposits.run(bot, treasury, config.deposit_poll_seconds)
        )
        try:
            await dispatcher.start_polling(
                bot, allowed_updates=dispatcher.resolve_used_update_types()
            )
        finally:
            watcher.cancel()
    finally:
        await bot.session.close()
        await db.close()


def main() -> None:
    try:
        asyncio.run(run())
    except (KeyboardInterrupt, SystemExit):
        log.info("stopped")


if __name__ == "__main__":
    main()
