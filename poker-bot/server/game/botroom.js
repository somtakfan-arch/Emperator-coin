// Стол против ботов (кэш-игра): бай-ин списывается с баланса, при выходе стек возвращается.
// Два режима: свободный (встать можно в любой момент) и на время (встать нельзя, пока не кончится время).
import { BOT_CLASSES, Hunter } from '../../core/bots.js';
import { makeBot, isBotName, CROWD } from '../../core/crowd.js';

// босс-раш: шесть сильнейших по очереди
const RUSH = ['Скала', 'Маньяк', 'Хамелеон', 'Акула', 'Охотник', 'Король'];
// Лестница 1 на 1: 12 ступеней от слабых ботов к Королю; ступень сохраняется между заходами
const LADDER = [...[...CROWD].sort((a, b) => a.elo - b.elo).filter((_, i, a) => i % Math.ceil(a.length / 6) === 0).slice(0, 6).map((c) => c.name),
  'Скала', 'Маньяк', 'Хамелеон', 'Акула', 'Охотник', 'Король'];
export const LADDER_STEPS = LADDER;
db.exec('CREATE TABLE IF NOT EXISTS ladder (user_id INTEGER PRIMARY KEY, step INTEGER NOT NULL DEFAULT 0, best INTEGER NOT NULL DEFAULT 0)');
export const ladderStep = (uid) => db.prepare('SELECT step, best FROM ladder WHERE user_id = ?').get(uid) || { step: 0, best: 0 };
const setLadder = (uid, step) => db.prepare(`INSERT INTO ladder (user_id, step, best) VALUES (?, ?, ?)
  ON CONFLICT (user_id) DO UPDATE SET step = excluded.step, best = MAX(best, excluded.step)`).run(uid, step, step);
const MARATHON = 1000; // раздач в марафоне
// Хаос: одно событие на раздачу
const CHAOS = [
  { kind: 'double', text: 'Хаос: двойные блайнды' },
  { kind: 'bonus', text: 'Хаос: победителю +10 больших блайндов от заведения' },
  { kind: 'jackpot', text: 'Хаос: джекпот — победитель получает банк ещё раз (до 50 бб)' },
  { kind: 'cardUp', text: 'Хаос: у всех открыта одна карта' },
  { kind: 'calm', text: 'Хаос: обычная раздача… пока что' },
];

// Советник для подсказок: смотрит на стол с места игрока — видит только его карты и чужие ходы
function makeAdvisor(userId) {
  const a = new Hunter({ iters: 600 });
  a.id = userId;
  return a;
}
import { GameTable, HumanSeat, botSeat } from './table.js';
import { MegaBot, MEGA_EXTRA } from '../../core/megabot.js';

const MEGA_BOTS = 100;
import { handElo, botRating } from './elo.js';
import { checkPlan, arrangeDeck } from './demoplan.js';
import { config } from '../config.js';
import { db, debit, credit } from '../db.js';

const setInPlay = db.prepare('UPDATE users SET in_play = ? WHERE id = ?');
const loadMemory = db.prepare('SELECT data FROM bot_memory WHERE user_id = ? AND bot = ?');
const saveMemory = db.prepare(`INSERT INTO bot_memory (user_id, bot, data, at) VALUES (?, ?, ?, ?)
  ON CONFLICT (user_id, bot) DO UPDATE SET data = excluded.data, at = excluded.at`);

