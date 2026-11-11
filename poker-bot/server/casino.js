// Казино: 15 игр на игровые фишки. Всё решает сервер (случайность — crypto), клиент только рисует.
// Ставка списывается сразу, выигрыш начисляется при расчёте; незаконченные игры (блэкджек, мины,
// башня, хай-лоу, видео-покер, краш) хранятся в базе и переживают перезапуск.
import { randomInt } from 'node:crypto';
import { db, tx, debit, credit } from './db.js';
import { NOT_ADMIN } from './config.js';

db.exec(`
CREATE TABLE IF NOT EXISTS casino_state (user_id INTEGER NOT NULL, game TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (user_id, game));
CREATE TABLE IF NOT EXISTS casino_hist (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, game TEXT NOT NULL, bet INTEGER NOT NULL, win INTEGER NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS casino_hist_user ON casino_hist (user_id, at);
CREATE INDEX IF NOT EXISTS casino_hist_at ON casino_hist (at);
`);

export const MIN_BET = 10;
export const MAX_BET = 1e9;
export const GAMES = ['roulette', 'blackjack', 'slots', 'dice', 'crash', 'mines', 'plinko', 'coin', 'wheel', 'baccarat', 'hilo', 'keno', 'videopoker', 'tower', 'dragontiger'];

// ---------- общее ----------
const rnd = () => randomInt(0, 2 ** 47) / 2 ** 47; // [0, 1)
const shuffled = (n) => { const a = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = randomInt(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const shoe = (decks) => shuffled(52 * decks).map((x) => x % 52);
const fl2 = (x) => Math.floor(x * 100 + 1e-9) / 100; // множитель с двумя знаками, вниз

function checkBet(bet) {
  bet = Number(bet);
  if (!Number.isSafeInteger(bet) || bet < MIN_BET) throw new Error(`Ставка — от ${MIN_BET} фишек`);
  if (bet > MAX_BET) throw new Error('Слишком большая ставка');
  return bet;
}
function take(uid, game, bet) {
  bet = checkBet(bet);
  if (!debit(uid, bet, 'casino', game)) throw new Error('Не хватает фишек');
  return bet;
}
// расчёт: начислить выигрыш и записать в историю
function settle(uid, game, bet, win) {
  win = Math.max(0, Math.floor(win));
  if (win > 0) credit(uid, win, 'casino', game);
  db.prepare('INSERT INTO casino_hist (user_id, game, bet, win, at) VALUES (?, ?, ?, ?, ?)').run(uid, game, bet, win, Date.now());
  if (Math.random() < 0.01) db.prepare('DELETE FROM casino_hist WHERE at < ?').run(Date.now() - 30 * 86400000);
  onSettle(uid, game, bet, win);
  return win;
}
let onSettle = () => {};
let notify = () => {};
export function setHooks(h) { if (h.onSettle) onSettle = h.onSettle; if (h.notify) notify = h.notify; }

const getState = (uid, game) => { const r = db.prepare('SELECT data FROM casino_state WHERE user_id = ? AND game = ?').get(uid, game); return r ? JSON.parse(r.data) : null; };
const setState = (uid, game, s) => db.prepare('INSERT INTO casino_state (user_id, game, data) VALUES (?, ?, ?) ON CONFLICT (user_id, game) DO UPDATE SET data = excluded.data').run(uid, game, JSON.stringify(s));
const delState = (uid, game) => db.prepare('DELETE FROM casino_state WHERE user_id = ? AND game = ?').run(uid, game);
function noActive(uid, game) { if (getState(uid, game)) throw new Error('Сначала доиграй текущую игру'); }
const need = (s) => { if (!s) throw new Error('Игра не начата'); return s; };

// ==================== 1. Рулетка (европейская, один ноль) ====================
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const ROUL = {
  n: { pay: 36, hit: (x, v) => x === v, v: (v) => Number.isInteger(v) && v >= 0 && v <= 36 },
  red: { pay: 2, hit: (x) => RED.has(x) }, black: { pay: 2, hit: (x) => x > 0 && !RED.has(x) },
  even: { pay: 2, hit: (x) => x > 0 && x % 2 === 0 }, odd: { pay: 2, hit: (x) => x % 2 === 1 },
  low: { pay: 2, hit: (x) => x >= 1 && x <= 18 }, high: { pay: 2, hit: (x) => x >= 19 },
  dozen: { pay: 3, hit: (x, v) => x > 0 && Math.ceil(x / 12) === v, v: (v) => [1, 2, 3].includes(v) },
  col: { pay: 3, hit: (x, v) => x > 0 && ((x - 1) % 3) + 1 === v, v: (v) => [1, 2, 3].includes(v) },
};
function roulette(uid, m) {
  const bets = Array.isArray(m.bets) ? m.bets : [];
  if (!bets.length || bets.length > 60) throw new Error('Поставь фишки на поле');
  let total = 0;
  const clean = bets.map((b) => {
    const k = ROUL[b?.k];
    if (!k) throw new Error('Непонятная ставка');
    const v = b.v == null ? null : Number(b.v);
    if (k.v && !k.v(v)) throw new Error('Непонятная ставка');
    const a = checkBet(b.a);
    total += a;
    return { k: b.k, v, a };
  });
  return tx(() => {
    take(uid, 'roulette', total);
    const x = randomInt(0, 37);
    const win = clean.reduce((s, b) => s + (ROUL[b.k].hit(x, b.v) ? b.a * ROUL[b.k].pay : 0), 0);
    settle(uid, 'roulette', total, win);
    return { result: x, win, bet: total };
  });
}

// ==================== 2. Блэкджек (6 колод, дилер стоит на 17, сплит, дабл) ====================
const bjVal = (c) => { const r = c >> 2; return r === 12 ? 11 : r >= 8 ? 10 : r + 2; };
export function bjTotal(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { t += bjVal(c); if (c >> 2 === 12) aces++; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { t, soft: aces > 0 };
}
const isBJ = (cards) => cards.length === 2 && bjTotal(cards).t === 21;
function bjView(s, over) {
  return {
    hands: s.hands.map((hd) => ({ cards: hd.cards, bet: hd.bet, total: bjTotal(hd.cards).t, done: hd.done, res: hd.res ?? null })),
    cur: s.cur, dealer: over ? s.dealer : [s.dealer[0]], dealerTotal: over ? bjTotal(s.dealer).t : bjVal(s.dealer[0]), over: !!over,
    canDouble: !over && s.hands[s.cur]?.cards.length === 2,
    canSplit: !over && s.hands.length === 1 && s.hands[0].cards.length === 2 && bjVal(s.hands[0].cards[0]) === bjVal(s.hands[0].cards[1]),
  };
}
function bjFinish(uid, s) {
  const live = s.hands.some((hd) => bjTotal(hd.cards).t <= 21);
  if (live) while (bjTotal(s.dealer).t < 17) s.dealer.push(s.shoe.pop());
  const d = bjTotal(s.dealer).t;
  let win = 0, bet = 0;
  for (const hd of s.hands) {
    bet += hd.bet;
    const p = bjTotal(hd.cards).t;
    const w = p > 21 ? 0 : d > 21 || p > d ? hd.bet * 2 : p === d ? hd.bet : 0;
    hd.res = p > 21 ? 'bust' : w > hd.bet ? 'win' : w === hd.bet ? 'push' : 'lose';
    win += w;
  }
  delState(uid, 'blackjack');
  settle(uid, 'blackjack', bet, win);
  return { ...bjView(s, true), win, bet };
}
function bjNext(uid, s) {
  while (s.cur < s.hands.length && s.hands[s.cur].done) s.cur++;
  if (s.cur >= s.hands.length) return bjFinish(uid, s);
  setState(uid, 'blackjack', s);
  return bjView(s, false);
}
function blackjack(uid, m) {
  return tx(() => {
    if (m.a === 'deal') {
      noActive(uid, 'blackjack');
      const bet = take(uid, 'blackjack', m.bet);
      const sh = shoe(6);
      const p = [sh.pop()], d = [sh.pop()];
      p.push(sh.pop()); d.push(sh.pop());
      const s = { shoe: sh, hands: [{ cards: p, bet, done: false }], cur: 0, dealer: d };
      if (isBJ(p) || isBJ(d)) { // блэкджек у кого-то — сразу расчёт
        const win = isBJ(p) && isBJ(d) ? bet : isBJ(p) ? Math.floor(bet * 2.5) : 0;
        s.hands[0].done = true; s.hands[0].res = win > bet ? 'bj' : win === bet ? 'push' : 'lose';
        settle(uid, 'blackjack', bet, win);
        return { ...bjView(s, true), win, bet, blackjack: isBJ(p) };
      }
      return bjNext(uid, s);
    }
    if (m.a === 'state') { const s = getState(uid, 'blackjack'); return s ? bjView(s, false) : { none: true }; }
    const s = need(getState(uid, 'blackjack'));
    const hd = s.hands[s.cur];
    if (m.a === 'hit') {
      hd.cards.push(s.shoe.pop());
      if (bjTotal(hd.cards).t >= 21) hd.done = true;
    } else if (m.a === 'stand') hd.done = true;
    else if (m.a === 'double') {
      if (hd.cards.length !== 2) throw new Error('Удвоить можно только на двух картах');
      take(uid, 'blackjack', hd.bet);
      hd.bet *= 2; hd.cards.push(s.shoe.pop()); hd.done = true;
    } else if (m.a === 'split') {
      if (!bjView(s, false).canSplit) throw new Error('Разделить можно только пару');
      take(uid, 'blackjack', hd.bet);
      const [a, b] = hd.cards;
      const aces = a >> 2 === 12;
      s.hands = [{ cards: [a, s.shoe.pop()], bet: hd.bet, done: aces }, { cards: [b, s.shoe.pop()], bet: hd.bet, done: aces }];
      for (const x of s.hands) if (bjTotal(x.cards).t === 21) x.done = true;
    } else throw new Error('Неизвестный ход');
    return bjNext(uid, s);
  });
}

// ==================== 3. Слоты (3×3, 5 линий) ====================
export const SLOT_SYMS = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '7️⃣', '💎'];
const SLOT_W = [30, 24, 20, 14, 8, 5, 2.5, 1];
export const SLOT_PAY = [10, 17, 25, 42, 100, 250, 1000, 4000]; // три в линию, × ставку на линию
export const SLOT_CHERRY2 = 2.5; // две вишни слева
export const SLOT_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 4, 8], [6, 4, 2]]; // клетки 0..8 по строкам
const SLOT_SUM = SLOT_W.reduce((a, b) => a + b, 0);
function slotSym() { let x = rnd() * SLOT_SUM; for (let i = 0; i < SLOT_W.length; i++) { x -= SLOT_W[i]; if (x < 0) return i; } return 0; }
export function slotsRtp() { // точное ожидание на линию (клетки независимы)
  const p = SLOT_W.map((w) => w / SLOT_SUM);
  return p.reduce((s, pi, i) => s + pi ** 3 * SLOT_PAY[i], 0) + p[0] ** 2 * (1 - p[0]) * SLOT_CHERRY2;
}
function slots(uid, m) {
  return tx(() => {
    const bet = take(uid, 'slots', m.bet);
    const grid = Array.from({ length: 9 }, slotSym);
    const lb = bet / SLOT_LINES.length;
    const lines = [];
    let win = 0;
    SLOT_LINES.forEach((L, i) => {
      const [a, b, c] = L.map((k) => grid[k]);
      const x = a === b && b === c ? SLOT_PAY[a] : a === 0 && b === 0 ? SLOT_CHERRY2 : 0;
      if (x) { lines.push({ i, x }); win += lb * x; }
    });
    win = settle(uid, 'slots', bet, win);
    return { grid, lines, win, bet };
  });
}

