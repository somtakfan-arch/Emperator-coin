"""Тесты эвристик и хранилища. Запуск: python -m unittest discover bot/tests"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from protector.config import coerce_setting  # noqa: E402
from protector.heuristics import (  # noqa: E402
    MessageFacts,
    analyze,
    caps_ratio,
    looks_like_raid_name,
    normalize,
)
from protector.runtime import RepeatTracker, Runtime, SlidingWindow  # noqa: E402
from protector.storage import Storage  # noqa: E402


class NormalizeTests(unittest.TestCase):
    def test_strips_invisible_characters(self):
        self.assertEqual(normalize("сп​а‍м"), "спам")

    def test_folds_latin_homoglyphs(self):
        self.assertEqual(normalize("PORNO"), normalize("PОRNО"))

    def test_caps_ratio_ignores_short_text(self):
        self.assertEqual(caps_ratio("ЧТО"), 0.0)
        self.assertGreater(caps_ratio("КУПИ КРИПТУ ПРЯМО СЕЙЧАС"), 0.9)


class AnalyzeTests(unittest.TestCase):
    def test_normal_message_is_clean(self):
        verdict = analyze(MessageFacts(text="Привет, ребят! Как дела?", is_new_user=True))
        self.assertEqual(verdict.score, 0, verdict.summary())

    def test_invite_link_from_newcomer_is_spam(self):
        verdict = analyze(MessageFacts(text="залетай https://t.me/+abcdef", is_new_user=True))
        self.assertGreaterEqual(verdict.score, 4)

    def test_trusted_user_link_is_tolerated(self):
        verdict = analyze(MessageFacts(text="вот статья https://example.com/a", is_new_user=False))
        self.assertEqual(verdict.score, 0, verdict.summary())

    def test_scam_phrases_with_hidden_characters(self):
        text = "Заработок​ от 5000р в день, пиши в лс @moneyguru2000"
        verdict = analyze(MessageFacts(text=text, is_new_user=True))
        self.assertGreaterEqual(verdict.score, 4)

    def test_mass_mentions_flagged_even_for_old_members(self):
        text = " ".join(f"@user{i}0000" for i in range(6))
        verdict = analyze(MessageFacts(text=text, is_new_user=False))
        self.assertGreaterEqual(verdict.score, 3)

    def test_forward_from_channel_by_newcomer(self):
        verdict = analyze(
            MessageFacts(text="", is_forward=True, forward_from_chat=True, is_new_user=True)
        )
        self.assertGreaterEqual(verdict.score, 3)

    def test_links_allowed_for_new_users_when_disabled(self):
        facts = MessageFacts(text="смотри https://example.com", is_new_user=True)
        strict = analyze(facts, block_links_for_new=True)
        relaxed = analyze(facts, block_links_for_new=False)
        self.assertGreater(strict.score, relaxed.score)


class RaidNameTests(unittest.TestCase):
    def test_disposable_account_pattern(self):
        self.assertTrue(looks_like_raid_name("qw12345", "qwe123456"))
        self.assertTrue(looks_like_raid_name("t.me/spamchannel", None))

    def test_normal_name_is_ok(self):
        self.assertFalse(looks_like_raid_name("Иван Петров", "ivan_petrov"))


class WindowTests(unittest.TestCase):
    def test_sliding_window_forgets_old_events(self):
        window = SlidingWindow()
        for i in range(5):
            count = window.hit(("chat", 1), seconds=10, now=float(i))
        self.assertEqual(count, 5)
        self.assertEqual(window.hit(("chat", 1), seconds=10, now=100.0), 1)

    def test_repeat_tracker_counts_duplicates(self):
        tracker = RepeatTracker()
        self.assertEqual(tracker.hit(1, 2, "купите наши курсы"), 0)
        self.assertEqual(tracker.hit(1, 2, "купите наши курсы"), 1)
        self.assertEqual(tracker.hit(1, 2, "купите наши курсы"), 2)

    def test_lockdown_expires(self):
        runtime = Runtime()
        self.assertFalse(runtime.lockdown(1).active())
        runtime.start_lockdown(1, minutes=5, reason="рейд")
        self.assertTrue(runtime.lockdown(1).active())
        runtime.stop_lockdown(1)
        self.assertFalse(runtime.lockdown(1).active())


class StorageTests(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.storage = Storage(str(Path(self._dir.name) / "test.sqlite3"))

    def tearDown(self):
        self.storage.close()
        self._dir.cleanup()

    def test_settings_roundtrip_with_defaults(self):
        self.assertTrue(self.storage.settings(-100)["captcha"])
        self.storage.set_setting(-100, "captcha", False)
        self.assertFalse(self.storage.settings(-100)["captcha"])
        self.assertEqual(self.storage.settings(-100)["warn_limit"], 3)

    def test_warn_lifecycle(self):
        self.assertEqual(self.storage.add_warn(-100, 7, 1, "спам"), 1)
        self.assertEqual(self.storage.add_warn(-100, 7, 1, "спам"), 2)
        self.assertEqual(self.storage.pop_warn(-100, 7), 1)
        self.storage.clear_warns(-100, 7)
        self.assertEqual(self.storage.count_warns(-100, 7), 0)

    def test_member_counters(self):
        self.storage.register_join(-100, 7, now=1000)
        state = self.storage.bump_messages(-100, 7)
        self.assertEqual(state.messages, 1)
        self.assertEqual(state.joined_at, 1000)
        self.storage.set_trusted(-100, 7, True)
        self.assertTrue(self.storage.member(-100, 7).trusted)

    def test_event_stats(self):
        self.storage.log_event(-100, 7, "spam", "ссылка")
        self.storage.log_event(-100, 8, "spam", "капс")
        self.storage.log_event(-100, 9, "flood", "")
        self.assertEqual(self.storage.stats(-100, 0), [("spam", 2), ("flood", 1)])


class SettingsCoercionTests(unittest.TestCase):
    def test_bool_and_int(self):
        self.assertIs(coerce_setting("captcha", "off"), False)
        self.assertIs(coerce_setting("captcha", "вкл"), True)
        self.assertEqual(coerce_setting("warn_limit", "5"), 5)

    def test_rejects_bad_values(self):
        with self.assertRaises(ValueError):
            coerce_setting("warn_limit", "много")
        with self.assertRaises(ValueError):
            coerce_setting("spam_action", "расстрел")
        with self.assertRaises(KeyError):
            coerce_setting("нет_такой", "1")


if __name__ == "__main__":
    unittest.main()
