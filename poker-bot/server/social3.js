// Социальное: личные сообщения, группы друзей, лиги друзей, клуб (чат, роли, задание, уровень, магазин),
// лента и реакции, подписки, публичный профиль, комментарии к повторам, совместный сундук, напарник недели,
// дни рождения, жалобы. Чат стола — в table.js.
import { randomBytes } from 'node:crypto';
import { db, tx, credit, getUser } from './db.js';
import { config, NOT_ADMIN } from './config.js';
import { areFriends, friendIds, clubOf } from './social.js';
import { weekKey, grantChest, rankOf } from './progress.js';
import { filterText } from './feed.js';
export { filterText };

const ucols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
if (!ucols.has('birthday')) db.exec('ALTER TABLE users ADD COLUMN birthday TEXT');
const mcols = new Set(db.prepare('PRAGMA table_info(club_members)').all().map((c) => c.name));
if (!mcols.has('role')) db.exec("ALTER TABLE club_members ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
db.exec(`
CREATE TABLE IF NOT EXISTS dms (id INTEGER PRIMARY KEY AUTOINCREMENT, a INTEGER NOT NULL, b INTEGER NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS dms_pair ON dms (a, b, at);
CREATE TABLE IF NOT EXISTS friend_groups (user_id INTEGER NOT NULL, name TEXT NOT NULL, members TEXT NOT NULL DEFAULT '[]', PRIMARY KEY (user_id, name));
CREATE TABLE IF NOT EXISTS fleagues (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner INTEGER NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS fleague_members (league_id TEXT NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY (league_id, user_id));
CREATE TABLE IF NOT EXISTS club_chat (id INTEGER PRIMARY KEY AUTOINCREMENT, club_id TEXT NOT NULL, user_id INTEGER NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS club_quest (club_id TEXT NOT NULL, week TEXT NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY (club_id, week, user_id));
CREATE TABLE IF NOT EXISTS feed_react (feed_id INTEGER NOT NULL, user_id INTEGER NOT NULL, e TEXT NOT NULL, PRIMARY KEY (feed_id, user_id));
CREATE TABLE IF NOT EXISTS follows (user_id INTEGER NOT NULL, target INTEGER NOT NULL, PRIMARY KEY (user_id, target));
CREATE TABLE IF NOT EXISTS replay_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, replay_id TEXT NOT NULL, user_id INTEGER NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pacts (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, a INTEGER NOT NULL, b INTEGER NOT NULL, week TEXT NOT NULL, status TEXT NOT NULL, a0 INTEGER, b0 INTEGER, paid INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, target INTEGER NOT NULL, reason TEXT NOT NULL, at INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0);
`);
const clean = (t, n = 300) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);
// ---------- 102 личные сообщения (только друзья) ----------
export function dmSend(uid, to, text) {
  to = Number(to);
  if (!areFriends(uid, to)) throw new Error('Писать можно только друзьям');
  text = filterText(clean(text, 500));
  if (!text) throw new Error('Пустое сообщение');
  const last = db.prepare('SELECT at FROM dms WHERE a = ? ORDER BY at DESC LIMIT 1').get(uid);
  if (last && Date.now() - last.at < 700) throw new Error('Не так быстро');
  db.prepare('INSERT INTO dms (a, b, text, at) VALUES (?, ?, ?, ?)').run(uid, to, text, Date.now());
  return text;
}
export function dmThread(uid, other) {
  other = Number(other);
  db.prepare('UPDATE dms SET read = 1 WHERE a = ? AND b = ?').run(other, uid);
  return db.prepare('SELECT a, text, at FROM dms WHERE (a = ? AND b = ?) OR (a = ? AND b = ?) ORDER BY at DESC LIMIT 50').all(uid, other, other, uid).reverse()
    .map((m) => ({ mine: m.a === uid, text: m.text, at: m.at }));
}
export const dmUnread = (uid) => Object.fromEntries(db.prepare('SELECT a, COUNT(*) AS n FROM dms WHERE b = ? AND read = 0 GROUP BY a').all(uid).map((r) => [r.a, r.n]));

