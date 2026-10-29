// Точка входа: раздаёт мини-апп, держит WebSocket с игроками, запускает бота и расписание.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer } from 'ws';
import { config, payoutShares } from './config.js';
import { db, upsertUser, getUser, ranks, credit, recoverAfterRestart, addWinnings, WIN_REWARDS, useHint } from './db.js';
import { verifyInitData, startBot, createInvoice, hooks, inviteLink, bot, notify, openButton, findPack } from './telegram.js';
import { BotRoom, DemoRoom } from './game/botroom.js';
import { MixedRoom } from './game/mixedroom.js';
import { Tournaments } from './game/tournament.js';
import { SoloTour, SOLO_SIZES, SOLO_BLINDS } from './game/solotour.js';
import { BOT_CLASSES, Hunter } from '../core/bots.js';
import { CROWD } from '../core/crowd.js';
import { arrangeDeck } from './game/demoplan.js';

const PUBLIC = new URL('../public/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const BOTS = BOT_CLASSES.map((C) => {
  const b = new C({});
  return { name: b.name, style: b.style };
});

const SOLO_VIEW = { sizes: SOLO_SIZES, blinds: SOLO_BLINDS, shares: Object.fromEntries(SOLO_SIZES.map((n) => [n, payoutShares(n)])) };
const CROWD_VIEW = CROWD.map((c) => ({ name: c.name, kind: c.kind, style: c.style, elo: c.elo }));

// ---------- Хаб: кто онлайн, рассылка ----------

const sockets = new Map(); // userId -> Set<ws>
const seen = new Map();
const botRooms = new Map(); // userId -> BotRoom | DemoRoom | MixedRoom (за которым он сидит)
const mixedRooms = new Map(); // roomId -> MixedRoom (столы с друзьями)
const solos = new Map(); // userId -> SoloTour (сольный турнир с ботами)

const hub = {
  send(uid, msg) {
    const set = sockets.get(uid);
    if (!set) return;
    const data = JSON.stringify({ ...msg, now: Date.now() }); // время сервера — клиент сверяет часы
    for (const ws of set) if (ws.readyState === 1) ws.send(data);
  },
  isOnline: (uid) => (sockets.get(uid)?.size ?? 0) > 0,
  lastSeen: (uid) => seen.get(uid) ?? 0,
  sendMe(uid) {
    hub.send(uid, { t: 'me', me: meView(uid) });
  },
  lobbyChanged() {
    if (hub.lobbyTimer) return;
    hub.lobbyTimer = setTimeout(() => {
      hub.lobbyTimer = null;
      for (const uid of sockets.keys()) hub.send(uid, { t: 'lobby', ...lobbyView(uid) });
    }, 300);
  },
  mixedInvite: (id) => (bot.username ? `https://t.me/${bot.username}?start=m_${id}` : null),
  // Чистый выигрыш за сессию → награды Эло на 5 000 и 10 000
  onWinnings(uid, net) {
    for (const r of addWinnings(uid, net)) {
      const text = `Награда: чистый выигрыш ${r.at.toLocaleString('ru')} фишек — +${r.elo} Эло!`;
      hub.send(uid, { t: 'toast', text });
      notify(uid, text, openButton('Профиль', '', 'success'));
    }
    hub.sendMe(uid);
  },
  onSoloDone(tour) {
    if (solos.get(tour.userId) === tour) solos.delete(tour.userId);
  },
  onRoomClosed(uid, room, stack, net = null, kicked = false) {
    if (botRooms.get(uid) === room) botRooms.delete(uid);
    hub.send(uid, { t: 'left', stack, net, kicked, beatAll: !!room.beatAll });
    hub.sendMe(uid);
  },
};
hooks.onBalance = (uid) => hub.sendMe(uid);
const tournaments = new Tournaments(hub);

// Стол, где работают кнопки админа: только админ и только без других людей
// (столы с ботами, демо, сольные турниры)
function adminBotTable(uid) {
  if (!config.adminIds.includes(uid)) throw new Error('Нет доступа');
  const at = activeTable(uid);
  if (!at) throw new Error('Ты не за столом');
  const solo = solos.get(uid);
  const own = botRooms.get(uid);
  const ok = (solo && !solo.done && solo.tableOf(uid) === at.table) || ((own instanceof BotRoom || own instanceof DemoRoom) && own.table === at.table);
  if (!ok || at.table.players.some((p) => !p.isBot && p.id !== uid)) throw new Error('Только в играх с ботами');
  return at.table;
}

