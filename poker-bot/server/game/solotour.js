// Сольный турнир: ты + боты, в любое время и на любой взнос (сколько есть на балансе).
// Как Большой турнир: столы по 6, растущие блайнды, пересадки, призы по местам.
// Взносы ботов — «виртуальные»: призовой фонд = взнос × число мест.
// Вылетел — турнир для тебя закончен сразу (боты дальше не доигрывают), место и приз считаются.
import { randomBytes } from 'node:crypto';
import { db, tx, debit } from '../db.js';
import { config, BLIND_LEVELS, payoutShares } from '../config.js';
import { CROWD, makeBot } from '../../core/crowd.js';
import { BOT_CLASSES } from '../../core/bots.js';
import { GameTable, HumanSeat, botSeat } from './table.js';
import { botRating } from './elo.js';
import { checkPlan, arrangeDeck } from './demoplan.js';

const MAX_SEATS = 6;
export const SOLO_SIZES = [6, 18, 60];
export const SOLO_BLINDS = [2, 3, 6]; // минут на уровень
const setInPlay = db.prepare('UPDATE users SET in_play = ? WHERE id = ?');

export class SoloTour {
  constructor(hub, user, { buyin, size, blindMin, demo = false }) {
    this.hub = hub;
    // демо — только админ, для видео: фишки ненастоящие, баланс/Эло/призы не трогаются,
    // карты на следующую раздачу за своим столом выбираешь сам
    this.demo = demo;
    this.plan = null;
    this.userId = user.id;
    this.id = `s${randomBytes(5).toString('base64url').replace(/[^a-zA-Z0-9]/g, 'x')}`;
    this.name = demo ? `Демо-турнир · ${size}` : `Сольный турнир · ${size}`;
    this.buyin = buyin;
    this.n = size;
    this.blindMin = blindMin;
    this.startedAt = Date.now();
    this.placesLeft = size;
    this.places = new Map(); // id бота -> место (для Эло)
    this.done = false;
    this.tables = [];
    // соперники: пара сильных + обычные, все разные
    const pros = BOT_CLASSES.map((C) => new C({}).name).sort(() => Math.random() - 0.5).slice(0, size >= 18 ? 3 : 1);
    const crowd = CROWD.map((c) => c.name).sort(() => Math.random() - 0.5);
    // в больших турнирах за одним из столов сидит босс — Король
    this.botNames = [...(size >= 18 ? ['Король'] : []), ...pros, ...crowd].slice(0, size - 1);
  }

  static open(hub, user, o) {
    if (o.demo) {
      if (!config.adminIds.includes(user.id)) throw new Error('Нет доступа');
      const size = SOLO_SIZES.includes(Number(o.size)) ? Number(o.size) : 60;
      const blindMin = SOLO_BLINDS.includes(Number(o.blindMin)) ? Number(o.blindMin) : 3;
      const t = new SoloTour(hub, user, { buyin: 1000, size, blindMin, demo: true });
      t.start(user);
      return t;
    }
    const buyin = Math.floor(Number(o.buyin));
    const size = Number(o.size);
    const blindMin = Number(o.blindMin) || 3;
    if (!(Number.isSafeInteger(buyin) && buyin >= config.buyinMin)) throw new Error(`Взнос — от ${config.buyinMin} фишек`);
    if (!SOLO_SIZES.includes(size)) throw new Error('Неверное число мест');
    if (!SOLO_BLINDS.includes(blindMin)) throw new Error('Неверная скорость блайндов');
    if (!debit(user.id, buyin, 'solo_buyin')) throw new Error('Не хватает фишек — пополни кошелёк');
    setInPlay.run(buyin, user.id); // при перезапуске сервера взнос вернётся
    const t = new SoloTour(hub, user, { buyin, size, blindMin });
    t.start(user);
    return t;
  }

  level() {
    const ms = this.blindMin * 60000 * Math.max(config.speed, 0.001);
    return Math.min(Math.floor((Date.now() - this.startedAt) / ms), BLIND_LEVELS.length - 1);
  }

  levelInfo() {
    const l = this.level();
    const ms = this.blindMin * 60000 * Math.max(config.speed, 0.001);
    return { level: l + 1, sb: BLIND_LEVELS[l][0], bb: BLIND_LEVELS[l][1], nextAt: this.startedAt + (l + 1) * ms };
  }

  alive() {
    return this.tables.reduce((n, tb) => n + (tb.closed ? 0 : tb.players.length), 0);
  }

  prizes() {
    const pool = this.n * this.buyin;
    const p = payoutShares(this.n).map((s) => Math.floor(pool * s));
    p[0] += pool - p.reduce((a, b) => a + b, 0);
    return p;
  }

  tableOf(uid) {
    return this.tables.find((tb) => !tb.closed && tb.players.some((p) => p.id === uid)) || null;
  }

  start(user) {
    const stack = config.tournament.stack;
    const entries = [{ id: user.id, name: user.name, stack, bot: new HumanSeat(user.id, this.hub), isBot: false }];
    const k = Math.ceil(this.n / MAX_SEATS);
    for (let i = 0; i < k; i++) this.tables.push(this.newTable(i + 1));
    this.botNames.forEach((name, i) => {
      const bot = makeBot(name, { iters: 200 });
      bot.id = -(i + 1);
      entries.push({ id: bot.id, name, stack, bot: null, isBot: true, brain: bot });
    });
    entries.sort(() => Math.random() - 0.5).forEach((p, i) => {
      const tb = this.tables[i % k];
      if (p.isBot) p.bot = botSeat(p.brain, tb);
      tb.addPlayer(p);
    });
    for (const tb of this.tables) tb.run();
  }

