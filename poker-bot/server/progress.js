// Прогресс игрока: статистика, достижения, задания дня и недели, бонус по дням,
// сундуки, ранги, сезоны и пропуск (бесплатная линия наград).
// Всё хранится в users.progress (JSON), для таблиц лидеров — отдельные колонки.
import { db, tx, credit } from './db.js';
import { config, NOT_ADMIN } from './config.js';
import { eventMult } from './events.js';

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
  { key: 'ghost', name: 'Охотник за привидениями', text: 'Обыграй Призрака в 3 ночи', chips: 3000, chest: 'epic' },
  { key: 'cheater', name: 'Детектив', text: 'Поймай Шулера', chips: 500 },
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
  { key: 'hands_100', name: 'Разогрев', text: 'Сыграй 100 раздач', chips: 500 },
  { key: 'hands_1000', name: 'Тысяча раздач', text: 'Сыграй 1000 раздач', chips: 3000, chest: 'rare' },
  { key: 'hands_10000', name: 'Десять тысяч', text: 'Сыграй 10 000 раздач', chips: 20000, chest: 'epic' },
  { key: 'collector', name: 'Коллекционер', text: 'Собери все 52 карты в коллекцию', chips: 10000, chest: 'epic' },
  { key: 'album', name: 'Полный альбом', text: 'Выиграй со всеми комбинациями', chips: 5000, chest: 'epic' },
  { key: 'prestige', name: 'Престиж', text: 'Получи первую звезду престижа', chips: 5000 },
  // секретные: не видно, пока не откроешь
  { key: 'seven_deuce', name: 'Наглость', text: 'Выиграй с 7-2 на руках', chips: 1000, secret: true },
  { key: 'night_owl', name: 'Сова', text: 'Выиграй раздачу между 2 и 5 часами ночи', chips: 700, secret: true },
  { key: 'aces_cracked', name: 'Боль', text: 'Проиграй с тузами на руках', chips: 300, secret: true },
  { key: 'wheel_jackpot', name: 'Джекпот', text: 'Выбей главный приз в колесе удачи', chips: 0, secret: true },
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
  const v = Math.round(n * eventMult('x2xp') * (1 + 0.1 * (p.skills?.xp || 0))); // ивент «x2 опыт», навык «Опыт»
  p.pass.xp += v;
  p.xpTotal = (p.xpTotal || 0) + v; // опыт за всё время — уровень аккаунта
}
const x2 = (chips) => chips * eventMult('x2chips'); // ивент «x2 фишки»

