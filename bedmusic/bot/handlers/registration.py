"""Registration: name -> description -> avatar, asked one step at a time."""

from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from .. import db, keyboards, texts
from .common import show

router = Router(name="registration")


class Registration(StatesGroup):
    name = State()
    description = State()
    avatar = State()


@router.callback_query(F.data == "reg:start")
async def start_registration(callback: CallbackQuery, state: FSMContext) -> None:
    if callback.from_user is None:
        return

    if await db.get_artist(callback.from_user.id) is not None:
        await callback.answer(texts.ALREADY_REGISTERED, show_alert=True)
        await show(
            callback,
            texts.welcome_back((await db.get_artist(callback.from_user.id)).name),
            keyboards.main_menu(),
        )
        return

    await callback.answer()
    await state.set_state(Registration.name)
    await show(callback, texts.REG_INTRO, keyboards.cancel_registration())


@router.callback_query(F.data == "reg:cancel")
async def cancel_registration(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.answer()
    await show(callback, texts.REG_CANCELLED)


# --- step 1: name ----------------------------------------------------------


@router.message(Registration.name, F.text)
async def got_name(message: Message, state: FSMContext) -> None:
    name = (message.text or "").strip()
    if len(name) < 2:
        await message.answer(texts.NAME_TOO_SHORT, reply_markup=keyboards.cancel_registration())
        return
    if len(name) > texts.NAME_MAX:
        await message.answer(texts.NAME_TOO_LONG, reply_markup=keyboards.cancel_registration())
        return

    await state.update_data(name=name)
    await state.set_state(Registration.description)
    await message.answer(texts.REG_DESCRIPTION, reply_markup=keyboards.skip("description"))


@router.message(Registration.name)
async def name_not_text(message: Message) -> None:
    await message.answer(texts.NEED_TEXT, reply_markup=keyboards.cancel_registration())


# --- step 2: description ---------------------------------------------------


@router.message(Registration.description, F.text)
async def got_description(message: Message, state: FSMContext) -> None:
    description = (message.text or "").strip()
    if len(description) > texts.DESC_MAX:
        await message.answer(texts.DESC_TOO_LONG, reply_markup=keyboards.skip("description"))
        return

    await state.update_data(description=description)
    await state.set_state(Registration.avatar)
    await message.answer(texts.REG_AVATAR, reply_markup=keyboards.skip("avatar"))


@router.message(Registration.description)
async def description_not_text(message: Message) -> None:
    await message.answer(texts.NEED_TEXT, reply_markup=keyboards.skip("description"))


@router.callback_query(Registration.description, F.data == "reg:skip:description")
async def skip_description(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    await state.update_data(description="")
    await state.set_state(Registration.avatar)
    await show(callback, texts.REG_AVATAR, keyboards.skip("avatar"))


# --- step 3: avatar --------------------------------------------------------


@router.message(Registration.avatar, F.photo)
async def got_avatar(message: Message, state: FSMContext) -> None:
    photo = message.photo[-1]  # largest available size
    await _finish(message, state, avatar_file_id=photo.file_id)


@router.callback_query(Registration.avatar, F.data == "reg:skip:avatar")
async def skip_avatar(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    await _finish(callback, state, avatar_file_id=None)


@router.message(Registration.avatar)
async def avatar_not_photo(message: Message) -> None:
    await message.answer(texts.NEED_PHOTO, reply_markup=keyboards.skip("avatar"))


async def _finish(
    event: Message | CallbackQuery, state: FSMContext, avatar_file_id: str | None
) -> None:
    if event.from_user is None:
        return

    data = await state.get_data()
    await state.clear()

    await db.create_artist(
        user_id=event.from_user.id,
        username=event.from_user.username,
        name=data.get("name", event.from_user.full_name),
        description=data.get("description", ""),
        avatar_file_id=avatar_file_id,
    )

    artist = await db.get_artist(event.from_user.id)
    assert artist is not None

    await show(event, texts.registered(artist.name))

    card = texts.profile_card(artist, tracks=0, likes=0, own=True)
    chat_id = event.from_user.id
    bot = event.bot
    if artist.avatar_file_id:
        await bot.send_photo(
            chat_id,
            artist.avatar_file_id,
            caption=card,
            reply_markup=keyboards.main_menu(),
        )
    else:
        await bot.send_message(chat_id, card, reply_markup=keyboards.main_menu())
