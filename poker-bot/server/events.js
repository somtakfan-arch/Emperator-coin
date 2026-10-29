// Ивенты: x2 к наградам или к опыту на время (включает админ).
import { db } from './db.js';

db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
const HOUR = 3600000;

export const EVENT_KINDS = { x2chips: 'x2 фишки за задания, достижения, бонус дня и сундуки', x2xp: 'x2 опыт пропуска' };
export function getEvent() {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'event'").get();
  if (!row) return null;
  try {
    const e = JSON.parse(row.value);
    return e.until > Date.now() ? e : null;
  } catch { return null; }
}
export function setEvent(kind, hours, title) {
  if (!kind) return db.prepare("DELETE FROM meta WHERE key = 'event'").run();
  if (!EVENT_KINDS[kind]) throw new Error('Нет такого ивента');
  const e = { kind, until: Date.now() + Math.max(1, Math.min(24 * 14, Number(hours) || 48)) * HOUR, title: String(title || '').slice(0, 60) || EVENT_KINDS[kind] };
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('event', ?)").run(JSON.stringify(e));
  return e;
}
export const eventMult = (kind) => (getEvent()?.kind === kind ? 2 : 1);

