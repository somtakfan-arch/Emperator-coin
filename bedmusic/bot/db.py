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
"""


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
    return Track(
        id=row["id"],
        artist_id=row["artist_id"],
        title=row["title"],
        audio_file_id=row["audio_file_id"],
        duration=row["duration"],
        plays=row["plays"],
        created_at=row["created_at"],
        artist_name=row["artist_name"] if "artist_name" in row.keys() else "",
        likes=row["likes"] if "likes" in row.keys() else 0,
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
    await _conn.commit()


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
