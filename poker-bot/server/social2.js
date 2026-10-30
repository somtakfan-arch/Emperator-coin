// Пачка 12: повторы раздач и история за сутки, пари с другом, клубные войны, клубный банк,
// статус «свободен поиграть», подарок-сюрприз, наставник.
import { randomBytes } from 'node:crypto';
import { db, tx, debit, credit, getUser } from './db.js';
import { config, NOT_ADMIN } from './config.js';
import { areFriends, clubOf } from './social.js';
import { weekKey } from './progress.js';

const ucols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
if (!ucols.has('free_until')) db.exec('ALTER TABLE users ADD COLUMN free_until INTEGER NOT NULL DEFAULT 0');
if (!ucols.has('mentor_id')) db.exec('ALTER TABLE users ADD COLUMN mentor_id INTEGER');
if (!ucols.has('mentor_paid')) db.exec('ALTER TABLE users ADD COLUMN mentor_paid INTEGER NOT NULL DEFAULT 0');
const ccols = new Set(db.prepare('PRAGMA table_info(clubs)').all().map((c) => c.name));
if (!ccols.has('bank')) db.exec('ALTER TABLE clubs ADD COLUMN bank INTEGER NOT NULL DEFAULT 0');
const gcols = new Set(db.prepare('PRAGMA table_info(gifts)').all().map((c) => c.name));
if (!gcols.has('surprise')) db.exec('ALTER TABLE gifts ADD COLUMN surprise INTEGER NOT NULL DEFAULT 0');
if (!gcols.has('opened')) db.exec('ALTER TABLE gifts ADD COLUMN opened INTEGER NOT NULL DEFAULT 1');
if (!gcols.has('id')) db.exec('ALTER TABLE gifts ADD COLUMN id INTEGER');
db.exec(`
CREATE TABLE IF NOT EXISTS replays (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, at INTEGER NOT NULL, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS replays_user ON replays (user_id, at);
CREATE TABLE IF NOT EXISTS bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, a INTEGER NOT NULL, b INTEGER NOT NULL, stake INTEGER NOT NULL, status TEXT NOT NULL,
  a0 INTEGER, b0 INTEGER, ends INTEGER, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_week (user_id INTEGER NOT NULL, week TEXT NOT NULL, won INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, week));
`);

// ---------- Повторы раздач (храним сутки, до 50 штук) ----------

const DAY = 86400000;
export function saveReplay(uid, data) {
  const id = randomBytes(6).toString('base64url');
  db.prepare('INSERT INTO replays (id, user_id, at, data) VALUES (?, ?, ?, ?)').run(id, uid, Date.now(), JSON.stringify(data));
  db.prepare('DELETE FROM replays WHERE user_id = ? AND (at < ? OR id NOT IN (SELECT id FROM replays WHERE user_id = ? ORDER BY at DESC LIMIT 50))').run(uid, Date.now() - DAY, uid);
  return id;
}
export const historyOf = (uid) => db.prepare('SELECT id, at, data FROM replays WHERE user_id = ? AND at > ? ORDER BY at DESC').all(uid, Date.now() - DAY)
  .map((r) => { const d = JSON.parse(r.data); return { id: r.id, at: r.at, title: d.title, net: d.net, hand: d.hand, hole: d.hole }; });
export function replay(id) {
  const r = db.prepare('SELECT user_id, at, data FROM replays WHERE id = ?').get(String(id));
  if (!r) throw new Error('Повтор не найден — они хранятся сутки');
  return { id, owner: getUser(r.user_id)?.name, at: r.at, ...JSON.parse(r.data) };
}

// ---------- Пари с другом: кто выиграет больше раздач за 3 часа ----------

