"""Конфигурация Bed Protector: секреты из окружения, настройки защиты — из БД."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _load_dotenv(path: Path) -> None:
    """Минимальный .env-загрузчик, чтобы не тянуть python-dotenv."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _int_set(raw: str) -> set[int]:
    out: set[int] = set()
    for part in raw.replace(";", ",").split(","):
        part = part.strip()
        if part.lstrip("-").isdigit():
            out.add(int(part))
    return out


@dataclass(slots=True)
class Config:
    token: str
    owner_ids: set[int] = field(default_factory=set)
    log_chat_id: int | None = None
    db_path: str = "bed_protector.sqlite3"

    @classmethod
    def from_env(cls, env_file: Path | None = None) -> "Config":
        _load_dotenv(env_file or Path(__file__).resolve().parent.parent / ".env")
        token = os.getenv("BOT_TOKEN", "").strip()
        if not token:
            raise SystemExit(
                "BOT_TOKEN не задан. Скопируй bot/.env.example в bot/.env "
                "и впиши токен от @BotFather (или экспортируй переменную окружения)."
            )
        log_raw = os.getenv("LOG_CHAT_ID", "").strip()
        return cls(
            token=token,
            owner_ids=_int_set(os.getenv("OWNER_IDS", "")),
            log_chat_id=int(log_raw) if log_raw.lstrip("-").isdigit() else None,
            db_path=os.getenv("DB_PATH", "bed_protector.sqlite3"),
        )


# Настройки защиты — отдельные для каждого чата, меняются командой /set.
# Значение по умолчанию задаёт и тип: bool, int или str.
DEFAULT_SETTINGS: dict[str, bool | int | str] = {
    # --- Капча на входе -------------------------------------------------
    "captcha": True,                 # включить капчу для новых участников
    "captcha_timeout": 90,           # сек. на прохождение
    "captcha_action": "kick",        # kick | mute — что делать, если не прошёл
    # --- Антифлуд -------------------------------------------------------
    "antiflood": True,
    "flood_messages": 7,             # сообщений...
    "flood_seconds": 10,             # ...за столько секунд = флуд
    "flood_action": "mute",          # delete | mute | kick | ban
    "flood_mute_minutes": 30,
    # --- Антиспам (контент) ---------------------------------------------
    "antispam": True,
    "spam_threshold": 4,             # порог "очков спама" для наказания
    "spam_action": "mute",           # delete | mute | kick | ban
    "spam_mute_minutes": 60,
    "block_links_for_new": True,     # новичкам нельзя ссылки/инвайты
    "block_forwards_for_new": True,  # новичкам нельзя пересылы из каналов
    "new_user_messages": 5,          # сколько сообщений до статуса "свой"
    "new_user_hours": 24,            # ...или сколько часов в чате
    # --- Антирейд -------------------------------------------------------
    "antiraid": True,
    "raid_joins": 6,                 # столько входов...
    "raid_seconds": 30,              # ...за столько секунд = рейд
    "raid_lockdown_minutes": 15,     # на сколько включается карантин
    # --- Предупреждения --------------------------------------------------
    "warn_limit": 3,
    "warn_action": "ban",            # mute | kick | ban
    # --- Антиснос чата (rogue admin) --------------------------------------
    "antinuke": True,
    "nuke_bans": 4,                  # столько банов/киков от одного админа...
    "nuke_seconds": 60,              # ...за столько секунд = тревога
    "antinuke_demote": False,        # снимать права у «взбесившегося» админа
    # --- Прочее ----------------------------------------------------------
    "welcome": True,
    "delete_service": True,          # удалять "X вошёл в чат"
    "log_chat_id": 0,                # свой лог-чат для этой группы
}

SETTINGS_HELP: dict[str, str] = {
    "captcha": "капча-кнопка для новых участников",
    "captcha_timeout": "секунд на прохождение капчи",
    "captcha_action": "kick | mute — если капча не пройдена",
    "antiflood": "ограничение частоты сообщений",
    "flood_messages": "сообщений за окно = флуд",
    "flood_seconds": "длина окна антифлуда, сек",
    "flood_action": "delete | mute | kick | ban",
    "flood_mute_minutes": "мут за флуд, минут",
    "antispam": "эвристический фильтр содержимого",
    "spam_threshold": "порог очков спама (1-10)",
    "spam_action": "delete | mute | kick | ban",
    "spam_mute_minutes": "мут за спам, минут",
    "block_links_for_new": "новичкам запрещены ссылки",
    "block_forwards_for_new": "новичкам запрещены пересылы",
    "new_user_messages": "сообщений до статуса «свой»",
    "new_user_hours": "часов до статуса «свой»",
    "antiraid": "детектор массовых входов",
    "raid_joins": "входов за окно = рейд",
    "raid_seconds": "окно антирейда, сек",
    "raid_lockdown_minutes": "длительность карантина, минут",
    "warn_limit": "предупреждений до наказания",
    "warn_action": "mute | kick | ban",
    "antinuke": "тревога при массовых банах от админа",
    "nuke_bans": "банов от админа за окно = тревога",
    "nuke_seconds": "окно антисноса, сек",
    "antinuke_demote": "снимать права у админа при тревоге",
    "welcome": "приветствие новичкам",
    "delete_service": "чистить сервисные сообщения",
    "log_chat_id": "ID чата для логов (0 = глобальный)",
}


def coerce_setting(key: str, raw: str) -> bool | int | str:
    """Приводит строку из /set к типу значения по умолчанию."""
    if key not in DEFAULT_SETTINGS:
        raise KeyError(key)
    default = DEFAULT_SETTINGS[key]
    value = raw.strip()
    if isinstance(default, bool):
        if value.lower() in {"1", "on", "true", "yes", "да", "вкл"}:
            return True
        if value.lower() in {"0", "off", "false", "no", "нет", "выкл"}:
            return False
        raise ValueError("ожидалось on/off")
    if isinstance(default, int):
        if not value.lstrip("-").isdigit():
            raise ValueError("ожидалось число")
        return int(value)
    allowed = {
        "captcha_action": {"kick", "mute"},
        "flood_action": {"delete", "mute", "kick", "ban"},
        "spam_action": {"delete", "mute", "kick", "ban"},
        "warn_action": {"mute", "kick", "ban"},
    }.get(key)
    value = value.lower()
    if allowed and value not in allowed:
        raise ValueError("допустимо: " + " | ".join(sorted(allowed)))
    return value
