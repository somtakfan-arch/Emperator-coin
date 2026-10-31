// Подробная статистика: каждая раздача, история Эло и турниров, сравнения, рекорды сервера.
import { db, getUser } from './db.js';
import { NOT_ADMIN } from './config.js';
import { ACHIEVEMENTS } from './progress.js';

db.exec(`
CREATE TABLE IF NOT EXISTS hand_stats (
  user_id INTEGER NOT NULL, at INTEGER NOT NULL, pos TEXT, h1 INTEGER, h2 INTEGER, vpip INTEGER, pfr INTEGER, aggr TEXT,
  net INTEGER, won INTEGER, sd INTEGER, cat INTEGER, alleq INTEGER, foldcost INTEGER, rcall INTEGER, bluff INTEGER, bb INTEGER, kind TEXT
);
CREATE INDEX IF NOT EXISTS hand_stats_user ON hand_stats (user_id, at);
CREATE TABLE IF NOT EXISTS rating_hist (user_id INTEGER NOT NULL, at INTEGER NOT NULL, rating REAL NOT NULL);
CREATE INDEX IF NOT EXISTS rating_hist_user ON rating_hist (user_id, at);
CREATE TABLE IF NOT EXISTS tour_hist (user_id INTEGER NOT NULL, at INTEGER NOT NULL, name TEXT, place INTEGER, size INTEGER, prize INTEGER, buyin INTEGER, solo INTEGER);
CREATE TABLE IF NOT EXISTS vs_human (user_id INTEGER NOT NULL, opp INTEGER NOT NULL, hands INTEGER NOT NULL DEFAULT 0, won INTEGER NOT NULL DEFAULT 0, net INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, opp));
`);