// ==================== 4. Кости (больше / меньше числа) ====================
function dice(uid, m) {
  const target = Number(m.target), over = !!m.over;
  if (!Number.isInteger(target) || target < 2 || target > 98) throw new Error('Число — от 2 до 98');
  const chance = over ? 100 - target : target;
  if (chance > 97) throw new Error('Шанс — не больше 97%');
  const mult = fl2(98 / chance);
  return tx(() => {
    const bet = take(uid, 'dice', m.bet);
    const roll = randomInt(0, 10000) / 100;
    const ok = over ? roll >= target : roll < target;
    const win = settle(uid, 'dice', bet, ok ? bet * mult : 0);
    return { roll, ok, mult, chance, win, bet };
  });
}

// ==================== 5. Краш (множитель растёт, забери до взрыва) ====================
// множитель = e^(A·t + B·t²), t в мс: скорость растёт со временем.
// 5 с → 2.2×, 10 с → 7.4×, 13 с → 18×, 20 с → 270×, ~22 с → 1000×
export const CRASH_A = 0.00012, CRASH_B = 8e-9;
const crashLn = (ms) => CRASH_A * ms + CRASH_B * ms * ms;
export const crashAt = (ms) => fl2(Math.exp(crashLn(Math.max(0, ms))));
const crashTime = (x) => (-CRASH_A + Math.sqrt(CRASH_A ** 2 + 4 * CRASH_B * Math.log(x))) / (2 * CRASH_B);
const crashTimers = new Map();
function crashResolve(uid, s, now) { // авто-вывод или взрыв, если время пришло
  const tA = s.auto && s.auto < s.crash ? s.start + crashTime(s.auto) : Infinity;
  const tC = s.start + crashTime(s.crash);
  if (now >= tA) return crashEnd(uid, s, s.auto);
  if (now >= tC) return crashEnd(uid, s, 0);
  return null;
}
function crashEnd(uid, s, x) {
  clearTimeout(crashTimers.get(uid)); crashTimers.delete(uid);
  delState(uid, 'crash');
  const win = settle(uid, 'crash', s.bet, x ? s.bet * x : 0);
  return { over: true, crash: s.crash, cashed: x || null, win, bet: s.bet };
}
function crashArm(uid, s) {
  const tA = s.auto && s.auto < s.crash ? s.start + crashTime(s.auto) : Infinity;
  const at = Math.min(tA, s.start + crashTime(s.crash));
  clearTimeout(crashTimers.get(uid));
  crashTimers.set(uid, setTimeout(() => {
    try {
      const r = tx(() => { const cur = getState(uid, 'crash'); return cur && cur.start === s.start ? crashResolve(uid, cur, Date.now() + 5) : null; });
      if (r) notify(uid, { t: 'casino', game: 'crash', push: true, ...r });
    } catch {}
  }, Math.max(0, at - Date.now()) + 5));
}
function crash(uid, m) {
  return tx(() => {
    const now = Date.now();
    let s = getState(uid, 'crash');
    if (s) { const r = crashResolve(uid, s, now); if (r) { if (m.a === 'state' || m.a === 'cashout') return r; s = null; } }
    if (m.a === 'state') return s ? { live: true, start: s.start, bet: s.bet, auto: s.auto || null } : { none: true };
    if (m.a === 'start') {
      if (s) throw new Error('Раунд уже идёт');
      const bet = take(uid, 'crash', m.bet);
      const auto = m.auto ? Number(m.auto) : null;
      if (auto != null && !(auto >= 1.01 && auto <= 1000)) throw new Error('Авто-вывод — от 1.01× до 1000×');
      const r = rnd();
      // шанс дожить до ×x = 0.97 / x (отдача 97% на любой цели); всё, что ниже ×1.08, — взрыв сразу (≈10% раундов)
      let cr = Math.min(1000, fl2(0.97 / (1 - r)));
      if (cr < 1.08) cr = 1;
      s = { bet, start: now, crash: cr, auto: auto ? fl2(auto) : null };
      if (cr <= 1) return crashEnd(uid, s, 0); // взрыв сразу
      setState(uid, 'crash', s);
      crashArm(uid, s);
      return { live: true, start: s.start, bet, auto: s.auto };
    }
    if (m.a === 'cashout') {
      need(s);
      const x = crashAt(now - s.start);
      if (x >= s.crash) return crashEnd(uid, s, 0);
      return crashEnd(uid, s, Math.max(1, x));
    }
    throw new Error('Неизвестный ход');
  });
}
// после перезапуска сервера — снова завести таймеры раундов краша
export function crashRecover() {
  for (const r of db.prepare("SELECT user_id, data FROM casino_state WHERE game = 'crash'").all()) crashArm(r.user_id, JSON.parse(r.data));
}