// ---------- 103 группы друзей ----------
export function groupsOf(uid) { return db.prepare('SELECT name, members FROM friend_groups WHERE user_id = ?').all(uid).map((g) => ({ name: g.name, members: JSON.parse(g.members) })); }
export function groupSet(uid, name, members) {
  name = clean(name, 24);
  if (!name) throw new Error('Название группы');
  const ok = (members || []).map(Number).filter((id) => areFriends(uid, id));
  if (!ok.length) db.prepare('DELETE FROM friend_groups WHERE user_id = ? AND name = ?').run(uid, name);
  else db.prepare('INSERT INTO friend_groups (user_id, name, members) VALUES (?, ?, ?) ON CONFLICT (user_id, name) DO UPDATE SET members = excluded.members').run(uid, name, JSON.stringify(ok));
  return groupsOf(uid);
}

// ---------- 104 лиги друзей: свой рейтинг по выигранным раздачам за неделю ----------
export function leagueCreate(uid, name) {
  name = clean(name, 30);
  if (name.length < 3) throw new Error('Название — от 3 букв');
  const id = randomBytes(4).toString('hex').toUpperCase();
  tx(() => {
    db.prepare('INSERT INTO fleagues (id, name, owner, created) VALUES (?, ?, ?, ?)').run(id, name, uid, Date.now());
    db.prepare('INSERT INTO fleague_members (league_id, user_id) VALUES (?, ?)').run(id, uid);
  });
  return id;
}
export function leagueJoin(uid, code) {
  const l = db.prepare('SELECT * FROM fleagues WHERE id = ?').get(clean(code, 12).toUpperCase());
  if (!l) throw new Error('Лига не найдена');
  if (db.prepare('SELECT COUNT(*) AS n FROM fleague_members WHERE league_id = ?').get(l.id).n >= 50) throw new Error('В лиге уже 50 человек');
  db.prepare('INSERT OR IGNORE INTO fleague_members (league_id, user_id) VALUES (?, ?)').run(l.id, uid);
}
export function leaguesOf(uid) {
  const wk = weekKey();
  return db.prepare('SELECT l.* FROM fleagues l JOIN fleague_members m ON m.league_id = l.id WHERE m.user_id = ?').all(uid).map((l) => ({
    id: l.id, name: l.name, owner: l.owner === uid,
    rows: db.prepare(`SELECT u.name, COALESCE(w.won, 0) AS won FROM fleague_members m JOIN users u ON u.id = m.user_id
      LEFT JOIN user_week w ON w.user_id = m.user_id AND w.week = ? WHERE m.league_id = ? ORDER BY won DESC`).all(wk, l.id),
  }));
}
export function leagueLeave(uid, id) { db.prepare('DELETE FROM fleague_members WHERE league_id = ? AND user_id = ?').run(String(id), uid); }

