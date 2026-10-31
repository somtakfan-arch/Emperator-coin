// Обучение 2: курс из 30 шагов и сертификаты, тренажёр аутов, задача дня, песочница с шансами,
// разбор чужих раздач, ошибки недели, мгновенный тренер и челлендж «10 правильных решений».
import { db, credit } from './db.js';
import { config } from './config.js';
import { newDeck, shuffle, evaluate, describeHand, handCategory } from '../core/cards.js';
import { outs } from './game/tablefx.js';
import { knownEquity } from './game/tablefx.js';

db.exec(`
CREATE TABLE IF NOT EXISTS course (user_id INTEGER NOT NULL, step TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, step));
CREATE TABLE IF NOT EXISTS learn_daily (user_id INTEGER NOT NULL, day TEXT NOT NULL, what TEXT NOT NULL, PRIMARY KEY (user_id, day, what));
`);
const dayKey = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const seed = (s) => { let x = 0; for (const ch of String(s)) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; };

// ---------- 151 курс из 30 шагов, 160 сертификаты, 170 уровни знаний ----------
export const COURSE = [
  ...['Что такое покер', 'Карты и колода', 'Как проходит раздача', 'Блайнды и баттон', 'Действия', 'Комбинации', 'Сравнение рук', 'Банк и побочный банк', 'Советы новичку', 'Как играть в приложении', 'Словарик']
    .map((t, i) => ({ id: `t${i}`, kind: 'tutorial', n: i, title: t })),
  ...['Сильная рука', 'Когда сбрасывать', 'Дро', 'Олл-ин', 'Позиция', 'Блеф', 'Шансы банка', 'Кикер', 'Слоуплей', 'Маленькая пара', 'Короткий стек', 'Продолженная ставка', 'Повторный рейз', 'Когда сбросить дро']
    .map((t, i) => ({ id: `l${i}`, kind: 'lesson', n: i, title: t })),
  { id: 'q_outs', kind: 'trainer', title: 'Тренажёр аутов' }, { id: 'q_odds', kind: 'trainer', title: 'Тренажёр шансов банка' },
  { id: 'q_pre', kind: 'trainer', title: 'Тренажёр префлопа' }, { id: 'q_push', kind: 'trainer', title: 'Олл-ин или фолд (короткий стек)' },
  { id: 'exam', kind: 'exam', title: 'Экзамен' },
];
export const LEVELS = [[0, 'Новичок'], [8, 'Ученик'], [16, 'Игрок'], [24, 'Знаток'], [30, 'Мастер']];
export function markStep(uid, step) {
  if (!COURSE.some((c) => c.id === step)) throw new Error('Нет такого шага');
  db.prepare('INSERT OR IGNORE INTO course (user_id, step, at) VALUES (?, ?, ?)').run(uid, step, Date.now());
}
export function courseView(uid) {
  const done = new Set(db.prepare('SELECT step FROM course WHERE user_id = ?').all(uid).map((r) => r.step));
  const n = done.size;
  const level = [...LEVELS].reverse().find(([k]) => n >= k)[1];
  const certs = [[10, 'Бронзовый сертификат'], [20, 'Серебряный сертификат'], [30, 'Золотой сертификат']].filter(([k]) => n >= k).map(([, t]) => t);
  return { steps: COURSE.map((c) => ({ ...c, done: done.has(c.id) })), done: n, total: COURSE.length, level, certs };
}

// ---------- 154 тренажёр аутов ----------
export function outsQuestion() {
  for (;;) {
    const d = shuffle(newDeck());
    const hole = d.slice(0, 2), board = d.slice(2, 5);
    const o = outs(hole, board);
    if (o.length >= 4 && o.length <= 15) {
      const right = o.length;
      const opts = [...new Set([right, right + 2, Math.max(1, right - 2), right + 4])].sort((a, b) => a - b);
      return { hole, board, opts, right, hand: describeHand(evaluate(hole.concat(board))) };
    }
  }
}

