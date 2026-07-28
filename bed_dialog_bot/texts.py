import time
from datetime import datetime

from telegram import CopyTextButton, InlineKeyboardButton, InlineKeyboardMarkup

from . import config
from .commands import SPAM_WINDOW_SECONDS


def build_intro_text(bot_username: str) -> str:
    return (
        "🚀 Добро пожаловать!\n\n"
        "😇 Базовые функции бота бесплатны и готовы к работе.\n\n"
        "🔥 Возможности бота\n"
        "🗑 Отслеживание удалённых сообщений\n"
        "✏️ Отслеживание изменённых сообщений\n"
        "📸 Сохранение одноразовых фото (если на них ответили)\n"
        "🆕 Команды .ban / .unban / .spam / .help прямо в чате\n\n"
        f"💎 /premium — {config.PREMIUM_STARS_PRICE}⭐/мес: без водяных знаков в "
        f"уведомлениях и лимит .spam до {config.PREMIUM_SPAM_MAX} (без премиума — "
        f"до {config.FREE_SPAM_MAX})\n\n"
        "❓ Как подключить бота\n"
        "1. Нажмите «📄 Скопировать» — username бота скопируется в буфер.\n"
        "2. Нажмите «🔌 Подключить».\n"
        "3. Выберите 🤖 Автоматизация чатов.\n"
        "4. Вставьте скопированный username в поле бота и включите право "
        "«Просматривать сообщения»."
    )


def build_intro_keyboard(bot_username: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(
                    "📄 Скопировать",
                    copy_text=CopyTextButton(f"@{bot_username}"),
                ),
                InlineKeyboardButton("🔌 Подключить", url="tg://settings/edit"),
            ]
        ]
    )


CONNECTED_SUFFIX = "\n\n✅ Подключение установлено, бот уже следит за этим чатом."


def build_help_text() -> str:
    return (
        "📖 Справочник команд\n\n"
        "В чате с собеседником (после подключения через Автоматизацию чатов), "
        "текст команды в чате скрывается сам:\n"
        ".ban <минуты> — забанить (бот автоответит за вас, пока бан активен)\n"
        ".unban — снять бан раньше времени\n"
        f".spam <кол-во> <текст> — разослать сообщение подряд (до {config.FREE_SPAM_MAX}, "
        f"с премиумом — до {config.PREMIUM_SPAM_MAX}, укладывается в "
        f"{SPAM_WINDOW_SECONDS} секунд)\n"
        ".help — этот список, но прямо в чате с собеседником\n\n"
        "В личном чате с ботом:\n"
        "/start — приветствие и кнопки для подключения бота\n"
        "/status — ваш статус премиума\n"
        f"/premium — оформить премиум за {config.PREMIUM_STARS_PRICE}⭐/мес\n"
        "/help — этот справочник"
    )


def build_status_text(premium_until) -> str:
    if premium_until and premium_until > time.time():
        until_str = datetime.fromtimestamp(premium_until).strftime("%d.%m.%Y %H:%M")
        return f"💎 Премиум активен до {until_str}."
    return (
        "🆓 Премиум не активирован.\n"
        f"Оформить — /premium ({config.PREMIUM_STARS_PRICE}⭐/мес): без водяных "
        f"знаков в уведомлениях и лимит .spam до {config.PREMIUM_SPAM_MAX}."
    )