// ---------- 106–110 клуб: чат, роли, задание недели, уровень, магазин ----------
const role = (uid) => db.prepare('SELECT role FROM club_members WHERE user_id = ?').get(uid)?.role;
const isOwner = (uid, cid) => db.prepare('SELECT owner FROM clubs WHERE id = ?').get(cid)?.owner === uid;
export const canManage = (uid) => { const c = clubOf(uid); return !!c && (isOwner(uid, c) || role(uid) === 'officer'); };
export function clubChatSend(uid, text) {
  const c = clubOf(uid);
  if (!c) throw new Error('Ты не в клубе');
  text = filterText(clean(text, 300));
  if (!text) throw new Error('Пустое сообщение');
  db.prepare('INSERT INTO club_chat (club_id, user_id, text, at) VALUES (?, ?, ?, ?)').run(c, uid, text, Date.now());
  return c;
}
export function clubChat(uid) {
  const c = clubOf(uid);
  if (!c) return [];
  return db.prepare('SELECT ch.text, ch.at, u.name, ch.user_id FROM club_chat ch JOIN users u ON u.id = ch.user_id WHERE club_id = ? ORDER BY ch.id DESC LIMIT 40').all(c).reverse()
    .map((m) => ({ name: m.name, text: m.text, at: m.at, mine: m.user_id === uid }));
}
export function setRole(uid, target, r) {
  const c = clubOf(uid);
  if (!c || !isOwner(uid, c)) throw new Error('Роли назначает глава клуба');
  if (clubOf(Number(target)) !== c || Number(target) === uid) throw new Error('Игрок не в твоём клубе');
  db.prepare('UPDATE club_members SET role = ? WHERE user_id = ?').run(r === 'officer' ? 'officer' : 'member', Number(target));
}
export function kick(uid, target) {
  const c = clubOf(uid);
  if (!canManage(uid)) throw new Error('Выгонять могут глава и офицеры');
  target = Number(target);
  if (clubOf(target) !== c || target === uid || isOwner(target, c)) throw new Error('Этого игрока выгнать нельзя');
  db.prepare('DELETE FROM club_members WHERE user_id = ?').run(target);
}
const CLUB_QUEST = 100; // выигранных раздач клубом за неделю
export function clubExtra(uid) {
  const c = clubOf(uid);
  if (!c) return null;
  const wk = weekKey();
  const week = db.prepare('SELECT COALESCE(SUM(w.won), 0) AS n FROM club_members m JOIN user_week w ON w.user_id = m.user_id AND w.week = ? WHERE m.club_id = ?').get(wk, c).n;
  const total = db.prepare('SELECT COALESCE(SUM(w.won), 0) AS n FROM club_members m JOIN user_week w ON w.user_id = m.user_id WHERE m.club_id = ?').get(c).n;
  const level = Math.floor(Math.sqrt(total / 50)) + 1;
  return {
    role: isOwner(uid, c) ? 'owner' : role(uid), roles: Object.fromEntries(db.prepare('SELECT user_id, role FROM club_members WHERE club_id = ?').all(c).map((r) => [r.user_id, r.role])),
    quest: { need: CLUB_QUEST, have: week, claimed: !!db.prepare('SELECT 1 FROM club_quest WHERE club_id = ? AND week = ? AND user_id = ?').get(c, wk, uid) },
    level, xp: total, nextAt: (level ** 2) * 50,
  };
}
export function clubQuestClaim(uid) {
  const x = clubExtra(uid);
  if (!x) throw new Error('Ты не в клубе');
  if (x.quest.have < x.quest.need) throw new Error('Клуб ещё не выполнил задание');
  if (x.quest.claimed) throw new Error('Уже получено');
  db.prepare('INSERT INTO club_quest (club_id, week, user_id) VALUES (?, ?, ?)').run(clubOf(uid), weekKey(), uid);
  grantChest(uid, 'rare');
}
// 110 клубный магазин: офицер или глава покупает участнику сундук из банка клуба
export const CLUB_SHOP = { common: 500, rare: 2000, epic: 6000 };
export function clubShopBuy(uid, target, kind) {
  const c = clubOf(uid);
  if (!canManage(uid)) throw new Error('Покупать в клубном магазине могут глава и офицеры');
  if (!CLUB_SHOP[kind]) throw new Error('Нет такого товара');
  if (clubOf(Number(target)) !== c) throw new Error('Игрок не в твоём клубе');
  tx(() => {
    const bank = db.prepare('SELECT bank FROM clubs WHERE id = ?').get(c).bank;
    if (bank < CLUB_SHOP[kind]) throw new Error('В банке клуба не хватает фишек');
    db.prepare('UPDATE clubs SET bank = bank - ? WHERE id = ?').run(CLUB_SHOP[kind], c);
    grantChest(Number(target), kind);
  });
}

