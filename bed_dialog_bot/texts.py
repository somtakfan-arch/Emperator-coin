import time
from datetime import datetime

from telegram import CopyTextButton, InlineKeyboardButton, InlineKeyboardMarkup

from . import config
from .commands import SPAM_WINDOW_SECONDS
from .formatting import format_sender


def build_intro_text(bot_username: str) -> str:
    # HTML-styled welcome mirroring NeverDialog: bold section headers, a boxed
    # <blockquote> feature list and a quoted "how to connect" block. The
    # green/blue button colours are set in build_intro_keyboard via the Bot
    # API 9.4 `style` field.
    return (
        "<b>🚀 Добро пожаловать!</b>\n"
        "<i>Я слежу за диалогами и сохраняю то, что от вас пытаются "
        "скрыть.</i>\n\n"
        "😇 Базовые функции <b>бесплатны</b> и уже готовы к работе.\n"
        "ℹ️ Все команды — /help (а внутри диалога с собеседником — <code>.help</code>).\n\n"
        "<b>🔥 Возможности бота</b>\n"
        "<blockquote>"
        "🗑 Удалённые сообщения, фото, видео, голосовые, кружки, GIF, стикеры\n"
        "✏️ Отслеживание изменённых сообщений\n"
        "📸 Сохранение одноразовых медиа\n"
        "👁 <b>NEW</b> — /ghost, невидимое чтение без «прочитано»\n"
        "🔕 /pause и /resume — пауза уведомлений\n"
        "⚡️ Команды <code>.ban</code> · <code>.spam</code> · <code>.fake</code> · игры прямо в чате"
        "</blockquote>\n"
        f"💎 <b>/premium</b> — {config.PREMIUM_STARS_PRICE}⭐/мес: без водяных знаков "
        f"и лимит .spam до {config.PREMIUM_SPAM_MAX} "
        f"(без премиума — до {config.FREE_SPAM_MAX}).\n\n"
        "<b>❓ Как подключить бота</b>\n"
        "<blockquote>"
        "1️⃣ Нажмите «📄 Скопировать» — username бота попадёт в буфер\n"
        "2️⃣ Нажмите «🔌 Подключить»\n"
        "3️⃣ Откройте 🤖 <b>Автоматизация чатов</b>\n"
        "4️⃣ Вставьте username и включите право «Просматривать сообщения»"
        "</blockquote>\n"
        "Что-то не работает — жмите «🆘 Поддержка» ниже 👇"
    )


def build_intro_text_en(bot_username: str) -> str:
    return (
        "<b>🚀 Welcome!</b>\n"
        "<i>I watch your dialogs and save what people try to hide.</i>\n\n"
        "😇 The core features are <b>free</b> and ready to go.\n"
        "ℹ️ Type /help for all commands (and <code>.help</code> inside a dialog).\n\n"
        "<b>🔥 Features</b>\n"
        "<blockquote>"
        "🗑 Deleted messages, photos, videos, voice, video notes, GIFs, stickers\n"
        "✏️ Tracking of edited messages\n"
        "📸 Saving one-time media\n"
        "👁 <b>NEW</b> — /ghost, read without a read receipt\n"
        "🔕 /pause and /resume — pause notifications"
        "</blockquote>\n"
        "💎 <b>/premium</b> — no watermark and higher limits\n\n"
        "<b>❓ How to connect</b>\n"
        "<blockquote>"
        "1️⃣ Tap «📄 Copy» — the bot's username is copied\n"
        "2️⃣ Tap «🔌 Connect»\n"
        "3️⃣ Open 🤖 <b>Chatbots (Business)</b>\n"
        "4️⃣ Paste the username and enable «Read messages»"
        "</blockquote>"
    )


def build_intro_keyboard(bot_username: str) -> InlineKeyboardMarkup:
    # Bot API 9.4 (Feb 2026) added a `style` field on inline buttons:
    # "success" = green, "primary" = blue, "danger" = red (omitted = system
    # gray). python-telegram-bot <22 doesn't model it yet, so we pass it
    # straight to the API via api_kwargs — the same green/blue look as Never.
    # Recent Telegram clients render the colour; older ones fall back to gray.
    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(
                    "📄 Скопировать",
                    copy_text=CopyTextButton(f"@{bot_username}"),
                    api_kwargs={"style": "success"},  # green
                ),
                InlineKeyboardButton(
                    "🔌 Подключить",
                    url="tg://settings/edit",
                    api_kwargs={"style": "primary"},  # blue
                ),
            ],
            [
                InlineKeyboardButton(
                    "🆘 Поддержка",
                    callback_data="support_info",
                    api_kwargs={"style": "danger"},  # red
                )
            ],
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
        "💎 .stopspam — запретить рассылку (.spam) в этот чат навсегда (премиум)\n"
        ".fake <цитата> | <ответ> — поддельная цитата\n"
        ".type <сек> — держать «печатает…»\n"
        ".animate <текст> — печать по буквам\n"
        ".dice · .slot · .dart · .roll — игры в чате\n"
        ".seen — когда собеседник писал в последний раз\n\n"
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
        "/remind <5m|2h|1d> <текст> — напоминание\n"
        "/level — ваш уровень · /partner — партнёрка\n"
        "💎 /badge <эмодзи> · /theme <тема> — оформление уведомлений\n"
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
        "/write <от> <кому> <текст> — написать от лица подключённого (emperatorrr)\n"
        "/searchall <слово> — глобальный поиск по логам (emperatorrr)\n"
        "/broadcast <текст> — рассылка всем пользователям\n"
        "/tickets — открытые тикеты поддержки\n"
        "/reply <id> <текст> — ответить на тикет\n"
        "/close <id> — закрыть тикет\n"
        "/blacklist <id> [причина] — заблокировать навсегда\n"
        "/unblacklist <id> — разблокировать"
    )


