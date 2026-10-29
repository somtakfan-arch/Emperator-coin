// 60 ботов попроще — «обычные игроки» для турниров и столов.
// Мозг тот же (brain.js), но характеры с дырами: рыбы, колл-станции, ниты, пушеры…
// Больше случайности (temp), хуже читают соперника, меньше считают (iters).
import { EliteBot } from './brain.js';
import { BOT_CLASSES, BOSS_CLASSES } from './bots.js';

const NAMES = [
  'Тимоха', 'Рыжий', 'Барон', 'Колян', 'Сэм', 'Лёха', 'Бизон', 'Мадам Ро', 'Профессор', 'Кекс',
  'Дядя Гоша', 'Вася Флеш', 'Поэт', 'Шериф', 'Ковбой', 'Леди Пик', 'Бублик', 'Гром', 'Тихоня', 'Джокер',
  'Мистер Ривер', 'Сова', 'Карась', 'Кит', 'Пират', 'Граф', 'Лось', 'Бро', 'Ниндзя', 'Фокусник',
  'Студент', 'Таксист', 'Борщ', 'Ёжик', 'Самурай', 'Кот Баюн', 'Дед Мороз', 'Банкир', 'Ракета', 'Медведь',
  'Вжух', 'Шахматист', 'Капитан', 'Лис', 'Боксёр', 'Кузя', 'Чемпион', 'Хитрец', 'Мажор', 'Пингвин',
  'Бродяга', 'Сфинкс', 'Тюлень', 'Молния', 'Енот', 'Стрелок', 'Жора', 'Матрос', 'Викинг', 'Акробат',
];

// Характеры: параметры мозга, описание, Эло (для рейтинга за победы над ними)
const KINDS = [
  { kind: 'рыба', text: 'играет много рук, часто доезжает до ривера', elo: 1150,
    p: { wide: 1.5, aggr: -0.03, callTax: -0.02, temp: 0.12, readSkill: 0.3, bluff3: 0.1, bluff4: 0.03, jam: 0.1, fear: 0.3, priorN: 30 } },
  { kind: 'колл-станция', text: 'коллирует почти всё, блефовать в него — плохо', elo: 1100,
    p: { wide: 1.35, aggr: -0.04, callTax: -0.04, temp: 0.09, readSkill: 0.2, bluff3: 0.05, bluff4: 0.02, jam: 0.08, fear: 0.1, priorN: 40 } },
  { kind: 'нит', text: 'играет только сильные руки, легко сбрасывает', elo: 1250,
    p: { wide: 0.65, aggr: -0.02, callTax: 0.05, temp: 0.05, readSkill: 0.5, bluff3: 0.05, bluff4: 0.02, jam: 0.05, fear: 0.9, priorN: 20 } },
  { kind: 'регуляр', text: 'играет ровно, без больших дыр', elo: 1400,
    p: { wide: 0.95, aggr: 0, temp: 0.06, readSkill: 0.6, bluff3: 0.3, bluff4: 0.1, jam: 0.2, fear: 0.5, priorN: 15 } },
  { kind: 'агрессор', text: 'много ставит и блефует', elo: 1350,
    p: { wide: 1.25, aggr: 0.02, temp: 0.08, readSkill: 0.5, bluff3: 0.45, bluff4: 0.2, jam: 0.35, fear: 0.3, priorN: 15, sizes: [0.5, 1], raiseSizes: [1, 1.5] } },
  { kind: 'пушер', text: 'обожает олл-ины', elo: 1200,
    p: { wide: 1.1, aggr: 0.01, temp: 0.08, readSkill: 0.4, bluff3: 0.3, bluff4: 0.15, jam: 0.5, deepJam: true, fear: 0.2, priorN: 20 } },
];

// детерминированный «случайный» разброс, чтобы у каждого бота был свой характер навсегда
function seeded(i) {
  let x = (i + 1) * 2654435761 >>> 0;
  return () => {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 2 ** 32;
  };
}

export const CROWD = NAMES.map((name, i) => {
  const r = seeded(i);
  const K = KINDS[i % KINDS.length];
  const j = (v, d) => Math.round((v * (1 + (r() - 0.5) * d)) * 1000) / 1000;
  const p = { ...K.p, wide: j(K.p.wide, 0.2), temp: j(K.p.temp, 0.4), jam: j(K.p.jam, 0.4), fear: Math.min(1, j(K.p.fear, 0.4)) };
  return { name, kind: K.kind, style: `${K.kind}: ${K.text}`, elo: K.elo + Math.round((r() - 0.5) * 120), params: p };
});

const PROS = [...BOT_CLASSES, ...BOSS_CLASSES].map((C) => ({ C, name: new C({}).name }));

export function isBotName(name) {
  return PROS.some((x) => x.name === name) || CROWD.some((x) => x.name === name);
}

// Создать бота по имени — любого из 5 сильных или из 60 обычных
export function makeBot(name, opts = {}) {
  const pro = PROS.find((x) => x.name === name);
  if (pro) return new pro.C(opts);
  const c = CROWD.find((x) => x.name === name);
  if (!c) throw new Error('Нет такого бота');
  return new EliteBot(c.name, c.style, c.params, { ...opts, iters: Math.min(opts.iters ?? 150, 150) });
}

export function crowdElo(name) {
  return CROWD.find((x) => x.name === name)?.elo ?? null;
}
