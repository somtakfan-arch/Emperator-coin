// Покупка и продажа NFT. Маркет сам выкупает и продаёт токены по текущей цене.
// Баланс и владение меняются в одной транзакции.
import {
  doc, collection, runTransaction, serverTimestamp, getDocs,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { store } from "./store.js";
import { getSession } from "./auth.js";
import { FEE, MIN_TOTAL, TradeError, balRef, readBal, writeBal, r8 } from "./trade.js";
import { itemUsd, BOX, allItems, pickWeighted, TIERS } from "./nft-data.js";

const EPS = 1e-6;

export async function buyNft(item) {
  const uid = store.uid;
  const price = itemUsd(item);
  if (price == null) throw new TradeError(`Нет курса ${item.col.chain} — подожди пару секунд`);
  if (price < MIN_TOTAL) throw new TradeError(`Минимальная сумма сделки — ${MIN_TOTAL} USDT`);
  if (item.col.boxOnly) throw new TradeError("Этот токен можно получить только из мистери-бокса");
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

// ───────── мистери-бокс ─────────
export const BUY_PACKS = [1, 5, 10, 50];
export const OPEN_PACKS = [1, 3, 5, 10, 50];

// Покупка сразу n боксов — одной транзакцией.
export async function buyBoxes(n = 1) {
  const uid = store.uid;
  const cost = BOX.price * n, fee = cost * FEE;
  return runTransaction(db, async (tx) => {
    const uRef = balRef(uid, "USDT");
    const usdt = await readBal(tx, uRef);
    if (usdt.amount + EPS < cost + fee) throw new TradeError(`Недостаточно USDT: нужно ${(cost + fee).toFixed(2)}`);
    usdt.amount -= Math.min(cost + fee, usdt.amount);
    writeBal(tx, uRef, usdt, "USDT");
    for (let i = 0; i < n; i++) tx.set(doc(collection(db, "users", uid, "boxes")), { price: BOX.price, boughtAt: serverTimestamp() });
    tx.set(doc(collection(db, "users", uid, "trades")), {
      pair: "NFT", type: "box", side: "buy", price: BOX.price, amount: n, total: r8(cost),
      fee: r8(fee), feeAsset: "USDT", nft: "box", time: serverTimestamp(),
    });
  });
}
export const buyBox = () => buyBoxes(1);

const loadOwned = async () => new Set((await getDocs(collection(db, "nfts"))).docs.map((d) => d.id));

class Taken extends Error {}

// Открытие: 10 USDT → случайный свободный токен. Если токен успели купить — тянем другой.
// owned — множество занятых токенов; можно передать общее при массовом открытии.
export async function revealBox(boxId, owned) {
  const uid = store.uid;
  const nick = getSession().profile?.nick || "Игрок";
  owned = owned || await loadOwned();
  let pool = allItems().filter((it) => !owned.has(it.id) && itemUsd(it) != null);
  if (!pool.length) throw new TradeError("Свободных токенов не осталось или нет курса — попробуй позже");

  for (let attempt = 0; attempt < 5 && pool.length; attempt++) {
    const item = pickWeighted(pool);
    try {
      await runTransaction(db, async (tx) => {
        const bRef = doc(db, "users", uid, "boxes", boxId);
        const nRef = doc(db, "nfts", item.id);
        const uRef = balRef(uid, "USDT");
        const box = await tx.get(bRef);
        if (!box.exists()) throw new TradeError("Этот бокс уже открыт");
        if ((await tx.get(nRef)).exists()) throw new Taken();
        const usdt = await readBal(tx, uRef);
        if (usdt.amount + EPS < BOX.reveal) throw new TradeError(`Для открытия нужно ${BOX.reveal} USDT`);
        usdt.amount -= Math.min(BOX.reveal, usdt.amount);
        writeBal(tx, uRef, usdt, "USDT");
        tx.delete(bRef);
        // цена покупки токена = бокс + открытие (для расчёта прибыли)
        tx.set(nRef, { owner: uid, ownerNick: nick, collection: item.col.id, price: r8(box.data().price + BOX.reveal), boughtAt: serverTimestamp() });
        tx.set(doc(collection(db, "users", uid, "trades")), {
          pair: "NFT", type: "reveal", side: "buy", price: BOX.reveal, amount: 1, total: BOX.reveal,
          fee: 0, feeAsset: "USDT", nft: item.id, time: serverTimestamp(),
        });
      });
      owned.add(item.id);
      return item;
    } catch (e) {
      if (!(e instanceof Taken)) throw e;
      owned.add(item.id);
      pool = pool.filter((it) => it !== item);
    }
  }
  throw new TradeError("Не получилось открыть бокс — попробуй ещё раз");
}

// Открыть несколько боксов подряд. Возвращает { items, error } — при ошибке (например, кончились USDT)
// уже открытые токены остаются у игрока.
export async function revealMany(boxIds, onProgress = () => {}) {
  const owned = await loadOwned();
  const items = [];
  for (const id of boxIds) {
    try {
      let item;
      try {
        item = await revealBox(id, owned);
      } catch (e) {
        if (e instanceof TradeError) throw e;
        item = await revealBox(id, owned); // сетевой/временный сбой — одна повторная попытка
      }
      items.push(item);
      onProgress(items.length, boxIds.length);
    } catch (e) {
      return { items, error: e };
    }
  }
  return { items, error: null };
}

// Продать несколько токенов маркету подряд.
export async function sellMany(items, onProgress = () => {}) {
  let total = 0, sold = 0;
  for (const it of items) {
    try {
      const r = await sellNft(it);
      total += r.price - r.fee;
      sold++;
      onProgress(sold, items.length);
    } catch (e) {
      console.error(e);
    }
  }
  return { total, sold };
}

// ───────── крафт: 3 токена одной редкости → 1 случайный токен следующей ─────────
export const CRAFT_COST = 3;
export const craftTarget = (tierName) => {
  const i = TIERS.findIndex((t) => t.name === tierName);
  return i > 0 ? TIERS[i - 1] : null; // TIERS идут от легендарного к обычному
};

export async function craft(items) {
  const uid = store.uid;
  if (items.length !== CRAFT_COST) throw new TradeError(`Нужно ровно ${CRAFT_COST} токена`);
  const tier = items[0].tier;
  if (items.some((it) => it.tier !== tier)) throw new TradeError("Все токены должны быть одной редкости");
  const target = craftTarget(tier.name);
  if (!target) throw new TradeError("Легендарные уже максимальной редкости");
  const nick = getSession().profile?.nick || "Игрок";
  const owned = await loadOwned();
  let pool = allItems().filter((it) => it.tier === target && !owned.has(it.id));
  if (!pool.length) throw new TradeError(`Свободных токенов редкости «${target.name}» не осталось`);

  for (let attempt = 0; attempt < 5 && pool.length; attempt++) {
    const result = pool[Math.floor(Math.random() * pool.length)];
    try {
      await runTransaction(db, async (tx) => {
        const refs = items.map((it) => doc(db, "nfts", it.id));
        const snaps = [];
        for (const r of refs) snaps.push(await tx.get(r));
        const tRef = doc(db, "nfts", result.id);
        if ((await tx.get(tRef)).exists()) throw new Taken();
        let basis = 0;
        snaps.forEach((s) => {
          if (!s.exists() || s.data().owner !== uid) throw new TradeError("Один из токенов тебе уже не принадлежит");
          basis += s.data().price || 0;
        });
        refs.forEach((r) => tx.delete(r));
        tx.set(tRef, { owner: uid, ownerNick: nick, collection: result.col.id, price: r8(Math.max(basis, 1)), boughtAt: serverTimestamp() });
        tx.set(doc(collection(db, "users", uid, "trades")), {
          pair: "NFT", type: "craft", side: "buy", price: r8(Math.max(basis, 1)), amount: 1, total: r8(Math.max(basis, 1)),
          fee: 0, feeAsset: "USDT", nft: result.id, time: serverTimestamp(),
        });
      });
      return result;
    } catch (e) {
      if (!(e instanceof Taken)) throw e;
      pool = pool.filter((it) => it !== result);
    }
  }
  throw new TradeError("Не получилось скрафтить — попробуй ещё раз");
}
