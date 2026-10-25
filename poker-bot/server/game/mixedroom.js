// Стол с друзьями: несколько живых игроков + боты на свободных местах.
// Каждый садится со своими фишками и может встать в любой момент — стек уходит на баланс.
// Стол закрывается, когда за ним не осталось людей. Подсказок нет — за столом живые соперники.
import { randomBytes } from 'node:crypto';
import { BOT_CLASSES } from '../../core/bots.js';
import { GameTable, HumanSeat, botSeat } from './table.js';
import { handElo } from './elo.js';
import { config } from '../config.js';
import { db, debit, credit } from '../db.js';

const MAX_SEATS = 6;
const AWAY_MS = 10 * 60 * 1000;
const setInPlay = db.prepare('UPDATE users SET in_play = ? WHERE id = ?');

export class MixedRoom {
  constructor(hub, host, { buyin, bots }) {
    this.hub = hub;
    this.id = randomBytes(5).toString('base64url').replace(/[^a-zA-Z0-9]/g, 'x');
    this.hostId = host.id;
    this.hostName = host.name;
    this.buyin = buyin;
    this.humans = new Map(); // uid -> { seat, player, invested, leaving, played }
    const bb = Math.max(2, Math.floor(buyin / 100));
    const sb = Math.max(1, Math.floor(bb / 2));
    this.table = new GameTable({ id: `m${this.id}`, kind: 'mixed', hub, sb, bb, title: `Стол ${host.name} · ${sb}/${bb}` });
    this.bots = [];
    // боты на свободные места: от сильного к слабому, без повторов
    const order = ['Акула', 'Охотник', 'Хамелеон', 'Маньяк', 'Скала'];
    order.slice(0, Math.max(0, Math.min(bots, MAX_SEATS - 1))).forEach((name, i) => {
      const C = BOT_CLASSES.find((K) => new K({}).name === name);
      const bot = new C({ iters: 300 });
      bot.id = -(i + 1);
      this.bots.push(bot);
      this.table.addPlayer({ id: bot.id, name: bot.name, stack: buyin, bot: botSeat(bot, this.table), isBot: true });
    });
    this.table.extra = (uid) => {
      const h = this.humans.get(uid);
      return {
        roomId: this.id, host: this.hostName, isHost: uid === this.hostId, buyin, invite: this.hub.mixedInvite?.(this.id) ?? null,
        canRebuy: h ? h.player.stack === 0 : false, leaving: !!h?.leaving,
        humans: this.humans.size, seatsFree: MAX_SEATS - this.table.players.length,
      };
    };
    this.table.eventHook = (e) => this.onTableEvent(e);
    this.table.beforeHand = () => this.beforeHand();
    this.table.afterHand = () => this.afterHand();
  }

  static open(hub, host, opts) {
    if (!(Number.isSafeInteger(opts.buyin) && opts.buyin >= config.buyinMin)) throw new Error(`Бай-ин — от ${config.buyinMin} фишек`); // сверху — сколько есть на балансе
    const bots = Math.floor(Number(opts.bots));
    if (!(bots >= 0 && bots <= 4)) throw new Error('Ботов — от 0 до 4');
    const room = new MixedRoom(hub, host, { buyin: opts.buyin, bots });
    room.join(host);
    room.table.run();
    return room;
  }

  info() {
    return {
      id: this.id, host: this.hostName, buyin: this.buyin, bb: this.table.bb,
      seats: this.table.players.length, max: MAX_SEATS, closed: this.table.closed,
      players: this.table.players.map((p) => ({ name: p.name, bot: !!p.isBot })),
    };
  }

  seatOf(uid) {
    return this.humans.get(uid)?.seat;
  }

  join(user) {
    if (this.table.closed) throw new Error('Стол уже закрыт');
    if (this.humans.has(user.id)) return;
    // место для человека: если всё занято, уступает бот — но только между раздачами
    if (this.table.players.length >= MAX_SEATS) {
      const bot = this.table.players.find((p) => p.isBot);
      if (!bot) throw new Error('Мест нет');
      if (this.table.inHand) throw new Error('Стол полный — попробуй через пару секунд, после раздачи');
      this.table.removePlayer(bot.id);
    }
    if (!debit(user.id, this.buyin, 'mixed_buyin', this.id)) throw new Error('Не хватает фишек — пополни кошелёк');
    const seat = new HumanSeat(user.id, this.hub);
    const player = { id: user.id, name: user.name, stack: this.buyin, bot: seat, isBot: false };
    this.humans.set(user.id, { seat, player, invested: this.buyin, leaving: false, played: false });
    this.table.addPlayer(player);
    setInPlay.run(this.buyin, user.id);
  }