const DAY = 86400000;
const ins = db.prepare(`INSERT INTO hand_stats (user_id, at, pos, h1, h2, vpip, pfr, aggr, net, won, sd, cat, alleq, foldcost, rcall, bluff, bb, kind)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const vsUp = db.prepare(`INSERT INTO vs_human (user_id, opp, hands, won, net) VALUES (?, ?, 1, ?, ?)
  ON CONFLICT (user_id, opp) DO UPDATE SET hands = hands + 1, won = won + excluded.won, net = net + excluded.net`);
let lastRating = new Map();

export function recordHand(uid, r) {
  ins.run(uid, Date.now(), r.pos, r.hole[0] ?? null, r.hole[1] ?? null, r.vpip ? 1 : 0, r.pfr ? 1 : 0, JSON.stringify(r.aggr || {}),
    r.net, r.won ? 1 : 0, r.sd ? 1 : 0, r.cat, r.alleq, r.foldcost || 0, r.rcall || 0, r.bluff ? 1 : 0, r.bb, r.kind);
  for (const o of r.opps || []) vsUp.run(uid, o, r.won ? 1 : 0, r.opps.length === 1 ? r.net : 0);
  // история Эло: точка, только если рейтинг изменился
  const u = getUser(uid);
  if (u && Math.round(u.rating) !== lastRating.get(uid)) {
    lastRating.set(uid, Math.round(u.rating));
    db.prepare('INSERT INTO rating_hist (user_id, at, rating) VALUES (?, ?, ?)').run(uid, Date.now(), u.rating);
  }
  if (Math.random() < 0.01) { // чистка: раздачи — 90 дней, Эло — 60 дней
    db.prepare('DELETE FROM hand_stats WHERE at < ?').run(Date.now() - 90 * DAY);
    db.prepare('DELETE FROM rating_hist WHERE at < ?').run(Date.now() - 60 * DAY);
  }
}
export function recordTour(uid, ev) {
  if (ev.demo) return;
  db.prepare('INSERT INTO tour_hist (user_id, at, name, place, size, prize, buyin, solo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(uid, Date.now(), ev.name || 'Турнир', ev.place, ev.size, ev.prize || 0, ev.buyin || 0, ev.solo ? 1 : 0);
}

const RANKS = 'AKQJT98765432';
// класс руки: «AKs», «QJo», «77»
export function handClass(a, b) {
  if (a == null || b == null || a >= 52 || b >= 52) return null;
  const ra = a >> 2, rb = b >> 2;
  const hi = Math.max(ra, rb), lo = Math.min(ra, rb);
  const c = (r) => RANKS[12 - r];
  if (hi === lo) return c(hi) + c(lo);
  return c(hi) + c(lo) + ((a & 3) === (b & 3) ? 's' : 'o');
}

// ---------- Всё для экрана «Моя статистика» ----------
export function statsView(uid) {
  const rows = db.prepare('SELECT * FROM hand_stats WHERE user_id = ? ORDER BY at').all(uid);
  const n = rows.length;
  const pct = (x) => (n ? Math.round((x / n) * 1000) / 10 : 0);
  const bbNet = (r) => (r.bb ? r.net / r.bb : 0);
  // 51 VPIP/PFR, 69 вскрытия
  const vpip = rows.filter((r) => r.vpip).length, pfr = rows.filter((r) => r.pfr).length;
  const sd = rows.filter((r) => r.sd).length, sdWon = rows.filter((r) => r.sd && r.won).length;
  // 52 агрессия по улицам: рейзы / коллы
  const streets = { p: 'Префлоп', f: 'Флоп', t: 'Тёрн', r: 'Ривер' };
  const ag = Object.fromEntries(Object.keys(streets).map((k) => [k, [0, 0]]));
  for (const r of rows) { const a = JSON.parse(r.aggr || '{}'); for (const k in a) if (ag[k]) { ag[k][0] += a[k][0]; ag[k][1] += a[k][1]; } }
  const aggression = Object.entries(streets).map(([k, name]) => ({ name, raises: ag[k][0], calls: ag[k][1], af: ag[k][1] ? Math.round((ag[k][0] / ag[k][1]) * 10) / 10 : ag[k][0] }));
  // 53 тепловая карта и 55 стартовые руки
  const byClass = {};
  for (const r of rows) {
    const k = handClass(r.h1, r.h2);
    if (!k) continue;
    byClass[k] ||= { n: 0, bb: 0, won: 0 };
    byClass[k].n++; byClass[k].bb += bbNet(r); if (r.won) byClass[k].won++;
  }
  const classes = Object.entries(byClass).map(([k, v]) => ({ k, n: v.n, bb: Math.round(v.bb * 10) / 10, won: v.won }));
  const ranked = classes.filter((c) => c.n >= 2).sort((a, b) => b.bb - a.bb);
  // 54 по позициям
  const POS = { btn: 'Баттон', co: 'Перед баттоном', middle: 'Средняя', early: 'Ранняя', sb: 'Малый блайнд', bb: 'Большой блайнд' };
  const byPos = Object.entries(POS).map(([k, name]) => {
    const rs = rows.filter((r) => r.pos === k);
    return { name, n: rs.length, bb: Math.round(rs.reduce((a, r) => a + bbNet(r), 0) * 10) / 10 };
  }).filter((x) => x.n);
  // 56 лучшие и худшие раздачи, 70 самый дорогой фолд, 71 лучший колл
  const pick = (r) => ({ at: r.at, net: r.net, cards: [r.h1, r.h2].filter((x) => x != null), cat: r.cat });
  const best = [...rows].sort((a, b) => b.net - a.net).slice(0, 3).filter((r) => r.net > 0).map(pick);
  const worst = [...rows].sort((a, b) => a.net - b.net).slice(0, 3).filter((r) => r.net < 0).map(pick);
  const fold = rows.reduce((m, r) => (r.foldcost > (m?.foldcost ?? 0) ? r : m), null);
  const call = rows.reduce((m, r) => (r.rcall > (m?.rcall ?? 0) ? r : m), null);
  // 58 по времени суток (Москва)
  const byHour = Array.from({ length: 24 }, () => ({ n: 0, bb: 0 }));
  for (const r of rows) { const hr = new Date(r.at + 3 * 3600000).getUTCHours(); byHour[hr].n++; byHour[hr].bb += bbNet(r); }
  // 59 удача и 60 ауты: олл-ины с известными шансами
  const ai = rows.filter((r) => r.alleq != null);
  const expWins = ai.reduce((a, r) => a + r.alleq / 100, 0);
  const actWins = ai.filter((r) => r.won).length;
  const suckouts = ai.filter((r) => r.alleq < 50 && r.won).length;
  const badBeats = ai.filter((r) => r.alleq > 50 && !r.won).length;
  // 68 блеф
  const bluffs = rows.filter((r) => r.bluff), bluffWon = bluffs.filter((r) => r.won).length;
  // 75 время в игре: паузы больше 3 минут между раздачами не считаем
  let ms = 0;
  for (let i = 1; i < n; i++) ms += Math.min(rows[i].at - rows[i - 1].at, 3 * 60000);
  // 57 график Эло, 65–66 турниры и ROI
  const elo = db.prepare('SELECT at, rating FROM rating_hist WHERE user_id = ? AND at > ? ORDER BY at').all(uid, Date.now() - 30 * DAY).map((r) => Math.round(r.rating));
  const tours = db.prepare('SELECT * FROM tour_hist WHERE user_id = ? ORDER BY at DESC LIMIT 30').all(uid);
  const tAll = db.prepare('SELECT COALESCE(SUM(prize), 0) AS p, COALESCE(SUM(buyin), 0) AS b, COUNT(*) AS n FROM tour_hist WHERE user_id = ?').get(uid);
  // 67 против живых соперников
  const vs = db.prepare('SELECT opp, hands, won, net FROM vs_human WHERE user_id = ? ORDER BY hands DESC LIMIT 10').all(uid)
    .map((r) => ({ name: getUser(r.opp)?.name || '?', hands: r.hands, won: r.won, net: r.net }));
  return {
    hands: n, vpip: pct(vpip), pfr: pct(pfr), sdPct: vpip ? Math.round((sd / vpip) * 100) : 0, sdWin: sd ? Math.round((sdWon / sd) * 100) : 0,
    aggression, classes, topHands: ranked.filter((c) => c.bb > 0).slice(0, 5), worstHands: ranked.filter((c) => c.bb < 0).slice(-5).reverse(),
    byPos, best, worst, costlyFold: fold?.foldcost ? { ...pick(fold), amount: fold.foldcost } : null, bestCall: call?.rcall ? { ...pick(call), amount: call.rcall } : null,
    byHour: byHour.map((x) => Math.round(x.bb)), byHourN: byHour.map((x) => x.n),
    luck: { allins: ai.length, expected: Math.round(expWins * 10) / 10, actual: actWins, suckouts, badBeats },
    bluff: { n: bluffs.length, won: bluffWon }, playMinutes: Math.round(ms / 60000),
    elo, tours: tours.map((t) => ({ at: t.at, name: t.name, place: t.place, size: t.size, prize: t.prize, buyin: t.buyin })),
    roi: tAll.b ? Math.round(((tAll.p - tAll.b) / tAll.b) * 100) : null, tourCount: tAll.n, vs,
  };
}

// 61 сравнение с другом
export function compare(a, b) {
  const s = (uid) => {
    const v = statsView(uid);
    const u = getUser(uid);
    return { name: u?.name, rating: Math.round(u?.rating || 0), handsWon: u?.hands_won || 0, hands: v.hands, vpip: v.vpip, pfr: v.pfr, sdWin: v.sdWin, roi: v.roi, minutes: v.playMinutes };
  };
  return { me: s(a), him: s(b) };
}

// 64 рекорды сервера (без админа)
export function serverRecords() {
  const one = (sql) => db.prepare(sql).get();
  return {
    pot: one(`SELECT name, biggest_pot AS v FROM users WHERE ${NOT_ADMIN} ORDER BY biggest_pot DESC LIMIT 1`),
    hands: one(`SELECT name, hands_won AS v FROM users WHERE ${NOT_ADMIN} ORDER BY hands_won DESC LIMIT 1`),
    rating: one(`SELECT name, ROUND(rating) AS v FROM users WHERE ${NOT_ADMIN} ORDER BY rating DESC LIMIT 1`),
    tours: one(`SELECT name, wins AS v FROM users WHERE ${NOT_ADMIN} ORDER BY wins DESC LIMIT 1`),
    hand: one('SELECT u.name AS name, MAX(h.net) AS v FROM hand_stats h JOIN users u ON u.id = h.user_id WHERE ' + NOT_ADMIN.replace('id', 'u.id')),
  };
}

// 74 у скольких игроков есть каждое достижение (кэш на час)
let achCache = null;
export function achPercent() {
  if (achCache && Date.now() - achCache.at < 3600000) return achCache.v;
  const users = db.prepare(`SELECT progress FROM users WHERE ${NOT_ADMIN}`).all();
  const cnt = {};
  for (const u of users) { try { for (const k of Object.keys(JSON.parse(u.progress || '{}').ach || {})) cnt[k] = (cnt[k] || 0) + 1; } catch {} }
  const v = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.key, users.length ? Math.round(((cnt[a.key] || 0) / users.length) * 1000) / 10 : 0]));
  achCache = { at: Date.now(), v };
  return v;
}

// 73 экспорт: последние 500 раздач
export const exportRows = (uid) => db.prepare('SELECT at, pos, h1, h2, net, won, sd, cat, bb, kind FROM hand_stats WHERE user_id = ? ORDER BY at DESC LIMIT 500').all(uid)
  .map((r) => ({ ...r, hand: handClass(r.h1, r.h2) }));

// 62 недельный отчёт: кто играл на прошлой неделе
export function weeklyReports() {
  const since = Date.now() - 7 * DAY;
  return db.prepare('SELECT user_id, COUNT(*) AS n, SUM(won) AS w, SUM(CAST(net AS REAL) / MAX(bb, 1)) AS bb FROM hand_stats WHERE at > ? GROUP BY user_id HAVING n >= 10').all(since)
    .map((r) => ({ uid: r.user_id, hands: r.n, won: r.w, bb: Math.round(r.bb) }));
}
