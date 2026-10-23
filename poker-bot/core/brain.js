// Мозг элитного бота.
//
// 1. ЧТЕНИЕ РУК (Байес). На каждого соперника — вес для каждой из 1326 комбинаций.
//    После каждого его действия веса умножаются на вероятность сделать именно это
//    действие с такой рукой. Вероятности строятся из его реальных частот
//    (как часто рейзит/коллит/фолдит в этой ситуации) и доли блефа, пойманной на вскрытиях.
// 2. РЕШЕНИЕ ПО EV. Для чека, колла, фолда и каждого размера ставки считается
//    матожидание: фолд-эквити × банк + эквити против диапазона, который продолжит.
// 3. СМЕШАННАЯ СТРАТЕГИЯ. Близкие по EV действия выбираются случайно (softmax) —
//    бота невозможно прочитать по паттерну.
import { COMBOS, comboIndex, preflopPct, evaluate, postflopStrength } from './cards.js';
import { strengths } from './strength.js';
import { FreqModel } from './model.js';

const N = COMBOS.length;
const sig = (x) => 1 / (1 + Math.exp(-x));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// во сколько раз чаще стандартного игрок открывается с этой позиции
const POS_FREQ = { early: 0.6, middle: 0.8, co: 1.15, btn: 1.7, sb: 1.3, bb: 1 };
// базовые диапазоны опен-рейза (доля рук)
const OPEN = { early: 0.14, middle: 0.18, co: 0.27, btn: 0.45, sb: 0.4 };
const PUSH_POS = { early: 0.7, middle: 0.85, co: 1, btn: 1.25, sb: 1.3, bb: 1 };

const DEFAULTS = {
  wide: 1,             // ширина префлоп-диапазонов
  aggr: 0,             // бонус к EV ставок (доля банка): >0 — агрессивнее
  trap: 0.05,          // бонус к EV чека/колла с монстром (слоуплей)
  sizes: [0.33, 0.66, 1],
  raiseSizes: [0.75, 1.2],
  temp: 0.025,         // «температура» смешивания: больше — непредсказуемее
  priorN: 10,          // сколько наблюдений нужно, чтобы поверить статистике
  readSkill: 0.8,      // насколько верит пойманным блефам соперника
  bluff3: 0.35,        // частота 3бет-блефа подходящими руками
  bluff4: 0.12,
  callTax: 0.02,       // запас при колле — страховка от ошибок модели
  jam: 0.15,           // любовь к олл-инам: 0 — только по расчёту, 1 — давит олл-инами при любой возможности
  deepJam: false,      // пушить и при глубоком стеке (минус к силе, плюс к давлению)
};

export class EliteBot {
  constructor(name, style, params = {}, { rng = Math.random, iters = 400 } = {}) {
    this.name = name;
    this.style = style;
    this.base = { ...DEFAULTS, ...params };
    this.p = this.base;
    this.rng = rng;
    this.iters = iters;
    this.model = new FreqModel(this.base.priorN);
    this.id = null;
    this.stats = { hands: 0, bluffs: 0, bluffWins: 0, heroCalls: 0, heroWins: 0, traps: 0 };
    this.ranges = new Map();
    this.pos = new Map();
    this.board = [];
    this.U = new Float32Array(N);
  }

  onHandStart() {}
  tweak() { return {}; }

  // ==================== НАБЛЮДЕНИЕ ====================