// ---------- 111–112, 116, 123 лента, реакции, подписки, поздравления ----------
export function follow(uid, target, on) {
  target = Number(target);
  if (!getUser(target) || target === uid) throw new Error('Нет такого игрока');
  if (on) db.prepare('INSERT OR IGNORE INTO follows (user_id, target) VALUES (?, ?)').run(uid, target);
  else db.prepare('DELETE FROM follows WHERE user_id = ? AND target = ?').run(uid, target);
}
export const followersOf = (uid) => db.prepare('SELECT COUNT(*) AS n FROM follows WHERE target = ?').get(uid).n;
export const isFollowing = (uid, t) => !!db.prepare('SELECT 1 FROM follows WHERE user_id = ? AND target = ?').get(uid, t);
export function feedFor(uid) {
  const ids = [...new Set([...friendIds(uid), ...db.prepare('SELECT target FROM follows WHERE user_id = ?').all(uid).map((r) => r.target)])];
  if (!ids.length) return [];
  return db.prepare(`SELECT f.*, u.name FROM feed f JOIN users u ON u.id = f.user_id WHERE f.user_id IN (${ids.map(() => '?').join(',')}) ORDER BY f.at DESC LIMIT 40`).all(...ids)
    .map((f) => ({ id: f.id, uid: f.user_id, name: f.name, kind: f.kind, text: f.text, at: f.at,
      reacts: Object.fromEntries(db.prepare('SELECT e, COUNT(*) AS n FROM feed_react WHERE feed_id = ? GROUP BY e').all(f.id).map((r) => [r.e, r.n])),
      mine: db.prepare('SELECT e FROM feed_react WHERE feed_id = ? AND user_id = ?').get(f.id, uid)?.e || null }));
}
export const REACTS = ['🔥', '👏', '😂', '🎉', '😱'];
export function react(uid, feedId, e) {
  if (!REACTS.includes(e)) throw new Error('Нет такой реакции');
  const f = db.prepare('SELECT * FROM feed WHERE id = ?').get(Number(feedId));
  if (!f) throw new Error('Запись не найдена');
  db.prepare('INSERT INTO feed_react (feed_id, user_id, e) VALUES (?, ?, ?) ON CONFLICT (feed_id, user_id) DO UPDATE SET e = excluded.e').run(f.id, uid, e);
  return f;
}

// ---------- 114 комментарии к повтору ----------
export function commentAdd(uid, replayId, text) {
  text = filterText(clean(text, 300));
  if (!text) throw new Error('Пустой комментарий');
  db.prepare('INSERT INTO replay_comments (replay_id, user_id, text, at) VALUES (?, ?, ?, ?)').run(String(replayId), uid, text, Date.now());
}
export const comments = (replayId) => db.prepare('SELECT c.text, c.at, u.name FROM replay_comments c JOIN users u ON u.id = c.user_id WHERE replay_id = ? ORDER BY c.id').all(String(replayId));

// ---------- 115 публичный профиль ----------
export function publicProfile(viewer, id, extra) {
  const u = getUser(Number(id));
  if (!u) throw new Error('Игрок не найден');
  const r = rankOf(u.rating);
  return { id: u.id, name: u.name, rank: r.name, rankColor: r.color, rating: Math.round(u.rating), handsWon: u.hands_won, tourWins: u.wins,
    followers: followersOf(u.id), following: isFollowing(viewer, u.id), friend: areFriends(viewer, u.id), ...extra };
}

