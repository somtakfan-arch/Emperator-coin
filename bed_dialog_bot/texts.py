import time
from datetime import datetime

from telegram import CopyTextButton, InlineKeyboardButton, InlineKeyboardMarkup

from . import config
from .commands import SPAM_WINDOW_SECONDS
from .formatting import format_sender


def build_intro_text(bot_username: str) -> str:
    return (
        "🚀 Добро пожаловать!\n\n"
        "ℹ️ Напишите /help — и увидите все команды "
        "(а внутри диалога с собеседником — .help).\n\n"
        "😇 Базовые функции бота бесплатны и готовы к работе.\n\n"
        "🔥 Возможности бота\n"
        "🗑 Удалённые сообщения, фото, видео, голосовые, кружки, GIF, стикеры\n"
        "✏️ Отслеживание изменённых сообщений\n"
        "📸 Сохранение одноразовых медиа (если на них ответили)\n"
        "🔕 /pause и /resume — пауза уведомлений без отключения бота\n"
        "🆕 Команды .ban / .unban / .spam / .help прямо в чате\n\n"
        f"💎 /premium — {config.PREMIUM_STARS_PRICE}⭐/мес: без водяных знаков в "
        f"уведомлениях и лимит .spam до {config.PREMIUM_SPAM_MAX} (без премиума — "
        f"до {config.FREE_SPAM_MAX})\n\n"
        "❓ Как подключить бота\n"
        "1. Нажмите «📄 Скопировать» — username бота скопируется в буфер.\n"
        "2. Нажмите «🔌 Подключить».\n"
        "3. Выберите 🤖 Автоматизация чатов.\n"
        "4. Вставьте скопированный username в поле бота и включите право "
        "«Просматривать сообщения».\n\n"
        "Что-то не работает — жмите «🆘 Поддержка» ниже."
    )


def build_intro_text_en(bot_username: str) -> str:
    return (
        "🚀 Welcome!\n\n"
        "ℹ️ Type /help to see all commands "
        "(and .help inside a dialog with a contact).\n\n"
        "😇 The core features are free and ready to go.\n\n"
        "🔥 Features\n"
        "🗑 Deleted messages, photos, videos, voice, video notes, GIFs, stickers\n"
        "✏️ Tracking of edited messages\n"
        "📸 Saving one-time media (if you reply to it)\n"
        "👁 /ghost — read without a read receipt\n\n"
        f"💎 /premium — no watermark and higher limits\n\n"
        "❓ How to connect\n"
        "1. Tap «📄 Copy» — the bot's username is copied.\n"
        "2. Tap «🔌 Connect».\n"
        "3. Choose 🤖 Chatbots (Business).\n"
        "4. Paste the username and enable «Read messages»."
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
            ],
            [InlineKeyboardButton("🆘 Поддержка", callback_data="support_info")],
            [InlineKeyboardButton("❓ Вопрос по Telegram", callback_data="tg_help")],
        ]
    )


CONNECTED_SUFFIX = "\n\n✅ Подключение установлено, бот уже следит за этим чатом."

SUPPORT_PROMPT = (
    "Опишите проблему одним сообщением: /support <ваш вопрос>\n"
    "Если хотите, чтобы поддержка проверила ваши логи — добавьте слово «логи»."
)


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
        ".help — этот список, но прямо в чате с собеседником\n"
        "💎 .selfdestruct <сек> <текст> — самоуничтожение сообщения (премиум)\n"
        "💎 .note <текст> — заметка о собеседнике, всплывёт когда он напишет (премиум)\n"
        "💎 .stopspam — отключить сообщения этого собеседника вам (премиум)\n\n"
        "В личном чате с ботом:\n"
        "/start — приветствие и кнопки для подключения бота\n"
        "/status — ваш статус премиума\n"
        f"/premium — оформить премиум за {config.PREMIUM_STARS_PRICE}⭐/мес\n"
        f"/ref — реф-ссылка ({config.REFERRALS_PER_REWARD} друзей = "
        f"{config.REFERRAL_REWARD_DAYS} дней премиума)\n"
        "💎 /watermark <текст|off> — свой водяной знак (премиум)\n"
        "💎 /stats — статистика за 7 дней (премиум)\n"
        "💎 /find <слово> — поиск по истории (премиум)\n"
        "/alert <слово> · /alerts · /unalert — алерты по ключевым словам\n"
        "/quiet <нач> <кон> — тихие часы (UTC), /quiet off\n"
        "/top — топ по приглашениям\n"
        "/redeem <код> — активировать промокод\n"
        "/ghost on|off — невидимое чтение (читать не открывая диалог)\n"
        "/autoreply <текст|off> — автоответчик\n"
        "/profile — ваш профиль\n"
        "/digest — сводка за сутки · /analytics — аналитика за 7 дней\n"
        "/topdelete — топ «палевок» (кто чаще удаляет)\n"
        "/achievements — ваши достижения · /export — выгрузка данных\n"
        "/gift <id> <дней> — подарить премиум · /lang ru|en — язык\n"
        "/pause · /resume — приостановить / возобновить уведомления\n"
        "/help — этот справочник\n"
        "/support <текст> — создать тикет в поддержку"
    )


def build_admin_help_text() -> str:
    return (
        "🛠 Админ-команды\n\n"
        "/give premium <id> <дней> — выдать премиум\n"
        "/list — список всех пользователей (@username — id)\n"
        "/log <id> <1h|1d|1w> — .txt со всеми логами пользователя\n"
        "/photolog <id> <1h|1d|1w> — фото и медиа из логов\n"
        "/clearlog <id|all> — очистить логи пользователя или все\n"
        "/getlog <id> — полная запись без лимита (обычно хранятся сутки)\n"
        "/checklog <id> — посмотреть лог, не останавливая запись\n"
        "/photologcheck <id> — прислать все медиа, не останавливая запись\n"
        "/timeline <id> — таймлайн всех действий файлом\n"
        "/stoplog <id> — остановить запись и получить файл\n"
        "/accept <id> — принять вопрос по Telegram (даёт доступ к логам)\n"
        "/adminstats — дашборд (юзеры, подключения, премиум, тикеты)\n"
        "/createpromo <код> <дней> <активаций> — создать промокод\n"
        "/winback — разослать возврат ушедшим с премиума\n"
        "/broadcast <текст> — рассылка всем пользователям\n"
        "/tickets — открытые тикеты поддержки\n"
        "/reply <id> <текст> — ответить на тикет\n"
        "/close <id> — закрыть тикет\n"
        "/blacklist <id> [причина] — заблокировать навсегда\n"
        "/unblacklist <id> — разблокировать"
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


def build_ticket_created_text(ticket_id: int) -> str:
    return f"🎫 Тикет #{ticket_id} создан, ожидайте ответа от поддержки."


def build_ticket_notification(
    ticket_id: int, name: str, username, message: str, user_id: int, check_logs: bool
) -> str:
    flag = "\n🔎 Пользователь просит проверить логи." if check_logs else ""
    return (
        f"🎫 Новый тикет #{ticket_id}\n"
        f"👤 {format_sender(name, username)}\n"
        f"🆔 {user_id}{flag}\n\n"
        f"{message}\n\n"
        f"Ответить: /reply {ticket_id} <текст>\n"
        f"Логи: /log {user_id} 1d   ·   Фото: /photolog {user_id} 1d"
    )


def build_ticket_reply_text(ticket_id: int, reply_text: str) -> str:
    return f"🎫 Ответ поддержки (тикет #{ticket_id}):\n\n{reply_text}"