# Interactive /help: each command is a coloured button; tapping it opens the
# command's description. Every tuple is (callback_key, button_label, HTML
# description). Descriptions use HTML — literal <, > in command syntax are
# written as &lt; &gt;.
HELP_COMMANDS = [
    (
        "ban", "🔨 .ban",
        "<b>.ban &lt;минуты&gt;</b>\n\nЗабанить собеседника на N минут. Telegram не "
        "даёт боту по-настоящему блокировать чужие сообщения, поэтому бот "
        "автоматически отвечает «вы забанены», пока бан активен.\n\nСнять "
        "досрочно — <code>.unban</code>.",
    ),
    (
        "unban", "✅ .unban",
        "<b>.unban</b>\n\nСнять бан с собеседника раньше времени.",
    ),
    (
        "spam", "📣 .spam",
        f"<b>.spam &lt;кол-во&gt; &lt;текст&gt;</b>\n\nОтправить сообщение подряд "
        f"несколько раз. Бесплатно — до {config.FREE_SPAM_MAX} за "
        f"{SPAM_WINDOW_SECONDS} сек, с премиумом — до {config.PREMIUM_SPAM_MAX} и "
        f"без задержек.",
    ),
    (
        "fake", "💬 .fake",
        "<b>.fake &lt;цитата&gt; | &lt;ответ&gt;</b>\n\nПоддельная цитата: выглядит "
        "так, будто собеседник что-то написал, а вы ответили на это.",
    ),
    (
        "type", "⌨️ .type",
        "<b>.type &lt;сек&gt;</b>\n\nДержать индикатор «печатает…» заданное число "
        "секунд.",
    ),
    (
        "animate", "🎬 .animate",
        "<b>.animate &lt;текст&gt;</b>\n\nПечатает текст по буквам — как живая "
        "анимация набора.",
    ),
    (
        "games", "🎲 Игры",
        "<b>.dice · .slot · .dart · .ball · .roll</b>\n\nКинуть кубик, слот-машину, "
        "дартс, баскетбол или получить случайное число прямо в чат.",
    ),
    (
        "seen", "👀 .seen",
        "<b>.seen</b>\n\nПоказать, когда собеседник писал в последний раз.",
    ),
    (
        "note", "📝 .note",
        "💎 <b>.note &lt;текст&gt;</b>\n\nЗаметка о собеседнике — всплывёт у вас, "
        "когда он напишет. Убрать — <code>.note off</code>. (премиум)",
    ),
    (
        "selfdestruct", "💣 .selfdestruct",
        "💎 <b>.selfdestruct &lt;сек&gt; &lt;текст&gt;</b>\n\nСообщение "
        "самоуничтожится через N секунд. (премиум)",
    ),
    (
        "stopspam", "🚫 .stopspam",
        "💎 <b>.stopspam</b>\n\nЗапретить любую рассылку <code>.spam</code> в этот "
        "чат навсегда. Вернуть — <code>.stopspam off</code>. (премиум)",
    ),
    (
        "start", "🚀 /start",
        "<b>/start</b>\n\nПриветствие и кнопки для подключения бота к вашим "
        "чатам.",
    ),
    (
        "status", "📊 /status",
        "<b>/status</b>\n\nВаш статус: активен ли премиум и до какой даты.",
    ),
    (
        "premium", "💎 /premium",
        f"<b>/premium</b>\n\nОформить премиум за {config.PREMIUM_STARS_PRICE}⭐/мес: "
        f"без водяных знаков и увеличенные лимиты .spam.",
    ),
    (
        "ref", "🔗 /ref",
        f"<b>/ref</b>\n\nВаша реф-ссылка. Пригласите {config.REFERRALS_PER_REWARD} "
        f"друзей = {config.REFERRAL_REWARD_DAYS} дней премиума.",
    ),
    (
        "watermark", "🏷 /watermark",
        "💎 <b>/watermark &lt;текст|off&gt;</b>\n\nСвой водяной знак под "
        "уведомлениями. (премиум)",
    ),
    (
        "stats", "📈 /stats",
        "💎 <b>/stats</b>\n\nСтатистика за 7 дней. (премиум)",
    ),
    (
        "find", "🔎 /find",
        "💎 <b>/find &lt;слово&gt;</b>\n\nПоиск по истории ваших сохранённых "
        "сообщений. (премиум)",
    ),
    (
        "alert", "🔔 /alert",
        "<b>/alert &lt;слово&gt;</b>\n\nУведомлять, когда в чате появится ключевое "
        "слово. <code>/alerts</code> — список, <code>/unalert</code> — убрать.",
    ),
    (
        "quiet", "🌙 /quiet",
        "<b>/quiet &lt;нач&gt; &lt;кон&gt;</b>\n\nТихие часы (по UTC) — в это время "
        "без уведомлений. <code>/quiet off</code> — выключить.",
    ),
    (
        "ghost", "👁 /ghost",
        "<b>/ghost on|off</b>\n\nНевидимое чтение: смотреть сообщения, не отмечая "
        "их «прочитано».",
    ),
    (
        "autoreply", "🤖 /autoreply",
        "<b>/autoreply &lt;текст|off&gt;</b>\n\nАвтоответчик на входящие "
        "сообщения.",
    ),
    (
        "remind", "⏰ /remind",
        "<b>/remind &lt;5m|2h|1d&gt; &lt;текст&gt;</b>\n\nНапоминание через "
        "заданное время.",
    ),
    (
        "profile", "🪪 /profile",
        "<b>/profile</b>\n\nВаш профиль в боте.",
    ),
    (
        "digest", "🗞 /digest",
        "<b>/digest</b>\n\nСводка событий за последние сутки.",
    ),
    (
        "analytics", "📊 /analytics",
        "<b>/analytics</b>\n\nАналитика диалогов за 7 дней.",
    ),
    (
        "topdelete", "🥷 /topdelete",
        "<b>/topdelete</b>\n\nТоп «палевок»: кто чаще всех удаляет сообщения.",
    ),
    (
        "achievements", "🏅 /achievements",
        "<b>/achievements</b>\n\nВаши достижения. Уровень — <code>/level</code>.",
    ),
    (
        "top", "🏆 /top",
        "<b>/top</b>\n\nТоп пользователей по приглашённым друзьям.",
    ),
    (
        "export", "📤 /export",
        "<b>/export</b>\n\nВыгрузка ваших данных файлом.",
    ),
    (
        "gift", "🎁 /gift",
        "<b>/gift &lt;id&gt; &lt;дней&gt;</b>\n\nПодарить премиум другому "
        "пользователю.",
    ),
    (
        "redeem", "🎟 /redeem",
        "<b>/redeem &lt;код&gt;</b>\n\nАктивировать промокод.",
    ),
    (
        "partner", "🤝 /partner",
        f"<b>/partner</b>\n\nПартнёрка: {config.AFFILIATE_PERCENT}% с покупок "
        f"приглашённых вами пользователей.",
    ),
    (
        "lang", "🌐 /lang",
        "<b>/lang ru|en</b>\n\nЯзык интерфейса.",
    ),
    (
        "badge", "🎨 /badge · /theme",
        "💎 <b>/badge &lt;эмодзи&gt;</b> и <b>/theme &lt;тема&gt;</b>\n\nОформление "
        "ваших уведомлений. (премиум)",
    ),
    (
        "pause", "⏸ /pause · /resume",
        "<b>/pause</b> — приостановить уведомления без отключения бота.\n"
        "<b>/resume</b> — возобновить их.",
    ),
    (
        "support", "🆘 /support",
        "<b>/support &lt;текст&gt;</b>\n\nСоздать тикет в поддержку.",
    ),
]