// ==================== 6. Мины (поле 5×5) ====================
export const minesMult = (mines, k) => { let x = 0.97; for (let i = 0; i < k; i++) x *= (25 - i) / (25 - mines - i); return fl2(x); };
function minesView(s, over) { return { mines: s.mines, opened: s.opened, mult: minesMult(s.mines, s.opened.length), next: minesMult(s.mines, s.opened.length + 1), bet: s.bet, ...(over ? { bombs: s.bombs } : {}) }; }
function mines(uid, m) {
  return tx(() => {
    if (m.a === 'start') {
      noActive(uid, 'mines');
      const n = Number(m.mines);
      if (!Number.isInteger(n) || n < 1 || n > 24) throw new Error('Мин — от 1 до 24');
      const bet = take(uid, 'mines', m.bet);
      const s = { bet, mines: n, bombs: shuffled(25).slice(0, n), opened: [] };
      setState(uid, 'mines', s);
      return minesView(s, false);
    }
    if (m.a === 'state') { const s = getState(uid, 'mines'); return s ? minesView(s, false) : { none: true }; }
    const s = need(getState(uid, 'mines'));
    if (m.a === 'open') {
      const c = Number(m.cell);
      if (!Number.isInteger(c) || c < 0 || c > 24) throw new Error('Нет такой клетки');
      if (s.opened.includes(c)) throw new Error('Клетка уже открыта');
      if (s.bombs.includes(c)) { delState(uid, 'mines'); settle(uid, 'mines', s.bet, 0); return { ...minesView(s, true), boom: c, over: true, win: 0 }; }
      s.opened.push(c);
      if (s.opened.length === 25 - s.mines) { delState(uid, 'mines'); const win = settle(uid, 'mines', s.bet, s.bet * minesMult(s.mines, s.opened.length)); return { ...minesView(s, true), over: true, win }; }
      setState(uid, 'mines', s);
      return minesView(s, false);
    }
    if (m.a === 'cashout') {
      if (!s.opened.length) throw new Error('Открой хотя бы одну клетку');
      delState(uid, 'mines');
      const win = settle(uid, 'mines', s.bet, s.bet * minesMult(s.mines, s.opened.length));
      return { ...minesView(s, true), over: true, win };
    }
    throw new Error('Неизвестный ход');
  });
}

