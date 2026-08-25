"""On-chain layer: treasury balances, deposit polling, payouts.

Deposits are matched by a memo the user puts in the transfer comment. The memo
prefix is deliberately NOT the one Bed Dialog uses: both bots can be pointed at
the same treasury wallet, and a shared prefix would make each of them credit
the other's deposits.

Payouts stay behind TON_WITHDRAWALS_ENABLED. Sending real value out of a shared
reserve is the one operation that cannot be undone, so it is off unless somebody
deliberately turns it on.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Optional

import aiohttp

from . import money

log = logging.getLogger("bedmusic.ton")

TONCENTER = "https://toncenter.com/api/v3"
MEMO_PREFIX = "BM"
# Lenient on purpose: a user who typed "bm123" must still be credited
# rather than have their transfer silently go unmatched.
MEMO_RE = re.compile(rf"^{MEMO_PREFIX}(\d{{1,15}})$", re.IGNORECASE)

# Native TON is not a jetton; the others are matched by their master address.
JETTON_MASTERS = {
    "BED": "0:FB02D6A9CB40EC4BCF32A8FE2F09712253A4EEFC316CC3D28D16329D7E236BFC",
    "USDT": "0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE",
}

# Gas the treasury spends per outgoing jetton transfer.
JETTON_GAS_TON = 0.05
MIN_GAS_RESERVE = 100_000_000  # 0.1 TON, below which payouts are refused


@dataclass
class Deposit:
    tx_hash: str
    user_id: int
    currency: str
    amount: int  # smallest units
    sender: str


def memo_for(user_id: int) -> str:
    """The comment a user must attach so their transfer is credited."""
    return f"{MEMO_PREFIX}{user_id}"


def match_memo(comment: Optional[str]) -> Optional[int]:
    if not comment:
        return None
    m = MEMO_RE.match(comment.strip())
    return int(m.group(1)) if m else None


class Treasury:
    """Everything that touches the chain. Inert until a mnemonic is configured."""

    def __init__(
        self,
        mnemonic: str,
        api_key: str = "",
        withdrawals_enabled: bool = False,
    ) -> None:
        self._mnemonic = mnemonic.split()
        self._api_key = api_key
        self.withdrawals_enabled = withdrawals_enabled
        self._address: Optional[str] = None

    @property
    def configured(self) -> bool:
        return len(self._mnemonic) == 24

    # --- wallet ------------------------------------------------------------

    def _wallet(self):
        from tonutils.client import ToncenterClient
        from tonutils.wallet import WalletV5R1

        client = ToncenterClient(api_key=self._api_key or None, is_testnet=False)
        wallet, *_ = WalletV5R1.from_mnemonic(client, self._mnemonic)
        return wallet

    @property
    def address(self) -> str:
        if not self.configured:
            return ""
        if self._address is None:
            self._address = self._wallet().address.to_str(is_bounceable=True)
        return self._address

    # --- reading -----------------------------------------------------------

    async def _get(self, path: str, params: dict) -> dict:
        headers = {"X-API-Key": self._api_key} if self._api_key else {}
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{TONCENTER}/{path}", params=params, headers=headers, timeout=30
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise RuntimeError(f"toncenter {path} -> {resp.status}: {body[:200]}")
                return await resp.json()

    async def balances(self) -> dict[str, int]:
        """What the treasury actually holds, in smallest units."""
        if not self.configured:
            return {}

        out: dict[str, int] = {}
        state = await self._get("accountStates", {"address": self.address})
        for account in state.get("accounts", []):
            out["TON"] = int(account.get("balance") or 0)

        wallets = await self._get(
            "jetton/wallets", {"owner_address": self.address, "limit": 50}
        )
        by_master = {v: k for k, v in JETTON_MASTERS.items()}
        for wallet in wallets.get("jetton_wallets", []):
            code = by_master.get(wallet.get("jetton", "").upper())
            if code:
                out[code] = int(wallet.get("balance") or 0)

        for code in money.ORDER:
            out.setdefault(code, 0)
        return out

    # --- deposits ----------------------------------------------------------

    async def fetch_deposits(self, limit: int = 50) -> list[Deposit]:
        """Incoming transfers carrying a memo we recognise."""
        if not self.configured:
            return []
        found = await self._jetton_deposits(limit)
        found.extend(await self._ton_deposits(limit))
        return found

    async def _jetton_deposits(self, limit: int) -> list[Deposit]:
        data = await self._get(
            "jetton/transfers",
            {"owner_address": self.address, "direction": "in", "limit": limit},
        )
        by_master = {v: k for k, v in JETTON_MASTERS.items()}

        out: list[Deposit] = []
        for item in data.get("jetton_transfers", []):
            if item.get("transaction_aborted"):
                continue
            code = by_master.get((item.get("jetton_master") or "").upper())
            if code is None:
                continue
            payload = item.get("decoded_forward_payload") or {}
            user_id = match_memo(payload.get("comment"))
            if user_id is None:
                continue
            out.append(
                Deposit(
                    tx_hash=item["transaction_hash"],
                    user_id=user_id,
                    currency=code,
                    amount=int(item["amount"]),
                    sender=item.get("source") or "",
                )
            )
        return out

    async def _ton_deposits(self, limit: int) -> list[Deposit]:
        data = await self._get("transactions", {"account": self.address, "limit": limit})

        out: list[Deposit] = []
        for tx in data.get("transactions", []):
            in_msg = tx.get("in_msg") or {}
            value = int(in_msg.get("value") or 0)
            if value <= 0 or not in_msg.get("source"):
                continue
            decoded = (in_msg.get("message_content") or {}).get("decoded") or {}
            if decoded.get("@type") != "text_comment":
                continue
            user_id = match_memo(decoded.get("comment"))
            if user_id is None:
                continue
            out.append(
                Deposit(
                    tx_hash=tx["hash"],
                    user_id=user_id,
                    currency="TON",
                    amount=value,
                    sender=in_msg.get("source") or "",
                )
            )
        return out

    # --- payouts -----------------------------------------------------------

    async def send(self, code: str, destination: str, units: int, comment: str = "") -> str:
        """Send funds out. Raises unless payouts are explicitly enabled."""
        if not self.configured:
            raise RuntimeError("treasury is not configured")
        if not self.withdrawals_enabled:
            raise RuntimeError("payouts are disabled (TON_WITHDRAWALS_ENABLED)")

        cur = money.currency(code)
        held = await self.balances()
        if held.get(code, 0) < units:
            raise RuntimeError(f"treasury holds {held.get(code, 0)} {code}, needs {units}")
        if held.get("TON", 0) < MIN_GAS_RESERVE:
            raise RuntimeError("treasury is out of TON for gas")

        # tonutils takes human units and scales with round(), so a value is at
        # worst one indivisible unit off — never a whole-token error.
        amount = units / (10**cur.decimals)
        wallet = self._wallet()

        if code == "TON":
            return await wallet.transfer(
                destination=destination, amount=amount, body=comment or None
            )
        return await wallet.transfer_jetton(
            destination=destination,
            jetton_master_address=JETTON_MASTERS[code],
            jetton_amount=amount,
            jetton_decimals=cur.decimals,
            forward_payload=comment or None,
            amount=JETTON_GAS_TON,
        )


def valid_address(address: str) -> bool:
    """Accept both EQ… (bounceable) and 0:… (raw) — they are the same address."""
    text = address.strip()
    if re.fullmatch(r"-?\d+:[0-9a-fA-F]{64}", text):
        return True
    return bool(re.fullmatch(r"[EU]Q[A-Za-z0-9_-]{46}", text))
