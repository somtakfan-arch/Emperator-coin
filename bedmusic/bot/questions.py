"""The contract questionnaire.

Every blank in the contract template is one Question here. Both parties walk
the same generic FSM step, which reads its prompt and validation from this
list — so adding a clause to the contract means adding an entry, not a state.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Callable, Optional

SELLER = "seller"
BUYER = "buyer"


class Invalid(ValueError):
    """Raised with a user-facing explanation of what to fix."""


@dataclass(frozen=True)
class Question:
    key: str
    prompt: str
    hint: str = ""
    optional: bool = False
    clean: Optional[Callable[[str], str]] = None
    only_if: Optional[Callable[[dict], bool]] = None

    def parse(self, raw: str) -> str:
        text = raw.strip()
        if not text:
            raise Invalid("Пустой ответ. Напиши текстом.")
        if self.optional and text in {"-", "—", "нет", "Нет", "пропустить"}:
            return ""
        if self.clean:
            return self.clean(text)
        if len(text) > 300:
            raise Invalid("Слишком длинно — до 300 символов.")
        return text


# --- validators ------------------------------------------------------------


def _date(text: str) -> str:
    m = re.fullmatch(r"(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})", text.strip())
    if not m:
        raise Invalid("Нужна дата в формате ДД.ММ.ГГГГ, например 14.03.1998.")
    d, mo, y = (int(g) for g in m.groups())
    try:
        parsed = date(y, mo, d)
    except ValueError:
        raise Invalid("Такой даты не существует. Проверь число и месяц.") from None
    if parsed > date.today():
        raise Invalid("Дата в будущем. Проверь год.")
    return parsed.strftime("%d.%m.%Y")


def _birthdate(text: str) -> str:
    value = _date(text)
    born = date(*reversed([int(p) for p in value.split(".")]))
    years = (date.today() - born).days // 365.25
    if years > 120:
        raise Invalid("Проверь год рождения.")
    return value


def _fio(text: str) -> str:
    if len(text.split()) < 2:
        raise Invalid("Нужно полностью: фамилия, имя и отчество (если есть).")
    if len(text) > 120:
        raise Invalid("Слишком длинно — до 120 символов.")
    if not re.fullmatch(r"[А-Яа-яЁёA-Za-z\s\-']+", text):
        raise Invalid("В ФИО только буквы, пробелы и дефис.")
    return " ".join(text.split())


def _passport(text: str) -> str:
    digits = re.sub(r"\D", "", text)
    if len(digits) != 10:
        raise Invalid(
            "Нужны серия и номер — 10 цифр, например 4510 123456."
        )
    return f"{digits[:4]} {digits[4:]}"


def _email(text: str) -> str:
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[A-Za-z]{2,}", text):
        raise Invalid("Похоже, это не e-mail. Пример: name@mail.ru")
    return text.lower()


def _phone(text: str) -> str:
    digits = re.sub(r"\D", "", text)
    if not 10 <= len(digits) <= 15:
        raise Invalid("Телефон в формате +7 900 123-45-67.")
    if len(digits) == 11 and digits[0] == "8":
        digits = "7" + digits[1:]
    return f"+{digits}"


def _bpm(text: str) -> str:
    digits = re.sub(r"\D", "", text)
    if not digits or not 20 <= int(digits) <= 400:
        raise Invalid("BPM — число от 20 до 400, например 140.")
    return digits


def _yes_no(text: str) -> str:
    low = text.strip().lower()
    if low in {"да", "yes", "+", "есть"}:
        return "ДА"
    if low in {"нет", "no", "-", "нету"}:
        return "НЕТ"
    raise Invalid("Ответь «да» или «нет».")


def _days(text: str) -> str:
    digits = re.sub(r"\D", "", text)
    if not digits or not 1 <= int(digits) <= 60:
        raise Invalid("Число дней от 1 до 60.")
    return digits


def _city(text: str) -> str:
    if len(text) > 60:
        raise Invalid("Слишком длинно.")
    return text


def _is_minor(fields: dict) -> bool:
    return fields.get("seller_is_minor") == "ДА"


# --- the questionnaire -----------------------------------------------------

SELLER_QUESTIONS: list[Question] = [
    Question("seller_fio", "Твоё ФИО полностью", "Как в паспорте: Иванов Иван Иванович", clean=_fio),
    Question("seller_birthdate", "Дата рождения", "ДД.ММ.ГГГГ", clean=_birthdate),
    Question("seller_passport", "Серия и номер паспорта", "10 цифр: 4510 123456", clean=_passport),
    Question("seller_passport_issued", "Кем и когда выдан паспорт", "Как в паспорте, одной строкой"),
    Question("seller_address", "Адрес регистрации", "Индекс, город, улица, дом, квартира"),
    Question("seller_phone", "Телефон", "+7 900 123-45-67", clean=_phone),
    Question("seller_email", "E-mail", "name@mail.ru", clean=_email),
    Question("seller_alias", "Псевдоним для указания авторства", "Пойдёт в строку «prod. by …»"),
    Question("seller_payout", "Адрес кошелька для получения оплаты", "Куда бот переведёт деньги после сделки"),
    Question("city", "Город заключения договора", "Например: Москва", clean=_city),
    Question("beat_bpm", "Темп бита (BPM)", "Например: 140", clean=_bpm),
    Question("beat_key", "Тональность", "Например: Am или F#min"),
    Question("beat_created", "Дата создания бита", "ДД.ММ.ГГГГ", clean=_date),
    Question("wav_quality", "Качество мастер-файла WAV", "Например: 24 бит / 44.1 кГц"),
    Question("has_stems", "Передаёшь раздельные дорожки (stems)?", "да / нет", clean=_yes_no),
    Question("has_project", "Передаёшь проектный файл?", "да / нет", clean=_yes_no),
    Question(
        "samples",
        "Есть ли в бите чужие сэмплы, лупы или вокальные партии?",
        "Перечисли их и основание использования. Если нет — напиши «нет»",
        optional=True,
    ),
    Question("delivery_days", "За сколько дней передашь материалы после оплаты?", "Число дней, например 3", clean=_days),
    Question(
        "seller_is_minor",
        "Тебе есть 18 лет?",
        "да / нет. Если нет — договор потребует согласия законного представителя",
        clean=lambda t: "НЕТ" if _yes_no(t) == "ДА" else "ДА",
    ),
    Question("rep_fio", "ФИО законного представителя", "Родитель, усыновитель или попечитель", clean=_fio, only_if=_is_minor),
    Question("rep_passport", "Серия и номер паспорта представителя", "10 цифр", clean=_passport, only_if=_is_minor),
    Question("rep_passport_issued", "Кем и когда выдан паспорт представителя", "Одной строкой", only_if=_is_minor),
]

BUYER_QUESTIONS: list[Question] = [
    Question("buyer_fio", "Твоё ФИО полностью", "Как в паспорте", clean=_fio),
    Question("buyer_birthdate", "Дата рождения", "ДД.ММ.ГГГГ", clean=_birthdate),
    Question("buyer_passport", "Серия и номер паспорта", "10 цифр: 4510 123456", clean=_passport),
    Question("buyer_passport_issued", "Кем и когда выдан паспорт", "Как в паспорте, одной строкой"),
    Question("buyer_address", "Адрес регистрации", "Индекс, город, улица, дом, квартира"),
    Question("buyer_phone", "Телефон", "+7 900 123-45-67", clean=_phone),
    Question("buyer_email", "E-mail для получения материалов", "На него придёт ссылка на файлы", clean=_email),
    Question("buyer_alias", "Псевдоним / артист-нейм", "Можно пропустить — напиши «нет»", optional=True),
]


def questions_for(party: str) -> list[Question]:
    return SELLER_QUESTIONS if party == SELLER else BUYER_QUESTIONS


def next_question(party: str, fields: dict) -> Optional[Question]:
    """First unanswered question whose condition holds."""
    for q in questions_for(party):
        if q.key in fields:
            continue
        if q.only_if and not q.only_if(fields):
            continue
        return q
    return None


def progress(party: str, fields: dict) -> tuple[int, int]:
    """(answered, total) counting only questions that actually apply."""
    applicable = [q for q in questions_for(party) if not q.only_if or q.only_if(fields)]
    answered = sum(1 for q in applicable if q.key in fields)
    return answered, len(applicable)
