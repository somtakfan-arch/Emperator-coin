// Друзья, клубы, подарки и приглашения.
import { db, tx, credit, getUser } from './db.js';
import { config } from './config.js';
import { grantChest, rankOf } from './progress.js';

db.exec(`
CREATE TABLE IF NOT EXISTS friends (
  a INTEGER NOT NULL, b INTEGER NOT NULL, status TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);
CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, owner INTEGER NOT NULL, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS club_members (
  club_id TEXT NOT NULL, user_id INTEGER PRIMARY KEY, at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS refs (
  user_id INTEGER PRIMARY KEY, ref_by INTEGER NOT NULL, rewarded INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gifts (
  from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, chips INTEGER NOT NULL, hints INTEGER NOT NULL, at INTEGER NOT NULL
);
`);
const tcols = new Set(db.prepare('PRAGMA table_info(tournaments)').all().map((c) => c.name));
if (!tcols.has('club_id')) db.exec('ALTER TABLE tournaments ADD COLUMN club_id TEXT'); // клубный турнир

// ---------- Друзья ----------

const pair = (x, y) => db.prepare("SELECT * FROM friends WHERE a = ? AND b = ?").get(x, y);
export const areFriends = (x, y) => pair(x, y)?.status === 'ok' || pair(y, x)?.status === 'ok';

export function addFriend(uid, ref) {
  const target = typeof ref === 'number' || /^\d+$/.test(String(ref)) ? getUser(Number(ref))
    : db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(String(ref).replace(/^@/, ''));
  if (!target) throw new Error('Игрок не найден — он должен хоть раз открыть игру');
  if (target.id === uid) throw new Error('Это ты 🙂');
  if (areFriends(uid, target.id)) throw new Error('Уже в друзьях');
  const back = pair(target.id, uid);
  if (back?.status === 'pending') {
    db.prepare("UPDATE friends SET status = 'ok', at = ? WHERE a = ? AND b = ?").run(Date.now(), target.id, uid);
    return { target, accepted: true };
  }
  db.prepare("INSERT OR REPLACE INTO friends (a, b, status, at) VALUES (?, ?, 'pending', ?)").run(uid, target.id, Date.now());
  return { target, accepted: false };
}

export function removeFriend(uid, id) {
  db.prepare('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').run(uid, id, id, uid);
}

export function friendIds(uid) {
  return db.prepare("SELECT CASE WHEN a = ? THEN b ELSE a END AS id FROM friends WHERE (a = ? OR b = ?) AND status = 'ok'").all(uid, uid, uid).map((r) => r.id);
}

export function friendsView(uid, presence) {
  const row = (id) => {
    const u = getUser(id);
    if (!u) return null;
    const r = rankOf(u.rating);
    return { id, name: u.name, username: u.username, rating: Math.round(u.rating), rank: r.name, rankColor: r.color, handsWon: u.hands_won, ...presence(id) };
  };
  return {
    friends: friendIds(uid).map(row).filter(Boolean).sort((x, y) => (y.online - x.online) || (y.rating - x.rating)),
    incoming: db.prepare("SELECT a FROM friends WHERE b = ? AND status = 'pending'").all(uid).map((r) => row(r.a)).filter(Boolean),
    outgoing: db.prepare("SELECT b FROM friends WHERE a = ? AND status = 'pending'").all(uid).map((r) => row(r.b)).filter(Boolean),
    giftLeft: giftLeft(uid),
  };
}

// ---------- Подарки друзьям ----------

const GIFT_DAY_LIMIT = 10000; // фишек в сутки от одного игрока — чтобы подарки не превращались в торговлю
function giftLeft(uid) {
  const sent = db.prepare('SELECT COALESCE(SUM(chips), 0) AS s FROM gifts WHERE from_id = ? AND at > ?').get(uid, Date.now() - 86400000).s;
  return Math.max(0, GIFT_DAY_LIMIT - sent);
}

export function gift(uid, to, { chips = 0, hints = 0 }) {
  chips = Math.floor(Number(chips) || 0);
  hints = Math.floor(Number(hints) || 0);
  if (chips < 0 || hints < 0 || (!chips && !hints)) throw new Error('Выбери, что подарить');
  if (!areFriends(uid, to)) throw new Error('Дарить можно только друзьям');
  if (chips > giftLeft(uid)) throw new Error(`Сегодня можно подарить ещё ${giftLeft(uid).toLocaleString('ru')} фишек`);
  tx(() => {
    const me = getUser(uid);
    if (me.chips < chips) throw new Error('Не хватает фишек');
    if (me.hints < hints) throw new Error('Не хватает подсказок');
    if (chips) {
      db.prepare('UPDATE users SET chips = chips - ? WHERE id = ?').run(chips, uid);
      db.prepare('INSERT INTO ledger (user_id, delta, reason, ref, at) VALUES (?, ?, ?, ?, ?)').run(uid, -chips, 'gift_out', String(to), Date.now());
      credit(to, chips, 'gift_in', String(uid));
    }
    if (hints) {
      db.prepare('UPDATE users SET hints = hints - ? WHERE id = ?').run(hints, uid);
      db.prepare('UPDATE users SET hints = hints + ? WHERE id = ?').run(hints, to);
    }
    db.prepare('INSERT INTO gifts (from_id, to_id, chips, hints, at) VALUES (?, ?, ?, ?, ?)').run(uid, to, chips, hints, Date.now());
  });
}

// ---------- Рефералы ----------

