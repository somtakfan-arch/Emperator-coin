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
# ULTRA PREMIUM — top tier with bypass immunities + priority.
ULTRA_STARS_PRICE = int(os.environ.get("ULTRA_STARS_PRICE", "250"))
ULTRA_BED_PRICE = int(os.environ.get("ULTRA_BED_PRICE", "20"))
ULTRA_DURATION_DAYS = int(os.environ.get("ULTRA_DURATION_DAYS", "30"))
# Grace period (days) — ULTRA perks keep working this long after expiry.
ULTRA_GRACE_DAYS = int(os.environ.get("ULTRA_GRACE_DAYS", "3"))
# Discount on buying BED with Stars for ULTRA users (0.15 = -15%).
ULTRA_BED_DISCOUNT = float(os.environ.get("ULTRA_BED_DISCOUNT", "0.15"))
# ULTRA's .ban lasts this many times longer.
ULTRA_BAN_MULT = int(os.environ.get("ULTRA_BAN_MULT", "5"))
# Ricochet: an attacker who hits an ULTRA user is locked out of
# ban/spam/troll/power for this many minutes.
ULTRA_RICOCHET_MINUTES = int(os.environ.get("ULTRA_RICOCHET_MINUTES", "10"))
PREMIUM_DURATION_DAYS = int(os.environ.get("PREMIUM_DURATION_DAYS", "30"))

FREE_SPAM_MAX = int(os.environ.get("FREE_SPAM_MAX", "100"))
PREMIUM_SPAM_MAX = int(os.environ.get("PREMIUM_SPAM_MAX", "500"))

# Send intervals (seconds) for the burst commands. Fast by default (the
# AIORateLimiter is the safety net against floods). Tune via env if needed.
SPAM_INTERVAL_PREMIUM = float(os.environ.get("SPAM_INTERVAL_PREMIUM", "0.05"))
SPAM_INTERVAL_MIN = float(os.environ.get("SPAM_INTERVAL_MIN", "0.05"))
TROLL_INTERVAL_PREMIUM = float(os.environ.get("TROLL_INTERVAL_PREMIUM", "0.1"))
TROLL_INTERVAL_MIN = float(os.environ.get("TROLL_INTERVAL_MIN", "0.3"))

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

REFERRALS_PER_REWARD = int(os.environ.get("REFERRALS_PER_REWARD", "20"))
REFERRAL_REWARD_DAYS = int(os.environ.get("REFERRAL_REWARD_DAYS", "30"))

# Free trial premium granted once to each brand-new user.
TRIAL_DAYS = int(os.environ.get("TRIAL_DAYS", "0"))

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
TROLL_PREMIUM_MAX = int(os.environ.get("TROLL_PREMIUM_MAX", "50"))

# Per-user command rate limit for direct messages.
RATE_LIMIT_MAX = int(os.environ.get("RATE_LIMIT_MAX", "20"))
RATE_LIMIT_WINDOW = int(os.environ.get("RATE_LIMIT_WINDOW", "60"))

# Premium purchase packages: (label, stars, days).
PREMIUM_PACKAGES = [
    ("1 месяц", PREMIUM_STARS_PRICE, PREMIUM_DURATION_DAYS),
    ("3 месяца", int(os.environ.get("PREMIUM_PRICE_3M", "250")), 90),
    ("1 год", int(os.environ.get("PREMIUM_PRICE_1Y", "800")), 365),
]

# --- BedCoin (BED jetton on TON) ---
BED_JETTON_ADDRESS = os.environ.get(
    "BED_JETTON_ADDRESS", "EQD7Atapy0DsS88yqP4vCXEiU6Tu_DFsw9KNFjKdfiNr_MKQ")
# Starting price: 10 ⭐ per 1 BED (i.e. 100000⭐ = 10000 BED).
BED_BASE_PRICE_STARS = float(os.environ.get("BED_BASE_PRICE_STARS", "10"))
# Demand curve: price = base * (1 + total_sold / scale). Bigger = slower growth.
BED_DEMAND_SCALE = float(os.environ.get("BED_DEMAND_SCALE", "3000"))
# BED amounts offered for purchase.
BED_BUY_PACKAGES = [int(x) for x in os.environ.get("BED_BUY_PACKAGES", "100,500,1000").split(",")]
# Premium priced in BED: (label, bed, days) — ~equivalent to the ⭐ packages.
BED_PREMIUM_PACKAGES = [
    ("1 месяц", int(os.environ.get("BED_PRICE_1M", "10")), 30),
    ("3 месяца", int(os.environ.get("BED_PRICE_3M", "25")), 90),
    ("1 год", int(os.environ.get("BED_PRICE_1Y", "80")), 365),
    ("♾ Навсегда", int(os.environ.get("BED_PRICE_LIFETIME", "100")), 36500),
]

# Premium subscribers keep their FULL captured history; free users only the
# last CAPTURE_RETENTION_SECONDS. This is a passive premium perk.
PREMIUM_KEEPS_FULL_HISTORY = os.environ.get("PREMIUM_KEEPS_FULL_HISTORY", "1") == "1"
# Premium gets this multiplier on the daily check-in reward.
PREMIUM_DAILY_MULT = int(os.environ.get("PREMIUM_DAILY_MULT", "2"))