// ==================== 7. Плинко (12 рядов, три уровня риска) ====================
export const PLINKO = {
  low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
  mid: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
  high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
};
export function plinkoRtp(risk) { let s = 0; const n = 12; let c = 1; for (let k = 0; k <= n; k++) { s += (c / 2 ** n) * PLINKO[risk][k]; c = (c * (n - k)) / (k + 1); } return s; }
function plinko(uid, m) {
  const risk = PLINKO[m.risk] ? m.risk : 'low';
  return tx(() => {
    const bet = take(uid, 'plinko', m.bet);
    const path = Array.from({ length: 12 }, () => randomInt(0, 2));
    const slot = path.reduce((a, b) => a + b, 0);
    const mult = PLINKO[risk][slot];
    const win = settle(uid, 'plinko', bet, bet * mult);
    return { path, slot, mult, risk, win, bet };
  });
}

// ==================== 8. Монетка ====================
function coin(uid, m) {
  if (!['h', 't'].includes(m.side)) throw new Error('Выбери орёл или решку');
  return tx(() => {
    const bet = take(uid, 'coin', m.bet);
    const side = randomInt(0, 2) ? 'h' : 't';
    const win = settle(uid, 'coin', bet, side === m.side ? bet * 1.96 : 0);
    return { side, ok: side === m.side, win, bet };
  });
}

