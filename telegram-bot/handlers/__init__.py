from aiogram import Router

from . import admin, balance, bonus, leaderboard, payments, start
from .games import blackjack, coinflip, dice, roulette, slots

router = Router()
# Admin first: its router-level filter drops non-admins straight through, so
# nothing here can shadow the player-facing handlers below.
router.include_router(admin.router)
router.include_router(start.router)
router.include_router(balance.router)
router.include_router(bonus.router)
router.include_router(leaderboard.router)
router.include_router(payments.router)
router.include_router(coinflip.router)
router.include_router(dice.router)
router.include_router(slots.router)
router.include_router(roulette.router)
router.include_router(blackjack.router)