// ---------- 157 задача дня ----------
const PROBLEMS = [
  { q: 'У тебя A♠ K♠, флоп K♦ 7♣ 2♥. Соперник чекнул. Банк 100.', opts: ['Чек', 'Ставка 60', 'Олл-ин'], ok: 1, why: 'Топ-пара с лучшим кикером — ставь за ценой, но не олл-ин: слабые руки сбросят.' },
  { q: 'У тебя 7♥ 6♥, флоп A♥ K♥ 2♣. Соперник ставит размер банка.', opts: ['Фолд', 'Колл', 'Рейз'], ok: 1, why: 'Флеш-дро: 9 аутов (~35% к риверу). Ставка в банк требует 33% — колл на грани выгодного.' },
  { q: 'Короткий стек 6 ББ, у тебя A♣ 8♦, все сбросили до тебя на баттоне.', opts: ['Фолд', 'Колл', 'Олл-ин'], ok: 2, why: 'С 6 ББ играют «олл-ин или фолд». A8 на баттоне — уверенный олл-ин.' },
  { q: 'Ривер. У тебя пара девяток, на столе K Q J 10 3 разных мастей. Соперник ставит олл-ин.', opts: ['Фолд', 'Колл'], ok: 0, why: 'Любой туз или девятка у соперника дают стрит. Пара девяток здесь почти ничего не стоит.' },
  { q: 'У тебя Q♠ Q♣, рейз соперника и 3-бет другого игрока до тебя.', opts: ['Фолд', 'Колл', '4-бет'], ok: 2, why: 'Дамы — третья по силе рука. Против двух ставок лучше переповысить и отсечь всё лишнее.' },
  { q: 'У тебя 2♦ 2♠ в ранней позиции, стеки 100 ББ.', opts: ['Фолд', 'Колл', 'Рейз'], ok: 0, why: 'Маленькая пара с ранней позиции часто попадает под рейзы — проще сбросить, особенно новичку.' },
  { q: 'Флоп 8♠ 8♦ 3♣, у тебя A♥ A♦. Соперник чекнул.', opts: ['Чек', 'Ставка 1/3 банка', 'Олл-ин'], ok: 1, why: 'Сухой стол и оверпара — маленькая ставка: заплатят и слабые руки.' },
  { q: 'У тебя K♥ J♥, тёрн даёт тебе стрит до туза… нет: стол A Q 10 4, ты собрал стрит до туза. Соперник ставит.', opts: ['Фолд', 'Колл', 'Рейз'], ok: 2, why: 'Натсовый стрит (лучшая возможная рука) — повышай, растим банк.' },
];
export function dailyProblem(uid) {
  const p = PROBLEMS[seed(dayKey()) % PROBLEMS.length];
  const solved = !!db.prepare("SELECT 1 FROM learn_daily WHERE user_id = ? AND day = ? AND what = 'problem'").get(uid, dayKey());
  return { q: p.q, opts: p.opts, solved, why: solved ? p.why : null };
}
export function answerProblem(uid, opt) {
  const p = PROBLEMS[seed(dayKey()) % PROBLEMS.length];
  const ok = Number(opt) === p.ok;
  const first = ok && db.prepare("INSERT OR IGNORE INTO learn_daily (user_id, day, what) VALUES (?, ?, 'problem')").run(uid, dayKey()).changes > 0;
  if (first && config.progressRewards) credit(uid, 150, 'daily_problem');
  return { ok, why: p.why, right: p.opts[p.ok], chips: first ? 150 : 0 };
}

