// Безлимитный Техасский Холдем: блайнды, раунды ставок, сайд-поты, шоудаун.
// Игрок: { id, name, stack, bot }. Бот: act(state) -> действие (можно Promise — так ходит живой игрок),
// observe(event) и deal(hole) — по желанию.
// Действия: { type: 'fold' | 'check' | 'call' } или { type: 'raise', to } (to — итоговая ставка на улице).
import { newDeck, shuffle, evaluate } from './cards.js';

const STREETS = ['preflop', 'flop', 'turn', 'river'];

export class Table {
  constructor({ players, smallBlind = 5, bigBlind = 10, rng = Math.random, deckRng = rng, onEvent = null, pause = null }) {
    this.players = players;
    this.sb = smallBlind;
    this.bb = bigBlind;
    this.rng = rng;
    this.deckRng = deckRng; // отдельный генератор для колоды — нужен для дубликат-матчей
    this.onEvent = onEvent;
    this.pause = pause; // async (kind) => {} — паузы для живых игроков (после хода, улицы)
    this.button = -1;
    this.handId = 0;
  }

  emit(e) {
    for (const p of this.players) p.bot?.observe?.(e);
    this.onEvent?.(e);
  }

  async playHand() {
    const seated = this.players.filter((p) => p.stack > 0);
    if (seated.length < 2) return null;
    this.handId++;
    // двигаем баттон к следующему живому игроку
    const N = this.players.length;
    do this.button = (this.button + 1) % N; while (this.players[this.button].stack <= 0);
    const ps = [];
    for (let k = 1; k <= N; k++) {
      const p = this.players[(this.button + k) % N];
      if (p.stack > 0) ps.push(p); // последний в списке = баттон
    }
    const n = ps.length;
    const hs = ps.map((p) => ({ p, hole: [], bet: 0, total: 0, folded: false, allIn: false }));
    const sbIdx = n === 2 ? 1 : 0;
    const bbIdx = n === 2 ? 0 : 1;
    const positions = hs.map((_, i) => positionName(i, n, sbIdx, bbIdx));

    let deck = shuffle(newDeck(), this.deckRng);
    // только демо-стол админа задаёт этот хук; на обычных столах и в турнирах его нет
    if (this.demoDeck) deck = this.demoDeck(deck, ps.map((p) => p.id));
    for (const h of hs) h.hole = [deck.pop(), deck.pop()];
    for (const h of hs) h.p.bot?.deal?.(h.hole.slice());
    this.deck = deck; // остаток колоды — его видит только подсказка за столом с ботами
    const board = [];
    const actions = [];
    const ctx = { hs, board, actions, positions, street: 'preflop', handId: this.handId };

    this.emit({
      type: 'handStart', handId: this.handId, bigBlind: this.bb,
      button: ps[n - 1].id,
      players: ps.map((p, i) => ({ id: p.id, name: p.name, stack: p.stack, position: positions[i] })),
    });

    this.post(hs[sbIdx], this.sb);
    this.post(hs[bbIdx], this.bb);
    this.emit({
      type: 'blinds', handId: this.handId,
      sb: { id: hs[sbIdx].p.id, amount: hs[sbIdx].bet },
      bb: { id: hs[bbIdx].p.id, amount: hs[bbIdx].bet },
    });

    for (const street of STREETS) {
      ctx.street = street;
      if (street !== 'preflop') {
        deck.pop(); // сжигаем
        const k = street === 'flop' ? 3 : 1;
        for (let i = 0; i < k; i++) board.push(deck.pop());
        for (const h of hs) h.bet = 0;
        this.emit({ type: 'street', handId: this.handId, street, board: board.slice() });
        await this.pause?.('street');
      }
      const first = street === 'preflop' ? (bbIdx + 1) % n : 0;
      await this.bettingRound(ctx, first, street === 'preflop' ? this.bb : 0);
      if (hs.filter((h) => !h.folded).length < 2) break;
    }

    return this.finish(ctx);
  }

  post(h, amount) {
    const a = Math.min(amount, h.p.stack);
    h.p.stack -= a;
    h.bet += a;
    h.total += a;
    if (h.p.stack === 0) h.allIn = true;
    return a;
  }