  observe(e) {
    if (e.type === 'handStart') {
      this.board = [];
      this.ranges = new Map();
      this.pos = new Map();
      this.preRaises = 0;
      this.lateAggr = new Set();
      this.intent = null;
      this.heroCall = false;
      this.stats.hands++;
      this.headsUp = e.players.length === 2;
      for (const p of e.players) {
        this.pos.set(p.id, p.position);
        if (p.id === this.id) continue;
        this.ranges.set(p.id, new Float64Array(N).fill(1));
        this.model.raw(p.id).hands++;
      }
      this.onHandStart(e);
    } else if (e.type === 'street') {
      this.board = e.board;
      const S = strengths(e.board);
      for (const w of this.ranges.values()) for (let i = 0; i < N; i++) if (S[i] < 0) w[i] = 0;
    } else if (e.type === 'action') {
      const ctx = e.street === 'preflop'
        ? (this.preRaises === 0 ? 'open' : this.preRaises === 1 ? 'vsRaise' : 'vs3bet')
        : (e.facing > 0 ? 'facing' : 'first');
      if (e.id !== this.id) {
        const w = this.ranges.get(e.id);
        if (w) {
          if (e.action === 'fold') this.ranges.delete(e.id);
          else this.updateRange(e, ctx, w);
        }
        this.model.count(e.id, ctx, e.action);
        if (e.action === 'raise' && (e.street === 'turn' || e.street === 'river')) this.lateAggr.add(e.id);
      }
      if (e.street === 'preflop' && e.action === 'raise') this.preRaises++;
    } else if (e.type === 'showdown') {
      for (const r of e.reveals) {
        if (!this.lateAggr.has(r.id)) continue;
        const d = this.model.raw(r.id);
        d.sdAggr++;
        // блеф = рука, которая бьёт меньше 30% случайных рук на этой доске
        if (strengths(e.board)[comboIndex(r.cards[0], r.cards[1])] < 0.3) d.sdBluff++;
      }
    } else if (e.type === 'handEnd') {
      const won = e.winners.some((w) => w.id === this.id);
      if (this.intent === 'bluff' && won && !e.showdown) this.stats.bluffWins++;
      if (this.heroCall && won) this.stats.heroWins++;
    }
  }

  // Частоты соперника в ситуации; r — размер ставки, на которую он отвечает (доля банка).
  freqs(id, ctx, pos, r = null) {
    let { A, C, F } = this.model.freq(id, ctx);
    if (ctx === 'open') {
      const m = this.headsUp && pos === 'sb' ? 3.5 : POS_FREQ[pos] ?? 1;
      A = clamp(A * m, 0.01, 0.95);
      C = clamp(C * m, 0, 0.98 - A);
      F = 1 - A - C;
    }
    if (ctx === 'facing' && r != null) {
      // чем больше ставка, тем чаще фолдят (ориентир — MDF)
      F = clamp(F + 0.35 * (r / (1 + r) - 0.4), 0.02, 0.95);
      A = Math.min(A, 1 - F);
      C = 1 - A - F;
    }
    return { A, C, F };
  }

  bluffShare(id, ctx) {
    if (ctx === 'open') return 0.04;
    if (ctx === 'vsRaise') return 0.3;
    if (ctx === 'vs3bet') return 0.2;
    const R = this.p.readSkill;
    return R * this.model.bluffShare(id) + (1 - R) * 0.3;
  }

  updateRange(e, ctx, w) {
    const S = strengths(this.board);
    const U = this.U;
    quantiles(w, S, U);
    const r = ctx === 'facing' ? e.facing / Math.max(1, e.potBefore - e.facing) : null;
    const f = this.freqs(e.id, ctx, this.pos.get(e.id), r);
    const bl = this.bluffShare(e.id, ctx);
    const pre = e.street === 'preflop';
    let max = 0;
    for (let i = 0; i < N; i++) {
      if (w[i] <= 0) continue;
      if (S[i] < 0) { w[i] = 0; continue; }
      w[i] *= likelihood(e.action, U[i], ctx, f, bl, pre);
      if (w[i] > max) max = w[i];
    }
    if (max > 0) for (let i = 0; i < N; i++) w[i] /= max;
  }

  // ==================== РЕШЕНИЕ ====================

  act(s) {
    this.board = s.board;
    const opps = s.players.filter((p) => !p.me && !p.folded);
    for (const o of opps) if (!this.ranges.has(o.id)) this.ranges.set(o.id, new Float64Array(N).fill(1));
    this.p = { ...this.base, ...this.tweak(s, opps) };
    return s.street === 'preflop' ? this.preflop(s, opps) : this.postflop(s, opps);
  }

  isIP(s) {
    const me = s.players.findIndex((p) => p.me);
    return s.players.every((p, i) => p.me || p.folded || i < me);
  }

