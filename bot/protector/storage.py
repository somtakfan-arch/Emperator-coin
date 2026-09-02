"""Хранилище на SQLite: настройки чатов, репутация участников, варны, журнал."""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from dataclasses import dataclass

from .config import DEFAULT_SETTINGS

SCHEMA = """
CREATE TABLE IF NOT EXISTS chats (
    chat_id  INTEGER PRIMARY KEY,
    title    TEXT DEFAULT '',
    settings TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS members (
    chat_id   INTEGER NOT NULL,
    user_id   INTEGER NOT NULL,
    joined_at INTEGER NOT NULL DEFAULT 0,
    messages  INTEGER NOT NULL DEFAULT 0,
    trusted   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (chat_id, user_id)
);
CREATE TABLE IF NOT EXISTS warns (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id    INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    admin_id   INTEGER NOT NULL DEFAULT 0,
    reason     TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS warns_chat_user ON warns (chat_id, user_id);
CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id    INTEGER NOT NULL,
    user_id    INTEGER NOT NULL DEFAULT 0,
    kind       TEXT NOT NULL,
    detail     TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_chat_time ON events (chat_id, created_at);
"""


@dataclass(slots=True)
class MemberState:
    joined_at: int
    messages: int
    trusted: bool


class Storage:
    """Обёртка над sqlite3. Запросы короткие, доступ сериализован блокировкой."""

    def __init__(self, path: str) -> None:
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.execute("PRAGMA journal_mode=WAL")
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript(SCHEMA)
            self._db.commit()

    def close(self) -> None:
        with self._lock:
            self._db.close()

    # ------------------------------------------------------------------ chats
    def settings(self, chat_id: int) -> dict[str, bool | int | str]:
        with self._lock:
            row = self._db.execute(
                "SELECT settings FROM chats WHERE chat_id = ?", (chat_id,)
            ).fetchone()
        merged = dict(DEFAULT_SETTINGS)
        if row:
            try:
                stored = json.loads(row["settings"])
            except json.JSONDecodeError:
                stored = {}
            merged.update({k: v for k, v in stored.items() if k in DEFAULT_SETTINGS})
        return merged

    def set_setting(self, chat_id: int, key: str, value: bool | int | str) -> None:
        current = self.settings(chat_id)
        current[key] = value
        payload = json.dumps(
            {k: v for k, v in current.items() if DEFAULT_SETTINGS.get(k) != v},
            ensure_ascii=False,
        )
        with self._lock:
            self._db.execute(
                "INSERT INTO chats (chat_id, settings) VALUES (?, ?) "
                "ON CONFLICT(chat_id) DO UPDATE SET settings = excluded.settings",
                (chat_id, payload),
            )
            self._db.commit()

    def touch_chat(self, chat_id: int, title: str) -> None:
        with self._lock:
            self._db.execute(
                "INSERT INTO chats (chat_id, title) VALUES (?, ?) "
                "ON CONFLICT(chat_id) DO UPDATE SET title = excluded.title",
                (chat_id, title),
            )
            self._db.commit()

    def known_chats(self) -> list[int]:
        with self._lock:
            rows = self._db.execute("SELECT chat_id FROM chats").fetchall()
        return [r["chat_id"] for r in rows]

    # ---------------------------------------------------------------- members
    def member(self, chat_id: int, user_id: int) -> MemberState | None:
        with self._lock:
            row = self._db.execute(
                "SELECT joined_at, messages, trusted FROM members "
                "WHERE chat_id = ? AND user_id = ?",
                (chat_id, user_id),
            ).fetchone()
        if row is None:
            return None
        return MemberState(row["joined_at"], row["messages"], bool(row["trusted"]))

    def register_join(self, chat_id: int, user_id: int, now: int | None = None) -> None:
        now = now or int(time.time())
        with self._lock:
            self._db.execute(
                "INSERT INTO members (chat_id, user_id, joined_at, messages, trusted) "
                "VALUES (?, ?, ?, 0, 0) ON CONFLICT(chat_id, user_id) DO NOTHING",
                (chat_id, user_id, now),
            )
            self._db.commit()

    def bump_messages(self, chat_id: int, user_id: int, now: int | None = None) -> MemberState:
        now = now or int(time.time())
        with self._lock:
            self._db.execute(
                "INSERT INTO members (chat_id, user_id, joined_at, messages, trusted) "
                "VALUES (?, ?, ?, 1, 0) ON CONFLICT(chat_id, user_id) "
                "DO UPDATE SET messages = messages + 1",
                (chat_id, user_id, now),
            )
            self._db.commit()
            row = self._db.execute(
                "SELECT joined_at, messages, trusted FROM members "
                "WHERE chat_id = ? AND user_id = ?",
                (chat_id, user_id),
            ).fetchone()
        return MemberState(row["joined_at"], row["messages"], bool(row["trusted"]))

    def set_trusted(self, chat_id: int, user_id: int, trusted: bool) -> None:
        with self._lock:
            self._db.execute(
                "INSERT INTO members (chat_id, user_id, joined_at, messages, trusted) "
                "VALUES (?, ?, ?, 0, ?) ON CONFLICT(chat_id, user_id) "
                "DO UPDATE SET trusted = excluded.trusted",
                (chat_id, user_id, int(time.time()), int(trusted)),
            )
            self._db.commit()

    # ------------------------------------------------------------------ warns
    def add_warn(self, chat_id: int, user_id: int, admin_id: int, reason: str) -> int:
        with self._lock:
            self._db.execute(
                "INSERT INTO warns (chat_id, user_id, admin_id, reason, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (chat_id, user_id, admin_id, reason, int(time.time())),
            )
            self._db.commit()
            row = self._db.execute(
                "SELECT COUNT(*) AS n FROM warns WHERE chat_id = ? AND user_id = ?",
                (chat_id, user_id),
            ).fetchone()
        return int(row["n"])

    def count_warns(self, chat_id: int, user_id: int) -> int:
        with self._lock:
            row = self._db.execute(
                "SELECT COUNT(*) AS n FROM warns WHERE chat_id = ? AND user_id = ?",
                (chat_id, user_id),
            ).fetchone()
        return int(row["n"])

    def clear_warns(self, chat_id: int, user_id: int) -> None:
        with self._lock:
            self._db.execute(
                "DELETE FROM warns WHERE chat_id = ? AND user_id = ?", (chat_id, user_id)
            )
            self._db.commit()

    def pop_warn(self, chat_id: int, user_id: int) -> int:
        """Снимает последнее предупреждение, возвращает остаток."""
        with self._lock:
            self._db.execute(
                "DELETE FROM warns WHERE id = (SELECT id FROM warns "
                "WHERE chat_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1)",
                (chat_id, user_id),
            )
            self._db.commit()
        return self.count_warns(chat_id, user_id)

    # ----------------------------------------------------------------- events
    def log_event(self, chat_id: int, user_id: int, kind: str, detail: str = "") -> None:
        with self._lock:
            self._db.execute(
                "INSERT INTO events (chat_id, user_id, kind, detail, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (chat_id, user_id, kind, detail[:500], int(time.time())),
            )
            self._db.commit()

    def stats(self, chat_id: int, since: int) -> list[tuple[str, int]]:
        with self._lock:
            rows = self._db.execute(
                "SELECT kind, COUNT(*) AS n FROM events "
                "WHERE chat_id = ? AND created_at >= ? GROUP BY kind ORDER BY n DESC",
                (chat_id, since),
            ).fetchall()
        return [(r["kind"], r["n"]) for r in rows]
