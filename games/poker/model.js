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
