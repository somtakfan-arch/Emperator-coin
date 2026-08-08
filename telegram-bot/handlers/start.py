from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.types import CallbackQuery, Message

import database as db
from keyboards import main_menu_kb

router = Router()

WELCOME = (
    "🎰 <b>Добро пожаловать в Emperator Casino!</b>\n\n"
    "Это развлекательный бот с виртуальными фишками. Играйте в кости, слоты, "
    "рулетку, блэкджек и монетку.\n\n"
    "⚠️ <b>Важно:</b> фишки — это игровые очки без денежной ценности. Их нельзя "
    "продать, вывести или обменять обратно на звёзды/деньги — это просто счёт "
    "для развлечения и статуса в таблице лидеров.\n"
    "Бот предназначен только для лиц 18+. Играйте ответственно.\n\n"
    f"Стартовый баланс: <b>{{balance}}</b> фишек 🪙"
)


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    user = await db.get_or_create_user(message.from_user.id, message.from_user.username)
    await message.answer(
        WELCOME.format(balance=user["balance"]),
        reply_markup=main_menu_kb(),
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
        reply_markup=main_menu_kb(),
    )


@router.callback_query(F.data == "menu:home")
async def cb_home(callback: CallbackQuery) -> None:
    user = await db.get_or_create_user(callback.from_user.id, callback.from_user.username)
    await callback.message.edit_text(
        f"🎰 <b>Emperator Casino</b>\n\nВаш баланс: <b>{user['balance']}</b> фишек 🪙\nВыберите игру:",
        reply_markup=main_menu_kb(),
    )
    await callback.answer()
