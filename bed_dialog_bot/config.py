import os

from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.environ["BOT_TOKEN"]
DB_PATH = os.environ.get("DB_PATH", "bed_dialog.db")

ADMIN_USER_IDS = {
    int(uid) for uid in os.environ.get("ADMIN_USER_IDS", "7563505180").split(",") if uid.strip()
}

PREMIUM_STARS_PRICE = int(os.environ.get("PREMIUM_STARS_PRICE", "100"))
PREMIUM_DURATION_DAYS = int(os.environ.get("PREMIUM_DURATION_DAYS", "30"))

FREE_SPAM_MAX = int(os.environ.get("FREE_SPAM_MAX", "100"))
PREMIUM_SPAM_MAX = int(os.environ.get("PREMIUM_SPAM_MAX", "500"))

SUPPORT_USERNAME = os.environ.get("SUPPORT_USERNAME", "Empeeerator")