// ---------- 121 совместный сундук и 124 напарник недели ----------
const PACTS = { chest: { need: 50, text: 'Совместный сундук: по 50 раздач каждому за неделю — обоим редкий сундук' }, buddy: { need: 20, text: 'Напарник недели: по 20 раздач каждому — обоим по 300 фишек' } };
const handsSince = (uid, at) => db.prepare('SELECT COUNT(*) AS n FROM hand_stats WHERE user_id = ? AND at >= ?').get(uid, at).n;
export function pactPropose(uid, to, kind) {
  to = Number(to);
  if (!PACTS[kind]) throw new Error('Нет такого');
  if (!areFriends(uid, to)) throw new Error('Только с другом');
  const wk = weekKey();
  if (db.prepare("SELECT 1 FROM pacts WHERE kind = ? AND week = ? AND status != 'declined' AND (a IN (?, ?) OR b IN (?, ?))").get(kind, wk, uid, to, uid, to)) throw new Error('На этой неделе уже есть — у тебя или у друга');
  db.prepare("INSERT INTO pacts (kind, a, b, week, status) VALUES (?, ?, ?, ?, 'pending')").run(kind, uid, to, wk);
}
export function pactAnswer(uid, id, ok) {
  const p = db.prepare("SELECT * FROM pacts WHERE id = ? AND b = ? AND status = 'pending'").get(Number(id), uid);
  if (!p) throw new Error('Не найдено');
  const since = Date.parse(`${p.week}T00:00:00+03:00`);
  db.prepare('UPDATE pacts SET status = ?, a0 = ?, b0 = ? WHERE id = ?').run(ok ? 'active' : 'declined', since, since, p.id);
  return p;
}
export function pactsOf(uid) {
  return db.prepare("SELECT * FROM pacts WHERE (a = ? OR b = ?) AND week = ? AND status != 'declined'").all(uid, uid, weekKey()).map((p) => {
    const other = p.a === uid ? p.b : p.a;
    const def = PACTS[p.kind];
    return { id: p.id, kind: p.kind, text: def.text, with: getUser(other)?.name, status: p.status, incoming: p.status === 'pending' && p.b === uid,
      mine: p.status === 'active' ? Math.min(def.need, handsSince(uid, p.a0)) : 0, his: p.status === 'active' ? Math.min(def.need, handsSince(other, p.a0)) : 0, need: def.need, paid: !!p.paid };
  });
}
export function pactClaim(uid, id) {
  const p = db.prepare("SELECT * FROM pacts WHERE id = ? AND (a = ? OR b = ?) AND status = 'active'").get(Number(id), uid, uid);
  if (!p) throw new Error('Не найдено');
  if (p.paid) throw new Error('Награда уже выдана');
  const need = PACTS[p.kind].need;
  if (handsSince(p.a, p.a0) < need || handsSince(p.b, p.a0) < need) throw new Error('Ещё не выполнено обоими');
  tx(() => {
    db.prepare('UPDATE pacts SET paid = 1 WHERE id = ?').run(p.id);
    for (const id2 of [p.a, p.b]) {
      if (p.kind === 'chest') grantChest(id2, 'rare');
      else if (config.progressRewards) credit(id2, 300, 'buddy', String(p.id));
    }
  });
  return p;
}

// ---------- 122 дни рождения игроков ----------
export function setBirthday(uid, dm) {
  if (!/^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])$/.test(String(dm || ''))) throw new Error('Формат: ДД.ММ, например 13.10');
  const u = getUser(uid);
  if (u.birthday) throw new Error('День рождения уже указан — поменять нельзя');
  db.prepare('UPDATE users SET birthday = ? WHERE id = ?').run(dm, uid);
}
export function birthdaysToday() {
  const d = new Date(Date.now() + 3 * 3600000);
  const dm = `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return db.prepare('SELECT id, name FROM users WHERE birthday = ?').all(dm);
}

// ---------- 125 жалобы ----------
export function report(uid, target, reason) {
  target = Number(target);
  if (!getUser(target)) throw new Error('Нет такого игрока');
  reason = clean(reason, 200);
  if (reason.length < 3) throw new Error('Опиши причину');
  if (db.prepare('SELECT 1 FROM reports WHERE user_id = ? AND target = ? AND at > ?').get(uid, target, Date.now() - 86400000)) throw new Error('Ты уже жаловался на этого игрока сегодня');
  db.prepare('INSERT INTO reports (user_id, target, reason, at) VALUES (?, ?, ?, ?)').run(uid, target, reason, Date.now());
}
export const reportsList = () => db.prepare('SELECT r.id, r.reason, r.at, a.name AS who, t.name AS target, r.target AS tid FROM reports r JOIN users a ON a.id = r.user_id JOIN users t ON t.id = r.target WHERE done = 0 ORDER BY r.id DESC LIMIT 50').all();
export const reportDone = (id) => db.prepare('UPDATE reports SET done = 1 WHERE id = ?').run(Number(id));

// ---------- 117 лучшие игроки недели в лобби ----------
export const weekTop = () => db.prepare(`SELECT u.name, w.won FROM user_week w JOIN users u ON u.id = w.user_id WHERE w.week = ? AND ${NOT_ADMIN.replace('id', 'u.id')} ORDER BY w.won DESC LIMIT 3`).all(weekKey());
