// Вход из обычного браузера (без Telegram): бот выдаёт личную ссылку с секретным ключом.
// В базе храним только хеш ключа. Ссылка живёт 90 дней, у игрока — до 5 ссылок, «выйти везде» удаляет все.
import { createHash, randomBytes } from 'node:crypto';
import { db, getUser } from './db.js';

db.exec('CREATE TABLE IF NOT EXISTS web_tokens (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created INTEGER NOT NULL, used INTEGER)');
const TTL = 90 * 86400000;
const sha = (t) => createHash('sha256').update(String(t)).digest('hex');

export function issue(uid) {
  const token = randomBytes(24).toString('base64url');
  db.prepare('INSERT INTO web_tokens (hash, user_id, created) VALUES (?, ?, ?)').run(sha(token), uid, Date.now());
  // держим не больше 5 последних ссылок
  db.prepare('DELETE FROM web_tokens WHERE user_id = ? AND hash NOT IN (SELECT hash FROM web_tokens WHERE user_id = ? ORDER BY created DESC LIMIT 5)').run(uid, uid);
  return token;
}
// ключ → игрок (или null, если ключ неверный или устарел)
export function check(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const h = sha(token);
  const r = db.prepare('SELECT user_id, created FROM web_tokens WHERE hash = ?').get(h);
  if (!r) return null;
  if (r.created < Date.now() - TTL) { db.prepare('DELETE FROM web_tokens WHERE hash = ?').run(h); return null; }
  db.prepare('UPDATE web_tokens SET used = ? WHERE hash = ?').run(Date.now(), h);
  const u = getUser(r.user_id);
  return u ? { id: u.id, first_name: u.name, username: u.username || undefined } : null;
}
export const revokeAll = (uid) => db.prepare('DELETE FROM web_tokens WHERE user_id = ?').run(uid).changes;
export const linkFor = (base, token) => `${String(base || '').replace(/\/?$/, '/')}?login=${token}`;
