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

// 7. МАФИЯ — босс-ловушка: часто чекает сильные руки и ловит на блефе, редко, но больно рейзит.
export class Mafia extends EliteBot {
  constructor(opts = {}) {
    super('Мафия', 'босс-ловушка: чек-рейзы, слоуплей, ловит блефы', {
      wide: 0.95, aggr: -0.005, trap: 0.22, sizes: [0.33, 0.75, 1.25], raiseSizes: [0.9, 1.5],
      temp: 0.02, priorN: 5, readSkill: 1, bluff3: 0.3, bluff4: 0.1, callTax: 0, jam: 0.25, fear: 0.15,
    }, { ...opts, iters: Math.max(opts.iters ?? 0, 600) });
  }
}

// 8. РОБОТ — босс-баланс: минимум случайности, точные сайзинги, почти не эксплуатируется.
export class Robot extends EliteBot {
  constructor(opts = {}) {
    super('Робот', 'босс-баланс: холодный расчёт, точные ставки, без эмоций', {
      wide: 1, aggr: 0, trap: 0.05, sizes: [0.25, 0.5, 0.75, 1, 1.5], raiseSizes: [0.7, 1, 1.4],
      temp: 0.008, priorN: 20, readSkill: 0.6, bluff3: 0.35, bluff4: 0.12, callTax: 0.015, jam: 0.2, fear: 0,
    }, { ...opts, iters: Math.max(opts.iters ?? 0, 900) });
  }
}

// 9. ШЕЙХ — босс-богач: широкий, огромные овербеты, давит деньгами.
export class Sheikh extends EliteBot {
  constructor(opts = {}) {
    super('Шейх', 'босс-богач: играет много рук, огромные овербеты, давит стеком', {
      wide: 1.3, aggr: 0.025, trap: 0.03, sizes: [0.75, 1.5, 2.5], raiseSizes: [1.2, 2],
      temp: 0.03, priorN: 8, readSkill: 0.8, bluff3: 0.55, bluff4: 0.25, callTax: 0.005, jam: 0.45, deepJam: true, fear: 0.1,
    }, { ...opts, iters: Math.max(opts.iters ?? 0, 500) });
  }
}

// 10. ТЕНЬ — подстраивается под тебя: чем чаще ты её обыгрываешь, тем сильнее она становится (уровни 0–10).
export class Shadow extends EliteBot {
  constructor(opts = {}) {
    const lvl = Math.max(0, Math.min(10, Number(opts.shadowLevel) || 0));
    const k = lvl / 10; // 0 — слабая, 1 — как лучшие боты
    const mix = (a, b) => a + (b - a) * k;
    super('Тень', `растёт вместе с тобой · уровень ${lvl}`, {
      wide: mix(1.35, 1.05), aggr: 0, trap: 0.05, sizes: [0.33, 0.66, 1, 1.5], raiseSizes: [0.75, 1.2],
      temp: mix(0.12, 0.015), priorN: Math.round(mix(30, 4)), readSkill: mix(0.3, 1), bluff3: mix(0.15, 0.4), bluff4: mix(0.05, 0.15),
      callTax: mix(-0.03, 0.015), jam: mix(0.1, 0.3), fear: mix(0.5, 0.2),
    }, { ...opts, iters: Math.round(mix(120, 700)) });
    this.level = lvl;
  }
}

// 11. НОВИЧОК — слабый и иногда жмёт не ту кнопку
export class Newbie extends EliteBot {
  constructor(opts = {}) {
    super('Новичок', 'учится играть: часто ошибается и сам над собой смеётся', {
      wide: 1.45, aggr: -0.03, callTax: -0.03, temp: 0.15, readSkill: 0.1, bluff3: 0.05, bluff4: 0.02, jam: 0.05, fear: 0.6, priorN: 40,
    }, { ...opts, iters: 80 });
    this.noTilt = true;
  }
  act(s) {
    const a = super.act(s);
    if (Math.random() < 0.15) {
      // «не туда нажал»: случайное другое действие
      const opts = s.toCall > 0 ? [{ type: 'call' }, { type: 'fold' }] : [{ type: 'check' }, { type: 'raise', to: s.minRaiseTo }];
      const other = opts.find((o) => o.type !== a.type) || opts[0];
      this.sayNext = ['Ой, я не туда нажал 😅', 'Упс… это я случайно', 'Так, а какая кнопка колл? 🤔'][(Math.random() * 3) | 0];
      return other;
    }
    return a;
  }
}

// 12. ШУЛЕР — иногда подглядывает в твои карты (значок 👁 у него всегда). Поймал — выигрыш.
export class Cheater extends EliteBot {
  constructor(opts = {}) {
    super('Шулер', 'иногда подглядывает в твои карты — поймай его кнопкой «Разоблачить»', {
      wide: 1.1, aggr: 0.01, temp: 0.04, readSkill: 0.8, bluff3: 0.35, bluff4: 0.12, jam: 0.25, fear: 0.3, priorN: 10,
    }, { ...opts, iters: Math.max(opts.iters ?? 0, 300) });
    this.peeks = true;
  }
}