  newTable(num) {
    const tb = new GameTable({ id: `${this.id}:${num}`, kind: 'tour', title: `${this.name} · стол ${num}`, hub: this.hub, sb: 10, bb: 20 });
    tb.noStats = this.demo; // демо — не в счёт
    // карты по плану — только за столом, где сидишь ты
    if (this.demo) tb.engine.demoDeck = (deck, ids) => {
      if (!ids.includes(this.userId) || !this.plan) return deck;
      const plan = this.plan;
      this.plan = null;
      return arrangeDeck(plan, deck, ids);
    };
    tb.extra = () => ({
      ...(this.demo && tb.players.some((p) => p.id === this.userId) ? { demo: true, plan: this.plan } : {}),
      tournamentId: this.id, solo: true, alive: this.alive(), total: this.n, ...this.levelInfo(),
      prizePool: this.n * this.buyin, tableNo: num,
    });
    tb.beforeHand = () => {
      if (tb.players.length < 2 && !this.done) this.rebalance(tb);
      const [sb, bb] = BLIND_LEVELS[this.level()];
      tb.setBlinds(sb, bb);
      tb.handStacks = new Map(tb.players.map((p) => [p.id, p.stack]));
    };
    tb.afterHand = () => this.afterHand(tb);
    return tb;
  }

  afterHand(tb) {
    if (this.done) return;
    const busted = tb.players.filter((p) => p.stack === 0)
      .sort((a, b) => (tb.handStacks?.get(b.id) ?? 0) - (tb.handStacks?.get(a.id) ?? 0));
    for (const p of busted) {
      tb.removePlayer(p.id);
      const place = this.placesLeft--;
      if (p.id === this.userId) return this.finish(place);
      this.places.set(p.id, place);
    }
    if (this.alive() <= 1) return this.finish(1);
    this.rebalance(tb);
  }

  // как в обычных турнирах: лишний стол расформировываем, разница между столами — не больше 1
  rebalance(tb) {
    if (tb.closed) return;
    const live = this.tables.filter((x) => !x.closed);
    const need = Math.ceil(this.alive() / MAX_SEATS);
    const byCount = () => live.filter((x) => x !== tb && !x.closed).sort((a, b) => a.players.length - b.players.length);
    if (live.length > need && tb.players.length === Math.min(...live.map((x) => x.players.length))) {
      for (const p of tb.players.slice()) {
        const dest = byCount().find((x) => x.players.length < MAX_SEATS);
        if (!dest) break;
        this.move(tb, dest, p);
      }
      if (!tb.players.length) {
        tb.closed = true;
        return;
      }
    }
    const others = byCount();
    if (others.length && tb.players.length - others[0].players.length >= 2) this.move(tb, others[0], tb.players[tb.players.length - 1]);
  }

  move(from, to, p) {
    from.removePlayer(p.id);
    if (p.isBot) p.bot = botSeat(p.brain, to); // бот «думает» за новым столом
    to.addPlayer(p);
    if (p.id === this.userId) this.hub.send(p.id, { t: 'toast', text: `Тебя пересадили за стол ${to.id.split(':')[1]}` });
    from.broadcast();
  }

  setPlan(plan) {
    const tb = this.tableOf(this.userId);
    if (!tb) throw new Error('Ты не за столом');
    this.plan = checkPlan(tb.players, plan);
    tb.broadcast();
  }

  // выйти в любой момент: как будто вылетел сейчас — место и приз по текущему месту
  quit() {
    const tb = this.tableOf(this.userId);
    const seat = tb?.players.find((p) => p.id === this.userId)?.bot;
    if (seat) {
      seat.sittingOut = true;
      seat.forceFold();
    }
    this.finish(this.placesLeft);
  }

  finish(place) {
    if (this.done) return;
    this.done = true;
    for (const tb of this.tables) tb.closed = true;
    if (this.demo) {
      this.hub.send(this.userId, { t: 'finished', tournamentId: this.id, solo: true, demo: true, place, prize: 0, total: this.n });
      this.hub.sendMe(this.userId);
      return this.hub.onSoloDone?.(this);
    }
    const prize = this.prizes()[place - 1] || 0;
    // Эло: ты против каждого бота — кто вылетел раньше тебя, тех ты обыграл
    const u = db.prepare('SELECT rating FROM users WHERE id = ?').get(this.userId);
    const K = 32 / Math.max(1, this.n - 1);
    let delta = 0;
    this.botNames.forEach((name, i) => {
      const id = -(i + 1);
      const theirs = this.places.get(id) ?? 0; // 0 — ещё в игре, значит выше тебя
      const won = theirs > place ? 1 : 0;
      const e = 1 / (1 + 10 ** ((botRating(name) - u.rating) / 400));
      delta += K * (won - e);
    });
    tx(() => {
      setInPlay.run(0, this.userId);
      db.prepare('UPDATE users SET chips = chips + ?, rating = rating + ?, games = games + 1, wins = wins + ? WHERE id = ?')
        .run(prize, delta, place === 1 ? 1 : 0, this.userId);
      if (prize) db.prepare('INSERT INTO ledger (user_id, delta, reason, ref, at) VALUES (?, ?, ?, ?, ?)').run(this.userId, prize, 'solo_prize', this.id, Date.now());
    });
    this.hub.send(this.userId, { t: 'finished', tournamentId: this.id, solo: true, place, prize, total: this.n, ratingDelta: Math.round(delta) });
    this.hub.onWinnings?.(this.userId, prize - this.buyin);
    this.hub.sendMe(this.userId);
    this.hub.onSoloDone?.(this);
  }
}
