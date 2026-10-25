// Стол против ботов (кэш-игра): бай-ин списывается с баланса, при выходе стек возвращается.
// Два режима: свободный (встать можно в любой момент) и на время (встать нельзя, пока не кончится время).
import { BOT_CLASSES, Hunter } from '../../core/bots.js';

// Советник для подсказок: смотрит на стол с места игрока — видит только его карты и чужие ходы
function makeAdvisor(userId) {
  const a = new Hunter({ iters: 600 });
  a.id = userId;
  return a;
}
import { GameTable, HumanSeat, botSeat } from './table.js';
import { handElo } from './elo.js';
import { config } from '../config.js';
import { db, debit, credit } from '../db.js';

const setInPlay = db.prepare('UPDATE users SET in_play = ? WHERE id = ?');
const loadMemory = db.prepare('SELECT data FROM bot_memory WHERE user_id = ? AND bot = ?');
const saveMemory = db.prepare(`INSERT INTO bot_memory (user_id, bot, data, at) VALUES (?, ?, ?, ?)
  ON CONFLICT (user_id, bot) DO UPDATE SET data = excluded.data, at = excluded.at`);

export class BotRoom {
  constructor(hub, user, { mode, botName, buyin, minutes = 0 }) {
    this.hub = hub;
    this.userId = user.id;
    this.buyin = buyin;
    this.invested = buyin;
    this.endsAt = minutes ? Date.now() + minutes * 60000 : 0;
    const bb = Math.max(2, Math.floor(buyin / 100));
    const sb = Math.max(1, Math.floor(bb / 2));
    const names = mode === 'hu' ? [botName] : BOT_CLASSES.map((C) => new C({}).name);
    this.table = new GameTable({
      id: `b${user.id}`, kind: 'bots', hub, sb, bb,
      title: `${mode === 'hu' ? '1 на 1' : 'Стол на 6'} · ${sb}/${bb}${minutes ? ` · ${minutes} мин` : ''}`,
    });
    this.bots = [];
    this.advisor = makeAdvisor(user.id);
    this.hands = 0;
    this.seat = new HumanSeat(user.id, hub);
    this.me = { id: user.id, name: user.name, stack: buyin, bot: this.seat, isBot: false };
    this.table.addPlayer(this.me);
    names.forEach((name, i) => {
      const C = BOT_CLASSES.find((K) => new K({}).name === name);
      const bot = new C({ iters: 300 });
      bot.id = -(i + 1); // у ботов отрицательные id — не пересекаются с Telegram
      // бот помнит этого игрока с прошлых столов: как часто он рейзит, фолдит, блефует
      const mem = loadMemory.get(user.id, bot.name);
      if (mem) bot.model.importPlayer(user.id, mem.data);
      this.bots.push(bot);
      this.table.addPlayer({ id: bot.id, name: bot.name, stack: buyin, bot: botSeat(bot, this.table), isBot: true });
    });
    this.table.extra = () => ({
      buyin, canRebuy: this.me.stack === 0, leaving: !!this.leaving,
      endsAt: this.endsAt || null, locked: this.locked(), eloDelta: this.lastElo ?? null,
    });
    this.table.eventHook = (e) => this.onTableEvent(e);
    this.table.beforeHand = () => this.beforeHand();
    this.table.afterHand = () => this.afterHand();
    setInPlay.run(this.me.stack, this.userId);
  }

  static open(hub, user, opts) {
    if (!(Number.isInteger(opts.buyin) && opts.buyin >= config.buyinMin && opts.buyin <= config.buyinMax)) throw new Error(`Бай-ин — от ${config.buyinMin} до ${config.buyinMax.toLocaleString('ru')}`);
    if (opts.minutes && !config.timedMinutes.includes(opts.minutes)) throw new Error('Неверное время стола');
    if (opts.mode === 'hu' && !BOT_CLASSES.some((C) => new C({}).name === opts.botName)) throw new Error('Нет такого бота');
    if (!debit(user.id, opts.buyin, 'bots_buyin')) throw new Error('Не хватает фишек — пополни кошелёк');
    const room = new BotRoom(hub, user, opts);
    room.table.run();
    return room;
  }

