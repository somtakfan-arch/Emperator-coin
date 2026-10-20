// 5 покерных ботов с разным мышлением.
// Общий мозг: эквити Монте-Карло против *прочитанных* диапазонов соперников,
// пот-оддсы, фолд-эквити, модель блефа каждого соперника. Различаются характером.
import { preflopPct, postflopStrength, boardContext } from './cards.js';
import { equity } from './equity.js';
import { OpponentModel } from './model.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const POS_MUL = { early: 0.7, middle: 0.9, late: 1.3, sb: 0.95, bb: 1.1 };

const DEFAULTS = {
  looseness: 0.25,   // какую долю рук играет префлоп (до поправки на позицию)
  raiseShare: 0.7,   // какую часть играемых рук рейзит, а не лимпит
  threeBetShare: 0.25,
  openSize: 2.5,     // опен-рейз в бб
  steal: 0.2,        // кражи блайндов с поздних позиций
  bluff3bet: 0.05,
  callMargin: 0.02,  // насколько эквити должно превышать пот-оддсы для колла
  valueEq: 0.58,     // эквити для вэлью-бета
  raiseEq: 0.72,     // эквити для рейза против ставки
  betFrac: 0.66,     // размер ставки от банка
  bluffFrac: 0.66,
  valueSizeMul: 1,   // множитель размера с монстрами
  bluffFreq: 0.2,
  bluffGate: 1,      // >1 — блефует только при большом фолд-эквити
  semiBluff: 0.45,
  trap: 0.12,        // шанс сыграть медленно с монстром
  readSkill: 0.6,    // насколько доверяет статистике соперника (0 — играет по шаблону)
  bluffPrior: 0.22,  // во сколько блефа верит «по умолчанию»
  limp: 0.2,
};

export class PokerBot {
  constructor(name, style, params = {}, { rng = Math.random, iters = 250 } = {}) {
    this.name = name;
    this.style = style;
    this.base = { ...DEFAULTS, ...params };
    this.p = this.base;
    this.rng = rng;
    this.iters = iters;
    this.model = new OpponentModel();
    this.id = null;
    this.stats = { hands: 0, bluffs: 0, bluffWins: 0, heroCalls: 0, heroWins: 0, traps: 0 };
    this.intent = null;
  }

  observe(e) {
    this.model.observe(e, this.id);
    if (e.type === 'handStart') {
      this.stats.hands++;
      this.intent = null;
      this.heroCall = false;
      this.onHandStart(e);
    } else if (e.type === 'handEnd') {
      const won = e.winners.some((w) => w.id === this.id);
      if (this.intent === 'bluff' && won && !e.showdown) this.stats.bluffWins++;
      if (this.heroCall && won) this.stats.heroWins++;
    }
  }

  onHandStart() {}
  // Поправка параметров под ситуацию — переопределяют характеры.
  tweak(_s, _ctx) { return {}; }

  act(s) {
    const opps = s.players.filter((p) => !p.me && !p.folded);
    const ctx = { opps, main: this.mainOpponent(s, opps) };
    this.p = { ...this.base, ...this.tweak(s, ctx) };
    const ranges = opps.map((o) => this.readRange(s, o, opps.length));
    const eq = equity(s.hole, s.board, ranges, this.iters, this.rng);
    return s.street === 'preflop' ? this.preflop(s, eq, ctx) : this.postflop(s, eq, ctx);
  }

  // ---------- Чтение соперников ----------

  mainOpponent(s, opps) {
    for (let i = s.actions.length - 1; i >= 0; i--) {
      const a = s.actions[i];
      if (a.action === 'raise' && opps.some((o) => o.id === a.id)) return a.id;
    }
    return opps[0]?.id;
  }

