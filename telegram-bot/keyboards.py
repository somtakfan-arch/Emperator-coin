from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from config import BET_PRESETS, STAR_PACKAGES


def main_menu_kb() -> InlineKeyboardMarkup:
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
    return InlineKeyboardMarkup(inline_keyboard=rows)


def back_to_menu_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="⬅️ В меню", callback_data="menu:home")]]
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
    rows.append([InlineKeyboardButton(text="⬅️ В меню", callback_data="menu:home")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def coinflip_side_kb(amount: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="🦅 Орёл", callback_data=f"coinflip:{amount}:heads"),
                InlineKeyboardButton(text="🪙 Решка", callback_data=f"coinflip:{amount}:tails"),
            ]
        ]
    )


def dice_type_kb(amount: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🎯 Угадать число (x5)", callback_data=f"dicetype:{amount}:number")],
            [
                InlineKeyboardButton(text="⬆️ Больше 3 (x1.9)", callback_data=f"dicetype:{amount}:high"),
                InlineKeyboardButton(text="⬇️ Меньше 4 (x1.9)", callback_data=f"dicetype:{amount}:low"),
            ],
            [
                InlineKeyboardButton(text="➗ Чёт (x1.9)", callback_data=f"dicetype:{amount}:even"),
                InlineKeyboardButton(text="➕ Нечёт (x1.9)", callback_data=f"dicetype:{amount}:odd"),
            ],
        ]
    )


def dice_number_kb(amount: int) -> InlineKeyboardMarkup:
    row = [
        InlineKeyboardButton(text=str(n), callback_data=f"dicenum:{amount}:{n}") for n in range(1, 7)
    ]
    return InlineKeyboardMarkup(inline_keyboard=[row])


def roulette_bet_kb(amount: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="🔴 Красное (x2)", callback_data=f"roulette:{amount}:red"),
                InlineKeyboardButton(text="⚫ Чёрное (x2)", callback_data=f"roulette:{amount}:black"),
            ],
            [
                InlineKeyboardButton(text="➗ Чёт (x2)", callback_data=f"roulette:{amount}:even"),
                InlineKeyboardButton(text="➕ Нечёт (x2)", callback_data=f"roulette:{amount}:odd"),
            ],
            [
                InlineKeyboardButton(text="1-18 (x2)", callback_data=f"roulette:{amount}:low"),
                InlineKeyboardButton(text="19-36 (x2)", callback_data=f"roulette:{amount}:high"),
            ],
            [InlineKeyboardButton(text="0️⃣ Зеро (x35)", callback_data=f"roulette:{amount}:zero")],
        ]
    )


def blackjack_action_kb(can_double: bool) -> InlineKeyboardMarkup:
    row = [
        InlineKeyboardButton(text="🃏 Ещё карту", callback_data="bj:hit"),
        InlineKeyboardButton(text="✋ Хватит", callback_data="bj:stand"),
    ]
    rows = [row]
    if can_double:
        rows.append([InlineKeyboardButton(text="⏫ Удвоить", callback_data="bj:double")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def topup_kb() -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text=f"{coins} фишек — {stars}⭐", callback_data=f"topup:{coins}:{stars}")]
        for coins, stars in STAR_PACKAGES
    ]
    rows.append([InlineKeyboardButton(text="⬅️ В меню", callback_data="menu:home")])
    return InlineKeyboardMarkup(inline_keyboard=rows)
