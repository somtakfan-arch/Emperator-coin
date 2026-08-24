from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from .. import db, keyboards, texts
from .common import show

router = Router(name="start")


@router.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext) -> None:
    await state.clear()
    if message.from_user is None:
        return

    artist = await db.get_artist(message.from_user.id)
    if artist is not None:
        await message.answer(
            texts.welcome_back(artist.name), reply_markup=keyboards.main_menu()
        )
        return

    artists = await db.count_artists()
    tracks = await db.count_tracks()
    await message.answer(
        texts.start(artists, tracks), reply_markup=keyboards.register()
    )


@router.message(Command("menu"))
async def cmd_menu(message: Message, state: FSMContext) -> None:
    await state.clear()
    await _menu(message)


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    await message.answer(texts.HELP, reply_markup=keyboards.main_menu())


@router.callback_query(F.data == "menu")
async def cb_menu(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.answer()
    await _menu(callback)


async def _menu(event: Message | CallbackQuery) -> None:
    if event.from_user is None:
        return
    artist = await db.get_artist(event.from_user.id)
    if artist is None:
        artists = await db.count_artists()
        tracks = await db.count_tracks()
        await show(event, texts.start(artists, tracks), keyboards.register())
        return
    await show(event, texts.welcome_back(artist.name), keyboards.main_menu())