function unlock(uid, p, key, out) {
  if (p.ach[key]) return;
  const a = ACHIEVEMENTS.find((x) => x.key === key);
  if (!a) return;
  p.ach[key] = Date.now();
  if (a.chips && config.progressRewards) credit(uid, x2(a.chips), 'achievement', key);
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
      // коллекция карт: каждая карта, с которой ты выиграл
      p.cards ||= [];
      for (const c of h.hole || []) if (c < 52 && !p.cards.includes(c)) p.cards.push(c);
      if (p.cards.length >= 52) unlock(uid, p, 'collector', out);
      // альбом комбинаций: первый выигрыш с каждой
      if (h.cat != null) {
        p.album ||= {};
        const k = h.royal ? 'royal' : String(h.cat);
        if (!p.album[k]) p.album[k] = Date.now();
        if (Object.keys(p.album).length >= 10) unlock(uid, p, 'album', out);
      }
      // лучшая рука в жизни
      if (h.score != null && h.score > (p.best?.score ?? -1)) p.best = { score: h.score, name: h.handName, cards: h.five, at: Date.now() };
      // секретные
      const ranks = (h.hole || []).map((c) => c >> 2).sort((a, b) => a - b);
      if (ranks.length === 2 && ranks[0] === 0 && ranks[1] === 5 && ((h.hole[0] & 3) !== (h.hole[1] & 3))) unlock(uid, p, 'seven_deuce', out);
      const hr = msk().getUTCHours();
      if (hr >= 2 && hr < 5) unlock(uid, p, 'night_owl', out);
      // испытание дня
      checkChallenge(uid, p, h, out);
    } else {
      s.streak = 0;
      if ((h.hole || []).length === 2 && h.hole.every((c) => c >> 2 === 12) && h.showdown) unlock(uid, p, 'aces_cracked', out);
    }
    if (s.hands >= 100) unlock(uid, p, 'hands_100', out);
    if (s.hands >= 1000) unlock(uid, p, 'hands_1000', out);
    if (s.hands >= 10000) unlock(uid, p, 'hands_10000', out);
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
      // медали за турниры и очки недели для зала славы
      p.medals ||= { gold: 0, silver: 0, bronze: 0 };
      if (ev.place === 1) p.medals.gold++;
      if (ev.place === 2) p.medals.silver++;
      if (ev.place === 3) p.medals.bronze++;
      addFame.run(uid, weekKey(), ev.place === 1 ? 10 : ev.place === 2 ? 6 : ev.place === 3 ? 4 : 1);
      if (ev.place === 1) {
        p.stats.tourWins++;
        unlock(uid, p, 'tour_win', out);
        if (ev.solo && ev.size === 60) unlock(uid, p, 'solo60_win', out);
      }
    }
    if (ev.type === 'beatAll') unlock(uid, p, 'beat_all', out);
    if (ev.type === 'beatAll' && ev.bots?.includes('Призрак')) unlock(uid, p, 'ghost', out);
    if (ev.type === 'caughtCheater') unlock(uid, p, 'cheater', out);
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
    credit(uid, x2(def.chips), 'quest', key);
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
      const chips = Math.round(x2(reward) * (1 + 0.1 * (p.skills?.daily || 0))); // навык «Бонус дня»
      credit(uid, chips, 'daily_bonus');
      msg = `День ${p.bonus.streak}: +${chips} фишек`;
    }
    // навык «Подсказка дня»
    if (p.skills?.hint) { db.prepare('UPDATE users SET hints = hints + 1 WHERE id = ?').run(uid); msg += ' и подсказка'; }
    // календарь месяца: отмечаем день, за 10/20/30 дней — сундуки
    const month = seasonKey();
    if (p.cal?.month !== month) p.cal = { month, days: [] };
    const dom = msk().getUTCDate();
    if (!p.cal.days.includes(dom)) p.cal.days.push(dom);
    const n = p.cal.days.length;
    if (n === 10 || n === 20) { p.chests.rare++; msg += ` · календарь: ${n} дней — редкий сундук`; }
    if (n === 30) { p.chests.epic++; msg += ' · календарь: 30 дней — эпический сундук!'; }
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
    const chips = Math.round(x2(rnd(def.chips)) * (1 + 0.1 * (p.skills?.chest || 0))); // навык «Сундуки»
    const hints = rnd(def.hints);
    credit(uid, chips, 'chest', kind);
    if (hints) db.prepare('UPDATE users SET hints = hints + ? WHERE id = ?').run(hints, uid);
    addXp(p, def.xp);
    p.stats.chestsOpened = (p.stats.chestsOpened || 0) + 1;
    if (p.stats.chestsOpened >= 10) unlock(uid, p, 'chest_10', out);
    // косметика из сундука (рамки, рубашки) — если модуль внешнего вида её подключил
    const cosmetic = chestCosmetic?.(p, kind, uid);
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
    if (L.chips) credit(uid, x2(L.chips), 'pass', String(L.lvl));
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
    achievements: ACHIEVEMENTS.map((a) => (a.secret && !p.ach[a.key] ? { key: a.key, name: '???', text: 'Секретное достижение', secret: true, at: null } : { ...a, at: p.ach[a.key] || null })),
    daily: q(p.daily.quests, DAILY),
    weekly: q(p.weekly.quests, WEEKLY),
    bonus: { streak: p.bonus.streak, today: p.bonus.day === dayKey(), table: DAILY_STREAK },
    chests: p.chests,
    pass: { xp: p.pass.xp, level, perLevel: XP_PER_LEVEL, claimed: p.pass.claimed, levels: PASS_LEVELS },
    season: seasonInfo(),
    // пачка 10
    level: { lvl: accLevel(p), xp: (p.xpTotal || 0) % XP_PER_ACC_LEVEL, per: XP_PER_ACC_LEVEL, points: accLevel(p) - spentPoints(p), prestige: p.prestige || 0, prestigeAt: PRESTIGE_LEVEL },
    skills: SKILLS.map((s) => ({ ...s, lvl: p.skills?.[s.key] || 0 })),
    cards: p.cards || [],
    album: p.album || {},
    best: p.best || null,
    medals: p.medals || { gold: 0, silver: 0, bronze: 0 },
    calendar: { month: seasonKey(), days: p.cal?.month === seasonKey() ? p.cal.days : [], today: msk().getUTCDate() },
    wheel: { today: p.wheel === dayKey(), segments: WHEEL_SEGMENTS },
    challenge: { text: todayChallenge().text, chips: x2(CHALLENGE_CHIPS), done: p.challenge?.day === dayKey() },
    records: { biggestPot: db.prepare('SELECT biggest_pot FROM users WHERE id = ?').get(uid)?.biggest_pot || 0, bestStreak: p.stats.bestStreak || 0, wins: p.stats.wins, hands: p.stats.hands, tourWins: p.stats.tourWins },
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

// ---------- Статистика против каждого бота ----------

