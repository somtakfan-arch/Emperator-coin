import asyncio
import logging

from telegram import Update
from telegram.ext import Application, TypeHandler

from .config import BOT_TOKEN, DB_PATH
from .handlers import dispatch
from .storage import Storage

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


async def _reminder_loop(application: Application) -> None:
    """Deliver due reminders roughly every 30 seconds."""
    storage: Storage = application.bot_data["storage"]
    import time as _time

    while True:
        try:
            for r in storage.due_reminders(int(_time.time())):
                try:
                    await application.bot.send_message(chat_id=r["user_id"], text=f"⏰ Напоминание:\n{r['text']}")
                except Exception:
                    logger.exception("Failed to deliver reminder %s", r["id"])
                storage.delete_reminder(r["id"])
        except Exception:
            logger.exception("Reminder loop error")
        await asyncio.sleep(30)


async def _post_init(application: Application) -> None:
    application.create_task(_reminder_loop(application))


def main() -> None:
    application = (
        Application.builder()
        .token(BOT_TOKEN)
        .concurrent_updates(True)
        .post_init(_post_init)
        .build()
    )
    application.bot_data["storage"] = Storage(DB_PATH)
    application.add_handler(TypeHandler(Update, dispatch))
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
