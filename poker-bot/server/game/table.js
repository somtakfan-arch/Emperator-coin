// Стол на сервере: обёртка над движком, которая
//  • ждёт ход живого игрока (с таймером), даёт ботам «подумать»,
//  • ведёт картинку стола и рассылает её каждому игроку — со СВОИМИ картами, чужие не уходят,
//  • делает паузы, чтобы за игрой можно было следить.
import { randomInt } from 'node:crypto';
import { Table } from '../../core/engine.js';
import { describeHand, evaluate, handCategory } from '../../core/cards.js';
import { config } from '../config.js';
import { db } from '../db.js';

const addHandWon = db.prepare('UPDATE users SET hands_won = hands_won + 1 WHERE id = ?');
const getHandsWon = db.prepare('SELECT hands_won FROM users WHERE id = ?');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms * config.speed));
const cryptoRng = () => randomInt(0, 2 ** 32) / 2 ** 32; // колода тасуется криптостойко

function autoAction(state) {
  return { type: state.toCall > 0 ? 'fold' : 'check' };
}

// Место живого игрока. Для движка это такой же «бот» с act(state).
export class HumanSeat {
  constructor(userId, hub) {
    this.id = userId;
    this.hub = hub;
    this.table = null;
    this.hole = null;
    this.pending = null;
    this.timeouts = 0;
    this.sittingOut = false;
  }

  deal(hole) {
    this.hole = hole;
  }

  act(state) {
    this.table.setActor(this.id, state);
    if (this.sittingOut) return autoAction(state);
    const seconds = this.hub.isOnline(this.id) ? config.turnSeconds : Math.min(8, config.turnSeconds);
    return new Promise((resolve) => {
      const finish = (a) => {
        clearTimeout(timer);
        this.pending = null;
        resolve(a);
      };
      const timer = setTimeout(() => {
        // не успел — чек/фолд; два раза подряд — садим «отошёл»
        if (++this.timeouts >= 2) this.sittingOut = true;
        finish(autoAction(state));
        this.table?.broadcast();
      }, seconds * 1000);
      this.pending = { state, finish, deadline: Date.now() + seconds * 1000 };
    });
  }

  submit(a) {
    if (!this.pending) return;
    const s = this.pending.state;
    const type = ['fold', 'check', 'call', 'raise'].includes(a?.type) ? a.type : null;
    if (!type) return;
    this.timeouts = 0;
    const to = Math.floor(Number(a.to) || 0);
    this.pending.finish(type === 'raise' ? { type, to: Math.max(s.minRaiseTo, Math.min(to, s.myBet + s.stack)) } : { type });
  }

  forceFold() {
    this.pending?.finish(autoAction(this.pending.state));
  }
}

// Бот с паузой «на подумать», чтобы игра выглядела живой.
export function botSeat(bot, table) {
  return {
    id: bot.id,
    hole: null,
    deal(hole) {
      this.hole = hole; // нужно подсказке за столом с ботами
    },
    act: async (state) => {
      table.setActor(bot.id, state);
      await sleep(500 + Math.random() * 900);
      // кнопка админа «все ва-банк»: до конца раздачи боты идут олл-ин
      if (table.forceJam) return state.stack > state.toCall ? { type: 'raise', to: state.myBet + state.stack } : { type: 'call' };
      return bot.act(state);
    },
    observe: (e) => bot.observe(e),
  };
}

const ACTION_TEXT = { fold: 'Фолд', check: 'Чек', call: 'Колл' };

export class GameTable {
  constructor({ id, kind, title, hub, sb, bb }) {
    this.id = id;
    this.kind = kind; // 'bots' | 'tour'
    this.title = title;
    this.hub = hub;
    this.players = []; // { id, name, stack, bot, isBot, seat }
    this.engine = new Table({
      players: this.players, smallBlind: sb, bigBlind: bb, deckRng: cryptoRng,
      onEvent: (e) => this.onEvent(e),
      pause: (k) => sleep(k === 'street' ? 700 : 450),
    });
    this.closed = false;
    this.inHand = false;
    this.extra = () => ({}); // доп. инфа для экрана (уровень турнира и т.п.)
    this.beforeHand = null;
    this.afterHand = null;
    this.resetView();
  }

  get sb() { return this.engine.sb; }
  get bb() { return this.engine.bb; }
  setBlinds(sb, bb) {
    this.engine.sb = sb;
    this.engine.bb = bb;
  }

  resetView() {
    this.v = { board: [], pot: 0, bets: {}, folded: new Set(), last: {}, shown: {}, dealt: new Set(), actor: null, deadline: 0, result: null, handId: 0, buttonId: null };
  }

  addPlayer(p) {
    if (p.bot instanceof HumanSeat) p.bot.table = this;
    // выигранные раздачи — значок рядом с игроком за столом
    if (!p.isBot && p.handsWon == null) p.handsWon = getHandsWon.get(p.id)?.hands_won ?? 0;
    this.players.push(p);
    this.broadcast();
  }

  removePlayer(id) {
    const i = this.players.findIndex((p) => p.id === id);
    if (i < 0) return null;
    const [p] = this.players.splice(i, 1);
    if (i <= this.engine.button) this.engine.button--; // баттон не перепрыгивает
    return p;
  }

  humans() {
    return this.players.filter((p) => !p.isBot);
  }