export class BotRoom {
  constructor(hub, user, { mode, botName, buyin, minutes = 0, fast = false, level = 'normal', shadow = 0, variant = null, chaos = false, jokers = false, marathon = false }) {
    this.mode = mode;
    this.chaosOn = chaos;
    this.level = level;
    this.shadow = shadow;
    this.hub = hub;
    this.userId = user.id;
    this.buyin = buyin;
    this.invested = buyin;
    this.endsAt = minutes ? Date.now() + minutes * 60000 : 0;
    const bb = Math.max(2, Math.floor(buyin / 100));
    const sb = Math.max(1, Math.floor(bb / 2));
    // стол на 9: пятеро сильных и трое обычных; босс-раш: боссы по очереди 1 на 1
    const pros = BOT_CLASSES.map((C) => new C({}).name);
    const mega = mode === 'mega'; // огромный стол: ты и 100 ботов, 6 колод
    // лестница: соперник — твоя текущая ступень
    if (mode === 'ladder') this.ladder = { step: Math.min(ladderStep(user.id).step, LADDER.length - 1) };
    // команда 2 на 2: ты и напарник против двух ботов (места через одного)
    if (mode === 'team') this.team = { partner: 'Профессор' };
    const names = mode === 'hu' ? [botName]
      : mode === '9' ? [...pros, ...CROWD.map((c) => c.name).sort(() => Math.random() - 0.5).slice(0, 3)]
        : mode === 'rush' ? [RUSH[0]] : mode === 'ladder' ? [LADDER[this.ladder.step]] : mode === 'team' ? ['Акула', 'Профессор', 'Охотник'] : mega ? [...CROWD.map((c) => c.name), ...MEGA_EXTRA].sort(() => Math.random() - 0.5).slice(0, MEGA_BOTS) : pros;
    if (mode === 'rush') this.rush = { i: 0 };
    const label = { hu: '1 на 1', 6: 'Стол на 6', 9: 'Стол на 9', rush: 'Босс-раш', mega: `Огромный стол · ${MEGA_BOTS + 1} игрок · 6 колод`, ladder: 'Лестница', team: 'Команда 2 на 2' }[mode];
    this.table = new GameTable({
      id: `b${user.id}`, kind: 'bots', hub, sb, bb, variant,
      title: `${label} · ${sb}/${bb}${variant === 'short' ? ' · Short Deck' : ''}${chaos ? ' · Хаос' : ''}${jokers ? ' · Джокеры' : ''}${marathon && ['6', '9'].includes(mode) ? ' · Марафон' : ''}${minutes ? ` · ${minutes} мин` : ''}${fast ? ' · быстрый' : ''}`,
    });
    this.baseBlinds = [sb, bb];
    this.table.fast = fast || mega; // боты думают меньше, паузы короче
    if (mega) { this.table.mega = true; this.table.engine.decks = 6; }
    if (jokers) { this.table.jokers = true; this.table.engine.jokers = true; } // два джокера в колоде
    if (marathon && ['6', '9'].includes(mode)) this.marathon = { left: MARATHON }; // марафон — только столы на 6 и 9
    this.bots = [];
    this.advisor = makeAdvisor(user.id);
    this.hands = 0;
    this.seat = new HumanSeat(user.id, hub);
    this.me = { id: user.id, name: user.name, stack: buyin, bot: this.seat, isBot: false };
    this.table.addPlayer(this.me);
    names.forEach((name, i) => {
      const bot = mega ? new MegaBot(name, i % 3) : makeBot(name, { iters: 300, level, shadowLevel: shadow });
      bot.id = -(i + 1); // у ботов отрицательные id — не пересекаются с Telegram
      // бот помнит этого игрока с прошлых столов: как часто он рейзит, фолдит, блефует
      const mem = loadMemory.get(user.id, bot.name);
      if (mem && bot.model) bot.model.importPlayer(user.id, mem.data);
      this.bots.push(bot);
      this.table.addPlayer({ id: bot.id, name: bot.name, stack: buyin, bot: botSeat(bot, this.table), isBot: true });
    });
    if (this.team) {
      this.table.teams = new Map(this.table.players.map((p) => [p.id, p.id === this.me.id || p.name === 'Профессор' ? 'A' : 'B']));
    }
    this.table.extra = () => ({
      ladder: this.ladder ? { step: this.ladder.step + 1, of: LADDER.length, name: LADDER[this.ladder.step] } : null,
      marathon: this.marathon ? { hand: MARATHON - this.marathon.left + 1, of: MARATHON, net: this.me.stack - this.invested } : null,
      team: !!this.team,
      buyin, canRebuy: this.me.stack === 0 && !this.rush && !this.ladder && !this.team, leaving: !!this.leaving,
      rush: this.rush ? { i: this.rush.i + 1, of: RUSH.length, name: RUSH[this.rush.i] } : null,
      endsAt: this.endsAt || null, locked: this.locked(), eloDelta: this.lastElo ?? null,
    });
    this.table.eventHook = (e) => this.onTableEvent(e);
    this.table.beforeHand = () => this.beforeHand();
    this.table.afterHand = () => this.afterHand();
    setInPlay.run(this.me.stack, this.userId);
  }

