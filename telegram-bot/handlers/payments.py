from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import (
    CallbackQuery,
    LabeledPrice,
    Message,
    PreCheckoutQuery,
)

import database as db
from config import MAX_CUSTOM_TOPUP, MIN_CUSTOM_TOPUP
from handlers.states import TopupStates
from handlers.utils import safe_edit
from keyboards import back_to_menu_kb, cancel_topup_kb, topup_kb

router = Router()

TOPUP_TEXT = (
    "⭐ <b>Пополнение фишек</b>\n\n"
    "Оплата в Telegram Stars. 1 фишка = 1 звезда (крупные пакеты — с бонусом).\n"
    "Фишки нельзя вывести или обменять обратно — только для игры в боте."
)


async def _send_invoice(message: Message, coins: int, stars: int) -> None:
    await message.answer_invoice(
        title=f"{coins} фишек Bad Casino",
        description="Виртуальные игровые фишки. Не имеют денежной ценности, не подлежат выводу.",
        payload=f"coins:{coins}:{stars}",
        currency="XTR",
        prices=[LabeledPrice(label=f"{coins} фишек", amount=stars)],
    )


@router.message(Command("topup"))
async def cmd_topup(message: Message, state: FSMContext) -> None:
    await state.clear()
    await message.answer(TOPUP_TEXT, reply_markup=topup_kb())


@router.callback_query(F.data == "menu:topup")
async def cb_topup(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await safe_edit(callback.message, TOPUP_TEXT, reply_markup=topup_kb())
    await callback.answer()


@router.callback_query(F.data == "topup:custom")
async def cb_topup_custom(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(TopupStates.waiting_for_amount)
    limit = f"{MAX_CUSTOM_TOPUP:,}".replace(",", " ")
    await callback.message.edit_text(
        "✏️ <b>Своя сумма</b>\n\n"
        f"Отправьте числом, сколько фишек хотите купить "
        f"(от {MIN_CUSTOM_TOPUP} до {limit}).\n"
        "1 фишка = 1 звезда ⭐",
        reply_markup=cancel_topup_kb(),
    )
    await callback.answer()


@router.message(TopupStates.waiting_for_amount)
async def process_custom_amount(message: Message, state: FSMContext) -> None:
    raw = (message.text or "").strip().replace(" ", "")
    if not raw.isdigit():
        await message.answer(
            "Нужно прислать число. Попробуйте ещё раз:", reply_markup=cancel_topup_kb()
        )
        return

    amount = int(raw)
    if amount < MIN_CUSTOM_TOPUP or amount > MAX_CUSTOM_TOPUP:
        await message.answer(
            f"Сумма должна быть от {MIN_CUSTOM_TOPUP} до {MAX_CUSTOM_TOPUP}. "
            "Попробуйте ещё раз:",
            reply_markup=cancel_topup_kb(),
        )
        return

    await state.clear()
    await _send_invoice(message, coins=amount, stars=amount)


@router.callback_query(F.data.startswith("topuppkg:"))
async def cb_topup_package(callback: CallbackQuery) -> None:
    _, coins, stars = callback.data.split(":")
    await _send_invoice(callback.message, coins=int(coins), stars=int(stars))
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
