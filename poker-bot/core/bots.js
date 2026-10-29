// 5 элитных ботов. У всех один мозг (brain.js): байесовское чтение рук,
// решения по EV, смешанные стратегии, эксплойт статистики соперников.
// Отличаются характером — как разные топ-регуляры с разной философией.
import { EliteBot } from './brain.js';

// 1. СКАЛА — аккуратный. Узкие диапазоны, минимум дисперсии, редкие но точные блефы.
// Ставит мелко-средне, почти не рискует без перевеса.
export class Rock extends EliteBot {
  constructor(opts) {
    super('Скала', 'аккуратный: узкие диапазоны, минимум риска, точечные блефы', {
      wide: 0.8, aggr: -0.015, trap: 0.06, sizes: [0.33, 0.66], raiseSizes: [0.8],
      temp: 0.015, priorN: 12, bluff3: 0.15, bluff4: 0.04, jam: 0.12, fear: 0.8,
    }, opts);
  }
}

// 2. АКУЛА — теоретик (GTO-стиль). Широкий набор сайзингов, много смешивания,
// почти не подстраивается — поэтому её нельзя эксплуатировать.
export class Shark extends EliteBot {
  constructor(opts) {
    super('Акула', 'баланс (GTO): много сайзингов, смешанные частоты, нечитаемая', {
      wide: 1, aggr: 0, trap: 0.05, sizes: [0.25, 0.5, 0.75, 1.25], raiseSizes: [0.7, 1.1],
      temp: 0.04, priorN: 25, readSkill: 0.5, bluff3: 0.35, bluff4: 0.12, jam: 0.3, fear: 0.35,
    }, opts);
  }
}

// 3. МАНЬЯК — борзый. Широкие диапазоны, большие ставки и овербеты,
// давит фолд-эквити, много 3бетов и 4бет-блефов.
export class Maniac extends EliteBot {
  constructor(opts) {
    super('Маньяк', 'борзый: широкие диапазоны, овербеты, давление', {
      wide: 1.35, aggr: 0.03, trap: 0, sizes: [0.5, 1, 1.6], raiseSizes: [1, 1.6],
      temp: 0.035, priorN: 10, bluff3: 0.6, bluff4: 0.3, jam: 0.4, deepJam: true, fear: 0.2,
    }, opts);
  }
}

// 4. ОХОТНИК — эксплойтер. Быстро учится (мало наблюдений, чтобы поверить),
// полностью верит пойманным блефам и бьёт по каждой дыре соперника.
export class Hunter extends EliteBot {
  constructor(opts) {
    super('Охотник', 'эксплойт: быстро учит каждого и бьёт по его дырам', {
      wide: 1.05, aggr: 0, trap: 0.06, sizes: [0.33, 0.66, 1, 1.5], raiseSizes: [0.75, 1.2],
      temp: 0.015, priorN: 4, readSkill: 1, bluff3: 0.35, bluff4: 0.12, jam: 0.35, fear: 0.45,
    }, opts);
  }
}

// 5. ХАМЕЛЕОН — меняет передачу каждые 15–40 раздач: тайт / луз-агрессив / ловушки.
// Статистика, собранная на него, всё время устаревает.
const GEARS = {
  тайт: { wide: 0.8, aggr: -0.01, trap: 0.04, bluff3: 0.15, sizes: [0.33, 0.66], jam: 0.12, fear: 0.8 },
  луз: { wide: 1.35, aggr: 0.03, trap: 0, bluff3: 0.6, bluff4: 0.25, sizes: [0.5, 1, 1.5], raiseSizes: [1, 1.5], jam: 0.7, fear: 0.2 },
  ловушка: { wide: 1, aggr: -0.02, trap: 0.2, bluff3: 0.3, sizes: [0.33, 0.75, 1.25], jam: 0.3, fear: 0.5 },
};
export class Chameleon extends EliteBot {
  constructor(opts) {
    super('Хамелеон', 'меняет передачи: тайт → луз → ловушки, нечитаемый', {
      wide: 1, temp: 0.03, priorN: 8, readSkill: 0.8,
    }, opts);
    this.gear = 'ловушка';
    this.gearLeft = 0;
  }
  onHandStart() {
    if (--this.gearLeft <= 0) {
      const names = Object.keys(GEARS).filter((g) => g !== this.gear);
      this.gear = names[(this.rng() * names.length) | 0];
      this.gearLeft = 15 + ((this.rng() * 26) | 0);
    }
  }
  tweak() {
    return GEARS[this.gear];
  }
}

// 6. КОРОЛЬ — мега-босс. Чтение как у Охотника (учится за пару раздач, верит пойманным блефам),
// считает больше всех, почти без страха. Овербеты до 2.2 банка, рейзы до 1.7, частые олл-ины,
// сбрасывает реже остальных. Сильнее давить нельзя: в дуэлях это уже начинает проигрывать.
export class King extends EliteBot {
  constructor(opts = {}) {
    super('Король', 'мега-босс: овербеты, олл-ины, почти не сбрасывает, читает всех', {
      wide: 1.05, aggr: 0, trap: 0.06, sizes: [0.33, 0.66, 1, 1.5, 2.2], raiseSizes: [0.75, 1.2, 1.7],
      temp: 0.015, priorN: 4, readSkill: 1, bluff3: 0.4, bluff4: 0.15, callTax: 0.01,
      jam: 0.35, fear: 0.2,
    }, { ...opts, iters: Math.max(opts.iters ?? 0, 800) });
  }
}

export const BOT_CLASSES = [Rock, Shark, Maniac, Hunter, Chameleon];
export const BOSS_CLASSES = [King]; // отдельно: за стол на 6 не садится, только 1 на 1 и турниры

export function createBots(opts) {
  return BOT_CLASSES.map((C) => new C(opts));
}