// ==================== 9. Колесо фортуны (30 секторов) ====================
export const WHEEL = [0, 1.5, 0, 2, 0, 1.5, 0, 3, 0, 1.5, 0, 2, 0, 0, 5, 1.5, 0, 2, 0, 1.5, 0, 3, 0, 1.5, 0, 2, 0, 1.5, 0, 0]; // отдача 98,3%
function wheel(uid, m) {
  return tx(() => {
    const bet = take(uid, 'wheel', m.bet);
    const i = randomInt(0, WHEEL.length);
    const win = settle(uid, 'wheel', bet, bet * WHEEL[i]);
    return { i, mult: WHEEL[i], win, bet };
  });
}

// ==================== 10. Баккара ====================
const bacVal = (c) => { const r = c >> 2; return r === 12 ? 1 : r >= 8 ? 0 : r + 2; };
const bacTot = (cs) => cs.reduce((a, c) => a + bacVal(c), 0) % 10;
export function baccaratDeal(sh) {
  const p = [sh.pop(), sh.pop()], b = [sh.pop(), sh.pop()];
  let pt = bacTot(p), bt = bacTot(b);
  if (pt < 8 && bt < 8) { // натуральная 8/9 — без третьих карт
    let p3 = null;
    if (pt <= 5) { p3 = sh.pop(); p.push(p3); }
    const v = p3 == null ? null : bacVal(p3);
    const draw = p3 == null ? bt <= 5 : bt <= 2 || (bt === 3 && v !== 8) || (bt === 4 && v >= 2 && v <= 7) || (bt === 5 && v >= 4 && v <= 7) || (bt === 6 && (v === 6 || v === 7));
    if (draw) b.push(sh.pop());
    pt = bacTot(p); bt = bacTot(b);
  }
  return { p, b, pt, bt, w: pt > bt ? 'p' : bt > pt ? 'b' : 't' };
}
function baccarat(uid, m) {
  const bets = { p: Number(m.player) || 0, b: Number(m.banker) || 0, t: Number(m.tie) || 0 }; // не «t» — это тип сообщения
  for (const k of 'pbt') if (bets[k]) checkBet(bets[k]);
  const total = bets.p + bets.b + bets.t;
  if (!total) throw new Error('Поставь на игрока, банкира или ничью');
  return tx(() => {
    take(uid, 'baccarat', total);
    const r = baccaratDeal(shoe(8));
    const win = r.w === 't' ? bets.t * 9 + bets.p + bets.b : r.w === 'p' ? bets.p * 2 : bets.b * 1.95;
    settle(uid, 'baccarat', total, win);
    return { ...r, win: Math.floor(win), bet: total };
  });
}

