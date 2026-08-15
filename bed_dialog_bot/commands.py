import asyncio
import logging
import random
import re
import time

from telegram import Message
from telegram.error import RetryAfter
from telegram.ext import ContextTypes

from . import config, formatting
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
_HELP_RE = re.compile(r"^\.help\s*$")
_SELFDESTRUCT_RE = re.compile(r"^\.selfdestruct\s+(\d+)\s+(.+)$", re.DOTALL)
_NOTE_RE = re.compile(r"^\.note(?:\s+(.*))?$", re.DOTALL)
_STOPSPAM_RE = re.compile(r"^\.stopspam(?:\s+(off))?\s*$")
_FAKE_RE = re.compile(r"^\.fake\s+(.+?)\s*\|\s*(.+)$", re.DOTALL)
_TYPE_RE = re.compile(r"^\.type\s+(\d+)\s*$")
_ANIMATE_RE = re.compile(r"^\.animate\s+(.+)$", re.DOTALL)
_DICE_RE = re.compile(r"^\.(dice|slot|roll|dart|ball|foot)\s*$")
_SEEN_RE = re.compile(r"^\.seen\s*$")

# Extra fun/utility commands ("borrowed" NeverDialog set).
_LOVE_RE = re.compile(r"^\.love\s*$")
_FLIP_RE = re.compile(r"^\.flip\s*$")
_RPS_RE = re.compile(r"^\.rps\s*$")
_MON_RE = re.compile(r"^\.mon\s*$")
_BURM_RE = re.compile(r"^\.бурмалда\s*$")
_TROLL_RE = re.compile(r"^\.troll\s*$")
_INFO_RE = re.compile(r"^\.info\s*$")
_STATUS_RE = re.compile(r"^\.status\s*$")
_AFK_RE = re.compile(r"^\.afk\s*$")
_KAWAI_RE = re.compile(r"^\.kawai\s*$")
_SPEK_RE = re.compile(r"^\.spek\s+(.+)$", re.DOTALL)

_DICE_EMOJI = {"dice": "🎲", "slot": "🎰", "dart": "🎯", "ball": "🏀", "foot": "⚽"}

_TROLL_LINES = [
    "Ты сегодня медленный, как черепаха на пенсии 🐢",
    "С таким подходом далеко не уедешь 😏",
    "Ну это было слабенько, признай 😅",
    "Я в тебя верил... зря 🥲",
    "Твой уровень: чуть выше картошки 🥔",
]

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


def kawaii_style(text: str) -> str:
    """Turn plain text into a soft 'kawaii' variant for .kawai mode."""
    faces = ["(◕‿◕)", "(=^･ω･^=)", "♡", "(｡•̀ᴗ-)✧", "ヾ(＾∇＾)", "(づ｡◕‿‿◕｡)づ"]
    body = text.replace("!", "~!").replace(".", "～ ")
    return f"{body} {random.choice(faces)}"

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
    ".kawai — вкл/выкл аниме-стиль ваших сообщений\n"
    ".spek <текст> — текст, который трудно скопировать\n"
    ".troll — подколоть собеседника\n"
    ".love · .flip · .rps · .mon · .бурмалда — приколы и игры\n"
    ".help — этот список команд"
)


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
    text = message.text
    if not text or not text.startswith("."):
        return False

    bcid = message.business_connection_id
    chat_id = message.chat_id
    message_id = message.message_id

    is_premium = storage.is_premium(message.from_user.id)
    bot_username = context.bot.username

    custom_wm = storage.get_watermark(message.from_user.id) if is_premium else None

    def mark(value: str) -> str:
        return formatting.with_watermark(value, bot_username, is_premium, custom_wm)

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
        interval = 0 if is_premium else SPAM_WINDOW_SECONDS / count
        for _ in range(count - 1):
            if interval:
                await asyncio.sleep(interval)
            try:
                await context.bot.send_message(chat_id=chat_id, business_connection_id=bcid, text=spam_text)
            except RetryAfter as e:
                await asyncio.sleep(e.retry_after)
                await context.bot.send_message(chat_id=chat_id, business_connection_id=bcid, text=spam_text)
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
        import html
        quote = html.escape(fake_match.group(1).strip())
        reply = html.escape(fake_match.group(2).strip())
        try:
            await context.bot.edit_message_text(
                chat_id=chat_id, message_id=message_id, business_connection_id=bcid,
                text=f"<blockquote>{quote}</blockquote>\n{reply}", parse_mode="HTML",
            )
        except Exception:
            logger.exception("fake failed")
        return True

    type_match = _TYPE_RE.match(text)
    if type_match:
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
            import random
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
        await _edit_command_message(context, bcid, chat_id, message_id, random.choice(_TROLL_LINES))
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

    if _AFK_RE.match(text):
        key = f"autoreply:{message.from_user.id}"
        if storage.get_setting(key):
            storage.set_setting(key, "")
            note = "🟢 AFK выключен."
        else:
            storage.set_setting(key, "🥱 Я сейчас AFK, отвечу позже.")
            note = "😴 AFK включён — на входящие бот ответит автоматически."
        await _edit_command_message(context, bcid, chat_id, message_id, "⚙️")
        await context.bot.send_message(chat_id=owner_chat_id, text=note)
        return True

    if _KAWAI_RE.match(text):
        key = f"kawai:{message.from_user.id}"
        on = storage.get_setting(key) == "1"
        storage.set_setting(key, "0" if on else "1")
        note = "🌸 Kawai-режим выключен." if on else "🌸 Kawai-режим включён — твои сообщения станут в аниме-стиле ✨"
        await _edit_command_message(context, bcid, chat_id, message_id, "⚙️")
        await context.bot.send_message(chat_id=owner_chat_id, text=note)
        return True

    if _HELP_RE.match(text):
        await _edit_command_message(context, bcid, chat_id, message_id, mark("🤖"))
        await context.bot.send_message(chat_id=owner_chat_id, text=mark(HELP_TEXT))
        return True

    return False
