"""End-to-end check of a beat sale: request → questionnaire → contract →
confirmation → signatures → payout.

Drives two users through the real dispatcher against a mocked transport.

    python -m tests.deal_check
"""

from __future__ import annotations

import asyncio
import base64
import sys
import tempfile
from pathlib import Path
from typing import Any

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.client.session.base import BaseSession
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.methods import TelegramMethod
from aiogram.types import (
    Audio,
    CallbackQuery,
    Chat,
    Document,
    File,
    Message,
    PhotoSize,
    Update,
    User,
)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bot import db, questions  # noqa: E402
from bot.config import Config  # noqa: E402
from bot.ton import Treasury  # noqa: E402
from bot.handlers import build_router  # noqa: E402

SELLER = User(id=111, is_bot=False, first_name="Продавец", username="seller")
BUYER = User(id=222, is_bot=False, first_name="Покупатель", username="buyer")
BOT_USER = User(id=1, is_bot=True, first_name="Bed Music", username="Bed_Musicbot")

# A real 1x1 PNG, so the signature actually embeds into the .docx.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)

_message_id = 0
_update_id = 0


class FakeSession(BaseSession):
    def __init__(self) -> None:
        super().__init__()
        self.calls: list[tuple[str, dict[str, Any], int | None]] = []
        self.fail_documents = False

    async def close(self) -> None:
        pass

    async def stream_content(self, *args: Any, **kwargs: Any):
        yield PNG

    async def make_request(self, bot: Bot, method: TelegramMethod, timeout: int | None = None):
        name = type(method).__name__
        payload = method.model_dump(exclude_none=True)
        self.calls.append((name, payload, payload.get("chat_id")))

        if self.fail_documents and name == "SendDocument" and isinstance(
            payload.get("document"), str
        ):
            raise RuntimeError("simulated Telegram failure")

        if name == "GetMe":
            return BOT_USER
        if name == "GetFile":
            return File(file_id="x", file_unique_id="x", file_size=len(PNG), file_path="sig.png")
        if name in {"SendMessage", "SendPhoto", "SendAudio", "SendDocument", "EditMessageText"}:
            return _make_message(SELLER, text=getattr(method, "text", None) or "…")
        return True

    def to(self, user: User) -> str:
        """Everything the bot said to one user since the last reset."""
        return "\n".join(
            str(p.get("text") or p.get("caption") or "")
            for _, p, chat in self.calls
            if chat == user.id
        )

    def alerts(self) -> str:
        """Pop-up answers to callback queries — they carry no chat_id."""
        return "\n".join(
            str(p.get("text", "")) for n, p, _ in self.calls if n == "AnswerCallbackQuery"
        )

    def documents_to(self, user: User) -> list[dict]:
        return [p for n, p, chat in self.calls if n == "SendDocument" and chat == user.id]

    def buttons_to(self, user: User) -> list[dict]:
        out = []
        for _, payload, chat in self.calls:
            if chat != user.id:
                continue
            for row in (payload.get("reply_markup") or {}).get("inline_keyboard", []):
                out.extend(row)
        return out

    def reset(self) -> None:
        self.calls.clear()


def _make_message(user: User, **kwargs: Any) -> Message:
    global _message_id
    _message_id += 1
    payload: dict[str, Any] = {
        "message_id": _message_id,
        "date": 0,
        "chat": Chat(id=user.id, type="private"),
        "from_user": user,
    }
    payload.update(kwargs)
    return Message(**payload)


def _update(**kwargs: Any) -> Update:
    global _update_id
    _update_id += 1
    return Update(update_id=_update_id, **kwargs)


def text(user: User, body: str) -> Update:
    return _update(message=_make_message(user, text=body))


def photo(user: User) -> Update:
    return _update(
        message=_make_message(
            user,
            photo=[PhotoSize(file_id=f"SIG_{user.id}", file_unique_id=f"u{user.id}", width=200, height=80)],
        )
    )


def audio(user: User) -> Update:
    return _update(
        message=_make_message(
            user,
            audio=Audio(file_id="BEAT", file_unique_id="b1", duration=195, title="Ночной драйв"),
        )
    )


def document(user: User, name: str, size: int = 5_000_000) -> Update:
    return _update(
        message=_make_message(
            user,
            document=Document(
                file_id=f"FILE_{name}", file_unique_id=f"u_{name}",
                file_name=name, file_size=size, mime_type="audio/wav",
            ),
        )
    )


