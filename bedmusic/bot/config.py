from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Config:
    token: str
    db_path: Path
    page_size: int
    admin_ids: frozenset[int] = frozenset()
    treasury_mnemonic: str = ""
    ton_api_key: str = ""
    withdrawals_enabled: bool = False
    deposit_poll_seconds: int = 60

    @property
    def treasury_configured(self) -> bool:
        """Whether on-chain top-up and payout can work at all."""
        return bool(self.treasury_mnemonic)

    @staticmethod
    def from_env() -> "Config":
        token = os.getenv("BOT_TOKEN", "").strip()
        if not token:
            raise RuntimeError(
                "BOT_TOKEN is not set. Put the token from @BotFather into the "
                "BOT_TOKEN environment variable (see .env.example)."
            )

        db_path = Path(os.getenv("DB_PATH", "data/bedmusic.db")).expanduser()
        db_path.parent.mkdir(parents=True, exist_ok=True)

        admins = {
            int(part) for part in os.getenv("ADMIN_IDS", "").replace(",", " ").split() if part
        }

        return Config(
            token=token,
            db_path=db_path,
            page_size=int(os.getenv("PAGE_SIZE", "5")),
            admin_ids=frozenset(admins),
            treasury_mnemonic=os.getenv("TON_TREASURY_MNEMONIC", "").strip(),
            ton_api_key=os.getenv("TON_API_KEY", "").strip(),
            withdrawals_enabled=os.getenv("TON_WITHDRAWALS_ENABLED", "").lower()
            in {"1", "true", "yes", "on"},
            deposit_poll_seconds=int(os.getenv("TON_DEPOSIT_POLL_SECONDS", "60")),
        )
