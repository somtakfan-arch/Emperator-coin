from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from config import (
    BET_PRESETS,
    COINFLIP_MULTIPLIER,
    DICE_EXTREME_MULTIPLIER,
    DICE_NUMBER_MULTIPLIER,
    DICE_PARITY_MULTIPLIER,
    MINES_PRESETS,
    MINES_SIZES,
    ROULETTE_OUTSIDE_MULTIPLIER,
    ROULETTE_ZERO_MULTIPLIER,
    STAR_PACKAGES,
)

# Multipliers in button labels are formatted straight from config so a payout
# change can never silently leave the player looking at stale odds.
def _x(multiplier: float) -> str:
    return f"x{multiplier:g}"


def back_button(callback_data: str, text: str = "⬅️ Назад") -> InlineKeyboardButton:
    return InlineKeyboardButton(text=text, callback_data=callback_data)


def admin_panel_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="💸 Выдать фишки", callback_data="admin:grant")],
            [InlineKeyboardButton(text="🔍 Найти игрока", callback_data="admin:find")],
            [InlineKeyboardButton(text="↩️ Возвраты звёзд", callback_data="admin:refunds")],
            [InlineKeyboardButton(text="📊 Статистика", callback_data="admin:stats")],
            [back_button("menu:home", text="⬅️ В меню")],
        ]
    )


def refunds_list_kb(topups) -> InlineKeyboardMarkup:
    rows = [
        [
            InlineKeyboardButton(
                text=f"#{t['id']} · {t['stars']}⭐ · {('@' + t['username']) if t['username'] else t['user_id']}",
                callback_data=f"admin:refund:{t['id']}",
            )
        ]
        for t in topups
    ]
    rows.append([back_button("admin:panel", text="⬅️ Назад в админку")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def refund_confirm_kb(topup_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ Да, вернуть звёзды", callback_data=f"admin:refundok:{topup_id}"
                )
            ],
            [back_button("admin:refunds", text="⬅️ Отмена")],
        ]
    )


def admin_back_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[back_button("admin:panel", text="⬅️ Назад в админку")]]
    )


