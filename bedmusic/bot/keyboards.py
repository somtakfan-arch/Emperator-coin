"""Inline keyboards.

Button colours use the ``style`` field added in Bot API 9.4 (2026-02-09):
``"danger"`` (red), ``"success"`` (green), ``"primary"`` (blue).
Clients older than the feature simply ignore the field and draw the default
button, so the keyboards stay usable everywhere.
"""

from __future__ import annotations

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from . import db

DANGER = "danger"
SUCCESS = "success"
PRIMARY = "primary"


def btn(text: str, data: str, style: str | None = None) -> InlineKeyboardButton:
    return InlineKeyboardButton(text=text, callback_data=data, style=style)


def register() -> InlineKeyboardMarkup:
    """The red "register" button shown under the /start card."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [btn("🔴 Зарегистрироваться", "reg:start", DANGER)],
            [btn("🔥 Послушать музыку", "feed:0", PRIMARY)],
        ]
    )


def main_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [btn("⬆️ Загрузить трек", "upload:start", SUCCESS)],
            [
                btn("🔥 Лента", "feed:0", PRIMARY),
                btn("🔎 Поиск", "search:start", PRIMARY),
            ],
            [
                btn("👤 Мой профиль", "profile:me"),
                btn("❤️ Мне нравится", "liked:0"),
            ],
            [
                btn("👛 Кошелёк", "wallet", PRIMARY),
                btn("🤝 Мои сделки", "deals", PRIMARY),
            ],
        ]
    )


def back_to_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[btn("⬅️ В меню", "menu", PRIMARY)]])


def skip(step: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [btn("⏭ Пропустить", f"reg:skip:{step}")],
            [btn("✖️ Отменить регистрацию", "reg:cancel", DANGER)],
        ]
    )


def cancel_registration() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[btn("✖️ Отменить регистрацию", "reg:cancel", DANGER)]]
    )


def cancel(action: str = "menu") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[btn("✖️ Отмена", action, DANGER)]]
    )


def keep_title(title: str) -> InlineKeyboardMarkup:
    shown = title if len(title) <= 30 else title[:29] + "…"
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [btn(f"✅ Оставить «{shown}»", "upload:keep", SUCCESS)],
            [btn("✖️ Отмена", "menu", DANGER)],
        ]
    )


def profile(own: bool) -> InlineKeyboardMarkup:
    rows = [[btn("🎵 Треки артиста", "profile:tracks")]] if not own else []
    if own:
        rows = [
            [btn("⬆️ Загрузить трек", "upload:start", SUCCESS)],
            [btn("✏️ Редактировать профиль", "edit:menu", PRIMARY)],
        ]
    rows.append([btn("⬅️ В меню", "menu")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def artist_card(artist_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [btn("🎵 Все треки артиста", f"artist:tracks:{artist_id}", PRIMARY)],
            [btn("⬅️ В меню", "menu")],
        ]
    )


def edit_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [btn("📝 Имя музыканта", "edit:name", PRIMARY)],
            [btn("📄 Описание", "edit:description", PRIMARY)],
            [btn("🖼 Аватарка", "edit:avatar", PRIMARY)],
            [btn("⬅️ В меню", "menu")],
        ]
    )


async def track_actions(track: db.Track, viewer_id: int) -> InlineKeyboardMarkup:
    liked = await db.is_liked(viewer_id, track.id)
    heart = "💚" if liked else "🤍"
    rows = [
        [
            btn("▶️ Слушать", f"play:{track.id}", SUCCESS),
            btn(f"{heart} {track.likes}", f"like:{track.id}"),
        ],
        [btn(f"👤 {track.artist_name}", f"artist:{track.artist_id}", PRIMARY)],
    ]
    if track.artist_id == viewer_id:
        label = "💰 Цена продажи" if track.for_sale else "💰 Продать бит"
        rows.append([btn(label, f"sell:menu:{track.id}", SUCCESS)])
        rows.append([btn("🗑 Удалить трек", f"track:del:{track.id}", DANGER)])
    elif track.for_sale:
        from . import money

        price = money.format_amount(track.price_amount, track.price_currency)
        rows.append([btn(f"🛒 Купить за {price}", f"buy:{track.id}", DANGER)])

    rows.append([btn("⬅️ В меню", "menu")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def feed_page(
    tracks: list[db.Track], offset: int, page_size: int, total: int, prefix: str = "feed"
) -> InlineKeyboardMarkup:
    rows = [
        [btn(f"▶️ {t.artist_name} — {_short(t.title)}", f"track:{t.id}")] for t in tracks
    ]

    nav: list[InlineKeyboardButton] = []
    if offset > 0:
        nav.append(btn("⬅️", f"{prefix}:{max(0, offset - page_size)}", PRIMARY))
    if offset + page_size < total:
        nav.append(btn("➡️", f"{prefix}:{offset + page_size}", PRIMARY))
    if nav:
        rows.append(nav)

    rows.append([btn("⬅️ В меню", "menu")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def track_list(tracks: list[db.Track]) -> InlineKeyboardMarkup:
    rows = [
        [btn(f"▶️ {t.artist_name} — {_short(t.title)}", f"track:{t.id}")] for t in tracks
    ]
    rows.append([btn("⬅️ В меню", "menu")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def confirm_delete(track_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [btn("🗑 Да, удалить", f"track:delyes:{track_id}", DANGER)],
            [btn("↩️ Нет, оставить", f"track:{track_id}", SUCCESS)],
        ]
    )


def _short(text: str, limit: int = 28) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


# --- marketplace -----------------------------------------------------------


def currency_picker(track_id: int) -> InlineKeyboardMarkup:
    from . import money

    return InlineKeyboardMarkup(
        inline_keyboard=[
            [btn(f"💎 {code}", f"sell:cur:{track_id}:{code}", PRIMARY) for code in money.ORDER],
            [btn("✖️ Отмена", f"track:{track_id}", DANGER)],
        ]
    )


def sale_settings(track_id: int, on_sale: bool) -> InlineKeyboardMarkup:
    rows = [[btn("💰 Изменить цену" if on_sale else "💰 Выставить на продажу",
                 f"sell:start:{track_id}", SUCCESS)]]
    if on_sale:
        rows.append([btn("🚫 Снять с продажи", f"sell:off:{track_id}", DANGER)])
    rows.append([btn("⬅️ К треку", f"track:{track_id}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def buy_request(deal_id: int) -> InlineKeyboardMarkup:
    """Shown to the seller when someone asks to buy."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [btn("✅ Принять запрос", f"deal:accept:{deal_id}", SUCCESS)],
            [btn("❌ Отклонить", f"deal:decline:{deal_id}", DANGER)],
        ]
    )