// ---------- 164 песочница: выбери карты — комбинация и шансы против случайной руки ----------
export function sandbox(hole, board) {
  hole = (hole || []).map(Number); board = (board || []).map(Number);
  const all = [...hole, ...board];
  if (hole.length !== 2 || board.length > 5 || new Set(all).size !== all.length || all.some((c) => !(c >= 0 && c < 52))) throw new Error('Выбери 2 свои карты и до 5 на стол, без повторов');
  // шанс против случайной руки: перебираем случайные руки соперника
  const rest = newDeck().filter((c) => !all.includes(c));
  let win = 0, tie = 0, n = 0;
  for (let i = 0; i < 400; i++) {
    const d = shuffle(rest.slice());
    const opp = d.slice(0, 2);
    const full = board.concat(d.slice(2, 2 + 5 - board.length));
    const a = evaluate(hole.concat(full)), b = evaluate(opp.concat(full));
    if (a > b) win++; else if (a === b) tie++;
    n++;
  }
  const res = { equity: Math.round(((win + tie / 2) / n) * 100) };
  if (board.length >= 3) { res.hand = describeHand(evaluate(hole.concat(board))); res.outs = board.length < 5 ? outs(hole, board).length : 0; }
  return res;
}

// ---------- 158 разбор чужих раздач: крупные раздачи сообщества (без имён) ----------
export function communityHands() {
  return db.prepare('SELECT id, at, data FROM replays WHERE at > ? ORDER BY at DESC LIMIT 400').all(Date.now() - 86400000)
    .map((r) => { const d = JSON.parse(r.data); return { id: r.id, at: r.at, net: d.net, bb: d.bb, hand: d.hand, title: d.title, big: Math.abs(d.net) / Math.max(1, d.bb), hasDec: !!d.dec?.length }; })
    .filter((r) => r.hasDec && r.big >= 20).sort((a, b) => b.big - a.big).slice(0, 15)
    .map(({ id, at, net, hand, title }) => ({ id, at, net, hand, title: title.replace(/Стол .+? ·/, 'Стол ·') }));
}

// ---------- 159 ошибки недели: разбор последних раздач с решениями ----------
export function weekMistakes(uid, reviewFn) {
  const rows = db.prepare('SELECT id, data FROM replays WHERE user_id = ? ORDER BY at DESC LIMIT 12').all(uid);
  const out = [];
  for (const r of rows) {
    const d = JSON.parse(r.data);
    if (!d.dec?.length) continue;
    for (const s of reviewFn(uid, d.dec, d.raw)) if (s.verdict === 'bad') out.push({ id: r.id, text: s.text, best: s.best });
    if (out.length >= 8) break;
  }
  return out;
}

// ---------- 169, 172 мгновенный тренер и челлендж «10 правильных решений» ----------
const streaks = new Map();
export function judge(uid, verdict) {
  const s = verdict === 'bad' ? 0 : (streaks.get(uid) || 0) + 1;
  streaks.set(uid, s);
  if (s === 10) {
    streaks.set(uid, 0);
    const first = db.prepare("INSERT OR IGNORE INTO learn_daily (user_id, day, what) VALUES (?, ?, 'ten')").run(uid, dayKey()).changes > 0;
    if (first && config.progressRewards) credit(uid, 300, 'ten_right');
    return { ten: true, chips: first ? 300 : 0 };
  }
  return { streak: s };
}

// ---------- 171 вечерний совет от Учителя ----------
const TIPS = [
  'Играй меньше рук, но агрессивнее — это база.', 'С баттона можно открывать больше рук: ты ходишь последним.', 'Не коллируй олл-ин «на удачу» — считай шансы.',
  'Маленькая пара — ради сета. Не попал — сбрасывай.', 'Ставка на ривере после пассивной игры — часто сила.', 'Записывай заметки на соперников — метки за столом.',
  'Если не понимаешь, где ты в раздаче, — ты, скорее всего, позади.', 'Блефуй против одного соперника, не против троих.',
];
export const eveningTip = () => { const h = new Date(Date.now() + 3 * 3600000).getUTCHours(); return h >= 18 && h <= 23 ? TIPS[seed(dayKey()) % TIPS.length] : null; };
export { knownEquity };
