import asyncio
import ast
import base64
import html
import io
import json
import logging
import operator
import os
import random
import re
import shutil
import string
import tempfile
import time
import uuid

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Message
from telegram.error import RetryAfter
from telegram.ext import ContextTypes

from . import config, formatting, mediautil
from .storage import Storage

logger = logging.getLogger(__name__)

SPAM_WINDOW_SECONDS = 45
SPAM_COOLDOWN_SECONDS = 20
# Auto-blacklist a user who fires this many spam runs within the window below.
SPAM_ABUSE_LIMIT = 15
SPAM_ABUSE_WINDOW = 600

_BAN_RE = re.compile(r"^\.ban\s+(\d+)\s*$")
_UNBAN_RE = re.compile(r"^\.unban\s*$")
_SPAM_RE = re.compile(r"^\.spam\s+(\d+)\s+(.+)$", re.DOTALL)
_HELP_RE = re.compile(r"^\.help(?:\s+(\S+))?\s*$")
_SELFDESTRUCT_RE = re.compile(r"^\.selfdestruct\s+(\d+)\s+(.+)$", re.DOTALL)
_NOTE_RE = re.compile(r"^\.note(?:\s+(.*))?$", re.DOTALL)
_STOPSPAM_RE = re.compile(r"^\.stopspam(?:\s+(off))?\s*$")
_FAKE_RE = re.compile(r"^\.fake\s+(.+?)\s*\|\s*(.+)$", re.DOTALL)
_TYPE_RE = re.compile(r"^\.type\s+(\d+)\s*$")
_ANIMATE_RE = re.compile(r"^\.animate\s+(.+)$", re.DOTALL)
_DICE_RE = re.compile(r"^\.(dice|slot|roll|dart|ball|foot)\s*$")
_SEEN_RE = re.compile(r"^\.seen\s*$")
_STALKER_RE = re.compile(r"^\.stalker\s*$")
_EMOJI_RE = re.compile(r"^\.emoji(?:\s+(.*))?$", re.DOTALL)

# Extra fun/utility commands ("borrowed" NeverDialog set).
_LOVE_RE = re.compile(r"^\.love\s*$")
_FLIP_RE = re.compile(r"^\.flip\s*$")
_RPS_RE = re.compile(r"^\.rps\s*$")
_MON_RE = re.compile(r"^\.mon\s*$")
_BURM_RE = re.compile(r"^\.бурмалда\s*$")
_TROLL_RE = re.compile(r"^\.troll\s*$")
_INFO_RE = re.compile(r"^\.info\s*$")
_STATUS_RE = re.compile(r"^\.status\s*$")
_AFK_RE = re.compile(r"^\.afk(?:\s+(.*))?$", re.DOTALL)
_KAWAI_RE = re.compile(r"^\.kawai\s*$")
_SPEK_RE = re.compile(r"^\.spek\s+(.+)$", re.DOTALL)
_PREFIX_RE = re.compile(r"^\.prefix\s+(\S+)\s*$")
_CLONE_RE = re.compile(r"^\.clone\s*$")
_UNCLONE_RE = re.compile(r"^\.unclone\s*$")
_PING_RE = re.compile(r"^\.ping\s*$")
_CALC_RE = re.compile(r"^\.calc\s+(.+)$", re.DOTALL)
_REVERSE_RE = re.compile(r"^\.reverse(?:\s+(.+))?$", re.DOTALL)
_MOCK_RE = re.compile(r"^\.mock(?:\s+(.+))?$", re.DOTALL)
_PASSWORD_RE = re.compile(r"^\.password(?:\s+(\d+))?\s*$")
_FIRST_RE = re.compile(r"^\.first\s*$")
_STIK_RE = re.compile(r"^\.stik\s*$")
_GIF_RE = re.compile(r"^\.gif\s*$")
_KROM_RE = re.compile(r"^\.krom\s*$")
_SAVE_RE = re.compile(r"^\.save\s+(\S+)\s*$")

_CALC_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.Mod: operator.mod, ast.Pow: operator.pow,
    ast.FloorDiv: operator.floordiv, ast.USub: operator.neg, ast.UAdd: operator.pos,
}