# --- Auto-backup: dump the SQLite DB to the super admin every N hours ---
BACKUP_INTERVAL_HOURS = int(os.environ.get("BACKUP_INTERVAL_HOURS", "24"))
BACKUP_CHAT_ID = int(os.environ.get("BACKUP_CHAT_ID", "7563505180"))

# --- Daily check-in gamification ---
# Premium hours granted per daily check-in (no treasury cost — it's premium,
# not withdrawable BED).
DAILY_PREMIUM_HOURS = int(os.environ.get("DAILY_PREMIUM_HOURS", "3"))
# Optional BED per check-in. Default 0: BED is withdrawable = real liability, so
# leave off unless you want a funded faucet.
DAILY_BED_REWARD = int(os.environ.get("DAILY_BED_REWARD", "0"))
# Extra BED at streak milestones {day: bed}. Off by default.
DAILY_STREAK_BONUS = os.environ.get("DAILY_STREAK_BONUS", "")  # e.g. "7:1,30:5"

# --- On-chain BedCoin treasury (real BED jetton on TON) ---
# Secrets live ONLY in the environment, never in git.
TON_TREASURY_MNEMONIC = os.environ.get("TON_TREASURY_MNEMONIC", "")
TON_API_KEY = os.environ.get("TON_API_KEY", "")
TON_TESTNET = os.environ.get("TON_TESTNET", "0") == "1"
BED_DECIMALS = int(os.environ.get("BED_DECIMALS", "9"))
# On-chain withdrawals master switch. Keep OFF until the treasury holds a BED
# reserve + a little TON for gas and the "test on 1 BED" run has passed.
TON_WITHDRAWALS_ENABLED = os.environ.get("TON_WITHDRAWALS_ENABLED", "0") == "1"
# Withdrawal guard rails (whole BED).
BED_MIN_WITHDRAW = int(os.environ.get("BED_MIN_WITHDRAW", "1"))
BED_MAX_WITHDRAW = int(os.environ.get("BED_MAX_WITHDRAW", "100"))
# TON attached to each outgoing jetton transfer for gas.
TON_WITHDRAW_GAS = float(os.environ.get("TON_WITHDRAW_GAS", "0.05"))
# Deposit matching: users include "<prefix><their id>" as the transfer comment.
BED_DEPOSIT_PREFIX = os.environ.get("BED_DEPOSIT_PREFIX", "BED")
# How often (seconds) to poll for incoming deposits.
TON_DEPOSIT_POLL_SECONDS = int(os.environ.get("TON_DEPOSIT_POLL_SECONDS", "40"))
# Cost (in BED) of one use of a paid "power" command in a business chat.
BED_COMMAND_COST = int(os.environ.get("BED_COMMAND_COST", "1"))
# .stalker: a send-then-delete within this many seconds counts as the contact
# "хотел написать, но передумал" (Bot API can't see typing, only messages).
STALKER_WINDOW_SECONDS = int(os.environ.get("STALKER_WINDOW_SECONDS", "30"))
# BED amounts offered for "buy straight to your TON wallet" (paid in Stars,
# delivered on-chain). Kept small so a 1 BED test costs ~10⭐.
BED_CHAIN_PACKAGES = [int(x) for x in os.environ.get("BED_CHAIN_PACKAGES", "1,5,10,50,100").split(",") if x.strip()]

# --- work.ink reward: complete a work.ink Key-System link -> get premium ---
# The work.ink link users must complete (from your work.ink dashboard).
# Empty = feature disabled.
WORKINK_LINK_URL = os.environ.get("WORKINK_LINK_URL", "")
# Numeric id of that link (info.linkId in the isValid response). Only tokens
# from THIS link are accepted, so random tokens from other links don't work
# and every redemption earns you. 0 = accept any valid work.ink token.
WORKINK_LINK_ID = int(os.environ.get("WORKINK_LINK_ID", "0"))
# Premium days granted per successful redemption.
WORKINK_REWARD_DAYS = int(os.environ.get("WORKINK_REWARD_DAYS", "1"))
# Minimum seconds between redemptions per user (0 = no cooldown).
WORKINK_COOLDOWN_SECONDS = int(os.environ.get("WORKINK_COOLDOWN_SECONDS", "0"))

# --- Simple ad-link reward (GPLinks / exe.io / shrinkme — adlinkfly API) ---
# Way fewer steps for the user: click -> 1 ad -> auto-returned to the bot ->
# premium (no key to copy). Earns less than work.ink but far more convenient.
# API base + key from your shortener dashboard. Empty base = feature disabled.
ADLINK_API_BASE = os.environ.get("ADLINK_API_BASE", "")  # e.g. https://api.gplinks.com/api
ADLINK_API_KEY = os.environ.get("ADLINK_API_KEY", "")
# Bot username for the return deep-link (defaults resolved at runtime if empty).
ADLINK_BOT_USERNAME = os.environ.get("ADLINK_BOT_USERNAME", "BedDialog_bot")
ADLINK_REWARD_DAYS = int(os.environ.get("ADLINK_REWARD_DAYS", "1"))
# Minimum seconds between ad-link rewards per user (default 12h).
ADLINK_COOLDOWN_SECONDS = int(os.environ.get("ADLINK_COOLDOWN_SECONDS", "43200"))

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
