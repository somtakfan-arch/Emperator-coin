// Лента активности: крупные выигрыши, достижения, победы в турнирах (видят друзья и подписчики).
import { db } from './db.js';

db.exec(`
CREATE TABLE IF NOT EXISTS feed (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS feed_user ON feed (user_id, at);
`);
export function addFeed(uid, kind, text) {
  if (!uid || uid < 0) return;
  db.prepare('INSERT INTO feed (user_id, kind, text, at) VALUES (?, ?, ?, ?)').run(uid, kind, String(text).slice(0, 200), Date.now());
  if (Math.random() < 0.02) db.prepare('DELETE FROM feed WHERE at < ?').run(Date.now() - 14 * 86400000);
}

// простой фильтр мата: заменяем звёздочками
const BAD = ['хуй', 'хуе', 'хуё', 'пизд', 'ебат', 'ебан', 'ёбан', 'бля', 'сука', 'мудак', 'долбоёб', 'долбоеб', 'пидор', 'гандон', 'fuck', 'shit', 'bitch'];
export function filterText(t) {
  let s = String(t || '');
  for (const w of BAD) s = s.replace(new RegExp(`[а-яёa-z]*${w}[а-яёa-z]*`, 'gi'), (m) => m[0] + '*'.repeat(Math.max(1, m.length - 1)));
  return s;
}

