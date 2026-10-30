// Стол на сервере: обёртка над движком, которая
//  • ждёт ход живого игрока (с таймером), даёт ботам «подумать»,
//  • ведёт картинку стола и рассылает её каждому игроку — со СВОИМИ картами, чужие не уходят,
//  • делает паузы, чтобы за игрой можно было следить.
import { randomInt } from 'node:crypto';
import { Table } from '../../core/engine.js';
import { describeHand, evaluate, evaluateShort, handCategory } from '../../core/cards.js';
import { config } from '../config.js';
import { db, credit } from '../db.js';
import { knownEquity, bestFive, outs } from './tablefx.js';
import { publicLook, vipEmotes, VIP_EMOTES } from '../cosmetics.js';
import { botPhrase } from '../../core/phrases.js';
import { CROWD } from '../../core/crowd.js';
import { Hunter } from '../../core/bots.js';

const STREET_RU = { preflop: 'префлопе', flop: 'флопе', turn: 'тёрне', river: 'ривере' };

// эмодзи за столом (только из набора — без свободного текста)
export const EMOTES = ['👍', '😂', '🔥', '😎', '😱', '🤡', '💀', '🙏', '😡', '🍀', '👑', '🤔'];

const addHandWon = db.prepare('UPDATE users SET hands_won = hands_won + 1 WHERE id = ?');
const getHandsWon = db.prepare('SELECT hands_won FROM users WHERE id = ?');
// выигранные раздачи ботов — общий счёт по имени бота, где бы он ни играл
const addBotWin = db.prepare('INSERT INTO bot_stats (bot, hands_won) VALUES (?, 1) ON CONFLICT (bot) DO UPDATE SET hands_won = hands_won + 1');
const botWins = new Map(db.prepare('SELECT bot, hands_won FROM bot_stats').all().map((r) => [r.bot, r.hands_won]));
export const botHandsWon = (name) => botWins.get(name) ?? 0;
// недельный рейтинг ботов: выигранные раздачи за неделю (по Москве)
db.exec('CREATE TABLE IF NOT EXISTS bot_week (bot TEXT NOT NULL, week TEXT NOT NULL, won INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (bot, week))');
const weekKey = () => {
  const d = new Date(Date.now() + 3 * 3600000);
  return `${d.getUTCFullYear()}-${Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)}`;
};
const addWeek = db.prepare('INSERT INTO bot_week (bot, week, won) VALUES (?, ?, 1) ON CONFLICT (bot, week) DO UPDATE SET won = won + 1');
export const botWeekTop = () => db.prepare('SELECT bot AS name, won AS value FROM bot_week WHERE week = ? ORDER BY won DESC LIMIT 20').all(weekKey());

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
    this.timebanks = 3; // +15 с к ходу, 3 раза за стол
    this.decisions = []; // ходы этой раздачи — для тренера
    this.session = { hands: 0, won: 0 }; // для итога, когда встаёшь
  }

  deal(hole) {
    this.hole = hole;
  }

  // таймбанк: +15 секунд к текущему ходу
  extend() {
    const p = this.pending;
    if (!p || this.timebanks <= 0) return false;
    this.timebanks--;
    clearTimeout(p.timer);
    p.deadline += 15000;
    p.timer = setTimeout(p.onTimeout, p.deadline - Date.now());
    if (this.table) this.table.v.deadline = p.deadline;
    this.table?.broadcast();
    return true;
  }

  act(state) {
    this.table.setActor(this.id, state);
    if (this.sittingOut) return autoAction(state);
    const seconds = this.hub.isOnline(this.id) ? config.turnSeconds : Math.min(8, config.turnSeconds);
    return new Promise((resolve) => {
      const finish = (a) => {
        clearTimeout(this.pending?.timer);
        this.pending = null;
        resolve(a);
      };
      const onTimeout = () => {
        // не успел — чек/фолд; два раза подряд — садим «отошёл»
        if (++this.timeouts >= 2) this.sittingOut = true;
        finish(autoAction(state));
        this.table?.broadcast();
      };
      const timer = setTimeout(onTimeout, seconds * 1000);
      this.pending = { state, finish, onTimeout, timer, deadline: Date.now() + seconds * 1000 };
    });
  }

  submit(a) {
    if (!this.pending) return;
    const s = this.pending.state;
    const type = ['fold', 'check', 'call', 'raise'].includes(a?.type) ? a.type : null;
    if (!type) return;
    this.timeouts = 0;
    const to = Math.floor(Number(a.to) || 0);
    if (this.hub.coachOn?.(this.id)) this.decisions.push({ state: s, type, logLen: this.table?.handLog?.length ?? 0 });
    this.pending.finish(type === 'raise' ? { type, to: Math.max(s.minRaiseTo, Math.min(to, s.myBet + s.stack)) } : { type });
  }

  forceFold() {
    this.pending?.finish(autoAction(this.pending.state));
  }
}

