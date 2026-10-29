// Прогресс игрока: статистика, достижения, задания дня и недели, бонус по дням,
// сундуки, ранги, сезоны и пропуск (бесплатная линия наград).
// Всё хранится в users.progress (JSON), для таблиц лидеров — отдельные колонки.
import { db, tx, credit } from './db.js';
import { config } from './config.js';

const cols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
if (!cols.has('progress')) db.exec("ALTER TABLE users ADD COLUMN progress TEXT NOT NULL DEFAULT '{}'");
if (!cols.has('biggest_pot')) db.exec('ALTER TABLE users ADD COLUMN biggest_pot INTEGER NOT NULL DEFAULT 0');
db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

const getP = db.prepare('SELECT progress, rating FROM users WHERE id = ?');
const setP = db.prepare('UPDATE users SET progress = ? WHERE id = ?');

// ---------- Время: день и неделя по Москве, сезон — месяц ----------

const msk = (t = Date.now()) => new Date(t + 3 * 3600000);
export const dayKey = (t) => msk(t).toISOString().slice(0, 10);
export function weekKey(t) {
  const d = msk(t);
  const day = (d.getUTCDay() + 6) % 7; // пн = 0
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}
export const seasonKey = (t) => msk(t).toISOString().slice(0, 7);
const SEASON_NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
function seasonInfo() {
  const d = msk();
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 3 * 3600000;
  return { key: seasonKey(), name: `Сезон: ${SEASON_NAMES[d.getUTCMonth()]}`, endsAt: end };
}

// ---------- Ранги по Эло ----------

export const RANKS = [
  { name: 'Бронза', from: 0, color: '#c98a5a' },
  { name: 'Серебро', from: 1600, color: '#c9d1d6' },
  { name: 'Золото', from: 1900, color: '#f2c94c' },
  { name: 'Платина', from: 2300, color: '#7fd1c8' },
  { name: 'Алмаз', from: 2800, color: '#8fb8ff' },
  { name: 'Легенда', from: 3500, color: '#e08cff' },
];
export function rankOf(rating) {
  let r = RANKS[0];
  for (const x of RANKS) if (rating >= x.from) r = x;
  return r;
}

// ---------- Достижения ----------

export const ACHIEVEMENTS = [
  { key: 'first_win', name: 'Первая кровь', text: 'Выиграй первую раздачу', chips: 200 },
  { key: 'wins_100', name: 'Сотка', text: 'Выиграй 100 раздач', chips: 1000 },
  { key: 'wins_1000', name: 'Тысячник', text: 'Выиграй 1000 раздач', chips: 5000, chest: 'epic' },
  { key: 'hands_500', name: 'Завсегдатай', text: 'Сыграй 500 раздач', chips: 1500 },
  { key: 'straight', name: 'По порядку', text: 'Выиграй со стритом', chips: 200 },
  { key: 'flush', name: 'Одной масти', text: 'Выиграй с флешем', chips: 300 },
  { key: 'full_house', name: 'Полный дом', text: 'Выиграй с фулл-хаусом', chips: 500 },
  { key: 'quads', name: 'Каре!', text: 'Выиграй с каре', chips: 1000, chest: 'rare' },
  { key: 'straight_flush', name: 'Стрит-флеш', text: 'Выиграй со стрит-флешем', chips: 3000, chest: 'epic' },
  { key: 'royal', name: 'Королевский', text: 'Собери флеш-рояль', chips: 10000, chest: 'epic' },
  { key: 'big_pot', name: 'Большой банк', text: 'Выиграй банк от 100 больших блайндов', chips: 500 },
  { key: 'streak_5', name: 'В огне', text: 'Выиграй 5 раздач подряд', chips: 700 },
  { key: 'beat_king', name: 'Цареубийца', text: 'Выиграй банк у Короля', chips: 2000, chest: 'rare' },
  { key: 'beat_all', name: 'Чистый стол', text: 'Обыграй всех ботов за столом', chips: 1000 },
  { key: 'allin_win', name: 'Ва-банк', text: 'Выиграй олл-ин на вскрытии', chips: 300 },
  { key: 'tour_win', name: 'Чемпион', text: 'Выиграй турнир', chips: 1500, chest: 'rare' },
  { key: 'solo60_win', name: 'Один из шестидесяти', text: 'Выиграй сольный турнир на 60', chips: 5000, chest: 'epic' },
  { key: 'streak_7', name: 'Неделя подряд', text: 'Заходи 7 дней подряд', chips: 1000 },
  { key: 'chest_10', name: 'Кладоискатель', text: 'Открой 10 сундуков', chips: 1000 },
  { key: 'gold', name: 'Золото', text: 'Дойди до ранга «Золото»', chips: 2000, chest: 'rare' },
];

