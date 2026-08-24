from __future__ import annotations

from html import escape

from . import db

NAME_MAX = 40
DESC_MAX = 500
TITLE_MAX = 80


def start(artists: int, tracks: int) -> str:
    return (
        "🎧 <b>Bed Music</b> — SoundCloud прямо в Telegram.\n\n"
        "Здесь музыканты выкладывают свои треки, а слушатели находят новое.\n\n"
        "<b>Что умеет бот:</b>\n"
        "• 👤 Профиль музыканта — имя, описание, аватарка\n"
        "• ⬆️ Загрузка треков прямо из чата\n"
        "• 🔥 Лента свежих релизов\n"
        "• 🔎 Поиск по трекам и артистам\n"
        "• ❤️ Лайки и личная подборка «Мне нравится»\n\n"
        f"Сейчас на площадке: <b>{artists}</b> артистов и <b>{tracks}</b> треков.\n\n"
        "Чтобы выкладывать музыку — нажми красную кнопку ниже 👇"
    )


def welcome_back(name: str) -> str:
    return f"🎧 С возвращением, <b>{escape(name)}</b>!\n\nВыбирай, что делаем:"


ALREADY_REGISTERED = "✅ Ты уже зарегистрирован как музыкант."

REG_INTRO = (
    "📝 <b>Регистрация музыканта</b> — шаг 1 из 3\n\n"
    "Напиши <b>имя музыканта</b> — так тебя увидят слушатели.\n"
    f"<i>До {NAME_MAX} символов.</i>"
)

REG_DESCRIPTION = (
    "📄 <b>Регистрация музыканта</b> — шаг 2 из 3\n\n"
    "Теперь пришли <b>описание музыканта</b>: жанр, город, о чём твоя музыка.\n"
    f"<i>До {DESC_MAX} символов. Можно пропустить.</i>"
)

REG_AVATAR = (
    "🖼 <b>Регистрация музыканта</b> — шаг 3 из 3\n\n"
    "Последний шаг — пришли <b>аватарку музыканта</b> одной картинкой.\n"
    "<i>Отправь фото. Можно пропустить.</i>"
)

REG_CANCELLED = "✖️ Регистрация отменена. Напиши /start, чтобы начать заново."

NAME_TOO_LONG = f"⚠️ Слишком длинно. Имя музыканта — до {NAME_MAX} символов. Попробуй ещё раз."
NAME_TOO_SHORT = "⚠️ Имя музыканта должно быть хотя бы из 2 символов. Попробуй ещё раз."
NEED_TEXT = "⚠️ Пришли, пожалуйста, текстом."
DESC_TOO_LONG = f"⚠️ Описание длиннее {DESC_MAX} символов. Сократи, пожалуйста."
NEED_PHOTO = "⚠️ Нужна картинка. Пришли фото или нажми «Пропустить»."
NEED_REGISTRATION = "⚠️ Сначала зарегистрируйся как музыкант — напиши /start."

UPLOAD_AUDIO = (
    "⬆️ <b>Загрузка трека</b>\n\n"
    "Пришли аудиофайл (mp3, m4a, wav — как <i>аудио</i> или как документ)."
)
UPLOAD_TITLE = "🎵 Как назвать трек?"
NEED_AUDIO = "⚠️ Это не похоже на аудио. Пришли музыкальный файл."
TITLE_TOO_LONG = f"⚠️ Название длиннее {TITLE_MAX} символов. Сократи, пожалуйста."

SEARCH_PROMPT = "🔎 Что ищем? Напиши название трека или имя артиста."
SEARCH_EMPTY = "😔 Ничего не нашлось. Попробуй другой запрос."

FEED_EMPTY = "🌱 В ленте пока пусто. Стань первым — загрузи трек!"
LIKED_EMPTY = "🤍 Ты ещё ничего не лайкнул. Загляни в ленту!"
NO_TRACKS = "🌱 У этого артиста пока нет треков."
TRACK_GONE = "⚠️ Трек не найден — возможно, он был удалён."
ARTIST_GONE = "⚠️ Артист не найден."

EDIT_MENU = "✏️ Что меняем?"
EDIT_NAME = f"📝 Пришли новое имя музыканта (до {NAME_MAX} символов)."
EDIT_DESCRIPTION = f"📄 Пришли новое описание (до {DESC_MAX} символов)."
EDIT_AVATAR = "🖼 Пришли новую аватарку одной картинкой."
EDIT_SAVED = "✅ Сохранено."

UNKNOWN = "🤔 Не понял. Открой меню командой /menu или начни с /start."

HELP = (
    "🎧 <b>Bed Music</b>\n\n"
    "/start — знакомство и регистрация\n"
    "/menu — главное меню\n"
    "/profile — мой профиль\n"
    "/upload — загрузить трек\n"
    "/feed — лента свежих треков\n"
    "/search &lt;запрос&gt; — поиск по трекам и артистам\n"
    "/help — эта справка"
)


def registered(name: str) -> str:
    return (
        f"🎉 Готово! Профиль музыканта <b>{escape(name)}</b> создан.\n\n"
        "Теперь можно загружать треки."
    )


def profile_card(artist: db.Artist, tracks: int, likes: int, own: bool) -> str:
    title = "👤 <b>Твой профиль</b>" if own else "👤 <b>Профиль музыканта</b>"
    lines = [title, "", f"🎤 <b>{escape(artist.name)}</b>"]
    if artist.description:
        lines += ["", escape(artist.description)]
    lines += ["", f"🎵 Треков: <b>{tracks}</b>    ❤️ Лайков: <b>{likes}</b>"]
    if not artist.avatar_file_id and own:
        lines += ["", "<i>Аватарка не установлена — добавь её в «Редактировать профиль».</i>"]
    return "\n".join(lines)


def track_card(track: db.Track) -> str:
    lines = [
        f"🎵 <b>{escape(track.title)}</b>",
        f"👤 {escape(track.artist_name)}",
        "",
        f"▶️ Прослушиваний: <b>{track.plays}</b>    ❤️ Лайков: <b>{track.likes}</b>",
    ]
    if track.duration:
        lines.insert(2, f"⏱ {fmt_duration(track.duration)}")
    return "\n".join(lines)


def feed_header(offset: int, page_size: int, total: int) -> str:
    last = min(offset + page_size, total)
    return (
        "🔥 <b>Лента</b> — свежие треки\n\n"
        f"Показаны {offset + 1}–{last} из {total}. Выбери трек:"
    )


def search_results(query: str, count: int) -> str:
    return f"🔎 По запросу «<b>{escape(query)}</b>» найдено: <b>{count}</b>"


def uploaded(title: str) -> str:
    return f"✅ Трек «<b>{escape(title)}</b>» опубликован — он уже в ленте!"


def confirm_delete(title: str) -> str:
    return f"🗑 Точно удалить трек «<b>{escape(title)}</b>»? Это необратимо."


def fmt_duration(seconds: int) -> str:
    return f"{seconds // 60}:{seconds % 60:02d}"