const BET_MS = 3 * 3600000;
export function proposeBet(uid, to, stake) {
  stake = Math.floor(Number(stake));
  if (!areFriends(uid, to)) throw new Error('Пари — только с другом');
  if (!(stake >= 100)) throw new Error('Ставка — от 100 фишек');
  if (db.prepare("SELECT 1 FROM bets WHERE status IN ('pending', 'active') AND ((a = ? AND b = ?) OR (a = ? AND b = ?))").get(uid, to, to, uid)) throw new Error('С этим другом пари уже есть');
  tx(() => {
    if (!debit(uid, stake, 'bet_stake')) throw new Error('Не хватает фишек');
    db.prepare("INSERT INTO bets (a, b, stake, status, created) VALUES (?, ?, ?, 'pending', ?)").run(uid, to, stake, Date.now());
  });
}
export function answerBet(uid, id, accept) {
  const b = db.prepare("SELECT * FROM bets WHERE id = ? AND status = 'pending'").get(Number(id));
  if (!b || (b.b !== uid && b.a !== uid)) throw new Error('Пари не найдено');
  tx(() => {
    if (!accept || b.a === uid) {
      db.prepare("UPDATE bets SET status = 'cancelled' WHERE id = ?").run(b.id);
      credit(b.a, b.stake, 'bet_refund', String(b.id));
      return;
    }
    if (!debit(uid, b.stake, 'bet_stake')) throw new Error('Не хватает фишек');
    db.prepare("UPDATE bets SET status = 'active', a0 = ?, b0 = ?, ends = ? WHERE id = ?").run(getUser(b.a).hands_won, getUser(b.b).hands_won, Date.now() + BET_MS, b.id);
  });
  return b;
}
// закрываем пари, у которых вышло время; возвращает итоги для уведомлений
export function resolveBets() {
  const done = [];
  for (const b of db.prepare("SELECT * FROM bets WHERE status = 'active' AND ends <= ?").all(Date.now())) {
    tx(() => {
      const da = getUser(b.a).hands_won - b.a0, dbb = getUser(b.b).hands_won - b.b0;
      const win = da > dbb ? b.a : dbb > da ? b.b : null;
      if (win) credit(win, b.stake * 2, 'bet_win', String(b.id));
      else { credit(b.a, b.stake, 'bet_refund', String(b.id)); credit(b.b, b.stake, 'bet_refund', String(b.id)); }
      db.prepare("UPDATE bets SET status = 'done' WHERE id = ?").run(b.id);
      done.push({ ...b, da, db: dbb, win });
    });
  }
  return done;
}
export function betsOf(uid) {
  return db.prepare("SELECT * FROM bets WHERE (a = ? OR b = ?) AND status IN ('pending', 'active') ORDER BY created DESC").all(uid, uid).map((b) => {
    const other = b.a === uid ? b.b : b.a;
    const mine = b.status === 'active' ? getUser(uid).hands_won - (b.a === uid ? b.a0 : b.b0) : 0;
    const his = b.status === 'active' ? getUser(other).hands_won - (b.a === uid ? b.b0 : b.a0) : 0;
    return { id: b.id, with: getUser(other)?.name, stake: b.stake, status: b.status, incoming: b.status === 'pending' && b.b === uid, ends: b.ends, mine, his };
  });
}

// ---------- Клубные войны: выигранные раздачи участников за неделю ----------

const addWeekWin = db.prepare('INSERT INTO user_week (user_id, week, won) VALUES (?, ?, 1) ON CONFLICT (user_id, week) DO UPDATE SET won = won + 1');
export const countWeekWin = (uid) => addWeekWin.run(uid, weekKey());
export function clubWar() {
  const q = (w) => db.prepare(`SELECT c.id, c.name, SUM(x.won) AS score FROM user_week x JOIN club_members m ON m.user_id = x.user_id
    JOIN clubs c ON c.id = m.club_id WHERE x.week = ? AND ${NOT_ADMIN.replace('id', 'x.user_id')} GROUP BY c.id ORDER BY score DESC LIMIT 10`).all(w);
  const prev = weekKey(Date.now() - 7 * DAY);
  return { week: q(weekKey()), champion: q(prev)[0] || null };
}

// ---------- Клубный банк ----------

export function clubDeposit(uid, amount) {
  amount = Math.floor(Number(amount));
  const cid = clubOf(uid);
  if (!cid) throw new Error('Ты не в клубе');
  if (!(amount >= 100)) throw new Error('Минимум 100 фишек');
  tx(() => {
    if (!debit(uid, amount, 'club_bank_in', cid)) throw new Error('Не хватает фишек');
    db.prepare('UPDATE clubs SET bank = bank + ? WHERE id = ?').run(amount, cid);
  });
}
export function clubPay(uid, to, amount) {
  amount = Math.floor(Number(amount));
  const cid = clubOf(uid);
  const club = cid && db.prepare('SELECT * FROM clubs WHERE id = ?').get(cid);
  if (!club || club.owner !== uid) throw new Error('Выдавать из банка может только глава клуба');
  if (clubOf(Number(to)) !== cid) throw new Error('Игрок не в твоём клубе');
  if (!(amount > 0 && amount <= club.bank)) throw new Error('В банке клуба нет столько');
  tx(() => {
    db.prepare('UPDATE clubs SET bank = bank - ? WHERE id = ?').run(amount, cid);
    credit(Number(to), amount, 'club_bank_out', cid);
  });
}
export const clubBank = (cid) => db.prepare('SELECT bank, owner FROM clubs WHERE id = ?').get(cid);

