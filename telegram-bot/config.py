import os

from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
# Owner of the bot, always an admin; extra admins can be added via the env var.
ADMIN_IDS = {7563505180} | {
    int(x) for x in os.getenv("ADMIN_IDS", "").split(",") if x.strip().isdigit()
}
DB_PATH = os.getenv("DB_PATH", "casino.db")

# --- Economy -----------------------------------------------------------
# 1 coin == 1 Telegram Star when buying chips via /topup.
# Coins are a virtual score with NO cash value: they can never be sold,
# withdrawn, or exchanged back for Stars/real money. This keeps the bot a
# "social casino" (pay-to-play entertainment) rather than real-money
# gambling, which would require a licence in virtually every jurisdiction.
STARTING_BALANCE = 0
MIN_BET = 10
MAX_BET = 100_000

# With no starting balance, the daily bonus is the only free way in — keep it,
# otherwise a new user lands on an empty balance with nothing to do.
DAILY_BONUS_AMOUNT = 200
DAILY_BONUS_COOLDOWN_HOURS = 24

# --- Payouts -----------------------------------------------------------
# Tuned for a high house edge (chips drain fast). Every multiplier here is
# shown to the player on the button he presses, and every win condition is
# spelled out in the game's menu text — the displayed odds MUST stay in sync
# with these numbers. Players pay real Stars for chips, so quietly paying out
# less than advertised would be plain deception, not "difficulty".
COINFLIP_MULTIPLIER = 1.8
COINFLIP_EDGE_CHANCE = 0.10  # coin lands on its edge: the house takes the bet

DICE_NUMBER_MULTIPLIER = 4.0  # exact number, 1/6 chance
DICE_EXTREME_MULTIPLIER = 2.4  # "5 or 6" / "1 or 2", 2/6 chance
DICE_PARITY_MULTIPLIER = 1.6  # even / odd, 3/6 chance

# Telegram's slot machine decides the reels, so only the payouts are ours:
# bar, grapes, lemon, seven. Any triple wins.
SLOTS_PAYOUTS = {0: 2.0, 1: 3.0, 2: 5.0, 3: 15.0}

ROULETTE_OUTSIDE_MULTIPLIER = 1.8  # red/black/even/odd/1-18/19-36
ROULETTE_ZERO_MULTIPLIER = 25.0

BLACKJACK_WIN_MULTIPLIER = 1.8
BLACKJACK_BLACKJACK_MULTIPLIER = 2.2
BLACKJACK_PUSH_MULTIPLIER = 1.0  # tie returns the bet

# coins, price_in_stars — bulk packages get a small bonus to encourage
# larger top-ups, still framed purely as "more chips", never as investment.
STAR_PACKAGES = [
    (100, 100),
    (500, 500),
    (1_000, 950),
    (5_000, 4_500),
    (10_000, 8_800),
]

BET_PRESETS = [10, 50, 100, 500, 1000]

# Custom top-up: the player types the amount of Stars himself. Telegram caps a
# single Stars invoice at 100000 XTR.
MIN_CUSTOM_TOPUP = 1
MAX_CUSTOM_TOPUP = 100_000