  static open(hub, user, opts) {
    if (!(Number.isSafeInteger(opts.buyin) && opts.buyin >= config.buyinMin)) throw new Error(`Бай-ин — от ${config.buyinMin} фишек`); // сверху — сколько есть на балансе
    if (opts.minutes && !config.timedMinutes.includes(opts.minutes)) throw new Error('Неверное время стола');
    if (opts.mode === 'hu' && !isBotName(opts.botName)) throw new Error('Нет такого бота');
    if (!['hu', '6', '9', 'rush', 'mega', 'ladder', 'team'].includes(opts.mode)) throw new Error('Неверный стол');
    if (opts.variant && opts.variant !== 'short') throw new Error('Неверный вариант');
    if (!['easy', 'normal', 'master'].includes(opts.level || 'normal')) throw new Error('Неверная сложность');
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
    // боты не докупаются: проиграл весь стек — выбывает
    for (const p of [...this.table.players]) if (p.isBot && p.stack === 0) this.table.removePlayer(p.id);
    // босс-раш: обыграл босса — садится следующий; проиграл стек — забег окончен
    if (this.rush) {
      if (this.me.stack === 0) {
        this.hub.send(this.userId, { t: 'toast', text: `Босс-раш окончен на боссе ${this.rush.i + 1} из ${RUSH.length}` });
        return this.close();
      }
      if (!this.table.players.some((p) => p.isBot)) {
        this.rush.i++;
        if (this.rush.i >= RUSH.length) {
          this.beatAll = true;
          this.hub.onRushDone?.(this.userId, this.buyin);
          return this.close();
        }
        const name = RUSH[this.rush.i];
        const bot = makeBot(name, { iters: 300, level: this.level });
        bot.id = -(this.rush.i + 1);
        this.bots.push(bot);
        this.table.addPlayer({ id: bot.id, name, stack: this.buyin, bot: botSeat(bot, this.table), isBot: true });
        this.hub.send(this.userId, { t: 'toast', text: `Босс ${this.rush.i + 1} из ${RUSH.length}: ${name}` });
      }
    }
    // лестница: обыграл — следующая ступень (награда за новую), проиграл стек — заход окончен, ступень сохраняется
    if (this.ladder) {
      if (this.me.stack === 0) {
        this.hub.send(this.userId, { t: 'toast', text: `Лестница: ты остаёшься на ступени ${this.ladder.step + 1} из ${LADDER.length}` });
        return this.close();
      }
      if (!this.table.players.some((p) => p.isBot)) {
        const prevBest = ladderStep(this.userId).best;
        this.ladder.step++;
        setLadder(this.userId, Math.min(this.ladder.step, LADDER.length - 1));
        if (this.ladder.step > prevBest) this.hub.onLadderStep?.(this.userId, this.ladder.step, LADDER.length);
        if (this.ladder.step >= LADDER.length) {
          setLadder(this.userId, 0); // прошёл всю — начинаешь заново
          return this.close();
        }
        const name = LADDER[this.ladder.step];
        const bot = makeBot(name, { iters: 300, level: this.level });
        bot.id = -(this.ladder.step + 1);
        this.bots.push(bot);
        this.table.addPlayer({ id: bot.id, name, stack: this.buyin, bot: botSeat(bot, this.table), isBot: true });
        this.hub.send(this.userId, { t: 'toast', text: `Ступень ${this.ladder.step + 1} из ${LADDER.length}: ${name}` });
      }
    }
    // команда: оба соперника выбыли — победа; ты выбыл — поражение
    if (this.team) {
      const opps = this.table.players.filter((p) => this.table.teams.get(p.id) === 'B');
      if (this.me.stack === 0) {
        this.hub.send(this.userId, { t: 'toast', text: 'Команда проиграла — ты выбыл' });
        return this.close();
      }
      if (!opps.length) {
        this.hub.onTeamWin?.(this.userId);
        return this.close();
      }
    }
    // Хаос: случайное событие на каждую раздачу
    this.table.setBlinds(...this.baseBlinds);
    this.table.chaos = this.chaosOn ? CHAOS[(Math.random() * CHAOS.length) | 0] : null;
    if (this.table.chaos?.kind === 'double') this.table.setBlinds(this.baseBlinds[0] * 2, this.baseBlinds[1] * 2);
    if (!this.ladder && !this.team && !this.table.players.some((p) => p.isBot)) {
      this.beatAll = true; // обыграл всех ботов — стол закрывается, стек на баланс
      this.hub.onBeatAll?.(this.userId);
      return this.close();
    }
    if (this.me.stack === 0) this.table.broadcast();
  }