// ---------- Задания ----------

const DAILY = [
  { key: 'win5', text: 'Выиграй 5 раздач', need: 5, ev: 'win', chips: 300, xp: 40 },
  { key: 'play20', text: 'Сыграй 20 раздач', need: 20, ev: 'hand', chips: 200, xp: 40 },
  { key: 'show2', text: 'Выиграй 2 раза на вскрытии', need: 2, ev: 'showdownWin', chips: 300, xp: 40 },
  { key: 'flushp', text: 'Выиграй с флешем или старше', need: 1, ev: 'flushPlus', chips: 500, xp: 60 },
  { key: 'pot30', text: 'Выиграй банк от 30 больших блайндов', need: 1, ev: 'bigPot30', chips: 400, xp: 50 },
  { key: 'tour1', text: 'Сыграй турнир', need: 1, ev: 'tour', chips: 400, xp: 50 },
  { key: 'allin1', text: 'Выиграй олл-ин', need: 1, ev: 'allinWin', chips: 400, xp: 50 },
];
const WEEKLY = [
  { key: 'w_win50', text: 'Выиграй 50 раздач', need: 50, ev: 'win', chips: 2000, xp: 200, chest: 'rare' },
  { key: 'w_play200', text: 'Сыграй 200 раздач', need: 200, ev: 'hand', chips: 1500, xp: 200 },
  { key: 'w_tour3', text: 'Сыграй 3 турнира', need: 3, ev: 'tour', chips: 2000, xp: 200 },
  { key: 'w_top3', text: 'Попади в тройку в турнире', need: 1, ev: 'tourTop3', chips: 3000, xp: 250, chest: 'rare' },
  { key: 'w_full', text: 'Выиграй с фулл-хаусом или старше', need: 1, ev: 'fullPlus', chips: 1500, xp: 150 },
];

// случайный, но одинаковый на весь день набор заданий для игрока
function pickQuests(pool, n, seed) {
  let x = 0;
  for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  const arr = pool.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) >>> 0;
    const j = x % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n).map((q) => ({ key: q.key, p: 0, claimed: false }));
}

// ---------- Бонус по дням и сундуки ----------

export const DAILY_STREAK = [100, 150, 200, 300, 400, 500, 'chest'];
export const CHESTS = {
  common: { name: 'Обычный сундук', chips: [200, 600], hints: [0, 1], xp: 30 },
  rare: { name: 'Редкий сундук', chips: [800, 2000], hints: [1, 2], xp: 80 },
  epic: { name: 'Эпический сундук', chips: [3000, 8000], hints: [2, 5], xp: 200 },
};

// ---------- Пропуск сезона: 30 уровней по 100 опыта ----------

export const PASS_LEVELS = Array.from({ length: 30 }, (_, i) => {
  const lvl = i + 1;
  if (lvl % 10 === 0) return { lvl, chest: 'epic' };
  if (lvl % 5 === 0) return { lvl, chest: 'rare' };
  if (lvl % 3 === 0) return { lvl, hints: 1 };
  return { lvl, chips: 100 + lvl * 20 };
});
const XP_PER_LEVEL = 100;

// ---------- Хранилище ----------

