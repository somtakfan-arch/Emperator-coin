from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from .. import db, keyboards, texts
from .common import require_artist, show

router = Router(name="upload")

AUDIO_MIME_PREFIXES = ("audio/", "video/ogg")


class Upload(StatesGroup):
    audio = State()
    title = State()


@router.message(Command("upload"))
async def cmd_upload(message: Message, state: FSMContext) -> None:
    await state.clear()
    if await require_artist(message):
        await state.set_state(Upload.audio)
        await message.answer(texts.UPLOAD_AUDIO, reply_markup=keyboards.cancel())


@router.callback_query(F.data == "upload:start")
async def cb_upload(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.answer()
    if await require_artist(callback):
        await state.set_state(Upload.audio)
        await show(callback, texts.UPLOAD_AUDIO, keyboards.cancel())


@router.message(Upload.audio, F.audio)
async def got_audio(message: Message, state: FSMContext) -> None:
    audio = message.audio
    assert audio is not None
    detected = (audio.title or audio.file_name or "").strip()
    await _ask_title(message, state, audio.file_id, audio.duration or 0, detected)


@router.message(Upload.audio, F.document)
async def got_document(message: Message, state: FSMContext) -> None:
    doc = message.document
    assert doc is not None
    mime = doc.mime_type or ""
    if not mime.startswith(AUDIO_MIME_PREFIXES):
        await message.answer(texts.NEED_AUDIO, reply_markup=keyboards.cancel())
        return
    detected = (doc.file_name or "").rsplit(".", 1)[0].strip()
    await _ask_title(message, state, doc.file_id, 0, detected)


@router.message(Upload.audio, F.voice)
async def got_voice(message: Message, state: FSMContext) -> None:
    voice = message.voice
    assert voice is not None
    await _ask_title(message, state, voice.file_id, voice.duration or 0, "")


@router.message(Upload.audio)
async def not_audio(message: Message) -> None:
    await message.answer(texts.NEED_AUDIO, reply_markup=keyboards.cancel())


async def _ask_title(
    message: Message, state: FSMContext, file_id: str, duration: int, detected: str
) -> None:
    detected = detected[: texts.TITLE_MAX]
    await state.update_data(file_id=file_id, duration=duration, detected=detected)
    await state.set_state(Upload.title)
    markup = keyboards.keep_title(detected) if detected else keyboards.cancel()
    await message.answer(texts.UPLOAD_TITLE, reply_markup=markup)


@router.message(Upload.title, F.text)
async def got_title(message: Message, state: FSMContext) -> None:
    title = (message.text or "").strip()
    if len(title) > texts.TITLE_MAX:
        await message.answer(texts.TITLE_TOO_LONG, reply_markup=keyboards.cancel())
        return
    await _publish(message, state, title)


@router.callback_query(Upload.title, F.data == "upload:keep")
async def keep_title(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    data = await state.get_data()
    await _publish(callback, state, data.get("detected") or "Без названия")


@router.message(Upload.title)
async def title_not_text(message: Message) -> None:
    await message.answer(texts.NEED_TEXT, reply_markup=keyboards.cancel())


async def _publish(
    event: Message | CallbackQuery, state: FSMContext, title: str
) -> None:
    if event.from_user is None:
        return

    data = await state.get_data()
    await state.clear()

    file_id = data.get("file_id")
    if not file_id:
        await show(event, texts.NEED_AUDIO, keyboards.back_to_menu())
        return

    track_id = await db.add_track(
        artist_id=event.from_user.id,
        title=title,
        audio_file_id=file_id,
        duration=int(data.get("duration") or 0),
    )

    await show(event, texts.uploaded(title))

    track = await db.get_track(track_id)
    if track is None:
        return
    await event.bot.send_message(
        event.from_user.id,
        texts.track_card(track),
        reply_markup=await keyboards.track_actions(track, event.from_user.id),
    )