function activeTable(uid) {
  const room = botRooms.get(uid);
  if (room && !room.table.closed) return { table: room.table, seat: room.seatOf ? room.seatOf(uid) : room.seat };
  const solo = solos.get(uid);
  const st = solo && !solo.done && solo.tableOf(uid);
  if (st) return { table: st, seat: st.players.find((p) => p.id === uid).bot };
  const t = tournaments.tableOf(uid);
  if (t) return { table: t.table, seat: t.table.players.find((p) => p.id === uid).bot };
  return null;
}

function meView(uid) {
  const u = getUser(uid);
  if (!u) return null;
  const act = activeTable(uid);
  return {
    id: u.id, name: u.name, chips: u.chips, inPlay: u.in_play, rating: Math.round(u.rating),
    isAdmin: config.adminIds.includes(u.id),
    handsWon: u.hands_won, won: u.won, winRewards: WIN_REWARDS.map((r, i) => ({ ...r, done: i < u.won_rewards })), hints: u.hints,
    games: u.games, wins: u.wins, ...ranks(uid),
    bonus: config.dailyBonus > 0 ? { amount: config.dailyBonus, readyAt: u.bonus_at + 86400000 } : null,
    table: act ? { id: act.table.id, kind: act.table.kind } : null,
  };
}

function lobbyView(uid) {
  return {
    tournaments: tournaments.list(uid),
    online: sockets.size,
    packs: config.packs, hintPacks: config.hintPacks, bots: BOTS, crowd: CROWD_VIEW, solo: SOLO_VIEW, buyins: config.botBuyins, buyinMin: config.buyinMin,
    sizes: config.tournament.sizes, blindOptions: config.tournament.blindOptions, turnSeconds: config.turnSeconds, timedMinutes: config.timedMinutes,
  };
}

// ---------- Обработка сообщений ----------