  // Розыгрыш: рука против диапазонов. HU на ривере — точный перебор, иначе Монте-Карло.
  simulate(s, opps, iters) {
    const dead = new Uint8Array(52);
    for (const c of s.hole) dead[c] = 1;
    for (const c of s.board) dead[c] = 1;
    const S = strengths(s.board);
    const R = opps.map((o) => {
      const src = this.ranges.get(o.id);
      const w = new Float64Array(N);
      let tot = 0;
      for (let i = 0; i < N; i++) {
        const [a, b] = COMBOS[i];
        if (src[i] > 0 && !dead[a] && !dead[b]) { w[i] = src[i]; tot += w[i]; }
      }
      if (tot === 0) for (let i = 0; i < N; i++) {
        const [a, b] = COMBOS[i];
        if (!dead[a] && !dead[b] && S[i] >= 0) { w[i] = 1; tot++; }
      }
      const U = new Float32Array(N);
      quantiles(w, S, U);
      return { o, w, tot, U };
    });

    const res = [], wt = [], picks = R.map(() => []);
    const need = 5 - s.board.length;
    const hero = s.hole.concat(s.board);
    if (R.length === 1 && need === 0) {
      const mine = evaluate(hero);
      const cards = s.board.slice();
      const { w } = R[0];
      for (let i = 0; i < N; i++) {
        if (w[i] <= 0) continue;
        cards[5] = COMBOS[i][0];
        cards[6] = COMBOS[i][1];
        const v = evaluate(cards);
        res.push(mine > v ? 1 : mine === v ? 0.5 : 0);
        wt.push(w[i]);
        picks[0].push(i);
      }
    } else {
      const cums = R.map(({ w }) => {
        const c = new Float64Array(N);
        let acc = 0;
        for (let i = 0; i < N; i++) { acc += w[i]; c[i] = acc; }
        return c;
      });
      const used = new Int32Array(52);
      const full = s.board.slice();
      const mineC = new Array(7), oppC = new Array(7);
      for (let it = 1; it <= iters; it++) {
        const chosen = [];
        let ok = true;
        for (let k = 0; k < R.length && ok; k++) {
          ok = false;
          for (let t = 0; t < 40; t++) {
            const idx = bsearch(cums[k], this.rng() * R[k].tot);
            const [a, b] = COMBOS[idx];
            if (dead[a] || dead[b] || used[a] === it || used[b] === it) continue;
            used[a] = used[b] = it;
            chosen.push(idx);
            ok = true;
            break;
          }
        }
        if (!ok) continue;
        for (let b = 0; b < need; b++) {
          let c;
          do c = (this.rng() * 52) | 0; while (dead[c] || used[c] === it);
          used[c] = it;
          full[s.board.length + b] = c;
        }
        for (let q = 0; q < 5; q++) mineC[q] = oppC[q] = full[q];
        mineC[5] = s.hole[0]; mineC[6] = s.hole[1];
        const mine = evaluate(mineC);
        let best = -1, ties = 0;
        for (const idx of chosen) {
          oppC[5] = COMBOS[idx][0]; oppC[6] = COMBOS[idx][1];
          const v = evaluate(oppC);
          if (v > best) { best = v; ties = 0; }
          if (v === best) ties++;
        }
        res.push(mine > best ? 1 : mine === best ? 1 / (ties + 1) : 0);
        wt.push(1);
        chosen.forEach((idx, k) => picks[k].push(idx));
      }
    }
    let num = 0, den = 0;
    for (let j = 0; j < res.length; j++) { num += res[j] * wt[j]; den += wt[j]; }
    return { R, res, wt, picks, eq: den ? num / den : 0.5 };
  }

  // EV ставки/рейза до `to` (по сравнению с фолдом = 0).
  betEV(s, sim, to, ctxFor) {
    const B = to - s.myBet;
    const r = (to - s.currentBet) / Math.max(1, s.pot + s.toCall);
    const folds = [], conts = [];
    let callers = 0;
    for (const { o, w, tot, U } of sim.R) {
      const ctx = ctxFor(o);
      const { F } = this.freqs(o.id, ctx, this.pos.get(o.id), ctx === 'facing' ? r : null);
      const sg = ctx === 'facing' ? 0.05 : 0.035;
      let fp = 0;
      for (let i = 0; i < N; i++) if (w[i] > 0) fp += w[i] * sig((F - U[i]) / sg);
      fp = o.allIn ? 0 : fp / tot;
      folds.push(fp);
      conts.push((u) => (o.allIn ? 1 : 1 - sig((F - u) / sg)));
      callers += Math.min(to - o.bet, o.stack) * (1 - fp);
    }
    const Fall = folds.reduce((a, b) => a * b, 1);
    let num = 0, den = 0;
    for (let j = 0; j < sim.res.length; j++) {
      let c = sim.wt[j];
      for (let k = 0; k < sim.R.length; k++) c *= conts[k](sim.R[k].U[sim.picks[k][j]]);
      num += sim.res[j] * c;
      den += c;
    }
    const eqC = den > 0 ? num / den : sim.eq;
    const potIfCalled = s.pot + B + callers / Math.max(0.05, 1 - Fall);
    const allIn = to >= s.myBet + s.stack;
    const Rb = s.street === 'river' || allIn ? 1 : 0.95;
    return Fall * s.pot + (1 - Fall) * (eqC * Rb * potIfCalled - B);
  }