def press(user: User, data: str) -> Update:
    return _update(
        callback_query=CallbackQuery(
            id=f"cb{_message_id}",
            from_user=user,
            chat_instance="ci",
            data=data,
            message=_make_message(user, text="экран"),
        )
    )


def check(condition: bool, label: str) -> None:
    print(f"  {'✅' if condition else '❌'} {label}")
    if not condition:
        raise AssertionError(label)


ANSWERS = {
    "seller_fio": "Иванов Иван Иванович",
    "seller_birthdate": "14.03.1998",
    "seller_passport": "4510 123456",
    "seller_passport_issued": "ОВД Тверского района г. Москвы, 01.02.2018",
    "seller_address": "101000, Москва, ул. Мясницкая, д. 1, кв. 2",
    "seller_phone": "+7 900 123-45-67",
    "seller_email": "beat@mail.ru",
    "seller_alias": "DJ Кровать",
    "seller_payout": "EQCJaz4nfb7JbYEQLGA8m9si3H9wAnoY6zS7ZY1zCjK06SHb",
    "city": "Москва",
    "beat_bpm": "140",
    "beat_key": "Am",
    "beat_created": "01.06.2026",
    "wav_quality": "24 бит / 44.1 кГц",
    "has_stems": "да",
    "has_project": "нет",
    "samples": "нет",
    "delivery_days": "3",
    "seller_is_minor": "да",  # "да, мне есть 18" → not a minor
    "buyer_fio": "Петров Пётр Петрович",
    "buyer_birthdate": "02.02.2000",
    "buyer_passport": "4511 654321",
    "buyer_passport_issued": "ГУ МВД по г. Москве, 05.05.2020",
    "buyer_address": "123001, Москва, ул. Тверская, д. 5",
    "buyer_phone": "+7 911 765-43-21",
    "buyer_email": "buyer@mail.ru",
    "buyer_alias": "MC Пётр",
}


async def answer_all(feed, user: User, party: str, deal_id: int) -> int:
    """Answer every remaining question for one party. Returns how many."""
    asked = 0
    while True:
        fields = await db.get_fields(deal_id)
        q = questions.next_question(party, fields)
        if q is None:
            return asked
        await feed(text(user, ANSWERS[q.key]))
        asked += 1
        if asked > 40:
            raise AssertionError("questionnaire did not terminate")