// ==================== 11. Хай-лоу (выше или ниже карты) ====================
// «выше или равно» / «ниже или равно»; на тузе: «такой же» / «ниже», на двойке: «такой же» / «выше» — чтобы не было ставки без риска
export const hlWins = (r, dir, nr) => (r === 12 ? (dir === 'hi' ? nr === 12 : nr < 12) : r === 0 ? (dir === 'lo' ? nr === 0 : nr > 0) : dir === 'hi' ? nr >= r : nr <= r);
const hlP = (r, dir) => Array.from({ length: 13 }, (_, nr) => hlWins(r, dir, nr)).filter(Boolean).length / 13;
export const hlStep = (r, dir) => fl2(0.98 / hlP(r, dir));
function hlView(s) { const r = s.card >> 2; return { card: s.card, mult: s.mult, steps: s.steps, hist: s.hist, bet: s.bet, hi: hlStep(r, 'hi'), lo: hlStep(r, 'lo') }; }
function hilo(uid, m) {
  return tx(() => {
    if (m.a === 'start') {
      noActive(uid, 'hilo');
      const bet = take(uid, 'hilo', m.bet);
      const s = { bet, card: randomInt(0, 52), mult: 1, steps: 0, hist: [] };
      setState(uid, 'hilo', s);
      return hlView(s);
    }
    if (m.a === 'state') { const s = getState(uid, 'hilo'); return s ? hlView(s) : { none: true }; }
    const s = need(getState(uid, 'hilo'));
    if (m.a === 'skip') { if (s.hist.length >= 60) throw new Error('Хватит пропусков'); s.hist.push({ card: s.card, skip: true }); s.card = randomInt(0, 52); setState(uid, 'hilo', s); return hlView(s); }
    if (m.a === 'hi' || m.a === 'lo') {
      const r = s.card >> 2, next = randomInt(0, 52), nr = next >> 2;
      const ok = hlWins(r, m.a, nr);
      s.hist.push({ card: s.card, dir: m.a, ok });
      if (!ok) { delState(uid, 'hilo'); settle(uid, 'hilo', s.bet, 0); return { ...hlView({ ...s, card: next }), over: true, win: 0 }; }
      s.mult = fl2(s.mult * hlStep(r, m.a)); s.steps++; s.card = next;
      if (s.mult >= 10000) { delState(uid, 'hilo'); const win = settle(uid, 'hilo', s.bet, s.bet * s.mult); return { ...hlView(s), over: true, win }; }
      setState(uid, 'hilo', s);
      return hlView(s);
    }
    if (m.a === 'cashout') {
      if (!s.steps) throw new Error('Угадай хотя бы раз');
      delState(uid, 'hilo');
      const win = settle(uid, 'hilo', s.bet, s.bet * s.mult);
      return { ...hlView(s), over: true, win };
    }
    throw new Error('Неизвестный ход');
  });
}

