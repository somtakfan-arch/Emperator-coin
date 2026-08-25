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
        "• ❤️ Лайки и личная подборка «Мне нравится»\n"
        "• 🤝 Продажа битов по договору, с эскроу в BED / TON / USDT\n\n"
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
    "/wallet — кошелёк и баланс\n"
    "/deals — мои сделки\n"
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


# --- marketplace -----------------------------------------------------------

from . import money as _money  # noqa: E402  (kept next to the texts that use it)

NOT_YOUR_TRACK = "⚠️ Это не твой трек."
ALREADY_SOLD = "⚠️ Этот бит уже продан."
NOT_FOR_SALE = "⚠️ Этот бит сейчас не продаётся."
CANNOT_BUY_OWN = "⚠️ Свой собственный бит купить нельзя."
DEAL_IN_PROGRESS = "⏳ По этому биту уже идёт сделка. Дождись её завершения."
SALE_OFF = "🚫 Снято с продажи"
PICK_CURRENCY = "💎 В какой валюте продаёшь бит?"

NOT_YOUR_DEAL = "⚠️ Ты не участник этой сделки."
DEAL_GONE = "⚠️ Сделка не найдена."
DEAL_MOVED_ON = "⚠️ Сделка уже перешла на следующий этап."
ALREADY_CONFIRMED = "✅ Ты уже подтвердил договор. Ждём вторую сторону."
NO_DEALS = "🤝 У тебя пока нет сделок."
DEALS_HEADER = "🤝 <b>Твои сделки</b>"

DECLINED_BY_SELLER = "продавец отклонил запрос"
CANCELLED_BY_PARTY = "вторая сторона отменила сделку"
DECLINE_DONE = "❌ Запрос отклонён. Деньги возвращены покупателю."
CANCEL_DONE = "❌ Сделка отменена."

SELLER_FORM_DONE = "✅ Твоя часть договора заполнена. Ждём ответы покупателя."
CONFIRMED_WAITING = "✅ Ты подтвердил договор. Ждём подтверждения второй стороны."
OTHER_SIDE_CONFIRMED = "✅ Вторая сторона подтвердила договор. Дело за тобой."
OTHER_SIDE_SIGNED = "✍️ Вторая сторона прислала подпись. Ждём твою."
SIGNATURE_SAVED = "✍️ Подпись принята. Ждём подпись второй стороны."

ASK_SIGNATURE = (
    "✍️ <b>Подписание</b>\n\n"
    "Обе стороны подтвердили договор. Теперь пришли <b>свою подпись</b>:\n"
    "распишись на белом листе, сфотографируй и отправь фото сюда.\n\n"
    "<i>Подпись будет вставлена в договор. По п. 6.3 договора фотография "
    "собственноручной подписи имеет юридическую силу.</i>"
)

ONCHAIN_OFF = (
    "🚧 <b>Пополнение и вывод пока не подключены</b>\n\n"
    "Внутренний баланс и эскроу работают: сделка блокирует деньги покупателя "
    "и переводит их продавцу после подписания.\n\n"
    "Чтобы завести деньги на баланс и выводить их в сеть, нужен кошелёк-казна "
    "сервиса. Пока его нет, баланс пополняет администратор."
)
ONCHAIN_SOON = "🚧 Раздел в работе."

CREDIT_USAGE = "Использование: <code>/credit &lt;user_id&gt; &lt;сумма&gt; &lt;BED|TON|USDT&gt;</code>"


def sale_status(track) -> str:
    if track.sold_at:
        return f"✅ Бит «<b>{escape(track.title)}</b>» продан."
    if track.for_sale:
        price = _money.format_amount(track.price_amount, track.price_currency)
        return (
            f"💰 Бит «<b>{escape(track.title)}</b>» продаётся за <b>{price}</b>.\n\n"
            "Покупатель увидит кнопку покупки на карточке трека."
        )
    return (
        f"🎵 Бит «<b>{escape(track.title)}</b>» не выставлен на продажу.\n\n"
        "Выстави цену — и на карточке появится кнопка покупки."
    )


