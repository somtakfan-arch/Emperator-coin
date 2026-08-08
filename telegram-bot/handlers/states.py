from aiogram.fsm.state import State, StatesGroup


class BlackjackStates(StatesGroup):
    playing = State()


class MinesStates(StatesGroup):
    playing = State()


class TopupStates(StatesGroup):
    waiting_for_amount = State()


class AdminStates(StatesGroup):
    waiting_grant = State()
    waiting_search = State()
