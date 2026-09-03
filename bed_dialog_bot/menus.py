"""Inline-menu system: photo banner + HTML caption + coloured button nav.

Navigation edits the same message's media/caption/keyboard in place. Banner
file_ids are cached in bot_data after the first upload so later edits reuse
them instead of re-uploading.
"""
import os
import time
from datetime import datetime

from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InputMediaPhoto,
)

from . import adlink, admin, bedcoin, commands, config, i18n, texts, ton, workink

_ASSETS = os.path.join(os.path.dirname(__file__), "assets")


def _banner(name: str) -> str:
    return os.path.join(_ASSETS, f"banner_{name}.png")


def _btn(text: str, data: str, style: str = None) -> InlineKeyboardButton:
    kw = {"style": style} if style else None
    return InlineKeyboardButton(text, callback_data=data, api_kwargs=kw)


_BACK = [_btn("⬅️ Назад", "menu:main", "danger")]


# ---------------- captions ----------------

def _fmt_dt(ts):
    if not ts:
        return "—"
    try:
        return datetime.fromtimestamp(ts).strftime("%d.%m.%Y")
    except (ValueError, OverflowError, OSError):
        return "надолго"


def cap_main(uid, storage, bot_username) -> str:
    return (
        "<b>🏛 Главное</b>\n"
        "<i>Бот подключён и следит за вашими диалогами.</i>\n\n"
        "<blockquote>🗑 Удалённые и изменённые сообщения\n"
        "🕓 Одноразовые фото, видео и кружки\n"
        "⚡️ Команды прямо в чате (.help)\n"
        "🆕 Уникальные функции бота</blockquote>\n"
        "Выберите раздел ниже 👇"
    )


def cap_profile(uid, storage, bot_username) -> str:
    prem_until = storage.get_premium_until(uid)
    prem = (f"💎 до {_fmt_dt(prem_until)}" if prem_until and prem_until > time.time() else "нет")
    connected = "✅ подключён" if storage.get_bcid_for_owner(uid) else "❌ не подключён"
    return (
        "<b>👤 Профиль</b>\n\n"
        "<blockquote>"
        f"🆔 ID: <code>{uid}</code>\n"
        f"💎 Подписка: <b>{prem}</b>\n"
        f"🔌 Бот: {connected}\n"
        f"🎯 Заготовок .troll: {storage.count_troll_texts(uid)}\n"
        f"👥 Приглашено: {storage.count_referrals(uid)}"
        "</blockquote>\n"
        "Спасибо, что с нами ❤️"
    )


def cap_stats(uid, storage, bot_username) -> str:
    bcid = storage.get_bcid_for_owner(uid)
    tracked = 0
    if bcid:
        # aggregate is not per-chat here; show a light summary
        pass
    return (
        "<b>📊 Статистика</b>\n\n"
        "<blockquote>"
        f"👥 Приглашено друзей: {storage.count_referrals(uid)}\n"
        f"🎯 Заготовок .troll: {storage.count_troll_texts(uid)}\n"
        f"💎 Премиум: {'да' if storage.is_premium(uid) else 'нет'}"
        "</blockquote>\n"
        "<i>Подробная статистика диалога — команда .status прямо в чате.</i>"
    )


def cap_support(uid, storage, bot_username) -> str:
    return (
        "<b>🆘 Поддержка</b>\n\n"
        "✍️ Вопрос или проблема — <code>/support &lt;текст&gt;</code>.\n"
        "💡 Идея новой функции — <code>/suggest &lt;текст&gt;</code> "
        "или кнопка «Предложить идею».\n"
        "🎬 Снял TikTok про бота — <code>/tiktok</code>, "
        "📢 запостил в ТГ-канале — <code>/tgpost</code>: пришли ссылку + скрин "
        "(просмотры/лайки), после проверки дадим промокод на премиум!\n\n"
        "<i>Хорошие предложения реализуем — пишите подробнее.</i>"
    )