function load(uid) {
  const row = getP.get(uid);
  if (!row) return null;
  let p = {};
  try { p = JSON.parse(row.progress || '{}'); } catch {}
  p.stats ||= { hands: 0, wins: 0, vpip: 0, showdowns: 0, showdownWins: 0, bestCat: -1, tours: 0, tourWins: 0, chestsOpened: 0, bestStreak: 0, streak: 0 };
  p.ach ||= {};
  p.chests ||= { common: 0, rare: 0, epic: 0 };
  const day = dayKey(), week = weekKey(), season = seasonKey();
  if (p.daily?.key !== day) p.daily = { key: day, quests: pickQuests(DAILY, 3, `${uid}:${day}`) };
  if (p.weekly?.key !== week) p.weekly = { key: week, quests: pickQuests(WEEKLY, 3, `${uid}:${week}`) };
  if (p.pass?.season !== season) p.pass = { season, xp: 0, claimed: [] };
  p.bonus ||= { day: null, streak: 0 };
  return p;
}
const save = (uid, p) => setP.run(JSON.stringify(p), uid);

// ---------- События ----------

let notify = () => {};
export function setProgressNotifier(fn) {
  notify = fn;
}

function addXp(p, n) {
  p.pass.xp += n;
}

function unlock(uid, p, key, out) {
  if (p.ach[key]) return;
  const a = ACHIEVEMENTS.find((x) => x.key === key);
  if (!a) return;
  p.ach[key] = Date.now();
  if (a.chips && config.progressRewards) credit(uid, a.chips, 'achievement', key);
  if (a.chest) p.chests[a.chest]++;
  addXp(p, 50);
  out.push(`🏅 Достижение «${a.name}»: +${a.chips} фишек${a.chest ? ` и ${CHESTS[a.chest].name.toLowerCase()}` : ''}`);
}

function bumpQuests(p, evs, out) {
  for (const [list, pool] of [[p.daily.quests, DAILY], [p.weekly.quests, WEEKLY]]) {
    for (const q of list) {
      const def = pool.find((x) => x.key === q.key);
      if (!def || q.p >= def.need) continue;
      const n = evs[def.ev] || 0;
      if (!n) continue;
      q.p = Math.min(def.need, q.p + n);
      if (q.p >= def.need) out.push(`✅ Задание выполнено: «${def.text}» — забери награду в профиле`);
    }
  }
}

// Итог раздачи для живого игрока (на демо-столах не вызывается)
export function onHand(uid, h) {
  const out = [];
  tx(() => {
    const p = load(uid);
    if (!p) return;
    const s = p.stats;
    s.hands++;
    if (h.vpip) s.vpip++;
    if (h.showdown) s.showdowns++;
    addXp(p, 1);
    const evs = { hand: 1 };
    if (h.won) {
      s.wins++;
      addXp(p, 4);
      evs.win = 1;
      s.streak = (s.streak || 0) + 1;
      s.bestStreak = Math.max(s.bestStreak || 0, s.streak);
      if (h.showdown) { s.showdownWins++; evs.showdownWin = 1; }
      if (h.cat != null) s.bestCat = Math.max(s.bestCat, h.cat);
      if (h.cat >= 5) evs.flushPlus = 1;
      if (h.cat >= 6) evs.fullPlus = 1;
      if (h.amount >= 30 * h.bb) evs.bigPot30 = 1;
      if (h.allIn && h.showdown) evs.allinWin = 1;
      if (h.amount > 0) db.prepare('UPDATE users SET biggest_pot = MAX(biggest_pot, ?) WHERE id = ?').run(h.amount, uid);
      // достижения
      unlock(uid, p, 'first_win', out);
      if (h.handsWon >= 100) unlock(uid, p, 'wins_100', out);
      if (h.handsWon >= 1000) unlock(uid, p, 'wins_1000', out);
      if (h.cat === 4) unlock(uid, p, 'straight', out);
      if (h.cat === 5) unlock(uid, p, 'flush', out);
      if (h.cat === 6) unlock(uid, p, 'full_house', out);
      if (h.cat === 7) unlock(uid, p, 'quads', out);
      if (h.cat === 8 && !h.royal) unlock(uid, p, 'straight_flush', out);
      if (h.royal) unlock(uid, p, 'royal', out);
      if (h.amount >= 100 * h.bb) unlock(uid, p, 'big_pot', out);
      if (s.streak >= 5) unlock(uid, p, 'streak_5', out);
      if (h.vsKing) unlock(uid, p, 'beat_king', out);
      if (h.allIn && h.showdown) unlock(uid, p, 'allin_win', out);
    } else s.streak = 0;
    if (s.hands >= 500) unlock(uid, p, 'hands_500', out);
    if (getP.get(uid).rating >= 1900) unlock(uid, p, 'gold', out);
    bumpQuests(p, evs, out);
    save(uid, p);
  });
  for (const t of out) notify(uid, t);
}