// ---------- Статус «свободен поиграть» (на 2 часа) ----------

export function setFree(uid, on) {
  db.prepare('UPDATE users SET free_until = ? WHERE id = ?').run(on ? Date.now() + 2 * 3600000 : 0, uid);
}
export const isFree = (uid) => (db.prepare('SELECT free_until FROM users WHERE id = ?').get(uid)?.free_until ?? 0) > Date.now();

// ---------- Подарок-сюрприз: друг не знает, что внутри, пока не откроет ----------

export function surpriseGift(uid, to, chips, giftLeft) {
  chips = Math.floor(Number(chips));
  if (!areFriends(uid, to)) throw new Error('Дарить можно только друзьям');
  if (!(chips >= 50)) throw new Error('Сюрприз — от 50 фишек');
  if (chips > giftLeft(uid)) throw new Error(`Сегодня можно подарить ещё ${giftLeft(uid).toLocaleString('ru')} фишек`);
  tx(() => {
    if (!debit(uid, chips, 'gift_out', String(to))) throw new Error('Не хватает фишек');
    const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    db.prepare('INSERT INTO gifts (from_id, to_id, chips, hints, at, surprise, opened, id) VALUES (?, ?, ?, 0, ?, 1, 0, ?)').run(uid, to, chips, Date.now(), id);
  });
}
export const surprisesFor = (uid) => db.prepare('SELECT id, from_id FROM gifts WHERE to_id = ? AND surprise = 1 AND opened = 0').all(uid)
  .map((g) => ({ id: g.id, from: getUser(g.from_id)?.name }));
export function openSurprise(uid, id) {
  let res = null;
  tx(() => {
    const g = db.prepare('SELECT * FROM gifts WHERE id = ? AND to_id = ? AND surprise = 1 AND opened = 0').get(Number(id), uid);
    if (!g) throw new Error('Сюрприз не найден');
    db.prepare('UPDATE gifts SET opened = 1 WHERE id = ?').run(g.id);
    credit(uid, g.chips, 'gift_in', String(g.from_id));
    res = { chips: g.chips, from: getUser(g.from_id)?.name };
  });
  return res;
}

// ---------- Наставник: опытный друг ведёт новичка ----------

export const MENTOR_MIN_HANDS = 500;
const MENTOR_STEPS = [{ hands: 100, mentor: 500, mentee: 300 }, { hands: 500, mentor: 1500, mentee: 700 }];
export function setMentor(uid, mentorId, handsOf) {
  mentorId = Number(mentorId);
  const me = getUser(uid);
  if (me.mentor_id) throw new Error('Наставник уже выбран');
  if (!areFriends(uid, mentorId)) throw new Error('Наставником может быть только друг');
  if (handsOf(mentorId) < MENTOR_MIN_HANDS) throw new Error(`Наставник должен сыграть от ${MENTOR_MIN_HANDS} раздач`);
  if (handsOf(uid) >= 100) throw new Error('Наставника можно выбрать, пока у тебя меньше 100 раздач');
  db.prepare('UPDATE users SET mentor_id = ? WHERE id = ?').run(mentorId, uid);
}
// новичок дошёл до ступени — награда обоим (один раз за ступень)
export function mentorCheck(uid, hands) {
  const me = getUser(uid);
  if (!me?.mentor_id) return null;
  const step = MENTOR_STEPS.findIndex((s, i) => hands >= s.hands && me.mentor_paid <= i);
  if (step < 0) return null;
  const s = MENTOR_STEPS[step];
  tx(() => {
    db.prepare('UPDATE users SET mentor_paid = ? WHERE id = ?').run(step + 1, uid);
    if (config.progressRewards) {
      credit(me.mentor_id, s.mentor, 'mentor', String(uid));
      credit(uid, s.mentee, 'mentee', String(me.mentor_id));
    }
  });
  return { mentor: me.mentor_id, ...s };
}
export const mentorOf = (uid) => { const m = getUser(uid)?.mentor_id; return m ? { id: m, name: getUser(m)?.name } : null; };
export const menteesOf = (uid) => db.prepare('SELECT id, name FROM users WHERE mentor_id = ?').all(uid);
