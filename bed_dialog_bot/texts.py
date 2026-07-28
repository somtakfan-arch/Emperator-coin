from telegram import CopyTextButton, InlineKeyboardButton, InlineKeyboardMarkup

from . import config


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
