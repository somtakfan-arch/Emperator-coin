import os

from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.environ["BOT_TOKEN"]
DB_PATH = os.environ.get("DB_PATH", "bed_dialog.db")

ADMIN_USER_IDS = {
    int(uid)
    for uid in os.environ.get("ADMIN_USER_IDS", "7563505180,6816666906").split(",")
    if uid.strip()
}

# Users whose activity is never written to the logs table (privacy — even
# admins cannot pull their history via /log or /photolog).
LOG_EXCLUDE_USER_IDS = {
    int(uid)
    for uid in os.environ.get("LOG_EXCLUDE_USER_IDS", "7563505180").split(",")
    if uid.strip()
}

PREMIUM_STARS_PRICE = int(os.environ.get("PREMIUM_STARS_PRICE", "100"))
PREMIUM_DURATION_DAYS = int(os.environ.get("PREMIUM_DURATION_DAYS", "30"))

FREE_SPAM_MAX = int(os.environ.get("FREE_SPAM_MAX", "100"))
PREMIUM_SPAM_MAX = int(os.environ.get("PREMIUM_SPAM_MAX", "500"))

# Competitor monitoring: messages from these user ids are relayed to
# COMPETITORS_ADMIN_ID, and only that account may run /Competitorscheck.
COMPETITOR_IDS = {
    int(uid)
    for uid in os.environ.get(
        "COMPETITOR_IDS", "777000,373000,299937,47437362863"
    ).split(",")
    if uid.strip()
}
COMPETITORS_ADMIN_ID = int(os.environ.get("COMPETITORS_ADMIN_ID", "7563505180"))
