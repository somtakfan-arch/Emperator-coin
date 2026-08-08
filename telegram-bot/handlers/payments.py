from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import (
    CallbackQuery,
    LabeledPrice,
    Message,
    PreCheckoutQuery,
)

import database as db
from keyboards import back_to_menu_kb, topup_kb

router = Router()

TOPUP_TEXT = (
    "⭐ <b>Пополнение фишек</b>\n\n"
    "Оплата в Telegram Stars. 1 фишка = 1 звезда (крупные пакеты — с бонусом).\n"
    "Фишки нельзя вывести или обменять обратно — только для игры в боте."
)


@router.message(Command("topup"))
async def cmd_topup(message: Message) -> None:
    await message.answer(TOPUP_TEXT, reply_markup=topup_kb())


@router.callback_query(F.data == "menu:topup")
async def cb_topup(callback: CallbackQuery) -> None:
    await callback.message.edit_text(TOPUP_TEXT, reply_markup=topup_kb())
    await callback.answer()


@router.callback_query(F.data.startswith("topup:"))
async def cb_topup_package(callback: CallbackQuery) -> None:
    _, coins, stars = callback.data.split(":")
    coins, stars = int(coins), int(stars)

    await callback.message.answer_invoice(
        title=f"{coins} фишек Emperator Casino",
        description="Виртуальные игровые фишки. Не имеют денежной ценности, не подлежат выводу.",
        payload=f"coins:{coins}:{stars}",
        currency="XTR",
        prices=[LabeledPrice(label=f"{coins} фишек", amount=stars)],
    )
    await callback.answer()


@router.pre_checkout_query()
async def process_pre_checkout(pre_checkout_query: PreCheckoutQuery) -> None:
    await pre_checkout_query.answer(ok=True)


@router.message(F.successful_payment)
async def process_successful_payment(message: Message) -> None:
    payload = message.successful_payment.invoice_payload
    _, coins, stars = payload.split(":")
    coins, stars = int(coins), int(stars)

    await db.get_or_create_user(message.from_user.id, message.from_user.username)
    new_balance = await db.adjust_balance(message.from_user.id, coins)
    await db.record_topup(
        message.from_user.id,
        stars,
        coins,
        message.successful_payment.telegram_payment_charge_id,
    )
    await message.answer(
        f"✅ Зачислено {coins} фишек!\nБаланс: {new_balance} 🪙",
        reply_markup=back_to_menu_kb(),
    )
