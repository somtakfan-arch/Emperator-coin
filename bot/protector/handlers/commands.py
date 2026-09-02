"""Команды администраторов чата."""

from __future__ import annotations

import html
import time

from aiogram import Bot, F, Router
from aiogram.dispatcher.event.bases import SkipHandler
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import Message, User

from .. import moderation
from ..config import DEFAULT_SETTINGS, SETTINGS_HELP, coerce_setting
from ..guard import Guard

router = Router(name="commands")

HELP = """🛡 <b>Bed Protector</b> — защита чата от рейдов, спама и сносеров.

<b>Автоматика</b> (работает без команд):
• капча на входе — боты и «одноразовые» аккаунты отсеиваются;
• антифлуд — мут за серию сообщений подряд;
• антиспам — ссылки, инвайты, стоп-слова, капс, эмодзи-флуд, невидимые символы;
• антирейд — при массовом входе включается карантин;
• антиснос — тревога, если админ выносит участников пачкой.

<b>Команды админов</b>
/status — проверить права бота
/settings — все настройки чата
/set ключ значение — изменить настройку
/warn [причина] — предупреждение (ответом)
/unwarn, /warns — снять / показать предупреждения
/mute [минуты], /unmute — мут (ответом)
/ban [минуты], /unban, /kick — блокировки
/trust, /untrust — пометить участника доверенным
/lock [минуты], /unlock — карантин вручную
/stats [часов] — сводка событий
/id — узнать свой ID и ID чата
"""


async def _require_admin(message: Message, guard: Guard, bot: Bot) -> bool:
    """Не админ — не обрабатываем, но и не съедаем сообщение."""
    user = message.from_user
    if user is None:
        raise SkipHandler
    if guard.is_owner(user.id):
        return True
    if message.chat.type == "private":
        return True
    if await moderation.is_admin(bot, message.chat.id, user.id):
        return True
    raise SkipHandler


async def _resolve_target(message: Message, command: CommandObject | None) -> User | None:
    target = await moderation.target_user(message)
    if target:
        return target
    if command and command.args:
        head = command.args.split()[0]
        if head.lstrip("-").isdigit():
            return User(id=int(head), is_bot=False, first_name=head)
    return None


def _minutes_arg(command: CommandObject | None, default: int) -> int:
    if not command or not command.args:
        return default
    for part in command.args.split():
        if part.isdigit():
            return int(part)
    return default


def _reason_arg(command: CommandObject | None) -> str:
    if not command or not command.args:
        return "без указания причины"
    words = [w for w in command.args.split() if not w.lstrip("-").isdigit()]
    return " ".join(words) or "без указания причины"


@router.message(CommandStart())
@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    await message.answer(HELP, disable_web_page_preview=True)


@router.message(Command("id"))
async def cmd_id(message: Message) -> None:
    await message.answer(
        f"Твой ID: <code>{message.from_user.id}</code>\n"
        f"ID чата: <code>{message.chat.id}</code>"
    )


@router.message(Command("status"))
async def cmd_status(message: Message, guard: Guard, bot: Bot) -> None:
    await _require_admin(message, guard, bot)
    if message.chat.type == "private":
        await message.answer("Команда работает в группе, куда добавлен бот.")
        return
    me = await bot.get_chat_member(message.chat.id, bot.id)
    needed = {
        "can_delete_messages": "удаление сообщений",
        "can_restrict_members": "блокировка участников",
        "can_invite_users": "приглашение по ссылке",
    }
    lines = [f"Статус бота: <b>{me.status}</b>"]
    missing = []
    for attr, title in needed.items():
        ok = bool(getattr(me, attr, False))
        lines.append(f"{'✅' if ok else '❌'} {title}")
        if not ok:
            missing.append(title)
    lock = guard.runtime.lockdown(message.chat.id)
    lines.append(f"Карантин: {'🔒 активен — ' + lock.reason if lock.active() else '—'}")
    if missing:
        lines.append("\n⚠️ Без прав «" + "», «".join(missing) + "» защита работает не полностью.")
    await message.answer("\n".join(lines))


@router.message(Command("settings"))
async def cmd_settings(message: Message, guard: Guard, bot: Bot) -> None:
    await _require_admin(message, guard, bot)
    cfg = guard.settings(message.chat.id)
    lines = ["⚙️ <b>Настройки чата</b> (менять: /set ключ значение)", ""]
    for key, value in cfg.items():
        shown = {True: "on", False: "off"}.get(value, value)
        changed = "" if DEFAULT_SETTINGS[key] == value else " ←"
        lines.append(f"<code>{key}</code> = <b>{shown}</b>{changed} — {SETTINGS_HELP[key]}")
    await message.answer("\n".join(lines))


