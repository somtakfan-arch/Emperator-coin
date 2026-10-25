// Точка входа: раздаёт мини-апп, держит WebSocket с игроками, запускает бота и расписание.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { db, upsertUser, getUser, ranks, credit, recoverAfterRestart, addWinnings, WIN_REWARDS, useHint } from './db.js';
import { verifyInitData, startBot, createInvoice, hooks, inviteLink, bot, notify, openButton, findPack } from './telegram.js';
import { BotRoom, DemoRoom } from './game/botroom.js';
import { MixedRoom } from './game/mixedroom.js';
import { Tournaments } from './game/tournament.js';
import { BOT_CLASSES, Hunter } from '../core/bots.js';

const PUBLIC = new URL('../public/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const BOTS = BOT_CLASSES.map((C) => {
  const b = new C({});
  return { name: b.name, style: b.style };
});

// ---------- Хаб: кто онлайн, рассылка ----------

const sockets = new Map(); // userId -> Set<ws>
const seen = new Map();
const botRooms = new Map(); // userId -> BotRoom | DemoRoom | MixedRoom (за которым он сидит)
const mixedRooms = new Map(); // roomId -> MixedRoom (столы с друзьями)

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
  onRoomClosed(uid, room, stack, net = null, kicked = false) {
    if (botRooms.get(uid) === room) botRooms.delete(uid);
    hub.send(uid, { t: 'left', stack, net, kicked, beatAll: !!room.beatAll });
    hub.sendMe(uid);
  },
};
hooks.onBalance = (uid) => hub.sendMe(uid);
const tournaments = new Tournaments(hub);

function activeTable(uid) {
  const room = botRooms.get(uid);
  if (room && !room.table.closed) return { table: room.table, seat: room.seatOf ? room.seatOf(uid) : room.seat };
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
    won: u.won, winRewards: WIN_REWARDS.map((r, i) => ({ ...r, done: i < u.won_rewards })), hints: u.hints,
    games: u.games, wins: u.wins, ...ranks(uid),
    bonus: config.dailyBonus > 0 ? { amount: config.dailyBonus, readyAt: u.bonus_at + 86400000 } : null,
    table: act ? { id: act.table.id, kind: act.table.kind } : null,
  };
}

function lobbyView(uid) {
  return {
    tournaments: tournaments.list(uid),
    online: sockets.size,
    packs: config.packs, hintPacks: config.hintPacks, bots: BOTS, buyins: config.botBuyins, buyinMin: config.buyinMin,
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
  leave: (uid) => (botRooms.get(uid)?.leave(uid), { t: 'ok' }),
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
    if (!config.adminIds.includes(uid) || !(room instanceof DemoRoom)) throw new Error('Только на демо-столе');
    room.setPlan(m.plan);
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
    const free = room instanceof DemoRoom; // на демо-столе админа — бесплатно
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
