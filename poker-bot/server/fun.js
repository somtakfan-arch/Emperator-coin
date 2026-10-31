// Весёлое: гадание дня, загадка и секретный стол, мини-игры (угадай флоп, больше-меньше,
// карточная рулетка, пазл), капсула времени, дни рождения ботов, итоги года.
import { db, tx, credit } from './db.js';
import { config, NOT_ADMIN } from './config.js';
import { newDeck, shuffle, evaluate, describeHand, handCategory } from '../core/cards.js';
import { CROWD } from '../core/crowd.js';
import { BOT_CLASSES } from '../core/bots.js';

db.exec(`
CREATE TABLE IF NOT EXISTS fun_daily (user_id INTEGER NOT NULL, day TEXT NOT NULL, game TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day, game));
CREATE TABLE IF NOT EXISTS capsules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, text TEXT NOT NULL, created INTEGER NOT NULL, open_at INTEGER NOT NULL, sent INTEGER NOT NULL DEFAULT 0);
`);
const DAY = 86400000;
const msk = () => new Date(Date.now() + 3 * 3600000);
const dayKey = () => msk().toISOString().slice(0, 10);
const seed = (s) => { let x = 0; for (const ch of String(s)) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; };
// сколько раз сегодня играл в мини-игру; награда — только первые limit раз
function bump(uid, game) {
  db.prepare('INSERT INTO fun_daily (user_id, day, game, n) VALUES (?, ?, ?, 1) ON CONFLICT (user_id, day, game) DO UPDATE SET n = n + 1').run(uid, dayKey(), game);
  return db.prepare('SELECT n FROM fun_daily WHERE user_id = ? AND day = ? AND game = ?').get(uid, dayKey(), game).n;
}
const used = (uid, game) => db.prepare('SELECT n FROM fun_daily WHERE user_id = ? AND day = ? AND game = ?').get(uid, dayKey(), game)?.n ?? 0;
const reward = (uid, chips, why) => { if (config.progressRewards && chips > 0) credit(uid, chips, 'fun', why); };

// ---------- 226 гадание дня ----------
const FORTUNES = [
  'Сегодня тузы любят тебя — но не верь первой паре.', 'Ривер принесёт то, что флоп пообещал.', 'Блефуй один раз — и пусть он будет красивым.',
  'Терпение сегодня дороже агрессии.', 'Твоя карта дня — валет. Хитрость победит силу.', 'Не гонись за флешем, если ставка больше банка.',
  'Сегодня позиция решает всё — играй с баттона.', 'Король бубен на твоей стороне.', 'Маленькие пары принесут большой сет.',
  'Соперник слабее, чем кажется. Проверь его чеком.', 'Удача любит тех, кто вовремя встаёт из-за стола.', 'День для каре. Или хотя бы для двух пар.',
  'Не спорь с олл-ином без туза.', 'Сегодня твой кикер — лучший за столом.', 'Тихий чек иногда громче рейза.',
];
export function fortune(uid) {
  const i = seed(`${uid}:${dayKey()}`);
  return { text: FORTUNES[i % FORTUNES.length], lucky: ['♠', '♥', '♦', '♣'][(i >> 4) % 4], number: ((i >> 8) % 9) + 2 };
}

// ---------- 233 загадка дня и 228 секретный стол ----------
const RIDDLES = [
  ['Пять карт подряд, а масть одна. Как она зовётся?', 'стрит-флеш'], ['Три одинаковые и две одинаковые. Что это?', 'фулл-хаус'],
  ['Самая старшая карта в колоде?', 'туз'], ['Сколько карт на столе после ривера?', '5'],
  ['Как называется ставка всех фишек?', 'олл-ин'], ['Четыре карты одного достоинства — это…', 'каре'],
  ['Третья общая карта? Нет, четвёртая. Как её зовут?', 'тёрн'], ['Обязательная ставка перед раздачей?', 'блайнд'],
];
const SECRET_WORDS = ['ТУЗПИК', 'КОРОНА', 'РИВЕР', 'БЛЕФ', 'ДЖОКЕР', 'КАРЕ', 'ФЛОП'];
export const secretPassword = () => SECRET_WORDS[seed(dayKey()) % SECRET_WORDS.length];
export function riddle(uid) {
  const r = RIDDLES[seed(dayKey()) % RIDDLES.length];
  return { q: r[0], solved: used(uid, 'riddle') > 0, password: used(uid, 'riddle') > 0 ? secretPassword() : null };
}
export function answerRiddle(uid, a) {
  const r = RIDDLES[seed(dayKey()) % RIDDLES.length];
  const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '');
  if (norm(a) !== norm(r[1])) throw new Error('Не угадал — подумай ещё');
  const first = used(uid, 'riddle') === 0;
  bump(uid, 'riddle');
  if (first) reward(uid, 100, 'riddle');
  return { password: secretPassword(), chips: first ? 100 : 0 };
}

// ---------- 229 угадай флоп ----------
const FLOP_BETS = { ace: 'На флопе будет туз', red: 'На флопе больше красных', pair: 'На флопе будет пара', high: 'Старшая карта флопа — валет или выше' };
export function guessFlop(uid, pick) {
  if (!FLOP_BETS[pick]) throw new Error('Выбери вариант');
  const n = bump(uid, 'flop');
  const flop = shuffle(newDeck()).slice(0, 3);
  const ranks = flop.map((c) => c >> 2);
  const ok = { ace: ranks.includes(12), red: flop.filter((c) => (c & 3) === 1 || (c & 3) === 2).length >= 2, pair: new Set(ranks).size < 3, high: Math.max(...ranks) >= 9 }[pick];
  const chips = ok && n <= 5 ? { ace: 150, red: 30, pair: 120, high: 40 }[pick] : 0;
  reward(uid, chips, 'guess_flop');
  return { flop, ok, chips, left: Math.max(0, 5 - n) };
}