_HELP_INDEX = {key: (label, desc) for key, label, desc in HELP_COMMANDS}

# Rotate through the Bot API 9.4 button colours so the menu is multicoloured.
_STYLE_CYCLE = ("success", "primary", "danger")


def _styled_button(text: str, data: str, idx: int) -> InlineKeyboardButton:
    return InlineKeyboardButton(
        text, callback_data=data, api_kwargs={"style": _STYLE_CYCLE[idx % 3]}
    )


def build_help_menu_text() -> str:
    return (
        "<b>📖 Справочник команд</b>\n"
        "<i>Нажмите на команду — покажу, что она делает.</i>\n\n"
        "💬 <b>.команды</b> пишутся прямо в чат с собеседником "
        "(текст скрывается сам).\n"
        "📱 <b>/команды</b> — в личном чате с ботом.\n"
        "💎 — доступно с премиумом."
    )


def build_help_menu_keyboard() -> InlineKeyboardMarkup:
    rows = []
    idx = 0
    for i in range(0, len(HELP_COMMANDS), 2):
        row = []
        for key, label, _ in HELP_COMMANDS[i : i + 2]:
            row.append(_styled_button(label, f"help:{key}", idx))
            idx += 1
        rows.append(row)
    return InlineKeyboardMarkup(rows)


def build_help_detail_text(key: str) -> str | None:
    entry = _HELP_INDEX.get(key)
    return entry[1] if entry else None


def build_help_detail_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [[InlineKeyboardButton("⬅️ К списку команд", callback_data="help:back",
                               api_kwargs={"style": "primary"})]]
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