  raiseTo(s, frac) {
    let to = s.currentBet + frac * (s.pot + s.toCall);
    to = Math.max(to, s.minRaiseTo);
    const maxTo = s.myBet + s.stack;
    if (maxTo - to < (s.pot + to - s.myBet) * 0.3) to = maxTo;
    return Math.round(Math.min(to, maxTo));
  }

  choose(cands, pot) {
    const T = Math.max(this.p.temp * pot, 0.5);
    const m = Math.max(...cands.map((c) => c.ev));
    const ws = cands.map((c) => Math.exp((c.ev - m) / T));
    let x = this.rng() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cands.length; i++) if ((x -= ws[i]) <= 0) return cands[i];
    return cands[cands.length - 1];
  }

  // ==================== ПОСТФЛОП ====================

  postflop(s, opps) {
    const P = this.p;
    const sim = this.simulate(s, opps, this.iters);
    const eq = sim.eq;
    const pot = s.pot;
    const river = s.street === 'river';
    const Rz = river ? 1 : this.isIP(s) ? 1 : 0.9;
    const monster = eq > 0.8 && !river;
    const maxTo = s.myBet + s.stack;
    const cands = [];
    const facingCtx = () => 'facing';

    if (s.toCall === 0) {
      cands.push({ a: { type: 'check' }, ev: eq * pot * Rz + (monster ? P.trap * pot : 0), trap: monster });
    } else {
      cands.push({ a: { type: 'fold' }, ev: 0 });
      const callAll = s.toCall >= s.stack;
      cands.push({
        a: { type: 'call' },
        ev: eq * (callAll ? 1 : Rz) * (pot + s.toCall) - s.toCall - P.callTax * (pot + s.toCall)
          + (monster ? P.trap * pot * 0.5 : 0),
        trap: monster,
      });
    }
    if (s.stack > s.toCall && opps.some((o) => !o.allIn)) {
      const tos = new Set();
      for (const f of s.toCall === 0 ? P.sizes : P.raiseSizes) tos.add(this.raiseTo(s, f));
      // олл-ин в вариантах: при небольшом стеке — всем; при глубоком — только «пушерам» (Маньяк)
      if (s.stack <= pot * 3 || P.deepJam) tos.add(maxTo);
      for (const to of tos) {
        // давление: олл-ин получает бонус по характеру бота
        const ev = this.betEV(s, sim, to, facingCtx) + P.aggr * pot + (to === maxTo ? P.jam * 0.015 * pot : 0);
        cands.push({ a: { type: 'raise', to }, ev, eq });
      }
    }
    const pick = this.choose(cands, pot);
    if (pick.a.type === 'raise' && eq < 0.35) {
      this.intent = 'bluff';
      this.stats.bluffs++;
    }
    if (pick.trap) this.stats.traps++;
    if (pick.a.type === 'call' && river && postflopStrength(s.hole, s.board).made < 0.5) {
      this.heroCall = true;
      this.stats.heroCalls++;
    }
    return pick.a;
  }

  // ==================== ПРЕФЛОП ====================

  preflop(s, opps) {
    const P = this.p;
    const bb = s.bigBlind;
    const pct = preflopPct(s.hole);
    const pre = s.actions.filter((a) => a.street === 'preflop');
    const raises = pre.filter((a) => a.action === 'raise').length;
    const maxOpp = Math.max(...opps.map((o) => o.stack + o.bet));
    const eff = Math.min(s.stack + s.myBet, maxOpp) / bb;
    const r = this.rng();
    const [r1, r2] = [s.hole[0] >> 2, s.hole[1] >> 2];
    const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
    const suited = (s.hole[0] & 3) === (s.hole[1] & 3);
    // руки для блеф-3бета: одномастные тузы (блокируют AA/AK) и одномастные коннекторы
    const bluffy = suited && (hi === 12 || (hi - lo <= 2 && lo >= 3));

    if (eff <= 13) return this.pushFold(s, opps, pct, eff, raises);

    if (raises === 0) {
      const limpers = pre.filter((a) => a.action === 'call').length;
      if (s.position === 'bb') {
        return pct >= 1 - 0.14 * P.wide ? this.open(s, bb * (3.5 + limpers)) : { type: 'check' };
      }
      let w = (this.headsUp && s.position === 'sb' ? 0.85 : OPEN[s.position] ?? 0.2) * P.wide;
      if (limpers) w *= 0.75;
      else if (['co', 'btn', 'sb'].includes(s.position)) {
        // блайнды много фолдят → воруем шире
        const blinds = opps.filter((o) => ['sb', 'bb'].includes(this.pos.get(o.id)));
        if (blinds.length) {
          const fb = blinds.reduce((a, o) => a + this.model.freq(o.id, 'vsRaise').F, 0) / blinds.length;
          w *= clamp(1 + (fb - 0.76) * 2.5, 0.7, 1.7);
        }
      }
      // короткий стек: иногда сразу пушим
      if (eff <= 20 && pct >= 1 - w * 0.6 && r < P.jam * 0.6) return this.jam(s);
      if (pct >= 1 - w) {
        const size = s.position === 'sb' ? 3 : s.position === 'early' ? 2.5 : 2.3;
        return this.open(s, bb * (size + limpers));
      }
      return this.passive(s);
    }

    const sim = this.simulate(s, opps, Math.round(this.iters * 0.6));
    const eq = sim.eq;
    const potOdds = s.toCall / (s.pot + s.toCall);
    const ip = this.isIP(s);
    const callAll = s.toCall >= s.stack;
    const R = callAll ? 1 : ip ? 0.95 : s.position === 'bb' ? 0.85 : 0.8;
    const implied = !callAll && (lo === hi || (suited && hi - lo <= 2)) && eff > 40 ? 0.04 : 0;
    const raiser = [...pre].reverse().find((a) => a.action === 'raise').id;
    const callers = pre.filter((a) => a.action === 'call').length;

    if (raises === 1) {
      const late = ['co', 'btn', 'sb'].includes(this.pos.get(raiser));
      // насколько широко открывается рейзер — от этого зависят 3бет и защита
      const openW = this.freqs(raiser, 'open', this.pos.get(raiser)).A;
      const vw = clamp(openW * 0.16, 0.03, 0.14) * P.wide;
      const defend = clamp(openW * 1.25 + (s.position === 'bb' ? 0.15 : 0), 0.3, 0.9) * P.wide;
      const fr = this.model.freq(raiser, 'vs3bet').F;
      const to3 = s.currentBet * (ip ? 3 : 3.8) + callers * s.currentBet;
      // рестил олл-ином: против широких опенов давим пушем, особенно при стеке до 40 бб
      // и только против тех, кто часто сбрасывает на 3бет (иначе это слив)
      const jamW = clamp(openW * 0.3, 0.04, 0.25) * (0.5 + P.jam);
      if (pct >= 1 - vw) return eff <= 30 ? this.jam(s) : this.open(s, to3);
      if (eff <= 35 && fr >= 0.55 && pct >= 1 - jamW && r < 0.2 + P.jam * 0.6) {
        this.markBluff();
        return this.jam(s);
      }
      if (bluffy && pct >= 0.5 && r < P.bluff3 * clamp(fr / 0.5, 0.4, 1.8) * (late ? 1.3 : 0.7)) {
        this.markBluff();
        return this.open(s, to3);
      }
      if (eq * R + implied >= potOdds && pct >= 1 - defend) return { type: 'call' };
      return this.passive(s);
    }
    if (raises === 2) {
      const a3 = this.model.freq(raiser, 'vsRaise').A;
      const vw = 0.022 * P.wide * clamp(a3 / 0.08, 0.7, 2.2);
      // чем чаще он 3бетит, тем шире продолжаем
      const cont = clamp(a3 * 2.2, 0.16, 0.6) * P.wide;
      if (pct >= 1 - vw) return eff <= 110 && (pct >= 0.98 || r < 0.4 + P.jam) ? this.jam(s) : this.open(s, s.currentBet * 2.3);
      // 4бет-олл-ин блефом/полублефом: тузы и пары против частых 3бетов
      if ((hi === 12 || lo === hi) && pct > 0.8 && eff <= 60 && a3 > 0.12 && r < P.jam * 0.4 * clamp(a3 / 0.08, 0.5, 2)) {
        this.markBluff();
        return this.jam(s);
      }
      if (suited && hi === 12 && pct > 0.75 && r < P.bluff4) {
        this.markBluff();
        return this.open(s, s.currentBet * 2.3);
      }
      if (eq * R + implied >= potOdds && pct >= 1 - cont) return { type: 'call' };
      return this.passive(s);
    }
    // 4бет и выше
    if (pct >= 0.985) return this.jam(s);
    if (eq * R >= potOdds) return pct >= 0.95 && r < P.jam ? this.jam(s) : { type: 'call' };
    return this.passive(s);
  }

  pushFold(s, opps, pct, eff, raises) {
    const jam = { type: 'raise', to: s.myBet + s.stack };
    if (raises === 0) {
      if (s.position === 'bb') return pct >= 0.8 ? jam : { type: 'check' };
      const w = clamp((0.12 + (13 - eff) * 0.045) * (PUSH_POS[s.position] ?? 1) * this.p.wide, 0.08, 0.85);
      return pct >= 1 - w ? jam : this.passive(s);
    }
    const sim = this.simulate(s, opps, Math.round(this.iters * 0.6));
    const potOdds = s.toCall / (s.pot + s.toCall);
    if (sim.eq >= potOdds + 0.02) return sim.eq > 0.55 && s.stack > s.toCall ? jam : { type: 'call' };
    return this.passive(s);
  }

  open(s, to) {
    const maxTo = s.myBet + s.stack;
    to = Math.max(to, s.minRaiseTo);
    if (to > maxTo * 0.4) to = maxTo;
    return { type: 'raise', to: Math.round(Math.min(to, maxTo)) };
  }

  jam(s) {
    return { type: 'raise', to: s.myBet + s.stack };
  }

  passive(s) {
    return { type: s.toCall > 0 ? 'fold' : 'check' };
  }

  markBluff() {
    this.intent = 'bluff';
    this.stats.bluffs++;
  }
}