  async bettingRound(ctx, first, startBet) {
    const { hs } = ctx;
    const n = hs.length;
    const canAct = (h) => !h.folded && !h.allIn;
    let currentBet = Math.max(startBet, ...hs.map((h) => h.bet));
    let minRaise = this.bb;
    let pending = new Set(hs.map((h, i) => (canAct(h) ? i : -1)).filter((i) => i >= 0));
    let i = first;
    let guard = 0;
    while (pending.size && hs.filter((h) => !h.folded).length > 1 && guard++ < 500) {
      if (pending.has(i)) {
        pending.delete(i);
        const h = hs[i];
        const toCall = currentBet - h.bet;
        const othersCanAct = hs.some((o, j) => j !== i && canAct(o));
        if (toCall > 0 || othersCanAct) {
          const potBefore = hs.reduce((s, x) => s + x.total, 0);
          const state = this.stateFor(ctx, i, currentBet, minRaise);
          let a;
          try { a = (await h.p.bot.act(state)) || { type: 'fold' }; } catch (err) { a = { type: 'fold' }; }
          let type = a.type === 'bet' ? 'raise' : a.type;
          let to = Number(a.to ?? a.amount ?? 0);
          if (type === 'raise') {
            const maxTo = h.bet + h.p.stack;
            if (!othersCanAct || maxTo <= currentBet) type = 'call';
            else to = Math.min(maxTo, Math.max(Math.round(to), currentBet + minRaise));
          }
          if (type === 'check' && toCall > 0) type = 'fold';
          if ((type === 'call' || type === 'fold') && toCall === 0) type = 'check';
          if (!['fold', 'check', 'call', 'raise'].includes(type)) type = toCall > 0 ? 'fold' : 'check';

          let added = 0;
          if (type === 'fold') h.folded = true;
          else if (type === 'call') added = this.post(h, toCall);
          else if (type === 'raise') {
            added = this.post(h, to - h.bet);
            const raiseSize = h.bet - currentBet;
            if (raiseSize >= minRaise) minRaise = raiseSize;
            currentBet = Math.max(currentBet, h.bet);
            pending = new Set(hs.map((o, j) => (j !== i && canAct(o) ? j : -1)).filter((j) => j >= 0));
          }
          const ev = {
            type: 'action', handId: ctx.handId, street: ctx.street, id: h.p.id,
            action: type, to: h.bet, added, facing: toCall, potBefore, allIn: h.allIn,
          };
          ctx.actions.push(ev);
          this.emit(ev);
          await this.pause?.('action');
        }
      }
      i = (i + 1) % n;
    }
  }

  stateFor(ctx, i, currentBet, minRaise) {
    const { hs } = ctx;
    const h = hs[i];
    return {
      handId: ctx.handId,
      street: ctx.street,
      hole: h.hole.slice(),
      board: ctx.board.slice(),
      pot: hs.reduce((s, x) => s + x.total, 0),
      currentBet,
      myBet: h.bet,
      toCall: Math.min(currentBet - h.bet, h.p.stack),
      minRaiseTo: currentBet + minRaise,
      stack: h.p.stack,
      bigBlind: this.bb,
      position: ctx.positions[i],
      players: hs.map((x) => ({
        id: x.p.id, name: x.p.name, stack: x.p.stack, bet: x.bet,
        total: x.total, folded: x.folded, allIn: x.allIn, me: x === h,
      })),
      actions: ctx.actions.slice(),
    };
  }

  finish(ctx) {
    const { hs, board } = ctx;
    const live = hs.filter((h) => !h.folded);
    const won = new Map();
    const give = (h, amt) => {
      h.p.stack += amt;
      won.set(h.p.id, (won.get(h.p.id) || 0) + amt);
    };
    let reveals = [];
    const showdown = live.length > 1;
    if (!showdown) {
      give(live[0], hs.reduce((s, h) => s + h.total, 0));
    } else {
      for (const h of live) h.score = evaluate(h.hole.concat(board));
      reveals = live.map((h) => ({ id: h.p.id, cards: h.hole.slice(), score: h.score }));
      this.emit({ type: 'showdown', handId: ctx.handId, board: board.slice(), reveals });
      const levels = [...new Set(hs.map((h) => h.total).filter((t) => t > 0))].sort((a, b) => a - b);
      let prev = 0;
      for (const lvl of levels) {
        let amt = 0;
        for (const h of hs) amt += Math.max(0, Math.min(h.total, lvl) - prev);
        let elig = live.filter((h) => h.total >= lvl);
        if (!elig.length) elig = live.filter((h) => h.total === Math.max(...live.map((x) => x.total)));
        const best = Math.max(...elig.map((h) => h.score));
        const winners = elig.filter((h) => h.score === best);
        const share = Math.floor(amt / winners.length);
        winners.forEach((w, k) => give(w, share + (k < amt - share * winners.length ? 1 : 0)));
        prev = lvl;
      }
    }
    const result = {
      type: 'handEnd', handId: ctx.handId, board: board.slice(), showdown, reveals,
      winners: [...won].map(([id, amount]) => ({ id, amount })),
      contributions: hs.map((h) => ({ id: h.p.id, total: h.total })),
    };
    this.emit(result);
    return result;
  }
}

function positionName(i, n, sbIdx, bbIdx) {
  if (i === sbIdx) return 'sb';
  if (i === bbIdx) return 'bb';
  if (i === n - 1) return 'btn';
  if (i === n - 2) return 'co';
  return i - 2 < (n - 2) / 2 ? 'early' : 'middle';
}