def ask_price(code: str) -> str:
    cur = _money.currency(code)
    minimum = _money.format_amount(cur.min_amount, code)
    return (
        f"💰 Укажи цену в <b>{code}</b>.\n\n"
        f"<i>Минимум {minimum}, до {cur.decimals} знаков после точки.</i>"
    )


def bad_price(exc: Exception) -> str:
    return f"⚠️ {exc}\n\nПопробуй ещё раз."


def price_set(title: str, amount: int, code: str) -> str:
    return (
        f"✅ Бит «<b>{escape(title)}</b>» выставлен на продажу за "
        f"<b>{_money.format_amount(amount, code)}</b>."
    )


def not_enough_funds(need: int, have: int, code: str) -> str:
    return (
        "💸 <b>Не хватает средств</b>\n\n"
        f"Нужно: <b>{_money.format_amount(need, code)}</b>\n"
        f"На балансе: <b>{_money.format_amount(have, code)}</b>\n\n"
        "Пополни кошелёк и попробуй снова."
    )


def buy_requested(title: str, deal_id: int) -> str:
    return (
        f"🛒 <b>Запрос на покупку отправлен</b>\n\n"
        f"Бит: «{escape(title)}»\nСделка № {deal_id}\n\n"
        "Сумма заблокирована на твоём балансе и вернётся, если сделка не состоится.\n"
        "Ждём ответа продавца."
    )


def seller_got_request(buyer_name: str, title: str, amount: int, code: str) -> str:
    return (
        "🛒 <b>Запрос на покупку бита</b>\n\n"
        f"Покупатель: <b>{escape(buyer_name)}</b>\n"
        f"Бит: «{escape(title)}»\n"
        f"Цена: <b>{_money.format_amount(amount, code)}</b>\n\n"
        "Деньги покупателя уже заблокированы сервисом.\n"
        "Если примешь — заполним договор об отчуждении исключительного права."
    )


def seller_accepted(title: str) -> str:
    return (
        f"✅ Запрос принят. Оформляем договор на бит «{escape(title)}».\n\n"
        "Сейчас задам вопросы для договора — отвечай по одному сообщению."
    )


def buyer_notified_accepted(title: str) -> str:
    return f"✅ Продавец принял запрос по биту «{escape(title)}». Он заполняет свою часть договора."


def buyer_form_starts(title: str) -> str:
    return (
        f"📝 Продавец заполнил свою часть договора по биту «{escape(title)}».\n\n"
        "Теперь твои вопросы — отвечай по одному сообщению."
    )


def ask_question(question, number: int, total: int) -> str:
    lines = [f"📝 <b>Вопрос {number} из {total}</b>", "", f"<b>{escape(question.prompt)}</b>"]
    if question.hint:
        lines.append(f"<i>{escape(question.hint)}</i>")
    if question.optional:
        lines.append("<i>Можно пропустить — напиши «нет».</i>")
    return "\n".join(lines)


def answer_rejected(question, exc: Exception) -> str:
    return f"⚠️ {escape(str(exc))}\n\n<b>{escape(question.prompt)}</b>"


def draft_ready(deal) -> str:
    return (
        "📄 <b>Договор заполнен с обеих сторон</b>\n\n"
        f"Сделка № {deal.id} — «{escape(deal.track_title)}»\n"
        f"Сумма: <b>{_money.format_amount(deal.price_amount, deal.price_currency)}</b>\n\n"
        "Проверь документ. Если всё верно — нажми «Подтвердить договор».\n"
        "Подписание начнётся, когда подтвердят обе стороны."
    )