db.exec(`CREATE TABLE IF NOT EXISTS bot_vs (
  user_id INTEGER NOT NULL, bot TEXT NOT NULL, hands INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, net INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bot)
)`);
const vsUp = db.prepare(`INSERT INTO bot_vs (user_id, bot, hands, wins, net) VALUES (?, ?, 1, ?, ?)
  ON CONFLICT (user_id, bot) DO UPDATE SET hands = hands + 1, wins = wins + excluded.wins, net = net + excluded.net`);
export function recordVs(uid, bots, won, net) {
  for (const b of bots) vsUp.run(uid, b, won ? 1 : 0, net ?? 0);
}
export function vsStats(uid, bot = null) {
  if (bot) return db.prepare('SELECT hands, wins, net FROM bot_vs WHERE user_id = ? AND bot = ?').get(uid, bot) || { hands: 0, wins: 0, net: 0 };
  return Object.fromEntries(db.prepare('SELECT bot, hands, wins, net FROM bot_vs WHERE user_id = ?').all(uid).map((r) => [r.bot, { hands: r.hands, wins: r.wins, net: r.net }]));
}

// ---------- Тень: уровень растёт, когда ты её обыгрываешь ----------

// для бота-Зеркала: в какой доле раздач ты заходишь в банк
export function mirrorStats(uid) {
  const s = load(uid)?.stats;
  return { vpip: s && s.hands >= 20 ? s.vpip / s.hands : 0.3 };
}

export function shadowLevel(uid) {
  const p = load(uid);
  return p?.shadow ?? 0;
}
export function adjustShadow(uid, delta) {
  tx(() => {
    const p = load(uid);
    p.shadow = Math.max(0, Math.min(10, (p.shadow ?? 0) + delta));
    save(uid, p);
  });
  return shadowLevel(uid);
}

// выдать сундук (награды за режимы)
export function grantChest(uid, kind) {
  tx(() => {
    const p = load(uid);
    p.chests[kind] = (p.chests[kind] || 0) + 1;
    save(uid, p);
  });
}

// ==================== Пачка 10: навыки, испытание дня, престиж, колесо, титулы, зал славы ====================

// ---------- Уровень аккаунта и дерево навыков ----------

const XP_PER_ACC_LEVEL = 300;
export const SKILLS = [
  { key: 'timebank', name: 'Запас времени', text: '+1 таймбанк за столом', max: 2 },
  { key: 'daily', name: 'Бонус дня', text: '+10% к ежедневному бонусу', max: 3 },
  { key: 'chest', name: 'Сундуки', text: '+10% фишек из сундуков', max: 3 },
  { key: 'xp', name: 'Опыт', text: '+10% опыта', max: 3 },
  { key: 'hint', name: 'Подсказка дня', text: 'бесплатная подсказка с ежедневным бонусом', max: 1 },
];
const accLevel = (p) => Math.floor((p.xpTotal || 0) / XP_PER_ACC_LEVEL);
const spentPoints = (p) => Object.values(p.skills || {}).reduce((a, b) => a + b, 0);
export function learnSkill(uid, key) {
  tx(() => {
    const p = load(uid);
    const sk = SKILLS.find((x) => x.key === key);
    if (!sk) throw new Error('Нет такого навыка');
    p.skills ||= {};
    if ((p.skills[key] || 0) >= sk.max) throw new Error('Навык уже на максимуме');
    if (accLevel(p) - spentPoints(p) <= 0) throw new Error('Нет свободных очков — подними уровень');
    p.skills[key] = (p.skills[key] || 0) + 1;
    save(uid, p);
  });
}
export const skillLevel = (uid, key) => load(uid)?.skills?.[key] || 0;

// ---------- Престиж: уровень 30+ — сброс уровня и навыков ради звезды и рамки ----------

const PRESTIGE_LEVEL = 30;
export function doPrestige(uid) {
  const out = [];
  tx(() => {
    const p = load(uid);
    if (accLevel(p) < PRESTIGE_LEVEL) throw new Error(`Престиж — с ${PRESTIGE_LEVEL} уровня`);
    p.prestige = (p.prestige || 0) + 1;
    p.xpTotal = 0;
    p.skills = {};
    unlock(uid, p, 'prestige', out);
    save(uid, p);
  });
  for (const t of out) notify(uid, t);
  return load(uid).prestige;
}
export const prestigeOf = (uid) => load(uid)?.prestige || 0;

// ---------- Испытание дня ----------

