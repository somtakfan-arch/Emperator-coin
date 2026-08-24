from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from .. import db, keyboards, texts
from .common import require_artist, show

router = Router(name="profile")


class Edit(StatesGroup):
    name = State()
    description = State()
    avatar = State()


@router.message(Command("profile"))
async def cmd_profile(message: Message, state: FSMContext) -> None:
    await state.clear()
    artist = await require_artist(message)
    if artist:
        await _send_profile(message, artist, own=True)


@router.callback_query(F.data == "profile:me")
async def cb_profile(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.answer()
    artist = await require_artist(callback)
    if artist:
        await _send_profile(callback, artist, own=True)


@router.callback_query(F.data.startswith("artist:tracks:"))
async def cb_artist_tracks(callback: CallbackQuery) -> None:
    await callback.answer()
    artist_id = int(callback.data.rsplit(":", 1)[1])
    tracks = await db.artist_tracks(artist_id)
    if not tracks:
        await show(callback, texts.NO_TRACKS, keyboards.back_to_menu())
        return
    await show(callback, f"🎵 Треки: <b>{len(tracks)}</b>", keyboards.track_list(tracks))


@router.callback_query(F.data == "profile:tracks")
async def cb_my_tracks(callback: CallbackQuery) -> None:
    await callback.answer()
    if callback.from_user is None:
        return
    tracks = await db.artist_tracks(callback.from_user.id)
    if not tracks:
        await show(callback, texts.NO_TRACKS, keyboards.back_to_menu())
        return
    await show(callback, f"🎵 Твои треки: <b>{len(tracks)}</b>", keyboards.track_list(tracks))


@router.callback_query(F.data.regexp(r"^artist:\d+$"))
async def cb_artist_card(callback: CallbackQuery) -> None:
    await callback.answer()
    artist_id = int(callback.data.split(":")[1])
    artist = await db.get_artist(artist_id)
    if artist is None:
        await show(callback, texts.ARTIST_GONE, keyboards.back_to_menu())
        return

    own = callback.from_user is not None and callback.from_user.id == artist_id
    await _send_profile(callback, artist, own=own)


# --- editing ---------------------------------------------------------------


@router.callback_query(F.data == "edit:menu")
async def cb_edit_menu(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.answer()
    if await require_artist(callback):
        await show(callback, texts.EDIT_MENU, keyboards.edit_menu())


@router.callback_query(F.data == "edit:name")
async def cb_edit_name(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    await state.set_state(Edit.name)
    await show(callback, texts.EDIT_NAME, keyboards.cancel("edit:menu"))


@router.callback_query(F.data == "edit:description")
async def cb_edit_description(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    await state.set_state(Edit.description)
    await show(callback, texts.EDIT_DESCRIPTION, keyboards.cancel("edit:menu"))


@router.callback_query(F.data == "edit:avatar")
async def cb_edit_avatar(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    await state.set_state(Edit.avatar)
    await show(callback, texts.EDIT_AVATAR, keyboards.cancel("edit:menu"))


@router.message(Edit.name, F.text)
async def save_name(message: Message, state: FSMContext) -> None:
    name = (message.text or "").strip()
    if len(name) < 2:
        await message.answer(texts.NAME_TOO_SHORT, reply_markup=keyboards.cancel("edit:menu"))
        return
    if len(name) > texts.NAME_MAX:
        await message.answer(texts.NAME_TOO_LONG, reply_markup=keyboards.cancel("edit:menu"))
        return
    await _save(message, state, "name", name)


@router.message(Edit.description, F.text)
async def save_description(message: Message, state: FSMContext) -> None:
    description = (message.text or "").strip()
    if len(description) > texts.DESC_MAX:
        await message.answer(texts.DESC_TOO_LONG, reply_markup=keyboards.cancel("edit:menu"))
        return
    await _save(message, state, "description", description)


@router.message(Edit.avatar, F.photo)
async def save_avatar(message: Message, state: FSMContext) -> None:
    await _save(message, state, "avatar_file_id", message.photo[-1].file_id)


@router.message(Edit.avatar)
async def avatar_not_photo(message: Message) -> None:
    await message.answer(texts.NEED_PHOTO, reply_markup=keyboards.cancel("edit:menu"))


@router.message(Edit.name)
@router.message(Edit.description)
async def edit_not_text(message: Message) -> None:
    await message.answer(texts.NEED_TEXT, reply_markup=keyboards.cancel("edit:menu"))


async def _save(message: Message, state: FSMContext, field: str, value: str) -> None:
    if message.from_user is None:
        return
    await state.clear()
    await db.update_artist_field(message.from_user.id, field, value)
    await message.answer(texts.EDIT_SAVED)

    artist = await db.get_artist(message.from_user.id)
    if artist:
        await _send_profile(message, artist, own=True)


async def _send_profile(
    event: Message | CallbackQuery, artist: db.Artist, own: bool
) -> None:
    tracks = await db.count_artist_tracks(artist.user_id)
    likes = await db.count_artist_likes(artist.user_id)
    card = texts.profile_card(artist, tracks, likes, own)
    markup = keyboards.profile(own) if own else keyboards.artist_card(artist.user_id)

    if artist.avatar_file_id:
        chat_id = event.from_user.id if event.from_user else None
        if chat_id is not None:
            await event.bot.send_photo(
                chat_id, artist.avatar_file_id, caption=card, reply_markup=markup
            )
            return
    await show(event, card, markup)
