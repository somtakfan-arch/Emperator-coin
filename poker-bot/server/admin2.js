// Админка 2: журнал действий, возврат по раздаче, подозрительная игра, предупреждения и временный бан,
// шаблоны и сегменты рассылок, A/B бонуса, расписание ивентов, правка ботов, аналитика (режимы, воронка,
// удержание, доход по пакетам), экспорт, бэкап, техработы, новости, опросы, отзывы, модераторы.
import { readFileSync, unlinkSync } from 'node:fs';
import { db, tx, credit, getUser } from './db.js';
import { config, NOT_ADMIN } from './config.js';

const ucols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
for (const [c, def] of [['banned_until', 'INTEGER NOT NULL DEFAULT 0'], ['warnings', 'INTEGER NOT NULL DEFAULT 0'], ['trusted', 'INTEGER NOT NULL DEFAULT 0'], ['role', "TEXT NOT NULL DEFAULT ''"]]) {
  if (!ucols.has(c)) db.exec(`ALTER TABLE users ADD COLUMN ${c} ${def}`);
}
db.exec(`
CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER NOT NULL, action TEXT NOT NULL, details TEXT, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS hand_refunds (replay_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, amount INTEGER NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS news (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS polls (id INTEGER PRIMARY KEY AUTOINCREMENT, q TEXT NOT NULL, options TEXT NOT NULL, at INTEGER NOT NULL, open INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS poll_votes (poll_id INTEGER NOT NULL, user_id INTEGER NOT NULL, opt INTEGER NOT NULL, PRIMARY KEY (poll_id, user_id));
CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
const DAY = 86400000;
const meta = (k, d = null) => { try { return JSON.parse(db.prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value ?? 'null') ?? d; } catch { return d; } };
const setMeta = (k, v) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));

// ---------- 200 модераторы ----------
export const isMod = (uid) => getUser(uid)?.role === 'moderator';
export const MOD_ACTIONS = new Set(['search', 'mute', 'warn', 'reports', 'reportDone', 'feedback', 'feedbackDone', 'log', 'replay']);
export function setRole(id, role) { db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role === 'moderator' ? 'moderator' : '', Number(id)); }

// ---------- 176 журнал действий ----------
export const log = (admin, action, details) => db.prepare('INSERT INTO admin_log (admin_id, action, details, at) VALUES (?, ?, ?, ?)').run(admin, action, details ? JSON.stringify(details).slice(0, 500) : null, Date.now());
export const logList = () => db.prepare('SELECT l.action, l.details, l.at, u.name FROM admin_log l LEFT JOIN users u ON u.id = l.admin_id ORDER BY l.id DESC LIMIT 60').all();

// ---------- 178 возврат проигрыша по раздаче (по id повтора) ----------
export function refundHand(replayId, replayFn) {
  const r = replayFn(replayId);
  if (db.prepare('SELECT 1 FROM hand_refunds WHERE replay_id = ?').get(String(replayId))) throw new Error('По этой раздаче уже был возврат');
  if (!(r.net < 0)) throw new Error('В этой раздаче игрок не проиграл');
  tx(() => {
    db.prepare('INSERT INTO hand_refunds (replay_id, user_id, amount, at) VALUES (?, ?, ?, ?)').run(String(replayId), r.ownerId, -r.net, Date.now());
    credit(r.ownerId, -r.net, 'hand_refund', String(replayId));
  });
  return { user: r.ownerId, amount: -r.net };
}

// ---------- 179 подозрительная игра: перелив фишек между людьми ----------
export function suspicious() {
  return db.prepare(`SELECT v.user_id AS a, v.opp AS b, v.hands, v.net, ua.name AS an, ub.name AS bn FROM vs_human v
    JOIN users ua ON ua.id = v.user_id JOIN users ub ON ub.id = v.opp
    WHERE v.hands >= 10 AND ABS(v.net) >= 5000 AND ua.trusted = 0 AND ub.trusted = 0 ORDER BY ABS(v.net) DESC LIMIT 30`).all()
    .map((r) => ({ ...r, text: `${r.an} ↔ ${r.bn}: ${r.hands} раздач 1 на 1, итог ${r.net > 0 ? '+' : ''}${r.net}` }));
}
// 181 доверенные (белый список) — не попадают в подозрительные
export const setTrusted = (id, on) => db.prepare('UPDATE users SET trusted = ? WHERE id = ?').run(on ? 1 : 0, Number(id));

// ---------- 180 дневной лимит подарков фишками (настраиваемый) ----------
export const giftLimit = () => meta('gift_limit', 10000);
export const setGiftLimit = (n) => setMeta('gift_limit', Math.max(0, Math.floor(Number(n) || 0)));

// ---------- 182–183 предупреждения и временный бан ----------
export function warn(id, reason) {
  const u = getUser(Number(id));
  if (!u) throw new Error('Игрок не найден');
  const n = u.warnings + 1;
  db.prepare('UPDATE users SET warnings = ? WHERE id = ?').run(n, u.id);
  if (n % 3 === 0) db.prepare('UPDATE users SET banned_until = ? WHERE id = ?').run(Date.now() + DAY, u.id); // каждое 3-е — бан на сутки
  return { warnings: n, banned: n % 3 === 0 };
}
export function tempBan(id, hours) { db.prepare('UPDATE users SET banned_until = ? WHERE id = ?').run(Date.now() + Math.max(1, Number(hours) || 24) * 3600000, Number(id)); }
export const bannedUntil = (uid) => getUser(uid)?.banned_until || 0;

// ---------- 184–185 шаблоны и сегменты рассылок ----------
export const templates = () => meta('bc_templates', []);
export function saveTemplate(text) { const t = templates(); const s = String(text || '').trim().slice(0, 1500); if (s.length < 3) throw new Error('Пустой шаблон'); setMeta('bc_templates', [s, ...t.filter((x) => x !== s)].slice(0, 10)); return templates(); }
export function segmentIds(seg) {
  const now = Date.now();
  const q = {
    all: 'SELECT id FROM users WHERE banned = 0',
    active: 'SELECT id FROM users WHERE banned = 0 AND last_seen > ?',
    inactive: 'SELECT id FROM users WHERE banned = 0 AND last_seen <= ?',
    payers: 'SELECT DISTINCT user_id AS id FROM payments WHERE refunded = 0',
    gold: 'SELECT id FROM users WHERE banned = 0 AND rating >= 1900',
  }[seg];
  if (!q) throw new Error('Нет такого сегмента');
  return db.prepare(q).all(...(seg === 'active' || seg === 'inactive' ? [now - 7 * DAY] : [])).map((r) => r.id);
}

// ---------- 186 A/B бонуса дня: группа B получает +20% ----------
export const abOn = () => !!meta('ab_bonus', false);
export const setAb = (on) => setMeta('ab_bonus', !!on);
export const abMult = (uid) => (abOn() && uid % 2 === 1 ? 1.2 : 1);
export function abStats() {
  const since = Date.now() - 7 * DAY;
  const g = (par) => db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(last_seen > ?), 0) AS act FROM users WHERE id % 2 = ? AND created > ?`).get(Date.now() - DAY, par, since);
  return { on: abOn(), a: g(0), b: g(1) };
}

