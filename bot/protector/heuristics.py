"""Эвристики антиспама. Чистые функции — их можно тестировать без Telegram."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

# Невидимые символы и «нулевая ширина» — классика обхода фильтров.
INVISIBLE = "".join(
    (
        "​‌‍‎‏⁠⁡⁢⁣⁤"
        "﻿­᠎͏"
    )
)
INVISIBLE_RE = re.compile(f"[{INVISIBLE}]")

# Кириллица, похожая на латиницу: приводим к общему виду, чтобы «сaйт» == «сайт».
HOMOGLYPHS = str.maketrans(
    {
        "a": "а", "c": "с", "e": "е", "o": "о", "p": "р", "x": "х", "y": "у",
        "k": "к", "m": "м", "t": "т", "h": "н", "b": "в", "3": "з", "0": "о",
        "1": "і", "4": "ч",
    }
)

URL_RE = re.compile(r"(?:https?://|www\.)\S+|\b[\w-]+\.(?:com|net|org|ru|рф|io|xyz|top|link|site|shop|online|club|info|biz|cc|me)\b", re.I)
INVITE_RE = re.compile(r"(?:t\.me/(?:joinchat/|\+)|telegram\.me/|tg://join)", re.I)
MENTION_RE = re.compile(r"@[A-Za-z][\w]{4,}")
EMOJI_RE = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF⬀-⯿]"
)
REPEAT_RE = re.compile(r"(.)\1{7,}")

# Ключевые фразы типичного скам-спама. Список правится под свой чат командой /set.
SPAM_PHRASES: tuple[str, ...] = (
    "заработок от", "доход от", "пассивный доход", "личные сообщения",
    "инвестиции без риска", "крипто сигнал", "криптосигнал", "пиши в лс",
    "набираю команду", "удалённая работа от", "удаленная работа от",
    "18+", "порно", "интим", "слив базы", "накрутка", "дешёвые подписчики",
    "дешевые подписчики", "приватный канал", "гарантированный доход",
    "airdrop", "free crypto", "binary options", "casino bonus", "hot girls",
    "make money fast", "investment plan", "nude",
)


def strip_invisible(text: str) -> str:
    return INVISIBLE_RE.sub("", text)


def normalize(text: str) -> str:
    """Нормализация для сравнения: без невидимых символов, гомоглифов и регистра."""
    text = unicodedata.normalize("NFKC", strip_invisible(text)).lower()
    text = text.translate(HOMOGLYPHS)
    return re.sub(r"\s+", " ", text).strip()


def caps_ratio(text: str) -> float:
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 12:
        return 0.0
    return sum(c.isupper() for c in letters) / len(letters)


def count_emoji(text: str) -> int:
    return len(EMOJI_RE.findall(text))


def has_link(text: str) -> bool:
    return bool(URL_RE.search(text) or INVITE_RE.search(text))


def has_invite(text: str) -> bool:
    return bool(INVITE_RE.search(text))


@dataclass(slots=True)
class MessageFacts:
    """То, что модуль знает о сообщении, без зависимости от типов aiogram."""

    text: str = ""
    is_forward: bool = False
    forward_from_chat: bool = False
    has_entity_link: bool = False
    has_media: bool = False
    via_bot: bool = False
    is_new_user: bool = True


@dataclass(slots=True)
class Verdict:
    score: int = 0
    reasons: list[str] = field(default_factory=list)

    def add(self, points: int, reason: str) -> None:
        self.score += points
        self.reasons.append(reason)

    @property
    def is_spam(self) -> bool:
        return self.score > 0

    def summary(self) -> str:
        return ", ".join(self.reasons)


def analyze(facts: MessageFacts, *, block_links_for_new: bool = True,
            block_forwards_for_new: bool = True) -> Verdict:
    """Считает «очки спама». Порог сравнения задаётся настройкой spam_threshold."""
    verdict = Verdict()
    raw = facts.text or ""
    norm = normalize(raw)

    if not norm and not facts.has_media and not facts.is_forward:
        return verdict

    link = has_link(raw) or has_link(norm) or facts.has_entity_link
    invite = has_invite(raw) or has_invite(norm)

    if invite:
        verdict.add(4 if facts.is_new_user else 2, "инвайт-ссылка")
    elif link and facts.is_new_user and block_links_for_new:
        verdict.add(3, "ссылка от новичка")
    elif link and facts.is_new_user:
        verdict.add(1, "ссылка от новичка")

    if facts.is_forward and facts.forward_from_chat and facts.is_new_user and block_forwards_for_new:
        verdict.add(3, "пересыл из канала от новичка")

    if facts.via_bot and facts.is_new_user:
        verdict.add(1, "сообщение через стороннего бота")

    hits = [p for p in SPAM_PHRASES if p in norm]
    if hits:
        verdict.add(min(2 * len(hits), 4), f"стоп-слова: {', '.join(hits[:3])}")

    mentions = MENTION_RE.findall(raw)
    if len(mentions) >= 5:
        verdict.add(3, f"массовые упоминания ({len(mentions)})")
    elif len(mentions) >= 3 and facts.is_new_user:
        verdict.add(2, f"упоминания ({len(mentions)})")

    if INVISIBLE_RE.search(raw) and len(INVISIBLE_RE.findall(raw)) >= 3:
        verdict.add(2, "невидимые символы (обход фильтров)")

    ratio = caps_ratio(raw)
    if ratio >= 0.8:
        verdict.add(2, "капс")
    elif ratio >= 0.6:
        verdict.add(1, "много капса")

    emoji = count_emoji(raw)
    if emoji >= 20:
        verdict.add(2, f"эмодзи-флуд ({emoji})")
    elif emoji >= 10:
        verdict.add(1, f"много эмодзи ({emoji})")

    if REPEAT_RE.search(raw):
        verdict.add(1, "повтор символов")

    if len(raw) > 1500 and facts.is_new_user:
        verdict.add(1, "простыня от новичка")

    return verdict


def looks_like_raid_name(full_name: str, username: str | None) -> bool:
    """Признаки одноразовых аккаунтов из «сносерских» пачек."""
    name = normalize(full_name)
    if not name:
        return True
    if INVISIBLE_RE.search(full_name):
        return True
    if has_link(full_name) or has_invite(full_name):
        return True
    if count_emoji(full_name) >= 4:
        return True
    if username and re.fullmatch(r"[a-z]{2,8}\d{5,}", username.lower()):
        return True
    if re.fullmatch(r"[a-zа-я]{1,3}\d{4,}", name.replace(" ", "")):
        return True
    return False
