// Покупка и продажа NFT. Маркет сам выкупает и продаёт токены по текущей цене.
// Баланс и владение меняются в одной транзакции.
import {
  doc, collection, runTransaction, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { store } from "./store.js";
import { getSession } from "./auth.js";
import { FEE, MIN_TOTAL, TradeError, balRef, readBal, writeBal, r8 } from "./trade.js";
import { itemUsd } from "./nft-data.js";

const EPS = 1e-6;

export async function buyNft(item) {
  const uid = store.uid;
  const price = itemUsd(item);
  if (price == null) throw new TradeError(`Нет курса ${item.col.chain} — подожди пару секунд`);
  if (price < MIN_TOTAL) throw new TradeError(`Минимальная сумма сделки — ${MIN_TOTAL} USDT`);
  const fee = price * FEE;
  const nick = getSession().profile?.nick || "Игрок";

  return runTransaction(db, async (tx) => {
    const nRef = doc(db, "nfts", item.id);
    const uRef = balRef(uid, "USDT");
    const owned = await tx.get(nRef);
    if (owned.exists()) throw new TradeError("Этот токен уже купили");
    const usdt = await readBal(tx, uRef);
    if (usdt.amount + EPS < price + fee) throw new TradeError("Недостаточно USDT");
    usdt.amount -= Math.min(price + fee, usdt.amount);
    writeBal(tx, uRef, usdt, "USDT");
    tx.set(nRef, { owner: uid, ownerNick: nick, collection: item.col.id, price: r8(price), boughtAt: serverTimestamp() });
    tx.set(doc(collection(db, "users", uid, "trades")), {
      pair: "NFT", type: "nft", side: "buy", price: r8(price), amount: 1, total: r8(price),
      fee: r8(fee), feeAsset: "USDT", nft: item.id, time: serverTimestamp(),
    });
    return { price, fee };
  });
}

export async function sellNft(item) {
  const uid = store.uid;
  const price = itemUsd(item);
  if (price == null) throw new TradeError(`Нет курса ${item.col.chain} — подожди пару секунд`);
  const fee = price * FEE;

  return runTransaction(db, async (tx) => {
    const nRef = doc(db, "nfts", item.id);
    const uRef = balRef(uid, "USDT");
    const owned = await tx.get(nRef);
    if (!owned.exists() || owned.data().owner !== uid) throw new TradeError("Этот токен тебе не принадлежит");
    const usdt = await readBal(tx, uRef);
    usdt.amount += price - fee;
    writeBal(tx, uRef, usdt, "USDT");
    tx.delete(nRef);
    tx.set(doc(collection(db, "users", uid, "trades")), {
      pair: "NFT", type: "nft", side: "sell", price: r8(price), amount: 1, total: r8(price),
      fee: r8(fee), feeAsset: "USDT", nft: item.id, time: serverTimestamp(),
    });
    return { price, fee, profit: price - fee - (owned.data().price || 0) };
  });
}
