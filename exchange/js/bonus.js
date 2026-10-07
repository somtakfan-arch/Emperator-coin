// Ежедневные награды: бесплатный бокс раз в сутки и задания на USDT.
// Отметка «уже получено» — документ в trades с фиксированным id (второй раз создать его правила не дадут).
import {
  doc, collection, query, orderBy, limit, getDocs, runTransaction, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { store } from "./store.js";
import { TradeError, balRef, readBal, writeBal } from "./trade.js";
import { BOX } from "./nft-data.js";

export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10); // по UTC
export const nextDayAt = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.getTime(); };

export const QUESTS = [
  { id: "trade3", title: "Сделай 3 сделки с монетами", goal: 3, reward: 50,
    count: (ts) => ts.filter((t) => t.pair !== "NFT").length },
  { id: "open3", title: "Открой 3 мистери-бокса", goal: 3, reward: 50,
    count: (ts) => ts.filter((t) => t.type === "reveal").length },
  { id: "nft1", title: "Купи или продай NFT", goal: 1, reward: 30,
    count: (ts) => ts.filter((t) => t.type === "nft").length },
  { id: "craft1", title: "Скрафти NFT", goal: 1, reward: 40,
    count: (ts) => ts.filter((t) => t.type === "craft").length },
];

// Сделки за сегодня + отметки о полученных наградах.
export async function loadDaily() {
  const snap = await getDocs(query(collection(db, "users", store.uid, "trades"), orderBy("time", "desc"), limit(300)));
  const today = dayKey();
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const todays = all.filter((t) => t.time?.toMillis && dayKey(t.time.toMillis()) === today);
  const claimed = new Set(all.filter((t) => t.id.endsWith(`-${today}`)).map((t) => t.id));
  return {
    today,
    freeBoxClaimed: claimed.has(`daily-${today}`),
    wheelSpun: claimed.has(`wheel-${today}`),
    quests: QUESTS.map((q) => ({ ...q, progress: Math.min(q.goal, q.count(todays)), claimed: claimed.has(`quest-${q.id}-${today}`) })),
  };
}

const mark = (tx, id, data) => tx.set(doc(db, "users", store.uid, "trades", id), {
  pair: "NFT", side: "buy", amount: 1, fee: 0, feeAsset: "USDT", time: serverTimestamp(), ...data,
});

export async function claimFreeBox() {
  const id = `daily-${dayKey()}`;
  await runTransaction(db, async (tx) => {
    if ((await tx.get(doc(db, "users", store.uid, "trades", id))).exists()) throw new TradeError("Сегодняшний бокс уже получен");
    tx.set(doc(collection(db, "users", store.uid, "boxes")), { price: BOX.price, boughtAt: serverTimestamp() });
    mark(tx, id, { type: "daily", price: BOX.price, total: 0, nft: "box" });
  });
}

export async function claimQuest(q) {
  const id = `quest-${q.id}-${dayKey()}`;
  await runTransaction(db, async (tx) => {
    if ((await tx.get(doc(db, "users", store.uid, "trades", id))).exists()) throw new TradeError("Награда уже получена");
    const ref = balRef(store.uid, "USDT");
    const usdt = await readBal(tx, ref);
    usdt.amount += q.reward;
    writeBal(tx, ref, usdt, "USDT");
    mark(tx, id, { type: "quest", price: q.reward, total: q.reward, nft: q.id });
  });
}

// ───────── колесо фортуны: раз в сутки, бесплатно ─────────
export const WHEEL = [
  { label: "10 USDT", usdt: 10, w: 30 },
  { label: "25 USDT", usdt: 25, w: 24 },
  { label: "50 USDT", usdt: 50, w: 16 },
  { label: "Бокс", boxes: 1, w: 12 },
  { label: "100 USDT", usdt: 100, w: 9 },
  { label: "3 бокса", boxes: 3, w: 4 },
  { label: "250 USDT", usdt: 250, w: 4 },
  { label: "1000 USDT", usdt: 1000, w: 1 },
];

export async function spinWheel() {
  const id = `wheel-${dayKey()}`;
  const sum = WHEEL.reduce((a, p) => a + p.w, 0);
  let x = Math.random() * sum, index = 0;
  for (; index < WHEEL.length - 1; index++) { x -= WHEEL[index].w; if (x <= 0) break; }
  const prize = WHEEL[index];
  await runTransaction(db, async (tx) => {
    if ((await tx.get(doc(db, "users", store.uid, "trades", id))).exists()) throw new TradeError("Колесо уже крутили сегодня");
    if (prize.usdt) {
      const ref = balRef(store.uid, "USDT");
      const usdt = await readBal(tx, ref);
      usdt.amount += prize.usdt;
      writeBal(tx, ref, usdt, "USDT");
    }
    for (let i = 0; i < (prize.boxes || 0); i++) tx.set(doc(collection(db, "users", store.uid, "boxes")), { price: BOX.price, boughtAt: serverTimestamp() });
    mark(tx, id, { type: "wheel", price: prize.usdt || BOX.price, total: prize.usdt || 0, nft: prize.label });
  });
  return { prize, index };
}