export const REF_BONUS_NEW = 500; // новичку сразу
export const REF_BONUS_INVITER = 1000; // пригласившему — когда новичок сыграет 20 раздач (+ редкий сундук)

// новичок пришёл по ссылке r_<id>: связываем и сразу дружим
export function registerRef(uid, refBy) {
  const u = getUser(uid);
  if (!u || uid === refBy || !getUser(refBy)) return false;
  if (Date.now() - u.created > 10 * 60000) return false; // только для новых игроков
  if (db.prepare('SELECT 1 FROM refs WHERE user_id = ?').get(uid)) return false;
  tx(() => {
    db.prepare('INSERT INTO refs (user_id, ref_by, at) VALUES (?, ?, ?)').run(uid, refBy, Date.now());
    db.prepare("INSERT OR REPLACE INTO friends (a, b, status, at) VALUES (?, ?, 'ok', ?)").run(refBy, uid, Date.now());
    if (config.progressRewards) credit(uid, REF_BONUS_NEW, 'ref_new', String(refBy));
  });
  return true;
}

// после каждой раздачи новичка: на 20-й награда пригласившему
export function checkRef(uid, handsPlayed) {
  if (handsPlayed < 20) return null;
  const r = db.prepare('SELECT * FROM refs WHERE user_id = ? AND rewarded = 0').get(uid);
  if (!r) return null;
  db.prepare('UPDATE refs SET rewarded = 1 WHERE user_id = ?').run(uid);
  credit(r.ref_by, REF_BONUS_INVITER, 'ref_bonus', String(uid));
  grantChest(r.ref_by, 'rare');
  return r.ref_by;
}

export function refStats(uid) {
  const all = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(rewarded), 0) AS done FROM refs WHERE ref_by = ?').get(uid);
  return { invited: all.n, rewarded: all.done };
}

// ---------- Клубы ----------

const newId = () => Math.random().toString(36).slice(2, 8).toUpperCase();
export const clubOf = (uid) => db.prepare('SELECT club_id FROM club_members WHERE user_id = ?').get(uid)?.club_id ?? null;

export function createClub(uid, name) {
  name = String(name || '').trim().slice(0, 24);
  if (!/^[\p{L}\p{N} _-]{3,24}$/u.test(name)) throw new Error('Название клуба — от 3 до 24 букв или цифр');
  if (clubOf(uid)) throw new Error('Ты уже в клубе — сначала выйди');
  const id = newId();
  tx(() => {
    db.prepare('INSERT INTO clubs (id, name, owner, created) VALUES (?, ?, ?, ?)').run(id, name, uid, Date.now());
    db.prepare('INSERT INTO club_members (club_id, user_id, at) VALUES (?, ?, ?)').run(id, uid, Date.now());
  });
  return id;
}

export function joinClub(uid, code) {
  const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(String(code || '').trim().toUpperCase());
  if (!club) throw new Error('Клуб с таким кодом не найден');
  if (clubOf(uid)) throw new Error('Ты уже в клубе — сначала выйди');
  const n = db.prepare('SELECT COUNT(*) AS n FROM club_members WHERE club_id = ?').get(club.id).n;
  if (n >= 50) throw new Error('В клубе уже 50 игроков');
  db.prepare('INSERT INTO club_members (club_id, user_id, at) VALUES (?, ?, ?)').run(club.id, uid, Date.now());
  return club.id;
}

export function leaveClub(uid) {
  const id = clubOf(uid);
  if (!id) return;
  tx(() => {
    db.prepare('DELETE FROM club_members WHERE user_id = ?').run(uid);
    const left = db.prepare('SELECT user_id FROM club_members WHERE club_id = ? ORDER BY at LIMIT 1').get(id);
    if (!left) db.prepare('DELETE FROM clubs WHERE id = ?').run(id);
    else db.prepare('UPDATE clubs SET owner = ? WHERE id = ? AND owner = ?').run(left.user_id, id, uid);
  });
}

// рейтинг клуба — средний Эло пяти лучших игроков
export function clubView(uid) {
  const id = clubOf(uid);
  const top = db.prepare(`SELECT c.id, c.name, AVG(r) AS score, COUNT(*) AS n FROM (
      SELECT m.club_id, u.rating AS r, ROW_NUMBER() OVER (PARTITION BY m.club_id ORDER BY u.rating DESC) AS rn
      FROM club_members m JOIN users u ON u.id = m.user_id) x JOIN clubs c ON c.id = x.club_id
    WHERE x.rn <= 5 GROUP BY c.id ORDER BY score DESC LIMIT 20`).all()
    .map((c) => ({ id: c.id, name: c.name, score: Math.round(c.score), members: db.prepare('SELECT COUNT(*) AS n FROM club_members WHERE club_id = ?').get(c.id).n }));
  if (!id) return { club: null, top };
  const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(id);
  const members = db.prepare('SELECT u.id, u.name, u.rating, u.hands_won FROM club_members m JOIN users u ON u.id = m.user_id WHERE m.club_id = ? ORDER BY u.rating DESC').all(id)
    .map((u) => ({ id: u.id, name: u.name, rating: Math.round(u.rating), handsWon: u.hands_won, rank: rankOf(u.rating).name, rankColor: rankOf(u.rating).color }));
  return { club: { id: club.id, name: club.name, owner: club.owner === uid, code: club.id, members }, top };
}

export const clubMembers = (clubId) => db.prepare('SELECT user_id FROM club_members WHERE club_id = ?').all(clubId).map((r) => r.user_id);