// ==================== ВСПОМОГАТЕЛЬНОЕ ====================

// u = место комбинации в диапазоне по силе (0 — самая слабая, 1 — самая сильная), с учётом весов.
function quantiles(w, S, out) {
  const idx = [];
  let tot = 0;
  for (let i = 0; i < N; i++) if (w[i] > 0 && S[i] >= 0) { idx.push(i); tot += w[i]; }
  idx.sort((a, b) => S[a] - S[b]);
  let cum = 0;
  for (let k = 0; k < idx.length; ) {
    let j = k, grp = 0;
    while (j < idx.length && S[idx[j]] === S[idx[k]]) grp += w[idx[j++]];
    const u = (cum + grp / 2) / tot;
    for (let t = k; t < j; t++) out[idx[t]] = u;
    cum += grp;
    k = j;
  }
  return tot;
}

// Вероятность действия для руки на позиции u в диапазоне.
// Агрессия = топ диапазона + блеф (постфлоп — снизу, префлоп — руки чуть ниже колл-диапазона).
function likelihood(action, u, ctx, f, bl, pre) {
  const sg = pre ? 0.035 : 0.05;
  const top = f.A * (1 - bl), bot = f.A * bl;
  const aggr = sig((u - (1 - top)) / sg);
  const bluff = pre
    ? sig((u - Math.max(0, f.F - bot)) / sg) * sig((f.F - u) / sg)
    : sig((bot - u) / sg);
  let L;
  if (action === 'raise') L = aggr + bluff;
  else if (ctx === 'first' || (ctx === 'open' && action === 'check')) L = 1 - 0.85 * aggr - 0.85 * bluff;
  else L = sig((u - f.F) / sg) * (1 - 0.8 * aggr);
  return Math.max(0.01, L); // никогда не вычёркиваем руку полностью — защита от ошибок модели
}

function bsearch(cum, x) {
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (cum[m] < x) lo = m + 1;
    else hi = m;
  }
  return lo;
}
