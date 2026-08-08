from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.types import CallbackQuery, Message

import database as db
from config import ADMIN_IDS
from handlers.utils import safe_edit
from keyboards import main_menu_kb

router = Router()

WELCOME = (
    "🎰 <b>Добро пожаловать в Bad Casino!</b>\n\n"
    "Это развлекательный бот с виртуальными фишками. Играйте в кости, слоты, "
    "рулетку, блэкджек и монетку.\n\n"
    "Ваш баланс: <b>{balance}</b> фишек 🪙\n"
    "Заберите 🎁 бонус или пополните счёт ⭐, чтобы начать."
)


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    user = await db.get_or_create_user(message.from_user.id, message.from_user.username)
    await message.answer(
        WELCOME.format(balance=user["balance"]),
        reply_markup=main_menu_kb(is_admin=message.from_user.id in ADMIN_IDS),
    )


@router.message(F.text == "/help")
async def cmd_help(message: Message) -> None:
    await message.answer(
        "Команды:\n"
        "/start — открыть меню\n"
        "/balance — ваш баланс и статистика\n"
        "/bonus — ежедневный бонус\n"
        "/topup — купить фишки за Telegram Stars\n"
        "/top — таблица лидеров",
        reply_markup=main_menu_kb(is_admin=message.from_user.id in ADMIN_IDS),
    )


@router.callback_query(F.data == "menu:home")
async def cb_home(callback: CallbackQuery) -> None:
    user = await db.get_or_create_user(callback.from_user.id, callback.from_user.username)
    await safe_edit(
        callback.message,
        f"🎰 <b>Bad Casino</b>\n\nВаш баланс: <b>{user['balance']}</b> фишек 🪙\nВыберите игру:",
        reply_markup=main_menu_kb(is_admin=callback.from_user.id in ADMIN_IDS),
    )
    await callback.answer()