def main_menu_kb(is_admin: bool = False) -> InlineKeyboardMarkup:
    rows = [
        [
            InlineKeyboardButton(text="🪙 Монетка", callback_data="menu:coinflip"),
            InlineKeyboardButton(text="🎲 Кости", callback_data="menu:dice"),
        ],
        [
            InlineKeyboardButton(text="🎰 Слоты", callback_data="menu:slots"),
            InlineKeyboardButton(text="🎡 Рулетка", callback_data="menu:roulette"),
        ],
        [
            InlineKeyboardButton(text="🃏 Блэкджек", callback_data="menu:blackjack"),
            InlineKeyboardButton(text="💣 Мины", callback_data="menu:mines"),
        ],
        [
            InlineKeyboardButton(text="💰 Баланс", callback_data="menu:balance"),
            InlineKeyboardButton(text="🎁 Бонус", callback_data="menu:bonus"),
        ],
        [
            InlineKeyboardButton(text="⭐ Пополнить", callback_data="menu:topup"),
            InlineKeyboardButton(text="🏆 Топ игроков", callback_data="menu:top"),
        ],
    ]
    if is_admin:
        rows.append([InlineKeyboardButton(text="🛠 Админка", callback_data="admin:panel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def back_to_menu_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="⬅️ В меню", callback_data="menu:home")]]
    )


def play_again_kb(game: str) -> InlineKeyboardMarkup:
    """Result screen: repeat the same game or go back to the main menu."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔄 Ещё раз", callback_data=f"menu:{game}")],
            [InlineKeyboardButton(text="⬅️ В меню", callback_data="menu:home")],
        ]
    )


def bet_amount_kb(game: str, balance: int) -> InlineKeyboardMarkup:
    rows, row = [], []
    for amount in BET_PRESETS:
        if amount > balance:
            continue
        row.append(InlineKeyboardButton(text=str(amount), callback_data=f"bet:{game}:{amount}"))
        if len(row) == 3:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    if balance >= 10:
        rows.append(
            [InlineKeyboardButton(text=f"Всё ({balance})", callback_data=f"bet:{game}:{balance}")]
        )
    else:
        rows.append([InlineKeyboardButton(text="⭐ Пополнить", callback_data="menu:topup")])
    rows.append([back_button("menu:home")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def coinflip_side_kb(amount: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="🦅 Орёл", callback_data=f"coinflip:{amount}:heads"),
                InlineKeyboardButton(text="🪙 Решка", callback_data=f"coinflip:{amount}:tails"),
            ],
            [back_button("menu:coinflip")],
        ]
    )


def dice_type_kb(amount: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=f"🎯 Точное число ({_x(DICE_NUMBER_MULTIPLIER)})",
                    callback_data=f"dicetype:{amount}:number",
                )
            ],
            [
                InlineKeyboardButton(
                    text=f"⬆️ 5 или 6 ({_x(DICE_EXTREME_MULTIPLIER)})",
                    callback_data=f"dicetype:{amount}:high",
                ),
                InlineKeyboardButton(
                    text=f"⬇️ 1 или 2 ({_x(DICE_EXTREME_MULTIPLIER)})",
                    callback_data=f"dicetype:{amount}:low",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=f"➗ Чёт ({_x(DICE_PARITY_MULTIPLIER)})",
                    callback_data=f"dicetype:{amount}:even",
                ),
                InlineKeyboardButton(
                    text=f"➕ Нечёт ({_x(DICE_PARITY_MULTIPLIER)})",
                    callback_data=f"dicetype:{amount}:odd",
                ),
            ],
            [back_button("menu:dice")],
        ]
    )


def dice_number_kb(amount: int) -> InlineKeyboardMarkup:
    row = [
        InlineKeyboardButton(text=str(n), callback_data=f"dicenum:{amount}:{n}") for n in range(1, 7)
    ]
    return InlineKeyboardMarkup(inline_keyboard=[row, [back_button(f"bet:dice:{amount}")]])


def roulette_bet_kb(amount: int) -> InlineKeyboardMarkup:
    out = _x(ROULETTE_OUTSIDE_MULTIPLIER)
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=f"🔴 Красное ({out})", callback_data=f"roulette:{amount}:red"
                ),
                InlineKeyboardButton(
                    text=f"⚫ Чёрное ({out})", callback_data=f"roulette:{amount}:black"
                ),
            ],
            [
                InlineKeyboardButton(text=f"➗ Чёт ({out})", callback_data=f"roulette:{amount}:even"),
                InlineKeyboardButton(text=f"➕ Нечёт ({out})", callback_data=f"roulette:{amount}:odd"),
            ],
            [
                InlineKeyboardButton(text=f"1-18 ({out})", callback_data=f"roulette:{amount}:low"),
                InlineKeyboardButton(text=f"19-36 ({out})", callback_data=f"roulette:{amount}:high"),
            ],
            [
                InlineKeyboardButton(
                    text=f"0️⃣ Зеро ({_x(ROULETTE_ZERO_MULTIPLIER)})",
                    callback_data=f"roulette:{amount}:zero",
                )
            ],
            [back_button("menu:roulette")],
        ]
    )


def mines_size_kb(amount: int) -> InlineKeyboardMarkup:
    rows = [
        [
            InlineKeyboardButton(
                text=f"{size}x{size} ({size * size} клеток)",
                callback_data=f"msize:{amount}:{size}",
            )
        ]
        for size in MINES_SIZES
    ]
    rows.append([back_button("menu:mines")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def mines_count_kb(amount: int, size: int) -> InlineKeyboardMarkup:
    from games.mines import multiplier

    rows, row = [], []
    for mines in MINES_PRESETS[size]:
        # show what the first safe pick pays, so the risk is visible up front
        first = multiplier(size, mines, 1)
        row.append(
            InlineKeyboardButton(
                text=f"💣{mines} · x{first:.2f}",
                callback_data=f"mcount:{amount}:{size}:{mines}",
            )
        )
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.append([back_button(f"bet:mines:{amount}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def mines_board_kb(game, reveal: bool = False) -> InlineKeyboardMarkup:
    """Board buttons. `reveal` shows every mine once the round is over."""
    rows = []
    for r in range(game.size):
        row = []
        for c in range(game.size):
            idx = r * game.size + c
            if idx in game.opened:
                text = "💎"
            elif reveal and idx in game.mine_cells:
                text = "💣"
            else:
                text = "⬜"
            # a finished board is inert: every cell points at a no-op
            data = "mnoop" if (reveal or game.finished) else f"mopen:{idx}"
            row.append(InlineKeyboardButton(text=text, callback_data=data))
        rows.append(row)

    if not game.finished:
        if game.opened:
            rows.append(
                [
                    InlineKeyboardButton(
                        text=f"💰 Забрать {game.payout()} 🪙", callback_data="mcash"
                    )
                ]
            )
        else:
            rows.append(
                [InlineKeyboardButton(text="Откройте первую клетку", callback_data="mnoop")]
            )
    else:
        rows.append([InlineKeyboardButton(text="🔄 Ещё раз", callback_data="menu:mines")])
        rows.append([InlineKeyboardButton(text="⬅️ В меню", callback_data="menu:home")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def blackjack_action_kb(can_double: bool) -> InlineKeyboardMarkup:
    # No "back" here on purpose: the bet is already on the table.
    rows = [
        [
            InlineKeyboardButton(text="🃏 Ещё карту", callback_data="bj:hit"),
            InlineKeyboardButton(text="✋ Хватит", callback_data="bj:stand"),
        ]
    ]
    if can_double:
        rows.append([InlineKeyboardButton(text="⏫ Удвоить", callback_data="bj:double")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def topup_kb() -> InlineKeyboardMarkup:
    rows = [
        [
            InlineKeyboardButton(
                text=f"{coins} фишек — {stars}⭐", callback_data=f"topuppkg:{coins}:{stars}"
            )
        ]
        for coins, stars in STAR_PACKAGES
    ]
    rows.append([InlineKeyboardButton(text="✏️ Своя сумма", callback_data="topup:custom")])
    rows.append([back_button("menu:home")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def cancel_topup_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[back_button("menu:topup", text="⬅️ Назад")]]
    )
