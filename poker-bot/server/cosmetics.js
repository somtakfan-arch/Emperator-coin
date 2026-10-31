// Внешний вид игрока: аватар, рамка, рубашка карт, VIP-эмодзи.
// Аватар и рамку видят все за столом; рубашку — только ты (она в настройках устройства, но открывается здесь).
import { db } from './db.js';
import { config } from './config.js';
import { rankOf, setChestCosmetic, titlesOf } from './progress.js';

const cols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
if (!cols.has('photo')) db.exec('ALTER TABLE users ADD COLUMN photo TEXT');
if (!cols.has('cosmetics')) db.exec("ALTER TABLE users ADD COLUMN cosmetics TEXT NOT NULL DEFAULT '{}'");

export const AVATARS = ['🦁', '🐺', '🦊', '🐯', '🐼', '🦅', '🐉', '👑', '😎', '🤠', '👽', '🤖', '🎩', '🃏', '💀', '🦈',
  // анимированные
  '🔥', '⚡', '🌀', '💫', '🌈', '👾'];
// баннеры профиля: полоса-обложка в карточке игрока
export const BANNERS = ['none', 'sunset', 'ocean', 'forest', 'royal', 'fire', 'night', 'gold'];

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
  { id: 'rainbow', name: 'Радужная', how: 'есть у всех' },
  { id: 'ice', name: 'Ледяная', how: 'есть у всех' },
  { id: 'emerald', name: 'Изумрудная', how: 'есть у всех' },
  { id: 'ruby', name: 'Рубиновая', how: 'есть у всех' },
  { id: 'double', name: 'Двойная', how: 'есть у всех' },
  { id: 'sun', name: 'Солнечная', how: 'из сундука', chest: true },
  { id: 'shadow', name: 'Тень', how: 'из сундука', chest: true },
  { id: 'pink', name: 'Розовая', how: 'есть у всех' },
  { id: 'toxic', name: 'Токсичная', how: 'из сундука', chest: true },
  { id: 'platinum', name: 'Платиновая', how: 'ранг «Платина»', rank: 2300 },
];
export const BACKS = [
  { id: 'classic', name: 'Классика', how: 'есть у всех' },
  { id: 'red', name: 'Красная', how: 'есть у всех' },
  { id: 'blue', name: 'Синяя', how: 'есть у всех' },
  { id: 'silver', name: 'Серебро', how: 'из сундука', chest: true },
  { id: 'neon', name: 'Неон', how: 'из сундука', chest: true },
  { id: 'gold', name: 'Золото', how: 'ранг «Золото»', rank: 1900 },
  { id: 'dragon', name: 'Дракон', how: 'достижение «Тысячник»', ach: 'wins_1000' },
  { id: 'casino_red', name: 'Казино красная', how: 'есть у всех' },
  { id: 'casino_blue', name: 'Казино синяя', how: 'есть у всех' },
  { id: 'casino_black', name: 'Казино чёрная', how: 'есть у всех' },
  { id: 'casino_green', name: 'Казино зелёная', how: 'есть у всех' },
  { id: 'casino_purple', name: 'Казино фиолетовая', how: 'из сундука', chest: true },
  { id: 'casino_gold', name: 'Казино золотая', rank: 2300, how: 'ранг «Платина»' },
  { id: 'emblem_red', name: 'Герб красный', how: 'есть у всех' },
  { id: 'emblem_blue', name: 'Герб синий', how: 'есть у всех' },
  { id: 'emblem_black', name: 'Герб чёрный', how: 'из сундука', chest: true },
  { id: 'emblem_royal', name: 'Королевский герб', ach: 'royal', how: 'достижение «Королевский»' },
  { id: 'stripe_mint', name: 'Мятные полосы', how: 'есть у всех' },
  { id: 'stripe_coral', name: 'Коралловые полосы', how: 'есть у всех' },
  { id: 'stripe_sky', name: 'Небесные полосы', how: 'есть у всех' },
  { id: 'stripe_night', name: 'Ночные полосы', how: 'есть у всех' },
  { id: 'stripe_candy', name: 'Леденец', how: 'из сундука', chest: true },
  { id: 'dots_red', name: 'Красный горошек', how: 'есть у всех' },
  { id: 'dots_blue', name: 'Синий горошек', how: 'есть у всех' },
  { id: 'dots_black', name: 'Чёрный горошек', how: 'есть у всех' },
  { id: 'dots_gold', name: 'Золотой горошек', how: 'из сундука', chest: true },
  { id: 'dots_pink', name: 'Розовый горошек', how: 'из сундука', chest: true },
  { id: 'check_red', name: 'Красная клетка', how: 'есть у всех' },
  { id: 'check_bw', name: 'Шахматы', how: 'есть у всех' },
  { id: 'check_green', name: 'Зелёная клетка', how: 'есть у всех' },
  { id: 'check_violet', name: 'Фиолетовая клетка', how: 'из сундука', chest: true },
  { id: 'burst_sun', name: 'Солнце', how: 'из сундука', chest: true },
  { id: 'burst_ice', name: 'Лёд', how: 'из сундука', chest: true },
  { id: 'burst_fire', name: 'Пламя', ach: 'streak_5', how: 'достижение «В огне»' },
  { id: 'burst_galaxy', name: 'Вихрь', rank: 2800, how: 'ранг «Алмаз»' },
  { id: 'rings_ocean', name: 'Круги на воде', how: 'есть у всех' },
  { id: 'rings_lava', name: 'Лава', how: 'из сундука', chest: true },
  { id: 'rings_hypno', name: 'Гипноз', how: 'из сундука', chest: true },
  { id: 'rings_mint', name: 'Мятные круги', how: 'есть у всех' },
  { id: 'zig_red', name: 'Красный зигзаг', how: 'есть у всех' },
  { id: 'zig_blue', name: 'Синий зигзаг', how: 'есть у всех' },
  { id: 'zig_gold', name: 'Золотой зигзаг', rank: 1900, how: 'ранг «Золото»' },
  { id: 'zig_neon', name: 'Неоновый зигзаг', how: 'из сундука', chest: true },
  { id: 'plaid_scot', name: 'Шотландка', how: 'есть у всех' },
  { id: 'plaid_forest', name: 'Лесная шотландка', how: 'из сундука', chest: true },
  { id: 'plaid_grey', name: 'Серая шотландка', how: 'есть у всех' },
  { id: 'grad_sunset', name: 'Закат', how: 'есть у всех' },
  { id: 'grad_ocean', name: 'Океан', how: 'есть у всех' },
  { id: 'grad_mint', name: 'Мята', how: 'есть у всех' },
  { id: 'grad_wine', name: 'Вино', how: 'из сундука', chest: true },
  { id: 'grad_steel', name: 'Сталь', rank: 1600, how: 'ранг «Серебро»' },
  { id: 'grad_emerald', name: 'Изумруд', rank: 3500, how: 'ранг «Легенда»' },
  { id: 'grad_aurora', name: 'Северное сияние', how: 'из сундука', chest: true },
  { id: 'prestige_star', name: 'Звезда престижа', prestige: true, how: 'звезда престижа' },
  { id: 'ghost', name: 'Призрачная', ach: 'ghost', how: 'достижение «Охотник за привидениями»' },
  { id: 'collector', name: 'Коллекционная', ach: 'collector', how: 'достижение «Коллекционер»' },
  { id: 'champion', name: 'Чемпионская', ach: 'tour_win', how: 'достижение «Чемпион»' },
];
// эффекты ника и таблички — их видят все за столом
export const NAME_FX = [
  { id: 'none', name: 'Без эффекта', how: 'есть у всех' },
  { id: 'gold', name: 'Золото', how: 'есть у всех' },
  { id: 'rainbow', name: 'Радуга', how: 'есть у всех' },
  { id: 'fire', name: 'Огонь', how: 'есть у всех' },
  { id: 'ice', name: 'Лёд', how: 'есть у всех' },
  { id: 'glow', name: 'Свечение', how: 'есть у всех' },
  { id: 'neon', name: 'Неон', how: 'есть у всех' },
  { id: 'pink', name: 'Розовый неон', how: 'из сундука', chest: true },
  { id: 'shimmer', name: 'Перелив', how: 'ранг «Золото»', rank: 1900 },
  { id: 'blood', name: 'Кровь', how: 'из сундука', chest: true },
  { id: 'royal', name: 'Королевский', how: 'достижение «Королевский»', ach: 'royal' },
];
export const PLATES = [
  { id: 'none', name: 'Обычная', how: 'есть у всех' },
  { id: 'glass', name: 'Стекло', how: 'есть у всех' },
  { id: 'black', name: 'Чёрная', how: 'есть у всех' },
  { id: 'gold', name: 'Золотая', how: 'ранг «Золото»', rank: 1900 },
  { id: 'neon', name: 'Неон', how: 'есть у всех' },
  { id: 'wood', name: 'Дерево', how: 'есть у всех' },
  { id: 'ruby', name: 'Рубин', how: 'из сундука', chest: true },
  { id: 'ocean', name: 'Океан', how: 'есть у всех' },
  { id: 'purple', name: 'Фиолетовая', how: 'есть у всех' },
  { id: 'white', name: 'Белая', how: 'есть у всех' },
  { id: 'fire', name: 'Огненная', how: 'достижение «В огне»', ach: 'streak_5' },
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
    banner: d.c.banner && d.c.banner !== 'none' ? d.c.banner : null,
    nameFx: d.c.namefx && d.c.namefx !== 'none' ? d.c.namefx : null,
    plate: d.c.plate && d.c.plate !== 'none' ? d.c.plate : null,
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
    banner: d.c.banner || 'none', banners: BANNERS,
    nameFx: d.c.namefx || 'none', nameFxs: NAME_FX.map((x) => ({ id: x.id, name: x.name, how: x.how, owned: unlocked(x, d, 'namefx') })),
    plate: d.c.plate || 'none', plates: PLATES.map((x) => ({ id: x.id, name: x.name, how: x.how, owned: unlocked(x, d, 'plate') })),
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
  } else if (kind === 'namefx' || kind === 'plate') {
    const item = (kind === 'namefx' ? NAME_FX : PLATES).find((x) => x.id === id);
    if (!item) throw new Error('Нет такого стиля');
    if (!unlocked(item, d, kind)) throw new Error(`Ещё закрыто: ${item.how}`);
    d.c[kind] = id;
  } else if (kind === 'banner') {
    if (!BANNERS.includes(id)) throw new Error('Нет такого баннера');
    d.c.banner = id;
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
