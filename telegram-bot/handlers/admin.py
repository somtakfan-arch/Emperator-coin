from aiogram import Bot, F, Router
from aiogram.filters import BaseFilter, Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message, TelegramObject

import database as db
from config import ADMIN_IDS
from handlers.states import AdminStates
from handlers.utils import safe_edit
from keyboards import admin_back_kb, admin_panel_kb

router = Router()


class IsAdmin(BaseFilter):
    async def __call__(self, event: TelegramObject) -> bool:
        user = getattr(event, "from_user", None)
        return user is not None and user.id in ADMIN_IDS


# Applied at router level: every handler below is unreachable for non-admins,
# so a missed decorator can never expose the panel.
router.message.filter(IsAdmin())
router.callback_query.filter(IsAdmin())

PANEL_TEXT = "🛠 <b>Админ-панель</b>\n\nВыберите действие:"


@router.message(Command("admin"))
async def cmd_admin(message: Message, state: FSMContext) -> None:
    await state.clear()
    await message.answer(PANEL_TEXT, reply_markup=admin_panel_kb())


@router.callback_query(F.data == "admin:panel")
async def cb_panel(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await safe_edit(callback.message, PANEL_TEXT, reply_markup=admin_panel_kb())
    await callback.answer()


# --- Granting chips ----------------------------------------------------

GRANT_PROMPT = (
    "💸 <b>Выдача фишек</b>\n\n"
    "Отправьте: <code>кому сколько</code>\n"
    "«Кому» — числовой ID или @username, «сколько» — число "
    "(отрицательное списывает).\n\n"
    "Примеры:\n"
    "<code>7563505180 5000</code>\n"
    "<code>@vasya -250</code>"
)


@router.callback_query(F.data == "admin:grant")
async def cb_grant(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(AdminStates.waiting_grant)
    await safe_edit(callback.message, GRANT_PROMPT, reply_markup=admin_back_kb())
    await callback.answer()


@router.message(AdminStates.waiting_grant)
async def process_grant(message: Message, state: FSMContext, bot: Bot) -> None:
    parts = (message.text or "").split()
    if len(parts) != 2:
        await message.answer(
            "Нужно два значения через пробел: кому и сколько.", reply_markup=admin_back_kb()
        )
        return

    target, raw_amount = parts
    try:
        amount = int(raw_amount)
    except ValueError:
        await message.answer("Количество должно быть числом.", reply_markup=admin_back_kb())
        return

    if amount == 0:
        await message.answer("Ноль выдавать нечего.", reply_markup=admin_back_kb())
        return

    key = target.lstrip("@")
    if key.isdigit():
        # A numeric id may belong to someone who never opened the bot yet —
        # create the row so the chips are waiting for him on /start.
        user_id = int(key)
        await db.get_or_create_user(user_id, None)
    else:
        row = await db.find_user(key)
        if row is None:
            await message.answer(
                f"Игрок @{key} не найден. По username можно выдать только тому, "
                "кто уже запускал бота — иначе укажите числовой ID.",
                reply_markup=admin_back_kb(),
            )
            return
        user_id = row["user_id"]

    new_balance = await db.adjust_balance(user_id, amount)
    await db.record_admin_grant(message.from_user.id, user_id, amount)
    await state.clear()

    verb = "начислено" if amount > 0 else "списано"
    await message.answer(
        f"✅ Игроку <code>{user_id}</code> {verb} {abs(amount)} 🪙\n"
        f"Его баланс: {new_balance} 🪙",
        reply_markup=admin_panel_kb(),
    )

    # Telling the player is best-effort: he may have blocked the bot.
    try:
        if amount > 0:
            note = f"🎁 Вам начислено {amount} фишек!\nБаланс: {new_balance} 🪙"
        else:
            note = f"➖ С вашего счёта списано {abs(amount)} фишек.\nБаланс: {new_balance} 🪙"
        await bot.send_message(user_id, note)
    except Exception:
        await message.answer("(уведомить игрока не удалось — он не открывал бота или заблокировал его)")


# --- Looking a player up -----------------------------------------------


@router.callback_query(F.data == "admin:find")
async def cb_find(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(AdminStates.waiting_search)
    await safe_edit(
        callback.message,
        "🔍 <b>Поиск игрока</b>\n\nОтправьте числовой ID или @username.",
        reply_markup=admin_back_kb(),
    )
    await callback.answer()


@router.message(AdminStates.waiting_search)
async def process_search(message: Message, state: FSMContext) -> None:
    row = await db.find_user(message.text or "")
    if row is None:
        await message.answer("Игрок не найден.", reply_markup=admin_back_kb())
        return

    await state.clear()
    name = f"@{row['username']}" if row["username"] else "—"
    await message.answer(
        f"👤 <b>{name}</b>\n"
        f"ID: <code>{row['user_id']}</code>\n\n"
        f"🪙 Баланс: {row['balance']}\n"
        f"🎮 Игр: {row['games_played']}\n"
        f"📈 Поставлено: {row['total_wagered']}\n"
        f"💵 Выиграно: {row['total_won']}\n"
        f"📅 С нами с: {row['created_at'][:10]}",
        reply_markup=admin_panel_kb(),
    )


# --- Global stats ------------------------------------------------------


@router.callback_query(F.data == "admin:stats")
async def cb_stats(callback: CallbackQuery) -> None:
    s = await db.global_stats()
    await safe_edit(
        callback.message,
        "📊 <b>Статистика бота</b>\n\n"
        f"👥 Игроков: {s['users']}\n"
        f"🪙 Фишек на руках: {s['chips']}\n"
        f"🎮 Сыграно игр: {s['games']}\n"
        f"📈 Всего поставлено: {s['wagered']}\n\n"
        f"⭐ Пополнений: {s['topups']} на {s['stars']} звёзд\n"
        f"🛠 Выдано админами: {s['granted']} 🪙",
        reply_markup=admin_back_kb(),
    )
    await callback.answer()
