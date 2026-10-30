// Внешний вид игрока: аватар, рамка, рубашка карт, VIP-эмодзи.
// Аватар и рамку видят все за столом; рубашку — только ты (она в настройках устройства, но открывается здесь).
import { db } from './db.js';
import { config } from './config.js';
import { rankOf, setChestCosmetic, titlesOf } from './progress.js';

const cols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
if (!cols.has('photo')) db.exec('ALTER TABLE users ADD COLUMN photo TEXT');
if (!cols.has('cosmetics')) db.exec("ALTER TABLE users ADD COLUMN cosmetics TEXT NOT NULL DEFAULT '{}'");

export const AVATARS = ['🦁', '🐺', '🦊', '🐯', '🐼', '🦅', '🐉', '👑', '😎', '🤠', '👽', '🤖', '🎩', '🃏', '💀', '🦈'];

// Рамки и рубашки: как открываются
export const FRAMES = [
  { id: 'none', name: 'Без рамки', how: 'есть у всех' },
  { id: 'silver', name: 'Серебро', how: 'есть у всех' },
  { id: 'gold', name: 'Золото', how: 'ранг «Золото»', rank: 1900 },
  { id: 'diamond', name: 'Алмаз', how: 'ранг «Алмаз»', rank: 2800 },
  { id: 'legend', name: 'Легенда', how: 'ранг «Легенда»', rank: 3500 },
  { id: 'fire', name: 'Огонь', how: 'достижение «В огне»', ach: 'streak_5' },
  { id: 'crown', name: 'Корона', how: 'достижение «Цареубийца»', ach: 'beat_king' },
  { id: 'royal', name: 'Королевская', how: 'достижение «Королевский»', ach: 'royal' },
  { id: 'neon', name: 'Неон', how: 'из сундука', chest: true },
  { id: 'galaxy', name: 'Галактика', how: 'из сундука', chest: true },
  { id: 'prestige', name: 'Престиж', how: 'звезда престижа', prestige: true },
];
export const BACKS = [
  { id: 'classic', name: 'Классика', how: 'есть у всех' },
  { id: 'red', name: 'Красная', how: 'есть у всех' },
  { id: 'blue', name: 'Синяя', how: 'есть у всех' },
  { id: 'silver', name: 'Серебро', how: 'из сундука', chest: true },
  { id: 'neon', name: 'Неон', how: 'из сундука', chest: true },
  { id: 'gold', name: 'Золото', how: 'ранг «Золото»', rank: 1900 },
  { id: 'dragon', name: 'Дракон', how: 'достижение «Тысячник»', ach: 'wins_1000' },
];
export const VIP_EMOTES = ['💎', '🦈', '🃏', '💸', '🥶', '🫡'];

function load(uid) {
  const u = db.prepare('SELECT id, rating, progress, cosmetics, photo FROM users WHERE id = ?').get(uid);
  if (!u) return null;
  let c = {}, p = {};
  try { c = JSON.parse(u.cosmetics || '{}'); } catch {}
  try { p = JSON.parse(u.progress || '{}'); } catch {}
  c.owned ||= [];
  return { u, c, p };
}

function unlocked(item, { u, c, p }, kind) {
  if (!item.rank && !item.ach && !item.chest && !item.prestige) return true;
  if (item.prestige && p.prestige) return true;
  if (config.adminIds.includes(u.id)) return true; // у админа открыто всё
  if (item.rank && u.rating >= item.rank) return true;
  if (item.ach && p.ach?.[item.ach]) return true;
  return c.owned.includes(`${kind}:${item.id}`);
}

// VIP-эмодзи: ранг «Золото» и выше или 10 уровень пропуска
export function vipEmotes(uid) {
  const d = load(uid);
  if (!d) return false;
  const level = Math.floor((d.p.pass?.xp || 0) / 100);
  return d.u.rating >= 1900 || level >= 10 || config.adminIds.includes(d.u.id);
}

// То, что видят другие за столом
export function publicLook(uid) {
  const d = load(uid);
  if (!d) return {};
  const r = rankOf(d.u.rating);
  return {
    avatar: d.c.avatar === 'photo' && d.u.photo ? { photo: d.u.photo } : d.c.avatar && AVATARS.includes(d.c.avatar) ? { emoji: d.c.avatar } : null,
    frame: d.c.frame && d.c.frame !== 'none' ? d.c.frame : null,
    rankColor: r.color, rankName: r.name,
    title: d.c.title || null,
  };
}

export function lookView(uid) {
  const d = load(uid);
  if (!d) return null;
  return {
    avatar: d.c.avatar || null, frame: d.c.frame || 'none', back: d.c.back || 'classic', hasPhoto: !!d.u.photo,
    avatars: AVATARS,
    frames: FRAMES.map((f) => ({ id: f.id, name: f.name, how: f.how, owned: unlocked(f, d, 'frame') })),
    backs: BACKS.map((b) => ({ id: b.id, name: b.name, how: b.how, owned: unlocked(b, d, 'back') })),
    vip: vipEmotes(uid), vipEmotes: VIP_EMOTES,
    title: d.c.title || null, titles: titlesOf(uid),
  };
}

export function equip(uid, kind, id) {
  const d = load(uid);
  if (!d) throw new Error('Нет игрока');
  if (kind === 'avatar') {
    if (id !== null && id !== 'photo' && !AVATARS.includes(id)) throw new Error('Нет такого аватара');
    if (id === 'photo' && !d.u.photo) throw new Error('В Telegram нет фото профиля');
    d.c.avatar = id;
  } else if (kind === 'frame' || kind === 'back') {
    const list = kind === 'frame' ? FRAMES : BACKS;
    const item = list.find((x) => x.id === id);
    if (!item) throw new Error('Нет такого предмета');
    if (!unlocked(item, d, kind)) throw new Error(`Ещё закрыто: ${item.how}`);
    d.c[kind] = id;
  } else if (kind === 'title') {
    if (id !== null && !titlesOf(uid).includes(id)) throw new Error('Этот титул ещё не открыт');
    d.c.title = id;
  } else throw new Error('Неверный тип');
  db.prepare('UPDATE users SET cosmetics = ? WHERE id = ?').run(JSON.stringify(d.c), uid);
}

// Сундук может дать рамку или рубашку, которой ещё нет
setChestCosmetic((p, kind, uid) => {
  const chance = { common: 0.08, rare: 0.3, epic: 0.7 }[kind] || 0;
  if (!uid || Math.random() >= chance) return null;
  const d = load(uid);
  const pool = [
    ...FRAMES.filter((f) => f.chest && !d.c.owned.includes(`frame:${f.id}`)).map((f) => ({ key: `frame:${f.id}`, text: `рамка «${f.name}»` })),
    ...BACKS.filter((b) => b.chest && !d.c.owned.includes(`back:${b.id}`)).map((b) => ({ key: `back:${b.id}`, text: `рубашка «${b.name}»` })),
  ];
  if (!pool.length) return null;
  const pick = pool[(Math.random() * pool.length) | 0];
  d.c.owned.push(pick.key);
  db.prepare('UPDATE users SET cosmetics = ? WHERE id = ?').run(JSON.stringify(d.c), uid);
  return pick.text;
});
