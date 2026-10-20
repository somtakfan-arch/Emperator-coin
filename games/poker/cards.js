// Карты, оценка рук, сила руки префлоп/постфлоп.
// Карта = число 0..51: ранг = c >> 2 (0 = двойка ... 12 = туз), масть = c & 3.

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';
const SUIT_ICONS = ['♠', '♥', '♦', '♣'];

export const cardRank = (c) => c >> 2;
export const cardSuit = (c) => c & 3;
export const cardStr = (c) => RANKS[c >> 2] + SUIT_ICONS[c & 3];
export const parseCard = (s) =>
  RANKS.indexOf(s[0].toUpperCase()) * 4 + SUITS.indexOf(s[1].toLowerCase());

export function newDeck() {
  return Array.from({ length: 52 }, (_, i) => i);
}

export function shuffle(a, rng = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Оценка руки (5–7 карт) ----------

const B = 13;
const CAT_BASE = B ** 5;
export const HAND_NAMES = [
  'Старшая карта', 'Пара', 'Две пары', 'Сет', 'Стрит',
  'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш',
];

function score(cat, ks) {
  let v = cat;
  for (let i = 0; i < 5; i++) v = v * B + (ks[i] ?? 0);
  return v;
}

function straightHigh(mask) {
  for (let h = 12; h >= 4; h--) {
    const m = 0x1f << (h - 4);
    if ((mask & m) === m) return h;
  }
  return (mask & 0x100f) === 0x100f ? 3 : -1; // колесо A-2-3-4-5
}

function topBits(mask, n) {
  const out = [];
  for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

// Чем больше число — тем сильнее рука.
export function evaluate(cards) {
  const rc = new Array(13).fill(0);
  const sm = [0, 0, 0, 0];
  const sc = [0, 0, 0, 0];
  let rankMask = 0;
  for (const c of cards) {
    const r = c >> 2, s = c & 3;
    rc[r]++; sm[s] |= 1 << r; sc[s]++; rankMask |= 1 << r;
  }
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (sc[s] >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const sf = straightHigh(sm[flushSuit]);
    if (sf >= 0) return score(8, [sf]);
  }
  let quad = -1;
  const trips = [], pairs = [];
  for (let r = 12; r >= 0; r--) {
    if (rc[r] === 4) quad = r;
    else if (rc[r] === 3) trips.push(r);
    else if (rc[r] === 2) pairs.push(r);
  }
  if (quad >= 0) return score(7, [quad, ...topBits(rankMask & ~(1 << quad), 1)]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const p = trips.length > 1 ? Math.max(trips[1], pairs[0] ?? -1) : pairs[0];
    return score(6, [trips[0], p]);
  }
  if (flushSuit >= 0) return score(5, topBits(sm[flushSuit], 5));
  const st = straightHigh(rankMask);
  if (st >= 0) return score(4, [st]);
  if (trips.length) return score(3, [trips[0], ...topBits(rankMask & ~(1 << trips[0]), 2)]);
  if (pairs.length >= 2) {
    const rest = rankMask & ~(1 << pairs[0]) & ~(1 << pairs[1]);
    return score(2, [pairs[0], pairs[1], ...topBits(rest, 1)]);
  }
  if (pairs.length) return score(1, [pairs[0], ...topBits(rankMask & ~(1 << pairs[0]), 3)]);
  return score(0, topBits(rankMask, 5));
}

export const handCategory = (v) => Math.floor(v / CAT_BASE);
export const handName = (v) => HAND_NAMES[handCategory(v)];
const topRankOf = (v) => Math.floor(v / B ** 4) % B;

// ---------- Префлоп: перцентиль руки (1 = AA, 0 = 72o) ----------

function chen(r1, r2, suited) {
  const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  const pts = (r) => (r === 12 ? 10 : r === 11 ? 8 : r === 10 ? 7 : r === 9 ? 6 : (r + 2) / 2);
  let s;
  if (hi === lo) s = Math.max(5, pts(hi) * 2);
  else {
    s = pts(hi) + (suited ? 2 : 0);
    const gap = hi - lo - 1;
    s -= [0, 1, 2, 4][gap] ?? 5;
    if (gap <= 1 && hi < 10) s += 1;
  }
  return Math.ceil(s) + hi * 0.01 + lo * 0.001;
}

const PRE_PCT = new Map();
(() => {
  const vals = [];
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++)
      vals.push(chen(a >> 2, b >> 2, (a & 3) === (b & 3)));
  const sorted = vals.slice().sort((x, y) => x - y);
  const n = sorted.length;
  for (let hi = 0; hi < 13; hi++)
    for (let lo = 0; lo <= hi; lo++)
      for (const s of [0, 1]) {
        if (hi === lo && s) continue;
        const v = chen(hi, lo, !!s);
        let below = 0, eq = 0;
        for (const x of sorted) { if (x < v) below++; else if (x === v) eq++; }
        PRE_PCT.set(hi * 100 + lo * 2 + s, (below + eq / 2) / n);
      }
})();

export function preflopPct(hole) {
  const r1 = hole[0] >> 2, r2 = hole[1] >> 2;
  const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  const s = hi !== lo && (hole[0] & 3) === (hole[1] & 3) ? 1 : 0;
  return PRE_PCT.get(hi * 100 + lo * 2 + s);
}

// ---------- Постфлоп: быстрая оценка силы + дро ----------

export function boardContext(board) {
  let mask = 0, max = -1;
  const suits = [0, 0, 0, 0];
  for (const c of board) {
    mask |= 1 << (c >> 2);
    max = Math.max(max, c >> 2);
    suits[c & 3]++;
  }
  const v = board.length ? evaluate(board) : 0;
  return { board, cat: handCategory(v), max, mask, suits, flushy: Math.max(...suits) >= 3 };
}

// Возвращает { s: 0..1 сила, made: готовая рука, draw: бонус за дро }.
export function postflopStrength(hole, board, ctx = boardContext(board)) {
  const all = hole.concat(board);
  const v = evaluate(all);
  const cat = handCategory(v);
  const bc = ctx.cat;
  let made;
  if (cat >= 6) made = bc >= 6 ? 0.45 : 0.96;
  else if (cat === 5) {
    const flushHole = hole.some((c) => ctx.suits[c & 3] >= 3);
    made = ctx.suits.some((n) => n >= 4) ? (flushHole ? 0.8 : 0.4) : 0.9;
  } else if (cat === 4) made = bc >= 4 ? 0.4 : ctx.flushy ? 0.74 : 0.84;
  else if (cat === 3) made = bc === 3 ? 0.2 + (Math.max(hole[0] >> 2, hole[1] >> 2) / 12) * 0.15 : 0.8;
  else if (cat === 2) made = bc === 2 ? 0.18 : bc === 1 ? pairScore(hole, ctx, v, true) : 0.72;
  else if (cat === 1) made = bc === 1 ? 0.12 : pairScore(hole, ctx, v, false);
  else made = 0.04 + (topRankOf(v) / 12) * 0.08;

  let draw = 0;
  if (board.length < 5 && cat < 5) {
    for (let s = 0; s < 4; s++) {
      const holeS = (hole[0] & 3) === s ? 1 : 0;
      const holeS2 = (hole[1] & 3) === s ? 1 : 0;
      if (ctx.suits[s] + holeS + holeS2 === 4 && holeS + holeS2 > 0) draw = Math.max(draw, 0.2);
    }
    // бит r+1 = ранг r, бит 0 = туз как единица
    const lift = (m) => (m << 1) | (m & (1 << 12) ? 1 : 0);
    const hm = lift((1 << (hole[0] >> 2)) | (1 << (hole[1] >> 2)));
    const ext = lift(ctx.mask) | hm;
    for (let lo = 0; lo <= 10 && cat < 4; lo++) {
      const w4 = 0xf << lo;
      if ((ext & w4) === w4 && ext & hm & w4) {
        draw = Math.max(draw, lo >= 1 && lo <= 9 ? 0.16 : 0.08); // двусторонний / односторонний
      }
      const w5 = 0x1f << lo;
      if (lo <= 9 && popcount(ext & w5) === 4 && ext & hm & w5) draw = Math.max(draw, 0.08);
    }
  }
  const s = made >= 0.7 ? made : Math.min(0.68, made + draw);
  return { s, made, draw, cat };
}

function pairScore(hole, ctx, v, boardPaired) {
  const r1 = hole[0] >> 2, r2 = hole[1] >> 2;
  const pr = boardPaired ? (r1 === r2 ? r1 : ctx.mask & (1 << r1) ? r1 : r2) : topRankOf(v);
  if (r1 === r2 && r1 > ctx.max) return Math.min(0.7, 0.6 + (r1 - ctx.max) * 0.01);
  if (pr === ctx.max) {
    const kicker = r1 === pr ? r2 : r1;
    return 0.48 + (kicker / 12) * 0.1;
  }
  const higher = popcount(ctx.mask >> (pr + 1));
  return higher === 1 ? 0.36 : 0.26;
}

function popcount(x) {
  let n = 0;
  while (x) { x &= x - 1; n++; }
  return n;
}