@router.message(Command("set"))
async def cmd_set(message: Message, command: CommandObject, guard: Guard, bot: Bot) -> None:
    await _require_admin(message, guard, bot)
    parts = (command.args or "").split(maxsplit=1)
    if len(parts) != 2:
        await message.answer("Формат: <code>/set ключ значение</code>. Список — /settings")
        return
    key, raw = parts[0].lower(), parts[1]
    try:
        value = coerce_setting(key, raw)
    except KeyError:
        await message.answer(f"Нет такой настройки: <code>{html.escape(key)}</code>")
        return
    except ValueError as err:
        await message.answer(f"Неверное значение: {err}")
        return
    guard.storage.set_setting(message.chat.id, key, value)
    shown = {True: "on", False: "off"}.get(value, value)
    await message.answer(f"✅ <code>{key}</code> = <b>{shown}</b>")


@router.message(Command("warn"))
async def cmd_warn(message: Message, command: CommandObject, guard: Guard, bot: Bot) -> None:
    await _require_admin(message, guard, bot)
    target = await _resolve_target(message, command)
    if target is None:
        await message.answer("Ответь на сообщение нарушителя: <code>/warn причина</code>")
        return
    cfg = guard.settings(message.chat.id)
    reason = _reason_arg(command)
    count = guard.storage.add_warn(message.chat.id, target.id, message.from_user.id, reason)
    limit = int(cfg["warn_limit"])
    if count >= limit:
        guard.storage.clear_warns(message.chat.id, target.id)
        applied = await moderation.apply_action(
            bot, str(cfg["warn_action"]), message.chat.id, target.id, mute_minutes=60
        )
        await message.answer(
            f"🛡 {moderation.mention(target)}: {count}/{limit} — {applied}. "
            f"Причина: {html.escape(reason)}"
        )
        await guard.record(message.chat.id, target.id, "warn_limit", f"{reason} → {applied}")
        return
    await message.answer(
        f"⚠️ {moderation.mention(target)}: предупреждение {count}/{limit}. "
        f"Причина: {html.escape(reason)}"
    )
    await guard.record(message.chat.id, target.id, "warn", reason, notify=False)


@router.message(Command("unwarn"))
async def cmd_unwarn(message: Message, command: CommandObject, guard: Guard, bot: Bot) -> None:
    await _require_admin(message, guard, bot)
    target = await _resolve_target(message, command)
    if target is None:
        await message.answer("Ответь на сообщение участника.")
        return
    left = guard.storage.pop_warn(message.chat.id, target.id)
    await message.answer(f"Снято. Осталось предупреждений: <b>{left}</b>")


@router.message(Command("warns"))
async def cmd_warns(message: Message, command: CommandObject, guard: Guard, bot: Bot) -> None:
    await _require_admin(message, guard, bot)
    target = await _resolve_target(message, command) or message.from_user
    count = guard.storage.count_warns(message.chat.id, target.id)
    limit = int(guard.settings(message.chat.id)["warn_limit"])
    await message.answer(f"{moderation.mention(target)}: <b>{count}/{limit}</b> предупреждений")


@router.message(Command("mute"))
async def cmd_mute(message: Message, command: CommandObject, guard: Guard, bot: Bot) -> None:
    await _require_admin(message, guard, bot)
    target = await _resolve_target(message, command)
    if target is None:
        await message.answer("Ответь на сообщение: <code>/mute 60 причина</code>")
        return
    minutes = _minutes_arg(command, 60)
    if await moderation.mute(bot, message.chat.id, target.id, minutes):
        await message.answer(
            f"🔇 {moderation.mention(target)} — мут на "
            + (f"{minutes} мин" if minutes else "неопределённый срок")
        )
        await guard.record(message.chat.id, target.id, "mute", _reason_arg(command))
    else:
        await message.answer("Не получилось. Проверь права бота: /status")


@router.message(Command("unmute"))
async def cmd_unmute(message: Message, command: CommandObject, guard: Guard, bot: Bot) -> None:
    await _require_admin(message, guard, bot)
    target = await _resolve_target(message, command)
    if target is None:
        await message.answer("Ответь на сообщение участника.")
        return
    await moderation.unmute(bot, message.chat.id, target.id)
    await message.answer(f"🔈 {moderation.mention(target)} снова может писать")