  readRange(s, o, nOpp) {
    const st = this.model.get(o.id);
    const mine = s.actions.filter((a) => a.id === o.id);
    const R = this.p.readSkill;
    // смешиваем статистику с «дефолтным» взглядом бота
    const vpip = R * st.vpip + (1 - R) * 0.28;
    const pfr = R * st.pfr + (1 - R) * 0.16;
    if (s.street === 'preflop') {
      const raises = mine.filter((a) => a.action === 'raise').length;
      const totalRaises = s.actions.filter((a) => a.action === 'raise').length;
      if (raises >= 1 && totalRaises >= 2) return { threshold: 1 - pfr * 0.35, bluff: 0.03 };
      if (raises === 1) return { threshold: 1 - pfr, bluff: 0.02 };
      if (mine.some((a) => a.action === 'call')) return { threshold: 1 - vpip, bluff: 0 };
      return { threshold: 1 - Math.min(0.9, vpip * 1.1), bluff: 0 };
    }
    const post = mine.filter((a) => a.street !== 'preflop');
    const here = post.filter((a) => a.street === s.street);
    const lastRaise = [...here].reverse().find((a) => a.action === 'raise');
    const calls = post.filter((a) => a.action === 'call').length;
    if (lastRaise) {
      const loose = clamp((st.af - 1) / 3, 0, 1) * R;
      let th = 0.62 - 0.18 * loose + (lastRaise.facing > 0 ? 0.1 : 0);
      if (s.street === 'river') th += 0.04;
      return { threshold: clamp(th, 0.35, 0.8), bluff: this.bluffRead(s, st, lastRaise, nOpp) };
    }
    if (calls) return { threshold: clamp(0.28 + 0.06 * calls, 0.28, 0.5), bluff: 0.12 };
    if (post.some((a) => a.action === 'raise')) return { threshold: 0.4, bluff: 0.25 };
    return { threshold: 0.12, bluff: 0 };
  }

  // Вероятность, что текущая агрессия соперника — блеф.
  bluffRead(s, st, a, nOpp) {
    let b = st.bluffRate * (0.75 + 0.25 * clamp(st.af / 2, 0, 2));
    const ratio = (a.added - a.facing) / Math.max(1, a.potBefore + a.facing);
    if (ratio > 1) b *= 1.25; // овербет = поляризация
    else if (ratio < 0.4) b *= 0.85;
    if (a.facing > 0 && s.street === 'river') b *= 0.7; // чек-рейз ривера редко блеф
    const bc = boardContext(s.board);
    if (s.street === 'river' && bc.flushy) b *= 1.1; // давят на страшной доске
    b /= 1 + 0.35 * (nOpp - 1);
    const R = this.p.readSkill;
    return clamp(R * b + (1 - R) * this.p.bluffPrior, 0.01, 0.6);
  }

  foldEquity(s, frac) {
    let fe = 1;
    const R = this.p.readSkill;
    for (const o of s.players) {
      if (o.me || o.folded || o.allIn) continue;
      const ft = R * this.model.get(o.id).foldToBet + (1 - R) * 0.45;
      fe *= clamp(ft * (0.75 + 0.3 * Math.min(frac, 1.5)), 0, 0.92);
    }
    return fe;
  }

  // ---------- Действия ----------

  raiseTo(s, frac) {
    let to = s.currentBet + frac * (s.pot + s.toCall);
    to = Math.max(to, s.minRaiseTo);
    const maxTo = s.myBet + s.stack;
    // если после ставки за спиной почти ничего — сразу олл-ин
    if (maxTo - to < (s.pot + to - s.myBet) * 0.35) to = maxTo;
    return { type: 'raise', to: Math.round(Math.min(to, maxTo)) };
  }

  bluff(s, frac) {
    this.intent = 'bluff';
    this.stats.bluffs++;
    return this.raiseTo(s, frac);
  }

  passive(s) {
    return { type: s.toCall > 0 ? 'fold' : 'check' };
  }

  // ---------- Префлоп ----------