// Бот с паузой «на подумать», чтобы игра выглядела живой.
// Джокеры: боты (их «мозг» знает только 52 карты) видят вместо джокера лучшую замену
function dejoke(cards, others = []) {
  if (!cards.some((c) => c >= 52)) return cards;
  const out = cards.slice();
  for (let i = 0; i < out.length; i++) {
    if (out[i] < 52) continue;
    const used = new Set([...out, ...others]);
    let best = -1, pick = 48;
    for (let c = 0; c < 52; c++) {
      if (used.has(c)) continue;
      const trial = out.slice(); trial[i] = c;
      const v = trial.filter((x) => x < 52).length >= 5 ? evaluate(trial.filter((x) => x < 52).concat(others.filter((x) => x < 52))) : c;
      if (v > best) { best = v; pick = c; }
    }
    out[i] = pick;
  }
  return out;
}
function dejokeState(s) {
  if (!s.hole.some((c) => c >= 52) && !s.board.some((c) => c >= 52)) return s;
  const board = dejoke(s.board);
  return { ...s, board, hole: dejoke(s.hole, board) };
}
function dejokeEvent(e) {
  if (e.type === 'street') return { ...e, board: dejoke(e.board) };
  if (e.type === 'showdown') return { ...e, board: dejoke(e.board), reveals: e.reveals.map((r) => ({ ...r, cards: dejoke(r.cards, dejoke(e.board)) })) };
  return e;
}

// Объяснение хода для Учителя: простыми словами
function explainMove(s, a) {
  const cat = s.board.length ? handCategory(evaluate(s.hole.concat(s.board))) : -1;
  const boardCat = s.board.length >= 3 ? handCategory(evaluate(s.board)) : -1;
  const made = cat > boardCat ? cat : 0;
  const names = ['ничего', 'пара', 'две пары', 'сет', 'стрит', 'флеш', 'фулл-хаус', 'каре', 'стрит-флеш'];
  const odds = s.toCall > 0 ? Math.round((s.toCall / (s.pot + s.toCall)) * 100) : 0;
  const hand = s.street === 'preflop' ? 'стартовая рука' : `у меня ${names[made]}`;
  switch (a.type) {
    case 'fold': return `Фолд: ${hand}, а доплатить надо много — ${odds}% банка. Не окупится.`;
    case 'check': return `Чек: ${hand}. Смотрю следующую карту бесплатно.`;
    case 'call': return `Колл: ${hand}. Доплатить ${odds}% банка — шансы того стоят.`;
    default: return made >= 2 ? `Рейз: ${hand} — сильно, надо растить банк.` : made === 1 ? `Рейз: ${hand}, хочу забрать банк сейчас.` : s.street === 'preflop' ? 'Рейз: хорошая стартовая рука — давлю сразу.' : 'Рейз: это блеф 🤫 Хочу, чтобы ты сбросил.';
  }
}

