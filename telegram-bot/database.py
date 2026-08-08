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