  preflop(s, eq, ctx) {
    const P = this.p;
    const pct = preflopPct(s.hole);
    const L = clamp(P.looseness * (POS_MUL[s.position] ?? 1), 0.03, 0.95);
    const pre = s.actions.filter((a) => a.street === 'preflop');
    const raises = pre.filter((a) => a.action === 'raise').length;
    const bb = s.bigBlind;
    const r = this.rng();

    if (raises === 0) {
      const limpers = pre.filter((a) => a.action === 'call').length;
      if (pct >= 1 - L * P.raiseShare) {
        return this.preRaise(s, bb * (P.openSize + limpers));
      }
      if (pct >= 1 - L) {
        if (s.toCall === 0) return r < P.raiseShare * 0.5 ? this.preRaise(s, bb * (P.openSize + limpers)) : { type: 'check' };
        return r < P.limp || s.position === 'sb' ? { type: 'call' } : this.preRaise(s, bb * (P.openSize + limpers));
      }
      if (limpers === 0 && (s.position === 'late' || s.position === 'sb') && r < P.steal) {
        this.intent = 'bluff';
        this.stats.bluffs++;
        return this.preRaise(s, bb * P.openSize);
      }
      return this.passive(s);
    }

    // против рейза
    const potOdds = s.toCall / (s.pot + s.toCall);
    const pair = s.hole[0] >> 2 === s.hole[1] >> 2;
    const suitedConn = (s.hole[0] & 3) === (s.hole[1] & 3) && Math.abs((s.hole[0] >> 2) - (s.hole[1] >> 2)) <= 2;
    const implied = (pair || suitedConn) && s.stack > s.toCall * 15 ? 0.05 : 0;
    const valueTh = raises === 1 ? 1 - L * P.threeBetShare : raises === 2 ? 0.975 : 0.99;
    if (pct >= valueTh) return this.preRaise(s, s.currentBet * (raises === 1 ? 3 : 2.3));
    if (eq + implied >= potOdds + P.callMargin && (pct >= 1 - L * 1.4 || s.toCall <= bb)) return { type: 'call' };
    if (raises === 1 && pct > 0.45 && r < P.bluff3bet) {
      const fe = this.foldEquity(s, 1);
      if (fe > 0.35) {
        this.intent = 'bluff';
        this.stats.bluffs++;
        return this.preRaise(s, s.currentBet * 3);
      }
    }
    return this.passive(s);
  }

  preRaise(s, to) {
    const maxTo = s.myBet + s.stack;
    to = Math.max(to, s.minRaiseTo);
    if (to > maxTo * 0.4) to = maxTo; // короткий стек — пушим
    return { type: 'raise', to: Math.round(Math.min(to, maxTo)) };
  }

  // ---------- Постфлоп ----------

  postflop(s, eq, ctx) {
    const P = this.p;
    const nOpp = ctx.opps.length;
    const info = postflopStrength(s.hole, s.board);
    const r = this.rng();
    const river = s.street === 'river';

    if (s.toCall === 0) {
      const valueTh = P.valueEq + 0.06 * (nOpp - 1);
      if (eq >= valueTh) {
        if (eq > 0.82 && !river && r < P.trap) {
          this.stats.traps++;
          return { type: 'check' };
        }
        return this.raiseTo(s, P.betFrac * (eq > 0.8 ? P.valueSizeMul : 1));
      }
      const be = P.bluffFrac / (1 + P.bluffFrac);
      const fe = this.foldEquity(s, P.bluffFrac);
      if (info.draw >= 0.08 && !river && r < P.semiBluff && fe > be * 0.5) return this.bluff(s, P.bluffFrac);
      if (nOpp <= 2 && r < P.bluffFreq && fe >= be * P.bluffGate) return this.bluff(s, P.bluffFrac);
      return { type: 'check' };
    }

    const potOdds = s.toCall / (s.pot + s.toCall);
    const raiseTh = P.raiseEq + 0.05 * (nOpp - 1);
    if (eq >= raiseTh && s.stack > s.toCall) {
      if (!river && r < P.trap * 0.6) {
        this.stats.traps++;
        return { type: 'call' };
      }
      return this.raiseTo(s, P.betFrac * P.valueSizeMul);
    }
    if (eq >= potOdds + P.callMargin) {
      if (river && info.made < 0.5) {
        this.heroCall = true; // ловим блеф слабой рукой
        this.stats.heroCalls++;
      }
      return { type: 'call' };
    }
    if (s.stack > s.toCall * 2.5 && nOpp === 1) {
      const fe = this.foldEquity(s, 1);
      const be = 0.5;
      if (info.draw >= 0.16 && !river && r < P.semiBluff * 0.4 && fe > be * 0.6) return this.bluff(s, 1);
      if (r < P.bluffFreq * 0.25 && fe >= be * P.bluffGate) return this.bluff(s, 1);
    }
    return { type: 'fold' };
  }
}