def cap_sub(uid, storage, bot_username) -> str:
    return (
        "<b>💎 Подписка</b>\n"
        "<i>Больше возможностей бота:</i>\n\n"
        "<blockquote>"
        "📜 <b>Полная история переписки</b> (у бесплатных — только 24 ч)\n"
        "🔔 Безлимитные алерты по ключевым словам\n"
        "🚫 Убирает водяные знаки\n"
        f"⚡️ .spam лимит до {config.PREMIUM_SPAM_MAX}\n"
        f"🎯 .troll до {config.TROLL_PREMIUM_MAX} заготовок\n"
        "🎨 Свой стиль, эмодзи к сообщениям, заметки\n"
        "🎁 ×2 ежедневная награда\n"
        "🔎 Поиск по истории, аналитика, экспорт"
        "</blockquote>\n"
        f"Оформить — <b>/premium</b> ({config.PREMIUM_STARS_PRICE}⭐), криптой или "
        "монетами <b>BED</b> (в «Кошельке»). За <b>100 BED — навсегда</b> ♾"
    )


def cap_ref(uid, storage, bot_username) -> str:
    link = f"https://t.me/{bot_username}?start=ref_{uid}"
    return (
        "<b>👥 Реферальная программа</b>\n\n"
        "Приглашайте друзей и получайте награды за их покупки.\n\n"
        "🔗 <b>Ваша ссылка</b>\n"
        f"<code>{link}</code>\n\n"
        "<blockquote>"
        f"🤝 Партнёрка: {config.AFFILIATE_PERCENT}% с покупок приглашённых\n"
        f"🎁 {config.REFERRALS_PER_REWARD} друзей = "
        f"{config.REFERRAL_REWARD_DAYS} дней премиума\n"
        f"👥 Приглашено вами: {storage.count_referrals(uid)}"
        "</blockquote>"
    )


def cap_funcs(uid, storage, bot_username) -> str:
    def on(v):
        return "🟢 вкл" if v else "⚪️ выкл"
    ghost = storage.get_setting(f"ghost:{uid}") == "1"
    style = bool(storage.get_setting(f"style:{uid}"))
    autoreply = bool(storage.get_setting(f"autoreply:{uid}"))
    return (
        "<b>⚙️ Функции</b>\n"
        "<i>Быстрые переключатели:</i>\n\n"
        "<blockquote>"
        f"👁 Ghost — мгновенное «прочитано» (/ghost): {on(ghost)}\n"
        f"🎨 Стиль сообщений (/style): {on(style)}\n"
        f"🤖 Автоответчик (/autoreply): {on(autoreply)}"
        "</blockquote>\n"
        "Управление — командами выше или кнопками ниже."
    )


def cap_archive(uid, storage, bot_username) -> str:
    return (
        "<b>🗄 Архив</b>\n\n"
        "Здесь копятся удалённые, изменённые и одноразовые сообщения из ваших "
        "диалогов — бот присылает их вам автоматически.\n\n"
        "<blockquote>📤 Выгрузить всё файлом — команда /export\n"
        "🔎 Поиск по истории (премиум) — /find &lt;слово&gt;</blockquote>"
    )


def cap_cmds(uid, storage, bot_username) -> str:
    return texts.build_help_menu_text()


