from aiogram.fsm.state import State, StatesGroup


class BlackjackStates(StatesGroup):
    playing = State()