// 13. УЧИТЕЛЬ — после каждого хода объясняет вслух, почему так сыграл
export class Teacher extends EliteBot {
  constructor(opts = {}) {
    super('Учитель', 'объясняет каждый свой ход — учись у него', {
      wide: 0.95, aggr: 0, temp: 0.04, readSkill: 0.7, bluff3: 0.25, bluff4: 0.08, jam: 0.15, fear: 0.4, priorN: 12,
    }, { ...opts, iters: Math.max(opts.iters ?? 0, 300) });
    this.explains = true;
    this.noTilt = true;
  }
}

// 14. БОСС МЕСЯЦА — каждый месяц новый, со своим характером
const MONTH_BOSSES = [
  ['Снеговик', 'холодный и терпеливый: ждёт сильную руку', { wide: 0.75, fear: 0.6, bluff3: 0.15 }],
  ['Купидон', 'стреляет ставками в самое сердце', { wide: 1.1, aggr: 0.02, bluff3: 0.45 }],
  ['Весна', 'оттаивает к риверу: чем дальше, тем агрессивнее', { wide: 1, bluff4: 0.3, jam: 0.3 }],
  ['Шутник', 'никогда не знаешь, блефует он или нет', { wide: 1.15, temp: 0.08, bluff3: 0.5, bluff4: 0.25 }],
  ['Садовник', 'медленно растит банк и собирает урожай', { wide: 1, trap: 0.2, sizes: [0.33, 0.5] }],
  ['Солнце', 'жарит овербетами', { wide: 1.15, sizes: [1, 1.5, 2], jam: 0.35 }],
  ['Пляжник', 'расслаблен, играет много рук', { wide: 1.35, callTax: -0.01, fear: 0.2 }],
  ['Арбузник', 'давит олл-инами', { wide: 1.1, jam: 0.55, deepJam: true }],
  ['Двоечник', 'учился плохо, но блефует отлично', { wide: 1.2, readSkill: 0.4, bluff3: 0.55 }],
  ['Тыква', 'страшный босс Хэллоуина: ловушки и чек-рейзы', { wide: 0.95, trap: 0.28, bluff3: 0.35 }],
  ['Листопад', 'сбрасывает слабое и бьёт сильным', { wide: 0.8, aggr: 0.015, fear: 0.5 }],
  ['Санта', 'дарит фишки… или забирает все', { wide: 1.25, jam: 0.4, bluff3: 0.4 }],
];
export const monthIndex = () => new Date(Date.now() + 3 * 3600000).getUTCMonth(); // по Москве
export class MonthBoss extends EliteBot {
  constructor(opts = {}) {
    const [name, style, p] = MONTH_BOSSES[monthIndex()];
    super(name, `босс месяца: ${style}`, {
      wide: 1, aggr: 0, temp: 0.02, readSkill: 0.9, bluff3: 0.35, bluff4: 0.12, jam: 0.25, fear: 0.25, priorN: 6, ...p,
    }, { ...opts, iters: Math.max(opts.iters ?? 0, 600) });
  }
}

// 15. ПРИЗРАК — появляется только с 3:00 до 4:00 ночи по Москве. Очень сильный.
export const ghostHour = () => new Date(Date.now() + 3 * 3600000).getUTCHours() === 3;
export class Ghost extends EliteBot {
  constructor(opts = {}) {
    super('Призрак', 'приходит только в 3 ночи… и забирает фишки тех, кто не спит', {
      wide: 1.05, aggr: 0.01, trap: 0.15, temp: 0.015, priorN: 4, readSkill: 1, bluff3: 0.45, bluff4: 0.2, callTax: 0.01, jam: 0.35, fear: 0.15,
    }, { ...opts, iters: Math.max(opts.iters ?? 0, 800) });
    this.noTilt = true;
  }
}

// 16. ЗЕРКАЛО — играет твоим стилем: сколько рук ты играешь, так и он
export class Mirror extends EliteBot {
  constructor(opts = {}) {
    const m = opts.mirror || { vpip: 0.3 };
    const wide = Math.max(0.6, Math.min(1.6, 0.6 + m.vpip * 2)); // 20% рук ≈ 1.0
    super('Зеркало', `играет твоим стилем: заходит в ${Math.round(m.vpip * 100)}% раздач, как ты`, {
      wide, aggr: 0, temp: 0.05, readSkill: 0.6, bluff3: 0.3, bluff4: 0.1, jam: 0.2, fear: 0.4, priorN: 12,
    }, { ...opts, iters: Math.max(opts.iters ?? 0, 300) });
  }
}

export const BOT_CLASSES = [Rock, Shark, Maniac, Hunter, Chameleon];
export const BOSS_CLASSES = [King, Mafia, Robot, Sheikh, Shadow, MonthBoss, Ghost, Cheater, Teacher, Newbie, Mirror]; // отдельно: за стол на 6 не садится, только 1 на 1 и турниры

export function createBots(opts) {
  return BOT_CLASSES.map((C) => new C(opts));
}