  afterHand() {
    // Хаос: бонус от заведения победителю
    const ch = this.table.chaos;
    if (ch && this.table.v.result?.length) {
      const bb = this.table.bb;
      for (const w of this.table.v.result) {
        const p = this.table.players.find((x) => x.id === w.id);
        if (!p) continue;
        if (ch.kind === 'bonus') p.stack += 10 * this.baseBlinds[1];
        if (ch.kind === 'jackpot') p.stack += Math.min(w.amount, 50 * bb);
      }
    }
    // свободный стол: пропустил 2 хода подряд — убираем из-за стола, стек на баланс
    if (!this.endsAt && this.seat.sittingOut && !this.leaving) {
      this.leaving = true;
      this.kicked = true;
    }
    setInPlay.run(this.me.stack, this.userId);
    if (++this.hands % 10 === 0) this.saveMemory();
    // марафон: 1000 раздач, потом итог и стол закрывается
    if (this.marathon && --this.marathon.left <= 0) {
      const net = this.me.stack - this.invested;
      this.hub.onMarathonDone?.(this.userId, net);
      this.leaving = true;
    }
    this.hub.sendMe(this.userId);
  }

  // Эло за раздачу: играл (колл/рейз или вскрытие) — выиграл/проиграл против ботов в раздаче
  // (сколько — в elo.js). Сбросил блайнд без игры — без изменений.
  onTableEvent(e) {
    if (!this.table.jokers && !this.table.mega) this.advisor.observe(e);
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
        .map((c) => botRating(this.bots.find((b) => b.id === c.id)?.name, this.level, this.shadow));
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
      const data = bot.model?.exportPlayer(this.userId);
      if (data) saveMemory.run(this.userId, bot.name, data, Date.now());
    }
  }

  rebuy() {
    if (this.me.stack > 0) return;
    if (this.rush) throw new Error('В босс-раше докупки нет');
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

  // встать можно всегда, даже со стола на время — стек вернётся на баланс
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
    this.saveMemory();
    const stack = this.me.stack;
    // Тень: обыграл — она становится сильнее, крупно проиграл — слабее
    if (this.bots.some((b) => b.name === 'Тень')) this.hub.onShadowResult?.(this.userId, stack - this.invested, this.buyin);
    this.me.stack = 0;
    setInPlay.run(0, this.userId);
    credit(this.userId, stack, 'bots_cashout');
    this.hub.onWinnings?.(this.userId, stack - this.invested); // в счёт наград за выигрыш
    this.hub.onRoomClosed(this.userId, this, stack, stack - this.invested, !!this.kicked);
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
      const bot = makeBot(name, { iters: 300 });
      bot.id = -(i + 1);
      this.table.addPlayer({ id: bot.id, name: bot.name, stack: DEMO_STACK, bot: botSeat(bot, this.table), isBot: true });
    });
    this.table.noStats = true; // демо — не в счёт
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
    if (opts.mode === 'hu' && !isBotName(opts.botName)) throw new Error('Нет такого бота');
    const room = new DemoRoom(hub, user, opts);
    room.table.run();
    return room;
  }

  // План на следующую раздачу: { holes: { [id]: [c1, c2] }, board: [до 5 карт] }
  setPlan(plan) {
    this.plan = checkPlan(this.table.players, plan);
    this.table.broadcast();
  }

  applyPlan(deck, ids) {
    const plan = this.plan;
    this.plan = null;
    return arrangeDeck(plan, deck, ids);
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