def deal_confirm(deal_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [btn("✅ Подтвердить договор", f"deal:confirm:{deal_id}", SUCCESS)],
            [btn("❌ Отказаться от сделки", f"deal:cancel:{deal_id}", DANGER)],
        ]
    )


def deal_cancel(deal_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[btn("❌ Отменить сделку", f"deal:cancel:{deal_id}", DANGER)]]
    )


def deal_open(deal_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [btn("📄 Открыть сделку", f"deal:show:{deal_id}", PRIMARY)],
            [btn("⬅️ В меню", "menu")],
        ]
    )


def deals_list(deals: list) -> InlineKeyboardMarkup:
    icons = {
        "pending_seller": "⏳", "seller_fill": "📝", "seller_files": "📦",
        "buyer_fill": "📝",
        "review": "📄", "signing": "✍️", "completed": "✅", "cancelled": "❌",
    }
    rows = [
        [btn(f"{icons.get(d.status, '•')} №{d.id} — {_short(d.track_title, 20)}", f"deal:show:{d.id}")]
        for d in deals
    ]
    rows.append([btn("⬅️ В меню", "menu")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def wallet(has_funds: bool) -> InlineKeyboardMarkup:
    rows = [
        [btn("⬇️ Пополнить", "wallet:deposit", SUCCESS)],
        [btn("⬆️ Вывести", "wallet:withdraw", PRIMARY)] if has_funds else [],
        [btn("📜 История", "wallet:history")],
        [btn("🤝 Мои сделки", "deals")],
        [btn("⬅️ В меню", "menu")],
    ]
    return InlineKeyboardMarkup(inline_keyboard=[r for r in rows if r])


def materials_done(deal_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [btn("✅ Все файлы отправлены", f"deal:files_done:{deal_id}", SUCCESS)],
            [btn("❌ Отменить сделку", f"deal:cancel:{deal_id}", DANGER)],
        ]
    )


def retry_delivery(deal_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [btn("🔁 Повторить передачу", f"deal:retry:{deal_id}", SUCCESS)],
            [btn("❌ Отменить сделку", f"deal:cancel:{deal_id}", DANGER)],
        ]
    )