// Другие события: турнир доигран, обыграл всех ботов
export function onEvent(uid, ev) {
  const out = [];
  tx(() => {
    const p = load(uid);
    if (!p) return;
    const evs = {};
    if (ev.type === 'tour') {
      p.stats.tours++;
      evs.tour = 1;
      addXp(p, 20);
      if (ev.place <= 3) evs.tourTop3 = 1;
      if (ev.place === 1) {
        p.stats.tourWins++;
        unlock(uid, p, 'tour_win', out);
        if (ev.solo && ev.size === 60) unlock(uid, p, 'solo60_win', out);
      }
    }
    if (ev.type === 'beatAll') unlock(uid, p, 'beat_all', out);
    if (ev.type === 'rating' && ev.rating >= 1900) unlock(uid, p, 'gold', out);
    bumpQuests(p, evs, out);
    save(uid, p);
  });
  for (const t of out) notify(uid, t);
}

// ---------- Действия игрока ----------

const rnd = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));

export function claimQuest(uid, period, key) {
  let msg = null;
  tx(() => {
    const p = load(uid);
    const list = period === 'weekly' ? p.weekly.quests : p.daily.quests;
    const pool = period === 'weekly' ? WEEKLY : DAILY;
    const q = list.find((x) => x.key === key);
    const def = pool.find((x) => x.key === key);
    if (!q || !def) throw new Error('Нет такого задания');
    if (q.claimed) throw new Error('Награда уже получена');
    if (q.p < def.need) throw new Error('Задание ещё не выполнено');
    q.claimed = true;
    credit(uid, def.chips, 'quest', key);
    addXp(p, def.xp);
    if (def.chest) p.chests[def.chest]++;
    save(uid, p);
    msg = `+${def.chips} фишек, +${def.xp} опыта${def.chest ? `, ${CHESTS[def.chest].name.toLowerCase()}` : ''}`;
  });
  return msg;
}

export function claimDaily(uid) {
  let msg = null;
  const out = [];
  tx(() => {
    const p = load(uid);
    const today = dayKey();
    if (p.bonus.day === today) throw new Error('Сегодня бонус уже получен — приходи завтра');
    const yesterday = dayKey(Date.now() - 86400000);
    p.bonus.streak = p.bonus.day === yesterday ? p.bonus.streak + 1 : 1;
    p.bonus.day = today;
    const reward = DAILY_STREAK[(p.bonus.streak - 1) % 7];
    if (reward === 'chest') {
      p.chests.rare++;
      msg = `День ${p.bonus.streak}: редкий сундук!`;
    } else {
      credit(uid, reward, 'daily_bonus');
      msg = `День ${p.bonus.streak}: +${reward} фишек`;
    }
    addXp(p, 10);
    if (p.bonus.streak >= 7) unlock(uid, p, 'streak_7', out);
    save(uid, p);
  });
  for (const t of out) notify(uid, t);
  return msg;
}

export function openChest(uid, kind) {
  let res = null;
  const out = [];
  tx(() => {
    const p = load(uid);
    const def = CHESTS[kind];
    if (!def || !(p.chests[kind] > 0)) throw new Error('Такого сундука нет');
    p.chests[kind]--;
    const chips = rnd(def.chips);
    const hints = rnd(def.hints);
    credit(uid, chips, 'chest', kind);
    if (hints) db.prepare('UPDATE users SET hints = hints + ? WHERE id = ?').run(hints, uid);
    addXp(p, def.xp);
    p.stats.chestsOpened = (p.stats.chestsOpened || 0) + 1;
    if (p.stats.chestsOpened >= 10) unlock(uid, p, 'chest_10', out);
    // косметика из сундука (рамки, рубашки) — если модуль внешнего вида её подключил
    const cosmetic = chestCosmetic?.(p, kind);
    save(uid, p);
    res = { kind, name: def.name, chips, hints, xp: def.xp, cosmetic };
  });
  for (const t of out) notify(uid, t);
  return res;
}
let chestCosmetic = null;
export function setChestCosmetic(fn) {
  chestCosmetic = fn;
}