const handlers = {
  lobby: (uid) => ({ t: 'lobby', ...lobbyView(uid) }),
  me: (uid) => ({ t: 'me', me: meView(uid) }),
  tour: (uid, m) => ({ t: 'tour', tour: tournaments.one(m.id, uid), invite: bot.username ? inviteLink(m.id) : null }),
  top: () => ({
    t: 'top',
    rating: db.prepare('SELECT name, rating, games FROM users WHERE games > 0 OR rating <> 1500 ORDER BY rating DESC LIMIT 20').all()
      .map((r) => ({ ...r, rating: Math.round(r.rating) })),
  }),
  createT: (uid, m) => ({ t: 'created', id: tournaments.create(getUser(uid), m.tour || {}) }),
  reg: (uid, m) => (tournaments.register(getUser(uid), m.id), { t: 'ok' }),
  unreg: (uid, m) => (tournaments.unregister(getUser(uid), m.id), { t: 'ok' }),
  cancelT: (uid, m) => (tournaments.cancel(getUser(uid), m.id), { t: 'ok' }),
  sitBots(uid, m) {
    if (activeTable(uid)) throw new Error('Ты уже за столом');
    botRooms.set(uid, BotRoom.open(hub, getUser(uid), { mode: m.mode === '6' ? '6' : 'hu', botName: m.botName, buyin: Number(m.buyin), minutes: Number(m.minutes) || 0 }));
    hub.sendMe(uid);
    return { t: 'ok' };
  },
  table(uid) {
    const a = activeTable(uid);
    if (!a) return { t: 'table', table: null };
    a.table.broadcast();
    if (a.seat.pending) a.table.setActor(uid, a.seat.pending.state);
    return { t: 'ok' };
  },
  act(uid, m) {
    activeTable(uid)?.seat.submit(m.action);
    return null;
  },
  back(uid) {
    const a = activeTable(uid);
    if (a) {
      a.seat.sittingOut = false;
      a.seat.timeouts = 0;
      a.table.broadcast();
    }
    return null;
  },
  // встать / выйти с любого стола: свой стол — стек на баланс; турнир — вылет с текущим местом
  leave(uid) {
    botRooms.get(uid)?.leave(uid);
    const solo = solos.get(uid);
    if (solo && !solo.done) solo.quit();
    tournaments.forfeit(uid);
    hub.sendMe(uid);
    return { t: 'ok' };
  },
  rebuy: (uid) => (botRooms.get(uid)?.rebuy(uid), { t: 'ok' }),
  // стол с друзьями: создать, посмотреть по ссылке, сесть
  createMixed(uid, m) {
    if (activeTable(uid)) throw new Error('Ты уже за столом');
    const room = MixedRoom.open(hub, getUser(uid), { buyin: Number(m.buyin), bots: Number(m.bots) });
    mixedRooms.set(room.id, room);
    botRooms.set(uid, room);
    hub.sendMe(uid);
    return { t: 'mixedCreated', id: room.id, invite: bot.username ? `https://t.me/${bot.username}?start=m_${room.id}` : null };
  },
  mixedInfo(uid, m) {
    const room = mixedRooms.get(String(m.id));
    if (!room || room.table.closed) return { t: 'mixedInfo', room: null };
    return { t: 'mixedInfo', room: room.info(), invite: bot.username ? `https://t.me/${bot.username}?start=m_${room.id}` : null };
  },
  joinMixed(uid, m) {
    const room = mixedRooms.get(String(m.id));
    if (!room || room.table.closed) throw new Error('Стол уже закрыт');
    if (botRooms.get(uid) === room) return { t: 'ok' };
    if (activeTable(uid)) throw new Error('Ты уже за другим столом');
    room.join(getUser(uid));
    botRooms.set(uid, room);
    hub.sendMe(uid);
    return { t: 'ok' };
  },
  // сольный турнир с ботами — старт сразу
  startSolo(uid, m) {
    if (activeTable(uid) || solos.get(uid)) throw new Error('Ты уже за столом');
    const tour = SoloTour.open(hub, getUser(uid), { buyin: m.buyin, size: m.size, blindMin: m.blindMin, demo: !!m.demo });
    solos.set(uid, tour);
    hub.sendMe(uid);
    return { t: 'ok', id: tour.id };
  },
  // Кнопка админа: все боты, что ещё в раздаче, идут олл-ин (до конца раздачи).
  forceJam(uid) {
    const table = adminBotTable(uid);
    if (!table.inHand) throw new Error('Раздача ещё не началась');
    table.forceDump = false;
    table.forceJam = true;
    return { t: 'ok' };
  },
  // Кнопка админа: все боты в раздаче ставят всё, кроме 1 фишки, а потом сбрасывают
  forceDump(uid) {
    const table = adminBotTable(uid);
    if (!table.inHand) throw new Error('Раздача ещё не началась');
    table.forceJam = false;
    table.forceDump = true;
    return { t: 'ok' };
  },
  // Кнопка админа: в следующей раздаче тебе приходят два туза, а на тёрне и ривере — два других (каре)
  forceAces(uid) {
    const table = adminBotTable(uid);
    const suits = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    const aces = [12 * 4 + suits[0], 12 * 4 + suits[1]];
    const board = [undefined, undefined, undefined, 12 * 4 + suits[2], 12 * 4 + suits[3]]; // флоп случайный
    const prev = table.engine.demoDeck; // на демо-столе свой выбор карт — не теряем его
    table.engine.demoDeck = (deck, ids) => {
      table.engine.demoDeck = prev; // один раз
      const d = prev ? prev(deck, ids) : deck;
      return ids.includes(uid) ? arrangeDeck({ holes: { [uid]: aces }, board }, d, ids) : d;
    };
    return { t: 'ok' };
  },
  // демо-стол для видео — только админ, без фишек и Эло
  sitDemo(uid, m) {
    if (!config.adminIds.includes(uid)) throw new Error('Нет доступа');
    if (activeTable(uid)) throw new Error('Ты уже за столом');
    botRooms.set(uid, DemoRoom.open(hub, getUser(uid), { mode: m.mode === '6' ? '6' : 'hu', botName: m.botName }));
    hub.sendMe(uid);
    return { t: 'ok' };
  },
  demoPlan(uid, m) {
    const room = botRooms.get(uid);
    const solo = solos.get(uid);
    if (config.adminIds.includes(uid) && solo?.demo && !solo.done) solo.setPlan(m.plan);
    else if (config.adminIds.includes(uid) && room instanceof DemoRoom) room.setPlan(m.plan);
    else throw new Error('Только на демо-столе');
    return { t: 'ok' };
  },
  async invoice(uid, m) {
    const pack = findPack(m.pack);
    if (!pack) throw new Error('Нет такого пакета');
    if (config.dev) {
      // локально оплаты нет — сразу зачисляем, чтобы можно было тестировать
      if (pack.hints) db.prepare('UPDATE users SET hints = hints + ? WHERE id = ?').run(pack.hints, uid);
      else credit(uid, pack.chips, 'dev_topup');
      hub.sendMe(uid);
      return { t: 'paid' };
    }
    return { t: 'invoice', link: await createInvoice(uid, pack.id) };
  },
  // Подсказка в свой ход: видит карты всех соперников и будущие карты стола.
  // За столами с людьми это правило написано в шапке стола — его видят все.
  hint(uid) {
    const at = activeTable(uid);
    if (!at) throw new Error('Ты не за столом');
    const pending = at.seat.pending;
    if (!pending) throw new Error('Подсказка доступна в твой ход');
    const room = botRooms.get(uid);
    const free = room instanceof DemoRoom || !!solos.get(uid)?.demo; // на демо админа — бесплатно
    if (!free && !useHint(uid)) throw new Error('Подсказок нет — купи в кошельке');
    const table = at.table;
    let adv = room?.table === table ? room.advisor : null;
    if (!adv) {
      // стол с людьми: советник с нуля, «досматривает» ходы этой раздачи
      adv = new Hunter({ iters: 600 });
      adv.id = uid;
      for (const e of table.handLog || []) adv.observe(e);
    }
    // карты соперников (ботов и людей)
    const known = {};
    for (const p of table.players) if (p.id !== uid && p.bot.hole) known[p.id] = p.bot.hole;
    // и карты, которые ещё выйдут на стол (перед каждой улицей одна сжигается)
    const deck = table.engine.deck?.slice() ?? [];
    const next = [];
    for (const k of [3, 1, 1].slice({ 0: 0, 3: 1, 4: 2, 5: 3 }[pending.state.board.length])) {
      deck.pop();
      for (let i = 0; i < k; i++) next.push(deck.pop());
    }
    const a = adv.analyze(pending.state, known, next);
    hub.sendMe(uid);
    return { t: 'hint', ...a };
  },
  bonus(uid) {
    const u = getUser(uid);
    if (!config.dailyBonus || Date.now() < u.bonus_at + 86400000) throw new Error('Бонус пока недоступен');
    db.prepare('UPDATE users SET bonus_at = ? WHERE id = ?').run(Date.now(), uid);
    credit(uid, config.dailyBonus, 'daily_bonus');
    hub.sendMe(uid);
    return { t: 'ok' };
  },
};

