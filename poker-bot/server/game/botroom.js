// Стол против ботов (кэш-игра): бай-ин списывается с баланса, при выходе стек возвращается.
import { BOT_CLASSES } from '../../core/bots.js';
import { GameTable, HumanSeat, botSeat } from './table.js';
import { config } from '../config.js';
import { db, debit, credit } from '../db.js';

const setInPlay = db.prepare('UPDATE users SET in_play = ? WHERE id = ?');

export class BotRoom {
  constructor(hub, user, { mode, botName, buyin }) {
    this.hub = hub;
    this.userId = user.id;
    this.buyin = buyin;
    const bb = buyin / 100;
    const sb = Math.max(1, Math.floor(bb / 2));
    const names = mode === 'hu' ? [botName] : BOT_CLASSES.map((C) => new C({}).name);
    this.table = new GameTable({
      id: `b${user.id}`, kind: 'bots', hub, sb, bb,
      title: mode === 'hu' ? `1 на 1 · ${sb}/${bb}` : `Стол на 6 · ${sb}/${bb}`,
    });
    this.seat = new HumanSeat(user.id, hub);
    this.me = { id: user.id, name: user.name, stack: buyin, bot: this.seat, isBot: false };
    this.table.addPlayer(this.me);
    names.forEach((name, i) => {
      const C = BOT_CLASSES.find((K) => new K({}).name === name);
      const bot = new C({ iters: 300 });
      bot.id = -(i + 1); // у ботов отрицательные id — не пересекаются с Telegram
      this.table.addPlayer({ id: bot.id, name: bot.name, stack: buyin, bot: botSeat(bot, this.table), isBot: true });
    });
    this.table.extra = () => ({ buyin, canRebuy: this.me.stack === 0, leaving: !!this.leaving });
    this.table.beforeHand = () => this.beforeHand();
    this.table.afterHand = () => this.afterHand();
    setInPlay.run(this.me.stack, this.userId);
  }

  static open(hub, user, opts) {
    if (!config.botBuyins.includes(opts.buyin)) throw new Error('Неверный бай-ин');
    if (opts.mode === 'hu' && !BOT_CLASSES.some((C) => new C({}).name === opts.botName)) throw new Error('Нет такого бота');
    if (!debit(user.id, opts.buyin, 'bots_buyin')) throw new Error('Не хватает фишек — пополни кошелёк');
    const room = new BotRoom(hub, user, opts);
    room.table.run();
    return room;
  }

  async beforeHand() {
    // игрок закрыл приложение больше 2 минут назад — встаём из-за стола
    if (!this.hub.isOnline(this.userId) && Date.now() - this.hub.lastSeen(this.userId) > 120000) this.leaving = true;
    if (this.leaving) return this.close();
    // боты докупаются до бай-ина
    for (const p of this.table.players) if (p.isBot && p.stack < this.buyin) p.stack = this.buyin;
    if (this.me.stack === 0) this.table.broadcast();
  }

  afterHand() {
    setInPlay.run(this.me.stack, this.userId);
    this.hub.sendMe(this.userId);
  }

  rebuy() {
    if (this.me.stack > 0) return;
    if (!debit(this.userId, this.buyin, 'bots_buyin')) throw new Error('Не хватает фишек');
    this.me.stack = this.buyin;
    setInPlay.run(this.me.stack, this.userId);
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
    const stack = this.me.stack;
    this.me.stack = 0;
    setInPlay.run(0, this.userId);
    credit(this.userId, stack, 'bots_cashout');
    this.hub.onRoomClosed(this.userId, this, stack);
  }
}
