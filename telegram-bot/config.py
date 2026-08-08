import os

from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
ADMIN_IDS = {int(x) for x in os.getenv("ADMIN_IDS", "").split(",") if x.strip().isdigit()}
DB_PATH = os.getenv("DB_PATH", "casino.db")

# --- Economy -----------------------------------------------------------
# 1 coin == 1 Telegram Star when buying chips via /topup.
# Coins are a virtual score with NO cash value: they can never be sold,
# withdrawn, or exchanged back for Stars/real money. This keeps the bot a
# "social casino" (pay-to-play entertainment) rather than real-money
# gambling, which would require a licence in virtually every jurisdiction.
STARTING_BALANCE = 1000
MIN_BET = 10
MAX_BET = 100_000

DAILY_BONUS_AMOUNT = 200
DAILY_BONUS_COOLDOWN_HOURS = 24

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
