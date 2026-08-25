"""The deal: purchase request, questionnaire, contract, signatures, payout.

Answers and signatures are routed by the deal's status rather than by per-user
FSM state, because a deal has two participants and the bot must be able to
expect input from both of them at once.
"""

from __future__ import annotations

import asyncio
import logging
import tempfile
from pathlib import Path
from typing import Optional, Union

from aiogram import Bot, F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import BufferedInputFile, CallbackQuery, Message

from .. import contract, db, escrow, keyboards, questions, texts
from .common import require_artist, show

router = Router(name="deal")
log = logging.getLogger("bedmusic.deal")

FILL_STATUS = {questions.SELLER: "seller_fill", questions.BUYER: "buyer_fill"}


# --- buyer asks to buy -----------------------------------------------------


@router.callback_query(F.data.startswith("buy:"))
async def cb_buy(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.answer()
    if callback.from_user is None:
        return

    buyer = await require_artist(callback)
    if buyer is None:
        return

    track_id = int(callback.data.split(":")[1])
    track = await db.get_track(track_id)
    if track is None or not track.for_sale:
        await show(callback, texts.NOT_FOR_SALE, keyboards.back_to_menu())
        return
    if track.artist_id == callback.from_user.id:
        await callback.answer(texts.CANNOT_BUY_OWN, show_alert=True)
        return
    if await db.open_deal_for_track(track_id):
        await callback.answer(texts.DEAL_IN_PROGRESS, show_alert=True)
        return

    balance = await db.get_balance(callback.from_user.id, track.price_currency)
    if balance < track.price_amount:
        await show(
            callback,
            texts.not_enough_funds(track.price_amount, balance, track.price_currency),
            keyboards.wallet(balance > 0),
        )
        return

    deal_id = await db.create_deal(
        track_id, track.artist_id, callback.from_user.id,
        track.price_amount, track.price_currency,
    )
    deal = await db.get_deal(deal_id)
    try:
        await escrow.hold(deal)
    except escrow.NotEnoughFunds as exc:
        await db.update_deal(deal_id, status="cancelled")
        await show(
            callback,
            texts.not_enough_funds(exc.need, exc.have, exc.code),
            keyboards.wallet(exc.have > 0),
        )
        return

    await show(callback, texts.buy_requested(track.title, deal_id), keyboards.deal_cancel(deal_id))
    await callback.bot.send_message(
        track.artist_id,
        texts.seller_got_request(buyer.name, track.title, track.price_amount, track.price_currency),
        reply_markup=keyboards.buy_request(deal_id),
    )


# --- seller accepts or declines --------------------------------------------


@router.callback_query(F.data.startswith("deal:accept:"))
async def cb_accept(callback: CallbackQuery) -> None:
    deal = await _deal_for(callback, "accept")
    if deal is None:
        return
    if callback.from_user.id != deal.seller_id:
        await callback.answer(texts.NOT_YOUR_DEAL, show_alert=True)
        return
    if deal.status != "pending_seller":
        await callback.answer(texts.DEAL_MOVED_ON, show_alert=True)
        return

    await callback.answer()
    await db.update_deal(deal.id, status="seller_fill")
    await show(callback, texts.seller_accepted(deal.track_title))
    await _ask_next(callback.bot, deal.id, questions.SELLER)
    await callback.bot.send_message(deal.buyer_id, texts.buyer_notified_accepted(deal.track_title))


@router.callback_query(F.data.startswith("deal:decline:"))
async def cb_decline(callback: CallbackQuery) -> None:
    deal = await _deal_for(callback, "decline")
    if deal is None:
        return
    if callback.from_user.id != deal.seller_id:
        await callback.answer(texts.NOT_YOUR_DEAL, show_alert=True)
        return

    await callback.answer()
    await _cancel(callback.bot, deal, by=deal.seller_id, reason=texts.DECLINED_BY_SELLER)
    await show(callback, texts.DECLINE_DONE)


# --- questionnaire ---------------------------------------------------------


async def pending_question(message: Message) -> Union[bool, dict]:
    """Match only when this user genuinely owes an answer right now."""
    if message.from_user is None or not message.text:
        return False
    deal = await db.active_deal_for_user(message.from_user.id)
    if deal is None:
        return False
    party = deal.party_of(message.from_user.id)
    if party is None or deal.status != FILL_STATUS.get(party):
        return False
    fields = await db.get_fields(deal.id)
    question = questions.next_question(party, fields)
    if question is None:
        return False
    return {"deal": deal, "party": party, "question": question}


@router.message(pending_question)
async def got_answer(
    message: Message, deal: db.Deal, party: str, question: questions.Question
) -> None:
    try:
        value = question.parse(message.text or "")
    except questions.Invalid as exc:
        await message.answer(texts.answer_rejected(question, exc), reply_markup=keyboards.deal_cancel(deal.id))
        return

    await db.set_field(deal.id, question.key, value)
    await _ask_next(message.bot, deal.id, party)


async def _ask_next(bot: Bot, deal_id: int, party: str) -> None:
    """Ask the next question, or hand the flow to the other side."""
    deal = await db.get_deal(deal_id)
    if deal is None:
        return
    fields = await db.get_fields(deal_id)
    question = questions.next_question(party, fields)
    user_id = deal.seller_id if party == questions.SELLER else deal.buyer_id

    if question is not None:
        answered, total = questions.progress(party, fields)
        await bot.send_message(
            user_id,
            texts.ask_question(question, answered + 1, total),
            reply_markup=keyboards.deal_cancel(deal_id),
        )
        return

    if party == questions.SELLER:
        # Materials before the buyer invests time: the goods go into escrow
        # too, not just the money.
        await db.update_deal(deal_id, status="seller_files")
        await bot.send_message(
            user_id, texts.ASK_MATERIALS, reply_markup=keyboards.deal_cancel(deal_id)
        )
        return

    await db.update_deal(deal_id, status="review")
    await _send_draft(bot, deal_id)


# --- materials -------------------------------------------------------------


async def pending_materials(message: Message) -> Union[bool, dict]:
    """The seller is handing over the beat files."""
    if message.from_user is None:
        return False
    if not (message.document or message.audio):
        return False
    deal = await db.active_deal_for_user(message.from_user.id)
    if deal is None or deal.status != "seller_files":
        return False
    if message.from_user.id != deal.seller_id:
        return False
    return {"deal": deal}


@router.message(pending_materials)
async def got_material(message: Message, deal: db.Deal) -> None:
    item = message.document or message.audio
    name = getattr(item, "file_name", None) or f"{deal.track_title}.audio"
    await db.add_material(
        deal.id,
        file_id=item.file_id,
        file_name=name,
        file_size=item.file_size or 0,
        kind="audio" if message.audio else "document",
    )
    files = await db.materials(deal.id)
    await message.answer(
        texts.material_saved(files), reply_markup=keyboards.materials_done(deal.id)
    )


@router.callback_query(F.data.startswith("deal:files_done:"))
async def cb_files_done(callback: CallbackQuery) -> None:
    deal = await _deal_for(callback, "files_done")
    if deal is None:
        return
    if callback.from_user.id != deal.seller_id:
        await callback.answer(texts.NOT_YOUR_DEAL, show_alert=True)
        return
    if deal.status != "seller_files":
        await callback.answer(texts.DEAL_MOVED_ON, show_alert=True)
        return

    files = await db.materials(deal.id)
    if not files:
        await callback.answer(texts.NO_MATERIALS, show_alert=True)
        return

    await callback.answer()
    await db.update_deal(deal.id, status="buyer_fill")
    await show(callback, texts.SELLER_FORM_DONE)
    await callback.bot.send_message(
        deal.buyer_id, texts.buyer_form_starts(deal.track_title, len(files))
    )
    await _ask_next(callback.bot, deal.id, questions.BUYER)


# --- the draft contract ----------------------------------------------------


def _render_sync(deal, fields, tmp, signatures, signed, material_names) -> bytes:
    path = contract.render(
        path=tmp / f"deal_{deal.id}.docx",
        title=deal.track_title,
        price_units=deal.price_amount,
        price_currency=deal.price_currency,
        fields=fields,
        duration_seconds=deal.track_duration,
        seller_signature=signatures.get("seller"),
        buyer_signature=signatures.get("buyer"),
        deal_id=deal.id,
        material_names=material_names,
    )
    return path.read_bytes()


async def _build(bot: Bot, deal: db.Deal, signed: bool) -> bytes:
    """Render the contract, downloading signature images when signing."""
    fields = await db.get_fields(deal.id)
    tmp = Path(tempfile.mkdtemp())
    signatures: dict[str, Optional[Path]] = {"seller": None, "buyer": None}

    if signed:
        for party, file_id in (
            ("seller", deal.seller_signature),
            ("buyer", deal.buyer_signature),
        ):
            if not file_id:
                continue
            target = tmp / f"{party}.jpg"
            try:
                await bot.download(file_id, destination=target)
                signatures[party] = target
            except Exception:  # noqa: BLE001 — a missing image must not block the deal
                log.exception("deal %s: could not download %s signature", deal.id, party)

    names = [item.file_name for item in await db.materials(deal.id)]
    return await asyncio.to_thread(
        _render_sync, deal, fields, tmp, signatures, signed, names
    )


async def _send_draft(bot: Bot, deal_id: int) -> None:
    deal = await db.get_deal(deal_id)
    if deal is None:
        return
    data = await _build(bot, deal, signed=False)
    caption = texts.draft_ready(deal)
    for user_id in (deal.seller_id, deal.buyer_id):
        await bot.send_document(
            user_id,
            BufferedInputFile(data, filename=f"Договор_сделка_{deal.id}.docx"),
            caption=caption,
            reply_markup=keyboards.deal_confirm(deal.id),
        )


# --- confirmation ----------------------------------------------------------


@router.callback_query(F.data.startswith("deal:confirm:"))
async def cb_confirm(callback: CallbackQuery) -> None:
    deal = await _deal_for(callback, "confirm")
    if deal is None:
        return
    party = deal.party_of(callback.from_user.id)
    if party is None:
        await callback.answer(texts.NOT_YOUR_DEAL, show_alert=True)
        return
    if deal.status != "review":
        await callback.answer(texts.DEAL_MOVED_ON, show_alert=True)
        return

    already = deal.seller_confirmed if party == "seller" else deal.buyer_confirmed
    if already:
        await callback.answer(texts.ALREADY_CONFIRMED, show_alert=True)
        return

    await callback.answer()
    await db.update_deal(deal.id, **{f"{party}_confirmed": 1})
    deal = await db.get_deal(deal.id)

    if deal.seller_confirmed and deal.buyer_confirmed:
        await db.update_deal(deal.id, status="signing")
        for user_id in (deal.seller_id, deal.buyer_id):
            await callback.bot.send_message(
                user_id, texts.ASK_SIGNATURE, reply_markup=keyboards.deal_cancel(deal.id)
            )
        return

    await show(callback, texts.CONFIRMED_WAITING)
    await callback.bot.send_message(
        deal.other_side(callback.from_user.id), texts.OTHER_SIDE_CONFIRMED
    )


# --- signatures ------------------------------------------------------------


async def pending_signature(message: Message) -> Union[bool, dict]:
    if message.from_user is None or not message.photo:
        return False
    deal = await db.active_deal_for_user(message.from_user.id)
    if deal is None or deal.status != "signing":
        return False
    party = deal.party_of(message.from_user.id)
    if party is None:
        return False
    if (deal.seller_signature if party == "seller" else deal.buyer_signature):
        return False
    return {"deal": deal, "party": party}


@router.message(pending_signature)
async def got_signature(message: Message, deal: db.Deal, party: str) -> None:
    file_id = message.photo[-1].file_id
    await db.update_deal(deal.id, **{f"{party}_signature": file_id})
    deal = await db.get_deal(deal.id)

    if not (deal.seller_signature and deal.buyer_signature):
        await message.answer(texts.SIGNATURE_SAVED)
        await message.bot.send_message(
            deal.other_side(message.from_user.id), texts.OTHER_SIDE_SIGNED
        )
        return

    await _complete(message.bot, deal)


async def _complete(bot: Bot, deal: db.Deal) -> None:
    """Both signed: hand the beat to the buyer, pay the seller, close the deal."""
    data = await _build(bot, deal, signed=True)
    files = await db.materials(deal.id)

    # Deliver the goods before releasing the money: if this fails, the deal
    # stays open and the buyer's funds stay held rather than paying for
    # nothing.
    delivered = await _deliver(bot, deal, files)
    if not delivered:
        await bot.send_message(
            deal.seller_id, texts.DELIVERY_FAILED, reply_markup=keyboards.retry_delivery(deal.id)
        )
        await bot.send_message(
            deal.buyer_id, texts.DELIVERY_FAILED_BUYER,
            reply_markup=keyboards.retry_delivery(deal.id),
        )
        return

    paid = await escrow.release(deal)
    await db.mark_sold(deal.track_id)
    await db.update_deal(deal.id, status="completed")

    for user_id in (deal.seller_id, deal.buyer_id):
        await bot.send_document(
            user_id,
            BufferedInputFile(data, filename=f"Договор_подписан_{deal.id}.docx"),
            caption=texts.deal_completed(deal, paid, is_seller=user_id == deal.seller_id),
            reply_markup=keyboards.back_to_menu(),
        )

    removed = await db.purge_deal_fields(deal.id)
    log.info("deal %s completed, delivered %s files, purged %s rows",
             deal.id, len(files), removed)


async def _deliver(bot: Bot, deal: db.Deal, files: list[db.Material]) -> bool:
    """Send the beat files to the buyer. Returns False if nothing got through."""
    if not files:
        log.error("deal %s: no materials to deliver", deal.id)
        return False

    sent = 0
    for item in files:
        try:
            await bot.send_document(
                deal.buyer_id,
                item.file_id,
                caption=texts.material_delivered(deal, item) if sent == 0 else None,
            )
            sent += 1
        except Exception:  # noqa: BLE001 — try the rest before giving up
            log.exception("deal %s: failed to deliver %s", deal.id, item.file_name)

    return sent == len(files)


@router.callback_query(F.data.startswith("deal:retry:"))
async def cb_retry(callback: CallbackQuery) -> None:
    """Re-run delivery after a transient failure, instead of stranding the deal."""
    deal = await _deal_for(callback, "retry")
    if deal is None:
        return
    if deal.party_of(callback.from_user.id) is None:
        await callback.answer(texts.NOT_YOUR_DEAL, show_alert=True)
        return
    if deal.status != "signing" or not (deal.seller_signature and deal.buyer_signature):
        await callback.answer(texts.DEAL_MOVED_ON, show_alert=True)
        return

    await callback.answer(texts.RETRYING)
    await _complete(callback.bot, deal)


# --- cancellation and overview ---------------------------------------------


@router.callback_query(F.data.startswith("deal:cancel:"))
async def cb_cancel(callback: CallbackQuery) -> None:
    deal = await _deal_for(callback, "cancel")
    if deal is None:
        return
    if deal.party_of(callback.from_user.id) is None:
        await callback.answer(texts.NOT_YOUR_DEAL, show_alert=True)
        return
    if deal.status in {"completed", "cancelled"}:
        await callback.answer(texts.DEAL_MOVED_ON, show_alert=True)
        return

    await callback.answer()
    await _cancel(callback.bot, deal, by=callback.from_user.id, reason=texts.CANCELLED_BY_PARTY)
    await show(callback, texts.CANCEL_DONE, keyboards.back_to_menu())


async def _cancel(bot: Bot, deal: db.Deal, by: int, reason: str) -> None:
    refunded = await escrow.refund(deal)
    await db.update_deal(deal.id, status="cancelled")
    await db.purge_deal_fields(deal.id)
    await db.drop_materials(deal.id)
    await bot.send_message(
        deal.other_side(by), texts.deal_cancelled(deal, reason, refunded, by_other=True)
    )


@router.callback_query(F.data.startswith("deal:show:"))
async def cb_show(callback: CallbackQuery) -> None:
    deal = await _deal_for(callback, "show")
    if deal is None:
        return
    await callback.answer()
    if deal.party_of(callback.from_user.id) is None:
        await callback.answer(texts.NOT_YOUR_DEAL, show_alert=True)
        return
    markup = (
        keyboards.deal_cancel(deal.id)
        if deal.status not in {"completed", "cancelled"}
        else keyboards.back_to_menu()
    )
    await show(callback, texts.deal_card(deal, callback.from_user.id), markup)


@router.message(Command("deals"))
async def cmd_deals(message: Message, state: FSMContext) -> None:
    await state.clear()
    await _deals(message)


@router.callback_query(F.data == "deals")
async def cb_deals(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.answer()
    await _deals(callback)


async def _deals(event: Union[Message, CallbackQuery]) -> None:
    if event.from_user is None:
        return
    deals = await db.user_deals(event.from_user.id)
    if not deals:
        await show(event, texts.NO_DEALS, keyboards.back_to_menu())
        return
    await show(event, texts.DEALS_HEADER, keyboards.deals_list(deals))


async def _deal_for(callback: CallbackQuery, action: str) -> Optional[db.Deal]:
    deal_id = int(callback.data.rsplit(":", 1)[1])
    deal = await db.get_deal(deal_id)
    if deal is None or callback.from_user is None:
        await callback.answer(texts.DEAL_GONE, show_alert=True)
        return None
    return deal
