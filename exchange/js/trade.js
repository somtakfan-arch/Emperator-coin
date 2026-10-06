// Торговый движок. Любое изменение баланса — только через Firestore transactions.
import {
  doc, collection, runTransaction, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { pairBySymbol, getPrice, onPrices, tickers, fetchKlines } from "./market.js";
import { store, onStore, total } from "./store.js";
import { fmtAmount, fmtPrice } from "./format.js";
import { toast } from "./ui.js";

export const FEE = 0.001; // 0,1%
export const MIN_TOTAL = 1; // минимальная сумма сделки, USDT
const EPS = 1e-6;

export class TradeError extends Error {}

export const r8 = (x) => Math.round(x * 1e8) / 1e8;
export const floor8 = (x) => Math.floor(x * 1e8 + 1e-6) / 1e8;

// ───────── чтение/запись балансов внутри транзакции ─────────
const balRef = (uid, coin) => doc(db, "users", uid, "balances", coin);

async function readBal(tx, ref) {
  const s = await tx.get(ref);
  return { amount: 0, locked: 0, avgPrice: 0, ...(s.exists() ? s.data() : {}) };
}

function clean(v, what) {
  const x = r8(v);
  if (x < -EPS) throw new TradeError(`Недостаточно средств (${what})`);
  return Math.max(0, x);
}

function writeBal(tx, ref, b, coin) {
  const amount = clean(b.amount, coin);
  const locked = clean(b.locked, coin);
  tx.set(ref, {
    amount, locked,
    avgPrice: amount + locked > 0 ? Math.max(0, b.avgPrice || 0) : 0,
    updatedAt: serverTimestamp(),
  });
}

// Покупка qty монет по price: монеты приходят за вычетом комиссии, считаем среднюю цену входа.
function creditBuy(base, qty, price) {
  const fee = qty * FEE;
  const received = qty - fee;
  const before = total(base);
  base.avgPrice = (before * (base.avgPrice || 0) + qty * price) / (before + received);
  base.amount += received;
  return { fee, received };
}

// Продажа: USDT приходят за вычетом комиссии.
function creditSell(usdt, qty, price) {
  const proceeds = qty * price;
  const fee = proceeds * FEE;
  usdt.amount += proceeds - fee;
  return { fee, received: proceeds - fee };
}

function tradeDoc(order) {
  return {
    pair: order.pair, type: order.type, side: order.side,
    price: order.price, amount: order.amount, total: r8(order.price * order.amount),
    fee: r8(order.fee), feeAsset: order.side === "buy" ? pairBySymbol(order.pair).base : "USDT",
    ...(order.orderId ? { orderId: order.orderId } : {}),
    time: serverTimestamp(),
  };
}

function validate(symbol, side, qty, price) {
  if (!pairBySymbol(symbol)) throw new TradeError("Неизвестная пара");
  if (!["buy", "sell"].includes(side)) throw new TradeError("Неизвестная сторона сделки");
  if (!(qty > 0) || !isFinite(qty)) throw new TradeError("Введи количество");
  if (!(price > 0) || !isFinite(price)) throw new TradeError("Нет цены");
  if (qty * price < MIN_TOTAL) throw new TradeError(`Минимальная сумма сделки — ${MIN_TOTAL} USDT`);
}

// ───────── рыночный ордер ─────────
export async function marketOrder(symbol, side, qtyRaw) {
  const uid = store.uid;
  const price = getPrice(symbol);
  if (price == null) throw new TradeError("Нет актуальной цены — подожди пару секунд");
  const qty = floor8(qtyRaw);
  validate(symbol, side, qty, price);
  const { base } = pairBySymbol(symbol);

  return runTransaction(db, async (tx) => {
    const uRef = balRef(uid, "USDT"), bRef = balRef(uid, base);
    const usdt = await readBal(tx, uRef);
    const coin = await readBal(tx, bRef);
    const cost = qty * price;
    let res;
    if (side === "buy") {
      if (usdt.amount + EPS < cost) throw new TradeError("Недостаточно USDT");
      usdt.amount -= Math.min(cost, usdt.amount);
      res = creditBuy(coin, qty, price);
    } else {
      if (coin.amount + 1e-9 < qty) throw new TradeError(`Недостаточно ${base}`);
      coin.amount -= qty;
      res = creditSell(usdt, qty, price);
    }
    writeBal(tx, uRef, usdt, "USDT");
    writeBal(tx, bRef, coin, base);
    tx.set(doc(collection(db, "users", uid, "trades")),
      tradeDoc({ pair: symbol, type: "market", side, price, amount: qty, fee: res.fee }));
    return { price, qty, ...res };
  });
}

// ───────── лимитный ордер: средства замораживаются ─────────
export async function placeLimit(symbol, side, priceRaw, qtyRaw) {
  const uid = store.uid;
  const price = r8(priceRaw);
  const qty = floor8(qtyRaw);
  validate(symbol, side, qty, price);
  const { base } = pairBySymbol(symbol);

  return runTransaction(db, async (tx) => {
    const coin = side === "buy" ? "USDT" : base;
    const ref = balRef(uid, coin);
    const bal = await readBal(tx, ref);
    const need = side === "buy" ? r8(qty * price) : qty;
    if (bal.amount + (side === "buy" ? EPS : 1e-9) < need) throw new TradeError(`Недостаточно ${coin}`);
    const lock = Math.min(need, bal.amount);
    bal.amount -= lock;
    bal.locked += lock;
    writeBal(tx, ref, bal, coin);
    const oRef = doc(collection(db, "users", uid, "orders"));
    tx.set(oRef, { pair: symbol, type: "limit", side, price, amount: qty, status: "open", createdAt: serverTimestamp() });
    return { id: oRef.id, price, qty };
  });
}

// ───────── отмена: разморозка ─────────
export async function cancelOrder(orderId) {
  const uid = store.uid;
  return runTransaction(db, async (tx) => {
    const oRef = doc(db, "users", uid, "orders", orderId);
    const o = await tx.get(oRef);
    if (!o.exists() || o.data().status !== "open") throw new TradeError("Ордер уже закрыт");
    const { pair, side, price, amount } = o.data();
    const coin = side === "buy" ? "USDT" : pairBySymbol(pair).base;
    const ref = balRef(uid, coin);
    const bal = await readBal(tx, ref);
    const locked = side === "buy" ? r8(price * amount) : amount;
    const unlock = Math.min(locked, bal.locked);
    bal.locked -= unlock;
    bal.amount += unlock;
    writeBal(tx, ref, bal, coin);
    tx.update(oRef, { status: "cancelled", closedAt: serverTimestamp() });
  });
}

// ───────── исполнение лимитки ─────────
// fillPrice: для покупки не выше лимита, для продажи не ниже (как на настоящей бирже).
async function fillOrder(order, marketPrice) {
  const uid = store.uid;
  return runTransaction(db, async (tx) => {
    const oRef = doc(db, "users", uid, "orders", order.id);
    const o = await tx.get(oRef);
    if (!o.exists() || o.data().status !== "open") return null; // уже исполнен/отменён (другая вкладка)
    const { pair, side, price, amount } = o.data();
    const { base } = pairBySymbol(pair);
    const fillPrice = side === "buy" ? Math.min(price, marketPrice) : Math.max(price, marketPrice);
    const uRef = balRef(uid, "USDT"), bRef = balRef(uid, base);
    const usdt = await readBal(tx, uRef);
    const coin = await readBal(tx, bRef);
    let res;
    if (side === "buy") {
      const lockedCost = r8(price * amount);
      usdt.locked -= Math.min(lockedCost, usdt.locked);
      usdt.amount += lockedCost - amount * fillPrice; // сдача, если исполнилось дешевле
      res = creditBuy(coin, amount, fillPrice);
    } else {
      coin.locked -= Math.min(amount, coin.locked);
      res = creditSell(usdt, amount, fillPrice);
    }
    writeBal(tx, uRef, usdt, "USDT");
    writeBal(tx, bRef, coin, base);
    tx.update(oRef, { status: "filled", filledPrice: fillPrice, fee: r8(res.fee), closedAt: serverTimestamp() });
    tx.set(doc(collection(db, "users", uid, "trades")),
      tradeDoc({ pair, type: "limit", side, price: fillPrice, amount, fee: res.fee, orderId: order.id }));
    return { pair, side, amount, fillPrice };
  });
}

// ───────── сторож лимиток ─────────
const inFlight = new Set();
const checkedHistory = new Set();
let watcherStops = [];

function tryFill(order, marketPrice) {
  if (inFlight.has(order.id)) return;
  inFlight.add(order.id);
  fillOrder(order, marketPrice)
    .then((r) => {
      if (!r) return;
      const { base } = pairBySymbol(r.pair);
      toast(`Лимитный ордер исполнен: ${r.side === "buy" ? "покупка" : "продажа"} ${fmtAmount(r.amount)} ${base} по ${fmtPrice(r.fillPrice)}`, "ok");
    })
    .catch((e) => console.error("fill", e))
    .finally(() => setTimeout(() => inFlight.delete(order.id), 3000));
}

function checkLive() {
  for (const o of store.orders) {
    const t = tickers[o.pair];
    if (!t || getPrice(o.pair) == null) continue;
    if ((o.side === "buy" && t.price <= o.price) || (o.side === "sell" && t.price >= o.price)) tryFill(o, t.price);
  }
}

// Пока вкладка была закрыта, цена могла дойти до лимита — проверяем по свечам.
async function checkMissed(order) {
  if (checkedHistory.has(order.id)) return;
  checkedHistory.add(order.id);
  const age = Date.now() - order.createdAtMs;
  const interval = age < 1000 * 60e3 ? "1m" : age < 1000 * 3600e3 ? "1h" : "1d";
  try {
    let candles = await fetchKlines(order.pair, interval, { limit: 1000, startTime: order.createdAtMs });
    if (interval !== "1m") candles = candles.filter((c) => c.openTime >= order.createdAtMs);
    const hit = order.side === "buy"
      ? candles.some((c) => c.low <= order.price)
      : candles.some((c) => c.high >= order.price);
    if (hit) tryFill(order, order.price);
  } catch (e) {
    console.warn("missed-fill check", e);
  }
}

export function startOrderWatcher() {
  stopOrderWatcher();
  let firstLoad = true;
  watcherStops.push(onPrices(checkLive));
  watcherStops.push(onStore((s) => {
    if (!s.ordersReady) return;
    if (firstLoad) { firstLoad = false; s.orders.forEach(checkMissed); }
    checkLive();
  }));
}

export function stopOrderWatcher() {
  watcherStops.forEach((u) => u());
  watcherStops = [];
  checkedHistory.clear();
}

export const tradeError = (e) =>
  e instanceof TradeError ? e.message
    : e?.code === "permission-denied" ? "Операция отклонена правилами безопасности"
    : e?.code === "unavailable" ? "Нет соединения с сервером"
    : "Не получилось выполнить сделку";
