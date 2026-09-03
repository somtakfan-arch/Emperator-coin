import os
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

CREATE TABLE IF NOT EXISTS premium (
    user_id INTEGER PRIMARY KEY,
    premium_until INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ultra (
    user_id INTEGER PRIMARY KEY,
    ultra_until INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ultra_contacts (
    owner_id INTEGER NOT NULL,
    contact_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    PRIMARY KEY (owner_id, contact_id, kind)
);

CREATE TABLE IF NOT EXISTS regex_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    pattern TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_cmds (
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    text TEXT NOT NULL,
    action TEXT NOT NULL DEFAULT 'text',
    target TEXT NOT NULL DEFAULT 'self',
    param TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, name)
);

CREATE TABLE IF NOT EXISTS cmd_market (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    text TEXT NOT NULL,
    installs INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bed_codes (
    code TEXT PRIMARY KEY,
    amount INTEGER NOT NULL,
    creator_id INTEGER NOT NULL,
    redeemed_by INTEGER,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bed_stakes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    until_ts INTEGER NOT NULL,
    rate_bps INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS price_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    target REAL NOT NULL,
    above INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS price_history (
    ts INTEGER PRIMARY KEY,
    price REAL NOT NULL
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

CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    chat_id INTEGER NOT NULL,
    name TEXT,
    username TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    photo_file_id TEXT
);

CREATE TABLE IF NOT EXISTS blacklist (
    user_id INTEGER PRIMARY KEY,
    reason TEXT,
    banned_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    content TEXT,
    file_id TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_owner_time ON logs (owner_user_id, created_at);

CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    name TEXT,
    username TEXT,
    last_seen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS capture_active (
    target_user_id INTEGER PRIMARY KEY,
    started_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS captures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_user_id INTEGER NOT NULL,
    actor_id INTEGER,
    actor_name TEXT,
    actor_username TEXT,
    direction TEXT,
    action TEXT,
    content TEXT,
    media_kind TEXT,
    media_file_id TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_captures_target ON captures (target_user_id, created_at);

CREATE TABLE IF NOT EXISTS log_access (
    admin_id INTEGER NOT NULL,
    target_user_id INTEGER NOT NULL,
    PRIMARY KEY (admin_id, target_user_id)
);

CREATE TABLE IF NOT EXISTS referrals (
    invited_user_id INTEGER PRIMARY KEY,
    referrer_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    confirmed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS referral_progress (
    referrer_id INTEGER PRIMARY KEY,
    rewarded INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trials (
    user_id INTEGER PRIMARY KEY,
    granted_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
    owner_user_id INTEGER NOT NULL,
    chat_id INTEGER NOT NULL,
    note TEXT NOT NULL,
    last_shown INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (owner_user_id, chat_id)
);
"""

_SCHEMA += """
CREATE TABLE IF NOT EXISTS alerts (
    owner_user_id INTEGER NOT NULL,
    keyword TEXT NOT NULL,
    PRIMARY KEY (owner_user_id, keyword)
);

CREATE TABLE IF NOT EXISTS promos (
    code TEXT PRIMARY KEY,
    days INTEGER NOT NULL,
    uses_left INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
    code TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (code, user_id)
);

CREATE TABLE IF NOT EXISTS winback (
    user_id INTEGER PRIMARY KEY,
    sent_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tiktok_subs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    chat_id INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'tiktok',
    name TEXT,
    username TEXT,
    link TEXT,
    photo_file_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reward_code TEXT,
    reward_days INTEGER,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_mutes (
    owner_user_id INTEGER NOT NULL,
    chat_id INTEGER NOT NULL,
    PRIMARY KEY (owner_user_id, chat_id)
);

CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    remind_at INTEGER NOT NULL,
    text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_activity (
    owner_user_id INTEGER NOT NULL,
    chat_id INTEGER NOT NULL,
    last_ts INTEGER NOT NULL,
    PRIMARY KEY (owner_user_id, chat_id)
);

CREATE TABLE IF NOT EXISTS partner_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_id INTEGER NOT NULL,
    payer_id INTEGER NOT NULL,
    days INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS crypto_invoices (
    invoice_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    days INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS troll_texts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    text TEXT,
    kind TEXT NOT NULL DEFAULT 'text',
    file_id TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_roles (
    user_id INTEGER PRIMARY KEY,
    rank TEXT NOT NULL,
    granted_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bed_balances (
    user_id INTEGER PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bed_dust (
    user_id INTEGER PRIMARY KEY,
    dust REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ton_deposits (
    tx_hash TEXT PRIMARY KEY,
    user_id INTEGER,
    amount INTEGER NOT NULL,
    credited INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ton_withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    address TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    tx_hash TEXT,
    error TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stalker_chats (
    business_connection_id TEXT NOT NULL,
    chat_id INTEGER NOT NULL,
    PRIMARY KEY (business_connection_id, chat_id)
);

CREATE TABLE IF NOT EXISTS workink_redemptions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bed_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_checkins (
    user_id INTEGER PRIMARY KEY,
    streak INTEGER NOT NULL DEFAULT 0,
    last_day INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tr_cache (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS adlink_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    used_at INTEGER,
    created_at INTEGER NOT NULL
);
"""

CAPTURE_RETENTION_SECONDS = 86400
_ULTRA_GRACE_SECONDS = int(os.environ.get("ULTRA_GRACE_DAYS", "3")) * 86400
_ULTRA_FOREVER_TS = 9999999999  # lifetime sentinel (~year 2286)


class Storage:
    def __init__(self, db_path: str):
        self._db_path = db_path
        self._last_prune = 0.0
        with self._connect() as conn:
            conn.executescript(_SCHEMA)
            self._migrate(conn)

    def _migrate(self, conn) -> None:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(messages)")}
        if "video_note_file_id" not in columns:
            conn.execute("ALTER TABLE messages ADD COLUMN video_note_file_id TEXT")
        if "media_kind" not in columns:
            conn.execute("ALTER TABLE messages ADD COLUMN media_kind TEXT")
        if "media_file_id" not in columns:
            conn.execute("ALTER TABLE messages ADD COLUMN media_file_id TEXT")
        if "is_bot" not in columns:
            conn.execute("ALTER TABLE messages ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0")
        user_cols = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
        if user_cols and "muted" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN muted INTEGER NOT NULL DEFAULT 0")
        ticket_cols = {row[1] for row in conn.execute("PRAGMA table_info(tickets)")}
        if ticket_cols and "kind" not in ticket_cols:
            conn.execute("ALTER TABLE tickets ADD COLUMN kind TEXT NOT NULL DEFAULT 'support'")
        if ticket_cols and "photo_file_id" not in ticket_cols:
            conn.execute("ALTER TABLE tickets ADD COLUMN photo_file_id TEXT")
        capture_cols = {row[1] for row in conn.execute("PRAGMA table_info(captures)")}
        if capture_cols and "media_file_id" not in capture_cols:
            conn.execute("ALTER TABLE captures ADD COLUMN media_file_id TEXT")
        ref_cols = {row[1] for row in conn.execute("PRAGMA table_info(referrals)")}
        if ref_cols and "confirmed" not in ref_cols:
            # Existing referrals were credited on /start — keep them confirmed.
            conn.execute("ALTER TABLE referrals ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 1")
        troll_cols = {row[1] for row in conn.execute("PRAGMA table_info(troll_texts)")}
        if troll_cols and "kind" not in troll_cols:
            conn.execute("ALTER TABLE troll_texts ADD COLUMN kind TEXT NOT NULL DEFAULT 'text'")
        if troll_cols and "file_id" not in troll_cols:
            conn.execute("ALTER TABLE troll_texts ADD COLUMN file_id TEXT")
        tt_cols = {row[1] for row in conn.execute("PRAGMA table_info(tiktok_subs)")}
        if tt_cols and "kind" not in tt_cols:
            conn.execute("ALTER TABLE tiktok_subs ADD COLUMN kind TEXT NOT NULL DEFAULT 'tiktok'")
        cc_cols = {row[1] for row in conn.execute("PRAGMA table_info(custom_cmds)")}
        if cc_cols and "action" not in cc_cols:
            conn.execute("ALTER TABLE custom_cmds ADD COLUMN action TEXT NOT NULL DEFAULT 'text'")
        if cc_cols and "target" not in cc_cols:
            conn.execute("ALTER TABLE custom_cmds ADD COLUMN target TEXT NOT NULL DEFAULT 'self'")
        if cc_cols and "param" not in cc_cols:
            conn.execute("ALTER TABLE custom_cmds ADD COLUMN param TEXT")

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

    def connected_owner_ids(self):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT DISTINCT owner_user_id FROM connections WHERE is_enabled = 1"
            ).fetchall()
        return {r[0] for r in rows}

    def get_bcid_for_owner(self, owner_user_id: int):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT business_connection_id FROM connections "
                "WHERE owner_user_id = ? AND is_enabled = 1 ORDER BY updated_at DESC LIMIT 1",
                (owner_user_id,),
            ).fetchone()
        return row[0] if row else None

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

    def get_premium_until(self, user_id: int):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT premium_until FROM premium WHERE user_id = ?", (user_id,)
            ).fetchone()
        return row[0] if row else None

    def is_premium(self, user_id: int) -> bool:
        # Ultra is a superset of premium — ultra users get all premium perks.
        until = self.get_premium_until(user_id)
        if until and until > time.time():
            return True
        return self.is_ultra(user_id)

    def get_ultra_until(self, user_id: int):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT ultra_until FROM ultra WHERE user_id = ?", (user_id,)
            ).fetchone()
        return row[0] if row else None

    def is_ultra(self, user_id: int) -> bool:
        # ULTRA perks keep working for a grace window after expiry.
        until = self.get_ultra_until(user_id)
        return bool(until and until + _ULTRA_GRACE_SECONDS > time.time())

    def grant_ultra_days(self, user_id: int, days: int) -> int:
        now = int(time.time())
        current = self.get_ultra_until(user_id)
        base = current if current and current > now else now
        new_until = base + days * 86400
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO ultra (user_id, ultra_until) VALUES (?, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET ultra_until=excluded.ultra_until",
                (user_id, new_until),
            )
        return new_until

    def grant_ultra_forever(self, user_id: int) -> int:
        """Lifetime ULTRA: a far-future expiry (~year 2286)."""
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO ultra (user_id, ultra_until) VALUES (?, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET ultra_until=excluded.ultra_until",
                (user_id, _ULTRA_FOREVER_TS),
            )
        return _ULTRA_FOREVER_TS

    def is_ultra_forever(self, user_id: int) -> bool:
        until = self.get_ultra_until(user_id)
        return bool(until and until >= _ULTRA_FOREVER_TS)

    # ULTRA enemy/VIP contacts.
    def add_ultra_contact(self, owner_id: int, contact_id: int, kind: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO ultra_contacts (owner_id, contact_id, kind) VALUES (?, ?, ?)",
                (owner_id, contact_id, kind))

    def remove_ultra_contact(self, owner_id: int, contact_id: int, kind: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM ultra_contacts WHERE owner_id=? AND contact_id=? AND kind=?",
                (owner_id, contact_id, kind))

    def is_ultra_contact(self, owner_id: int, contact_id: int, kind: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM ultra_contacts WHERE owner_id=? AND contact_id=? AND kind=?",
                (owner_id, contact_id, kind)).fetchone()
        return row is not None

    # --- custom user commands (personal macros) ---
    def set_custom_cmd(self, user_id: int, name: str, text: str,
                       action: str = "text", target: str = "self", param=None) -> None:
        import time as _t
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO custom_cmds (user_id, name, text, action, target, param, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(user_id, name) DO UPDATE SET "
                "text=excluded.text, action=excluded.action, target=excluded.target, param=excluded.param",
                (user_id, name, text, action, target, param, int(_t.time())))

    def get_custom_cmd(self, user_id: int, name: str):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT text FROM custom_cmds WHERE user_id=? AND name=?",
                (user_id, name)).fetchone()
        return row[0] if row else None

    def get_custom_cmd_full(self, user_id: int, name: str):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT text, action, target, param FROM custom_cmds WHERE user_id=? AND name=?",
                (user_id, name)).fetchone()
        if not row:
            return None
        return {"name": name, "text": row[0], "action": row[1] or "text",
                "target": row[2] or "self", "param": row[3]}

    def update_custom_cmd_field(self, user_id: int, name: str, field: str, value) -> bool:
        if field not in ("action", "target", "param", "text"):
            return False
        with self._connect() as conn:
            cur = conn.execute(
                f"UPDATE custom_cmds SET {field}=? WHERE user_id=? AND name=?",
                (value, user_id, name))
        return cur.rowcount > 0

    def list_custom_cmds(self, user_id: int):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT name, text, action, target, param FROM custom_cmds WHERE user_id=? ORDER BY name",
                (user_id,)).fetchall()
        return [{"name": r[0], "text": r[1], "action": r[2] or "text",
                 "target": r[3] or "self", "param": r[4]} for r in rows]

    def count_custom_cmds(self, user_id: int) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT COUNT(*) FROM custom_cmds WHERE user_id=?", (user_id,)).fetchone()
        return row[0] if row else 0

    def del_custom_cmd(self, user_id: int, name: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM custom_cmds WHERE user_id=? AND name=?", (user_id, name))
            return cur.rowcount > 0

    # --- command marketplace ---
    def publish_cmd(self, author_id: int, name: str, text: str) -> int:
        import time as _t
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO cmd_market (author_id, name, text, created_at) VALUES (?, ?, ?, ?)",
                (author_id, name, text, int(_t.time())))
            return cur.lastrowid

    def list_market(self, limit: int = 5, offset: int = 0):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, author_id, name, text, installs FROM cmd_market "
                "ORDER BY installs DESC, id DESC LIMIT ? OFFSET ?",
                (limit, offset)).fetchall()
        return [{"id": r[0], "author_id": r[1], "name": r[2], "text": r[3], "installs": r[4]} for r in rows]

    def count_market(self) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT COUNT(*) FROM cmd_market").fetchone()
        return row[0] if row else 0

    def get_market(self, market_id: int):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, author_id, name, text, installs FROM cmd_market WHERE id=?",
                (market_id,)).fetchone()
        if not row:
            return None
        return {"id": row[0], "author_id": row[1], "name": row[2], "text": row[3], "installs": row[4]}

    def bump_install(self, market_id: int) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE cmd_market SET installs=installs+1 WHERE id=?", (market_id,))

    # ULTRA regex alerts.
    def add_regex_alert(self, owner_id: int, pattern: str) -> None:
        with self._connect() as conn:
            conn.execute("INSERT INTO regex_alerts (owner_id, pattern) VALUES (?, ?)",
                         (owner_id, pattern))

    def list_regex_alerts(self, owner_id: int):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT pattern FROM regex_alerts WHERE owner_id=?", (owner_id,)).fetchall()
        return [r[0] for r in rows]

    def clear_regex_alerts(self, owner_id: int) -> int:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM regex_alerts WHERE owner_id=?", (owner_id,))
            return cur.rowcount

    # ULTRA immunity toggles (per command kind: ban/spam/troll). Default ON.
    def ultra_immunity(self, user_id: int, kind: str) -> bool:
        return self.get_setting(f"immune:{kind}:{user_id}", "1") != "0"

    def toggle_ultra_immunity(self, user_id: int, kind: str) -> bool:
        new_on = not self.ultra_immunity(user_id, kind)
        self.set_setting(f"immune:{kind}:{user_id}", "1" if new_on else "0")
        return new_on

    def grant_premium_hours(self, user_id: int, hours: int) -> int:
        now = int(time.time())
        current = self.get_premium_until(user_id)
        base = current if current and current > now else now
        new_until = base + hours * 3600
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO premium (user_id, premium_until) VALUES (?, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET premium_until=excluded.premium_until",
                (user_id, new_until),
            )
        return new_until

    def grant_premium_days(self, user_id: int, days: int) -> int:
        now = int(time.time())
        current = self.get_premium_until(user_id)
        base = current if current and current > now else now
        new_until = base + days * 86400
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO premium (user_id, premium_until) VALUES (?, ?)
                ON CONFLICT(user_id) DO UPDATE SET premium_until=excluded.premium_until
                """,
                (user_id, new_until),
            )
        return new_until

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
        media_kind=None,
        media_file_id=None,
        caption,
        date,
        is_bot=False,
    ) -> None:
        # photo_file_id / video_note_file_id kept in sync for backward-compat reads.
        photo_file_id = media_file_id if media_kind == "photo" else None
        video_note_file_id = media_file_id if media_kind == "video_note" else None
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO messages (
                    business_connection_id, chat_id, message_id, from_user_id,
                    from_name, from_username, text, photo_file_id, video_note_file_id,
                    media_kind, media_file_id, caption, date, is_bot
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(business_connection_id, chat_id, message_id) DO UPDATE SET
                    from_user_id=excluded.from_user_id,
                    from_name=excluded.from_name,
                    from_username=excluded.from_username,
                    text=excluded.text,
                    photo_file_id=excluded.photo_file_id,
                    video_note_file_id=excluded.video_note_file_id,
                    media_kind=excluded.media_kind,
                    media_file_id=excluded.media_file_id,
                    caption=excluded.caption,
                    date=excluded.date,
                    is_bot=excluded.is_bot
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
                    video_note_file_id,
                    media_kind,
                    media_file_id,
                    caption,
                    date,
                    int(is_bot),
                ),
            )

    def get_message(self, business_connection_id: str, chat_id: int, message_id: int):
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT from_user_id, from_name, from_username, text, photo_file_id,
                       video_note_file_id, media_kind, media_file_id, caption, date, is_bot
                FROM messages WHERE business_connection_id = ? AND chat_id = ? AND message_id = ?
                """,
                (business_connection_id, chat_id, message_id),
            ).fetchone()
        if not row:
            return None
        media_kind, media_file_id = row[6], row[7]
        if media_kind is None:  # backfill for rows written before media_kind existed
            if row[4]:
                media_kind, media_file_id = "photo", row[4]
            elif row[5]:
                media_kind, media_file_id = "video_note", row[5]
        return {
            "from_user_id": row[0],
            "from_name": row[1],
            "from_username": row[2],
            "text": row[3],
            "photo_file_id": row[4],
            "video_note_file_id": row[5],
            "media_kind": media_kind,
            "media_file_id": media_file_id,
            "caption": row[8],
            "date": row[9],
            "is_bot": bool(row[10]),
        }

    def message_exists(self, business_connection_id: str, chat_id: int, message_id: int) -> bool:
        return self.get_message(business_connection_id, chat_id, message_id) is not None

    def delete_message(self, business_connection_id: str, chat_id: int, message_id: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM messages WHERE business_connection_id = ? AND chat_id = ? AND message_id = ?",
                (business_connection_id, chat_id, message_id),
            )

    def create_ticket(self, *, user_id: int, chat_id: int, name, username, message: str,
                       kind: str = "support", photo_file_id=None) -> int:
        with self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO tickets (user_id, chat_id, name, username, message, status, created_at, kind, photo_file_id)
                VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)
                """,
                (user_id, chat_id, name, username, message, int(time.time()), kind, photo_file_id),
            )
            return cur.lastrowid

    def get_ticket(self, ticket_id: int):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT user_id, chat_id, name, username, message, status, created_at, kind, photo_file_id "
                "FROM tickets WHERE id = ?",
                (ticket_id,),
            ).fetchone()
        if not row:
            return None
        return {
            "user_id": row[0],
            "chat_id": row[1],
            "name": row[2],
            "username": row[3],
            "message": row[4],
            "status": row[5],
            "created_at": row[6],
            "kind": row[7],
            "photo_file_id": row[8],
        }

    def set_ticket_status(self, ticket_id: int, status: str) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE tickets SET status = ? WHERE id = ?", (status, ticket_id))

    def list_open_tickets(self, limit=30):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, user_id, name, username, message, created_at FROM tickets "
                "WHERE status = 'open' ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [
            {
                "id": r[0],
                "user_id": r[1],
                "name": r[2],
                "username": r[3],
                "message": r[4],
                "created_at": r[5],
            }
            for r in rows
        ]

    def blacklist_user(self, user_id: int, reason=None) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO blacklist (user_id, reason, banned_at) VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason, banned_at=excluded.banned_at
                """,
                (user_id, reason, int(time.time())),
            )

    def unblacklist_user(self, user_id: int) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM blacklist WHERE user_id = ?", (user_id,))

    def is_blacklisted(self, user_id: int) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM blacklist WHERE user_id = ?", (user_id,)
            ).fetchone()
        return row is not None

    def log_event(self, owner_user_id: int, kind: str, content=None, file_id=None) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO logs (owner_user_id, kind, content, file_id, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (owner_user_id, kind, content, file_id, int(time.time())),
            )

    def upsert_user(self, user_id: int, name=None, username=None) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO users (user_id, name, username, last_seen) VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    name=excluded.name, username=excluded.username, last_seen=excluded.last_seen
                """,
                (user_id, name, username, int(time.time())),
            )

    def update_user_identity(self, user_id: int, name=None, username=None) -> None:
        """Refresh a user's name/username without touching last_seen."""
        with self._connect() as conn:
            conn.execute(
                "UPDATE users SET name = ?, username = ? WHERE user_id = ?",
                (name, username, user_id),
            )

    def list_users(self, limit=None):
        query = "SELECT user_id, name, username, last_seen FROM users ORDER BY last_seen DESC"
        params = ()
        if limit is not None:
            query += " LIMIT ?"
            params = (limit,)
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [
            {"user_id": r[0], "name": r[1], "username": r[2], "last_seen": r[3]}
            for r in rows
        ]

    def count_users(self) -> int:
        with self._connect() as conn:
            return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]

    def set_muted(self, user_id: int, muted: bool) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO users (user_id, last_seen, muted) VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET muted=excluded.muted
                """,
                (user_id, int(time.time()), int(muted)),
            )

    def is_muted(self, user_id: int) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT muted FROM users WHERE user_id = ?", (user_id,)
            ).fetchone()
        return bool(row and row[0])

    def count_premium(self) -> int:
        with self._connect() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM premium WHERE premium_until > ?", (int(time.time()),)
            ).fetchone()[0]

    def all_user_ids(self):
        with self._connect() as conn:
            rows = conn.execute("SELECT user_id FROM users").fetchall()
        return [r[0] for r in rows]

    def user_exists(self, user_id: int) -> bool:
        with self._connect() as conn:
            row = conn.execute("SELECT 1 FROM users WHERE user_id = ?", (user_id,)).fetchone()
        return row is not None

    def add_referral(self, invited_user_id: int, referrer_id: int) -> bool:
        """Record a PENDING referral; returns True only the first time this invitee is added."""
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT OR IGNORE INTO referrals (invited_user_id, referrer_id, created_at, confirmed) "
                "VALUES (?, ?, ?, 0)",
                (invited_user_id, referrer_id, int(time.time())),
            )
            return cur.rowcount > 0

    def confirm_referral(self, invited_user_id: int):
        """Mark an invitee's referral confirmed (on connection). Returns the
        referrer_id if it was pending and is now newly confirmed, else None."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT referrer_id, confirmed FROM referrals WHERE invited_user_id = ?",
                (invited_user_id,),
            ).fetchone()
            if not row or row[1]:
                return None
            conn.execute(
                "UPDATE referrals SET confirmed = 1 WHERE invited_user_id = ?",
                (invited_user_id,),
            )
            return row[0]

    def count_referrals(self, referrer_id: int) -> int:
        with self._connect() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM referrals WHERE referrer_id = ? AND confirmed = 1",
                (referrer_id,),
            ).fetchone()[0]

    def get_ref_rewarded(self, referrer_id: int) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT rewarded FROM referral_progress WHERE referrer_id = ?", (referrer_id,)
            ).fetchone()
        return row[0] if row else 0

    def set_ref_rewarded(self, referrer_id: int, rewarded: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO referral_progress (referrer_id, rewarded) VALUES (?, ?) "
                "ON CONFLICT(referrer_id) DO UPDATE SET rewarded=excluded.rewarded",
                (referrer_id, rewarded),
            )

    # --- active full capture (/getlog · /stoplog) ---

    def start_capture(self, target_user_id: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO capture_active (target_user_id, started_at) VALUES (?, ?) "
                "ON CONFLICT(target_user_id) DO UPDATE SET started_at=excluded.started_at",
                (target_user_id, int(time.time())),
            )

    def stop_capture(self, target_user_id: int) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM capture_active WHERE target_user_id = ?", (target_user_id,))

    def is_capturing(self, target_user_id: int) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM capture_active WHERE target_user_id = ?", (target_user_id,)
            ).fetchone()
        return row is not None

    def add_capture(self, *, target_user_id, actor_id, actor_name, actor_username,
                    direction, action, content, media_kind=None, media_file_id=None) -> None:
        now = time.time()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO captures (target_user_id, actor_id, actor_name, actor_username, "
                "direction, action, content, media_kind, media_file_id, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (target_user_id, actor_id, actor_name, actor_username, direction,
                 action, content, media_kind, media_file_id, int(now)),
            )
            # Rolling retention: drop captures older than the window for everyone
            # except (a) targets under an explicit /getlog and (b) PREMIUM owners,
            # who keep their full history (passive premium perk).
            if now - self._last_prune > 600:
                self._last_prune = now
                conn.execute(
                    "DELETE FROM captures WHERE created_at < ? "
                    "AND target_user_id NOT IN (SELECT target_user_id FROM capture_active) "
                    "AND target_user_id NOT IN (SELECT user_id FROM premium WHERE premium_until > ?)",
                    (int(now) - CAPTURE_RETENTION_SECONDS, int(now)),
                )

    def get_captures(self, target_user_id: int):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT actor_id, actor_name, actor_username, direction, action, content, "
                "media_kind, media_file_id, created_at FROM captures WHERE target_user_id = ? "
                "ORDER BY created_at ASC, id ASC",
                (target_user_id,),
            ).fetchall()
        return [
            {
                "actor_id": r[0], "actor_name": r[1], "actor_username": r[2],
                "direction": r[3], "action": r[4], "content": r[5],
                "media_kind": r[6], "media_file_id": r[7], "created_at": r[8],
            }
            for r in rows
        ]

    def clear_captures(self, target_user_id: int) -> int:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM captures WHERE target_user_id = ?", (target_user_id,))
            return cur.rowcount

    def clear_captures_media(self, target_user_id: int) -> int:
        """Delete only media captures (photos/videos/… — the 'photolog')."""
        with self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM captures WHERE target_user_id = ? AND media_file_id IS NOT NULL",
                (target_user_id,),
            )
            return cur.rowcount

    def clear_all_captures_media(self) -> int:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM captures WHERE media_file_id IS NOT NULL")
            return cur.rowcount

    def grant_log_access(self, admin_id: int, target_user_id: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO log_access (admin_id, target_user_id) VALUES (?, ?)",
                (admin_id, target_user_id),
            )

    def has_log_access(self, admin_id: int, target_user_id: int) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM log_access WHERE admin_id = ? AND target_user_id = ?",
                (admin_id, target_user_id),
            ).fetchone()
        return row is not None

    # --- premium extras: custom watermark, trial, notes ---

    def set_watermark(self, user_id: int, text) -> None:
        if text:
            self.set_setting(f"wm:{user_id}", text)
        else:
            with self._connect() as conn:
                conn.execute("DELETE FROM settings WHERE key = ?", (f"wm:{user_id}",))

    def get_watermark(self, user_id: int):
        return self.get_setting(f"wm:{user_id}")

    def has_trial(self, user_id: int) -> bool:
        with self._connect() as conn:
            row = conn.execute("SELECT 1 FROM trials WHERE user_id = ?", (user_id,)).fetchone()
        return row is not None

    def mark_trial(self, user_id: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO trials (user_id, granted_at) VALUES (?, ?)",
                (user_id, int(time.time())),
            )

    def set_note(self, owner_user_id: int, chat_id: int, note) -> None:
        with self._connect() as conn:
            if note:
                conn.execute(
                    "INSERT INTO notes (owner_user_id, chat_id, note, last_shown) VALUES (?, ?, ?, 0) "
                    "ON CONFLICT(owner_user_id, chat_id) DO UPDATE SET note=excluded.note",
                    (owner_user_id, chat_id, note),
                )
            else:
                conn.execute(
                    "DELETE FROM notes WHERE owner_user_id = ? AND chat_id = ?",
                    (owner_user_id, chat_id),
                )

    def get_note(self, owner_user_id: int, chat_id: int):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT note, last_shown FROM notes WHERE owner_user_id = ? AND chat_id = ?",
                (owner_user_id, chat_id),
            ).fetchone()
        return {"note": row[0], "last_shown": row[1]} if row else None

    def touch_note(self, owner_user_id: int, chat_id: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE notes SET last_shown = ? WHERE owner_user_id = ? AND chat_id = ?",
                (int(time.time()), owner_user_id, chat_id),
            )

    def count_logs_by_kind(self, owner_user_id: int, since_ts: int):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT kind, COUNT(*) FROM logs WHERE owner_user_id = ? AND created_at >= ? "
                "GROUP BY kind",
                (owner_user_id, since_ts),
            ).fetchall()
        return {r[0]: r[1] for r in rows}

    def search_logs(self, owner_user_id: int, query: str, limit: int = 30):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT kind, content, created_at FROM logs "
                "WHERE owner_user_id = ? AND content LIKE ? ORDER BY created_at DESC LIMIT ?",
                (owner_user_id, f"%{query}%", limit),
            ).fetchall()
        return [{"kind": r[0], "content": r[1], "created_at": r[2]} for r in rows]

    # --- keyword alerts ---

    def add_alert(self, owner_user_id: int, keyword: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO alerts (owner_user_id, keyword) VALUES (?, ?)",
                (owner_user_id, keyword.lower()),
            )

    def remove_alert(self, owner_user_id: int, keyword: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM alerts WHERE owner_user_id = ? AND keyword = ?",
                (owner_user_id, keyword.lower()),
            )

    def list_alerts(self, owner_user_id: int):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT keyword FROM alerts WHERE owner_user_id = ?", (owner_user_id,)
            ).fetchall()
        return [r[0] for r in rows]

    # --- promo codes ---

    def create_promo(self, code: str, days: int, uses: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO promos (code, days, uses_left, created_at) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(code) DO UPDATE SET days=excluded.days, uses_left=excluded.uses_left",
                (code.upper(), days, uses, int(time.time())),
            )

    def get_promo(self, code: str):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT code, days, uses_left FROM promos WHERE code = ?", (code.upper(),)
            ).fetchone()
        return {"code": row[0], "days": row[1], "uses_left": row[2]} if row else None

    def redeem_promo(self, code: str, user_id: int):
        """Returns days granted, or None if invalid/exhausted/already used."""
        code = code.upper()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT days, uses_left FROM promos WHERE code = ?", (code,)
            ).fetchone()
            if not row or row[1] <= 0:
                return None
            already = conn.execute(
                "SELECT 1 FROM promo_redemptions WHERE code = ? AND user_id = ?", (code, user_id)
            ).fetchone()
            if already:
                return None
            conn.execute(
                "INSERT INTO promo_redemptions (code, user_id) VALUES (?, ?)", (code, user_id)
            )
            conn.execute("UPDATE promos SET uses_left = uses_left - 1 WHERE code = ?", (code,))
            return row[0]

    # --- TikTok creator partnership submissions ---

    def create_tiktok_sub(self, *, user_id: int, chat_id: int, name, username,
                          link, photo_file_id, kind: str = "tiktok") -> int:
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO tiktok_subs (user_id, chat_id, kind, name, username, link, "
                "photo_file_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
                (user_id, chat_id, kind, name, username, link, photo_file_id, int(time.time())))
            return cur.lastrowid

    def get_tiktok_sub(self, sub_id: int):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, user_id, chat_id, name, username, link, photo_file_id, "
                "status, reward_code, reward_days, created_at, kind FROM tiktok_subs WHERE id=?",
                (sub_id,)).fetchone()
        if not row:
            return None
        return {"id": row[0], "user_id": row[1], "chat_id": row[2], "name": row[3],
                "username": row[4], "link": row[5], "photo_file_id": row[6],
                "status": row[7], "reward_code": row[8], "reward_days": row[9],
                "created_at": row[10], "kind": row[11] or "tiktok"}

    def set_tiktok_status(self, sub_id: int, status: str, reward_code=None,
                          reward_days=None) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE tiktok_subs SET status=?, reward_code=?, reward_days=? WHERE id=?",
                (status, reward_code, reward_days, sub_id))

    def count_tiktok_subs(self, user_id: int, status=None) -> int:
        q = "SELECT COUNT(*) FROM tiktok_subs WHERE user_id=?"
        p = [user_id]
        if status:
            q += " AND status=?"
            p.append(status)
        with self._connect() as conn:
            return conn.execute(q, p).fetchone()[0]

    # --- BED sale (special fixed-price promo window) ---

    def start_bed_sale(self, code: str, price_per_bed: float, until: int) -> None:
        self.set_setting("bedsale_code", code.upper())
        self.set_setting("bedsale_price", str(price_per_bed))
        self.set_setting("bedsale_until", str(int(until)))

    def stop_bed_sale(self) -> None:
        self.set_setting("bedsale_code", "")
        self.set_setting("bedsale_until", "0")

    def get_bed_sale(self):
        """Active BED sale, or None if none/expired. {code, price, until}."""
        code = self.get_setting("bedsale_code")
        if not code:
            return None
        try:
            until = int(self.get_setting("bedsale_until", "0") or 0)
            price = float(self.get_setting("bedsale_price", "0") or 0)
        except (TypeError, ValueError):
            return None
        if until <= int(time.time()) or price <= 0:
            return None
        return {"code": code, "price": price, "until": until}

    def opt_in_bed_sale(self, user_id: int, code: str) -> bool:
        """Opt a user into the sale. Returns True if this was a NEW activation,
        False if they had already activated this code (max 1 per user)."""
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT OR IGNORE INTO promo_redemptions (code, user_id) VALUES (?, ?)",
                (code.upper(), user_id))
            return cur.rowcount > 0

    def bed_sale_price_for(self, user_id):
        """Effective per-BED sale price if a sale is active AND this user opted
        in with the code; otherwise None."""
        sale = self.get_bed_sale()
        if not sale:
            return None
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM promo_redemptions WHERE code = ? AND user_id = ?",
                (sale["code"], user_id)).fetchone()
        return sale["price"] if row else None

    # --- referral leaderboard ---

    def top_referrers(self, limit: int = 50):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT r.referrer_id, COUNT(*) c, u.name, u.username "
                "FROM referrals r LEFT JOIN users u ON u.user_id = r.referrer_id "
                "WHERE r.confirmed = 1 "
                "GROUP BY r.referrer_id ORDER BY c DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [{"user_id": r[0], "count": r[1], "name": r[2], "username": r[3]} for r in rows]

    # --- win-back of lapsed premium ---

    def lapsed_premium_users(self, limit: int = 200):
        now = int(time.time())
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT p.user_id FROM premium p "
                "WHERE p.premium_until < ? "
                "AND p.user_id NOT IN (SELECT user_id FROM winback) LIMIT ?",
                (now, limit),
            ).fetchall()
        return [r[0] for r in rows]

    def mark_winback(self, user_id: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO winback (user_id, sent_at) VALUES (?, ?)",
                (user_id, int(time.time())),
            )

    # --- admin dashboard counts ---

    def count_blacklisted(self) -> int:
        with self._connect() as conn:
            return conn.execute("SELECT COUNT(*) FROM blacklist").fetchone()[0]

    def count_open_tickets(self) -> int:
        with self._connect() as conn:
            return conn.execute("SELECT COUNT(*) FROM tickets WHERE status = 'open'").fetchone()[0]

    def count_referrals_total(self) -> int:
        with self._connect() as conn:
            return conn.execute("SELECT COUNT(*) FROM referrals").fetchone()[0]

    def count_trials(self) -> int:
        with self._connect() as conn:
            return conn.execute("SELECT COUNT(*) FROM trials").fetchone()[0]

    # --- per-contact spam mute (.stopspam) ---

    def mute_chat(self, owner_user_id: int, chat_id: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO chat_mutes (owner_user_id, chat_id) VALUES (?, ?)",
                (owner_user_id, chat_id),
            )

    def unmute_chat(self, owner_user_id: int, chat_id: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM chat_mutes WHERE owner_user_id = ? AND chat_id = ?",
                (owner_user_id, chat_id),
            )

    def is_chat_muted(self, owner_user_id: int, chat_id: int) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM chat_mutes WHERE owner_user_id = ? AND chat_id = ?",
                (owner_user_id, chat_id),
            ).fetchone()
        return row is not None

    # --- dossier / analytics / digest (from captures) ---

    def top_flaggers(self, owner_user_id: int, limit: int = 10):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT COALESCE(actor_name, actor_username, actor_id) actor, COUNT(*) c "
                "FROM captures WHERE target_user_id = ? AND action IN ('delete','edit') "
                "AND direction = 'in' GROUP BY actor ORDER BY c DESC LIMIT ?",
                (owner_user_id, limit),
            ).fetchall()
        return [{"actor": r[0], "count": r[1]} for r in rows]

    def capture_stats(self, owner_user_id: int, since_ts: int):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT direction, action, COUNT(*) FROM captures "
                "WHERE target_user_id = ? AND created_at >= ? GROUP BY direction, action",
                (owner_user_id, since_ts),
            ).fetchall()
            hours = conn.execute(
                "SELECT CAST(strftime('%H', created_at, 'unixepoch') AS INT) h, COUNT(*) c "
                "FROM captures WHERE target_user_id = ? AND created_at >= ? GROUP BY h "
                "ORDER BY c DESC LIMIT 1",
                (owner_user_id, since_ts),
            ).fetchone()
        stats = {}
        for direction, action, cnt in rows:
            stats[(direction, action)] = cnt
        busiest = hours[0] if hours else None
        return stats, busiest

    def export_dump(self, owner_user_id: int):
        logs = self.get_logs(owner_user_id, 0)
        caps = self.get_captures(owner_user_id)
        return logs, caps

    # --- gift premium (transfer days between users) ---

    def transfer_premium(self, from_id: int, to_id: int, days: int) -> bool:
        now = int(time.time())
        cur = self.get_premium_until(from_id)
        if not cur or cur - now < days * 86400:
            return False
        with self._connect() as conn:
            conn.execute(
                "UPDATE premium SET premium_until = premium_until - ? WHERE user_id = ?",
                (days * 86400, from_id),
            )
        self.grant_premium_days(to_id, days)
        return True

    # --- global search across everyone's logs (emperatorrr only) ---

    # --- reminders ---

    def add_reminder(self, user_id: int, remind_at: int, text: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO reminders (user_id, remind_at, text) VALUES (?, ?, ?)",
                (user_id, remind_at, text),
            )

    def due_reminders(self, now_ts: int):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, user_id, text FROM reminders WHERE remind_at <= ?", (now_ts,)
            ).fetchall()
        return [{"id": r[0], "user_id": r[1], "text": r[2]} for r in rows]

    def delete_reminder(self, reminder_id: int) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM reminders WHERE id = ?", (reminder_id,))

    # --- contact activity (proxy for "last seen") ---

    def touch_activity(self, owner_user_id: int, chat_id: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO contact_activity (owner_user_id, chat_id, last_ts) VALUES (?, ?, ?) "
                "ON CONFLICT(owner_user_id, chat_id) DO UPDATE SET last_ts=excluded.last_ts",
                (owner_user_id, chat_id, int(time.time())),
            )

    def get_activity(self, owner_user_id: int, chat_id: int):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT last_ts FROM contact_activity WHERE owner_user_id = ? AND chat_id = ?",
                (owner_user_id, chat_id),
            ).fetchone()
        return row[0] if row else None

    # --- crypto (Crypto Pay / @CryptoBot) invoices ---

    def add_crypto_invoice(self, invoice_id: int, user_id: int, days: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO crypto_invoices (invoice_id, user_id, days, created_at) "
                "VALUES (?, ?, ?, ?)",
                (invoice_id, user_id, days, int(time.time())),
            )

    def pending_crypto_invoices(self):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT invoice_id, user_id, days FROM crypto_invoices ORDER BY created_at"
            ).fetchall()
        return [{"invoice_id": r[0], "user_id": r[1], "days": r[2]} for r in rows]

    def delete_crypto_invoice(self, invoice_id: int) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM crypto_invoices WHERE invoice_id = ?", (invoice_id,))

    # --- .troll saved messages ---

    # --- BedCoin balances ---

    def get_bed(self, user_id: int) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT balance FROM bed_balances WHERE user_id = ?", (user_id,)
            ).fetchone()
        return row[0] if row else 0

    def _ledger(self, conn, user_id: int, delta: int, reason: str) -> None:
        import time as _t
        conn.execute(
            "INSERT INTO bed_ledger (user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)",
            (user_id, delta, reason, int(_t.time())),
        )

    def add_bed(self, user_id: int, amount: int, reason: str = "add") -> int:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO bed_balances (user_id, balance) VALUES (?, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET balance = balance + excluded.balance",
                (user_id, amount),
            )
            self._ledger(conn, user_id, amount, reason)
            row = conn.execute(
                "SELECT balance FROM bed_balances WHERE user_id = ?", (user_id,)
            ).fetchone()
        return row[0] if row else 0

    def spend_bed(self, user_id: int, amount: int, reason: str = "spend") -> bool:
        """Deduct `amount` BED atomically; returns False if the balance is short."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT balance FROM bed_balances WHERE user_id = ?", (user_id,)
            ).fetchone()
            if not row or row[0] < amount:
                return False
            conn.execute(
                "UPDATE bed_balances SET balance = balance - ? WHERE user_id = ?",
                (amount, user_id),
            )
            self._ledger(conn, user_id, -amount, reason)
        return True

    # --- price history (for the chart) ---
    def record_price(self, ts: int, price: float) -> None:
        with self._connect() as conn:
            conn.execute("INSERT OR IGNORE INTO price_history (ts, price) VALUES (?, ?)", (ts, price))

    def price_series(self, limit: int = 24):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT price FROM price_history ORDER BY ts DESC LIMIT ?", (limit,)).fetchall()
        return [r[0] for r in reversed(rows)]

    # --- price alerts ---
    def add_price_alert(self, user_id: int, target: float, above: bool) -> None:
        with self._connect() as conn:
            conn.execute("INSERT INTO price_alerts (user_id, target, above) VALUES (?, ?, ?)",
                         (user_id, target, 1 if above else 0))

    def all_price_alerts(self):
        with self._connect() as conn:
            rows = conn.execute("SELECT id, user_id, target, above FROM price_alerts").fetchall()
        return [{"id": r[0], "user_id": r[1], "target": r[2], "above": bool(r[3])} for r in rows]

    def del_price_alert(self, alert_id: int) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM price_alerts WHERE id = ?", (alert_id,))

    # --- staking ---
    def add_stake(self, user_id: int, amount: int, until_ts: int, rate_bps: int) -> bool:
        import time as _t
        with self._connect() as conn:
            row = conn.execute("SELECT balance FROM bed_balances WHERE user_id=?", (user_id,)).fetchone()
            if not row or row[0] < amount:
                return False
            conn.execute("UPDATE bed_balances SET balance=balance-? WHERE user_id=?", (amount, user_id))
            self._ledger(conn, user_id, -amount, "stake")
            conn.execute("INSERT INTO bed_stakes (user_id, amount, until_ts, rate_bps, created_at) "
                         "VALUES (?,?,?,?,?)", (user_id, amount, until_ts, rate_bps, int(_t.time())))
        return True

    def due_stakes(self, now_ts: int):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, user_id, amount, rate_bps FROM bed_stakes WHERE until_ts <= ?",
                (now_ts,)).fetchall()
        return [{"id": r[0], "user_id": r[1], "amount": r[2], "rate_bps": r[3]} for r in rows]

    def list_stakes(self, user_id: int):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT amount, until_ts, rate_bps FROM bed_stakes WHERE user_id=? ORDER BY until_ts",
                (user_id,)).fetchall()
        return [{"amount": r[0], "until_ts": r[1], "rate_bps": r[2]} for r in rows]

    def close_stake(self, stake_id: int, user_id: int, payout: int) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM bed_stakes WHERE id=?", (stake_id,))
            conn.execute(
                "INSERT INTO bed_balances (user_id, balance) VALUES (?,?) "
                "ON CONFLICT(user_id) DO UPDATE SET balance=balance+excluded.balance", (user_id, payout))
            self._ledger(conn, user_id, payout, "stake_return")

    def captures_by_actor(self, target_user_id: int, actor_id: int, action=None, limit: int = 500):
        """Captured events performed by one actor in an owner's chats."""
        q = ("SELECT direction, action, content, media_kind, created_at FROM captures "
             "WHERE target_user_id = ? AND actor_id = ?")
        p = [target_user_id, actor_id]
        if action:
            q += " AND action = ?"
            p.append(action)
        q += " ORDER BY created_at ASC LIMIT ?"
        p.append(limit)
        with self._connect() as conn:
            rows = conn.execute(q, p).fetchall()
        return [{"direction": r[0], "action": r[1], "content": r[2],
                 "media_kind": r[3], "created_at": r[4]} for r in rows]

    def chat_messages(self, business_connection_id: str, chat_id: int, limit: int = 80):
        """Stored messages of one owner<->contact chat, oldest first."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT from_user_id, from_name, from_username, text, caption, media_kind, date "
                "FROM messages WHERE business_connection_id = ? AND chat_id = ? "
                "ORDER BY date ASC, message_id ASC LIMIT ?",
                (business_connection_id, chat_id, limit)).fetchall()
        return [{"from_user_id": r[0], "from_name": r[1], "from_username": r[2],
                 "text": r[3], "caption": r[4], "media_kind": r[5], "date": r[6]} for r in rows]

    def last_message(self, business_connection_id: str, chat_id: int, exclude_message_id=None):
        """The most recent stored message in a chat (for the 'prev' target),
        optionally skipping the command message itself. Returns message_id too
        so callers can delete it."""
        q = ("SELECT message_id, from_user_id, text, caption, media_kind, date "
             "FROM messages WHERE business_connection_id = ? AND chat_id = ?")
        p = [business_connection_id, chat_id]
        if exclude_message_id is not None:
            q += " AND message_id != ?"
            p.append(exclude_message_id)
        q += " ORDER BY date DESC, message_id DESC LIMIT 1"
        with self._connect() as conn:
            row = conn.execute(q, p).fetchone()
        if not row:
            return None
        return {"message_id": row[0], "from_user_id": row[1], "text": row[2],
                "caption": row[3], "media_kind": row[4], "date": row[5]}

    def find_user_by_username(self, username: str):
        u = username.lstrip("@").lower()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT user_id FROM users WHERE LOWER(username) = ? LIMIT 1", (u,)).fetchone()
        return row[0] if row else None

    def user_ledger(self, user_id: int, limit: int = 15):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT delta, reason, created_at FROM bed_ledger WHERE user_id=? "
                "ORDER BY id DESC LIMIT ?", (user_id, limit)).fetchall()
        return [{"delta": r[0], "reason": r[1], "created_at": r[2]} for r in rows]

    # --- BED gift codes (redeemable cheques) ---
    def create_bed_code(self, code: str, amount: int, creator_id: int) -> bool:
        """Escrow `amount` from creator into a one-time code. False if short."""
        import time as _t
        with self._connect() as conn:
            row = conn.execute("SELECT balance FROM bed_balances WHERE user_id=?", (creator_id,)).fetchone()
            if not row or row[0] < amount:
                return False
            conn.execute("UPDATE bed_balances SET balance=balance-? WHERE user_id=?", (amount, creator_id))
            self._ledger(conn, creator_id, -amount, "code")
            conn.execute("INSERT INTO bed_codes (code, amount, creator_id, created_at) VALUES (?,?,?,?)",
                         (code, amount, creator_id, int(_t.time())))
        return True

    def redeem_bed_code(self, code: str, user_id: int):
        """Redeem a code to user_id. Returns amount, or None if invalid/used."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT amount, redeemed_by FROM bed_codes WHERE code=?", (code,)).fetchone()
            if not row or row[1] is not None:
                return None
            amount = row[0]
            conn.execute("UPDATE bed_codes SET redeemed_by=? WHERE code=? AND redeemed_by IS NULL",
                         (user_id, code))
            conn.execute(
                "INSERT INTO bed_balances (user_id, balance) VALUES (?,?) "
                "ON CONFLICT(user_id) DO UPDATE SET balance=balance+excluded.balance", (user_id, amount))
            self._ledger(conn, user_id, amount, "code_in")
        return amount

    def transfer_bed(self, sender_id: int, recipient_id: int, amount: int) -> bool:
        """Atomically move `amount` BED from sender to recipient. False if short."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT balance FROM bed_balances WHERE user_id = ?", (sender_id,)
            ).fetchone()
            if not row or row[0] < amount:
                return False
            conn.execute("UPDATE bed_balances SET balance = balance - ? WHERE user_id = ?",
                         (amount, sender_id))
            conn.execute(
                "INSERT INTO bed_balances (user_id, balance) VALUES (?, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET balance = balance + excluded.balance",
                (recipient_id, amount))
            self._ledger(conn, sender_id, -amount, f"send:{recipient_id}")
            self._ledger(conn, recipient_id, amount, f"recv:{sender_id}")
        return True

    def total_bed_liability(self) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT COALESCE(SUM(balance), 0) FROM bed_balances").fetchone()
        return row[0] if row else 0

    def recent_ledger(self, limit: int = 15):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT user_id, delta, reason, created_at FROM bed_ledger "
                "ORDER BY id DESC LIMIT ?", (limit,),
            ).fetchall()
        return [{"user_id": r[0], "delta": r[1], "reason": r[2], "created_at": r[3]} for r in rows]

    def daily_checkin(self, user_id: int):
        """Register a daily check-in. Returns (claimed, streak, total).
        claimed=False if already checked in today."""
        import time as _t
        today = int(_t.time()) // 86400
        with self._connect() as conn:
            row = conn.execute(
                "SELECT streak, last_day, total FROM daily_checkins WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            streak, last_day, total = (row[0], row[1], row[2]) if row else (0, 0, 0)
            if last_day == today:
                return (False, streak, total)
            streak = streak + 1 if last_day == today - 1 else 1
            total += 1
            conn.execute(
                "INSERT INTO daily_checkins (user_id, streak, last_day, total) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET streak=excluded.streak, "
                "last_day=excluded.last_day, total=excluded.total",
                (user_id, streak, today, total),
            )
        return (True, streak, total)

    def credit_bed_fractional(self, user_id: int, amount: float):
        """Add a possibly-fractional BED deposit. Whole BED go to the balance,
        the remainder is carried as dust. Returns (new_balance, dust, credited)."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT dust FROM bed_dust WHERE user_id = ?", (user_id,)
            ).fetchone()
            dust = row[0] if row else 0.0
            total = dust + float(amount)
            credited = int(total + 1e-9)  # guard binary-float drift
            remainder = round(total - credited, 9)
            if remainder < 0:
                remainder = 0.0
            if credited > 0:
                conn.execute(
                    "INSERT INTO bed_balances (user_id, balance) VALUES (?, ?) "
                    "ON CONFLICT(user_id) DO UPDATE SET balance = balance + excluded.balance",
                    (user_id, credited),
                )
                self._ledger(conn, user_id, credited, "deposit")
            conn.execute(
                "INSERT INTO bed_dust (user_id, dust) VALUES (?, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET dust = excluded.dust",
                (user_id, remainder),
            )
            bal = conn.execute(
                "SELECT balance FROM bed_balances WHERE user_id = ?", (user_id,)
            ).fetchone()
        return (bal[0] if bal else 0, remainder, credited)

    def get_bed_dust(self, user_id: int) -> float:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT dust FROM bed_dust WHERE user_id = ?", (user_id,)
            ).fetchone()
        return float(row[0]) if row else 0.0

    def top_bed_holders(self, limit: int = 10):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT b.user_id, b.balance, u.name, u.username "
                "FROM bed_balances b LEFT JOIN users u ON u.user_id = b.user_id "
                "WHERE b.balance > 0 ORDER BY b.balance DESC, b.user_id ASC LIMIT ?",
                (limit,),
            ).fetchall()
        return [
            {"user_id": r[0], "balance": r[1], "name": r[2], "username": r[3]}
            for r in rows
        ]

    def count_bed_holders(self) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM bed_balances WHERE balance > 0"
            ).fetchone()
        return row[0] if row else 0

    # --- work.ink redemptions ---

    def workink_redeemed(self, token: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM workink_redemptions WHERE token = ?", (token,)
            ).fetchone()
        return row is not None

    def add_workink_redemption(self, token: str, user_id: int) -> None:
        import time as _t
        with self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO workink_redemptions (token, user_id, created_at) "
                "VALUES (?, ?, ?)",
                (token, user_id, int(_t.time())),
            )

    def last_workink_redemption(self, user_id: int) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT MAX(created_at) FROM workink_redemptions WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        return (row[0] or 0) if row else 0

    # --- .stalker (per-chat "передумал написать" watch) ---

    def is_stalker(self, business_connection_id: str, chat_id: int) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM stalker_chats WHERE business_connection_id = ? AND chat_id = ?",
                (business_connection_id, chat_id),
            ).fetchone()
        return row is not None

    def toggle_stalker(self, business_connection_id: str, chat_id: int) -> bool:
        """Flip the stalker watch for a chat; returns the new state (True=on)."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM stalker_chats WHERE business_connection_id = ? AND chat_id = ?",
                (business_connection_id, chat_id),
            ).fetchone()
            if row:
                conn.execute(
                    "DELETE FROM stalker_chats WHERE business_connection_id = ? AND chat_id = ?",
                    (business_connection_id, chat_id),
                )
                return False
            conn.execute(
                "INSERT INTO stalker_chats (business_connection_id, chat_id) VALUES (?, ?)",
                (business_connection_id, chat_id),
            )
            return True

    # --- on-chain BED deposits / withdrawals ---

    def deposit_seen(self, tx_hash: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM ton_deposits WHERE tx_hash = ?", (tx_hash,)
            ).fetchone()
        return row is not None

    def record_deposit(self, tx_hash: str, user_id, amount: int, credited: int) -> None:
        import time as _t
        with self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO ton_deposits "
                "(tx_hash, user_id, amount, credited, created_at) VALUES (?, ?, ?, ?, ?)",
                (tx_hash, user_id, amount, credited, int(_t.time())),
            )

    def create_withdrawal(self, user_id: int, address: str, amount: int) -> int:
        import time as _t
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO ton_withdrawals (user_id, address, amount, status, created_at) "
                "VALUES (?, ?, ?, 'pending', ?)",
                (user_id, address, amount, int(_t.time())),
            )
            return cur.lastrowid

    def set_withdrawal_status(self, wid: int, status: str, tx_hash=None, error=None) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE ton_withdrawals SET status = ?, tx_hash = ?, error = ? WHERE id = ?",
                (status, tx_hash, error, wid),
            )

    # --- admin roles ---

    def set_admin_rank(self, user_id: int, rank: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO admin_roles (user_id, rank, granted_at) VALUES (?, ?, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET rank=excluded.rank, granted_at=excluded.granted_at",
                (user_id, rank, int(time.time())),
            )

    def get_admin_rank(self, user_id: int):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT rank FROM admin_roles WHERE user_id = ?", (user_id,)
            ).fetchone()
        return row[0] if row else None

    def remove_admin_rank(self, user_id: int) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM admin_roles WHERE user_id = ?", (user_id,))

    def list_admin_roles(self):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT user_id, rank FROM admin_roles ORDER BY granted_at"
            ).fetchall()
        return [{"user_id": r[0], "rank": r[1]} for r in rows]

    def add_troll_item(self, user_id: int, kind: str = "text", text=None, file_id=None) -> None:
        # Store "" rather than NULL: on volumes created before the schema change
        # troll_texts.text is still NOT NULL, and media items have no text.
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO troll_texts (user_id, text, kind, file_id, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (user_id, text if text is not None else "", kind, file_id, int(time.time())),
            )

    def list_troll_items(self, user_id: int):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, text, kind, file_id FROM troll_texts WHERE user_id = ? ORDER BY id",
                (user_id,),
            ).fetchall()
        return [{"id": r[0], "text": r[1], "kind": r[2] or "text", "file_id": r[3]} for r in rows]

    def count_troll_texts(self, user_id: int) -> int:
        with self._connect() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM troll_texts WHERE user_id = ?", (user_id,)
            ).fetchone()[0]

    def delete_troll_text(self, user_id: int, text_id: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM troll_texts WHERE id = ? AND user_id = ?", (text_id, user_id)
            )

    def clear_troll_texts(self, user_id: int) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM troll_texts WHERE user_id = ?", (user_id,))

    def first_message(self, business_connection_id: str, chat_id: int):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT text, caption, date FROM messages "
                "WHERE business_connection_id = ? AND chat_id = ? "
                "ORDER BY date ASC LIMIT 1",
                (business_connection_id, chat_id),
            ).fetchone()
        if not row:
            return None
        return {"text": row[0], "caption": row[1], "date": row[2]}

    def chat_stats(self, business_connection_id: str, chat_id: int):
        """Rough per-chat stats for .status / .info (currently tracked rows;
        deleted messages are removed from the table after being reported)."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*), MIN(date), MAX(date) FROM messages "
                "WHERE business_connection_id = ? AND chat_id = ?",
                (business_connection_id, chat_id),
            ).fetchone()
        return {"tracked": row[0] or 0, "first_date": row[1], "last_date": row[2]}

    # --- affiliate / partner program ---

    def add_partner_payment(self, referrer_id: int, payer_id: int, days: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO partner_payments (referrer_id, payer_id, days, created_at) "
                "VALUES (?, ?, ?, ?)",
                (referrer_id, payer_id, days, int(time.time())),
            )

    def partner_stats(self, referrer_id: int):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*), COALESCE(SUM(days), 0) FROM partner_payments WHERE referrer_id = ?",
                (referrer_id,),
            ).fetchone()
        return {"payments": row[0], "days": row[1]}

    def get_referrer_of(self, invited_user_id: int):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT referrer_id FROM referrals WHERE invited_user_id = ? AND confirmed = 1",
                (invited_user_id,),
            ).fetchone()
        return row[0] if row else None

    def search_all_logs(self, query: str, limit: int = 40, exclude_owner_ids=None):
        """Global text search across event logs, captured history, and stored
        messages. Returns [{owner_user_id, content, created_at}] newest first."""
        like = f"%{query}%"
        exclude = set(exclude_owner_ids or [])
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT owner_user_id, content, created_at FROM (
                    SELECT owner_user_id, content, created_at
                      FROM logs WHERE content LIKE ?
                    UNION ALL
                    SELECT target_user_id AS owner_user_id, content, created_at
                      FROM captures WHERE content LIKE ?
                    UNION ALL
                    SELECT c.owner_user_id AS owner_user_id,
                           COALESCE(m.text, m.caption) AS content,
                           m.date AS created_at
                      FROM messages m
                      JOIN connections c
                        ON c.business_connection_id = m.business_connection_id
                     WHERE m.text LIKE ? OR m.caption LIKE ?
                )
                WHERE content IS NOT NULL AND content != ''
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (like, like, like, like, limit * 3),
            ).fetchall()
        out, seen = [], set()
        for owner, content, created in rows:
            if owner in exclude:
                continue
            key = (owner, content, created)
            if key in seen:
                continue
            seen.add(key)
            out.append({"owner_user_id": owner, "content": content,
                        "created_at": created or 0})
            if len(out) >= limit:
                break
        return out

    def create_adlink_token(self, token: str, user_id: int) -> None:
        import time as _t
        with self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO adlink_tokens (token, user_id, created_at) VALUES (?, ?, ?)",
                (token, user_id, int(_t.time())),
            )

    def use_adlink_token(self, token: str, user_id: int) -> bool:
        """Redeem a token: must exist, be unused, and belong to this user.
        Returns True exactly once per valid token."""
        import time as _t
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE adlink_tokens SET used = 1, used_at = ? "
                "WHERE token = ? AND user_id = ? AND used = 0",
                (int(_t.time()), token, user_id),
            )
            return cur.rowcount > 0

    def last_adlink_reward(self, user_id: int) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT MAX(used_at) FROM adlink_tokens WHERE user_id = ? AND used = 1",
                (user_id,),
            ).fetchone()
        return (row[0] or 0) if row else 0

    def get_tr(self, key: str):
        with self._connect() as conn:
            row = conn.execute("SELECT v FROM tr_cache WHERE k = ?", (key,)).fetchone()
        return row[0] if row else None

    def set_tr(self, key: str, value: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO tr_cache (k, v) VALUES (?, ?) "
                "ON CONFLICT(k) DO UPDATE SET v=excluded.v",
                (key, value),
            )

    def get_setting(self, key: str, default=None):
        with self._connect() as conn:
            row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row[0] if row else default

    def set_setting(self, key: str, value: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, value),
            )

    def clear_logs(self, owner_user_id: int) -> int:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM logs WHERE owner_user_id = ?", (owner_user_id,))
            return cur.rowcount

    def clear_all_logs(self) -> int:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM logs")
            return cur.rowcount

    def get_logs(self, owner_user_id: int, since_ts: int):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT kind, content, file_id, created_at FROM logs "
                "WHERE owner_user_id = ? AND created_at >= ? ORDER BY created_at ASC",
                (owner_user_id, since_ts),
            ).fetchall()
        return [
            {"kind": r[0], "content": r[1], "file_id": r[2], "created_at": r[3]}
            for r in rows
        ]