// ==================== 12. Кено (40 чисел, 10 выпадает, выбираешь 1–10) ====================
const C = (n, k) => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };
const kenoP = (k, h) => (C(k, h) * C(40 - k, 10 - h)) / C(40, 10);
export const KENO = Array.from({ length: 11 }, (_, k) => {
  if (!k) return [];
  const minHit = Math.max(1, Math.ceil(k * 0.45));
  const w = Array.from({ length: k + 1 }, (_, h) => (h >= minHit && kenoP(k, h) > 0 ? kenoP(k, h) ** -0.6 : 0));
  // подбираем масштаб: отдача 95%, потолок выигрыша 10 000×
  let c = 1;
  for (let it = 0; it < 60; it++) { const ev = w.reduce((s, x, h) => s + Math.min(10000, x * c) * kenoP(k, h), 0); c *= 0.95 / ev; }
  return w.map((x) => (x ? Math.max(0.5, Math.min(10000, Math.round(x * c * 10) / 10)) : 0));
});
export const kenoRtp = (k) => KENO[k].reduce((s, x, h) => s + x * kenoP(k, h), 0);
function keno(uid, m) {
  const picks = [...new Set((m.picks || []).map(Number))];
  if (!picks.length || picks.length > 10 || picks.length !== (m.picks || []).length || picks.some((x) => !Number.isInteger(x) || x < 1 || x > 40)) throw new Error('Выбери от 1 до 10 разных чисел');
  return tx(() => {
    const bet = take(uid, 'keno', m.bet);
    const drawn = shuffled(40).slice(0, 10).map((x) => x + 1);
    const hits = picks.filter((x) => drawn.includes(x)).length;
    const mult = KENO[picks.length][hits];
    const win = settle(uid, 'keno', bet, bet * mult);
    return { drawn, hits, mult, win, bet, table: KENO[picks.length] };
  });
}

// ==================== 13. Видео-покер (валеты и старше) ====================
export const VP_PAY = { royal: 250, sflush: 50, quads: 25, full: 9, flush: 6, straight: 4, trips: 3, twopair: 2, jacks: 1 };
export const VP_NAMES = { royal: 'Флеш-рояль', sflush: 'Стрит-флеш', quads: 'Каре', full: 'Фулл-хаус', flush: 'Флеш', straight: 'Стрит', trips: 'Сет', twopair: 'Две пары', jacks: 'Пара валетов или выше' };
export function vpRank(cards) {
  const rs = cards.map((c) => c >> 2), cnt = {};
  for (const r of rs) cnt[r] = (cnt[r] || 0) + 1;
  const counts = Object.values(cnt).sort((a, b) => b - a);
  const flush = cards.every((c) => (c & 3) === (cards[0] & 3));
  const u = [...new Set(rs)].sort((a, b) => a - b);
  const straight = u.length === 5 && (u[4] - u[0] === 4 || u.join() === '0,1,2,3,12');
  if (straight && flush) return u[0] === 8 ? 'royal' : 'sflush';
  if (counts[0] === 4) return 'quads';
  if (counts[0] === 3 && counts[1] === 2) return 'full';
  if (flush) return 'flush';
  if (straight) return 'straight';
  if (counts[0] === 3) return 'trips';
  if (counts[0] === 2 && counts[1] === 2) return 'twopair';
  if (counts[0] === 2 && Object.entries(cnt).some(([r, n]) => n === 2 && Number(r) >= 9)) return 'jacks';
  return null;
}
function videopoker(uid, m) {
  return tx(() => {
    if (m.a === 'deal') {
      noActive(uid, 'videopoker');
      const bet = take(uid, 'videopoker', m.bet);
      const deck = shoe(1);
      const s = { bet, hand: deck.splice(-5), deck };
      setState(uid, 'videopoker', s);
      return { hand: s.hand, rank: vpRank(s.hand), bet };
    }
    if (m.a === 'state') { const s = getState(uid, 'videopoker'); return s ? { hand: s.hand, rank: vpRank(s.hand), bet: s.bet } : { none: true }; }
    if (m.a === 'draw') {
      const s = need(getState(uid, 'videopoker'));
      const hold = Array.isArray(m.hold) ? m.hold.slice(0, 5).map(Boolean) : [];
      const hand = s.hand.map((c, i) => (hold[i] ? c : s.deck.pop()));
      const rank = vpRank(hand);
      delState(uid, 'videopoker');
      const win = settle(uid, 'videopoker', s.bet, rank ? s.bet * VP_PAY[rank] : 0);
      return { hand, rank, over: true, win, bet: s.bet };
    }
    throw new Error('Неизвестный ход');
  });
}