  rebuy(uid) {
    const h = this.humans.get(uid);
    if (!h || h.player.stack > 0) return;
    if (!debit(uid, this.buyin, 'mixed_buyin', this.id)) throw new Error('Не хватает фишек');
    h.player.stack = this.buyin;
    h.invested += this.buyin;
    setInPlay.run(h.player.stack, uid);
    this.table.broadcast();
  }

  leave(uid) {
    const h = this.humans.get(uid);
    if (!h) return;
    h.leaving = true;
    h.seat.sittingOut = true;
    h.seat.forceFold();
    if (!this.table.inHand) this.cashOut(uid);
    else this.table.broadcast();
  }

  cashOut(uid, kicked = false) {
    const h = this.humans.get(uid);
    if (!h) return;
    this.humans.delete(uid);
    this.table.removePlayer(uid);
    const stack = h.player.stack;
    h.player.stack = 0;
    setInPlay.run(0, uid);
    credit(uid, stack, 'mixed_cashout', this.id);
    this.hub.onWinnings?.(uid, stack - h.invested);
    this.hub.onRoomClosed(uid, this, stack, null, kicked);
    if (!this.humans.size) this.table.closed = true; // людей не осталось — стол закрыт
    else this.table.broadcast();
  }

  // Кто вышел из приложения (например, пошёл звать друзей) — не выкидываем сразу:
  // встаёт только тот, кого нет дольше 10 минут
  dropAway() {
    for (const [uid, h] of [...this.humans]) {
      const away = !this.hub.isOnline(uid) && Date.now() - this.hub.lastSeen(uid) > AWAY_MS;
      if (h.leaving || away) this.cashOut(uid, !h.leaving);
    }
  }

  // за столом есть хоть один человек, который играет, а не «отошёл»
  someoneHere() {
    return [...this.humans].some(([uid, h]) => this.hub.isOnline(uid) && !h.seat.sittingOut);
  }

  async beforeHand() {
    this.dropAway();
    // все люди отошли — боты между собой не играют, стол ждёт
    while (this.humans.size && !this.table.closed && !this.someoneHere()) {
      await new Promise((r) => setTimeout(r, 1000));
      this.dropAway();
    }
    if (!this.humans.size) {
      this.table.closed = true;
      return;
    }
    for (const p of this.table.players) if (p.isBot && p.stack < this.buyin) p.stack = this.buyin;
  }

  afterHand() {
    for (const [uid, h] of this.humans) {
      setInPlay.run(h.player.stack, uid);
      this.hub.sendMe(uid);
    }
  }

  // Эло: как за столом с ботами — только против ботов, которые были в банке
  onTableEvent(e) {
    if (e.type === 'handStart') {
      for (const h of this.humans.values()) h.played = false;
    } else if (e.type === 'action' && (e.action === 'call' || e.action === 'raise') && this.humans.has(e.id)) {
      this.humans.get(e.id).played = true;
    } else if (e.type === 'showdown') {
      for (const r of e.reveals) if (this.humans.has(r.id)) this.humans.get(r.id).played = true;
    } else if (e.type === 'handEnd') {
      const opps = e.contributions.filter((c) => c.id < 0 && c.total > 0)
        .map((c) => config.botElo[this.bots.find((b) => b.id === c.id)?.name] ?? 1600);
      if (!opps.length) return;
      const oppElo = opps.reduce((a, b) => a + b, 0) / opps.length;
      for (const [uid, h] of this.humans) {
        if (!h.played) continue;
        const mine = e.contributions.find((c) => c.id === uid)?.total ?? 0;
        const won = e.winners.find((w) => w.id === uid)?.amount ?? 0;
        const net = won - mine;
        if (!net) continue;
        const u = db.prepare('SELECT rating FROM users WHERE id = ?').get(uid);
        const delta = handElo({ rating: u.rating, oppElo, net, bb: this.table.bb });
        if (delta) db.prepare('UPDATE users SET rating = rating + ? WHERE id = ?').run(delta, uid);
      }
    }
  }
}