  async run() {
    while (!this.closed) {
      await this.beforeHand?.();
      if (this.closed) break;
      if (this.players.filter((p) => p.stack > 0).length < 2) {
        await sleep(1000);
        if (config.speed === 0) await new Promise((r) => setTimeout(r, 20));
        continue;
      }
      this.inHand = true;
      const res = await this.engine.playHand();
      this.inHand = false;
      await sleep(res?.showdown ? 3500 : 1800);
      await this.afterHand?.(res);
    }
  }

  setActor(id, state) {
    this.v.actor = id;
    const seat = this.players.find((p) => p.id === id);
    const human = seat && !seat.isBot;
    this.v.deadline = human && seat.bot.pending ? seat.bot.pending.deadline : 0;
    this.broadcast();
    if (human) {
      // pending появляется сразу после setActor — отправим ход в следующем тике
      queueMicrotask(() => {
        this.v.deadline = seat.bot.pending?.deadline ?? 0;
        this.hub.send(id, {
          t: 'turn', tableId: this.id, toCall: state.toCall, minRaiseTo: state.minRaiseTo,
          maxTo: state.myBet + state.stack, myBet: state.myBet, pot: state.pot,
          currentBet: state.currentBet, bb: state.bigBlind, deadline: this.v.deadline,
        });
        this.broadcast();
      });
    }
  }

  onEvent(e) {
    if (e.type === 'handStart') this.resetView();
    // ходы текущей раздачи — по ним честная подсказка оценивает руки соперников
    if (e.type === 'handStart') {
      this.handLog = [];
      this.forceJam = false;
    }
    this.handLog?.push(e);
    // счётчик выигранных раздач (на демо-столах не считается)
    if (e.type === 'handEnd' && !this.noStats) {
      for (const id of new Set(e.winners.map((w) => w.id))) {
        const p = this.players.find((x) => x.id === id && !x.isBot);
        if (!p) continue;
        addHandWon.run(id);
        p.handsWon = (p.handsWon ?? 0) + 1;
      }
    }
    const v = this.v;
    if (e.type === 'handStart') {
      v.handId = e.handId;
      v.buttonId = e.button;
      for (const p of e.players) v.dealt.add(p.id);
      for (const p of this.players) if (!p.isBot) p.bot.hole = v.dealt.has(p.id) ? p.bot.hole : null;
    } else if (e.type === 'blinds') {
      v.bets[e.sb.id] = e.sb.amount;
      v.bets[e.bb.id] = e.bb.amount;
      v.pot = e.sb.amount + e.bb.amount;
      v.last[e.sb.id] = 'МБ';
      v.last[e.bb.id] = 'ББ';
    } else if (e.type === 'action') {
      v.bets[e.id] = e.to;
      v.pot += e.added;
      v.actor = null;
      if (e.action === 'fold') v.folded.add(e.id);
      v.last[e.id] = e.allIn ? 'Олл-ин' : e.action === 'raise' ? `${e.facing > 0 ? 'Рейз' : 'Бет'} ${e.to}` : ACTION_TEXT[e.action];
    } else if (e.type === 'street') {
      v.board = e.board;
      v.bets = {};
      for (const id of Object.keys(v.last)) if (v.last[id] !== 'Фолд') delete v.last[id];
    } else if (e.type === 'showdown') {
      for (const r of e.reveals) v.shown[r.id] = { cards: r.cards, hand: describeHand(r.score) };
    } else if (e.type === 'handEnd') {
      v.actor = null;
      v.bets = {};
      v.result = e.winners.map((w) => ({
        id: w.id, amount: w.amount,
        name: this.players.find((p) => p.id === w.id)?.name ?? '',
        hand: v.shown[w.id]?.hand ?? null,
      }));
    }
    this.eventHook?.(e);
    this.broadcast();
  }

  snapshot(uid) {
    const v = this.v;
    return {
      id: this.id, kind: this.kind, title: this.title, sb: this.sb, bb: this.bb,
      board: v.board, pot: v.pot, actor: v.actor, deadline: v.deadline, buttonId: v.buttonId,
      handId: v.handId, result: v.result, inHand: this.inHand, ...this.extra(uid),
      seats: this.players.map((p) => {
        const dealt = v.dealt.has(p.id);
        const mine = p.id === uid;
        return {
          id: p.id, name: p.name, stack: p.stack, isBot: !!p.isBot, me: mine,
          bet: v.bets[p.id] || 0,
          folded: v.folded.has(p.id), inHand: dealt && !v.folded.has(p.id),
          allIn: dealt && p.stack === 0 && !v.folded.has(p.id),
          last: v.last[p.id] || null,
          cards: v.shown[p.id]?.cards ?? (mine && dealt ? p.bot.hole : null),
          hand: v.shown[p.id]?.hand ?? null,
          // твоя текущая комбинация (только тебе)
          ...(mine && dealt && p.bot.hole && !v.folded.has(p.id) ? this.myHand(p.bot.hole) : {}),
          away: !p.isBot && p.bot.sittingOut,
          handsWon: p.isBot ? null : p.handsWon ?? 0,
        };
      }),
    };
  }

  myHand(hole) {
    const score = evaluate(hole.concat(this.v.board));
    return { myHand: describeHand(score), myHandCat: handCategory(score) };
  }

  broadcast() {
    if (this.bcastQueued) return;
    this.bcastQueued = true;
    queueMicrotask(() => {
      this.bcastQueued = false;
      for (const p of this.humans()) this.hub.send(p.id, { t: 'table', table: this.snapshot(p.id) });
    });
  }
}