// ---------- 187 расписание ивентов ----------
export const schedule = () => meta('event_schedule', []);
export function scheduleEvent(kind, startAt, hours, title) {
  const at = Number(startAt);
  if (!(at > Date.now())) throw new Error('Время начала — в будущем');
  const list = [...schedule(), { kind, at, hours: Number(hours) || 24, title: String(title || '').slice(0, 60) }].sort((a, b) => a.at - b.at).slice(0, 20);
  setMeta('event_schedule', list);
  return list;
}
// вызывается раз в минуту: пришло время — включаем ивент
export function dueEvents() {
  const list = schedule();
  const due = list.filter((e) => e.at <= Date.now());
  if (due.length) setMeta('event_schedule', list.filter((e) => e.at > Date.now()));
  return due;
}

// ---------- 189 правка ботов: своё Эло и выключенные боты ----------
export const botOverrides = () => meta('bot_overrides', { elo: {}, off: [] });
export function setBotElo(name, elo) { const o = botOverrides(); o.elo[String(name)] = Math.max(500, Math.min(4000, Number(elo) || 1400)); setMeta('bot_overrides', o); applyBotOverrides(); return o; }
export function toggleBot(name) { const o = botOverrides(); o.off = o.off.includes(name) ? o.off.filter((x) => x !== name) : [...o.off, String(name)]; setMeta('bot_overrides', o); return o; }
export function applyBotOverrides() { Object.assign(config.botElo, botOverrides().elo); }
applyBotOverrides();

// ---------- 190–193 аналитика ----------
export function analytics() {
  const now = Date.now();
  const modes = db.prepare('SELECT kind, COUNT(*) AS hands, COUNT(DISTINCT user_id) AS players FROM hand_stats WHERE at > ? GROUP BY kind').all(now - 7 * DAY);
  const cohort = db.prepare('SELECT id FROM users WHERE created > ?').all(now - 30 * DAY).map((r) => r.id);
  const hands = (id) => db.prepare('SELECT COUNT(*) AS n FROM hand_stats WHERE user_id = ?').get(id).n;
  const paid = new Set(db.prepare('SELECT DISTINCT user_id AS id FROM payments WHERE refunded = 0').all().map((r) => r.id));
  const counts = cohort.map(hands);
  const pct = (x) => (cohort.length ? Math.round((x / cohort.length) * 100) : 0);
  const funnel = { users: cohort.length, h1: pct(counts.filter((n) => n >= 1).length), h10: pct(counts.filter((n) => n >= 10).length), h100: pct(counts.filter((n) => n >= 100).length), paid: pct(cohort.filter((id) => paid.has(id)).length) };
  const ret = (d) => {
    const c = db.prepare('SELECT created, last_seen FROM users WHERE created < ? AND created > ?').all(now - d * DAY, now - (d + 30) * DAY);
    return c.length ? Math.round((c.filter((u) => u.last_seen >= u.created + d * DAY).length / c.length) * 100) : null;
  };
  const packs = db.prepare('SELECT pack, COUNT(*) AS n, SUM(stars) AS stars FROM payments WHERE refunded = 0 GROUP BY pack ORDER BY stars DESC').all();
  return { modes, funnel, retention: { d1: ret(1), d7: ret(7), d30: ret(30) }, packs };
}

