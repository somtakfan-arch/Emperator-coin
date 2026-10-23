// Модель соперников: каждый бот ведёт свою статистику по каждому игроку за столом.
import { postflopStrength } from './cards.js';

const PRIOR = { vpip: 0.28, pfr: 0.16, foldToBet: 0.45, bluff: 0.25 };

export class OpponentModel {
  constructor() {
    this.stats = new Map();
    this.hand = new Map(); // id -> флаги текущей раздачи
  }

  raw(id) {
    if (!this.stats.has(id)) {
      this.stats.set(id, {
        hands: 0, vpip: 0, pfr: 0, aggr: 0, passive: 0,
        faced: 0, foldFaced: 0, sdAggr: 0, sdBluff: 0,
      });
    }
    return this.stats.get(id);
  }

  observe(e, selfId) {
    if (e.type === 'handStart') {
      this.hand.clear();
      for (const p of e.players) {
        if (p.id === selfId) continue;
        this.raw(p.id).hands++;
        this.hand.set(p.id, { vpip: false, pfr: false, lateAggr: false });
      }
    } else if (e.type === 'action') {
      const f = this.hand.get(e.id);
      if (!f) return;
      const st = this.raw(e.id);
      if (e.street === 'preflop') {
        if ((e.action === 'call' || e.action === 'raise') && !f.vpip) { f.vpip = true; st.vpip++; }
        if (e.action === 'raise' && !f.pfr) { f.pfr = true; st.pfr++; }
      } else {
        if (e.action === 'raise') st.aggr++;
        if (e.action === 'call') st.passive++;
        if (e.facing > 0) {
          st.faced++;
          if (e.action === 'fold') st.foldFaced++;
        }
        if (e.action === 'raise' && (e.street === 'turn' || e.street === 'river')) f.lateAggr = true;
      }
    } else if (e.type === 'showdown') {
      for (const r of e.reveals) {
        const f = this.hand.get(r.id);
        if (!f || !f.lateAggr) continue;
        const st = this.raw(r.id);
        st.sdAggr++;
        // давил на тёрне/ривере, а показал мусор — это был блеф
        if (postflopStrength(r.cards, e.board).made < 0.3) st.sdBluff++;
      }
    }
  }

  // Сглаженные (с априорными значениями) оценки — работают даже после пары раздач.
  get(id) {
    const s = this.raw(id);
    const passive = s.passive + 1;
    return {
      hands: s.hands,
      vpip: (s.vpip + PRIOR.vpip * 6) / (s.hands + 6),
      pfr: (s.pfr + PRIOR.pfr * 6) / (s.hands + 6),
      af: (s.aggr + 1) / passive,
      foldToBet: (s.foldFaced + PRIOR.foldToBet * 5) / (s.faced + 5),
      bluffRate: (s.sdBluff + PRIOR.bluff * 3) / (s.sdAggr + 3),
      samples: s.sdAggr,
    };
  }
}

// ---------- Модель частот для элитных ботов ----------
// Для каждого соперника и каждой ситуации считаем: как часто он агрессирует (A),
// продолжает пассивно (C) и фолдит (F). Плюс доля блефа в его поздней агрессии.
//   open    — префлоп, рейзов ещё не было
//   vsRaise — префлоп против одного рейза
//   vs3bet  — префлоп против двух и более рейзов
//   first   — постфлоп, ставки нет (бет или чек)
//   facing  — постфлоп, против ставки
export const CONTEXT_PRIOR = {
  open: { agg: 0.2, call: 0.06, fold: 0.74 },
  vsRaise: { agg: 0.08, call: 0.16, fold: 0.76 },
  vs3bet: { agg: 0.2, call: 0.3, fold: 0.5 },
  first: { agg: 0.45, call: 0.55, fold: 0 },
  facing: { agg: 0.1, call: 0.45, fold: 0.45 },
};
const BLUFF_PRIOR = 0.3;

export class FreqModel {
  constructor(priorN = 10) {
    this.priorN = priorN;
    this.data = new Map();
  }

  raw(id) {
    if (!this.data.has(id)) {
      const ctx = {};
      for (const k in CONTEXT_PRIOR) ctx[k] = { agg: 0, call: 0, fold: 0 };
      this.data.set(id, { hands: 0, ctx, sdAggr: 0, sdBluff: 0 });
    }
    return this.data.get(id);
  }

  count(id, ctx, action) {
    const c = this.raw(id).ctx[ctx];
    if (action === 'raise') c.agg++;
    else if (action === 'fold') c.fold++;
    else c.call++; // колл или чек
  }

  freq(id, ctx) {
    const c = this.raw(id).ctx[ctx];
    const p = CONTEXT_PRIOR[ctx];
    const n = c.agg + c.call + c.fold + this.priorN;
    return {
      A: (c.agg + p.agg * this.priorN) / n,
      C: (c.call + p.call * this.priorN) / n,
      F: (c.fold + p.fold * this.priorN) / n,
      n: n - this.priorN,
    };
  }

  // Сохранить / загрузить досье на одного игрока (боты помнят человека между столами)
  exportPlayer(id) {
    return this.data.has(id) ? JSON.stringify(this.data.get(id)) : null;
  }

  importPlayer(id, json) {
    try {
      const d = JSON.parse(json);
      if (d && d.ctx) this.data.set(id, { ...this.raw(id), ...d });
    } catch {}
  }

  bluffShare(id) {
    const d = this.raw(id);
    return (d.sdBluff + BLUFF_PRIOR * 4) / (d.sdAggr + 4);
  }

  // VPIP-подобная «лузовость» для отчёта
  looseness(id) {
    const f = this.freq(id, 'open');
    return f.A + f.C;
  }
}
