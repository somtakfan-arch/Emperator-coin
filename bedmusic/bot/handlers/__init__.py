from aiogram import Router

from . import (
    browse, deal, fallback, market, profile, registration, sell, start, upload, wallet,
)


def build_router() -> Router:
    """Order matters.

    The deal router matches plain text and photos by looking up the sender's
    open deal, so it must come after every router that owns an FSM state, and
    before the fallback that answers anything left over.
    """
    router = Router(name="root")
    router.include_router(start.router)
    router.include_router(registration.router)
    router.include_router(profile.router)
    router.include_router(upload.router)
    router.include_router(sell.router)
    router.include_router(wallet.router)
    router.include_router(market.router)
    router.include_router(browse.router)
    router.include_router(deal.router)
    router.include_router(fallback.router)
    return router


__all__ = ["build_router"]
