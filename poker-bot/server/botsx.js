// Боты «вокруг игры»: свой бот, бот-заменитель офлайн, недельный рейтинг ботов,
// шоу ботов (дуэль и турнир) со ставкой на победителя.
import { db, tx, debit, credit } from './db.js';
import { config } from './config.js';
import { Table } from '../core/engine.js';
import { MegaBot } from '../core/megabot.js';
import { makeBot, CROWD, BOT_KINDS, isBotName } from '../core/crowd.js';
import { BOT_CLASSES } from '../core/bots.js';
import { GameTable, botSeat } from './game/table.js';

const cols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
if (!cols.has('mybot')) db.exec('ALTER TABLE users ADD COLUMN mybot TEXT');
if (!cols.has('botbank')) db.exec('ALTER TABLE users ADD COLUMN botbank INTEGER NOT NULL DEFAULT 0');
if (!cols.has('botbank_at')) db.exec('ALTER TABLE users ADD COLUMN botbank_at INTEGER NOT NULL DEFAULT 0');
if (!cols.has('botbank_log')) db.exec('ALTER TABLE users ADD COLUMN botbank_log TEXT');

// ---------- Свой бот ----------

export function myBot(uid) {
  try { return JSON.parse(db.prepare('SELECT mybot FROM users WHERE id = ?').get(uid)?.mybot || 'null'); } catch { return null; }
}
export function setMyBot(uid, { name, kind, avatar }) {
  name = String(name || '').trim();
  if (!/^[\p{L}\p{N} ]{2,14}$/u.test(name)) throw new Error('Имя бота — от 2 до 14 букв или цифр');
  if (isBotName(name)) throw new Error('Так уже зовут другого бота');
  kind = Math.floor(Number(kind));
  if (!BOT_KINDS[kind]) throw new Error('Неверный характер');
  const bot = { name, kind, avatar: String(avatar || '🤖').slice(0, 4) };
  db.prepare('UPDATE users SET mybot = ? WHERE id = ?').run(JSON.stringify(bot), uid);
  return bot;
}

// ---------- Бот-заменитель: играет за тебя, пока ты офлайн (на отдельный банк) ----------

const HOUR = 3600000;
const MAX_HOURS = 12;
const HANDS_PER_HOUR = 30;

export function bankView(uid) {
  const u = db.prepare('SELECT botbank, botbank_log FROM users WHERE id = ?').get(uid);
  let log = null;
  try { log = JSON.parse(u?.botbank_log || 'null'); } catch {}
  return { bank: u?.botbank ?? 0, log };
}
export function bankDeposit(uid, amount) {
  amount = Math.floor(Number(amount));
  if (!(amount >= 100)) throw new Error('Минимум 100 фишек');
  tx(() => {
    if (!debit(uid, amount, 'botbank_in')) throw new Error('Не хватает фишек');
    db.prepare('UPDATE users SET botbank = botbank + ?, botbank_at = CASE WHEN botbank_at = 0 THEN ? ELSE botbank_at END WHERE id = ?').run(amount, Date.now(), uid);
  });
}
export function bankWithdraw(uid) {
  let got = 0;
  tx(() => {
    got = db.prepare('SELECT botbank FROM users WHERE id = ?').get(uid).botbank;
    if (!got) throw new Error('Банк бота пуст');
    db.prepare('UPDATE users SET botbank = 0, botbank_at = 0 WHERE id = ?').run(uid);
    credit(uid, got, 'botbank_out');
  });
  return got;
}

