// Статистика трейдера, ачивки и уровень — считаются из истории сделок и текущих активов.
import {
  collection, query, orderBy, limit, getDocs,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { store, portfolioValue, total } from "./store.js";
import { transfersState } from "./transfer.js";
import { PAIRS, getPrice, pairBySymbol } from "./market.js";

export async function loadTrades(uid = store.uid, max = 1000) {
  const snap = await getDocs(query(collection(db, "users", uid, "trades"), orderBy("time", "desc"), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function computeStats(trades) {
  const coin = trades.filter((t) => t.pair !== "NFT");
  const nftTx = trades.filter((t) => t.pair === "NFT" && t.type === "nft");
  const feeUsd = (t) => (t.feeAsset === "USDT" ? t.fee || 0 : (t.fee || 0) * (t.price || 0));
  const byPair = {};
  coin.forEach((t) => (byPair[t.pair] = (byPair[t.pair] || 0) + (t.total || 0)));
  const favPair = Object.entries(byPair).sort((a, b) => b[1] - a[1])[0]?.[0];
  const days = new Set(trades.filter((t) => t.time?.toMillis).map((t) => new Date(t.time.toMillis()).toISOString().slice(0, 10)));
  const first = trades.filter((t) => t.time?.toMillis).at(-1)?.time.toMillis();
  return {
    trades: coin.length,
    buys: coin.filter((t) => t.side === "buy").length,
    sells: coin.filter((t) => t.side === "sell").length,
    limits: coin.filter((t) => t.type === "limit").length,
    volume: coin.reduce((s, t) => s + (t.total || 0), 0) + nftTx.reduce((s, t) => s + (t.total || 0), 0),
    fees: [...coin, ...nftTx, ...trades.filter((t) => t.type === "box")].reduce((s, t) => s + feeUsd(t), 0),
    biggest: coin.reduce((m, t) => Math.max(m, t.total || 0), 0),
    favPair: favPair ? pairBySymbol(favPair)?.base : null,
    nftBought: nftTx.filter((t) => t.side === "buy").length,
    nftSold: nftTx.filter((t) => t.side === "sell").length,
    boxesBought: trades.filter((t) => t.type === "box").reduce((s, t) => s + (t.amount || 1), 0),
    reveals: trades.filter((t) => t.type === "reveal").length,
    crafts: trades.filter((t) => t.type === "craft").length,
    quests: trades.filter((t) => t.type === "quest").length,
    dailies: trades.filter((t) => t.type === "daily" || t.type === "wheel").length,
    activeDays: days.size,
    since: first || null,
  };
}

const coinsHeld = () => PAIRS.filter((p) => total(store.balances[p.base]) * (getPrice(p.symbol) || 0) >= 1).length;
const hasTier = (cls) => store.nfts.some((n) => n.item.tier.cls === cls);

export const ACHIEVEMENTS = [
  { id: "first", icon: "🚀", name: "Первая сделка", desc: "Сделай первую сделку", goal: 1, val: (s) => s.trades },
  { id: "t10", icon: "📈", name: "Трейдер", desc: "10 сделок с монетами", goal: 10, val: (s) => s.trades },
  { id: "t100", icon: "⚙️", name: "Машина", desc: "100 сделок с монетами", goal: 100, val: (s) => s.trades },
  { id: "limit", icon: "🎯", name: "Снайпер", desc: "Исполни лимитный ордер", goal: 1, val: (s) => s.limits },
  { id: "vol10k", icon: "💸", name: "Оборот", desc: "Наторгуй на 10 000 USDT", goal: 10000, val: (s) => s.volume },
  { id: "vol100k", icon: "🏦", name: "Большой оборот", desc: "Наторгуй на 100 000 USDT", goal: 100000, val: (s) => s.volume },
  { id: "p20k", icon: "🐋", name: "Кит", desc: "Портфель 20 000 USDT", goal: 20000, val: () => portfolioValue() || 0 },
  { id: "p50k", icon: "👑", name: "Император", desc: "Портфель 50 000 USDT", goal: 50000, val: () => portfolioValue() || 0 },
  { id: "diver", icon: "🧺", name: "Диверсификация", desc: "Держи 5 разных монет", goal: 5, val: () => coinsHeld() },
  { id: "nft1", icon: "🖼️", name: "Первый NFT", desc: "Получи первый NFT", goal: 1, val: () => store.nfts.length },
  { id: "nft10", icon: "🗂️", name: "Коллекционер", desc: "10 NFT одновременно", goal: 10, val: () => store.nfts.length },
  { id: "nft50", icon: "🏛️", name: "Галерея", desc: "50 NFT одновременно", goal: 50, val: () => store.nfts.length },
  { id: "box10", icon: "📦", name: "Распаковщик", desc: "Открой 10 боксов", goal: 10, val: (s) => s.reveals },
  { id: "box100", icon: "🎁", name: "Фабрика боксов", desc: "Открой 100 боксов", goal: 100, val: (s) => s.reveals },
  { id: "epic", icon: "💜", name: "Везунчик", desc: "Владей эпическим NFT", goal: 1, val: () => (hasTier("t-epic") ? 1 : 0) },
  { id: "leg", icon: "✨", name: "Легенда", desc: "Владей легендарным NFT", goal: 1, val: () => (hasTier("t-leg") ? 1 : 0) },
  { id: "joker", icon: "🃏", name: "Джокер", desc: "Владей джокером Silver Deck", goal: 1, val: () => (store.nfts.some((n) => n.id === "deck-53" || n.id === "deck-54") ? 1 : 0) },
  { id: "craft", icon: "⚒️", name: "Кузнец", desc: "Скрафти NFT", goal: 1, val: (s) => s.crafts },
  { id: "gift", icon: "🤝", name: "Щедрый", desc: "Отправь перевод другу", goal: 1, val: () => transfersState.list.filter((t) => t.dir === "out").length },
  { id: "quest10", icon: "📅", name: "Постоянство", desc: "Выполни 10 заданий", goal: 10, val: (s) => s.quests },
  { id: "days7", icon: "🔥", name: "Неделя в игре", desc: "Торгуй в 7 разных дней", goal: 7, val: (s) => s.activeDays },
];

export function computeAchievements(stats) {
  return ACHIEVEMENTS.map((a) => {
    const v = a.val(stats);
    return { ...a, value: v, done: v >= a.goal, pct: Math.min(1, v / a.goal) };
  });
}

const TITLES = ["Новичок", "Стажёр", "Трейдер", "Профи", "Акула", "Кит", "Магнат", "Император"];
export function computeLevel(stats, achievements) {
  const xp = Math.round(stats.trades * 10 + stats.reveals * 4 + stats.crafts * 25 + stats.quests * 15
    + stats.nftBought * 8 + stats.volume / 200 + achievements.filter((a) => a.done).length * 100);
  const level = Math.floor(Math.sqrt(xp / 60)) + 1;
  const cur = 60 * (level - 1) ** 2, next = 60 * level ** 2;
  return { xp, level, title: TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 2))], progress: (xp - cur) / (next - cur), toNext: next - xp };
}