def cap_wallet(uid, storage, bot_username) -> str:
    bal = storage.get_bed(uid)
    sale_price = storage.bed_sale_price_for(uid) if hasattr(storage, "bed_sale_price_for") else None
    price = bedcoin.fmt_price_for(storage, uid)
    sold = int(bedcoin.total_sold(storage))
    rank = bedcoin.holder_rank(bal)
    nxt = bedcoin.next_rank(bal)
    nxt_line = f"\n🎯 До «{nxt[0]}»: ещё {nxt[1]} BED" if nxt else "\n🏆 Высший титул достигнут!"
    dust = storage.get_bed_dust(uid) if hasattr(storage, "get_bed_dust") else 0.0
    dust_line = f"\n💫 В копилке: {dust:.4f} BED".replace(".0000", "") if dust > 1e-6 else ""
    text = (
        "<b>🪙 Кошелёк BedCoin</b>\n\n"
        "<blockquote>"
        f"💰 Баланс: <b>{bal} BED</b>\n"
        f"{rank}{nxt_line}{dust_line}\n"
        f"📈 Курс: <b>{price} ⭐ за 1 BED</b>{' 🏷 ПРОМО' if sale_price else ''}\n"
        f"🔥 Продано всего: {sold} BED"
        "</blockquote>\n"
        + ("<i>🏷 У тебя активна распродажа — покупай BED по промо-цене, сколько угодно!</i>\n"
           if sale_price else
           "<i>Цена растёт со спросом — чем больше куплено, тем дороже.</i>\n")
    )
    if ton.configured():
        t_bed, t_ton, _addr = bedcoin.treasury_cache(storage)
        if t_bed is not None:
            text += (
                "\n<blockquote>🏛 <b>Казна BedCoin</b>\n"
                f"🪙 Резерв: {int(t_bed)} BED\n"
                f"⛽️ Газ: {t_ton:.2f} TON</blockquote>\n"
            )
        text += "<i>💎 BED — реальный TON-джеттон: можно купить на кошелёк, пополнить и вывести on-chain.</i>\n"
    text += "Выберите действие 👇"
    return text


def kb_wallet(uid, storage) -> InlineKeyboardMarkup:
    rows = []
    for amount in config.BED_BUY_PACKAGES:
        cost = bedcoin.cost_stars(storage, amount, uid)
        rows.append([_btn(f"🪙 Купить {amount} BED · {cost}⭐", f"bed:buy:{amount}", "success")])
    for idx, (label, bed, _days) in enumerate(config.BED_PREMIUM_PACKAGES):
        rows.append([_btn(f"💎 Премиум {label} · {bed} BED", f"bed:sub:{idx}", "primary")])
    if ton.configured():
        rows.append([_btn("💳 Купить BED на свой TON-кошелёк ⭐", "bed:chain:0", "success")])
        rows.append([
            _btn("💎 Пополнить BED", "bed:deposit:0", "success"),
            _btn("📤 Вывести BED", "bed:withdraw:0", "primary"),
        ])
    rows.append([_btn("💸 Перевести BED другу", "bed:send:0", "success"),
                 _btn("📜 История", "bed:history:0", "primary")])
    rows.append([_btn("🎟 Создать BED-чек", "bed:code:0", "primary"),
                 _btn("🏆 Топ держателей", "bed:top:0", "primary")])
    if ton.configured():
        _, _, addr = bedcoin.treasury_cache(storage)
        if addr:
            rows.append([InlineKeyboardButton("🔎 Казна в TON-скане", url=f"https://tonviewer.com/{addr}")])
    rows.append([_btn("⬅️ Назад", "menu:main", "danger")])
    return InlineKeyboardMarkup(rows)


def cap_admin(uid, storage, bot_username) -> str:
    rank = admin.rank_of(storage, uid) or "—"
    perms = ", ".join(sorted(admin.perms_of(storage, uid))) or "—"
    return (
        "<b>🛡 Админ-панель</b>\n\n"
        "<blockquote>"
        f"🎖 Ранг: <b>{rank}</b>\n"
        f"🔑 Права: {perms}"
        "</blockquote>\n"
        "Выберите раздел ниже 👇"
    )