// симуляция: твой бот против 5 быстрых ботов, блайнды — 1/100 банка
export async function runOffline(uid) {
  const u = db.prepare('SELECT botbank, botbank_at, mybot FROM users WHERE id = ?').get(uid);
  if (!u?.botbank || !u.botbank_at) return null;
  const hours = Math.min(MAX_HOURS, Math.floor((Date.now() - u.botbank_at) / HOUR));
  if (hours < 1) return null;
  let kind = 3;
  try { kind = JSON.parse(u.mybot || 'null')?.kind ?? 3; } catch {}
  const style = kind === 2 ? 0 : kind === 4 || kind === 5 ? 2 : 1;
  const start = u.botbank;
  const bb = Math.max(2, Math.floor(start / 100)), sb = Math.max(1, Math.floor(bb / 2));
  const me = { id: 1, name: 'me', stack: start, bot: new MegaBot('me', style) };
  const rivals = Array.from({ length: 5 }, (_, i) => ({ id: i + 2, name: `r${i}`, stack: start, bot: new MegaBot(`r${i}`, i % 3) }));
  const players = [me, ...rivals];
  const t = new Table({ players, smallBlind: sb, bigBlind: bb });
  const hands = hours * HANDS_PER_HOUR;
  let played = 0;
  for (; played < hands && me.stack > 0; played++) {
    for (const r of rivals) if (r.stack === 0) r.stack = start; // соперники докупаются
    await t.playHand();
  }
  const net = me.stack - start;
  const log = { at: Date.now(), hands: played, net, hours };
  db.prepare('UPDATE users SET botbank = ?, botbank_at = ?, botbank_log = ? WHERE id = ?')
    .run(me.stack, me.stack ? u.botbank_at + hours * HOUR : 0, JSON.stringify(log), uid);
  return log;
}

// ---------- Шоу ботов: дуэль или турнир на 6, ставка на победителя ----------

const shows = new Map(); // uid -> { table, pick, bet, mult }
const SHOW_POOL = () => [...BOT_CLASSES.map((C) => new C({}).name), ...CROWD.map((c) => c.name)];
export const showPool = () => SHOW_POOL();

export function startShow(hub, uid, { kind, bots, pick, bet }) {
  if (shows.get(uid) && !shows.get(uid).table.closed) throw new Error('Шоу уже идёт');
  const pool = SHOW_POOL();
  let names;
  if (kind === 'duel') {
    names = (bots || []).map(String);
    if (names.length !== 2 || names[0] === names[1] || !names.every((n) => pool.includes(n))) throw new Error('Выбери двух разных ботов');
  } else {
    names = (bots || []).map(String);
    if (names.length !== 6 || new Set(names).size !== 6 || !names.every((n) => pool.includes(n))) names = [...pool].sort(() => Math.random() - 0.5).slice(0, 6);
  }
  bet = Math.floor(Number(bet) || 0);
  if (bet && !names.includes(pick)) throw new Error('Выбери, на кого ставишь');
  if (bet && bet < 100) throw new Error('Ставка — от 100 фишек');
  if (bet && !debit(uid, bet, 'show_bet')) throw new Error('Не хватает фишек');
  const mult = kind === 'duel' ? 1.9 : 5; // выплата за угаданного победителя
  const table = new GameTable({ id: `s${uid}`, kind: 'show', hub, sb: 10, bb: 20, title: kind === 'duel' ? `Дуэль ботов: ${names[0]} против ${names[1]}` : 'Турнир ботов на 6' });
  table.fast = true;
  table.noStats = true;
  names.forEach((name, i) => {
    const bot = makeBot(name, { iters: 150 });
    bot.id = -(i + 1);
    table.addPlayer({ id: bot.id, name, stack: 1000, bot: botSeat(bot, table), isBot: true });
  });
  let hands = 0;
  table.extra = () => ({ show: { kind, pick: bet ? pick : null, bet, win: bet ? Math.floor(bet * mult) : 0 } });
  table.beforeHand = () => {
    for (const p of [...table.players]) if (p.stack === 0) table.removePlayer(p.id);
    // блайнды растут каждые 8 раздач, чтобы шоу не затягивалось
    const lvl = Math.floor(hands / 8);
    table.setBlinds(10 * 2 ** lvl, 20 * 2 ** lvl);
    hands++;
    if (table.players.length <= 1) finish();
  };
  const finish = () => {
    const winner = table.players[0]?.name;
    if (bet && winner === pick) credit(uid, Math.floor(bet * mult), 'show_win');
    hub.send(uid, { t: 'toast', text: bet ? (winner === pick ? `🏆 Победил ${winner}! Ставка сыграла: +${Math.floor(bet * mult).toLocaleString('ru')}` : `Победил ${winner}. Ставка не сыграла`) : `Победил ${winner}!` });
    hub.sendMe(uid);
    table.closed = true;
    table.broadcast();
  };
  shows.set(uid, { table });
  table.spectators = new Map([[uid, names.includes(pick) ? -(names.indexOf(pick) + 1) : -1]]);
  table.run();
  return table;
}
export const showOf = (uid) => shows.get(uid)?.table;
