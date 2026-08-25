"""The beat market: a tab listing only beats that are actually for sale."""

from __future__ import annotations

from typing import Union

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from .. import db, keyboards, texts
from ..config import Config
from .common import show

router = Router(name="market")


@router.message(Command("market", "beats"))
async def cmd_market(message: Message, state: FSMContext, config: Config) -> None:
    await state.clear()
    await _market(message, 0, config)


@router.callback_query(F.data.startswith("market:"))
async def cb_market(callback: CallbackQuery, state: FSMContext, config: Config) -> None:
    await state.clear()
    await callback.answer()
    await _market(callback, int(callback.data.split(":")[1]), config)


async def _market(event: Union[Message, CallbackQuery], offset: int, config: Config) -> None:
    total = await db.count_for_sale()
    if total == 0:
        await show(event, texts.MARKET_EMPTY, keyboards.back_to_menu())
        return

    offset = max(0, min(offset, max(0, total - 1)))
    tracks = await db.for_sale_page(offset, config.page_size)
    await show(
        event,
        texts.market_header(offset, config.page_size, total),
        keyboards.market_page(tracks, offset, config.page_size, total),
    )