def kb_admin(uid, storage) -> InlineKeyboardMarkup:
    p = admin.perms_of(storage, uid)
    rows = []
    live = []  # buttons that open a view
    if "users" in p:
        live.append(_btn("📊 Дашборд", "adm:dash", "primary"))
        live.append(_btn("👥 Пользователи", "adm:users", "primary"))
    if "tickets" in p:
        live.append(_btn("🎫 Тикеты", "adm:tickets", "success"))
    # pack live buttons 2 per row
    for i in range(0, len(live), 2):
        rows.append(live[i:i + 2])
    hints = []
    if "logs" in p:
        hints.append(_btn("📜 Логи", "adm:logs", "primary"))
    if "saves" in p:
        hints.append(_btn("💾 Сохранёнки", "adm:saves", "primary"))
    if "moderation" in p:
        hints.append(_btn("⛔ Модерация", "adm:mod", "danger"))
    if "premium" in p:
        hints.append(_btn("💎 Премиум", "adm:premium", "success"))
    if "broadcast" in p:
        hints.append(_btn("📢 Рассылка", "adm:broadcast", "danger"))
    if "promo" in p:
        hints.append(_btn("🎟 Промо", "adm:promo", "success"))
    for i in range(0, len(hints), 2):
        rows.append(hints[i:i + 2])
    if admin.is_super(uid):
        rows.append([_btn("👑 Управление админами", "adm:admins", "danger")])
    rows.append([_btn("⬅️ Назад", "menu:main", "danger")])
    return InlineKeyboardMarkup(rows)


def kb_admin_back() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[_btn("⬅️ В админку", "adm:home", "primary")]])


_STYLE_ORDER = ["bold", "italic", "strike", "underline", "mono", "spoiler"]


def _style_keys(uid, storage):
    return [k for k in (storage.get_setting(f"style:{uid}") or "").split(",") if k]


def cap_style(uid, storage, bot_username) -> str:
    keys = _style_keys(uid, storage)
    names = ", ".join(commands.STYLE_LABELS.get(k, k) for k in keys) if keys else "выключено"
    preview = commands.apply_styles("пример текста", keys) if keys else "пример текста"
    return (
        "<b>🎨 Форматирование текста</b>\n"
        "<i>Выберите, как будет выглядеть ваш текст.</i>\n\n"
        f"Активно: <b>{names}</b>\n"
        f"Пример: {preview}"
    )


# ---------------- keyboards ----------------

def kb_main(uid=None, storage=None) -> InlineKeyboardMarkup:
    rows = [
        [_btn("🎬 Премиум за TikTok про бота", "partner:tiktok", "danger")],
        [_btn("📢 Премиум за пост в ТГ-канале", "partner:tgchannel", "danger")],
        [_btn("🗄 Архив", "menu:archive", "success")],
        [_btn("👤 Профиль", "menu:profile", "success")],
        [_btn("⚙️ Функции", "menu:funcs", "primary"), _btn("📊 Статистика", "menu:stats", "primary")],
        [_btn("👥 Рефералы", "menu:ref", "primary"), _btn("📟 Команды", "menu:cmds", "primary")],
        [_btn("💎 Подписка", "menu:sub", "primary"), _btn("🪙 Кошелёк", "menu:wallet", "success")],
        [_btn("🗓 Ежедневная награда", "daily:claim", "success")],
        [_btn("🧩 Мои команды", "mycmds:open", "primary"), _btn("🛒 Магазин команд", "mkt:open", "success")],
        [_btn("🆘 Поддержка", "menu:support", "success"), _btn("🌐 Язык", "lang:menu", "primary")],
    ]
    if adlink.enabled() or workink.enabled():
        rows.append([_btn("🎁 Бесплатный премиум", "reward:get", "danger")])
    # Admin panel is intentionally NOT shown in the interface — it opens only
    # via the /adm command. A stale menu:admin button just says «Недоступно».
    # ULTRA panel pinned at the very bottom (highlighted for subscribers).
    if storage is not None and uid is not None and storage.is_ultra(uid):
        rows.append([_btn("🔱 ULTRA PREMIUM", "menu:ultra", "danger")])
    else:
        rows.append([_btn("🔱 Получить ULTRA PREMIUM", "menu:ultra", "primary")])
    return InlineKeyboardMarkup(rows)