export function botSeat(bot, table) {
  return {
    id: bot.id,
    hole: null,
    deal(hole) {
      this.hole = hole; // нужно подсказке за столом с ботами
    },
    act: async (state) => {
      table.setActor(bot.id, state);
      await sleep(table.mega ? 10 + Math.random() * 30 : table.fast ? 150 + Math.random() * 250 : 500 + Math.random() * 900); // быстрый стол — боты думают меньше
      // кнопка админа «все ва-банк»: до конца раздачи боты идут олл-ин
      if (table.forceJam) return state.stack > state.toCall ? { type: 'raise', to: state.myBet + state.stack } : { type: 'call' };
      // кнопка админа «почти ва-банк и фолд»: бот ставит всё, кроме 1 фишки, а дальше сбрасывает
      if (table.forceDump) {
        if (table.dumped.has(bot.id) || state.stack - 1 <= state.toCall) return { type: 'fold' };
        table.dumped.add(bot.id);
        return { type: 'raise', to: state.myBet + state.stack - 1 };
      }
      let a;
      // Шулер: иногда подглядывает в карты живого соперника и решает по точным шансам
      const victim = bot.peeks && table.players.find((p) => !p.isBot && p.bot.hole && state.players.some((x) => x.id === p.id && !x.folded));
      if (victim && Math.random() < 0.35) {
        table.peekedHand = state.handId;
        const eq = knownEquity({ me: state.hole, him: victim.bot.hole }, state.board).me;
        const pot = state.pot;
        a = eq >= 65 ? { type: 'raise', to: Math.min(state.myBet + state.stack, state.currentBet + Math.max(state.minRaiseTo - state.currentBet, pot)) }
          : eq >= 40 ? { type: state.toCall > 0 ? 'call' : 'check' }
            : { type: state.toCall > 0 ? 'fold' : 'check' };
        if (Math.random() < 0.3) bot.sayNext = '👀';
      } else a = bot.act(table.jokers ? dejokeState(state) : state);
      // Учитель объясняет ход
      if (bot.explains) bot.sayNext = explainMove(state, a);
      if (bot.sayNext) { table.say(bot.id, bot.sayNext); bot.sayNext = null; }
      return a;
    },
    observe: (e) => bot.observe(table.jokers ? dejokeEvent(e) : e),
    get tilt() { return bot.tilt > 0; },
    peeks: !!bot.peeks,
  };
}

const ACTION_TEXT = { fold: 'Фолд', check: 'Чек', call: 'Колл' };

export class GameTable {
  constructor({ id, kind, title, hub, sb, bb, variant = null }) {
    this.id = id;
    this.kind = kind; // 'bots' | 'tour'
    this.title = title;
    this.hub = hub;
    this.players = []; // { id, name, stack, bot, isBot, seat }
    this.engine = new Table({
      players: this.players, smallBlind: sb, bigBlind: bb, deckRng: cryptoRng,
      onEvent: (e) => this.onEvent(e),
      pause: (k) => sleep(this.mega ? (k === 'street' ? 500 : 15) : (k === 'street' ? 700 : 450) * (this.fast ? 0.4 : 1)),
    });
    this.variant = variant; // 'short' — Short Deck (без 2–5)
    this.engine.variant = variant;
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
    this.v = {
      board: [], pot: 0, bets: {}, folded: new Set(), last: {}, shown: {}, dealt: new Set(), actor: null, deadline: 0, result: null, handId: 0, buttonId: null,
      equity: null, winCards: null, emotes: this.v?.emotes || {}, says: this.v?.says || {},
    };
  }

