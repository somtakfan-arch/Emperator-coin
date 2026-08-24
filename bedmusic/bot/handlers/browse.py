"""Feed, search, track cards, playback, likes."""

from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from .. import db, keyboards, texts
from ..config import Config
from .common import show

router = Router(name="browse")


class Search(StatesGroup):
    query = State()


# --- feed ------------------------------------------------------------------


@router.message(Command("feed"))
async def cmd_feed(message: Message, state: FSMContext, config: Config) -> None:
    await state.clear()
    await _feed(message, 0, config)


@router.callback_query(F.data.startswith("feed:"))
async def cb_feed(callback: CallbackQuery, state: FSMContext, config: Config) -> None:
    await state.clear()
    await callback.answer()
    await _feed(callback, int(callback.data.split(":")[1]), config)


async def _feed(event: Message | CallbackQuery, offset: int, config: Config) -> None:
    total = await db.count_tracks()
    if total == 0:
        await show(event, texts.FEED_EMPTY, keyboards.back_to_menu())
        return

    offset = max(0, min(offset, max(0, total - 1)))
    tracks = await db.feed_page(offset, config.page_size)
    await show(
        event,
        texts.feed_header(offset, config.page_size, total),
        keyboards.feed_page(tracks, offset, config.page_size, total),
    )


# --- liked -----------------------------------------------------------------


@router.callback_query(F.data.startswith("liked:"))
async def cb_liked(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.answer()
    if callback.from_user is None:
        return
    tracks = await db.liked_tracks(callback.from_user.id)
    if not tracks:
        await show(callback, texts.LIKED_EMPTY, keyboards.back_to_menu())
        return
    await show(
        callback, f"❤️ Мне нравится: <b>{len(tracks)}</b>", keyboards.track_list(tracks)
    )


# --- search ----------------------------------------------------------------


@router.callback_query(F.data == "search:start")
async def cb_search(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    await state.set_state(Search.query)
    await show(callback, texts.SEARCH_PROMPT, keyboards.cancel())


@router.message(Command("search"))
async def cmd_search(message: Message, state: FSMContext, command: CommandObject) -> None:
    await state.clear()
    query = (command.args or "").strip()
    if not query:
        await state.set_state(Search.query)
        await message.answer(texts.SEARCH_PROMPT, reply_markup=keyboards.cancel())
        return
    await _run_search(message, query)


@router.message(Search.query, F.text)
async def got_query(message: Message, state: FSMContext) -> None:
    await state.clear()
    await _run_search(message, (message.text or "").strip())


@router.message(Search.query)
async def query_not_text(message: Message) -> None:
    await message.answer(texts.NEED_TEXT, reply_markup=keyboards.cancel())


async def _run_search(message: Message, query: str) -> None:
    tracks = await db.search_tracks(query)
    if not tracks:
        await message.answer(texts.SEARCH_EMPTY, reply_markup=keyboards.back_to_menu())
        return
    await message.answer(
        texts.search_results(query, len(tracks)), reply_markup=keyboards.track_list(tracks)
    )


# --- track card, playback, likes -------------------------------------------


@router.callback_query(F.data.regexp(r"^track:\d+$"))
async def cb_track(callback: CallbackQuery) -> None:
    await callback.answer()
    await _render_track(callback, int(callback.data.split(":")[1]))


@router.callback_query(F.data.startswith("play:"))
async def cb_play(callback: CallbackQuery) -> None:
    track_id = int(callback.data.split(":")[1])
    track = await db.get_track(track_id)
    if track is None or callback.from_user is None:
        await callback.answer(texts.TRACK_GONE, show_alert=True)
        return

    await callback.answer("▶️ Отправляю трек…")
    await db.register_play(track_id)
    await callback.bot.send_audio(
        callback.from_user.id,
        track.audio_file_id,
        title=track.title,
        performer=track.artist_name,
        caption=f"🎧 <b>{track.title}</b> — {track.artist_name}",
        reply_markup=await keyboards.track_actions(
            await db.get_track(track_id) or track, callback.from_user.id
        ),
    )


@router.callback_query(F.data.startswith("like:"))
async def cb_like(callback: CallbackQuery) -> None:
    track_id = int(callback.data.split(":")[1])
    if callback.from_user is None:
        return
    if await db.get_track(track_id) is None:
        await callback.answer(texts.TRACK_GONE, show_alert=True)
        return

    liked = await db.toggle_like(callback.from_user.id, track_id)
    await callback.answer("💚 Добавлено в «Мне нравится»" if liked else "🤍 Убрано из лайков")

    track = await db.get_track(track_id)
    if track is None or callback.message is None:
        return
    try:
        await callback.message.edit_reply_markup(
            reply_markup=await keyboards.track_actions(track, callback.from_user.id)
        )
    except Exception:  # noqa: BLE001 - message may be too old to edit
        pass


@router.callback_query(F.data.startswith("track:del:"))
async def cb_delete_prompt(callback: CallbackQuery) -> None:
    await callback.answer()
    track_id = int(callback.data.rsplit(":", 1)[1])
    track = await db.get_track(track_id)
    if track is None:
        await show(callback, texts.TRACK_GONE, keyboards.back_to_menu())
        return
    await show(callback, texts.confirm_delete(track.title), keyboards.confirm_delete(track_id))


@router.callback_query(F.data.startswith("track:delyes:"))
async def cb_delete(callback: CallbackQuery) -> None:
    track_id = int(callback.data.rsplit(":", 1)[1])
    if callback.from_user is None:
        return
    deleted = await db.delete_track(track_id, callback.from_user.id)
    await callback.answer("🗑 Трек удалён" if deleted else "⚠️ Это не твой трек", show_alert=not deleted)
    await show(callback, texts.welcome_back(callback.from_user.full_name), keyboards.main_menu())


async def _render_track(callback: CallbackQuery, track_id: int) -> None:
    track = await db.get_track(track_id)
    if track is None or callback.from_user is None:
        await show(callback, texts.TRACK_GONE, keyboards.back_to_menu())
        return
    await show(
        callback,
        texts.track_card(track),
        await keyboards.track_actions(track, callback.from_user.id),
    )