def kb_profile() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [_btn("🔔 Уведомления", "menu:funcs", "primary")],
        [_btn("🗑 Удалить мои данные", "menu:wipe", "danger")],
        _BACK,
    ])


def kb_stats() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [_btn("👥 Рефералы", "menu:ref", "primary"), _btn("💎 Подписка", "menu:sub", "primary")],
        _BACK,
    ])


def kb_support() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [_btn("✍️ Задать вопрос", "support:ask", "success")],
        [_btn("💡 Предложить идею", "support:suggest", "primary")],
        [_btn("🎬 Партнёрка TikTok", "support:tiktok", "primary"),
         _btn("📢 Партнёрка ТГК", "support:tgchannel", "primary")],
        [_btn("✈️ Связаться", "menu:contact", "success")],
        _BACK,
    ])


def kb_sub() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [_btn("👤 Себе", "menu:buyself", "success"), _btn("🎁 Подарить", "menu:gift", "success")],
        _BACK,
    ])


def kb_ref() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[_btn("📊 Статистика", "menu:stats", "primary")], _BACK])


def kb_funcs() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [_btn("👁 Ghost", "func:ghost", "success"), _btn("💎 Стиль", "menu:style", "primary")],
        [_btn("🤖 Автоответчик", "func:autoreply", "danger")],
        _BACK,
    ])


def kb_archive() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([_BACK])


def kb_cmds() -> InlineKeyboardMarkup:
    return texts.build_cmds_keyboard()


def kb_style(uid, storage) -> InlineKeyboardMarkup:
    active = set(_style_keys(uid, storage))

    def sb(key):
        on = key in active
        label = commands.STYLE_LABELS.get(key, key).capitalize()
        return _btn(("✅ " if on else "") + label, f"style:{key}", "success" if on else "danger")

    return InlineKeyboardMarkup([
        [sb("bold"), sb("italic")],
        [sb("strike"), sb("underline")],
        [sb("mono"), sb("spoiler")],
        _BACK,
    ])


# section -> (banner name, caption fn, keyboard fn)
def _ultra_left(until) -> str:
    import time as _t
    secs = int((until or 0) - _t.time())
    if secs <= 0:
        return "истёк"
    d, rem = divmod(secs, 86400)
    h = rem // 3600
    if d > 0:
        return f"{d} дн {h} ч"
    if h > 0:
        return f"{h} ч"
    return f"{max(1, secs // 60)} мин"