function authenticate(m) {
  if (config.dev && m.dev?.id) return { user: { id: Number(m.dev.id), first_name: String(m.dev.name || 'Тест') } };
  return verifyInitData(m.initData);
}

// ---------- HTTP + WebSocket ----------

const BUILD = Date.now().toString(36); // версия файлов мини-аппа — новая при каждом запуске

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') return res.end('ok');
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path === '/' || path === '') path = '/index.html';
  const file = join(PUBLIC, path);
  if (!file.startsWith(PUBLIC)) return res.writeHead(403).end();
  try {
    let data = await readFile(file);
    const isPage = extname(file) === '.html';
    // Telegram любит кэшировать мини-апп: у каждого запуска сервера свои адреса app.js/app.css,
    // поэтому после деплоя телефон обязан скачать свежие файлы
    if (isPage) data = data.toString().replace(/(app\.(?:js|css))"/g, `$1?v=${BUILD}"`);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'cache-control': isPage ? 'no-store, max-age=0' : 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
wss.on('connection', (ws) => {
  let uid = null;
  ws.on('message', async (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const reply = (msg) => msg && ws.readyState === 1 && ws.send(JSON.stringify({ ...msg, rid: m.rid, now: Date.now() }));
    try {
      if (m.t === 'auth') {
        const auth = authenticate(m);
        if (!auth?.user?.id) return reply({ t: 'error', text: 'Открой приложение через Telegram' });
        const u = upsertUser(auth.user);
        uid = u.id;
        if (!sockets.has(uid)) sockets.set(uid, new Set());
        sockets.get(uid).add(ws);
        reply({ t: 'hello', me: meView(uid), startParam: auth.startParam || null });
        reply({ t: 'lobby', ...lobbyView(uid) });
        const a = activeTable(uid);
        if (a) handlers.table(uid);
        hub.lobbyChanged();
        return;
      }
      if (!uid) return reply({ t: 'error', text: 'Нет авторизации' });
      const h = handlers[m.t];
      if (!h) return;
      reply(await h(uid, m));
    } catch (e) {
      reply({ t: 'error', text: e.message });
    }
  });
  ws.on('close', () => {
    if (!uid) return;
    seen.set(uid, Date.now());
    const set = sockets.get(uid);
    set?.delete(ws);
    if (set && !set.size) sockets.delete(uid);
    hub.lobbyChanged();
  });
});

// ---------- Запуск ----------

recoverAfterRestart();
tournaments.ensureBig();
setInterval(() => {
  try { tournaments.tick(); } catch (e) { console.error('tick', e); }
  for (const [id, room] of mixedRooms) if (room.table.closed) mixedRooms.delete(id);
}, 5000);

server.listen(config.port, () => {
  console.log(`Poker: http://localhost:${config.port}${config.dev ? '  (DEV — без Telegram)' : ''}`);
});
if (config.botToken && !config.dev) {
  // Telegram может не ответить при старте (сеть) — пробуем снова, пока не получится
  const launch = (delay = 3000) => startBot().catch((e) => {
    console.error(`Бот не запустился: ${e.message}. Повтор через ${delay / 1000} с`);
    setTimeout(() => launch(Math.min(delay * 2, 60000)), delay);
  });
  launch();
}
else if (!config.dev) console.warn('BOT_TOKEN не задан — бот не запущен');

export { server, hub, tournaments };