// ======================= 5 ХАРАКТЕРОВ =======================

// 1. СКАЛА — аккуратный. Играет только сильное, почти не блефует, верит ставкам.
export class Rock extends PokerBot {
  constructor(opts) {
    super('Скала', 'тайт-пассив: только сильные руки, блеф — почти никогда', {
      looseness: 0.14, raiseShare: 0.55, threeBetShare: 0.25, steal: 0.05, bluff3bet: 0,
      callMargin: 0.07, valueEq: 0.64, raiseEq: 0.8, betFrac: 0.5, bluffFrac: 0.5,
      bluffFreq: 0.04, bluffGate: 1.3, semiBluff: 0.15, trap: 0.1,
      readSkill: 0.3, bluffPrior: 0.08, limp: 0.45,
    }, opts);
  }
}

// 2. АКУЛА — сбалансированный профи. Тайт-агрессив, смешанные частоты и сайзинги.
export class Shark extends PokerBot {
  constructor(opts) {
    super('Акула', 'тайт-агрессив: баланс вэлью и блефа, сайзинг от текстуры доски', {
      looseness: 0.24, raiseShare: 0.85, threeBetShare: 0.3, steal: 0.3, bluff3bet: 0.08,
      callMargin: 0.03, valueEq: 0.57, raiseEq: 0.72, betFrac: 0.66, bluffFrac: 0.66,
      bluffFreq: 0.24, bluffGate: 1, semiBluff: 0.55, trap: 0.15,
      readSkill: 0.6, bluffPrior: 0.22, limp: 0.05,
    }, opts);
  }
  tweak(s) {
    if (s.street === 'preflop') return {};
    const bc = boardContext(s.board);
    const wet = bc.flushy || bc.cat >= 1;
    // сухая доска — маленькие ставки, мокрая — большие (защита от дро)
    const f = wet ? 0.75 : 0.4;
    return { betFrac: f, bluffFrac: f, bluffFreq: wet ? 0.14 : 0.24 };
  }
}

// 3. МАНЬЯК — борзый. Играет много, давит овербетами, блефует постоянно.
export class Maniac extends PokerBot {
  constructor(opts) {
    super('Маньяк', 'лузово-агрессив: давление, овербеты, блеф — его стихия', {
      looseness: 0.42, raiseShare: 0.92, threeBetShare: 0.35, openSize: 3, steal: 0.6, bluff3bet: 0.2,
      callMargin: 0.02, valueEq: 0.52, raiseEq: 0.66, betFrac: 1, bluffFrac: 1,
      bluffFreq: 0.42, bluffGate: 0.75, semiBluff: 0.8, trap: 0,
      readSkill: 0.35, bluffPrior: 0.38, limp: 0,
    }, opts);
  }
  tweak() {
    const r = this.rng();
    // непредсказуемый сайзинг: от трети банка до овербета в 1.5
    const f = r < 0.2 ? 0.33 : r < 0.6 ? 0.9 : r < 0.85 ? 1.2 : 1.5;
    return { betFrac: f, bluffFrac: f };
  }
}