def cap_ultra(uid, storage, bot_username) -> str:
    if storage.is_ultra(uid):
        left = _ultra_left(storage.get_ultra_until(uid))
        return (
            "<b>🔱 ULTRA PREMIUM</b>\n"
            f"<i>Активен · осталось <b>{left}</b></i>\n\n"
            "<blockquote>"
            "🛡 Иммунитет к <b>.ban/.spam/.troll</b> и всем power-командам\n"
            "🚨 Сигнал, кто пытался тебя тронуть\n"
            "⚡️ Твой .spam — <b>моментально</b>, .troll — очень быстро\n"
            "💥 Power-команды (.hack, .trace…) — <b>бесплатно</b>\n"
            "🎭 Тебя нельзя <b>клонировать</b> (.clone)\n"
            f"💸 BED дешевле на <b>{int(config.ULTRA_BED_DISCOUNT*100)}%</b>\n"
            "📜 Вечная история переписки\n"
            "🔱 Префикс <b>ULTRA</b> перед другими · 🎧 моментальная поддержка\n"
            f"⏳ Grace-период {config.ULTRA_GRACE_DAYS} дн после окончания\n"
            f"🪞 Рикошет — атака врага бьёт по нему\n"
            f"💀 Несокрушимый бан ×{config.ULTRA_BAN_MULT}"
            "</blockquote>\n"
            "<blockquote>⚡ Команды ULTRA:\n"
            ".enemy / .unenemy — авто-удалять контакт\n"
            ".vip / .unvip — особый сигнал\n"
            "/ultratitle — свой титул\n"
            "/ralert — регекс-алерты\n"
            "/mybackup — личный бэкап</blockquote>\n"
            "<i>Тумблеры ниже 👇 Команды на других использовать можно.</i>"
        )
    return (
        "<b>🔱 ULTRA PREMIUM</b>\n"
        "<i>Высший тариф — тебя нельзя тронуть.</i>\n\n"
        "<blockquote>"
        "🛡 Никто не заюзает на тебя <b>.ban / .spam / .troll</b>\n"
        "⚡️ Твои .spam / .troll — моментально\n"
        "🔱 Префикс <b>ULTRA</b> перед всеми\n"
        "🎧 Моментальная поддержка, тесная связь\n"
        "⏳ Всегда видно, сколько осталось"
        "</blockquote>\n"
        f"Цена: <b>{config.ULTRA_STARS_PRICE}⭐</b> или <b>{config.ULTRA_BED_PRICE} BED</b> / месяц.\n"
        f"♾ Навсегда: <b>{config.ULTRA_FOREVER_STARS_PRICE}⭐</b> или "
        f"<b>{config.ULTRA_FOREVER_BED_PRICE} BED</b> (разово)."
    )


def kb_ultra(uid, storage) -> InlineKeyboardMarkup:
    active = storage.is_ultra(uid)
    rows = []
    if active:
        # Immunity toggles (only meaningful for active ULTRA subscribers).
        for kind, label in (("ban", ".ban"), ("spam", ".spam"), ("troll", ".troll"),
                            ("power", "power-команды")):
            on = storage.ultra_immunity(uid, kind)
            state = "🟢 ВКЛ" if on else "🔴 ВЫКЛ"
            rows.append([_btn(f"🛡 Иммунитет {label}: {state}", f"ultra:tog:{kind}",
                              "success" if on else "danger")])
        alarm = storage.ultra_immunity(uid, "alarm")
        rows.append([_btn(f"🚨 Сигнал тревоги: {'🟢 ВКЛ' if alarm else '🔴 ВЫКЛ'}",
                          "ultra:tog:alarm", "success" if alarm else "danger")])
        stealth = storage.ultra_immunity(uid, "stealth")
        rows.append([_btn(f"🥷 Невидимка (стелс): {'🟢 ВКЛ' if stealth else '🔴 ВЫКЛ'}",
                          "ultra:tog:stealth", "success" if stealth else "danger")])
        ric = storage.ultra_immunity(uid, "ricochet")
        rows.append([_btn(f"🪞 Рикошет: {'🟢 ВКЛ' if ric else '🔴 ВЫКЛ'}",
                          "ultra:tog:ricochet", "success" if ric else "danger")])
    if storage.is_ultra_forever(uid):
        # Lifetime ULTRA — nothing left to buy.
        rows.append([_btn("♾ ULTRA НАВСЕГДА — активно", "noop", "success")])
        rows.append(_BACK)
        return InlineKeyboardMarkup(rows)
    verb = "Продлить" if active else "Купить"
    rows.append([_btn(f"⭐ {verb} · {config.ULTRA_STARS_PRICE}", "ultra:buystars", "success")])
    rows.append([_btn(f"🔱 {verb} · {config.ULTRA_BED_PRICE} BED", "ultra:buybed", "primary")])
    rows.append([_btn(f"♾ Навсегда · {config.ULTRA_FOREVER_STARS_PRICE}⭐", "ultra:buystars_forever", "success"),
                 _btn(f"♾ · {config.ULTRA_FOREVER_BED_PRICE} BED", "ultra:buybed_forever", "primary")])
    rows.append(_BACK)
    return InlineKeyboardMarkup(rows)


