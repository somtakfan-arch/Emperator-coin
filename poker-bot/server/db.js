// База на встроенном SQLite (node:sqlite) — без внешних зависимостей.
// Каждое движение фишек пишется в ledger, чтобы любой баланс можно было проверить.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { config } from './config.js';

mkdirSync(config.dataDir, { recursive: true });
export const db = new DatabaseSync(config.dataDir + '/poker.db');
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, username TEXT,
  chips INTEGER NOT NULL DEFAULT 0, in_play INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 1500, games INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0,
  bonus_at INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, delta INTEGER NOT NULL,
  reason TEXT NOT NULL, ref TEXT, at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  charge_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, stars INTEGER NOT NULL, chips INTEGER NOT NULL,
  pack TEXT NOT NULL, at INTEGER NOT NULL, refunded INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, creator INTEGER, kind TEXT NOT NULL,
  max_players INTEGER NOT NULL, buyin INTEGER NOT NULL, min_rating INTEGER NOT NULL DEFAULT 0,
  blind_min INTEGER NOT NULL, start_mode TEXT NOT NULL, start_at INTEGER, private INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, created INTEGER NOT NULL, started INTEGER, finished INTEGER, reminded INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS regs (
  t_id TEXT NOT NULL, user_id INTEGER NOT NULL, at INTEGER NOT NULL, place INTEGER, prize INTEGER,
  PRIMARY KEY (t_id, user_id)
);
CREATE TABLE IF NOT EXISTS bot_memory (
  user_id INTEGER NOT NULL, bot TEXT NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (user_id, bot)
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id);
CREATE INDEX IF NOT EXISTS t_status ON tournaments(status);
`);

// Новые колонки для уже существующих баз
const userCols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
if (!userCols.has('won')) db.exec('ALTER TABLE users ADD COLUMN won INTEGER NOT NULL DEFAULT 0'); // чистый выигрыш в играх
if (!userCols.has('won_rewards')) db.exec('ALTER TABLE users ADD COLUMN won_rewards INTEGER NOT NULL DEFAULT 0'); // сколько наград выдано
if (!userCols.has('hints')) db.exec('ALTER TABLE users ADD COLUMN hints INTEGER NOT NULL DEFAULT 0'); // купленные подсказки

// Списать одну подсказку. false — подсказок нет.
export function useHint(id) {
  return db.prepare('UPDATE users SET hints = hints - 1 WHERE id = ? AND hints > 0').run(id).changes > 0;
}

// Награды Эло за чистый выигрыш (разовые)
export const WIN_REWARDS = [
  { at: 5000, elo: 100 },
  { at: 10000, elo: 250 },
];

// Учесть результат игровой сессии (стол против ботов или турнир). Возвращает выданные награды.
export function addWinnings(id, net) {
  if (!net) return [];
  return tx(() => {
    db.prepare('UPDATE users SET won = won + ? WHERE id = ?').run(Math.round(net), id);
    const u = db.prepare('SELECT won, won_rewards FROM users WHERE id = ?').get(id);
    const granted = [];
    let claimed = u.won_rewards;
    while (claimed < WIN_REWARDS.length && u.won >= WIN_REWARDS[claimed].at) {
      granted.push(WIN_REWARDS[claimed]);
      claimed++;
    }
    if (granted.length) {
      const elo = granted.reduce((a, r) => a + r.elo, 0);
      db.prepare('UPDATE users SET rating = rating + ?, won_rewards = ? WHERE id = ?').run(elo, claimed, id);
    }
    return granted;
  });
}

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const q = {
  user: db.prepare('SELECT * FROM users WHERE id = ?'),
  insertUser: db.prepare('INSERT INTO users (id, name, username, chips, created) VALUES (?, ?, ?, ?, ?)'),
  updateName: db.prepare('UPDATE users SET name = ?, username = ? WHERE id = ?'),
  debit: db.prepare('UPDATE users SET chips = chips - ? WHERE id = ? AND chips >= ?'),
  credit: db.prepare('UPDATE users SET chips = chips + ? WHERE id = ?'),
  ledger: db.prepare('INSERT INTO ledger (user_id, delta, reason, ref, at) VALUES (?, ?, ?, ?, ?)'),
  inPlay: db.prepare('UPDATE users SET in_play = in_play + ? WHERE id = ?'),
};

export const getUser = (id) => q.user.get(id);

// Создаёт игрока при первом входе, обновляет имя при следующих.
export function upsertUser(tg) {
  const name = [tg.first_name, tg.last_name].filter(Boolean).join(' ').slice(0, 40) || 'Игрок';
  const u = getUser(tg.id);
  if (!u) {
    tx(() => {
      q.insertUser.run(tg.id, name, tg.username || null, config.startChips, Date.now());
      if (config.startChips) q.ledger.run(tg.id, config.startChips, 'start', null, Date.now());
    });
  } else if (u.name !== name || u.username !== (tg.username || null)) {
    q.updateName.run(name, tg.username || null, tg.id);
  }
  return getUser(tg.id);
}

// Списать фишки. false — не хватает.
export function debit(id, amount, reason, ref = null) {
  return tx(() => {
    const r = q.debit.run(amount, id, amount);
    if (!r.changes) return false;
    q.ledger.run(id, -amount, reason, ref, Date.now());
    return true;
  });
}

export function credit(id, amount, reason, ref = null) {
  if (amount <= 0) return;
  tx(() => {
    q.credit.run(amount, id);
    q.ledger.run(id, amount, reason, ref, Date.now());
  });
}

export const addInPlay = (id, delta) => q.inPlay.run(delta, id);

// Место в рейтинге по Эло и по фишкам
export function ranks(id) {
  const u = getUser(id);
  if (!u) return { ratingPlace: 0, chipsPlace: 0 };
  return {
    ratingPlace: db.prepare('SELECT COUNT(*) AS n FROM users WHERE rating > ?').get(u.rating).n + 1,
    chipsPlace: db.prepare('SELECT COUNT(*) AS n FROM users WHERE chips + in_play > ?').get(u.chips + u.in_play).n + 1,
  };
}

// После перезапуска сервера: вернуть фишки со столов против ботов
// и взносы незавершённых турниров (игры в памяти пропали).
export function recoverAfterRestart() {
  tx(() => {
    for (const u of db.prepare('SELECT id, in_play FROM users WHERE in_play > 0').all()) {
      q.credit.run(u.in_play, u.id);
      q.ledger.run(u.id, u.in_play, 'restart_return', null, Date.now());
    }
    db.exec('UPDATE users SET in_play = 0');
    for (const t of db.prepare("SELECT * FROM tournaments WHERE status = 'running'").all()) {
      for (const r of db.prepare('SELECT user_id FROM regs WHERE t_id = ?').all(t.id)) {
        q.credit.run(t.buyin, r.user_id);
        q.ledger.run(r.user_id, t.buyin, 'refund_restart', t.id, Date.now());
      }
      db.prepare("UPDATE tournaments SET status = 'cancelled', finished = ? WHERE id = ?").run(Date.now(), t.id);
    }
  });
}