  addPlayer(p) {
    if (p.bot instanceof HumanSeat) p.bot.table = this;
    // выигранные раздачи — значок рядом с игроком за столом
    if (!p.isBot && p.handsWon == null) p.handsWon = getHandsWon.get(p.id)?.hands_won ?? 0;
    if (!p.isBot) p.look = publicLook(p.id); // аватар, рамка, цвет ранга
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

  // эмодзи над игроком на 3 секунды (не чаще раза в секунду)
  emote(id, e) {
    if (!EMOTES.includes(e) && !(VIP_EMOTES.includes(e) && id > 0 && vipEmotes(id))) throw new Error('Нет такого эмодзи');
    const prev = this.v.emotes[id];
    if (prev && Date.now() - prev.at < 1000) return;
    this.v.emotes[id] = { e, at: Date.now() };
    this.broadcast();
    setTimeout(() => {
      if (this.v.emotes[id]?.at && Date.now() - this.v.emotes[id].at >= 3000) {
        delete this.v.emotes[id];
        this.broadcast();
      }
    }, 3100);
  }

  // фраза бота над табличкой на 3.5 секунды
  say(id, text) {
    if (!text) return;
    this.v.says[id] = { text, at: Date.now() };
    setTimeout(() => {
      if (Date.now() - (this.v.says[id]?.at ?? 0) >= 3400) {
        delete this.v.says[id];
        this.broadcast();
      }
    }, 3500);
  }

  botTalk(p, event, chance) {
    if (!p?.isBot || Math.random() >= chance) return;
    const kind = CROWD.find((c) => c.name === p.name)?.kind;
    this.say(p.id, botPhrase(p.name, kind, event));
  }

  // Тренер: после раздачи разбирает твои ходы (только по открытой информации — как честная подсказка)
  coachReview(p, decisions, log) {
    const tips = [];
    for (const d of decisions) {
      if (tips.length >= 2) break;
      const s = d.state;
      if (s.street === 'preflop' && s.toCall <= s.bigBlind) continue; // мелочи префлопа не разбираем
      const adv = new Hunter({ iters: 400 });
      adv.id = p.id;
      for (const e of log.slice(0, d.logLen)) adv.observe(e);
      let a;
      try { a = adv.analyze(s); } catch { continue; }
      const eq = Math.round(a.eq * 100), need = Math.round(a.potOdds * 100), st = STREET_RU[s.street] || '';
      if (d.type === 'fold' && s.toCall > 0 && a.eq >= a.potOdds + 0.1) tips.push(`Фолд на ${st}: шансы были ~${eq}%, а для колла хватало ${need}% — можно было коллировать.`);
      else if (d.type === 'call' && a.eq < a.potOdds - 0.1) tips.push(`Колл на ${st}: шансы ~${eq}% при нужных ${need}% — это дорого, лучше сбросить.`);
      else if (d.type === 'check' && a.eq > 0.75 && a.action.type === 'raise') tips.push(`Чек на ${st} с сильной рукой (~${eq}%) — стоило ставить и забирать больше.`);
      else if (d.type === 'raise' && a.eq < 0.25 && a.action.type !== 'raise') tips.push(`Ставка на ${st} с шансами ~${eq}% — рискованный блеф.`);
    }
    if (tips.length) this.hub.send(p.id, { t: 'coach', tips });
  }

  // Олл-ин до ривера: больше никто не может ставить — открываем карты и считаем шансы, как на ТВ
  checkRunout() {
    const v = this.v;
    if (v.board.length >= 5) return;
    const live = this.players.filter((p) => v.dealt.has(p.id) && !v.folded.has(p.id));
    if (live.length < 2) return;
    const canAct = live.filter((p) => p.stack > 0);
    const maxBet = Math.max(...live.map((p) => v.bets[p.id] || 0));
    const settled = canAct.every((p) => (v.bets[p.id] || 0) === maxBet);
    if (canAct.length > 1 || !settled || v.actor != null) return;
    const holes = {};
    for (const p of live) if (p.bot.hole) holes[p.id] = p.bot.hole;
    if (Object.keys(holes).length < 2) return;
    for (const [id, cards] of Object.entries(holes)) v.shown[id] = v.shown[id] || { cards, hand: null };
    if (this.mega || this.jokers) return; // огромный стол и джокеры — шансы не считаем
    v.equity = knownEquity(holes, v.board, this.variant === 'short' ? evaluateShort : evaluate, this.variant === 'short');
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
      await sleep((res?.showdown ? 3500 : 1800) * (this.fast ? 0.5 : 1));
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
      for (const p of this.players) if (!p.isBot && p.bot.decisions) p.bot.decisions = [];
      this.forceJam = false;
      this.forceDump = false;
      this.dumped = new Set();
    }
    this.handLog?.push(e);
    // счётчик выигранных раздач — у людей и у ботов (на демо-столах не считается)
    if (e.type === 'handEnd' && !this.noStats) {
      for (const id of new Set(e.winners.map((w) => w.id))) {
        const p = this.players.find((x) => x.id === id);
        if (!p) continue;
        if (p.isBot) {
          addBotWin.run(p.name);
          addWeek.run(p.name, weekKey());
          botWins.set(p.name, botHandsWon(p.name) + 1);
          continue;
        }
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
      const actor = this.players.find((x) => x.id === e.id);
      if (e.allIn) this.botTalk(actor, 'allin', 0.35);
      else if (e.action === 'fold' && e.facing > v.pot * 0.4) this.botTalk(actor, 'fold', 0.12);
      this.checkRunout();
    } else if (e.type === 'street') {
      v.board = e.board;
      v.bets = {};
      for (const id of Object.keys(v.last)) if (v.last[id] !== 'Фолд') delete v.last[id];
      if (v.equity) {
        v.equity = null;
        this.checkRunout();
      }
    } else if (e.type === 'showdown') {
      for (const r of e.reveals) {
        // в Short Deck порядок рук другой — название и категорию берём по обычной оценке
        const std = this.variant === 'short' ? evaluate(r.cards.concat(v.board)) : r.score;
        v.shown[r.id] = { cards: r.cards, hand: describeHand(std), score: std };
      }
    } else if (e.type === 'handEnd') {
      v.actor = null;
      v.bets = {};
      v.equity = null;
      // выигрышные карты (при вскрытии) — подсветим их на столе
      const shownWinners = e.winners.filter((w) => v.shown[w.id]?.cards);
      if (shownWinners.length && v.board.length === 5) {
        v.winCards = [...new Set(shownWinners.flatMap((w) => bestFive(v.shown[w.id].cards.concat(v.board))))];
      }
      // серии побед и итог сессии
      const winners = new Set(e.winners.map((w) => w.id));
      if (!this.noStats) this.reportHand(e, winners);
      for (const w of e.winners) if (w.amount >= 10 * this.bb) this.botTalk(this.players.find((x) => x.id === w.id), 'win', 0.4);
      // тренер: разбор ходов живых игроков
      const log = this.handLog || [];
      for (const p of this.players) {
        if (p.isBot || !p.bot.decisions?.length) continue;
        const ds = p.bot.decisions;
        p.bot.decisions = [];
        if (!this.mega && !this.jokers) setTimeout(() => this.coachReview(p, ds, log), 30);
      }
      for (const p of this.players) {
        if (!v.dealt.has(p.id)) continue;
        p.streak = winners.has(p.id) ? (p.streak || 0) + 1 : 0;
        if (!p.isBot && p.bot.session) {
          p.bot.session.hands++;
          if (winners.has(p.id)) p.bot.session.won++;
        }
      }
      v.result = e.winners.map((w) => ({
        id: w.id, amount: w.amount,
        name: this.players.find((p) => p.id === w.id)?.name ?? '',
        hand: v.shown[w.id]?.hand ?? null,
      }));
    }
    if (e.type === 'handEnd' && this.prank?.live) this.prankRefund(e);
    this.eventHook?.(e);
    this.broadcast();
  }

  // после пранк-раздачи: каждому живому игроку, кто проиграл, — ×1.5 от проигрыша на баланс
  // (за турнирным столом — тоже обычными фишками на баланс)
  prankRefund(e) {
    const admin = this.prank.adminId;
    this.prank = null;
    for (const c of e.contributions) {
      const p = this.players.find((x) => x.id === c.id);
      if (c.id === admin || !p || p.isBot) continue;
      const won = e.winners.filter((w) => w.id === c.id).reduce((a, w) => a + w.amount, 0);
      const lost = c.total - won;
      if (lost <= 0) continue;
      const back = Math.ceil(lost * 1.5);
      credit(c.id, back, 'prank_refund', this.id);
      setTimeout(() => {
        this.hub.send(c.id, { t: 'toast', text: `😈 Это был пранк! Твои ${lost.toLocaleString('ru')} фишек вернулись ×1.5: +${back.toLocaleString('ru')} на баланс` });
        this.hub.sendMe(c.id);
      }, 2500);
    }
  }

  snapshot(uid) {
    const v = this.v;
    return {
      id: this.id, kind: this.kind, title: this.title, sb: this.sb, bb: this.bb, mega: !!this.mega, jokers: !!this.jokers,
      board: v.board, pot: v.pot, actor: v.actor, deadline: v.deadline, buttonId: v.buttonId,
      handId: v.handId, result: v.result, inHand: this.inHand, fast: !!this.fast, variant: this.variant, chaos: this.chaos?.text ?? null,
      winCards: v.result ? v.winCards : null, ...this.extra(uid),
      seats: this.players.map((p) => {
        const dealt = v.dealt.has(p.id);
        const mine = p.id === uid;
        return {
          id: p.id, name: p.name, stack: p.stack, isBot: !!p.isBot, me: mine,
          bet: v.bets[p.id] || 0,
          folded: v.folded.has(p.id), inHand: dealt && !v.folded.has(p.id),
          allIn: dealt && p.stack === 0 && !v.folded.has(p.id),
          last: v.last[p.id] || null,
          cards: v.shown[p.id]?.cards ?? (mine && dealt ? p.bot.hole
            // Хаос «открытая карта»: у всех видна первая карта
            : this.chaos?.kind === 'cardUp' && dealt && !v.folded.has(p.id) && p.bot.hole ? [p.bot.hole[0], null] : null),
          hand: v.shown[p.id]?.hand ?? null,
          // твоя текущая комбинация (только тебе)
          ...(mine && dealt && p.bot.hole && !v.folded.has(p.id) ? this.myHand(p.bot.hole) : {}),
          away: !p.isBot && p.bot.sittingOut,
          handsWon: p.isBot ? botHandsWon(p.name) : p.handsWon ?? 0,
          streak: p.streak || 0,
          team: this.teams?.get(p.id) ?? null,
          tilt: p.isBot && p.bot.tilt ? true : undefined, cheat: p.isBot && p.bot.peeks ? true : undefined,
          look: p.isBot ? null : p.look || null,
          equity: v.equity?.[p.id] ?? null,
          emote: v.emotes[p.id]?.e ?? null,
          say: v.says[p.id]?.text ?? null,
          ...(mine && !p.isBot ? { timebanks: p.bot.timebanks } : {}),
          ...(mine && dealt && p.bot.hole && !v.folded.has(p.id) && this.inHand ? { outs: this.myOuts(p.bot.hole) } : {}),
        };
      }),
    };
  }

  // Итог раздачи каждому живому игроку — для статистики, заданий и достижений
  reportHand(e, winners) {
    const v = this.v;
    const log = this.handLog || [];
    const king = this.players.find((p) => p.isBot && p.name === 'Король');
    const botsIn = this.players.filter((p) => p.isBot && v.dealt.has(p.id));
    for (const p of this.players) {
      if (p.isBot || !v.dealt.has(p.id)) continue;
      const won = winners.has(p.id);
      // статистика против каждого бота за столом (итог в фишках — только 1 на 1)
      if (botsIn.length) {
        const mine = e.contributions.find((c) => c.id === p.id)?.total ?? 0;
        const got = e.winners.filter((w) => w.id === p.id).reduce((a, w) => a + w.amount, 0);
        this.hub.onBotVs?.(p.id, botsIn.map((b) => b.name), won, botsIn.length === 1 ? got - mine : null);
      }
      const shown = v.shown[p.id];
      const score = shown?.score;
      this.hub.onHandResult?.(p.id, {
        won,
        amount: e.winners.filter((w) => w.id === p.id).reduce((a, w) => a + w.amount, 0),
        showdown: !!score,
        cat: won && score != null ? handCategory(score) : null,
        royal: won && score != null && describeHand(score) === 'Роял-флеш',
        vpip: log.some((x) => x.type === 'action' && x.id === p.id && x.street === 'preflop' && (x.action === 'call' || x.action === 'raise')),
        allIn: log.some((x) => x.type === 'action' && x.id === p.id && x.allIn),
        vsKing: won && !!king && (e.contributions.find((c) => c.id === king.id)?.total ?? 0) > 0,
        handsWon: p.handsWon ?? 0,
        bb: this.bb,
      });
    }
  }

  // ауты считаем раз на улицу
  myOuts(hole) {
    const key = `${this.v.handId}:${this.v.board.length}:${hole.join()}`;
    if (this.outsKey !== key) {
      this.outsKey = key;
      this.outsVal = outs(hole, this.v.board, this.variant === 'short');
    }
    return this.outsVal;
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
      // зрители (друзья) видят стол без чужих карт
      if (this.spectators?.size) {
        if (this.closed) {
          for (const id of this.spectators.keys()) this.hub.send(id, { t: 'watchEnd' });
          this.spectators.clear();
        } else {
          const base = this.snapshot(0);
          for (const [id, focus] of this.spectators) this.hub.send(id, { t: 'table', table: { ...base, watching: true, focus } });
        }
      }
    });
  }
}
