// Админка: игроки, статистика и доход, рассылка, промокоды, ивенты.
import { db, tx, credit, getUser } from './db.js';
import { grantChest } from './progress.js';

const cols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
if (!cols.has('last_seen')) db.exec('ALTER TABLE users ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0');
db.exec(`
CREATE TABLE IF NOT EXISTS promos (
  code TEXT PRIMARY KEY, chips INTEGER NOT NULL DEFAULT 0, hints INTEGER NOT NULL DEFAULT 0, chest TEXT,
  max_uses INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, expires INTEGER, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS promo_uses (code TEXT NOT NULL, user_id INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (code, user_id));
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

export const touch = (uid) => db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), uid);

// ---------- Игроки ----------

export function searchUsers(q) {
  q = String(q || '').trim();
  if (/^\d+$/.test(q)) return db.prepare('SELECT * FROM users WHERE id = ?').all(Number(q)).map(brief);
  const like = `%${q.replace(/^@/, '').toLowerCase()}%`;
  return db.prepare('SELECT * FROM users WHERE LOWER(name) LIKE ? OR LOWER(username) LIKE ? ORDER BY last_seen DESC LIMIT 20').all(like, like).map(brief);
}
const brief = (u) => ({
  id: u.id, name: u.name, username: u.username, chips: u.chips, inPlay: u.in_play, rating: Math.round(u.rating),
  hints: u.hints, handsWon: u.hands_won, games: u.games, wins: u.wins, lastSeen: u.last_seen, created: u.created,
});

const FIELDS = { chips: 'chips', rating: 'rating', hints: 'hints', handsWon: 'hands_won' };
export function adjust(id, field, mode, value) {
  const col = FIELDS[field];
  if (!col) throw new Error('Неверное поле');
  const u = getUser(Number(id));
  if (!u) throw new Error('Игрок не найден');
  const v = Math.trunc(Number(value));
  if (!Number.isFinite(v)) throw new Error('Неверное число');
  const next = Math.max(0, mode === 'set' ? v : u[col] + v);
  tx(() => {
    db.prepare(`UPDATE users SET ${col} = ? WHERE id = ?`).run(next, u.id);
    if (col === 'chips' && next !== u.chips) db.prepare('INSERT INTO ledger (user_id, delta, reason, ref, at) VALUES (?, ?, ?, ?, ?)').run(u.id, next - u.chips, 'admin', 'panel', Date.now());
  });
  return brief(getUser(u.id));
}

// ---------- Статистика и доход ----------

const DAY = 86400000;
export function stats(activeTables) {
  const now = Date.now();
  const n = (sql, ...a) => db.prepare(sql).get(...a).n;
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * DAY + 3 * 3600000).toISOString().slice(0, 10);
    const from = Date.parse(`${d}T00:00:00+03:00`), to = from + DAY;
    const r = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(stars), 0) AS stars FROM payments WHERE refunded = 0 AND at >= ? AND at < ?').get(from, to);
    days.push({ day: d.slice(5), payments: r.n, stars: r.stars, newUsers: n('SELECT COUNT(*) AS n FROM users WHERE created >= ? AND created < ?', from, to) });
  }
  return {
    users: n('SELECT COUNT(*) AS n FROM users'),
    dau: n('SELECT COUNT(*) AS n FROM users WHERE last_seen > ?', now - DAY),
    wau: n('SELECT COUNT(*) AS n FROM users WHERE last_seen > ?', now - 7 * DAY),
    chips: db.prepare('SELECT COALESCE(SUM(chips + in_play), 0) AS n FROM users').get().n,
    starsTotal: db.prepare('SELECT COALESCE(SUM(stars), 0) AS n FROM payments WHERE refunded = 0').get().n,
    paymentsTotal: n('SELECT COUNT(*) AS n FROM payments WHERE refunded = 0'),
    payers: n('SELECT COUNT(DISTINCT user_id) AS n FROM payments WHERE refunded = 0'),
    activeTables,
    days,
  };
}

// ---------- Промокоды ----------

export function createPromo({ code, chips = 0, hints = 0, chest = null, maxUses = 100, days = 7 }) {
  code = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,24}$/.test(code)) throw new Error('Код — 3–24 латинских букв или цифр');
  chips = Math.max(0, Math.floor(Number(chips) || 0));
  hints = Math.max(0, Math.floor(Number(hints) || 0));
  if (chest && !['common', 'rare', 'epic'].includes(chest)) throw new Error('Неверный сундук');
  if (!chips && !hints && !chest) throw new Error('Промокод должен что-то давать');
  if (db.prepare('SELECT 1 FROM promos WHERE code = ?').get(code)) throw new Error('Такой код уже есть');
  db.prepare('INSERT INTO promos (code, chips, hints, chest, max_uses, expires, created) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(code, chips, hints, chest, Math.max(1, Math.floor(Number(maxUses) || 1)), Date.now() + Math.max(1, Number(days) || 7) * DAY, Date.now());
}

export const listPromos = () => db.prepare('SELECT * FROM promos ORDER BY created DESC LIMIT 30').all();
export const deletePromo = (code) => db.prepare('DELETE FROM promos WHERE code = ?').run(String(code).toUpperCase());

export function redeem(uid, code) {
  code = String(code || '').trim().toUpperCase();
  let res = null;
  tx(() => {
    const p = db.prepare('SELECT * FROM promos WHERE code = ?').get(code);
    if (!p) throw new Error('Нет такого промокода');
    if (p.expires && Date.now() > p.expires) throw new Error('Промокод истёк');
    if (p.used >= p.max_uses) throw new Error('Промокод закончился');
    if (db.prepare('SELECT 1 FROM promo_uses WHERE code = ? AND user_id = ?').get(code, uid)) throw new Error('Ты уже вводил этот код');
    db.prepare('INSERT INTO promo_uses (code, user_id, at) VALUES (?, ?, ?)').run(code, uid, Date.now());
    db.prepare('UPDATE promos SET used = used + 1 WHERE code = ?').run(code);
    if (p.chips) credit(uid, p.chips, 'promo', code);
    if (p.hints) db.prepare('UPDATE users SET hints = hints + ? WHERE id = ?').run(p.hints, uid);
    if (p.chest) grantChest(uid, p.chest);
    res = [p.chips && `+${p.chips.toLocaleString('ru')} фишек`, p.hints && `+${p.hints} подсказки`, p.chest && 'сундук'].filter(Boolean).join(', ');
  });
  return res;
}

// ивенты — в events.js (их читает и прогресс)
export { EVENT_KINDS, getEvent, setEvent, eventMult } from './events.js';

// ---------- Рассылка: не быстрее ~20 сообщений в секунду ----------

let broadcasting = null;
export function startBroadcast(text, send) {
  if (broadcasting) throw new Error('Рассылка уже идёт');
  text = String(text || '').trim().slice(0, 1500);
  if (text.length < 3) throw new Error('Пустое сообщение');
  const ids = db.prepare('SELECT id FROM users').all().map((r) => r.id);
  broadcasting = { total: ids.length, sent: 0, failed: 0, started: Date.now() };
  const st = broadcasting;
  (async () => {
    for (const id of ids) {
      try { await send(id, text); st.sent++; } catch { st.failed++; }
      await new Promise((r) => setTimeout(r, 50));
    }
    st.done = Date.now();
    setTimeout(() => { if (broadcasting === st) broadcasting = null; }, 60000);
  })();
  return st;
}
export const broadcastStatus = () => broadcasting;
