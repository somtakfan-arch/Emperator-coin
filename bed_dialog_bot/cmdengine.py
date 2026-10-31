"""Programmable custom commands: a target (what the command acts on) plus an
action (what it does). Used by both the immediate in-chat runner (commands.py)
and the deferred "next message" runner (handlers.py).

A command is stored as {text, action, target, param}:
  * text   — the payload/template (for text/prefix/suffix/repeat) or ignored.
  * action — one of ACTION_ORDER below.
  * target — self / reply / prev / next (what message the action reads/hits).
  * param  — extra arg (e.g. repeat count).
"""
import html
import logging

logger = logging.getLogger(__name__)

# action -> (эмодзи, короткое описание для /cmdhelp и редактора)
ACTIONS = {
    "text":    ("💬", "отправить/подставить текст"),
    "delete":  ("🗑", "удалить сообщение-цель"),
    "copy":    ("📋", "скопировать текст цели"),
    "quote":   ("❝", "процитировать цель + твой текст"),
    "mock":    ("🤪", "оЗоРнЫй РеГиСтР"),
    "reverse": ("🔁", "перевернуть задом наперёд"),
    "upper":   ("🔠", "ВЕРХНИЙ РЕГИСТР"),
    "lower":   ("🔡", "нижний регистр"),
    "space":   ("␣", "р а з р я д к а"),
    "clap":    ("👏", "хлопки👏между👏словами"),
    "censor":  ("🙈", "з*ц*нз*р*ть гласные"),
    "count":   ("📊", "счётчик символов/слов"),
    "suffix":  ("➡️", "дописать текст в конец"),
    "prefix":  ("⬅️", "дописать текст в начало"),
    "repeat":  ("♻️", "повторить N раз (param)"),
    "bold":    ("𝗕", "жирный"),
    "italic":  ("𝘐", "курсив"),
    "strike":  ("S̶", "зачёркнутый"),
    "mono":    ("`", "моноширинный"),
    "spoiler": ("🕶", "спойлер"),
}
ACTION_ORDER = list(ACTIONS.keys())

TARGETS = {
    "self":  ("✍️", "своё .сообщение (по умолчанию)"),
    "reply": ("↩️", "сообщение, на которое ответил"),
    "prev":  ("⬆️", "предыдущее сообщение в чате"),
    "next":  ("⏭", "следующее сообщение собеседника"),
}
TARGET_ORDER = list(TARGETS.keys())

_FMT = {"bold": "b", "italic": "i", "strike": "s", "mono": "code", "spoiler": "tg-spoiler"}
_VOWELS = set("аеёиоуыэюяАЕЁИОУЫЭЮЯaeiouyAEIOUY")


def valid_action(a: str) -> bool:
    return a in ACTIONS


def valid_target(t: str) -> bool:
    return t in TARGETS


def _censor(s: str) -> str:
    return "".join("*" if c in _VOWELS else c for c in s)


def is_delete(action: str) -> bool:
    return action == "delete"


def compute_output(action: str, source: str, payload: str, param=None):
    """Return (text, parse_mode). (None, None) means "no text to send"
    (delete, or an empty result). ``source`` is the target message's text;
    for target=self it is empty, so transforms fall back to ``payload``."""
    s = source or ""
    p = payload or ""
    base = s or p  # source if we have one, else the stored payload

    if action == "delete":
        return None, None
    if action == "text":
        return (p or s) or None, None
    if action == "copy":
        return (s or None), None
    if action == "mock":
        return "".join(c.upper() if i % 2 else c.lower() for i, c in enumerate(base)) or None, None
    if action == "reverse":
        return base[::-1] or None, None
    if action == "upper":
        return base.upper() or None, None
    if action == "lower":
        return base.lower() or None, None
    if action == "space":
        return " ".join(list(base)) or None, None
    if action == "clap":
        return (" 👏 ".join(base.split()) or "👏"), None
    if action == "censor":
        return _censor(base) or None, None
    if action == "count":
        t = base
        return (f"📊 символов: {len(t)} · слов: {len(t.split())} · "
                f"строк: {len(t.splitlines()) or (1 if t else 0)}"), None
    if action == "quote":
        q = f"«{s}»" if s else ""
        out = (q + (("\n" + p) if p else "")).strip()
        return (out or p or None), None
    if action == "suffix":
        return ((s + " " + p).strip() or None), None
    if action == "prefix":
        return ((p + " " + s).strip() or None), None
    if action == "repeat":
        n = 3
        try:
            n = max(1, min(50, int(param)))
        except Exception:
            pass
        unit = p or s or "."
        sep = "\n" if len(unit) > 20 else " "
        return (sep.join([unit] * n).strip() or None), None
    if action in _FMT:
        body = html.escape(base)
        if not body:
            return None, None
        return f"<{_FMT[action]}>{body}</{_FMT[action]}>", "HTML"
    # Unknown action → behave like plain text.
    return (p or s or None), None


# --- deferred "next message" pending store (in-memory, per process) ----------
# Keyed by (business_connection_id, chat_id). Only the latest pending wins.
_pending: dict = {}


def arm_next(bcid: str, chat_id: int, spec: dict, hint_message_id=None) -> None:
    if len(_pending) > 5000:
        _pending.clear()
    _pending[(bcid, chat_id)] = {"spec": spec, "hint": hint_message_id}


def take_next(bcid: str, chat_id: int):
    return _pending.pop((bcid, chat_id), None)


def has_next(bcid: str, chat_id: int) -> bool:
    return (bcid, chat_id) in _pending