// ---------- 230 больше-меньше ----------
const hl = new Map(); // uid -> { card, streak, deck }
export function hlStart(uid) {
  const deck = shuffle(newDeck());
  const s = { deck, card: deck.pop(), streak: 0 };
  hl.set(uid, s);
  return { card: s.card, streak: 0 };
}
export function hlGuess(uid, dir) {
  const s = hl.get(uid);
  if (!s) throw new Error('Начни игру заново');
  const next = s.deck.pop();
  const a = s.card >> 2, b = next >> 2;
  const ok = b === a ? false : dir === 'up' ? b > a : b < a;
  let chips = 0;
  if (ok) {
    s.streak++;
    if (s.streak === 5 && bump(uid, 'hl') <= 3) { chips = 200; reward(uid, chips, 'higher_lower'); }
  } else s.streak = 0;
  s.card = next;
  if (!s.deck.length) hl.delete(uid);
  return { card: next, ok, streak: s.streak, chips };
}

// ---------- 231 карточная рулетка (раз в день) ----------
export function cardRoulette(uid) {
  if (used(uid, 'roulette')) throw new Error('Рулетку уже крутил — приходи завтра');
  bump(uid, 'roulette');
  const card = shuffle(newDeck())[0];
  const r = card >> 2;
  const chips = r === 12 ? 1000 : r >= 9 ? 300 : r >= 6 ? 100 : 50;
  reward(uid, chips, 'card_roulette');
  return { card, chips };
}

// ---------- 232 пазл: из 7 карт выбери лучшие 5 ----------
const puzzles = new Map();
export function puzzleNew(uid) {
  let cards;
  do cards = shuffle(newDeck()).slice(0, 7); while (handCategory(evaluate(cards)) < 2); // хотя бы две пары
  puzzles.set(uid, cards);
  return { cards };
}
export function puzzleCheck(uid, pick) {
  const cards = puzzles.get(uid);
  if (!cards) throw new Error('Начни новый пазл');
  pick = (pick || []).map(Number);
  if (pick.length !== 5 || new Set(pick).size !== 5 || !pick.every((c) => cards.includes(c))) throw new Error('Выбери ровно 5 карт');
  const best = evaluate(cards);
  const mine = evaluate(pick);
  const ok = mine === best;
  let chips = 0;
  if (ok) { puzzles.delete(uid); if (bump(uid, 'puzzle') <= 5) { chips = 60; reward(uid, chips, 'puzzle'); } }
  return { ok, chips, best: describeHand(best), mine: describeHand(mine) };
}

// ---------- 249 капсула времени ----------
export function capsuleCreate(uid, text, days = 30) {
  text = String(text || '').trim().slice(0, 500);
  if (text.length < 3) throw new Error('Напиши хоть пару слов');
  if (db.prepare('SELECT COUNT(*) AS n FROM capsules WHERE user_id = ? AND sent = 0').get(uid).n >= 3) throw new Error('Можно держать до 3 капсул');
  days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  db.prepare('INSERT INTO capsules (user_id, text, created, open_at) VALUES (?, ?, ?, ?)').run(uid, text, Date.now(), Date.now() + days * DAY);
}
export const capsulesOf = (uid) => db.prepare('SELECT id, created, open_at, sent, CASE WHEN sent = 1 THEN text ELSE NULL END AS text FROM capsules WHERE user_id = ? ORDER BY created DESC LIMIT 10').all(uid);
export function dueCapsules() {
  const list = db.prepare('SELECT * FROM capsules WHERE sent = 0 AND open_at <= ?').all(Date.now());
  for (const c of list) db.prepare('UPDATE capsules SET sent = 1 WHERE id = ?').run(c.id);
  return list;
}

// ---------- 243 дни рождения ботов ----------
const ALL_BOTS = () => [...BOT_CLASSES.map((C) => new C({}).name), ...CROWD.map((c) => c.name)];
const doy = () => { const d = msk(); return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / DAY); };
export const isBirthday = (name) => (seed(name) % 365) + 1 === doy();
export const birthdaysToday = () => ALL_BOTS().filter(isBirthday);

// ---------- 247 самые невезучие недели (бэд-биты) и 248 статуя чемпиона ----------
export function unluckyTop() {
  return db.prepare(`SELECT u.name, COUNT(*) AS v FROM hand_stats h JOIN users u ON u.id = h.user_id
    WHERE h.at > ? AND h.alleq > 50 AND h.won = 0 AND ${NOT_ADMIN.replace('id', 'u.id')} GROUP BY h.user_id ORDER BY v DESC LIMIT 10`).all(Date.now() - 7 * DAY);
}

// ---------- 250 итоги года ----------
export function yearRecap(uid) {
  const from = Date.UTC(msk().getUTCFullYear(), 0, 1) - 3 * 3600000;
  const r = db.prepare('SELECT COUNT(*) AS hands, COALESCE(SUM(won), 0) AS won, COALESCE(MAX(net), 0) AS best, COALESCE(SUM(sd), 0) AS sd FROM hand_stats WHERE user_id = ? AND at >= ?').get(uid, from);
  const fav = db.prepare('SELECT bot, hands FROM bot_vs WHERE user_id = ? ORDER BY hands DESC LIMIT 1').get(uid);
  const tours = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(place = 1), 0) AS w FROM tour_hist WHERE user_id = ? AND at >= ?').get(uid, from);
  return { year: msk().getUTCFullYear(), ...r, favBot: fav?.bot || null, tours: tours.n, tourWins: tours.w };
}