// 4. ОХОТНИК — эксплойтер. Ведёт досье на каждого и бьёт по слабостям:
// блефует тех, кто много фолдит, ловит на блефе тех, кто много блефует.
export class Hunter extends PokerBot {
  constructor(opts) {
    super('Охотник', 'эксплойт: читает каждого соперника и бьёт по его дырам', {
      looseness: 0.26, raiseShare: 0.8, threeBetShare: 0.28, steal: 0.3, bluff3bet: 0.07,
      callMargin: 0.01, valueEq: 0.57, raiseEq: 0.71, betFrac: 0.66, bluffFrac: 0.55,
      bluffFreq: 0.2, bluffGate: 0.9, semiBluff: 0.5, trap: 0.12,
      readSkill: 0.92, bluffPrior: 0.22, limp: 0.05,
    }, opts);
  }
  tweak(s, ctx) {
    const t = {};
    const st = ctx.main != null ? this.model.get(ctx.main) : null;
    if (!st) return t;
    const confident = st.hands >= 15;
    if (!confident) return t;
    // фолдит много → блефуем чаще и дешевле
    if (st.foldToBet > 0.55) Object.assign(t, { bluffFreq: 0.4, bluffGate: 0.75, bluffFrac: 0.45, steal: 0.5 });
    // колл-станция → не блефуем, ставим за вэлью тоньше и крупнее
    if (st.foldToBet < 0.35) Object.assign(t, { bluffFreq: 0.03, semiBluff: 0.2, valueEq: 0.52, betFrac: 0.85, valueSizeMul: 1.3 });
    // соперник часто блефует → коллируем шире, даём ему блефовать (ловушки)
    if (st.bluffRate > 0.33) Object.assign(t, { callMargin: -0.04, trap: 0.3 });
    // соперник ставит только с натсами → сбрасываем без раздумий
    if (st.bluffRate < 0.15 && st.samples >= 4) t.callMargin = 0.08;
    // тайтовый стол → крадём блайнды
    if (st.vpip < 0.2) t.steal = 0.6;
    // лузовый оппонент → играем плотнее против его лимпов/рейзов
    if (st.vpip > 0.45) t.looseness = 0.3;
    return t;
  }
}

// 5. ХАМЕЛЕОН — меняет стиль каждые 15–40 раздач, обожает ловушки и чек-рейзы.
// Статистика на него постоянно врёт.
const GEARS = {
  тайт: { looseness: 0.16, bluffFreq: 0.08, semiBluff: 0.3, trap: 0.2, callMargin: 0.05 },
  луз: { looseness: 0.45, bluffFreq: 0.42, semiBluff: 0.75, trap: 0.05, callMargin: 0, steal: 0.55, betFrac: 0.9, bluffFrac: 0.9 },
  ловушка: { looseness: 0.26, bluffFreq: 0.15, semiBluff: 0.4, trap: 0.6, callMargin: 0.01, valueSizeMul: 1.4 },
};
export class Chameleon extends PokerBot {
  constructor(opts) {
    super('Хамелеон', 'меняет передачи: тайт → луз → ловушки; чек-рейзы и слоуплеи', {
      looseness: 0.26, raiseShare: 0.75, threeBetShare: 0.3, steal: 0.3, bluff3bet: 0.1,
      callMargin: 0.02, valueEq: 0.58, raiseEq: 0.7, betFrac: 0.66, bluffFrac: 0.7,
      bluffFreq: 0.2, bluffGate: 0.95, semiBluff: 0.5, trap: 0.3,
      readSkill: 0.65, bluffPrior: 0.22, limp: 0.15,
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

export const BOT_CLASSES = [Rock, Shark, Maniac, Hunter, Chameleon];

export function createBots(opts) {
  return BOT_CLASSES.map((C) => new C(opts));
}
