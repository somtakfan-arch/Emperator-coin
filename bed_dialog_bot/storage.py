import sqlite3
import time
from contextlib import contextmanager

_SCHEMA = """
CREATE TABLE IF NOT EXISTS connections (
    business_connection_id TEXT PRIMARY KEY,
    owner_user_id INTEGER,
    owner_chat_id INTEGER NOT NULL,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bans (
    business_connection_id TEXT NOT NULL,
    chat_id INTEGER NOT NULL,
    until_ts INTEGER NOT NULL,
    PRIMARY KEY (business_connection_id, chat_id)
);

CREATE TABLE IF NOT EXISTS messages (
    business_connection_id TEXT NOT NULL,
    chat_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    from_user_id INTEGER,
    from_name TEXT,
    from_username TEXT,
    text TEXT,
    photo_file_id TEXT,
    caption TEXT,
    date INTEGER,
    PRIMARY KEY (business_connection_id, chat_id, message_id)
);
"""


class Storage:
    def __init__(self, db_path: str):
        self._db_path = db_path
        with self._connect() as conn:
            conn.executescript(_SCHEMA)

    @contextmanager
    def _connect(self):
        conn = sqlite3.connect(self._db_path)
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def save_connection(self, business_connection_id: str, owner_user_id: int, owner_chat_id: int, is_enabled: bool) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO connections (business_connection_id, owner_user_id, owner_chat_id, is_enabled, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(business_connection_id) DO UPDATE SET
                    owner_user_id=excluded.owner_user_id,
                    owner_chat_id=excluded.owner_chat_id,
                    is_enabled=excluded.is_enabled,
                    updated_at=excluded.updated_at
                """,
                (business_connection_id, owner_user_id, owner_chat_id, int(is_enabled), int(time.time())),
            )

    def get_connection(self, business_connection_id: str):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT owner_user_id, owner_chat_id, is_enabled FROM connections WHERE business_connection_id = ?",
                (business_connection_id,),
            ).fetchone()
        if not row:
            return None
        return {"owner_user_id": row[0], "owner_chat_id": row[1], "is_enabled": bool(row[2])}

    def set_ban(self, business_connection_id: str, chat_id: int, until_ts: int) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO bans (business_connection_id, chat_id, until_ts)
                VALUES (?, ?, ?)
                ON CONFLICT(business_connection_id, chat_id) DO UPDATE SET
                    until_ts=excluded.until_ts
                """,
                (business_connection_id, chat_id, until_ts),
            )

    def clear_ban(self, business_connection_id: str, chat_id: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM bans WHERE business_connection_id = ? AND chat_id = ?",
                (business_connection_id, chat_id),
            )

    def get_ban(self, business_connection_id: str, chat_id: int):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT until_ts FROM bans WHERE business_connection_id = ? AND chat_id = ?",
                (business_connection_id, chat_id),
            ).fetchone()
        return row[0] if row else None

    def save_message(
        self,
        *,
        business_connection_id: str,
        chat_id: int,
        message_id: int,
        from_user_id,
        from_name,
        from_username,
        text,
        photo_file_id,
        caption,
        date,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO messages (
                    business_connection_id, chat_id, message_id, from_user_id,
                    from_name, from_username, text, photo_file_id, caption, date
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(business_connection_id, chat_id, message_id) DO UPDATE SET
                    from_user_id=excluded.from_user_id,
                    from_name=excluded.from_name,
                    from_username=excluded.from_username,
                    text=excluded.text,
                    photo_file_id=excluded.photo_file_id,
                    caption=excluded.caption,
                    date=excluded.date
                """,
                (
                    business_connection_id,
                    chat_id,
                    message_id,
                    from_user_id,
                    from_name,
                    from_username,
                    text,
                    photo_file_id,
                    caption,
                    date,
                ),
            )

    def get_message(self, business_connection_id: str, chat_id: int, message_id: int):
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT from_user_id, from_name, from_username, text, photo_file_id, caption, date
                FROM messages WHERE business_connection_id = ? AND chat_id = ? AND message_id = ?
                """,
                (business_connection_id, chat_id, message_id),
            ).fetchone()
        if not row:
            return None
        return {
            "from_user_id": row[0],
            "from_name": row[1],
            "from_username": row[2],
            "text": row[3],
            "photo_file_id": row[4],
            "caption": row[5],
            "date": row[6],
        }

    def message_exists(self, business_connection_id: str, chat_id: int, message_id: int) -> bool:
        return self.get_message(business_connection_id, chat_id, message_id) is not None

    def delete_message(self, business_connection_id: str, chat_id: int, message_id: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM messages WHERE business_connection_id = ? AND chat_id = ? AND message_id = ?",
                (business_connection_id, chat_id, message_id),
            )
