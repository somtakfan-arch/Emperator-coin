import datetime
from contextlib import asynccontextmanager

import aiosqlite

from config import DB_PATH, STARTING_BALANCE

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    balance INTEGER NOT NULL DEFAULT 0,
    total_wagered INTEGER NOT NULL DEFAULT 0,
    total_won INTEGER NOT NULL DEFAULT 0,
    games_played INTEGER NOT NULL DEFAULT 0,
    last_bonus_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS topups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    stars INTEGER NOT NULL,
    coins INTEGER NOT NULL,
    telegram_charge_id TEXT,
    created_at TEXT NOT NULL
);

-- Chips handed out by an admin are created out of thin air, unlike topups
-- which are backed by Stars. Keep an audit trail so the two never blur.
CREATE TABLE IF NOT EXISTS admin_grants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
"""

_db: aiosqlite.Connection | None = None


async def init_db() -> None:
    global _db
    _db = await aiosqlite.connect(DB_PATH)
    await _db.executescript(SCHEMA)
    await _db.commit()
    await _migrate()


async def _migrate() -> None:
    """Additive migrations for databases created by an earlier version."""
    cur = await _db.execute("PRAGMA table_info(topups)")
    columns = {row[1] for row in await cur.fetchall()}
    if "refunded_at" not in columns:
        await _db.execute("ALTER TABLE topups ADD COLUMN refunded_at TEXT")
        await _db.commit()


async def close_db() -> None:
    if _db is not None:
        await _db.close()


def _now() -> str:
    return datetime.datetime.utcnow().isoformat()


async def get_or_create_user(user_id: int, username: str | None) -> aiosqlite.Row:
    _db.row_factory = aiosqlite.Row
    cur = await _db.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
    row = await cur.fetchone()
    if row is None:
        await _db.execute(
            "INSERT INTO users (user_id, username, balance, created_at) VALUES (?, ?, ?, ?)",
            (user_id, username, STARTING_BALANCE, _now()),
        )
        await _db.commit()
        cur = await _db.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
        row = await cur.fetchone()
    elif username and row["username"] != username:
        await _db.execute("UPDATE users SET username = ? WHERE user_id = ?", (username, user_id))
        await _db.commit()
    return row


async def get_balance(user_id: int) -> int:
    cur = await _db.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,))
    row = await cur.fetchone()
    return row[0] if row else 0


async def adjust_balance(user_id: int, delta: int) -> int:
    """Atomically adjust balance and return the new value."""
    await _db.execute(
        "UPDATE users SET balance = balance + ? WHERE user_id = ?", (delta, user_id)
    )
    await _db.commit()
    return await get_balance(user_id)


async def try_place_bet(user_id: int, amount: int) -> bool:
    """Atomically deduct a bet if the user can afford it. Returns success."""
    cur = await _db.execute(
        "UPDATE users SET balance = balance - ?, total_wagered = total_wagered + ?, "
        "games_played = games_played + 1 WHERE user_id = ? AND balance >= ?",
        (amount, amount, user_id, amount),
    )
    await _db.commit()
    return cur.rowcount > 0


async def pay_winnings(user_id: int, amount: int) -> None:
    if amount <= 0:
        return
    await _db.execute(
        "UPDATE users SET balance = balance + ?, total_won = total_won + ? WHERE user_id = ?",
        (amount, amount, user_id),
    )
    await _db.commit()


async def get_stats(user_id: int) -> aiosqlite.Row | None:
    _db.row_factory = aiosqlite.Row
    cur = await _db.execute(
        "SELECT balance, total_wagered, total_won, games_played FROM users WHERE user_id = ?",
        (user_id,),
    )
    return await cur.fetchone()


async def claim_daily_bonus(user_id: int, amount: int, cooldown_hours: int) -> tuple[bool, float]:
    """Returns (granted, hours_left_if_not_granted)."""
    cur = await _db.execute("SELECT last_bonus_at FROM users WHERE user_id = ?", (user_id,))
    row = await cur.fetchone()
    now = datetime.datetime.utcnow()
    if row and row[0]:
        last = datetime.datetime.fromisoformat(row[0])
        elapsed = now - last
        cooldown = datetime.timedelta(hours=cooldown_hours)
        if elapsed < cooldown:
            hours_left = (cooldown - elapsed).total_seconds() / 3600
            return False, hours_left
    await _db.execute(
        "UPDATE users SET balance = balance + ?, last_bonus_at = ? WHERE user_id = ?",
        (amount, now.isoformat(), user_id),
    )
    await _db.commit()
    return True, 0.0


async def record_topup(user_id: int, stars: int, coins: int, charge_id: str) -> None:
    await _db.execute(
        "INSERT INTO topups (user_id, stars, coins, telegram_charge_id, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (user_id, stars, coins, charge_id, _now()),
    )
    await _db.commit()


async def recent_topups(limit: int = 10, include_refunded: bool = False) -> list[aiosqlite.Row]:
    _db.row_factory = aiosqlite.Row
    where = "" if include_refunded else "WHERE refunded_at IS NULL"
    cur = await _db.execute(
        f"""
        SELECT t.*, u.username
        FROM topups t LEFT JOIN users u ON u.user_id = t.user_id
        {where}
        ORDER BY t.id DESC LIMIT ?
        """,
        (limit,),
    )
    return await cur.fetchall()


async def get_topup(topup_id: int) -> aiosqlite.Row | None:
    _db.row_factory = aiosqlite.Row
    cur = await _db.execute("SELECT * FROM topups WHERE id = ?", (topup_id,))
    return await cur.fetchone()


async def mark_topup_refunded(topup_id: int) -> None:
    await _db.execute("UPDATE topups SET refunded_at = ? WHERE id = ?", (_now(), topup_id))
    await _db.commit()


async def deduct_up_to(user_id: int, amount: int) -> int:
    """Take back up to `amount` chips, never pushing the balance below zero.

    A refunded player may already have gambled the chips away; a negative
    balance would lock him out of the bot entirely, so we claw back what is
    left and report the shortfall to the admin.
    """
    balance = await get_balance(user_id)
    taken = min(balance, amount)
    if taken > 0:
        await _db.execute(
            "UPDATE users SET balance = balance - ? WHERE user_id = ?", (taken, user_id)
        )
        await _db.commit()
    return taken


async def record_admin_grant(admin_id: int, user_id: int, amount: int) -> None:
    await _db.execute(
        "INSERT INTO admin_grants (admin_id, user_id, amount, created_at) VALUES (?, ?, ?, ?)",
        (admin_id, user_id, amount, _now()),
    )
    await _db.commit()


async def find_user(query: str) -> aiosqlite.Row | None:
    """Look a player up by numeric id or by @username."""
    _db.row_factory = aiosqlite.Row
    query = query.strip().lstrip("@")
    if query.isdigit():
        cur = await _db.execute("SELECT * FROM users WHERE user_id = ?", (int(query),))
    else:
        cur = await _db.execute(
            "SELECT * FROM users WHERE username = ? COLLATE NOCASE", (query,)
        )
    return await cur.fetchone()


async def global_stats() -> aiosqlite.Row:
    _db.row_factory = aiosqlite.Row
    cur = await _db.execute(
        """
        SELECT
            (SELECT COUNT(*) FROM users)                      AS users,
            (SELECT COALESCE(SUM(balance), 0) FROM users)     AS chips,
            (SELECT COALESCE(SUM(games_played), 0) FROM users) AS games,
            (SELECT COALESCE(SUM(total_wagered), 0) FROM users) AS wagered,
            (SELECT COALESCE(SUM(stars), 0) FROM topups)      AS stars,
            (SELECT COUNT(*) FROM topups)                     AS topups,
            (SELECT COALESCE(SUM(amount), 0) FROM admin_grants) AS granted
        """
    )
    return await cur.fetchone()


async def top_balances(limit: int = 10) -> list[aiosqlite.Row]:
    _db.row_factory = aiosqlite.Row
    cur = await _db.execute(
        "SELECT user_id, username, balance FROM users ORDER BY balance DESC LIMIT ?",
        (limit,),
    )
    return await cur.fetchall()