async def main() -> None:
    tmp = Path(tempfile.mkdtemp()) / "deal.db"
    await db.connect(tmp)

    session = FakeSession()
    bot = Bot(
        token="1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        session=session,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=MemoryStorage())
    dp["config"] = Config(token="x", db_path=tmp, page_size=5, admin_ids=frozenset({999}))
    dp["treasury"] = Treasury(mnemonic="")
    dp.include_router(build_router())

    async def feed(update: Update) -> None:
        await dp.feed_update(bot, update)

    print("\n1. Регистрация обеих сторон и загрузка бита")
    for user in (SELLER, BUYER):
        await feed(text(user, "/start"))
        await feed(press(user, "reg:start"))
        await feed(text(user, f"Артист {user.id}"))
        await feed(press(user, "reg:skip:description"))
        await feed(press(user, "reg:skip:avatar"))
    check(await db.get_artist(SELLER.id) is not None, "продавец зарегистрирован")
    check(await db.get_artist(BUYER.id) is not None, "покупатель зарегистрирован")

    await feed(press(SELLER, "upload:start"))
    await feed(audio(SELLER))
    await feed(press(SELLER, "upload:keep"))
    tracks = await db.artist_tracks(SELLER.id)
    check(len(tracks) == 1, "бит загружен")
    track_id = tracks[0].id

    print("\n2. Продавец выставляет цену")
    session.reset()
    await feed(press(SELLER, f"sell:menu:{track_id}"))
    await feed(press(SELLER, f"sell:start:{track_id}"))
    await feed(press(SELLER, f"sell:cur:{track_id}:TON"))
    await feed(text(SELLER, "0.005"))
    check("Минимум" in session.to(SELLER) or "минимум" in session.to(SELLER), "слишком низкая цена отклонена")
    await feed(text(SELLER, "1.5"))
    track = await db.get_track(track_id)
    check(track.for_sale and track.price_amount == 1_500_000_000, f"цена = {track.price_amount}")
    check(track.price_currency == "TON", "валюта TON")

    print("\n3. Покупка без денег на балансе")
    session.reset()
    await feed(press(BUYER, f"buy:{track_id}"))
    check("Не хватает средств" in session.to(BUYER), "покупка без средств не проходит")
    check(await db.count_deals_open() == 0, "сделка не создана")

    print("\n4. Пополнение и запрос на покупку")
    await db.credit(BUYER.id, "TON", 2_000_000_000, reason="test")
    session.reset()
    await feed(press(BUYER, f"buy:{track_id}"))
    deal = await db.active_deal_for_user(BUYER.id)
    check(deal is not None, "сделка создана")
    check(deal.escrow_state == "held", f"эскроу удерживает средства ({deal.escrow_state})")
    check(await db.get_balance(BUYER.id, "TON") == 500_000_000, "с баланса покупателя списано 1.5 TON")
    check("Запрос на покупку" in session.to(SELLER), "продавцу пришёл запрос")

    print("\n5. Продавец принимает и заполняет свою часть")
    session.reset()
    await feed(press(SELLER, f"deal:accept:{deal.id}"))
    check("Вопрос 1 из" in session.to(SELLER), "продавцу задан первый вопрос")

    session.reset()
    await feed(text(SELLER, "Иван"))
    check("фамилия" in session.to(SELLER).lower(), "неполное ФИО отклонено")

    session.reset()
    await feed(text(SELLER, ANSWERS["seller_fio"]))
    check("Вопрос 2 из" in session.to(SELLER), "принято ФИО, задан второй вопрос")

    session.reset()
    await feed(text(SELLER, "01.01.2100"))
    check("будущем" in session.to(SELLER), "дата рождения из будущего отклонена")

    session.reset()
    await feed(text(SELLER, "30.02.1998"))
    check("не существует" in session.to(SELLER), "несуществующая дата отклонена")

    asked = await answer_all(feed, SELLER, questions.SELLER, deal.id)
    check(asked > 0, f"продавец ответил на {asked} вопросов")
    deal = await db.get_deal(deal.id)
    check(deal.status == "seller_files", f"запрошены файлы бита ({deal.status})")

    print("\n5a. Продавец передаёт файлы бита")
    session.reset()
    await feed(press(SELLER, f"deal:files_done:{deal.id}"))
    check("хотя бы один файл" in session.alerts(), "нельзя завершить без файлов")
    deal = await db.get_deal(deal.id)
    check(deal.status == "seller_files", "статус не изменился без файлов")

    session.reset()
    await feed(document(SELLER, "night_drive_master.wav", 48_000_000))
    await feed(document(SELLER, "night_drive_320.mp3", 7_000_000))
    files = await db.materials(deal.id)
    check(len(files) == 2, f"файлов принято: {len(files)}")
    check("48.0 МБ" in session.to(SELLER) or "45.8 МБ" in session.to(SELLER), "показан размер файла")

    session.reset()
    await feed(press(SELLER, f"deal:files_done:{deal.id}"))
    deal = await db.get_deal(deal.id)
    check(deal.status == "buyer_fill", f"ход перешёл к покупателю ({deal.status})")
    check("Файлов бита передано сервису" in session.to(BUYER), "покупателю сообщили о файлах")

    print("\n6. Покупатель заполняет свою часть")
    session.reset()
    asked = await answer_all(feed, BUYER, questions.BUYER, deal.id)
    check(asked == 8, f"покупатель ответил на {asked} вопросов")
    deal = await db.get_deal(deal.id)
    check(deal.status == "review", f"статус review ({deal.status})")

    print("\n7. Черновик договора обеим сторонам")
    docs_seller = session.documents_to(SELLER)
    docs_buyer = session.documents_to(BUYER)
    check(len(docs_seller) == 1, "продавец получил документ")
    check(len(docs_buyer) == 1, "покупатель получил документ")
    confirm = [b for b in session.buttons_to(BUYER) if b.get("callback_data", "").startswith("deal:confirm")]
    check(bool(confirm), "есть кнопка подтверждения")
    check(confirm[0].get("style") == "success", "кнопка подтверждения зелёная")

    print("\n8. Подтверждение обеими сторонами")
    session.reset()
    await feed(press(SELLER, f"deal:confirm:{deal.id}"))
    deal = await db.get_deal(deal.id)
    check(deal.status == "review", "после одного подтверждения статус не меняется")
    session.reset()
    await feed(press(SELLER, f"deal:confirm:{deal.id}"))
    check("уже подтвердил" in session.alerts(), "повторное подтверждение отклонено")
    deal = await db.get_deal(deal.id)
    check(deal.seller_confirmed == 1, "двойное нажатие не сломало состояние")

    await feed(press(BUYER, f"deal:confirm:{deal.id}"))
    deal = await db.get_deal(deal.id)
    check(deal.status == "signing", f"перешли к подписанию ({deal.status})")
    check("подпись" in session.to(SELLER).lower(), "у продавца запрошена подпись")
    check("подпись" in session.to(BUYER).lower(), "у покупателя запрошена подпись")

    print("\n9. Подписи")
    session.reset()
    await feed(photo(SELLER))
    deal = await db.get_deal(deal.id)
    check(deal.seller_signature is not None, "подпись продавца сохранена")
    check(deal.status == "signing", "ждём вторую подпись")

    await feed(photo(BUYER))
    deal = await db.get_deal(deal.id)
    check(deal.status == "completed", f"сделка завершена ({deal.status})")

    print("\n10. Расчёты и приватность")
    check(deal.escrow_state == "released", f"эскроу выплачен ({deal.escrow_state})")
    check(await db.get_balance(SELLER.id, "TON") == 1_500_000_000, "продавец получил 1.5 TON")
    check(await db.get_balance(BUYER.id, "TON") == 500_000_000, "у покупателя остался остаток")
    track = await db.get_track(track_id)
    check(track.sold_at is not None, "бит помечен проданным")
    check(not track.for_sale, "бит снят с продажи")
    check(await db.get_fields(deal.id) == {}, "паспортные данные удалены из базы")

    signed_seller = session.documents_to(SELLER)
    buyer_docs = session.documents_to(BUYER)
    check(len(signed_seller) == 1, "продавцу отправлен подписанный договор")
    check(b"PK" == signed_seller[0]["document"].data[:2], "документ — валидный .docx")

    delivered = [d for d in buyer_docs if isinstance(d["document"], str)]
    check(len(delivered) == 2, f"покупателю доставлены файлы бита ({len(delivered)})")
    check(
        {d["document"] for d in delivered}
        == {"FILE_night_drive_master.wav", "FILE_night_drive_320.mp3"},
        "доставлены именно те файлы",
    )
    check(len(buyer_docs) == 3, "покупатель получил файлы и договор")

    print("\n11. Если файлы не дошли — деньги не уходят")
    await db.mark_unsold(track_id)
    await db.set_price(track_id, SELLER.id, 100_000_000, "TON")
    seller_before = await db.get_balance(SELLER.id, "TON")
    buyer_before = await db.get_balance(BUYER.id, "TON")
    await feed(press(BUYER, f"buy:{track_id}"))
    d3 = await db.active_deal_for_user(BUYER.id)
    await feed(press(SELLER, f"deal:accept:{d3.id}"))
    await answer_all(feed, SELLER, questions.SELLER, d3.id)
    await feed(document(SELLER, "broken.wav"))
    await feed(press(SELLER, f"deal:files_done:{d3.id}"))
    await answer_all(feed, BUYER, questions.BUYER, d3.id)
    await feed(press(SELLER, f"deal:confirm:{d3.id}"))
    await feed(press(BUYER, f"deal:confirm:{d3.id}"))
    await feed(photo(SELLER))

    session.reset()
    session.fail_documents = True
    await feed(photo(BUYER))
    session.fail_documents = False

    d3 = await db.get_deal(d3.id)
    check(d3.status == "signing", f"сделка не закрыта ({d3.status})")
    check(d3.escrow_state == "held", f"деньги остались в эскроу ({d3.escrow_state})")
    check(await db.get_balance(SELLER.id, "TON") == seller_before, "продавцу ничего не выплачено")
    check(await db.get_balance(BUYER.id, "TON") == buyer_before - 100_000_000, "деньги покупателя удержаны, не потрачены")
    check((await db.get_track(track_id)).sold_at is None, "бит не помечен проданным")
    check("не дошли" in session.to(BUYER), "покупатель предупреждён")

    session.reset()
    await feed(press(BUYER, f"deal:retry:{d3.id}"))
    d3 = await db.get_deal(d3.id)
    check(d3.status == "completed", f"повтор передачи закрыл сделку ({d3.status})")
    check(d3.escrow_state == "released", "после успешной передачи деньги выплачены")
    check(await db.get_balance(SELLER.id, "TON") == seller_before + 100_000_000, "продавец получил оплату")

    print("\n12. Повторная покупка проданного бита невозможна")
    await db.mark_sold(track_id)
    session.reset()
    await feed(press(BUYER, f"buy:{track_id}"))
    check("не продаётся" in session.to(BUYER), "проданный бит купить нельзя")

    print("\n13. Отмена сделки возвращает деньги")
    await db.mark_unsold(track_id)
    await db.set_price(track_id, SELLER.id, 200_000_000, "TON")
    before = await db.get_balance(BUYER.id, "TON")
    session.reset()
    await feed(press(BUYER, f"buy:{track_id}"))
    deal2 = await db.active_deal_for_user(BUYER.id)
    check(deal2 is not None and deal2.status == "pending_seller", "новая сделка создана")
    check(await db.get_balance(BUYER.id, "TON") == before - 200_000_000, "средства заблокированы")
    await feed(press(SELLER, f"deal:decline:{deal2.id}"))
    deal2 = await db.get_deal(deal2.id)
    check(deal2.status == "cancelled", "сделка отменена")
    check(deal2.escrow_state == "refunded", "эскроу вернул средства")
    check(await db.get_balance(BUYER.id, "TON") == before, "баланс покупателя восстановлен")
    check(await db.materials(deal2.id) == [], "файлы отменённой сделки удалены")

    print("\n14. Вкладка «Биты на продажу»")
    await db.mark_unsold(track_id)
    await db.set_price(track_id, SELLER.id, 300_000_000, "TON")
    session.reset()
    await feed(press(BUYER, "market:0"))
    check("Биты на продажу" in session.to(BUYER), "вкладка открылась")
    labels = [b["text"] for b in session.buttons_to(BUYER)]
    check(any("0.3 TON" in x for x in labels), f"цена видна в списке: {labels}")
    check(
        any(b.get("callback_data") == f"track:{track_id}" for b in session.buttons_to(BUYER)),
        "бит кликабелен",
    )

    session.reset()
    await feed(press(BUYER, f"track:{track_id}"))
    buttons = session.buttons_to(BUYER)
    play = [b for b in buttons if b.get("callback_data") == f"play:{track_id}"]
    buy = [b for b in buttons if b.get("callback_data") == f"buy:{track_id}"]
    check(bool(play), "есть кнопка «Слушать»")
    check(bool(buy), "есть кнопка «Купить»")
    check(buy[0].get("style") == "danger", "кнопка покупки красная")

    await db.clear_price(track_id, SELLER.id)
    session.reset()
    await feed(press(BUYER, "market:0"))
    check("Пока никто не выставил" in session.to(BUYER), "снятый с продажи бит исчез из вкладки")

    print("\n15. Зачисление депозитов")
    from bot import deposits as deposits_mod
    from bot.ton import Deposit

    class FakeTreasury:
        configured = True
        address = "EQTEST"
        def __init__(self, items): self.items = items
        async def fetch_deposits(self, limit=50): return list(self.items)

    incoming = [
        Deposit(tx_hash="tx-a", user_id=BUYER.id, currency="TON", amount=750_000_000, sender="EQX"),
        Deposit(tx_hash="tx-b", user_id=SELLER.id, currency="BED", amount=5_000_000_000, sender="EQY"),
    ]
    before_buyer = await db.get_balance(BUYER.id, "TON")
    session.reset()
    n = await deposits_mod.poll_once(bot, FakeTreasury(incoming))
    check(n == 2, f"зачислено депозитов: {n}")
    check(await db.get_balance(BUYER.id, "TON") == before_buyer + 750_000_000, "TON зачислен")
    check(await db.get_balance(SELLER.id, "BED") == 5_000_000_000, "BED зачислен")
    check("Баланс пополнен" in session.to(BUYER), "покупатель уведомлён")

    n = await deposits_mod.poll_once(bot, FakeTreasury(incoming))
    check(n == 0, "повторный опрос ничего не зачислил")
    check(await db.get_balance(BUYER.id, "TON") == before_buyer + 750_000_000, "баланс не удвоился")

    print("\n16. Мемо не пересекается с Bed Dialog")
    from bot.ton import match_memo, memo_for
    check(memo_for(BUYER.id) == f"BM{BUYER.id}", "мемо формата BM<id>")
    check(match_memo(f"BED{BUYER.id}") is None, "мемо Bed Dialog не подхватывается")
    check(match_memo(f"bm{BUYER.id}") == BUYER.id, "регистр не важен")

    await bot.session.close()
    await db.close()
    print("\n🎉 Все проверки сделки пройдены.\n")


async def _run() -> int:
    try:
        await main()
        return 0
    except AssertionError:
        return 1
    finally:
        await db.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(_run()))