const CHALLENGES = [
  { key: 'c72', text: 'Выиграй раздачу с 7-2', test: (h) => sameRanks(h, [0, 5]) },
  { key: 'cflush', text: 'Выиграй с флешем', test: (h) => h.cat === 5 },
  { key: 'cset', text: 'Выиграй с сетом', test: (h) => h.cat === 3 },
  { key: 'cstraight', text: 'Выиграй со стритом', test: (h) => h.cat === 4 },
  { key: 'c2pair', text: 'Выиграй с двумя парами на вскрытии', test: (h) => h.cat === 2 && h.showdown },
  { key: 'cbluff', text: 'Выиграй банк от 20 бб без вскрытия', test: (h) => !h.showdown && h.amount >= 20 * h.bb },
  { key: 'csmall', text: 'Выиграй с картами не старше девятки', test: (h) => (h.hole || []).length === 2 && h.hole.every((c) => c >> 2 <= 7) },
  { key: 'csuited', text: 'Выиграй с одномастными картами', test: (h) => (h.hole || []).length === 2 && (h.hole[0] & 3) === (h.hole[1] & 3) },
];
const CHALLENGE_CHIPS = 1000;
function sameRanks(h, rs) {
  const r = (h.hole || []).map((c) => c >> 2).sort((a, b) => a - b);
  return r.length === 2 && r[0] === rs[0] && r[1] === rs[1];
}
function todayChallenge() {
  const d = dayKey();
  let x = 0;
  for (const ch of d) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  return CHALLENGES[x % CHALLENGES.length];
}
function checkChallenge(uid, p, h, out) {
  const c = todayChallenge();
  if (p.challenge?.day === dayKey() || !c.test(h)) return;
  p.challenge = { day: dayKey() };
  if (config.progressRewards) credit(uid, x2(CHALLENGE_CHIPS), 'challenge', c.key);
  addXp(p, 50);
  out.push(`🎯 Испытание дня выполнено: «${c.text}» — +${x2(CHALLENGE_CHIPS)} фишек`);
}

// ---------- Колесо удачи: раз в день ----------

const WHEEL = [
  { w: 30, chips: 200 }, { w: 22, chips: 500 }, { w: 14, chips: 1000 }, { w: 12, hints: 1 },
  { w: 10, chest: 'common' }, { w: 6, chest: 'rare' }, { w: 4, chips: 3000 }, { w: 2, chips: 10000, jackpot: true },
];
export const WHEEL_SEGMENTS = WHEEL.map((s) => (s.chips ? `${s.chips}` : s.hints ? '💡' : s.chest === 'rare' ? '📦★' : '📦'));
export function spinWheel(uid) {
  let res = null;
  const out = [];
  tx(() => {
    const p = load(uid);
    if (p.wheel === dayKey()) throw new Error('Колесо уже крутил сегодня — приходи завтра');
    p.wheel = dayKey();
    let r = Math.random() * WHEEL.reduce((a, s) => a + s.w, 0);
    let i = 0;
    for (; i < WHEEL.length - 1; i++) { r -= WHEEL[i].w; if (r < 0) break; }
    const s = WHEEL[i];
    if (s.chips) credit(uid, x2(s.chips), 'wheel');
    if (s.hints) db.prepare('UPDATE users SET hints = hints + ? WHERE id = ?').run(s.hints, uid);
    if (s.chest) p.chests[s.chest]++;
    if (s.jackpot) unlock(uid, p, 'wheel_jackpot', out);
    save(uid, p);
    res = { index: i, text: s.chips ? `+${x2(s.chips)} фишек` : s.hints ? '+1 подсказка' : CHESTS[s.chest].name };
  });
  for (const t of out) notify(uid, t);
  return res;
}

// ---------- Титулы: из открытых достижений ----------

export function titlesOf(uid) {
  const p = load(uid);
  const t = ACHIEVEMENTS.filter((a) => p?.ach?.[a.key]).map((a) => a.name);
  if (p?.prestige) t.unshift(`★${p.prestige} Престиж`);
  return t;
}

// ---------- Зал славы: очки за турниры за неделю ----------

db.exec('CREATE TABLE IF NOT EXISTS fame (user_id INTEGER NOT NULL, week TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, week))');
const addFame = db.prepare('INSERT INTO fame (user_id, week, points) VALUES (?, ?, ?) ON CONFLICT (user_id, week) DO UPDATE SET points = points + excluded.points');
export function fameView() {
  const week = weekKey();
  const q = (w, n) => db.prepare(`SELECT u.name, f.points FROM fame f JOIN users u ON u.id = f.user_id
    WHERE f.week = ? AND ${NOT_ADMIN.replace('id', 'u.id')} ORDER BY f.points DESC LIMIT ?`).all(w, n);
  const weeks = db.prepare('SELECT DISTINCT week FROM fame WHERE week < ? ORDER BY week DESC LIMIT 8').all(week).map((r) => r.week);
  return { week: q(week, 10), hall: weeks.map((w) => ({ week: w, top: q(w, 3) })) };
}