  async beforeHand() {
    if (this.endsAt) {
      // стол на время: закрываемся только когда время вышло (раздача уже доиграна)
      if (Date.now() >= this.endsAt) this.leaving = true;
    } else if (!this.hub.isOnline(this.userId) && Date.now() - this.hub.lastSeen(this.userId) > 120000) {
      // игрок закрыл приложение больше 2 минут назад — встаём из-за стола
      this.leaving = true;
    }
    if (this.leaving) return this.close();
    // боты докупаются до бай-ина
    for (const p of this.table.players) if (p.isBot && p.stack < this.buyin) p.stack = this.buyin;
    if (this.me.stack === 0) this.table.broadcast();
  }

  afterHand() {
    // свободный стол: пропустил 2 хода подряд — убираем из-за стола, стек на баланс
    if (!this.endsAt && this.seat.sittingOut && !this.leaving) {
      this.leaving = true;
      this.kicked = true;
    }
    setInPlay.run(this.me.stack, this.userId);
    if (++this.hands % 10 === 0) this.saveMemory();
    this.hub.sendMe(this.userId);
  }

  // Эло за раздачу: играл (колл/рейз или вскрытие) — выиграл/проиграл против ботов в раздаче
  // (сколько — в elo.js). Сбросил блайнд без игры — без изменений.
  onTableEvent(e) {
    this.advisor.observe(e);
    if (e.type === 'handStart') {
      this.lastElo = null;
      this.played = false;
    } else if (e.type === 'action' && e.id === this.userId && (e.action === 'call' || e.action === 'raise')) {
      this.played = true;
    } else if (e.type === 'showdown' && e.reveals.some((r) => r.id === this.userId)) {
      this.played = true;
    } else if (e.type === 'handEnd' && this.played) {
      const mine = e.contributions.find((c) => c.id === this.userId)?.total ?? 0;
      const won = e.winners.find((w) => w.id === this.userId)?.amount ?? 0;
      const net = won - mine;
      if (net === 0) return;
      const opps = e.contributions.filter((c) => c.id < 0 && c.total > 0)
        .map((c) => config.botElo[this.bots.find((b) => b.id === c.id)?.name] ?? 1600);
      if (!opps.length) return;
      const oppElo = opps.reduce((a, b) => a + b, 0) / opps.length;
      const u = db.prepare('SELECT rating FROM users WHERE id = ?').get(this.userId);
      const delta = handElo({ rating: u.rating, oppElo, net, bb: this.table.bb });
      if (!delta) return;
      db.prepare('UPDATE users SET rating = rating + ? WHERE id = ?').run(delta, this.userId);
      this.lastElo = Math.round(delta * 10) / 10;
    }
  }

  saveMemory() {
    for (const bot of this.bots) {
      const data = bot.model.exportPlayer(this.userId);
      if (data) saveMemory.run(this.userId, bot.name, data, Date.now());
    }
  }

  rebuy() {
    if (this.me.stack > 0) return;
    if (!debit(this.userId, this.buyin, 'bots_buyin')) throw new Error('Не хватает фишек');
    this.me.stack = this.buyin;
    this.invested += this.buyin;
    setInPlay.run(this.me.stack, this.userId);
    this.table.broadcast();
  }

  // на столе на время встать нельзя, пока идёт время и есть фишки
  locked() {
    return !!this.endsAt && Date.now() < this.endsAt && this.me.stack > 0;
  }

  leave() {
    if (this.locked()) {
      const min = Math.ceil((this.endsAt - Date.now()) / 60000);
      throw new Error(`Это стол на время — встать можно через ${min} мин`);
    }
    this.leaving = true;
    this.seat.sittingOut = true;
    this.seat.forceFold();
    if (!this.table.inHand) this.close();
    else this.table.broadcast();
  }

  close() {
    if (this.table.closed) return;
    this.table.closed = true;
    this.saveMemory();
    const stack = this.me.stack;
    this.me.stack = 0;
    setInPlay.run(0, this.userId);
    credit(this.userId, stack, 'bots_cashout');
    this.hub.onWinnings?.(this.userId, stack - this.invested); // в счёт наград за выигрыш
    this.hub.onRoomClosed(this.userId, this, stack, this.endsAt ? stack - this.invested : null, !!this.kicked);
  }
}

// Демо-стол — только для админа (для видео). Фишки ненастоящие: баланс, Эло и память ботов
// не трогаются, стол видит только сам админ. Можно задать карты на следующую раздачу.
const DEMO_STACK = 1000;

