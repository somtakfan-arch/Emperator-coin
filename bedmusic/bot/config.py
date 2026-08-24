from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Config:
    token: str
    db_path: Path
    page_size: int

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

        return Config(
            token=token,
            db_path=db_path,
            page_size=int(os.getenv("PAGE_SIZE", "5")),
        )
