from aiogram import Router

from . import browse, fallback, profile, registration, start, upload


def build_router() -> Router:
    """Order matters: the fallback router must stay last."""
    router = Router(name="root")
    router.include_router(start.router)
    router.include_router(registration.router)
    router.include_router(profile.router)
    router.include_router(upload.router)
    router.include_router(browse.router)
    router.include_router(fallback.router)
    return router


__all__ = ["build_router"]
