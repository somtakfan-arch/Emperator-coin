// Все настройки — через переменные окружения (см. README).
const env = process.env;
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const config = {
  botToken: env.BOT_TOKEN || '',
  webAppUrl: env.WEBAPP_URL || '',          // https://адрес-сервера/ — откуда открывается мини-апп
  port: num(env.PORT, 3000),
  dataDir: env.DATA_DIR || new URL('../data/', import.meta.url).pathname,
  dev: env.DEV === '1',                     // локальный режим без Telegram
  adminIds: (env.ADMIN_IDS || '').split(',').map((s) => Number(s.trim())).filter(Boolean),
  speed: num(env.SPEED, 1),                 // множитель пауз за столом (0 — для тестов)

  startChips: num(env.START_CHIPS, 0),
  dailyBonus: num(env.DAILY_BONUS, 0),      // 0 — бонуса нет, карточка в кошельке скрыта
  turnSeconds: num(env.TURN_SECONDS, 25),

  // пакеты: звёзды → фишки
  packs: [
    { id: 'p1', stars: num(env.PACK1_STARS, 50), chips: num(env.PACK1_CHIPS, 5000), bonus: '' },
    { id: 'p2', stars: num(env.PACK2_STARS, 100), chips: num(env.PACK2_CHIPS, 12000), bonus: '+20%' },
    { id: 'p3', stars: num(env.PACK3_STARS, 200), chips: num(env.PACK3_CHIPS, 30000), bonus: '+50%' },
    { id: 'p4', stars: num(env.PACK4_STARS, 500), chips: num(env.PACK4_CHIPS, 100000), bonus: '+100%' },
  ],

  // столы против ботов: бай-ин = 100 больших блайндов
  botBuyins: [200, 500, 1000, 5000],

  // Большой турнир — каждый день
  big: {
    hourUtc: num(env.BIG_HOUR_UTC, 21),     // 21:00 UTC = 00:00 по Москве
    buyin: num(env.BIG_BUYIN, 1000),
    maxPlayers: num(env.BIG_MAX, 60),
    minRating: num(env.BIG_MIN_RATING, 0),
    blindMinutes: num(env.BIG_BLIND_MIN, 6),
  },

  tournament: {
    stack: 1500,
    sizes: [2, 3, 6, 18, 60],
    blindOptions: [3, 5, 10],               // минут на уровень
    maxOpenPerUser: 3,
  },
};

// Блайнды турниров по уровням (малый, большой)
export const BLIND_LEVELS = [
  [10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400],
  [300, 600], [400, 800], [600, 1200], [800, 1600], [1000, 2000], [1500, 3000], [2000, 4000],
  [3000, 6000], [5000, 10000], [8000, 16000], [12000, 24000], [20000, 40000],
];

// Призы: доли призового фонда по местам
export function payoutShares(n) {
  if (n <= 2) return [1];
  if (n <= 5) return [0.7, 0.3];
  if (n <= 17) return [0.6, 0.3, 0.1];
  return [0.45, 0.25, 0.15, 0.1, 0.05];
}
