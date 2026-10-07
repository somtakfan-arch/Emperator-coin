// Переводы между игроками по адресу BED… (виртуальные).
// Монеты: отправитель списывает у себя и создаёт перевод «pending», получатель забирает его сам.
// NFT: владелец меняется сразу, в истории остаётся запись «done».
import {
  doc, collection, runTransaction, serverTimestamp, getDoc, query, where, onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { store } from "./store.js";
import { getSession } from "./auth.js";
import { TradeError, balRef, readBal, writeBal, r8, floor8 } from "./trade.js";
import { getPrice, pairByBase } from "./market.js";
import { getItem } from "./nft-data.js";
import { toast } from "./ui.js";
import { fmtAmount, fmtUsd } from "./format.js";

export const MIN_TRANSFER_USDT = 1;
const PREFIX = "BED";

export const addressOf = (uid) => `${PREFIX}${uid}`;

export function parseAddress(raw) {
  const a = String(raw || "").trim().replace(/\s+/g, "");
  if (!a.toUpperCase().startsWith(PREFIX)) return null;
  const uid = a.slice(PREFIX.length);
  return /^[A-Za-z0-9]{20,40}$/.test(uid) ? uid : null;
}

// Найти игрока по адресу: { uid, nick } или ошибка.
export async function lookupAddress(raw) {
  const uid = parseAddress(raw);
  if (!uid) throw new TradeError("Адрес должен начинаться с BED");
  if (uid === store.uid) throw new TradeError("Это твой собственный адрес");
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) throw new TradeError("Игрок с таким адресом не найден");
  return { uid, nick: snap.data().nick };
}

const usdValue = (coin, amt) => (coin === "USDT" ? amt : (getPrice(`${coin}USDT`) ?? 0) * amt);

export async function sendCoin(toRaw, coin, amountRaw) {
  const uid = store.uid;
  const to = await lookupAddress(toRaw);
  const amount = coin === "USDT" ? Math.floor(amountRaw * 100) / 100 : floor8(amountRaw);
  if (!(amount > 0)) throw new TradeError("Укажи сумму");
  if (usdValue(coin, amount) < MIN_TRANSFER_USDT) throw new TradeError(`Минимальный перевод — эквивалент ${MIN_TRANSFER_USDT} USDT`);
  const fromNick = getSession().profile?.nick || "Игрок";

  await runTransaction(db, async (tx) => {
    const ref = balRef(uid, coin);
    const bal = await readBal(tx, ref);
    if (bal.amount + 1e-9 < amount) throw new TradeError(`Недостаточно ${coin} (в ордерах замороженное не считается)`);
    bal.amount = r8(bal.amount - amount);
    writeBal(tx, ref, bal, coin);
    tx.set(doc(collection(db, "transfers")), {
      from: uid, fromNick, to: to.uid, toNick: to.nick, coin, amount, status: "pending", createdAt: serverTimestamp(),
    });
  });
  return { to, amount };
}

export async function sendNft(toRaw, item) {
  const uid = store.uid;
  const to = await lookupAddress(toRaw);
  const fromNick = getSession().profile?.nick || "Игрок";
  await runTransaction(db, async (tx) => {
    const nRef = doc(db, "nfts", item.id);
    const n = await tx.get(nRef);
    if (!n.exists() || n.data().owner !== uid) throw new TradeError("Этот токен тебе не принадлежит");
    tx.update(nRef, { owner: to.uid, ownerNick: to.nick, boughtAt: serverTimestamp() });
    tx.set(doc(collection(db, "transfers")), {
      from: uid, fromNick, to: to.uid, toNick: to.nick, coin: "NFT", amount: 1, nft: item.id, status: "done", createdAt: serverTimestamp(),
    });
  });
  return { to };
}

// Получатель забирает перевод: зачисляет себе и помечает «claimed».
async function claim(t) {
  const uid = store.uid;
  await runTransaction(db, async (tx) => {
    const tRef = doc(db, "transfers", t.id);
    const cur = await tx.get(tRef);
    if (!cur.exists() || cur.data().status !== "pending" || cur.data().to !== uid) return;
    const { coin, amount } = cur.data();
    const ref = balRef(uid, coin);
    const bal = await readBal(tx, ref);
    const before = bal.amount + bal.locked;
    // себестоимость полученных монет — по текущему курсу (для прибыли в кошельке)
    const price = coin === "USDT" ? 1 : getPrice(`${coin}USDT`) ?? bal.avgPrice ?? 0;
    bal.avgPrice = before + amount > 0 ? (before * (bal.avgPrice || 0) + amount * price) / (before + amount) : 0;
    bal.amount = r8(bal.amount + amount);
    writeBal(tx, ref, bal, coin);
    tx.update(tRef, { status: "claimed", claimedAt: serverTimestamp() });
  });
}

// ───────── слушатель переводов (входящие + исходящие) ─────────
export const transfersState = { list: [], ready: false };
const listeners = new Set();
export function onTransfers(cb) { listeners.add(cb); cb(transfersState); return () => listeners.delete(cb); }
const emit = () => listeners.forEach((cb) => cb(transfersState));

let stops = [];
const claiming = new Set();
export function startTransfers(uid) {
  stopTransfers();
  const startedAt = Date.now();
  const seen = new Set();
  let inc = [], out = [];
  const merge = () => {
    transfersState.list = [...inc, ...out].sort((a, b) => (b.createdAt?.toMillis?.() ?? Date.now()) - (a.createdAt?.toMillis?.() ?? Date.now()));
    transfersState.ready = true;
    emit();
  };
  stops.push(onSnapshot(query(collection(db, "transfers"), where("to", "==", uid)), (snap) => {
    inc = snap.docs.map((d) => ({ id: d.id, ...d.data(), dir: "in" }));
    merge();
    for (const t of inc) {
      // уведомление о новых входящих NFT (монеты — после зачисления)
      if (t.status === "done" && !seen.has(t.id) && (t.createdAt?.toMillis?.() ?? Date.now()) > startedAt) {
        toast(`${t.fromNick} прислал тебе NFT: ${getItem(t.nft)?.name || t.nft}`, "ok");
      }
      seen.add(t.id);
      if (t.status === "pending" && !claiming.has(t.id)) {
        claiming.add(t.id);
        claim(t)
          .then(() => toast(`Получено ${t.coin === "USDT" ? fmtUsd(t.amount) : fmtAmount(t.amount)} ${t.coin} от ${t.fromNick}`, "ok"))
          .catch((e) => { console.error("claim", e); claiming.delete(t.id); });
      }
    }
  }, (e) => console.error("transfers in", e)));
  stops.push(onSnapshot(query(collection(db, "transfers"), where("from", "==", uid)), (snap) => {
    out = snap.docs.map((d) => ({ id: d.id, ...d.data(), dir: "out" }));
    merge();
  }, (e) => console.error("transfers out", e)));
}
export function stopTransfers() {
  stops.forEach((s) => s());
  stops = [];
  transfersState.list = [];
  transfersState.ready = false;
}

export const coinLabel = (coin) => (coin === "USDT" ? "Tether" : pairByBase(coin)?.name || coin);
