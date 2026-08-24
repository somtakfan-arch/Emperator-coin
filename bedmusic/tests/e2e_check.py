"""End-to-end check of the conversation flows against a mocked Telegram transport.

Feeds synthetic updates through the real dispatcher and asserts on the API calls
the bot would have made. Run with:

    python -m tests.e2e_check
"""

from __future__ import annotations

import asyncio
import sys
import tempfile
from pathlib import Path
from typing import Any

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.client.session.base import BaseSession
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.methods import TelegramMethod
from aiogram.types import (
    Audio,
    CallbackQuery,
    Chat,
    Message,
    PhotoSize,
    Update,
    User,
)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bot import db  # noqa: E402
from bot.config import Config  # noqa: E402
from bot.handlers import build_router  # noqa: E402

USER = User(id=777, is_bot=False, first_name="Тестер", username="tester")
CHAT = Chat(id=777, type="private")
BOT_USER = User(id=1, is_bot=True, first_name="Bed Music", username="Bed_Musicbot")

_message_id = 0
_update_id = 0


class FakeSession(BaseSession):
    """Records outgoing API calls instead of hitting Telegram."""

    def __init__(self) -> None:
        super().__init__()
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def close(self) -> None:  # pragma: no cover - nothing to close
        pass

    async def stream_content(self, *args: Any, **kwargs: Any):  # pragma: no cover
        yield b""

    async def make_request(self, bot: Bot, method: TelegramMethod, timeout: int | None = None):
        name = type(method).__name__
        self.calls.append((name, method.model_dump(exclude_none=True)))

        if name == "GetMe":
            return BOT_USER
        if name in {"SendMessage", "SendPhoto", "SendAudio", "EditMessageText"}:
            return _make_message(text=getattr(method, "text", None) or "…")
        return True

    def last(self, method: str) -> dict[str, Any]:
        for name, payload in reversed(self.calls):
            if name == method:
                return payload
        raise AssertionError(f"no {method} call recorded; got {[c[0] for c in self.calls]}")

    def texts(self) -> str:
        return "\n".join(
            str(p.get("text") or p.get("caption") or "") for _, p in self.calls
        )

    def buttons(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for _, payload in self.calls:
            markup = payload.get("reply_markup") or {}
            for row in markup.get("inline_keyboard", []):
                out.extend(row)
        return out

    def reset(self) -> None:
        self.calls.clear()


def _make_message(**kwargs: Any) -> Message:
    global _message_id
    _message_id += 1
    payload: dict[str, Any] = {
        "message_id": _message_id,
        "date": 0,
        "chat": CHAT,
        "from_user": USER,
    }
    payload.update(kwargs)
    return Message(**payload)


def _update(**kwargs: Any) -> Update:
    global _update_id
    _update_id += 1
    return Update(update_id=_update_id, **kwargs)


def text_update(text: str) -> Update:
    return _update(message=_make_message(text=text))


def photo_update() -> Update:
    photo = [PhotoSize(file_id="AVATAR_FILE_ID", file_unique_id="u1", width=100, height=100)]
    return _update(message=_make_message(photo=photo))


def audio_update() -> Update:
    audio = Audio(
        file_id="AUDIO_FILE_ID",
        file_unique_id="u2",
        duration=195,
        title="Ночной драйв",
        performer="Тестер",
    )
    return _update(message=_make_message(audio=audio))


def callback_update(data: str) -> Update:
    return _update(
        callback_query=CallbackQuery(
            id=f"cb{_message_id}",
            from_user=USER,
            chat_instance="ci",
            data=data,
            message=_make_message(text="предыдущий экран"),
        )
    )


def check(condition: bool, label: str) -> None:
    print(f"  {'✅' if condition else '❌'} {label}")
    if not condition:
        raise AssertionError(label)


async def main() -> None:
    tmp = Path(tempfile.mkdtemp()) / "test.db"
    await db.connect(tmp)

    session = FakeSession()
    bot = Bot(
        token="1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        session=session,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=MemoryStorage())
    dp["config"] = Config(token="x", db_path=tmp, page_size=5)
    dp.include_router(build_router())

    async def feed(update: Update) -> None:
        await dp.feed_update(bot, update)

    print("\n1. /start for a new user")
    await feed(text_update("/start"))
    payload = session.last("SendMessage")
    check("Bed Music" in payload["text"], "интро с описанием бота")
    register = payload["reply_markup"]["inline_keyboard"][0][0]
    check(register["callback_data"] == "reg:start", "есть кнопка регистрации")
    check(register["style"] == "danger", f"кнопка красная (style={register.get('style')!r})")
    check("Зарегистрироваться" in register["text"], "подпись кнопки")

    print("\n2. Registration: name → description → avatar")
    session.reset()
    await feed(callback_update("reg:start"))
    check("шаг 1 из 3" in session.texts(), "шаг 1 спрашивает имя музыканта")
    check("имя музыканта" in session.texts().lower(), "текст про имя")

    session.reset()
    await feed(text_update("D"))
    check("хотя бы из 2" in session.texts(), "слишком короткое имя отклонено")

    session.reset()
    await feed(text_update("DJ Кровать"))
    check("шаг 2 из 3" in session.texts(), "шаг 2 спрашивает описание")
    check("описание музыканта" in session.texts().lower(), "текст про описание")

    session.reset()
    await feed(text_update("Лоу-фай биты для сна. Москва."))
    check("шаг 3 из 3" in session.texts(), "шаг 3 спрашивает аватарку")
    check("аватарку музыканта" in session.texts().lower(), "текст про аватарку")

    session.reset()
    await feed(text_update("не картинка"))
    check("Нужна картинка" in session.texts(), "не-фото на шаге аватарки отклонено")

    session.reset()
    await feed(photo_update())
    artist = await db.get_artist(USER.id)
    check(artist is not None, "артист сохранён в БД")
    check(artist.name == "DJ Кровать", f"имя = {artist.name!r}")
    check(artist.description.startswith("Лоу-фай"), "описание сохранено")
    check(artist.avatar_file_id == "AVATAR_FILE_ID", "аватарка сохранена")
    check(session.last("SendPhoto")["photo"] == "AVATAR_FILE_ID", "профиль показан с аватаркой")

    print("\n3. /start again → main menu, no re-registration")
    session.reset()
    await feed(text_update("/start"))
    check("возвращением" in session.texts(), "приветствие вернувшегося")
    styles = {b.get("style") for b in session.buttons()}
    check("success" in styles and "primary" in styles, f"меню с цветными кнопками {styles}")

    print("\n4. Upload a track")
    session.reset()
    await feed(callback_update("upload:start"))
    await feed(audio_update())
    check("Оставить" in session.texts() or "назвать" in session.texts(), "спрошено название")
    await feed(callback_update("upload:keep"))
    tracks = await db.artist_tracks(USER.id)
    check(len(tracks) == 1, f"трек сохранён ({len(tracks)})")
    check(tracks[0].title == "Ночной драйв", f"название = {tracks[0].title!r}")
    check(tracks[0].duration == 195, "длительность сохранена")

    print("\n5. Feed, playback, likes")
    track_id = tracks[0].id
    session.reset()
    await feed(callback_update("feed:0"))
    check("Лента" in session.texts(), "лента отрисована")
    check(
        any(b.get("callback_data") == f"track:{track_id}" for b in session.buttons()),
        "трек в ленте",
    )

    session.reset()
    await feed(callback_update(f"play:{track_id}"))
    check(session.last("SendAudio")["audio"] == "AUDIO_FILE_ID", "аудио отправлено")
    check((await db.get_track(track_id)).plays == 1, "прослушивание засчитано")

    session.reset()
    await feed(callback_update(f"like:{track_id}"))
    check((await db.get_track(track_id)).likes == 1, "лайк поставлен")
    await feed(callback_update(f"like:{track_id}"))
    check((await db.get_track(track_id)).likes == 0, "лайк снят повторным нажатием")

    print("\n6. Search")
    session.reset()
    await feed(text_update("/search драйв"))
    check("найдено" in session.texts(), "поиск по названию нашёл трек")
    session.reset()
    await feed(text_update("/search кровать"))
    check("найдено" in session.texts(), "поиск по имени артиста нашёл трек")
    session.reset()
    await feed(text_update("/search зззз"))
    check("Ничего не нашлось" in session.texts(), "пустой результат обработан")

    print("\n7. Edit profile")
    session.reset()
    await feed(callback_update("edit:name"))
    await feed(text_update("DJ Подушка"))
    check((await db.get_artist(USER.id)).name == "DJ Подушка", "имя обновлено")

    print("\n8. Delete track")
    session.reset()
    await feed(callback_update(f"track:del:{track_id}"))
    check("Точно удалить" in session.texts(), "запрошено подтверждение")
    await feed(callback_update(f"track:delyes:{track_id}"))
    check(await db.count_tracks() == 0, "трек удалён")

    print("\n9. Unknown input falls back to the menu")
    session.reset()
    await feed(text_update("случайный текст"))
    check("Не понял" in session.texts(), "фолбэк сработал")

    await bot.session.close()
    await db.close()
    print("\n🎉 Все проверки пройдены.\n")


async def _run() -> int:
    try:
        await main()
        return 0
    except AssertionError:
        return 1
    finally:
        await db.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(_run()))
