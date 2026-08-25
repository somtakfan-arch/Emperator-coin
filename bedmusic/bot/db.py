from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import aiosqlite

_conn: Optional[aiosqlite.Connection] = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS artists (
    user_id         INTEGER PRIMARY KEY,
    username        TEXT,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    avatar_file_id  TEXT,
    created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tracks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    artist_id       INTEGER NOT NULL REFERENCES artists(user_id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    audio_file_id   TEXT NOT NULL,
    duration        INTEGER NOT NULL DEFAULT 0,
    plays           INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tracks_artist  ON tracks(artist_id);
CREATE INDEX IF NOT EXISTS idx_tracks_created ON tracks(created_at DESC);

CREATE TABLE IF NOT EXISTS likes (
    user_id     INTEGER NOT NULL,
    track_id    INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_track ON likes(track_id);

CREATE TABLE IF NOT EXISTS deals (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id          INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    seller_id         INTEGER NOT NULL,
    buyer_id          INTEGER NOT NULL,
    price_amount      INTEGER NOT NULL,
    price_currency    TEXT NOT NULL,
    status            TEXT NOT NULL,
    escrow_state      TEXT NOT NULL DEFAULT 'none',
    seller_confirmed  INTEGER NOT NULL DEFAULT 0,
    buyer_confirmed   INTEGER NOT NULL DEFAULT 0,
    seller_signature  TEXT,
    buyer_signature   TEXT,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deals_seller ON deals(seller_id, status);
CREATE INDEX IF NOT EXISTS idx_deals_buyer  ON deals(buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_deals_track  ON deals(track_id, status);

-- Answers to the contract questionnaire. Holds passport data, so rows are
-- deleted as soon as the deal closes (see purge_deal_fields).
CREATE TABLE IF NOT EXISTS deal_fields (
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    key     TEXT NOT NULL,
    value   TEXT NOT NULL,
    PRIMARY KEY (deal_id, key)
);

CREATE TABLE IF NOT EXISTS balances (
    user_id  INTEGER NOT NULL,
    currency TEXT NOT NULL,
    amount   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, currency)
);

CREATE TABLE IF NOT EXISTS ledger (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    currency   TEXT NOT NULL,
    delta      INTEGER NOT NULL,
    reason     TEXT NOT NULL,
    deal_id    INTEGER,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id, created_at DESC);

-- Files the seller hands to the service, delivered to the buyer on signing.
-- Only Telegram file_ids: the bytes stay on Telegram's servers.
CREATE TABLE IF NOT EXISTS deal_materials (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id    INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    file_id    TEXT NOT NULL,
    file_name  TEXT NOT NULL DEFAULT '',
    file_size  INTEGER NOT NULL DEFAULT 0,
    kind       TEXT NOT NULL DEFAULT 'document',
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_materials_deal ON deal_materials(deal_id);

-- One row per credited on-chain transfer. The primary key is what stops a
-- deposit from being credited twice when polling overlaps.
CREATE TABLE IF NOT EXISTS ton_deposits (
    tx_hash    TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    currency   TEXT NOT NULL,
    amount     INTEGER NOT NULL,
    sender     TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ton_withdrawals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    currency    TEXT NOT NULL,
    amount      INTEGER NOT NULL,
    destination TEXT NOT NULL,
    status      TEXT NOT NULL,
    tx_hash     TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
"""

# Columns added after the first release; SQLite has no "ADD COLUMN IF NOT EXISTS".
MIGRATIONS = {
    "tracks": {
        "price_amount": "ALTER TABLE tracks ADD COLUMN price_amount INTEGER",
        "price_currency": "ALTER TABLE tracks ADD COLUMN price_currency TEXT",
        "sold_at": "ALTER TABLE tracks ADD COLUMN sold_at INTEGER",
    },
}


@dataclass
class Artist:
    user_id: int
    username: Optional[str]
    name: str
    description: str
    avatar_file_id: Optional[str]
    created_at: int


@dataclass
class Track:
    id: int
    artist_id: int
    title: str
    audio_file_id: str
    duration: int
    plays: int
    created_at: int
    artist_name: str = ""
    likes: int = 0
    price_amount: Optional[int] = None
    price_currency: Optional[str] = None
    sold_at: Optional[int] = None

    @property
    def for_sale(self) -> bool:
        return self.price_amount is not None and self.sold_at is None


def _ulower(value: Optional[str]) -> Optional[str]:
    return value.lower() if isinstance(value, str) else value


def _artist(row: aiosqlite.Row) -> Artist:
    return Artist(
        user_id=row["user_id"],
        username=row["username"],
        name=row["name"],
        description=row["description"],
        avatar_file_id=row["avatar_file_id"],
        created_at=row["created_at"],
    )


def _track(row: aiosqlite.Row) -> Track:
    keys = row.keys()
    return Track(
        id=row["id"],
        artist_id=row["artist_id"],
        title=row["title"],
        audio_file_id=row["audio_file_id"],
        duration=row["duration"],
        plays=row["plays"],
        created_at=row["created_at"],
        artist_name=row["artist_name"] if "artist_name" in keys else "",
        likes=row["likes"] if "likes" in keys else 0,
        price_amount=row["price_amount"] if "price_amount" in keys else None,
        price_currency=row["price_currency"] if "price_currency" in keys else None,
        sold_at=row["sold_at"] if "sold_at" in keys else None,
    )


TRACK_SELECT = """
SELECT t.*, a.name AS artist_name,
       (SELECT COUNT(*) FROM likes l WHERE l.track_id = t.id) AS likes
FROM tracks t
JOIN artists a ON a.user_id = t.artist_id
"""


async def connect(path: Path) -> None:
    global _conn
    _conn = await aiosqlite.connect(path)
    _conn.row_factory = aiosqlite.Row
    # SQLite's built-in LIKE/lower() only fold ASCII, so "кровать" would not
    # match "Кровать". Register Python's Unicode-aware lower() for search.
    await _conn.create_function("ulower", 1, _ulower, deterministic=True)
    await _conn.execute("PRAGMA foreign_keys = ON")
    await _conn.execute("PRAGMA journal_mode = WAL")
    await _conn.executescript(SCHEMA)
    await _migrate()
    await _conn.commit()


async def _migrate() -> None:
    """Add columns introduced after a database was already created."""
    for table, columns in MIGRATIONS.items():
        async with _db().execute(f"PRAGMA table_info({table})") as cur:
            existing = {row["name"] for row in await cur.fetchall()}
        for column, statement in columns.items():
            if column not in existing:
                await _db().execute(statement)


async def close() -> None:
    global _conn
    if _conn is not None:
        await _conn.close()
        _conn = None


def _db() -> aiosqlite.Connection:
    if _conn is None:
        raise RuntimeError("Database is not connected; call db.connect() first")
    return _conn


# --- artists ---------------------------------------------------------------


async def get_artist(user_id: int) -> Optional[Artist]:
    async with _db().execute(
        "SELECT * FROM artists WHERE user_id = ?", (user_id,)
    ) as cur:
        row = await cur.fetchone()
    return _artist(row) if row else None


async def create_artist(
    user_id: int,
    username: Optional[str],
    name: str,
    description: str,
    avatar_file_id: Optional[str],
) -> None:
    await _db().execute(
        """
        INSERT INTO artists (user_id, username, name, description, avatar_file_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            username       = excluded.username,
            name           = excluded.name,
            description    = excluded.description,
            avatar_file_id = excluded.avatar_file_id
        """,
        (user_id, username, name, description, avatar_file_id, int(time.time())),
    )
    await _db().commit()


async def update_artist_field(user_id: int, field: str, value: Optional[str]) -> None:
    if field not in {"name", "description", "avatar_file_id"}:
        raise ValueError(f"refusing to update unknown column {field!r}")
    await _db().execute(f"UPDATE artists SET {field} = ? WHERE user_id = ?", (value, user_id))
    await _db().commit()


async def count_artist_tracks(user_id: int) -> int:
    async with _db().execute(
        "SELECT COUNT(*) AS n FROM tracks WHERE artist_id = ?", (user_id,)
    ) as cur:
        row = await cur.fetchone()
    return row["n"] if row else 0


async def count_artist_likes(user_id: int) -> int:
    async with _db().execute(
        """
        SELECT COUNT(*) AS n FROM likes
        WHERE track_id IN (SELECT id FROM tracks WHERE artist_id = ?)
        """,
        (user_id,),
    ) as cur:
        row = await cur.fetchone()
    return row["n"] if row else 0


# --- tracks ----------------------------------------------------------------


async def add_track(
    artist_id: int, title: str, audio_file_id: str, duration: int
) -> int:
    cur = await _db().execute(
        """
        INSERT INTO tracks (artist_id, title, audio_file_id, duration, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (artist_id, title, audio_file_id, duration, int(time.time())),
    )
    await _db().commit()
    return int(cur.lastrowid)


async def get_track(track_id: int) -> Optional[Track]:
    async with _db().execute(f"{TRACK_SELECT} WHERE t.id = ?", (track_id,)) as cur:
        row = await cur.fetchone()
    return _track(row) if row else None


async def delete_track(track_id: int, artist_id: int) -> bool:
    cur = await _db().execute(
        "DELETE FROM tracks WHERE id = ? AND artist_id = ?", (track_id, artist_id)
    )
    await _db().commit()
    return cur.rowcount > 0


async def register_play(track_id: int) -> None:
    await _db().execute("UPDATE tracks SET plays = plays + 1 WHERE id = ?", (track_id,))
    await _db().commit()


async def feed_page(offset: int, limit: int) -> list[Track]:
    async with _db().execute(
        f"{TRACK_SELECT} ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?",
        (limit, offset),
    ) as cur:
        rows = await cur.fetchall()
    return [_track(r) for r in rows]


async def count_tracks() -> int:
    async with _db().execute("SELECT COUNT(*) AS n FROM tracks") as cur:
        row = await cur.fetchone()
    return row["n"] if row else 0


async def count_artists() -> int:
    async with _db().execute("SELECT COUNT(*) AS n FROM artists") as cur:
        row = await cur.fetchone()
    return row["n"] if row else 0


async def artist_tracks(artist_id: int, limit: int = 50) -> list[Track]:
    async with _db().execute(
        f"{TRACK_SELECT} WHERE t.artist_id = ? ORDER BY t.created_at DESC LIMIT ?",
        (artist_id, limit),
    ) as cur:
        rows = await cur.fetchall()
    return [_track(r) for r in rows]


async def search_tracks(query: str, limit: int = 20) -> list[Track]:
    pattern = f"%{query.strip().lower()}%"
    async with _db().execute(
        f"""
        {TRACK_SELECT}
        WHERE ulower(t.title) LIKE ? OR ulower(a.name) LIKE ?
        ORDER BY t.created_at DESC
        LIMIT ?
        """,
        (pattern, pattern, limit),
    ) as cur:
        rows = await cur.fetchall()
    return [_track(r) for r in rows]


# --- likes -----------------------------------------------------------------


async def toggle_like(user_id: int, track_id: int) -> bool:
    """Returns True if the track is liked after the call."""
    async with _db().execute(
        "SELECT 1 FROM likes WHERE user_id = ? AND track_id = ?", (user_id, track_id)
    ) as cur:
        existing = await cur.fetchone()

    if existing:
        await _db().execute(
            "DELETE FROM likes WHERE user_id = ? AND track_id = ?", (user_id, track_id)
        )
        await _db().commit()
        return False

    await _db().execute(
        "INSERT INTO likes (user_id, track_id, created_at) VALUES (?, ?, ?)",
        (user_id, track_id, int(time.time())),
    )
    await _db().commit()
    return True


async def is_liked(user_id: int, track_id: int) -> bool:
    async with _db().execute(
        "SELECT 1 FROM likes WHERE user_id = ? AND track_id = ?", (user_id, track_id)
    ) as cur:
        return await cur.fetchone() is not None


async def liked_tracks(user_id: int, limit: int = 50) -> list[Track]:
    async with _db().execute(
        f"""
        {TRACK_SELECT}
        JOIN likes l2 ON l2.track_id = t.id AND l2.user_id = ?
        ORDER BY l2.created_at DESC
        LIMIT ?
        """,
        (user_id, limit),
    ) as cur:
        rows = await cur.fetchall()
    return [_track(r) for r in rows]


# --- selling ---------------------------------------------------------------


async def set_price(track_id: int, artist_id: int, amount: int, code: str) -> bool:
    cur = await _db().execute(
        """
        UPDATE tracks SET price_amount = ?, price_currency = ?
        WHERE id = ? AND artist_id = ? AND sold_at IS NULL
        """,
        (amount, code, track_id, artist_id),
    )
    await _db().commit()
    return cur.rowcount > 0


async def clear_price(track_id: int, artist_id: int) -> bool:
    cur = await _db().execute(
        "UPDATE tracks SET price_amount = NULL, price_currency = NULL WHERE id = ? AND artist_id = ?",
        (track_id, artist_id),
    )
    await _db().commit()
    return cur.rowcount > 0


async def mark_sold(track_id: int) -> None:
    await _db().execute(
        "UPDATE tracks SET sold_at = ?, price_amount = NULL, price_currency = NULL WHERE id = ?",
        (int(time.time()), track_id),
    )
    await _db().commit()


# --- deals -----------------------------------------------------------------


@dataclass
class Deal:
    id: int
    track_id: int
    seller_id: int
    buyer_id: int
    price_amount: int
    price_currency: str
    status: str
    escrow_state: str
    seller_confirmed: int
    buyer_confirmed: int
    seller_signature: Optional[str]
    buyer_signature: Optional[str]
    created_at: int
    updated_at: int
    track_title: str = ""
    track_duration: int = 0

    def party_of(self, user_id: int) -> Optional[str]:
        if user_id == self.seller_id:
            return "seller"
        if user_id == self.buyer_id:
            return "buyer"
        return None

    def other_side(self, user_id: int) -> int:
        return self.buyer_id if user_id == self.seller_id else self.seller_id


def _deal(row: aiosqlite.Row) -> Deal:
    keys = row.keys()
    return Deal(
        id=row["id"],
        track_id=row["track_id"],
        seller_id=row["seller_id"],
        buyer_id=row["buyer_id"],
        price_amount=row["price_amount"],
        price_currency=row["price_currency"],
        status=row["status"],
        escrow_state=row["escrow_state"],
        seller_confirmed=row["seller_confirmed"],
        buyer_confirmed=row["buyer_confirmed"],
        seller_signature=row["seller_signature"],
        buyer_signature=row["buyer_signature"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        track_title=row["track_title"] if "track_title" in keys else "",
        track_duration=row["track_duration"] if "track_duration" in keys else 0,
    )


DEAL_SELECT = """
SELECT d.*, t.title AS track_title, t.duration AS track_duration
FROM deals d JOIN tracks t ON t.id = d.track_id
"""

OPEN_STATUSES = (
    "pending_seller", "seller_fill", "seller_files", "buyer_fill", "review", "signing",
)


async def create_deal(track_id: int, seller_id: int, buyer_id: int, amount: int, code: str) -> int:
    now = int(time.time())
    cur = await _db().execute(
        """
        INSERT INTO deals (track_id, seller_id, buyer_id, price_amount, price_currency,
                           status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending_seller', ?, ?)
        """,
        (track_id, seller_id, buyer_id, amount, code, now, now),
    )
    await _db().commit()
    return int(cur.lastrowid)


async def get_deal(deal_id: int) -> Optional[Deal]:
    async with _db().execute(f"{DEAL_SELECT} WHERE d.id = ?", (deal_id,)) as cur:
        row = await cur.fetchone()
    return _deal(row) if row else None


async def update_deal(deal_id: int, **columns: object) -> None:
    allowed = {
        "status", "escrow_state", "seller_confirmed", "buyer_confirmed",
        "seller_signature", "buyer_signature",
    }
    unknown = set(columns) - allowed
    if unknown:
        raise ValueError(f"refusing to update unknown deal columns: {sorted(unknown)}")
    assignments = ", ".join(f"{k} = ?" for k in columns)
    await _db().execute(
        f"UPDATE deals SET {assignments}, updated_at = ? WHERE id = ?",
        (*columns.values(), int(time.time()), deal_id),
    )
    await _db().commit()


async def open_deal_for_track(track_id: int) -> Optional[Deal]:
    async with _db().execute(
        f"{DEAL_SELECT} WHERE d.track_id = ? AND d.status IN {OPEN_STATUSES} LIMIT 1",
        (track_id,),
    ) as cur:
        row = await cur.fetchone()
    return _deal(row) if row else None


async def user_deals(user_id: int, limit: int = 20) -> list[Deal]:
    async with _db().execute(
        f"""
        {DEAL_SELECT}
        WHERE d.seller_id = ? OR d.buyer_id = ?
        ORDER BY d.updated_at DESC LIMIT ?
        """,
        (user_id, user_id, limit),
    ) as cur:
        rows = await cur.fetchall()
    return [_deal(r) for r in rows]


async def active_deal_for_user(user_id: int) -> Optional[Deal]:
    """The deal a plain text answer should be routed to."""
    async with _db().execute(
        f"""
        {DEAL_SELECT}
        WHERE (d.seller_id = ? OR d.buyer_id = ?) AND d.status IN {OPEN_STATUSES}
        ORDER BY d.updated_at DESC LIMIT 1
        """,
        (user_id, user_id),
    ) as cur:
        row = await cur.fetchone()
    return _deal(row) if row else None


# --- questionnaire ---------------------------------------------------------


async def set_field(deal_id: int, key: str, value: str) -> None:
    await _db().execute(
        "INSERT INTO deal_fields (deal_id, key, value) VALUES (?, ?, ?) "
        "ON CONFLICT(deal_id, key) DO UPDATE SET value = excluded.value",
        (deal_id, key, value),
    )
    await _db().commit()


async def get_fields(deal_id: int) -> dict[str, str]:
    async with _db().execute(
        "SELECT key, value FROM deal_fields WHERE deal_id = ?", (deal_id,)
    ) as cur:
        rows = await cur.fetchall()
    return {r["key"]: r["value"] for r in rows}


async def purge_deal_fields(deal_id: int) -> int:
    """Drop the questionnaire once the deal is closed.

    These rows hold passport numbers and home addresses. Both parties already
    have the rendered contract, so keeping the raw answers only creates a
    breach waiting to happen.
    """
    cur = await _db().execute("DELETE FROM deal_fields WHERE deal_id = ?", (deal_id,))
    await _db().commit()
    return cur.rowcount


# --- balances and escrow ---------------------------------------------------


async def get_balance(user_id: int, code: str) -> int:
    async with _db().execute(
        "SELECT amount FROM balances WHERE user_id = ? AND currency = ?", (user_id, code)
    ) as cur:
        row = await cur.fetchone()
    return row["amount"] if row else 0


async def all_balances(user_id: int) -> dict[str, int]:
    async with _db().execute(
        "SELECT currency, amount FROM balances WHERE user_id = ?", (user_id,)
    ) as cur:
        rows = await cur.fetchall()
    return {r["currency"]: r["amount"] for r in rows}


async def credit(user_id: int, code: str, amount: int, reason: str, deal_id: Optional[int] = None) -> None:
    if amount <= 0:
        raise ValueError("credit amount must be positive")
    await _db().execute(
        "INSERT INTO balances (user_id, currency, amount) VALUES (?, ?, ?) "
        "ON CONFLICT(user_id, currency) DO UPDATE SET amount = amount + excluded.amount",
        (user_id, code, amount),
    )
    await _db().execute(
        "INSERT INTO ledger (user_id, currency, delta, reason, deal_id, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, code, amount, reason, deal_id, int(time.time())),
    )
    await _db().commit()


async def debit(user_id: int, code: str, amount: int, reason: str, deal_id: Optional[int] = None) -> bool:
    """Take funds only if they are actually there.

    The guard lives in the UPDATE so a balance can never go negative, however
    the check and the write interleave.
    """
    if amount <= 0:
        raise ValueError("debit amount must be positive")
    cur = await _db().execute(
        "UPDATE balances SET amount = amount - ? "
        "WHERE user_id = ? AND currency = ? AND amount >= ?",
        (amount, user_id, code, amount),
    )
    if cur.rowcount == 0:
        await _db().commit()
        return False
    await _db().execute(
        "INSERT INTO ledger (user_id, currency, delta, reason, deal_id, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, code, -amount, reason, deal_id, int(time.time())),
    )
    await _db().commit()
    return True


async def recent_ledger(user_id: int, limit: int = 10) -> list[aiosqlite.Row]:
    async with _db().execute(
        "SELECT * FROM ledger WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
        (user_id, limit),
    ) as cur:
        return list(await cur.fetchall())


async def total_held() -> dict[str, int]:
    """Sum of escrow the service currently owes back to buyers or sellers."""
    async with _db().execute(
        "SELECT price_currency AS c, SUM(price_amount) AS n FROM deals "
        "WHERE escrow_state = 'held' GROUP BY price_currency"
    ) as cur:
        rows = await cur.fetchall()
    return {r["c"]: r["n"] for r in rows}


async def count_deals_open() -> int:
    async with _db().execute(
        f"SELECT COUNT(*) AS n FROM deals WHERE status IN {OPEN_STATUSES}"
    ) as cur:
        row = await cur.fetchone()
    return row["n"] if row else 0


async def mark_unsold(track_id: int) -> None:
    """Undo a sale. Only used by tests and by an admin fixing a mistake."""
    await _db().execute("UPDATE tracks SET sold_at = NULL WHERE id = ?", (track_id,))
    await _db().commit()


# --- deal materials --------------------------------------------------------


@dataclass
class Material:
    id: int
    deal_id: int
    file_id: str
    file_name: str
    file_size: int
    kind: str


async def add_material(
    deal_id: int, file_id: str, file_name: str, file_size: int, kind: str
) -> int:
    cur = await _db().execute(
        """
        INSERT INTO deal_materials (deal_id, file_id, file_name, file_size, kind, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (deal_id, file_id, file_name, file_size, kind, int(time.time())),
    )
    await _db().commit()
    return int(cur.lastrowid)


async def materials(deal_id: int) -> list[Material]:
    async with _db().execute(
        "SELECT * FROM deal_materials WHERE deal_id = ? ORDER BY id", (deal_id,)
    ) as cur:
        rows = await cur.fetchall()
    return [
        Material(
            id=r["id"], deal_id=r["deal_id"], file_id=r["file_id"],
            file_name=r["file_name"], file_size=r["file_size"], kind=r["kind"],
        )
        for r in rows
    ]


async def drop_materials(deal_id: int) -> int:
    """Release a cancelled deal's files; the seller keeps their originals."""
    cur = await _db().execute("DELETE FROM deal_materials WHERE deal_id = ?", (deal_id,))
    await _db().commit()
    return cur.rowcount


# --- on-chain --------------------------------------------------------------


async def deposit_seen(tx_hash: str) -> bool:
    async with _db().execute(
        "SELECT 1 FROM ton_deposits WHERE tx_hash = ?", (tx_hash,)
    ) as cur:
        return await cur.fetchone() is not None


async def record_deposit(
    tx_hash: str, user_id: int, currency: str, amount: int, sender: str
) -> bool:
    """Claim a deposit. False means another poll already credited it."""
    try:
        await _db().execute(
            """
            INSERT INTO ton_deposits (tx_hash, user_id, currency, amount, sender, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (tx_hash, user_id, currency, amount, sender, int(time.time())),
        )
        await _db().commit()
        return True
    except aiosqlite.IntegrityError:
        return False


async def create_withdrawal(user_id: int, currency: str, amount: int, destination: str) -> int:
    now = int(time.time())
    cur = await _db().execute(
        """
        INSERT INTO ton_withdrawals (user_id, currency, amount, destination, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?)
        """,
        (user_id, currency, amount, destination, now, now),
    )
    await _db().commit()
    return int(cur.lastrowid)


async def set_withdrawal_status(wid: int, status: str, tx_hash: Optional[str] = None) -> None:
    await _db().execute(
        "UPDATE ton_withdrawals SET status = ?, tx_hash = ?, updated_at = ? WHERE id = ?",
        (status, tx_hash, int(time.time()), wid),
    )
    await _db().commit()


async def total_liability() -> dict[str, int]:
    """What the service owes users: their balances plus everything in escrow."""
    out: dict[str, int] = {}
    async with _db().execute(
        "SELECT currency, SUM(amount) AS n FROM balances WHERE amount > 0 GROUP BY currency"
    ) as cur:
        for row in await cur.fetchall():
            out[row["currency"]] = row["n"]
    for code, amount in (await total_held()).items():
        out[code] = out.get(code, 0) + amount
    return out


# --- market ----------------------------------------------------------------


async def count_for_sale() -> int:
    async with _db().execute(
        "SELECT COUNT(*) AS n FROM tracks WHERE price_amount IS NOT NULL AND sold_at IS NULL"
    ) as cur:
        row = await cur.fetchone()
    return row["n"] if row else 0


async def for_sale_page(offset: int, limit: int) -> list[Track]:
    async with _db().execute(
        f"""
        {TRACK_SELECT}
        WHERE t.price_amount IS NOT NULL AND t.sold_at IS NULL
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT ? OFFSET ?
        """,
        (limit, offset),
    ) as cur:
        rows = await cur.fetchall()
    return [_track(r) for r in rows]
