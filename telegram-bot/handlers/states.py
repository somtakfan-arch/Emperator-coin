from aiogram.fsm.state import State, StatesGroup


class BlackjackStates(StatesGroup):
    playing = State()


class TopupStates(StatesGroup):
    waiting_for_amount = State()