// ---------- 194 экспорт игроков ----------
export const exportUsers = () => db.prepare(`SELECT u.id, u.name, u.username, u.chips, ROUND(u.rating) AS rating, u.hands_won, u.created, u.last_seen,
  (SELECT COALESCE(SUM(stars), 0) FROM payments p WHERE p.user_id = u.id AND p.refunded = 0) AS stars FROM users u ORDER BY u.id`).all();

// ---------- 195 резервная копия базы — файлом в Telegram админу ----------
export async function backupTo(chatId) {
  if (!config.botToken) throw new Error('Бот не подключён');
  const file = `${config.dataDir}/backup-${Date.now()}.db`;
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  try {
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    fd.append('caption', `Резервная копия базы · ${new Date().toLocaleString('ru')}`);
    fd.append('document', new Blob([readFileSync(file)]), 'poker-backup.db');
    const r = await fetch(`https://api.telegram.org/bot${config.botToken}/sendDocument`, { method: 'POST', body: fd });
    const j = await r.json();
    if (!j.ok) throw new Error(`sendDocument: ${j.description}`);
  } finally { try { unlinkSync(file); } catch {} }
}

// ---------- 196 техработы ----------
export const maintenance = () => meta('maintenance', null);
export const setMaintenance = (text) => setMeta('maintenance', text ? String(text).slice(0, 200) : null);

// ---------- 197 новости ----------
export function addNews(title, text) { db.prepare('INSERT INTO news (title, text, at) VALUES (?, ?, ?)').run(String(title).slice(0, 80), String(text).slice(0, 1000), Date.now()); }
export const news = () => db.prepare('SELECT id, title, text, at FROM news ORDER BY id DESC LIMIT 5').all();
export const delNews = (id) => db.prepare('DELETE FROM news WHERE id = ?').run(Number(id));

// ---------- 198 опросы ----------
export function addPoll(q, options) {
  const opts = (options || []).map((o) => String(o).trim().slice(0, 60)).filter(Boolean).slice(0, 6);
  if (!String(q || '').trim() || opts.length < 2) throw new Error('Вопрос и минимум 2 варианта');
  db.prepare('UPDATE polls SET open = 0').run();
  db.prepare('INSERT INTO polls (q, options, at) VALUES (?, ?, ?)').run(String(q).slice(0, 200), JSON.stringify(opts), Date.now());
}
export function pollView(uid) {
  const p = db.prepare('SELECT * FROM polls WHERE open = 1 ORDER BY id DESC LIMIT 1').get();
  if (!p) return null;
  const opts = JSON.parse(p.options);
  const votes = db.prepare('SELECT opt, COUNT(*) AS n FROM poll_votes WHERE poll_id = ? GROUP BY opt').all(p.id);
  const mine = db.prepare('SELECT opt FROM poll_votes WHERE poll_id = ? AND user_id = ?').get(p.id, uid)?.opt ?? null;
  return { id: p.id, q: p.q, options: opts, votes: opts.map((_, i) => votes.find((v) => v.opt === i)?.n || 0), mine };
}
export function vote(uid, pollId, opt) {
  const p = db.prepare('SELECT * FROM polls WHERE id = ? AND open = 1').get(Number(pollId));
  if (!p) throw new Error('Опрос закрыт');
  if (!(Number(opt) >= 0 && Number(opt) < JSON.parse(p.options).length)) throw new Error('Нет такого варианта');
  db.prepare('INSERT OR IGNORE INTO poll_votes (poll_id, user_id, opt) VALUES (?, ?, ?)').run(p.id, uid, Number(opt));
}

// ---------- 199 отзывы ----------
export function addFeedback(uid, text) {
  text = String(text || '').trim().slice(0, 1000);
  if (text.length < 5) throw new Error('Напиши хотя бы пару слов');
  if (db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND at > ?').get(uid, Date.now() - DAY).n >= 5) throw new Error('Не больше 5 отзывов в день');
  db.prepare('INSERT INTO feedback (user_id, text, at) VALUES (?, ?, ?)').run(uid, text, Date.now());
}
export const feedbackList = () => db.prepare('SELECT f.id, f.text, f.at, u.name, f.user_id FROM feedback f JOIN users u ON u.id = f.user_id WHERE done = 0 ORDER BY f.id DESC LIMIT 50').all();
export const feedbackDone = (id) => db.prepare('UPDATE feedback SET done = 1 WHERE id = ?').run(Number(id));
export { NOT_ADMIN };