export function claimPass(uid, lvl) {
  let msg = null;
  tx(() => {
    const p = load(uid);
    const L = PASS_LEVELS.find((x) => x.lvl === Number(lvl));
    if (!L) throw new Error('Нет такого уровня');
    if (Math.floor(p.pass.xp / XP_PER_LEVEL) < L.lvl) throw new Error('Уровень ещё не открыт');
    if (p.pass.claimed.includes(L.lvl)) throw new Error('Награда уже получена');
    p.pass.claimed.push(L.lvl);
    if (L.chips) credit(uid, L.chips, 'pass', String(L.lvl));
    if (L.hints) db.prepare('UPDATE users SET hints = hints + ? WHERE id = ?').run(L.hints, uid);
    if (L.chest) p.chests[L.chest]++;
    save(uid, p);
    msg = L.chips ? `+${L.chips} фишек` : L.hints ? `+${L.hints} подсказка` : CHESTS[L.chest].name;
  });
  return msg;
}

// Всё для экрана «Прогресс»
export function progressView(uid) {
  const p = load(uid);
  if (!p) return null;
  save(uid, p); // фиксируем новые задания дня/недели
  const rating = getP.get(uid).rating;
  const rank = rankOf(rating);
  const next = RANKS[RANKS.indexOf(rank) + 1] || null;
  const q = (list, pool) => list.map((x) => {
    const d = pool.find((y) => y.key === x.key);
    return { key: x.key, text: d.text, need: d.need, p: x.p, claimed: x.claimed, chips: d.chips, xp: d.xp, chest: d.chest || null };
  });
  const level = Math.floor(p.pass.xp / XP_PER_LEVEL);
  return {
    stats: p.stats,
    rank: { ...rank, next: next ? { name: next.name, from: next.from } : null, rating: Math.round(rating) },
    achievements: ACHIEVEMENTS.map((a) => ({ ...a, at: p.ach[a.key] || null })),
    daily: q(p.daily.quests, DAILY),
    weekly: q(p.weekly.quests, WEEKLY),
    bonus: { streak: p.bonus.streak, today: p.bonus.day === dayKey(), table: DAILY_STREAK },
    chests: p.chests,
    pass: { xp: p.pass.xp, level, perLevel: XP_PER_LEVEL, claimed: p.pass.claimed, levels: PASS_LEVELS },
    season: seasonInfo(),
  };
}

// ---------- Сезон: в начале месяца награды по рангу и мягкий сброс Эло ----------

const SEASON_REWARD = { Бронза: 300, Серебро: 800, Золото: 2000, Платина: 4000, Алмаз: 8000, Легенда: 15000 };
export function checkSeason(onDone) {
  const cur = seasonKey();
  const row = db.prepare("SELECT value FROM meta WHERE key = 'season'").get();
  if (!row) return db.prepare("INSERT INTO meta (key, value) VALUES ('season', ?)").run(cur);
  if (row.value === cur) return;
  const ended = row.value;
  const users = db.prepare('SELECT id, rating FROM users').all();
  tx(() => {
    for (const u of users) {
      const rank = rankOf(u.rating);
      const chips = SEASON_REWARD[rank.name];
      if (u.rating !== 1500 && chips) credit(u.id, chips, 'season', ended);
      // мягкий сброс: половина пути к 1500
      db.prepare('UPDATE users SET rating = ? WHERE id = ?').run(1500 + (u.rating - 1500) * 0.5, u.id);
    }
    db.prepare("UPDATE meta SET value = ? WHERE key = 'season'").run(cur);
  });
  onDone?.(users.filter((u) => u.rating !== 1500).map((u) => ({ id: u.id, rank: rankOf(u.rating).name, chips: SEASON_REWARD[rankOf(u.rating).name] })));
}