// ==================== 14. Башня (8 этажей, выбери безопасную клетку) ====================
export const TOWER = { easy: { cols: 4, bombs: 1 }, mid: { cols: 3, bombs: 1 }, hard: { cols: 2, bombs: 1 }, expert: { cols: 3, bombs: 2 } };
export const towerMult = (d, lvl) => (lvl ? fl2(0.97 * (TOWER[d].cols / (TOWER[d].cols - TOWER[d].bombs)) ** lvl) : 1);
function towerView(s, over) { return { diff: s.diff, cols: TOWER[s.diff].cols, lvl: s.picks.length, picks: s.picks, mult: towerMult(s.diff, s.picks.length), next: towerMult(s.diff, s.picks.length + 1), bet: s.bet, ...(over ? { bombs: s.bombs } : {}) }; }
function tower(uid, m) {
  return tx(() => {
    if (m.a === 'start') {
      noActive(uid, 'tower');
      const diff = TOWER[m.diff] ? m.diff : 'mid';
      const bet = take(uid, 'tower', m.bet);
      const T = TOWER[diff];
      const s = { bet, diff, picks: [], bombs: Array.from({ length: 8 }, () => shuffled(T.cols).slice(0, T.bombs)) };
      setState(uid, 'tower', s);
      return towerView(s, false);
    }
    if (m.a === 'state') { const s = getState(uid, 'tower'); return s ? towerView(s, false) : { none: true }; }
    const s = need(getState(uid, 'tower'));
    if (m.a === 'pick') {
      const c = Number(m.col), lvl = s.picks.length;
      if (!Number.isInteger(c) || c < 0 || c >= TOWER[s.diff].cols) throw new Error('Нет такой клетки');
      s.picks.push(c);
      if (s.bombs[lvl].includes(c)) { delState(uid, 'tower'); settle(uid, 'tower', s.bet, 0); return { ...towerView(s, true), boom: true, over: true, win: 0 }; }
      if (s.picks.length === 8) { delState(uid, 'tower'); const win = settle(uid, 'tower', s.bet, s.bet * towerMult(s.diff, 8)); return { ...towerView(s, true), over: true, win }; }
      setState(uid, 'tower', s);
      return towerView(s, false);
    }
    if (m.a === 'cashout') {
      if (!s.picks.length) throw new Error('Пройди хотя бы один этаж');
      delState(uid, 'tower');
      const win = settle(uid, 'tower', s.bet, s.bet * towerMult(s.diff, s.picks.length));
      return { ...towerView(s, true), over: true, win };
    }
    throw new Error('Неизвестный ход');
  });
}

// ==================== 15. Дракон и Тигр ====================
const dtVal = (c) => { const r = c >> 2; return r === 12 ? 1 : r + 2; }; // туз — младший
function dragontiger(uid, m) {
  const bets = { d: Number(m.dragon) || 0, tg: Number(m.tiger) || 0, t: Number(m.tie) || 0 };
  for (const k of ['d', 'tg', 't']) if (bets[k]) checkBet(bets[k]);
  const total = bets.d + bets.tg + bets.t;
  if (!total) throw new Error('Поставь на дракона, тигра или ничью');
  return tx(() => {
    take(uid, 'dragontiger', total);
    const sh = shoe(8);
    const d = sh.pop(), tg = sh.pop();
    const w = dtVal(d) > dtVal(tg) ? 'd' : dtVal(tg) > dtVal(d) ? 'tg' : 't';
    const win = w === 't' ? bets.t * 12 + (bets.d + bets.tg) / 2 : bets[w] * 2;
    settle(uid, 'dragontiger', total, win);
    return { d, tg, w, win: Math.floor(win), bet: total };
  });
}

// ==================== вход ====================
const PLAY = { roulette, blackjack, slots, dice, crash, mines, plinko, coin, wheel, baccarat, hilo, keno, videopoker, tower, dragontiger };
export function play(uid, m) {
  const fn = PLAY[m.game];
  if (!fn) throw new Error('Нет такой игры');
  return { game: m.game, ...fn(uid, m) };
}

export function info(uid) {
  const hist = db.prepare('SELECT game, bet, win, at FROM casino_hist WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(uid);
  const day = Date.now() - 86400000;
  const big = db.prepare(`SELECT u.name, h.game, h.bet, h.win FROM casino_hist h JOIN users u ON u.id = h.user_id
    WHERE h.at > ? AND h.win >= h.bet * 5 AND ${NOT_ADMIN.replaceAll('id', 'u.id')} ORDER BY h.win DESC LIMIT 10`).all(day);
  const my = db.prepare('SELECT game, COUNT(*) AS n, SUM(bet) AS bet, SUM(win) AS win, MAX(win) AS best FROM casino_hist WHERE user_id = ? GROUP BY game').all(uid);
  const active = db.prepare('SELECT game FROM casino_state WHERE user_id = ?').all(uid).map((r) => r.game);
  return { hist, big, my, active };
}
