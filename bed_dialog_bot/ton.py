"""On-chain BedCoin (BED jetton) treasury layer on the TON network.

Read side (balances, incoming deposits) uses the Toncenter v3 HTTP API.
Write side (withdrawals) uses tonutils to sign and send jetton transfers.

The treasury wallet is derived from ``TON_TREASURY_MNEMONIC``. Its contract
version is auto-detected once — whichever standard wallet actually controls
the BED balance (else the one holding TON, else V5R1) — and cached. Every
secret comes from the environment; nothing here is ever committed.

Deposits are matched to a user by a comment the user includes in the
transfer: ``<BED_DEPOSIT_PREFIX><user_id>`` (e.g. ``BED7563505180``).
"""
import asyncio
import base64
import logging

import aiohttp

from . import config

log = logging.getLogger(__name__)

_BASE = "https://testnet.toncenter.com/api/v3" if config.TON_TESTNET else "https://toncenter.com/api/v3"

_version_cls = None          # resolved tonutils wallet class
_treasury_addr = None        # friendly address string of the treasury owner
_resolve_lock = asyncio.Lock()


def configured() -> bool:
    """True when a treasury mnemonic is present in the environment."""
    return bool(config.TON_TREASURY_MNEMONIC.strip())


def deposit_comment(user_id: int) -> str:
    """The exact comment a user must attach to a deposit so we can match it."""
    return f"{config.BED_DEPOSIT_PREFIX}{user_id}"


def match_user(comment: str):
    """Extract the user id from a deposit comment, or None."""
    if not comment:
        return None
    c = comment.strip()
    prefix = config.BED_DEPOSIT_PREFIX
    if c.upper().startswith(prefix.upper()):
        c = c[len(prefix):]
    c = c.strip().lstrip("#").strip()
    if c.isdigit():
        return int(c)
    return None


def _client():
    from tonutils.client import ToncenterClient
    return ToncenterClient(api_key=config.TON_API_KEY or None, is_testnet=config.TON_TESTNET)


async def _resolve_version():
    """Detect and cache which wallet contract version the mnemonic controls."""
    global _version_cls, _treasury_addr
    if _version_cls is not None:
        return _version_cls
    async with _resolve_lock:
        if _version_cls is not None:
            return _version_cls
        from tonutils.wallet import WalletV5R1, WalletV4R2, WalletV3R2
        from tonutils.jetton import JettonMaster, JettonWallet
        client = _client()
        best_cls, best_addr, best_score = None, None, -1.0
        for cls in (WalletV5R1, WalletV4R2, WalletV3R2):
            try:
                wallet, *_ = cls.from_mnemonic(client, config.TON_TREASURY_MNEMONIC)
                addr = wallet.address.to_str()
            except Exception as exc:  # pragma: no cover - defensive
                log.warning("derive %s failed: %s", cls.__name__, exc)
                continue
            score = 0.0
            try:
                jw = await JettonMaster.get_wallet_address(client, addr, config.BED_JETTON_ADDRESS)
                score += await _wallet_bed_balance(client, jw) * 1_000_000.0
            except Exception:
                pass
            try:
                score += float(await wallet.balance())
            except Exception:
                pass
            if score > best_score:
                best_cls, best_addr, best_score = cls, addr, score
        if best_cls is None:
            from tonutils.wallet import WalletV5R1 as _Fallback
            wallet, *_ = _Fallback.from_mnemonic(client, config.TON_TREASURY_MNEMONIC)
            best_cls, best_addr = _Fallback, wallet.address.to_str()
        _version_cls, _treasury_addr = best_cls, best_addr
        log.info("BED treasury wallet: %s (%s)", best_addr, best_cls.__name__)
        return _version_cls


async def _wallet(client):
    cls = await _resolve_version()
    wallet, *_ = cls.from_mnemonic(client, config.TON_TREASURY_MNEMONIC)
    return wallet


async def treasury_address() -> str:
    """Friendly owner address of the treasury (where users send deposits)."""
    await _resolve_version()
    return _treasury_addr


async def _wallet_bed_balance(client, jetton_wallet) -> float:
    """Accurate BED balance via get_wallet_data (tonutils get_balance mis-scales
    large values for this jetton's wallet code)."""
    from tonutils.jetton import JettonWallet
    addr = jetton_wallet.to_str() if hasattr(jetton_wallet, "to_str") else jetton_wallet
    data = await JettonWallet.get_wallet_data(client, addr)
    return float(data.balance) / (10 ** config.BED_DECIMALS)


async def treasury_bed_balance() -> float:
    from tonutils.jetton import JettonMaster
    client = _client()
    addr = await treasury_address()
    jw = await JettonMaster.get_wallet_address(client, addr, config.BED_JETTON_ADDRESS)
    return await _wallet_bed_balance(client, jw)


async def treasury_ton_balance() -> float:
    client = _client()
    wallet = await _wallet(client)
    try:
        return float(await wallet.balance())
    except Exception:
        return 0.0


async def send_bed(destination: str, amount_bed: int, comment: str = "") -> str:
    """Send `amount_bed` whole BED from the treasury to `destination`.

    Returns the transaction hash. Raises on any failure so callers can refund.
    """
    client = _client()
    wallet = await _wallet(client)
    tx_hash = await wallet.transfer_jetton(
        destination=destination,
        jetton_master_address=config.BED_JETTON_ADDRESS,
        jetton_amount=amount_bed,
        jetton_decimals=config.BED_DECIMALS,
        forward_payload=comment or None,
        amount=config.TON_WITHDRAW_GAS,
    )
    return tx_hash


def _decode_comment(payload) -> str:
    """Best-effort extraction of a text comment from a forward_payload."""
    if not payload:
        return ""
    if isinstance(payload, dict):
        return (payload.get("comment") or payload.get("text") or "").strip()
    if not isinstance(payload, str):
        return ""
    try:
        from pytoniq_core import Cell
        try:
            raw = base64.b64decode(payload)
            cell = Cell.one_from_boc(raw)
        except Exception:
            cell = Cell.one_from_boc(payload)  # maybe hex
        sl = cell.begin_parse()
        if sl.remaining_bits >= 32:
            op = sl.load_uint(32)
            if op != 0:
                return ""
        return sl.load_snake_string().strip()
    except Exception:
        return ""


async def fetch_deposits(limit: int = 40):
    """Incoming BED transfers to the treasury.

    Returns a list of dicts: {tx_hash, from_addr, amount (float BED), comment}.
    """
    addr = await treasury_address()
    params = {
        "owner_address": addr,
        "direction": "in",
        "jetton_master": config.BED_JETTON_ADDRESS,
        "limit": str(limit),
        "offset": "0",
        "sort": "desc",
    }
    headers = {"X-API-Key": config.TON_API_KEY} if config.TON_API_KEY else {}
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(f"{_BASE}/jetton/transfers", params=params, headers=headers) as resp:
            data = await resp.json()
    out = []
    scale = 10 ** config.BED_DECIMALS
    for t in data.get("jetton_transfers", []):
        try:
            raw = int(t.get("amount", "0") or 0)
        except (TypeError, ValueError):
            raw = 0
        out.append({
            "tx_hash": t.get("transaction_hash"),
            "from_addr": t.get("source"),
            "amount": raw / scale,
            "comment": _decode_comment(t.get("forward_payload")),
        })
    return out