export class DemoRoom {
  constructor(hub, user, { mode, botName }) {
    this.hub = hub;
    this.userId = user.id;
    this.plan = null;
    const names = mode === 'hu' ? [botName] : BOT_CLASSES.map((C) => new C({}).name);
    this.table = new GameTable({
      id: `d${user.id}`, kind: 'bots', hub, sb: 5, bb: 10,
      title: `Демо · ${mode === 'hu' ? '1 на 1' : 'стол на 6'} · 5/10`,
    });
    this.seat = new HumanSeat(user.id, hub);
    this.me = { id: user.id, name: user.name, stack: DEMO_STACK, bot: this.seat, isBot: false };
    this.table.addPlayer(this.me);
    names.forEach((name, i) => {
      const C = BOT_CLASSES.find((K) => new K({}).name === name);
      const bot = new C({ iters: 300 });
      bot.id = -(i + 1);
      this.table.addPlayer({ id: bot.id, name: bot.name, stack: DEMO_STACK, bot: botSeat(bot, this.table), isBot: true });
    });
    this.table.extra = () => ({ demo: true, plan: this.plan, canRebuy: this.me.stack === 0 });
    this.table.engine.demoDeck = (deck, ids) => this.applyPlan(deck, ids);
    this.advisor = makeAdvisor(user.id);
    this.table.eventHook = (e) => this.advisor.observe(e);
    this.table.beforeHand = () => {
      if (this.leaving) return this.close();
      // демо: у всех, включая тебя, стек пополняется сам — раздачи не останавливаются
      for (const p of this.table.players) if (p.stack < DEMO_STACK) p.stack = DEMO_STACK;
    };
  }

  static open(hub, user, opts) {
    if (opts.mode === 'hu' && !BOT_CLASSES.some((C) => new C({}).name === opts.botName)) throw new Error('Нет такого бота');
    const room = new DemoRoom(hub, user, opts);
    room.table.run();
    return room;
  }

  // План на следующую раздачу: { holes: { [id]: [c1, c2] }, board: [до 5 карт] }
  setPlan(plan) {
    const ids = new Set(this.table.players.map((p) => p.id));
    const holes = {};
    const all = [];
    for (const [id, cards] of Object.entries(plan?.holes || {})) {
      if (!ids.has(Number(id))) throw new Error('Нет такого игрока');
      if (!Array.isArray(cards) || cards.length !== 2) throw new Error('Игроку нужно ровно 2 карты');
      holes[Number(id)] = cards.map(Number);
      all.push(...holes[Number(id)]);
    }
    const board = (plan?.board || []).map(Number);
    if (board.length > 5) throw new Error('На столе максимум 5 карт');
    all.push(...board);
    if (all.some((c) => !Number.isInteger(c) || c < 0 || c > 51)) throw new Error('Неверная карта');
    if (new Set(all).size !== all.length) throw new Error('Одна карта выбрана дважды');
    this.plan = all.length ? { holes, board } : null;
    this.table.broadcast();
  }

  // Колода раскладывается в порядке раздачи движка: карты игроков, сжиг, флоп, сжиг, тёрн, сжиг, ривер
  applyPlan(deck, ids) {
    const plan = this.plan;
    if (!plan) return deck;
    this.plan = null;
    const fixed = new Set([...Object.values(plan.holes).flat(), ...plan.board]);
    const rest = deck.filter((c) => !fixed.has(c));
    const seq = [];
    for (const id of ids) {
      const h = plan.holes[id];
      seq.push(h ? h[0] : rest.pop(), h ? h[1] : rest.pop());
    }
    const b = plan.board;
    seq.push(rest.pop(), b[0] ?? rest.pop(), b[1] ?? rest.pop(), b[2] ?? rest.pop());
    seq.push(rest.pop(), b[3] ?? rest.pop());
    seq.push(rest.pop(), b[4] ?? rest.pop());
    return rest.concat(seq.reverse()); // движок берёт с конца
  }

  rebuy() {
    if (this.me.stack === 0) this.me.stack = DEMO_STACK;
    this.table.broadcast();
  }

  leave() {
    this.leaving = true;
    this.seat.sittingOut = true;
    this.seat.forceFold();
    if (!this.table.inHand) this.close();
    else this.table.broadcast();
  }

  close() {
    if (this.table.closed) return;
    this.table.closed = true;
    this.hub.onRoomClosed(this.userId, this, 0);
  }
}
