// Заметки и цветные метки на игроков (видит только автор). Ключ: u:<id> — человек, b:<имя> — бот.
import { db } from './db.js';

db.exec('CREATE TABLE IF NOT EXISTS player_notes (user_id INTEGER NOT NULL, target TEXT NOT NULL, note TEXT NOT NULL DEFAULT \'\', color TEXT, at INTEGER NOT NULL, PRIMARY KEY (user_id, target))');
export const TAG_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
const cache = new Map(); // uid -> Map(target -> { note, color })

function load(uid) {
  if (!cache.has(uid)) cache.set(uid, new Map(db.prepare('SELECT target, note, color FROM player_notes WHERE user_id = ?').all(uid).map((r) => [r.target, { note: r.note, color: r.color }])));
  return cache.get(uid);
}
export const keyOf = (p) => (p.isBot ? `b:${p.name}` : `u:${p.id}`);
export const noteOf = (uid, target) => load(uid).get(target) || null;
export function setNote(uid, target, note, color) {
  target = String(target || '');
  if (!/^(u:\d+|b:.{1,30})$/.test(target)) throw new Error('Неверный игрок');
  note = String(note || '').slice(0, 300);
  color = TAG_COLORS.includes(color) ? color : null;
  if (!note && !color) db.prepare('DELETE FROM player_notes WHERE user_id = ? AND target = ?').run(uid, target);
  else db.prepare(`INSERT INTO player_notes (user_id, target, note, color, at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id, target) DO UPDATE SET note = excluded.note, color = excluded.color, at = excluded.at`).run(uid, target, note, color, Date.now());
  cache.delete(uid);
}