@router.message(Command("ban"))
async def cmd_ban(message: Message, command: CommandObject, guard: Guard, bot: Bot) -> None:
    await _require_admin(message, guard, bot)
    target = await _resolve_target(message, command)
    if target is None:
        await message.answer("Ответь на сообщение: <code>/ban [минуты] причина</code>")
        return
    minutes = _minutes_arg(command, 0)
    if await moderation.ban(bot, message.chat.id, target.id, minutes):
        await message.answer(
            f"⛔️ {moderation.mention(target)} — бан"
            + (f" на {minutes} мин" if minutes else " навсегда")
        )
        await guard.record(message.chat.id, target.id, "ban", _reason_arg(command))
    else:
        await message.answer("Не получилось. Проверь права бота: /status")


@router.message(Command("unban"))
async def cmd_unban(message: Message, command: CommandObject, guard: Guard, bot: Bot) -> None:
    await _require_admin(message, guard, bot)
    target = await _resolve_target(message, command)
    if target is None:
        await message.answer("Укажи ID: <code>/unban 123456789</code>")
        return
    await moderation.unban(bot, message.chat.id, target.id)
    await message.answer(f"✅ Разбанен: <code>{target.id}</code>")


@router.message(Command("kick"))
async def cmd_kick(message: Message, command: CommandObject, guard: Guard, bot: Bot) -> None:
    await _require_admin(message, guard, bot)
    target = await _resolve_target(message, command)
    if target is None:
        await message.answer("Ответь на сообщение участника.")
        return
    await moderation.kick(bot, message.chat.id, target.id)
    await message.answer(f"👋 {moderation.mention(target)} исключён")
    await guard.record(message.chat.id, target.id, "kick", _reason_arg(command))


@router.message(Command("trust"))
async def cmd_trust(message: Message, command: CommandObject, guard: Guard, bot: Bot) -> None:
    await _require_admin(message, guard, bot)
    target = await _resolve_target(message, command)
    if target is None:
        await message.answer("Ответь на сообщение участника.")
        return
    guard.storage.set_trusted(message.chat.id, target.id, True)
    await message.answer(f"✅ {moderation.mention(target)} — доверенный, фильтры для новичков сняты")


@router.message(Command("untrust"))
async def cmd_untrust(message: Message, command: CommandObject, guard: Guard, bot: Bot) -> None:
    await _require_admin(message, guard, bot)
    target = await _resolve_target(message, command)
    if target is None:
        await message.answer("Ответь на сообщение участника.")
        return
    guard.storage.set_trusted(message.chat.id, target.id, False)
    await message.answer(f"↩️ {moderation.mention(target)} снова под общими правилами")


@router.message(Command("lock"))
async def cmd_lock(message: Message, command: CommandObject, guard: Guard, bot: Bot) -> None:
    await _require_admin(message, guard, bot)
    minutes = _minutes_arg(command, int(guard.settings(message.chat.id)["raid_lockdown_minutes"]))
    guard.runtime.start_lockdown(message.chat.id, minutes, "включён вручную")
    await message.answer(
        f"🔒 Карантин на {minutes} мин: новые участники не смогут писать до одобрения админом."
    )
    await guard.record(message.chat.id, message.from_user.id, "lockdown_on", f"{minutes} мин")


@router.message(Command("unlock"))
async def cmd_unlock(message: Message, guard: Guard, bot: Bot) -> None:
    await _require_admin(message, guard, bot)
    guard.runtime.stop_lockdown(message.chat.id)
    await message.answer("🔓 Карантин снят.")
    await guard.record(message.chat.id, message.from_user.id, "lockdown_off", "", notify=False)


@router.message(Command("stats"))
async def cmd_stats(message: Message, command: CommandObject, guard: Guard, bot: Bot) -> None:
    await _require_admin(message, guard, bot)
    hours = _minutes_arg(command, 24)
    rows = guard.storage.stats(message.chat.id, int(time.time()) - hours * 3600)
    if not rows:
        await message.answer(f"За последние {hours} ч. событий не было. Тихо. 🛡")
        return
    body = "\n".join(f"• {kind}: <b>{count}</b>" for kind, count in rows)
    await message.answer(f"📊 За последние {hours} ч.:\n{body}")


@router.message(F.chat.type == "private")
async def private_fallback(message: Message) -> None:
    await message.answer(
        "Добавь меня в свою группу и выдай права администратора "
        "(удаление сообщений + блокировка участников). Справка: /help"
    )
