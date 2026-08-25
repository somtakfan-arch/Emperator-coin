"""Putting a beat up for sale."""

from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from .. import db, keyboards, money, texts
from .common import show

router = Router(name="sell")


class Sell(StatesGroup):
    price = State()


@router.callback_query(F.data.startswith("sell:menu:"))
async def cb_menu(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.answer()
    track_id = int(callback.data.rsplit(":", 1)[1])
    track = await db.get_track(track_id)
    if track is None or callback.from_user is None:
        await show(callback, texts.TRACK_GONE, keyboards.back_to_menu())
        return
    if track.artist_id != callback.from_user.id:
        await callback.answer(texts.NOT_YOUR_TRACK, show_alert=True)
        return
    await show(callback, texts.sale_status(track), keyboards.sale_settings(track_id, track.for_sale))


@router.callback_query(F.data.startswith("sell:start:"))
async def cb_start(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    track_id = int(callback.data.rsplit(":", 1)[1])
    track = await db.get_track(track_id)
    if track is None or callback.from_user is None or track.artist_id != callback.from_user.id:
        await callback.answer(texts.NOT_YOUR_TRACK, show_alert=True)
        return
    if track.sold_at:
        await callback.answer(texts.ALREADY_SOLD, show_alert=True)
        return
    await show(callback, texts.PICK_CURRENCY, keyboards.currency_picker(track_id))


@router.callback_query(F.data.startswith("sell:cur:"))
async def cb_currency(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    _, _, track_id, code = callback.data.split(":")
    await state.set_state(Sell.price)
    await state.update_data(track_id=int(track_id), code=code)
    await show(callback, texts.ask_price(code), keyboards.cancel(f"track:{track_id}"))


@router.message(Sell.price, F.text)
async def got_price(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    code = data.get("code", "TON")
    try:
        amount = money.parse_amount(message.text or "", code)
    except money.AmountError as exc:
        await message.answer(texts.bad_price(exc), reply_markup=keyboards.cancel("menu"))
        return

    if message.from_user is None:
        return
    await state.clear()
    track_id = int(data["track_id"])
    if not await db.set_price(track_id, message.from_user.id, amount, code):
        await message.answer(texts.ALREADY_SOLD, reply_markup=keyboards.back_to_menu())
        return

    track = await db.get_track(track_id)
    await message.answer(
        texts.price_set(track.title, amount, code),
        reply_markup=keyboards.sale_settings(track_id, True),
    )


@router.message(Sell.price)
async def price_not_text(message: Message) -> None:
    await message.answer(texts.NEED_TEXT, reply_markup=keyboards.cancel("menu"))


@router.callback_query(F.data.startswith("sell:off:"))
async def cb_off(callback: CallbackQuery) -> None:
    track_id = int(callback.data.rsplit(":", 1)[1])
    if callback.from_user is None:
        return
    open_deal = await db.open_deal_for_track(track_id)
    if open_deal:
        await callback.answer(texts.DEAL_IN_PROGRESS, show_alert=True)
        return
    await db.clear_price(track_id, callback.from_user.id)
    await callback.answer(texts.SALE_OFF)
    track = await db.get_track(track_id)
    if track:
        await show(callback, texts.sale_status(track), keyboards.sale_settings(track_id, False))
