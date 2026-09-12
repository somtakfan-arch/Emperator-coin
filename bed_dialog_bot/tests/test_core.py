"""Unit tests for pure logic (no network, no Telegram).

Run: BOT_TOKEN=x python -m pytest bed_dialog_bot/tests -q
"""
import os
import tempfile

os.environ.setdefault("BOT_TOKEN", "test")
os.environ.setdefault("TON_TREASURY_MNEMONIC", "")
os.environ.setdefault("TON_API_KEY", "")

from bed_dialog_bot import bedcoin, commands, config, workink  # noqa: E402
from bed_dialog_bot.storage import Storage  # noqa: E402


def _db():
    return Storage(os.path.join(tempfile.mkdtemp(), "t.db"))


# --- BedCoin pricing / ranks ---

def test_price_rises_with_demand():
    s = _db()
    p0 = bedcoin.price_stars(s)
    bedcoin.record_sale(s, 3000)
    assert bedcoin.price_stars(s) > p0


def test_cost_and_ranks():
    s = _db()
    assert bedcoin.cost_stars(s, 10) >= 1
    assert bedcoin.holder_rank(0) == "👻 Нищий"
    assert bedcoin.holder_rank(1000).startswith("🏰")
    assert bedcoin.next_rank(1000) is None
    assert bedcoin.next_rank(0)[1] == 1


# --- balances / ledger ---

def test_bed_balance_and_ledger():
    s = _db()
    assert s.add_bed(5, 10, reason="buy") == 10
    assert s.spend_bed(5, 4, reason="power") is True
    assert s.get_bed(5) == 6
    assert s.spend_bed(5, 99) is False
    assert s.total_bed_liability() == 6
    led = s.recent_ledger(10)
    assert any(e["reason"] == "buy" and e["delta"] == 10 for e in led)
    assert any(e["reason"] == "power" and e["delta"] == -4 for e in led)


def test_fractional_deposit_no_loss():
    s = _db()
    assert s.credit_bed_fractional(9, 0.5) == (0, 0.5, 0)
    bal, dust, credited = s.credit_bed_fractional(9, 0.7)
    assert bal == 1 and credited == 1 and abs(dust - 0.2) < 1e-9


# --- daily gamification ---

def test_daily_checkin_streak():
    s = _db()
    claimed, streak, total = s.daily_checkin(1)
    assert claimed and streak == 1 and total == 1
    claimed2, streak2, _ = s.daily_checkin(1)
    assert claimed2 is False and streak2 == 1  # same day, no double claim


# --- kawaii / styles ---

def test_kawaii_changes_text():
    out = commands.kawaii_style("привет как дела")
    assert isinstance(out, str) and len(out) >= len("привет")


def test_style_skips_emoji():
    out = commands.apply_styles("hi 😀 there", ["bold"])
    assert "😀" in out
    assert commands.apply_styles("😀😀", ["strike"]) == "😀😀"  # emoji-only unchanged


# --- global search across tables ---

def test_search_all_logs():
    s = _db()
    import time
    now = int(time.time())
    with s._connect() as c:
        c.execute("INSERT INTO captures (target_user_id,content,created_at) VALUES (?,?,?)",
                  (2, "секрет один", now))
        c.execute("INSERT INTO connections (business_connection_id,owner_user_id,owner_chat_id,updated_at) VALUES (?,?,?,?)",
                  ("b1", 3, 3, now))
        c.execute("INSERT INTO messages (business_connection_id,chat_id,message_id,text,date) VALUES (?,?,?,?,?)",
                  ("b1", 4, 1, "секрет два", now))
    res = s.search_all_logs("секрет")
    assert len(res) == 2


# --- workink matching ---

def test_workink_disabled_by_default():
    assert workink.enabled() is False


# --- stalker toggle ---

def test_stalker_toggle():
    s = _db()
    assert s.is_stalker("b", 1) is False
    assert s.toggle_stalker("b", 1) is True
    assert s.is_stalker("b", 1) is True
    assert s.toggle_stalker("b", 1) is False