def _safe_calc(expr: str):
    """Evaluate a basic arithmetic expression safely (no eval)."""
    def ev(node):
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _CALC_OPS:
            if isinstance(node.op, ast.Pow):
                right = ev(node.right)
                if abs(right) > 1000:
                    raise ValueError("exponent too large")
                return _CALC_OPS[type(node.op)](ev(node.left), right)
            return _CALC_OPS[type(node.op)](ev(node.left), ev(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in _CALC_OPS:
            return _CALC_OPS[type(node.op)](ev(node.operand))
        raise ValueError("unsupported expression")
    return ev(ast.parse(expr, mode="eval").body)

# Any prefix is allowed; only capped in length to avoid pathological input.
MAX_PREFIX_LEN = 16

_DICE_EMOJI = {"dice": "🎲", "slot": "🎰", "dart": "🎯", "ball": "🏀", "foot": "⚽"}

_BURM_LINES = [
    "🌀 Секретная бурмалда активирована.",
    "🫠 Бурмалда одобряет.",
    "🎪 Бурмалда where?",
    "🌌 Ты вошёл в режим бурмалды.",
]


def _humanize_ago(last_ts) -> str:
    if not last_ts:
        return "нет данных"
    ago = int(time.time() - last_ts)
    if ago < 60:
        return f"{ago} сек назад"
    if ago < 3600:
        return f"{ago // 60} мин назад"
    if ago < 86400:
        return f"{ago // 3600} ч назад"
    return f"{ago // 86400} дн назад"


# .kawai — turn the owner's message "как няшка": stutters, drawn-out vowels and
# a big pool of cute decorations sprinkled in. 50+ "заготовки" to pick from.
_KAWAII_DECOR = [
    "🥺", "🥰", "😊", "😳", "😖", "😩", "🤗", "🥶", "😽", "💗", "💕", "💞", "💓",
    "💖", "✨", "🌸", "🌺", "🐾", "🍡", "🍬", "🍭", "🧸", "🎀", "💫", "⭐️", "🌈",
    "☁️", "🫶", "🙈", "😚", "😘", "😻", "💝", "💘", "💟", "🫂", "😆", "🥴", "😼",
    "🐱", "🐰", "🦋", "🌷", "🍓", "🫧", "💦", "😝", "😜", "🌙", "💜", "🍥",
    "(◕‿◕)", "(≧◡≦)", "(´｡• ᵕ •｡`)", "ʕっ•ᴥ•ʔっ", "(๑>ᴗ<๑)", ">///<", "uwu",
    "owo", "~", "nya~", ">.<", "(*ﾉ▽ﾉ)", "(⁄ ⁄•⁄ω⁄•⁄ ⁄)",
]
_RU_VOWELS = "аеёиоуыэюяАЕЁИОУЫЭЮЯ"
_KAWAII_TAIL_PUNCT = ",.!?…:;"


def _kawaii_word(word: str) -> str:
    if not word.strip():
        return word
    # peel trailing punctuation so decorations land before it
    core = word.rstrip(_KAWAII_TAIL_PUNCT)
    punct = word[len(core):]
    if not core:
        return word
    # stutter the first letter: привет -> п-привет
    if len(core) >= 2 and core[0].isalpha() and random.random() < 0.4:
        core = core[0] + "-" + core
    # draw out a vowel or two: делаешь -> дееелаеешь
    if random.random() < 0.5:
        idxs = [i for i, ch in enumerate(core) if ch in _RU_VOWELS]
        random.shuffle(idxs)
        for i in sorted(idxs[:random.randint(1, 2)], reverse=True):
            core = core[:i] + core[i] * random.randint(2, 3) + core[i + 1:]
    tail = ""
    if random.random() < 0.3:
        tail += ")" * random.randint(1, 2)
    if random.random() < 0.55:
        tail += random.choice(_KAWAII_DECOR) * random.randint(1, 3)
    return core + tail + punct


def kawaii_style(text: str) -> str:
    """Rewrite the owner's message in a cutesy "няшка" style (HTML-safe)."""
    cute = " ".join(_kawaii_word(w) for w in text.split(" "))
    if random.random() < 0.6:
        cute += " " + random.choice(_KAWAII_DECOR)
    return html.escape(cute)


# /style — configurable formatting applied to the owner's outgoing messages.
STYLE_TAGS = {
    "bold": ("<b>", "</b>"),
    "italic": ("<i>", "</i>"),
    "underline": ("<u>", "</u>"),
    "strike": ("<s>", "</s>"),
    "spoiler": ("<tg-spoiler>", "</tg-spoiler>"),
    "mono": ("<code>", "</code>"),
}

# Human labels (for the /style prompt) and accepted aliases (RU + EN).
STYLE_LABELS = {
    "bold": "жирный",
    "italic": "курсив",
    "underline": "подчёркнутый",
    "strike": "зачёркнутый",
    "spoiler": "спойлер",
    "mono": "моно",
}
_STYLE_ALIASES = {
    "жирный": "bold", "жирн": "bold", "bold": "bold", "b": "bold",
    "курсив": "italic", "курс": "italic", "italic": "italic", "i": "italic",
    "подчёркнутый": "underline", "подчеркнутый": "underline", "подч": "underline",
    "underline": "underline", "u": "underline",
    "зачёркнутый": "strike", "зачеркнутый": "strike", "зач": "strike",
    "strike": "strike", "strikethrough": "strike", "s": "strike",
    "спойлер": "spoiler", "спойл": "spoiler", "spoiler": "spoiler",
    "моно": "mono", "mono": "mono", "code": "mono", "код": "mono",
}


def parse_style_names(tokens):
    """Resolve a list of user tokens to canonical style keys, order preserved."""
    out = []
    for t in tokens:
        key = _STYLE_ALIASES.get(str(t).lower().strip())
        if key and key not in out:
            out.append(key)
    return out


# Emoji / pictographic ranges — these are left OUT of /style formatting so
# emojis and emoji-only messages render normally (no strike/spoiler over them).
_EMOJI_RE = re.compile(
    "(?:[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U00002B00-\U00002BFF"
    "\U00002190-\U000021FF\U00002300-\U000023FF\U00002460-\U000024FF"
    "\U0001F1E6-\U0001F1FF\U0000FE00-\U0000FE0F\U0000200D\U000020E3\U0000FE0F]"
    "[\U0000FE00-\U0000FE0F\U0000200D\U000020E3]*)+"
)


def apply_styles(text: str, styles) -> str:
    """Wrap text in the given style tags (nested), but skip over emojis so they
    stay unstyled. Emoji-only text is returned unchanged."""
    tag_pairs = [STYLE_TAGS[s] for s in styles if s in STYLE_TAGS]
    if not tag_pairs:
        return html.escape(text)

    def wrap(segment: str) -> str:
        if not segment:
            return ""
        inner = html.escape(segment)
        for open_t, close_t in tag_pairs:
            inner = open_t + inner + close_t
        return inner

    parts = []
    last = 0
    for m in _EMOJI_RE.finditer(text):
        parts.append(wrap(text[last:m.start()]))
        parts.append(m.group(0))  # emoji run, left as-is
        last = m.end()
    parts.append(wrap(text[last:]))
    return "".join(parts)

HELP_TEXT = (
    "Команды (пишутся прямо в чат с собеседником):\n\n"
    ".ban <минуты> — забанить собеседника на N минут. Пока бан активен, бот "
    "удаляет его сообщения (нужно право «удалять сообщения» при подключении; "
    "без него — просто отвечает «вы заблокированы»).\n"
    ".unban — снять бан раньше времени\n"
    ".spam <количество> <сообщение> — отправить сообщение N раз подряд "
    f"(максимум {config.FREE_SPAM_MAX} сообщений за {SPAM_WINDOW_SECONDS} секунд, "
    f"с премиумом — до {config.PREMIUM_SPAM_MAX})\n"
    ".info — инфо о собеседнике (в личку боту)\n"
    ".status — статистика чата (в личку боту)\n"
    ".afk — вкл/выкл автоответ «AFK»\n"
    ".stalker — вкл/выкл: сообщу, если собеседник напишет и быстро удалит (передумал)\n"
    ".kawai — вкл/выкл няшный стиль ваших сообщений (з-заикания, растяяяжка, эмодзи)\n"
    ".emoji <до> | <после> — эмодзи до/после ваших сообщений (.emoji off — убрать)\n"
    ".spek <текст> — текст, который трудно скопировать\n"
    ".troll — подколоть собеседника\n"
    ".love · .flip · .rps · .mon · .бурмалда — приколы и игры\n"
    ".calc <выражение> · .reverse · .mock · .password [длина]\n"
    ".first — первое сообщение · .afk [причина] — автоответ\n"
    ".stik (фото/видео/кружок→стикер) · .gif · .krom (видео/фото→кружок)\n"
    ".save <ссылка> — скачать видео с TikTok/YouTube/Instagram\n"
    "🛠 .ping — задержка бота (только админ)\n"
    ".clone — клон профиля собеседника (.unclone — вернуть свой)\n"
    ".prefix <символ> — сменить префикс команд (напр. :spam)\n"
    ".help <команда> — подробно об одной команде\n"
    ".help — этот список команд\n"
    "🎇 .powers — платные BedCoin-приколы, в т.ч. напугать: "
    ".trace .seen .phantom .hacked .virus"
)


async def _set_business_photo(bcid: str, photo_bytes: bytes) -> None:
    """Upload a static profile photo for the managed business account.
    Bot API needs a multipart attach:// upload, which do_api_request doesn't
    build for this nested InputProfilePhoto, so we POST it directly."""
    import json
    import httpx

    url = f"https://api.telegram.org/bot{config.BOT_TOKEN}/setBusinessAccountProfilePhoto"
    data = {
        "business_connection_id": bcid,
        "photo": json.dumps({"type": "static", "photo": "attach://pic"}),
    }
    files = {"pic": ("photo.jpg", photo_bytes, "image/jpeg")}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, data=data, files=files)
    body = resp.json()
    if not body.get("ok"):
        raise RuntimeError(f"setBusinessAccountProfilePhoto failed: {body}")


async def _download_photo_b64(context, file_id: str, max_bytes: int = 500_000):
    """Download a photo by file_id and return base64 (or None if too big)."""
    import base64

    f = await context.bot.get_file(file_id)
    raw = bytes(await f.download_as_bytearray())
    if len(raw) > max_bytes:
        return None
    return base64.b64encode(raw).decode()


async def _spam_send_one(context, chat_id: int, bcid: str, text: str) -> bool:
    """Send one spam message, waiting out flood limits. Returns True if sent.
    Never raises — a failed send must not abort the whole .spam run."""
    for _ in range(6):
        try:
            await context.bot.send_message(chat_id=chat_id, business_connection_id=bcid, text=text)
            return True
        except RetryAfter as e:
            await asyncio.sleep(float(getattr(e, "retry_after", 1)) + 0.5)
        except Exception:
            logger.exception("spam send failed")
            await asyncio.sleep(0.5)
            return False
    return False


_CAPTIONED_KINDS = {"photo", "video", "animation", "audio", "document"}


async def _send_troll_item(context, chat_id: int, bcid: str, item) -> bool:
    """Send one saved .troll item (text or media) into the chat. Never raises."""
    kind = item.get("kind", "text")
    fid = item.get("file_id")
    txt = item.get("text")
    for _ in range(4):
        try:
            if kind == "text" or not fid:
                await context.bot.send_message(chat_id=chat_id, business_connection_id=bcid, text=txt or "")
            else:
                # kind doubles as the send_<kind> method name and its file kwarg.
                send = getattr(context.bot, f"send_{kind}", None)
                if send is None:
                    await context.bot.send_message(chat_id=chat_id, business_connection_id=bcid, text=txt or "")
                    return True
                kwargs = {"chat_id": chat_id, "business_connection_id": bcid, kind: fid}
                if kind in _CAPTIONED_KINDS and txt:
                    kwargs["caption"] = txt
                await send(**kwargs)
            return True
        except RetryAfter as e:
            await asyncio.sleep(float(getattr(e, "retry_after", 1)) + 0.5)
        except Exception:
            logger.exception("troll item send failed (kind=%s)", kind)
            return False
    return False


async def _deny_prem(context, bcid, chat_id, message_id) -> bool:
    await _edit_command_message(
        context, bcid, chat_id, message_id,
        "💎 Команда доступна только с премиумом. Оформить — /premium",
    )
    return True


# --- BedCoin-powered "power" commands ---------------------------------------
# Each use burns BED from the owner's balance and asks the owner to confirm the
# spend first (privately, so the contact never sees the prompt). Names must not
# collide with the plain commands above.
_POWER_COMMANDS = {
    "boom", "matrix", "hack", "vanish", "roulette",   # effects
    "trace", "seen", "phantom", "hacked", "virus",    # scare the contact
}
_MATRIX_GLYPHS = "01#$%&@*ｦｧｨｩｪｫﾊﾋﾎﾐﾑ日ﾒﾓ"
_FAKE_CITIES = ["Москва", "Санкт-Петербург", "Казань", "Новосибирск", "Екатеринбург",
                "Краснодар", "Самара", "Ростов-на-Дону", "Уфа", "Пермь"]
_FAKE_ISP = ["Ростелеком", "МТС", "Билайн", "МегаФон", "Tele2", "ДомRu"]

POWERS_TEXT = (
    "🎇 BedCoin Power-Ups — тратят BED прямо в чате с собеседником "
    "(перед списанием бот спросит подтверждение в личке):\n\n"
    "💥 .boom <текст> — сообщение «взрывается»\n"
    "🟢 .matrix <текст> — текст проявляется как в «Матрице»\n"
    "💻 .hack — «сливает» IP и город собеседника и тут же стирает\n"
    "🕵️ .vanish <сек> <текст> — самоуничтожается у обоих\n"
    "🔫 .roulette <текст> — русская рулетка (1 к 6)\n\n"
    "😱 Напугать собеседника:\n"
    "📍 .trace — «вычисляю» IP и город собеседника\n"
    "👁 .seen — жутко раскрываю его реальные данные\n"
    "👻 .phantom [n] — призрачные сообщения, что тут же исчезают\n"
    "☠️ .hacked — фейковый взлом его устройства\n"
    "🦠 .virus — фейковое заражение вирусом\n\n"
    "Каждое применение стоит BED. Баланс и пополнение — /menu → 🪙 Кошелёк"
)


def _power_valid(cmd_name: str, arg: str):
    """(ok, error_text). Only well-formed commands reach the paid confirm step."""
    if cmd_name in ("boom", "matrix") and not arg:
        return False, f"⚠️ Формат: .{cmd_name} текст"
    if cmd_name == "vanish" and not re.match(r"\d+\s+.+", arg, re.S):
        return False, "⚠️ Формат: .vanish 5 текст"
    return True, None


async def _charge_bed(context, storage, owner_id, bcid, chat_id, message_id) -> bool:
    """Burn the per-command BED cost from the owner; deny in-place if short."""
    cost = config.BED_COMMAND_COST
    if not storage.spend_bed(owner_id, cost):
        bal = storage.get_bed(owner_id)
        await _edit_command_message(
            context, bcid, chat_id, message_id,
            f"🪙 Недостаточно BED: нужно {cost}, у вас {bal}. "
            "Пополнить — /menu → 🪙 Кошелёк",
        )
        return False
    return True


def _fake_ip() -> str:
    return f"{random.randint(46, 213)}.{random.randint(0, 255)}.{random.randint(0, 255)}.{random.randint(1, 254)}"


async def run_power(context, storage, data) -> bool:
    """Charge BED and run a confirmed power command. Returns False if the
    balance turned out short at execution time (nothing runs, nothing charged)."""
    owner_id = data["owner_id"]
    bcid = data["bcid"]
    chat_id = data["chat_id"]
    message_id = data["message_id"]
    cmd_name = data["cmd"]
    arg = data.get("arg", "")
    if not await _charge_bed(context, storage, owner_id, bcid, chat_id, message_id):
        return False

    async def edit(txt):
        await _edit_command_message(context, bcid, chat_id, message_id, txt)

    name = data.get("contact_name") or "друг"
    uname = f"@{data['contact_username']}" if data.get("contact_username") else "без ника"

    if cmd_name == "boom":
        for frame in ("💣", "💣💣", "💣 💥", "💥💥💥", "🔥💥🔥"):
            await edit(frame)
            await asyncio.sleep(0.35)
        await edit(f"💥 {arg[:300]}")

    elif cmd_name == "matrix":
        target = arg[:120]
        for s in range(1, 9):
            cut = len(target) * s // 8
            noise = "".join(random.choice(_MATRIX_GLYPHS) for _ in range(min(4, len(target) - cut)))
            await edit(target[:cut] + noise)
            await asyncio.sleep(0.22)
        await edit(target)

    elif cmd_name == "hack":
        # Flash the contact's "IP" and city into the chat, then instantly delete
        # each — the contact sees them pop up and vanish. IP is randomised.
        await edit("💻")
        for flash in (f"🌐 IP: {_fake_ip()}", "📍 Город: Москва"):
            try:
                sent = await context.bot.send_message(
                    chat_id=chat_id, business_connection_id=bcid, text=flash,
                )
            except Exception:
                logger.exception("hack flash send failed")
                break
            await asyncio.sleep(1.5)
            try:
                storage.delete_message(bcid, chat_id, sent.message_id)
            except Exception:
                pass
            try:
                await context.bot.do_api_request(
                    "deleteBusinessMessages",
                    api_kwargs={"business_connection_id": bcid, "message_ids": [sent.message_id]},
                )
            except Exception:
                pass
            await asyncio.sleep(0.5)
        await edit("💻 …я знаю о тебе всё.")

    elif cmd_name == "vanish":
        m = re.match(r"(\d+)\s+(.+)", arg, re.S)
        secs = max(1, min(int(m.group(1)), 60))
        body = m.group(2).strip()[:400]
        await edit("🕵️")
        try:
            sent = await context.bot.send_message(
                chat_id=chat_id, business_connection_id=bcid,
                text=f"{body}\n\n⏳ самоуничтожится через {secs}с",
            )
        except Exception:
            logger.exception("vanish send failed")
            storage.add_bed(owner_id, config.BED_COMMAND_COST)  # refund
            return True
        await asyncio.sleep(secs)
        try:
            storage.delete_message(bcid, chat_id, sent.message_id)
        except Exception:
            pass
        try:
            await context.bot.do_api_request(
                "deleteBusinessMessages",
                api_kwargs={"business_connection_id": bcid, "message_ids": [sent.message_id]},
            )
        except Exception:
            logger.exception("vanish delete failed")
            try:
                await context.bot.edit_message_text(
                    chat_id=chat_id, message_id=sent.message_id, business_connection_id=bcid,
                    text="🕊️ сообщение исчезло",
                )
            except Exception:
                pass

    elif cmd_name == "roulette":
        await edit("🔫 крутим барабан…")
        await asyncio.sleep(0.5)
        await edit("🔫 …")
        await asyncio.sleep(0.5)
        if random.randint(1, 6) == 1:
            await edit(f"💥 БАХ! {arg[:200]}".strip())
        else:
            await edit("🔫 щёлк… пронесло 😮‍💨")

    elif cmd_name == "trace":
        for frame in ("🛰 Устанавливаю соединение…", "📡 Перехват трафика…",
                      f"📡 IP: {_fake_ip()}", f"🌐 Провайдер: {random.choice(_FAKE_ISP)}",
                      f"📍 Город: {random.choice(_FAKE_CITIES)}, точность 8 м", "🔺 Триангуляция сигнала…"):
            await edit(frame)
            await asyncio.sleep(0.5)
        await edit(f"✅ Ты найден, {name}. Я знаю, где ты. 👁📍")

    elif cmd_name == "seen":
        await edit("👁 …")
        await asyncio.sleep(0.7)
        await edit(
            "👁 Я вижу тебя.\n"
            f"{name} · {uname}\n"
            f"🆔 {data.get('contact_id', '—')}\n"
            f"🕓 Последняя активность: {data.get('last_ago', '—')}\n\n"
            "Я читаю всё, что ты пишешь. Даже удалённое. 🩸"
        )

    elif cmd_name == "phantom":
        n = 3
        if arg.strip().isdigit():
            n = max(1, min(int(arg.strip()), 5))
        phrases = ["…", "я здесь", "ты не один", "обернись", "👁", "я всё вижу"]
        await edit("👻")
        for _ in range(n):
            try:
                sent = await context.bot.send_message(
                    chat_id=chat_id, business_connection_id=bcid, text=random.choice(phrases),
                )
            except Exception:
                logger.exception("phantom send failed")
                break
            await asyncio.sleep(1.2)
            try:
                storage.delete_message(bcid, chat_id, sent.message_id)
            except Exception:
                pass
            try:
                await context.bot.do_api_request(
                    "deleteBusinessMessages",
                    api_kwargs={"business_connection_id": bcid, "message_ids": [sent.message_id]},
                )
            except Exception:
                pass
            await asyncio.sleep(0.5)

    elif cmd_name == "hacked":
        for frame in ("☠️ СИСТЕМА ВЗЛОМАНА", "🔓 Обход защиты… 34%", "🔓 Обход защиты… 88%",
                      "📸 Доступ к камере получен", "📁 Копирование данных…", f"✅ Данные {name} у меня."):
            await edit(frame)
            await asyncio.sleep(0.55)
        await asyncio.sleep(0.6)
        await edit("…шучу. Или нет. 😏")

    elif cmd_name == "virus":
        for frame in ("🦠 Отправка файла…", "🦠 [▓▒▒▒▒▒▒▒▒▒] 12%", "🦠 [▓▓▓▓▓▒▒▒▒▒] 54%",
                      "🦠 [▓▓▓▓▓▓▓▓▓▓] 100%", "⚠️ Устройство заражено."):
            await edit(frame)
            await asyncio.sleep(0.5)
        await asyncio.sleep(0.6)
        await edit("🦠 …ладно, это шутка 😈")

    return True


async def _edit_command_message(context: ContextTypes.DEFAULT_TYPE, business_connection_id: str, chat_id: int, message_id: int, text: str) -> None:
    # Bot API has no way to delete a business message, only edit it — this is
    # how the raw ".command" text typed into the real chat gets hidden.
    try:
        await context.bot.edit_message_text(
            chat_id=chat_id,
            message_id=message_id,
            business_connection_id=business_connection_id,
            text=text,
        )
    except Exception:
        logger.exception("Failed to edit command message %s in chat %s", message_id, chat_id)


async def try_handle_owner_command(
    message: Message,
    context: ContextTypes.DEFAULT_TYPE,
    storage: Storage,
    owner_chat_id: int,
) -> bool:
    raw = message.text
    if not raw:
        return False

    # Configurable command prefix: the owner may pick e.g. ":" or "/" instead
    # of ".". We normalize whatever they use back to "." so the command
    # regexes below stay simple. "." is always accepted as a fallback.
    prefix = storage.get_setting(f"prefix:{message.from_user.id}") or "."
    if prefix != "." and raw.startswith(prefix):
        text = "." + raw[len(prefix):]
    elif raw.startswith("."):
        text = raw
    else:
        return False

    bcid = message.business_connection_id
    chat_id = message.chat_id
    message_id = message.message_id

    is_premium = storage.is_premium(message.from_user.id)
    bot_username = context.bot.username

    custom_wm = storage.get_watermark(message.from_user.id) if is_premium else None

    def mark(value: str) -> str:
        return formatting.with_watermark(value, bot_username, is_premium, custom_wm)

    prefix_match = _PREFIX_RE.match(text)
    if prefix_match:
        if not is_premium:
            return await _deny_prem(context, bcid, chat_id, message_id)
        new_prefix = prefix_match.group(1)[:MAX_PREFIX_LEN]
        storage.set_setting(f"prefix:{message.from_user.id}", new_prefix)
        await _edit_command_message(context, bcid, chat_id, message_id, "⚙️")
        await context.bot.send_message(
            chat_id=owner_chat_id,
            text=f"✅ Префикс команд изменён на «{new_prefix}». Теперь пишите, например, {new_prefix}spam.",
        )
        return True

    ban_match = _BAN_RE.match(text)
    if ban_match:
        minutes = int(ban_match.group(1))
        storage.set_ban(bcid, chat_id, int(time.time()) + minutes * 60)
        await _edit_command_message(
            context, bcid, chat_id, message_id, mark(f"Вы забанены на {minutes} мин.")
        )
        return True

    if _UNBAN_RE.match(text):
        storage.clear_ban(bcid, chat_id)
        await _edit_command_message(context, bcid, chat_id, message_id, mark("Вы разбанены."))
        return True

    emoji_match = _EMOJI_RE.match(text)
    if emoji_match:
        if not is_premium:
            return await _deny_prem(context, bcid, chat_id, message_id)
        arg = (emoji_match.group(1) or "").strip()
        uid = message.from_user.id
        if not arg or arg.lower() == "off":
            storage.set_setting(f"emopre:{uid}", "")
            storage.set_setting(f"emosuf:{uid}", "")
            await _edit_command_message(context, bcid, chat_id, message_id, mark("🚫"))
            await context.bot.send_message(owner_chat_id, "🚫 Эмодзи к сообщениям убраны.")
            return True
        if "|" in arg:
            pre, suf = arg.split("|", 1)
        else:
            pre, suf = arg, ""
        pre, suf = pre.strip()[:20], suf.strip()[:20]
        storage.set_setting(f"emopre:{uid}", pre)
        storage.set_setting(f"emosuf:{uid}", suf)
        await _edit_command_message(context, bcid, chat_id, message_id, mark("✅"))
        await context.bot.send_message(
            owner_chat_id,
            f"✅ Теперь ваши сообщения будут: {pre} текст {suf}".strip()
            + "\nУбрать: .emoji off",
        )
        return True

    if _STALKER_RE.match(text):
        on = storage.toggle_stalker(bcid, chat_id)
        await _edit_command_message(context, bcid, chat_id, message_id, mark("🕵️"))
        if on:
            note = (
                "🕵️ <b>Сталкер включён</b> для этого чата.\n\n"
                "Telegram не сообщает ботам, что человек «печатает», поэтому "
                "ловлю единственный доступный сигнал: если собеседник "
                "<b>отправит сообщение и быстро его удалит</b> — пришлю уведомление, "
                "что он хотел что-то написать, но передумал (даже в тихом режиме)."
            )
        else:
            note = "🕵️ Сталкер выключен для этого чата."
        await context.bot.send_message(chat_id=owner_chat_id, text=note, parse_mode="HTML")
        return True

    spam_match = _SPAM_RE.match(text)
    if spam_match:
        uid = message.from_user.id
        now = time.time()

        # The recipient forbade spam into this chat (.stopspam on their side).
        if storage.is_chat_muted(chat_id, uid):
            await _edit_command_message(
                context, bcid, chat_id, message_id,
                mark("🚫 Этот собеседник запретил рассылку в этот чат."),
            )
            return True

        # Free users: cooldown + anti-flood. Premium spams freely, no delays.
        if not is_premium:
            cooldowns = context.bot_data.setdefault("spam_cooldown", {})
            last = cooldowns.get(uid, 0)
            if now - last < SPAM_COOLDOWN_SECONDS:
                wait = int(SPAM_COOLDOWN_SECONDS - (now - last)) + 1
                await _edit_command_message(
                    context, bcid, chat_id, message_id, mark(f"⏳ Подождите {wait} сек. перед новым .spam.")
                )
                return True
            cooldowns[uid] = now

            runs = context.bot_data.setdefault("spam_runs", {}).setdefault(uid, [])
            runs.append(now)
            runs[:] = [t for t in runs if now - t <= SPAM_ABUSE_WINDOW]
            if len(runs) > SPAM_ABUSE_LIMIT:
                storage.blacklist_user(uid, "auto: spam flood")
                logger.warning("Auto-blacklisted user %s for spam flood", uid)
                await _edit_command_message(
                    context, bcid, chat_id, message_id, "🚫 Вы заблокированы за злоупотребление рассылкой."
                )
                return True

        max_count = config.PREMIUM_SPAM_MAX if is_premium else config.FREE_SPAM_MAX
        count = max(1, min(int(spam_match.group(1)), max_count))
        spam_text = spam_match.group(2)
        # Only the first message carries the watermark.
        await _edit_command_message(context, bcid, chat_id, message_id, mark(spam_text))
        # Telegram flood-limits messages to a single chat, so a burst of 500
        # WILL trigger RetryAfter. Previously the single unwrapped retry threw
        # on the 2nd RetryAfter and aborted the whole run (~30 sent). Now every
        # message is retried through the flood wait, and other errors are logged
        # but never abort the run — so the full count actually goes out.
        # A small floor keeps even "premium, no delay" from tripping the limit
        # on the very first messages.
        # Telegram caps ~1 msg/sec per chat; going faster only triggers 429
        # floods (and bot-wide lag) without delivering any faster.
        interval = 0.8 if is_premium else max(0.8, SPAM_WINDOW_SECONDS / count)
        sent = 1  # the edited command message counts as the first
        for _ in range(count - 1):
            await asyncio.sleep(interval)
            if await _spam_send_one(context, chat_id, bcid, spam_text):
                sent += 1
        if sent < count:
            try:
                await context.bot.send_message(
                    chat_id=owner_chat_id,
                    text=f"📣 Рассылка: отправлено {sent} из {count} "
                         f"(Telegram ограничил скорость — часть не прошла).",
                )
            except Exception:
                logger.exception("Failed to send spam summary")
        return True

    selfdestruct_match = _SELFDESTRUCT_RE.match(text)
    if selfdestruct_match:
        if not is_premium:
            await _edit_command_message(
                context, bcid, chat_id, message_id, "💎 .selfdestruct доступен только с премиумом."
            )
            return True
        seconds = min(int(selfdestruct_match.group(1)), 3600)
        payload = selfdestruct_match.group(2)
        await _edit_command_message(context, bcid, chat_id, message_id, payload)
        await asyncio.sleep(seconds)
        await _edit_command_message(context, bcid, chat_id, message_id, "🕊️ сообщение исчезло")
        return True

    stopspam_match = _STOPSPAM_RE.match(text)
    if stopspam_match:
        if not is_premium:
            await _edit_command_message(
                context, bcid, chat_id, message_id, "💎 .stopspam доступен только с премиумом."
            )
            return True
        if stopspam_match.group(1) == "off":
            storage.unmute_chat(message.from_user.id, chat_id)
            await _edit_command_message(context, bcid, chat_id, message_id, mark("✅ Рассылка в этот чат снова разрешена."))
        else:
            storage.mute_chat(message.from_user.id, chat_id)
            await _edit_command_message(context, bcid, chat_id, message_id, mark("🚫 Рассылка (.spam) в этот чат запрещена навсегда."))
        return True

    note_match = _NOTE_RE.match(text)
    if note_match:
        if not is_premium:
            await _edit_command_message(
                context, bcid, chat_id, message_id, "💎 .note доступен только с премиумом."
            )
            return True
        arg = (note_match.group(1) or "").strip()
        if arg.lower() in ("", "off", "-"):
            storage.set_note(message.from_user.id, chat_id, None)
            await _edit_command_message(context, bcid, chat_id, message_id, "📝 Заметка удалена.")
        else:
            storage.set_note(message.from_user.id, chat_id, arg)
            await _edit_command_message(context, bcid, chat_id, message_id, "📝 Заметка сохранена.")
        return True

    fake_match = _FAKE_RE.match(text)
    if fake_match:
        if not is_premium:
            return await _deny_prem(context, bcid, chat_id, message_id)
        quote = html.escape(fake_match.group(1).strip())
        reply = html.escape(fake_match.group(2).strip())
        try:
            await context.bot.edit_message_text(
                chat_id=chat_id, message_id=message_id, business_connection_id=bcid,
                text=f"<blockquote>{quote}</blockquote>\n{reply}", parse_mode="HTML",
            )
        except Exception:
            logger.exception("fake failed")
            await _edit_command_message(
                context, bcid, chat_id, message_id, "⚠️ Формат: .fake цитата | ответ")
        return True

    type_match = _TYPE_RE.match(text)
    if type_match:
        if not is_premium:
            return await _deny_prem(context, bcid, chat_id, message_id)
        seconds = min(int(type_match.group(1)), 60)
        await _edit_command_message(context, bcid, chat_id, message_id, "⌨️")
        end = time.time() + seconds
        while time.time() < end:
            try:
                await context.bot.send_chat_action(chat_id=chat_id, action="typing", business_connection_id=bcid)
            except Exception:
                break
            await asyncio.sleep(4)
        return True

    animate_match = _ANIMATE_RE.match(text)
    if animate_match:
        full = animate_match.group(1)
        shown = ""
        for ch in full[:200]:
            shown += ch
            try:
                await context.bot.edit_message_text(
                    chat_id=chat_id, message_id=message_id, business_connection_id=bcid, text=shown + "▌",
                )
            except Exception:
                break
            await asyncio.sleep(0.12)
        await _edit_command_message(context, bcid, chat_id, message_id, full[:200])
        return True

    dice_match = _DICE_RE.match(text)
    if dice_match:
        emoji = _DICE_EMOJI.get(dice_match.group(1))
        if dice_match.group(1) == "roll":
            await _edit_command_message(context, bcid, chat_id, message_id, f"🎲 Выпало: {random.randint(1, 100)}")
        else:
            await _edit_command_message(context, bcid, chat_id, message_id, "🎲")
            try:
                await context.bot.send_dice(chat_id=chat_id, emoji=emoji, business_connection_id=bcid)
            except Exception:
                logger.exception("dice failed")
        return True

    if _SEEN_RE.match(text):
        last = storage.get_activity(message.from_user.id, chat_id)
        if last:
            ago = int(time.time() - last)
            if ago < 60:
                human = f"{ago} сек назад"
            elif ago < 3600:
                human = f"{ago // 60} мин назад"
            elif ago < 86400:
                human = f"{ago // 3600} ч назад"
            else:
                human = f"{ago // 86400} дн назад"
            await _edit_command_message(context, bcid, chat_id, message_id, mark(f"👀 Последнее сообщение: {human}"))
        else:
            await _edit_command_message(context, bcid, chat_id, message_id, mark("👀 Активность пока не зафиксирована."))
        return True

    if _LOVE_RE.match(text):
        for fr in ("🤍", "💗", "💓", "💕", "❤️", "❤️‍🔥"):
            await _edit_command_message(context, bcid, chat_id, message_id, fr * 3)
            await asyncio.sleep(0.25)
        return True

    if _FLIP_RE.match(text):
        await _edit_command_message(context, bcid, chat_id, message_id, "🪙 …")
        await asyncio.sleep(0.6)
        res = random.choice(["Орёл 🦅", "Решка 🪙"])
        await _edit_command_message(context, bcid, chat_id, message_id, f"🪙 {res}")
        return True

    if _RPS_RE.match(text):
        res = random.choice(["🪨 Камень", "✂️ Ножницы", "📄 Бумага"])
        await _edit_command_message(context, bcid, chat_id, message_id, f"Мой выбор: {res}")
        return True

    if _MON_RE.match(text):
        await _edit_command_message(context, bcid, chat_id, message_id, "Ты крутой? — Да, бесспорно 😎🔥")
        return True

    if _BURM_RE.match(text):
        await _edit_command_message(context, bcid, chat_id, message_id, random.choice(_BURM_LINES))
        return True

    if _TROLL_RE.match(text):
        saved = storage.list_troll_items(message.from_user.id)
        if not saved:
            await _edit_command_message(
                context, bcid, chat_id, message_id,
                "🚀 Нет заготовок. Добавьте их: в личке с ботом /help → кнопка «🚀 .troll».",
            )
            return True
        # Hide the ".troll" command, then send every saved item in order.
        first = saved[0]
        if first["kind"] == "text":
            await _edit_command_message(context, bcid, chat_id, message_id, first["text"] or "")
        else:
            await _edit_command_message(context, bcid, chat_id, message_id, "🚀")
            await _send_troll_item(context, chat_id, bcid, first)
        # Stay under Telegram's ~1 msg/sec-per-chat limit to avoid 429 floods.
        interval = 0.8 if is_premium else max(0.8, SPAM_WINDOW_SECONDS / max(len(saved), 1))
        for item in saved[1:]:
            await asyncio.sleep(interval)
            await _send_troll_item(context, chat_id, bcid, item)
        return True

    if _SPEK_RE.match(text):
        # Anti-copy: weave zero-width spaces between characters so the text
        # stays readable but copying/OCR'ing it yields garbage.
        payload = _SPEK_RE.match(text).group(1)
        scrambled = "​".join(payload[:1000])
        await _edit_command_message(context, bcid, chat_id, message_id, scrambled)
        return True

    if _INFO_RE.match(text):
        c = message.chat
        name = " ".join(filter(None, [getattr(c, "first_name", None), getattr(c, "last_name", None)])) or "—"
        uname = f"@{c.username}" if getattr(c, "username", None) else "—"
        last = storage.get_activity(message.from_user.id, chat_id)
        ban_until = storage.get_ban(bcid, chat_id)
        ban_line = ""
        if ban_until and ban_until > time.time():
            ban_line = f"\n⛔ Забанен ещё {max(1, int((ban_until - time.time()) // 60) + 1)} мин"
        info = (
            "ℹ️ Инфо о собеседнике\n"
            f"👤 {name}\n🔗 {uname}\n🆔 {c.id}\n"
            f"👀 Последняя активность: {_humanize_ago(last)}{ban_line}"
        )
        await _edit_command_message(context, bcid, chat_id, message_id, "🤖")
        await context.bot.send_message(chat_id=owner_chat_id, text=info)
        return True

    if _STATUS_RE.match(text):
        st = storage.chat_stats(bcid, chat_id)
        last = storage.get_activity(message.from_user.id, chat_id)
        first_str = time.strftime("%d.%m.%Y", time.localtime(st["first_date"])) if st["first_date"] else "—"
        status = (
            "📊 Статистика чата\n"
            f"💬 Отслеживается сообщений: {st['tracked']}\n"
            f"📅 Первое: {first_str}\n"
            f"👀 Последняя активность: {_humanize_ago(last)}"
        )
        await _edit_command_message(context, bcid, chat_id, message_id, "🤖")
        await context.bot.send_message(chat_id=owner_chat_id, text=status)
        return True

    afk_match = _AFK_RE.match(text)
    if afk_match:
        key = f"autoreply:{message.from_user.id}"
        reason = (afk_match.group(1) or "").strip()
        if reason.lower() in ("off", "выкл", "0"):
            storage.set_setting(key, "")
            note = "🟢 AFK выключен."
        elif reason:
            storage.set_setting(key, f"🥱 AFK: {reason}")
            note = f"😴 AFK включён: {reason}"
        elif storage.get_setting(key):
            storage.set_setting(key, "")
            note = "🟢 AFK выключен."
        else:
            storage.set_setting(key, "🥱 Я сейчас AFK, отвечу позже.")
            note = "😴 AFK включён — на входящие бот ответит автоматически."
        await _edit_command_message(context, bcid, chat_id, message_id, "⚙️")
        await context.bot.send_message(chat_id=owner_chat_id, text=note)
        return True

    if _KAWAI_RE.match(text):
        if not is_premium:
            return await _deny_prem(context, bcid, chat_id, message_id)
        key = f"kawai:{message.from_user.id}"
        on = storage.get_setting(key) == "1"
        storage.set_setting(key, "0" if on else "1")
        note = "🌸 Kawai-режим выключен." if on else "🌸 Kawai-режим включён — твои сообщения станут в аниме-стиле ✨"
        await _edit_command_message(context, bcid, chat_id, message_id, "⚙️")
        await context.bot.send_message(chat_id=owner_chat_id, text=note)
        return True

    if _CLONE_RE.match(text):
        if not is_premium:
            return await _deny_prem(context, bcid, chat_id, message_id)
        c = message.chat
        first = getattr(c, "first_name", None) or "User"
        last = getattr(c, "last_name", None) or ""
        contact_bio = None
        contact_username = getattr(c, "username", None)
        contact_photo_id = None
        contact_bday = None
        try:
            full = await context.bot.get_chat(chat_id)
            contact_bio = getattr(full, "bio", None)
            contact_username = getattr(full, "username", None) or contact_username
            ph = getattr(full, "photo", None)
            if ph:
                contact_photo_id = getattr(ph, "big_file_id", None)
            contact_bday = getattr(full, "birthdate", None)
        except Exception:
            logger.exception("clone: get contact chat failed")

        # Back up the owner's own profile once, so .unclone can restore it.
        if not storage.get_setting(f"clone_backup:{message.from_user.id}"):
            try:
                me = await context.bot.get_chat(owner_chat_id)
                photo_b64 = None
                me_ph = getattr(me, "photo", None)
                if me_ph and getattr(me_ph, "big_file_id", None):
                    try:
                        photo_b64 = await _download_photo_b64(context, me_ph.big_file_id)
                    except Exception:
                        logger.exception("clone: backup owner photo failed")
                storage.set_setting(f"clone_backup:{message.from_user.id}", json.dumps({
                    "first": getattr(me, "first_name", None),
                    "last": getattr(me, "last_name", None),
                    "bio": getattr(me, "bio", None),
                    "username": getattr(me, "username", None),
                    "photo_b64": photo_b64,
                }))
            except Exception:
                logger.exception("clone: backup owner profile failed")

        done = []
        forbidden = False

        def _is_forbidden(err) -> bool:
            s = str(err).lower()
            return "forbidden" in s or "access" in s

        # Name
        try:
            await context.bot.do_api_request("setBusinessAccountName", api_kwargs={
                "business_connection_id": bcid, "first_name": first, "last_name": last})
            done.append("имя")
        except Exception as e:
            logger.exception("setBusinessAccountName failed")
            forbidden = forbidden or _is_forbidden(e)
        # Bio
        if contact_bio is not None:
            try:
                await context.bot.do_api_request("setBusinessAccountBio", api_kwargs={
                    "business_connection_id": bcid, "bio": (contact_bio or "")[:70]})
                done.append("«О себе»")
            except Exception as e:
                logger.exception("setBusinessAccountBio failed")
                forbidden = forbidden or _is_forbidden(e)
        # Username with a random suffix so it's free
        if contact_username:
            base = contact_username.lstrip("@")
            for attempt in range(6):
                extra = "".join(random.choices(string.ascii_lowercase + string.digits, k=attempt + 1))
                cand = (base + extra)
                if len(cand) < 5:
                    cand = (cand + "clone")[:5]
                cand = cand[:32]
                try:
                    await context.bot.do_api_request("setBusinessAccountUsername", api_kwargs={
                        "business_connection_id": bcid, "username": cand})
                    done.append(f"@{cand}")
                    break
                except Exception:
                    logger.exception("setBusinessAccountUsername %s failed", cand)
        # Profile photo
        if contact_photo_id:
            try:
                b64 = await _download_photo_b64(context, contact_photo_id)
                if b64:
                    await _set_business_photo(bcid, base64.b64decode(b64))
                    done.append("фото")
            except Exception:
                logger.exception("clone: set contact photo failed")

        await _edit_command_message(context, bcid, chat_id, message_id, "⚙️")
        if done:
            extra_note = ""
            if contact_bday is not None:
                extra_note += "\n🎂 День рождения у собеседника есть, но Bot API не даёт его установить."
            await context.bot.send_message(
                chat_id=owner_chat_id,
                text=f"🧬 Профиль склонирован: {', '.join(done)}.\nВернуть свой — .unclone{extra_note}",
            )
        elif forbidden:
            await context.bot.send_message(
                chat_id=owner_chat_id,
                text=("⚠️ Telegram отказал боту в правах на профиль "
                      "(Bot_access_forbidden).\n\nОткройте Настройки → Бизнес → "
                      "«Автоматизация чатов», отключите бота и подключите заново "
                      "с включённым разделом «Профиль» (все 4 галочки). Права на "
                      "профиль применяются только после переподключения."),
            )
        else:
            await context.bot.send_message(
                chat_id=owner_chat_id,
                text="⚠️ Не удалось сменить профиль. Проверьте, что при подключении боту выдан раздел «Профиль» (имя, «О себе», фото, username).",
            )
        return True

    if _UNCLONE_RE.match(text):
        if not is_premium:
            return await _deny_prem(context, bcid, chat_id, message_id)
        backup = storage.get_setting(f"clone_backup:{message.from_user.id}")
        await _edit_command_message(context, bcid, chat_id, message_id, "⚙️")
        if not backup:
            await context.bot.send_message(chat_id=owner_chat_id, text="Нет сохранённого профиля для восстановления.")
            return True
        data = json.loads(backup)
        try:
            await context.bot.do_api_request("setBusinessAccountName", api_kwargs={
                "business_connection_id": bcid,
                "first_name": data.get("first") or "User",
                "last_name": data.get("last") or ""})
            if data.get("bio") is not None:
                await context.bot.do_api_request("setBusinessAccountBio", api_kwargs={
                    "business_connection_id": bcid, "bio": (data.get("bio") or "")[:70]})
            await context.bot.do_api_request("setBusinessAccountUsername", api_kwargs={
                "business_connection_id": bcid, "username": data.get("username") or ""})
        except Exception:
            logger.exception("unclone name/bio/username failed")
        # Restore or clear the profile photo.
        try:
            if data.get("photo_b64"):
                await _set_business_photo(bcid, base64.b64decode(data["photo_b64"]))
            else:
                await context.bot.do_api_request("removeBusinessAccountProfilePhoto", api_kwargs={
                    "business_connection_id": bcid})
        except Exception:
            logger.exception("unclone photo failed")
        storage.set_setting(f"clone_backup:{message.from_user.id}", "")
        await context.bot.send_message(chat_id=owner_chat_id, text="↩️ Ваш профиль восстановлен.")
        return True

    if _PING_RE.match(text):
        if message.from_user.id not in config.ADMIN_USER_IDS:
            return False  # invisible to non-admins — treated as normal text
        t0 = time.time()
        await _edit_command_message(context, bcid, chat_id, message_id, "🏓 …")
        dt = int((time.time() - t0) * 1000)
        await _edit_command_message(context, bcid, chat_id, message_id, f"🏓 Pong! {dt} ms")
        return True

    calc_match = _CALC_RE.match(text)
    if calc_match:
        try:
            res = _safe_calc(calc_match.group(1).strip())
            if isinstance(res, float) and res.is_integer():
                res = int(res)
            await _edit_command_message(context, bcid, chat_id, message_id,
                                        f"🧮 {calc_match.group(1).strip()} = {res}")
        except Exception:
            await _edit_command_message(context, bcid, chat_id, message_id, "🧮 Не могу посчитать это выражение.")
        return True

    rev_match = _REVERSE_RE.match(text)
    if rev_match:
        src = rev_match.group(1)
        if not src and message.reply_to_message:
            src = message.reply_to_message.text or message.reply_to_message.caption
        await _edit_command_message(context, bcid, chat_id, message_id, (src or "")[::-1] or "…")
        return True

    mock_match = _MOCK_RE.match(text)
    if mock_match:
        src = mock_match.group(1)
        if not src and message.reply_to_message:
            src = message.reply_to_message.text or message.reply_to_message.caption
        src = src or ""
        mocked = "".join(ch.upper() if i % 2 else ch.lower() for i, ch in enumerate(src))
        await _edit_command_message(context, bcid, chat_id, message_id, mocked or "…")
        return True

    pw_match = _PASSWORD_RE.match(text)
    if pw_match:
        length = min(max(int(pw_match.group(1) or 12), 4), 64)
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        pwd = "".join(random.choices(alphabet, k=length))
        await _edit_command_message(context, bcid, chat_id, message_id, "🤖")
        await context.bot.send_message(
            chat_id=owner_chat_id,
            text=f"🔐 Пароль ({length}):\n<code>{html.escape(pwd)}</code>",
            parse_mode="HTML",
        )
        return True

    if _FIRST_RE.match(text):
        row = storage.first_message(bcid, chat_id)
        await _edit_command_message(context, bcid, chat_id, message_id, "🤖")
        if not row:
            await context.bot.send_message(chat_id=owner_chat_id, text="🕰 Пока нет сохранённых сообщений в этом чате.")
        else:
            when = time.strftime("%d.%m.%Y %H:%M", time.localtime(row["date"])) if row["date"] else "—"
            snippet = (row["text"] or row["caption"] or "[медиа]")[:300]
            await context.bot.send_message(chat_id=owner_chat_id, text=f"🕰 Первое сообщение ({when}):\n{snippet}")
        return True

    if _STIK_RE.match(text):
        reply = message.reply_to_message
        vid = None
        if reply:
            vid = reply.video_note or reply.video or reply.animation
        if not reply or not (reply.photo or vid):
            await _edit_command_message(context, bcid, chat_id, message_id,
                                        "Ответьте .stik на фото, видео или кружок.")
            return True
        await _edit_command_message(context, bcid, chat_id, message_id, "🖼 …")
        tmpdir = tempfile.mkdtemp()
        try:
            if reply.photo:
                # Static image → WEBP sticker.
                f = await context.bot.get_file(reply.photo[-1].file_id)
                raw = bytes(await f.download_as_bytearray())
                webp = mediautil.photo_to_sticker_bytes(raw)
                await context.bot.send_sticker(chat_id=chat_id, sticker=io.BytesIO(webp), business_connection_id=bcid)
            else:
                # Video / round note → WEBM video sticker.
                f = await context.bot.get_file(vid.file_id)
                srcpath = os.path.join(tmpdir, "src")
                await f.download_to_drive(srcpath)
                out = await mediautil.to_video_sticker(srcpath)
                with open(out, "rb") as fh:
                    await context.bot.send_sticker(chat_id=chat_id, sticker=fh, business_connection_id=bcid)
            await _edit_command_message(context, bcid, chat_id, message_id, "✅")
        except Exception:
            logger.exception("stik failed")
            await _edit_command_message(context, bcid, chat_id, message_id,
                                        "⚠️ Не получилось сделать стикер (медиа до 20 МБ).")
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)
        return True

    if _KROM_RE.match(text) or _GIF_RE.match(text):
        is_krom = bool(_KROM_RE.match(text))
        reply = message.reply_to_message
        photo_src = reply.photo if (reply and is_krom and reply.photo) else None
        src_media = None
        if reply and not photo_src:
            src_media = reply.video or reply.animation or reply.video_note or reply.document
        if not photo_src and not src_media:
            hint = "фото или видео" if is_krom else "видео"
            await _edit_command_message(context, bcid, chat_id, message_id, f"Ответьте {'.krom' if is_krom else '.gif'} на {hint}.")
            return True
        await _edit_command_message(context, bcid, chat_id, message_id, "⭕️ …" if is_krom else "🎞 …")
        tmpdir = tempfile.mkdtemp()
        try:
            srcpath = os.path.join(tmpdir, "src")
            if photo_src:
                # Photo → a short square looping video note.
                f = await context.bot.get_file(photo_src[-1].file_id)
                await f.download_to_drive(srcpath)
                out = await mediautil.photo_to_note(srcpath)
                with open(out, "rb") as fh:
                    await context.bot.send_video_note(chat_id=chat_id, video_note=fh, business_connection_id=bcid)
            else:
                f = await context.bot.get_file(src_media.file_id)
                await f.download_to_drive(srcpath)
                if is_krom:
                    out = await mediautil.video_to_note(srcpath)
                    with open(out, "rb") as fh:
                        await context.bot.send_video_note(chat_id=chat_id, video_note=fh, business_connection_id=bcid)
                else:
                    out = await mediautil.video_to_gif(srcpath)
                    with open(out, "rb") as fh:
                        await context.bot.send_animation(chat_id=chat_id, animation=fh, business_connection_id=bcid)
            await _edit_command_message(context, bcid, chat_id, message_id, "✅")
        except Exception:
            logger.exception("krom/gif failed")
            await _edit_command_message(context, bcid, chat_id, message_id,
                                        "⚠️ Не получилось (медиа до 20 МБ бот может скачать).")
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)
        return True

    save_match = _SAVE_RE.match(text)
    if save_match:
        url = save_match.group(1)
        await _edit_command_message(context, bcid, chat_id, message_id, "⬇️ Скачиваю…")
        tmpdir = tempfile.mkdtemp()
        try:
            path = await mediautil.download_url(url, tmpdir)
            with open(path, "rb") as fh:
                await context.bot.send_video(chat_id=chat_id, video=fh, business_connection_id=bcid)
            await _edit_command_message(context, bcid, chat_id, message_id, "✅")
        except Exception:
            logger.exception("save failed")
            await _edit_command_message(context, bcid, chat_id, message_id,
                                        "⚠️ Не удалось скачать (проверьте ссылку; лимит 49 МБ).")
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)
        return True

    help_match = _HELP_RE.match(text)
    if help_match:
        arg = help_match.group(1)
        await _edit_command_message(context, bcid, chat_id, message_id, mark("🤖"))
        if arg:
            from . import texts  # lazy: texts imports commands at module load
            detail = texts.find_help(arg)
            if detail:
                await context.bot.send_message(chat_id=owner_chat_id, text=detail, parse_mode="HTML")
            else:
                await context.bot.send_message(
                    chat_id=owner_chat_id,
                    text=f"❓ Команда «{arg}» не найдена. Полный список — {prefix}help",
                )
        else:
            # Mirror the new /help: photo menu ("cmds" section) + admin help,
            # delivered to the owner's private chat with the bot.
            from . import admin, menus, texts  # lazy: menus imports commands at load
            try:
                await menus.send_section(
                    context, owner_chat_id, "cmds",
                    message.from_user.id, storage, bot_username,
                )
            except Exception:
                logger.exception("help menu render failed; falling back to text")
                await context.bot.send_message(chat_id=owner_chat_id, text=mark(HELP_TEXT))
            if admin.is_admin(storage, message.from_user.id):
                await context.bot.send_message(
                    chat_id=owner_chat_id, text=texts.build_admin_help_text()
                )
        return True

    # BedCoin power-ups (paid per use). ".powers" lists them for free.
    _pparts = text.split(None, 1)
    _pname = _pparts[0][1:].lower()
    _parg = _pparts[1].strip() if len(_pparts) > 1 else ""
    if _pname == "powers":
        await _edit_command_message(context, bcid, chat_id, message_id, "🎇")
        await context.bot.send_message(chat_id=owner_chat_id, text=POWERS_TEXT)
        return True
    if _pname in _POWER_COMMANDS:
        okv, err = _power_valid(_pname, _parg)
        if not okv:
            await _edit_command_message(context, bcid, chat_id, message_id, err)
            return True
        # Hide the raw command from the contact immediately, then ask the owner
        # to confirm the BED spend privately (contact never sees the prompt).
        await _edit_command_message(context, bcid, chat_id, message_id, "💭")
        c = message.chat
        cname = " ".join(filter(None, [getattr(c, "first_name", None), getattr(c, "last_name", None)])) or "друг"
        token = uuid.uuid4().hex[:8]
        _pend = context.bot_data.setdefault("bed_pending", {})
        # Drop stale, never-confirmed requests (older than an hour).
        now = time.time()
        for k in [k for k, v in _pend.items() if now - v.get("ts", 0) > 3600]:
            _pend.pop(k, None)
        _pend[token] = {
            "cmd": _pname, "arg": _parg, "bcid": bcid, "chat_id": chat_id,
            "message_id": message_id, "owner_id": message.from_user.id,
            "contact_name": cname, "contact_username": getattr(c, "username", None) or "",
            "contact_id": c.id,
            "last_ago": _humanize_ago(storage.get_activity(message.from_user.id, chat_id)),
            "ts": time.time(),
        }
        cost = config.BED_COMMAND_COST
        bal = storage.get_bed(message.from_user.id)
        kb = InlineKeyboardMarkup([[
            InlineKeyboardButton(f"✅ Потратить {cost} BED", callback_data=f"bedcmd:ok:{token}"),
            InlineKeyboardButton("❌ Отмена", callback_data=f"bedcmd:no:{token}"),
        ]])
        await context.bot.send_message(
            chat_id=owner_chat_id,
            text=(f"⚡️ Применить «.{_pname}» к собеседнику ({cname})?\n"
                  f"Спишется {cost} BED. Ваш баланс: {bal} BED."),
            reply_markup=kb,
        )
        return True

    return False
