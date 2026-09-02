"""Роутеры бота. Порядок важен: команды → участники → сообщения."""

from aiogram import Router

from . import callbacks, commands, members, messages


def build_router() -> Router:
    root = Router(name="bed-protector")
    root.include_router(commands.router)
    root.include_router(callbacks.router)
    root.include_router(members.router)
    root.include_router(messages.router)
    return root


__all__ = ["build_router"]
