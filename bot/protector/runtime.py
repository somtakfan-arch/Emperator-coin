"""Скользящие окна в памяти: флуд, рейд, дубли, массовые баны от админа."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass, field


class SlidingWindow:
    """Считает события по ключу за последние `seconds` секунд."""

    def __init__(self) -> None:
        self._events: dict[tuple, deque[float]] = defaultdict(deque)

    def hit(self, key: tuple, seconds: int, now: float | None = None) -> int:
        now = time.monotonic() if now is None else now
        bucket = self._events[key]
        bucket.append(now)
        cutoff = now - seconds
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        return len(bucket)

    def reset(self, key: tuple) -> None:
        self._events.pop(key, None)

    def sweep(self, max_age: int = 3600, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        for key in list(self._events):
            bucket = self._events[key]
            if not bucket or bucket[-1] < now - max_age:
                self._events.pop(key, None)


class RepeatTracker:
    """Ловит повторы одного и того же текста (в т.ч. размазанные по чатам)."""

    def __init__(self, keep: int = 6) -> None:
        self._keep = keep
        self._last: dict[tuple[int, int], deque[str]] = defaultdict(
            lambda: deque(maxlen=keep)
        )

    def hit(self, chat_id: int, user_id: int, normalized: str) -> int:
        if len(normalized) < 8:
            return 0
        bucket = self._last[(chat_id, user_id)]
        repeats = sum(1 for item in bucket if item == normalized)
        bucket.append(normalized)
        return repeats

    def reset(self, chat_id: int, user_id: int) -> None:
        self._last.pop((chat_id, user_id), None)


@dataclass(slots=True)
class Lockdown:
    """Карантин чата: всех новых участников режем до конца окна."""

    until: float = 0.0
    reason: str = ""

    def active(self, now: float | None = None) -> bool:
        return (time.monotonic() if now is None else now) < self.until


@dataclass(slots=True)
class Runtime:
    flood: SlidingWindow = field(default_factory=SlidingWindow)
    joins: SlidingWindow = field(default_factory=SlidingWindow)
    admin_actions: SlidingWindow = field(default_factory=SlidingWindow)
    repeats: RepeatTracker = field(default_factory=RepeatTracker)
    lockdowns: dict[int, Lockdown] = field(default_factory=dict)
    pending_captcha: dict[tuple[int, int], "CaptchaTicket"] = field(default_factory=dict)

    def lockdown(self, chat_id: int) -> Lockdown:
        return self.lockdowns.setdefault(chat_id, Lockdown())

    def start_lockdown(self, chat_id: int, minutes: int, reason: str) -> Lockdown:
        lock = self.lockdown(chat_id)
        lock.until = time.monotonic() + minutes * 60
        lock.reason = reason
        return lock

    def stop_lockdown(self, chat_id: int) -> None:
        self.lockdowns.pop(chat_id, None)

    def sweep(self) -> None:
        self.flood.sweep()
        self.joins.sweep()
        self.admin_actions.sweep()
        now = time.monotonic()
        for chat_id, lock in list(self.lockdowns.items()):
            if not lock.active(now):
                self.lockdowns.pop(chat_id, None)


@dataclass(slots=True)
class CaptchaTicket:
    chat_id: int
    user_id: int
    answer: str
    prompt_message_id: int = 0
    expires_at: float = 0.0
    attempts: int = 0