SECTIONS = {
    "main": ("main", cap_main, kb_main),
    "ultra": ("sub", cap_ultra, kb_ultra),
    "profile": ("profile", cap_profile, kb_profile),
    "stats": ("stats", cap_stats, kb_stats),
    "support": ("support", cap_support, kb_support),
    "sub": ("sub", cap_sub, kb_sub),
    "ref": ("ref", cap_ref, kb_ref),
    "funcs": ("funcs", cap_funcs, kb_funcs),
    "archive": ("archive", cap_archive, kb_archive),
    "cmds": ("cmds", cap_cmds, kb_cmds),
    "style": ("style", cap_style, kb_style),
    "admin": ("admin", cap_admin, kb_admin),
    "wallet": ("wallet", cap_wallet, kb_wallet),
}


def _build_kb(kb_fn, uid, storage):
    """Some keyboards need per-user state (e.g. style toggles); others don't."""
    try:
        return kb_fn(uid, storage)
    except TypeError:
        return kb_fn()


def _cache_fid(context, name, message):
    try:
        if message and message.photo:
            context.bot_data.setdefault("banner_fid", {})[name] = message.photo[-1].file_id
    except Exception:
        pass


def _media(context, name, caption):
    fid = context.bot_data.setdefault("banner_fid", {}).get(name)
    if fid:
        return InputMediaPhoto(media=fid, caption=caption, parse_mode="HTML")
    return InputMediaPhoto(media=open(_banner(name), "rb"), caption=caption, parse_mode="HTML")


async def _localize(storage, uid, caption, kb):
    """Translate caption + keyboard to the user's language (cached). Falls back
    to the originals on any failure so the menu never breaks."""
    lang = i18n.get_lang(storage, uid)
    if lang == i18n.DEFAULT:
        return caption, kb
    try:
        caption = await i18n.tr(storage, caption, lang)
        kb = await i18n.localize_keyboard(storage, kb, lang)
    except Exception:
        pass
    return caption, kb


async def send_section(context, chat_id, section, uid, storage, bot_username):
    """Send a section as a new photo message."""
    name, cap_fn, kb_fn = SECTIONS[section]
    caption = cap_fn(uid, storage, bot_username)
    kb = _build_kb(kb_fn, uid, storage)
    caption, kb = await _localize(storage, uid, caption, kb)
    fid = context.bot_data.setdefault("banner_fid", {}).get(name)
    photo = fid if fid else open(_banner(name), "rb")
    try:
        msg = await context.bot.send_photo(
            chat_id=chat_id, photo=photo, caption=caption,
            parse_mode="HTML", reply_markup=kb,
        )
    except Exception:
        # Translated caption may have produced invalid HTML — retry in Russian.
        photo2 = context.bot_data.setdefault("banner_fid", {}).get(name) or open(_banner(name), "rb")
        msg = await context.bot.send_photo(
            chat_id=chat_id, photo=photo2, caption=cap_fn(uid, storage, bot_username),
            parse_mode="HTML", reply_markup=_build_kb(kb_fn, uid, storage),
        )
    _cache_fid(context, name, msg)
    return msg


async def edit_section(context, query, section, uid, storage, bot_username):
    """Morph the current menu message into another section."""
    name, cap_fn, kb_fn = SECTIONS[section]
    caption = cap_fn(uid, storage, bot_username)
    kb = _build_kb(kb_fn, uid, storage)
    caption, kb = await _localize(storage, uid, caption, kb)
    try:
        msg = await query.edit_message_media(
            media=_media(context, name, caption), reply_markup=kb,
        )
        _cache_fid(context, name, msg)
    except Exception as e:
        if "not modified" in str(e).lower():
            return
        # Fallback (e.g. original message wasn't a photo): send a fresh one.
        await send_section(context, query.message.chat_id, section, uid, storage, bot_username)
