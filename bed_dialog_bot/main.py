import asyncio
import logging

from telegram import Update
from telegram.ext import Application, TypeHandler

from . import config, crypto, ton
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


async def _crypto_loop(application: Application) -> None:
    """Poll pending Crypto Pay invoices and grant premium once paid."""
    if not crypto.is_enabled():
        return
    storage: Storage = application.bot_data["storage"]
    while True:
        try:
            pending = storage.pending_crypto_invoices()
            if pending:
                by_id = {p["invoice_id"]: p for p in pending}
                invoices = await crypto.get_invoices(list(by_id.keys()))
                for inv in invoices:
                    inv_id = int(inv.get("invoice_id", 0))
                    p = by_id.get(inv_id)
                    if not p:
                        continue
                    status = inv.get("status")
                    if status == "paid":
                        until = storage.grant_premium_days(p["user_id"], p["days"])
                        storage.delete_crypto_invoice(inv_id)
                        try:
                            await application.bot.send_message(
                                chat_id=p["user_id"],
                                text=f"✅ Оплата получена! Премиум активен на {p['days']} дн.",
                            )
                        except Exception:
                            logger.exception("Failed to notify crypto payer %s", p["user_id"])
                    elif status == "expired":
                        storage.delete_crypto_invoice(inv_id)
        except Exception:
            logger.exception("Crypto loop error")
        await asyncio.sleep(45)


async def _deposit_loop(application: Application) -> None:
    """Poll the TON treasury for incoming BED deposits and credit balances."""
    if not ton.configured():
        return
    storage: Storage = application.bot_data["storage"]
    while True:
        try:
            for d in await ton.fetch_deposits(40):
                tx = d.get("tx_hash")
                if not tx or storage.deposit_seen(tx):
                    continue
                uid = ton.match_user(d.get("comment"))
                amount = int(d.get("amount") or 0)  # whole BED
                if uid and amount > 0:
                    storage.record_deposit(tx, uid, amount, 1)
                    new_bal = storage.add_bed(uid, amount)
                    try:
                        await application.bot.send_message(
                            chat_id=uid,
                            text=f"✅ Зачислено {amount} BED! Баланс: {new_bal} BED.",
                        )
                    except Exception:
                        logger.exception("Failed to notify depositor %s", uid)
                else:
                    # Unmatched (no/bad comment): record without crediting so a
                    # super-admin can resolve it with /credit.
                    storage.record_deposit(tx, uid or 0, amount, 0)
                    logger.warning("Unmatched BED deposit %s amount=%s comment=%r",
                                   tx, amount, d.get("comment"))
        except Exception:
            logger.exception("Deposit loop error")
        await asyncio.sleep(config.TON_DEPOSIT_POLL_SECONDS)


async def _post_init(application: Application) -> None:
    application.create_task(_reminder_loop(application))
    application.create_task(_crypto_loop(application))
    application.create_task(_deposit_loop(application))


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