def deal_completed(deal, paid: bool, is_seller: bool) -> str:
    amount = _money.format_amount(deal.price_amount, deal.price_currency)
    lines = [
        "🎉 <b>Сделка завершена</b>",
        "",
        f"Сделка № {deal.id} — «{escape(deal.track_title)}»",
        "Договор подписан обеими сторонами.",
        "",
    ]
    if is_seller:
        lines.append(
            f"💰 На твой баланс зачислено <b>{amount}</b>."
            if paid
            else "⚠️ Оплата не прошла — напиши администратору."
        )
        lines.append("Не забудь передать материалы покупателю в срок из п. 1.4.")
    else:
        lines.append(f"✅ Исключительное право на бит перешло к тебе. Оплачено: <b>{amount}</b>.")
        lines.append("Материалы придут на указанную тобой почту в срок из п. 1.4.")
    lines += ["", "<i>Анкетные данные удалены из базы бота — договор остаётся у вас на руках.</i>"]
    return "\n".join(lines)


def deal_cancelled(deal, reason: str, refunded: bool, by_other: bool) -> str:
    lines = [f"❌ <b>Сделка № {deal.id} отменена</b>", "", f"Причина: {reason}."]
    if refunded:
        lines.append(
            f"💸 Возвращено покупателю: <b>"
            f"{_money.format_amount(deal.price_amount, deal.price_currency)}</b>."
        )
    return "\n".join(lines)


def deal_card(deal, viewer_id: int) -> str:
    stages = {
        "pending_seller": "⏳ Ждём ответа продавца",
        "seller_fill": "📝 Продавец заполняет договор",
        "buyer_fill": "📝 Покупатель заполняет договор",
        "review": "📄 Проверка договора и подтверждение",
        "signing": "✍️ Подписание",
        "completed": "✅ Завершена",
        "cancelled": "❌ Отменена",
    }
    role = "продавец" if viewer_id == deal.seller_id else "покупатель"
    return (
        f"🤝 <b>Сделка № {deal.id}</b>\n\n"
        f"Бит: «{escape(deal.track_title)}»\n"
        f"Сумма: <b>{_money.format_amount(deal.price_amount, deal.price_currency)}</b>\n"
        f"Твоя роль: {role}\n"
        f"Статус: {stages.get(deal.status, deal.status)}"
    )


def wallet_card(balances: dict) -> str:
    lines = ["👛 <b>Кошелёк</b>", ""]
    for code in _money.ORDER:
        lines.append(f"{code}: <b>{_money.format_amount(balances.get(code, 0), code, False)}</b>")
    lines += ["", "<i>Деньги на балансе используются для покупки битов через эскроу.</i>"]
    return "\n".join(lines)


def ledger_card(rows) -> str:
    if not rows:
        return "📜 Операций пока не было."
    reasons = {
        "escrow_hold": "Блокировка по сделке",
        "escrow_release": "Оплата за бит",
        "escrow_refund": "Возврат по сделке",
        "admin_credit": "Пополнение",
    }
    lines = ["📜 <b>Последние операции</b>", ""]
    for r in rows:
        sign = "+" if r["delta"] > 0 else ""
        label = reasons.get(r["reason"], r["reason"])
        deal = f" (сделка № {r['deal_id']})" if r["deal_id"] else ""
        lines.append(f"{sign}{_money.format_amount(r['delta'], r['currency'])} — {label}{deal}")
    return "\n".join(lines)


def audit_card(held: dict) -> str:
    if not held:
        return "🧾 Заблокированных средств нет."
    lines = ["🧾 <b>Заблокировано в эскроу</b>", ""]
    for code, amount in held.items():
        lines.append(f"{_money.format_amount(amount, code)}")
    return "\n".join(lines)


def credit_done(user_id: int, amount: int, code: str) -> str:
    return f"✅ Зачислено {_money.format_amount(amount, code)} пользователю {user_id}."


def credited(amount: int, code: str) -> str:
    return f"💰 Баланс пополнен на <b>{_money.format_amount(amount, code)}</b>."


def credit_failed(exc: Exception) -> str:
    return f"⚠️ {escape(str(exc))}\n\n{CREDIT_USAGE}"
