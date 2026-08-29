import asyncio
import logging
import time as _time

from telegram import Update
from telegram.ext import AIORateLimiter, Application, TypeHandler

from . import bedcoin, config, crypto, ton
from .config import BOT_TOKEN, DB_PATH
from .handlers import dispatch
from .storage import Storage

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


class FloodSafeRateLimiter(AIORateLimiter):
    """AIORateLimiter plus a per-chat send throttle with BURST.

    Vanilla AIORateLimiter doesn't limit sends to a single private/business
    chat, so a burst (.spam/.troll/.phantom) to one contact trips Telegram's
    per-chat flood limit and earns a long RetryAfter penalty.

    This uses a per-chat token bucket (aiolimiter): the first few messages go
    out fast (feels snappy), then it settles to a safe sustained rate — so it
    never crashes into a flood but also isn't a crawling one-per-second. ULTRA
    sends get a bigger, faster bucket. Written signature-agnostically so it
    can't break the request pipeline.
    """

    _SEND_EXTRA = {"copyMessage", "forwardMessage", "sendMediaGroup"}

    def __init__(self, *args, burst: int = 6, sustained_rate: float = 1.2,
                 ultra_burst: int = 25, ultra_rate: float = 6.0, **kwargs):
        super().__init__(*args, **kwargs)
        self._burst, self._rate = burst, sustained_rate
        self._ultra_burst, self._ultra_rate = ultra_burst, ultra_rate
        self._buckets: dict = {}
        self._ultra_buckets: dict = {}

    def _throttled(self, endpoint) -> bool:
        return bool(endpoint) and (str(endpoint).startswith("send") or endpoint in self._SEND_EXTRA)

    def _bucket(self, chat_id, ultra):
        from aiolimiter import AsyncLimiter
        pool = self._ultra_buckets if ultra else self._buckets
        lim = pool.get(chat_id)
        if lim is None:
            burst = self._ultra_burst if ultra else self._burst
            rate = self._ultra_rate if ultra else self._rate
            lim = AsyncLimiter(burst, burst / rate)  # `burst` sends per (burst/rate)s
            if len(pool) > 5000:
                pool.clear()
            pool[chat_id] = lim
        return lim

    async def process_request(self, *args, **kwargs):
        chat_id, endpoint, rla = None, None, None
        try:
            endpoint = args[3] if len(args) > 3 else kwargs.get("endpoint")
            data = args[4] if len(args) > 4 else kwargs.get("data")
            rla = args[5] if len(args) > 5 else kwargs.get("rate_limit_args")
            if isinstance(data, dict):
                chat_id = data.get("chat_id")
        except Exception:
            chat_id = None
        if chat_id is not None and self._throttled(endpoint):
            ultra = bool(isinstance(rla, dict) and rla.get("ultra"))
            try:
                async with self._bucket(chat_id, ultra):
                    return await super().process_request(*args, **kwargs)
            except Exception:
                # Never let the throttle break the send pipeline.
                return await super().process_request(*args, **kwargs)
        return await super().process_request(*args, **kwargs)


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
                amount = float(d.get("amount") or 0)  # may be fractional
                if uid and amount > 0:
                    new_bal, dust, credited = storage.credit_bed_fractional(uid, amount)
                    storage.record_deposit(tx, uid, credited, 1)
                    tail = f"\n💫 В копилке ещё {dust:.4f} BED (зачислю с добора)." if dust > 1e-6 else ""
                    try:
                        await application.bot.send_message(
                            chat_id=uid,
                            text=f"✅ Пополнение {amount:.4f} BED! Баланс: {new_bal} BED.{tail}".replace(".0000", ""),
                        )
                    except Exception:
                        logger.exception("Failed to notify depositor %s", uid)
                else:
                    # Unmatched (no/bad comment): record without crediting so a
                    # super-admin can resolve it with /credit.
                    storage.record_deposit(tx, uid or 0, int(amount), 0)
                    logger.warning("Unmatched BED deposit %s amount=%s comment=%r",
                                   tx, amount, d.get("comment"))
            # Refresh cached treasury stats for the Wallet menu.
            try:
                bed = await ton.treasury_bed_balance()
                ton_bal = await ton.treasury_ton_balance()
                addr = await ton.treasury_address()
                bedcoin.cache_treasury(storage, bed, ton_bal, addr)
            except Exception:
                logger.exception("Treasury stats refresh failed")
        except Exception:
            logger.exception("Deposit loop error")
        await asyncio.sleep(config.TON_DEPOSIT_POLL_SECONDS)


async def _backup_loop(application: Application) -> None:
    """Every BACKUP_INTERVAL_HOURS, send a consistent DB snapshot to the admin."""
    import os
    import sqlite3
    import tempfile

    interval = max(1, config.BACKUP_INTERVAL_HOURS) * 3600
    while True:
        await asyncio.sleep(interval)
        try:
            tmp = os.path.join(tempfile.gettempdir(), "bed_dialog_backup.db")
            # Online backup — safe to run while the bot is using the DB.
            src = sqlite3.connect(DB_PATH)
            dst = sqlite3.connect(tmp)
            with dst:
                src.backup(dst)
            src.close()
            dst.close()
            import time as _t
            stamp = _t.strftime("%Y-%m-%d_%H-%M")
            with open(tmp, "rb") as fh:
                await application.bot.send_document(
                    chat_id=config.BACKUP_CHAT_ID, document=fh,
                    filename=f"bed_dialog_{stamp}.db",
                    caption=f"💾 Авто-бэкап БД ({stamp})",
                )
            os.remove(tmp)
        except Exception:
            logger.exception("Backup failed")


async def _post_init(application: Application) -> None:
    application.create_task(_reminder_loop(application))
    application.create_task(_crypto_loop(application))
    application.create_task(_deposit_loop(application))
    application.create_task(_backup_loop(application))


def _restore_seed_if_needed() -> None:
    """One-time migration: if the DB volume is empty but a bundled _seed.db
    exists, restore it before the bot opens the database. No-op once the DB
    exists, so it never overwrites live data."""
    import os
    import shutil
    if os.path.exists(DB_PATH):
        return
    here = os.path.dirname(__file__)
    candidates = [
        "_seed.db",
        os.path.join(os.path.dirname(here), "_seed.db"),
        os.path.join(here, "_seed.db"),
    ]
    for cand in candidates:
        if os.path.exists(cand):
            db_dir = os.path.dirname(DB_PATH)
            if db_dir:
                os.makedirs(db_dir, exist_ok=True)
            shutil.copy(cand, DB_PATH)
            logger.info("Restored database from seed %s -> %s", cand, DB_PATH)
            return


def main() -> None:
    _restore_seed_if_needed()
    application = (
        Application.builder()
        .token(BOT_TOKEN)
        .concurrent_updates(True)
        # Unified anti-flood: overall + per-chat throttle so bursts to one chat
        # can't trip Telegram's flood limit.
        .rate_limiter(FloodSafeRateLimiter(
            overall_max_rate=25, overall_time_period=1,
            group_max_rate=18, group_time_period=60,
            max_retries=2,
            burst=6, sustained_rate=1.2, ultra_burst=25, ultra_rate=6.0))
        .post_init(_post_init)
        .build()
    )
    application.bot_data["storage"] = Storage(DB_PATH)
    application.add_handler(TypeHandler(Update, dispatch))
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
