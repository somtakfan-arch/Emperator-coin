// Данные текущего юзера в реальном времени: балансы и открытые ордера.
// Плюс синхронизация стоимости портфеля для рейтинга.
import {
  collection, doc, query, where, onSnapshot, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { PAIRS, getPrice, onPrices } from "./market.js";
import { getItem, itemUsd, BOX } from "./nft-data.js";

export const store = { uid: null, balances: {}, orders: [], nfts: [], boxes: [], balancesReady: false, ordersReady: false, nftsReady: false };
const listeners = new Set();
let unsubs = [];

export function onStore(cb) {
  listeners.add(cb);
  if (store.uid) cb(store);
  return () => listeners.delete(cb);
}
const emit = () => listeners.forEach((cb) => { try { cb(store); } catch (e) { console.error(e); } });

export function startUserData(uid) {
  stopUserData();
  store.uid = uid;
  unsubs.push(onSnapshot(collection(db, "users", uid, "balances"), (snap) => {
    const b = {};
    snap.forEach((d) => (b[d.id] = { amount: 0, locked: 0, avgPrice: 0, ...d.data() }));
    store.balances = b;
    store.balancesReady = true;
    emit();
    syncPortfolio(true); // балансы меняются только сделками — сразу обновляем рейтинг
  }, (e) => console.error("balances", e)));

  unsubs.push(onSnapshot(query(collection(db, "users", uid, "orders"), where("status", "==", "open")), (snap) => {
    store.orders = snap.docs
      .map((d) => ({ id: d.id, ...d.data(), createdAtMs: d.data().createdAt?.toMillis?.() ?? Date.now() }))
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
    store.ordersReady = true;
    emit();
  }, (e) => console.error("orders", e)));

  // мои NFT: документ в nfts/{tokenId} с owner == uid
  unsubs.push(onSnapshot(query(collection(db, "nfts"), where("owner", "==", uid)), (snap) => {
    store.nfts = snap.docs
      .map((d) => ({ id: d.id, ...d.data(), item: getItem(d.id) }))
      .filter((n) => n.item)
      .sort((a, b) => (b.boughtAt?.toMillis?.() ?? 0) - (a.boughtAt?.toMillis?.() ?? 0));
    store.nftsReady = true;
    emit();
    syncPortfolio(true);
  }, (e) => console.error("nfts", e)));

  unsubs.push(onSnapshot(collection(db, "users", uid, "boxes"), (snap) => {
    store.boxes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    emit();
    syncPortfolio(true);
  }, (e) => console.error("boxes", e)));

  unsubs.push(onPrices(() => syncPortfolio()));
  const t = setInterval(() => syncPortfolio(), 60000);
  unsubs.push(() => clearInterval(t));
}

export function stopUserData() {
  unsubs.forEach((u) => u());
  unsubs = [];
  lastValue = null;
  lastWrite = 0;
  Object.assign(store, { uid: null, balances: {}, orders: [], nfts: [], boxes: [], balancesReady: false, ordersReady: false, nftsReady: false });
}

// ───────── стоимость портфеля ─────────
export const total = (b) => (b ? (b.amount || 0) + (b.locked || 0) : 0);

// Возвращает null, если для какой-то монеты нет цены (не пишем заниженную стоимость).
// Неоткрытый бокс считаем по цене покупки.
export function nftsValue(nfts = store.nfts) {
  let sum = store.boxes.reduce((s, b) => s + (b.price || BOX.price), 0);
  for (const n of nfts) {
    const v = itemUsd(n.item);
    if (v == null) return null;
    sum += v;
  }
  return sum;
}

export function portfolioValue(balances = store.balances) {
  const nv = nftsValue();
  if (nv == null) return null;
  let sum = total(balances.USDT) + nv;
  for (const p of PAIRS) {
    const qty = total(balances[p.base]);
    if (qty <= 0) continue;
    const price = getPrice(p.symbol);
    if (price == null) return null;
    sum += qty * price;
  }
  return sum;
}

let lastWrite = 0;
let lastValue = null;
export async function syncPortfolio(force = false) {
  if (!store.uid || !store.balancesReady || !store.nftsReady) return;
  const v = portfolioValue();
  if (v == null) return;
  const value = Math.round(v * 100) / 100;
  const changed = lastValue == null || Math.abs(value - lastValue) >= 0.01;
  if (!changed || (!force && Date.now() - lastWrite < 30000)) return;
  lastWrite = Date.now();
  lastValue = value;
  try {
    await updateDoc(doc(db, "users", store.uid), { portfolioValue: value, updatedAt: serverTimestamp() });
  } catch (e) {
    console.error("portfolio sync", e);
  }
}
