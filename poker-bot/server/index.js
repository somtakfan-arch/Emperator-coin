// Точка входа: раздаёт мини-апп, держит WebSocket с игроками, запускает бота и расписание.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer } from 'ws';
import { config, payoutShares, NOT_ADMIN } from './config.js';
import { db, upsertUser, getUser, ranks, credit, recoverAfterRestart, addWinnings, WIN_REWARDS, useHint } from './db.js';
import { verifyInitData, startBot, createInvoice, hooks, inviteLink, bot, notify, openButton, findPack, api } from './telegram.js';
import { BotRoom, DemoRoom, ladderStep, LADDER_STEPS } from './game/botroom.js';
import { MixedRoom } from './game/mixedroom.js';
import { Tournaments } from './game/tournament.js';
import { SoloTour, SOLO_SIZES, SOLO_BLINDS } from './game/solotour.js';
import { BOT_CLASSES, BOSS_CLASSES, Hunter } from '../core/bots.js';
import { CROWD } from '../core/crowd.js';
import { arrangeDeck } from './game/demoplan.js';
import { evaluate, evaluateShort } from '../core/cards.js';
import { botHandsWon, botWeekTop } from './game/table.js';
import * as botsx from './botsx.js';
import { ghostHour } from '../core/bots.js';
import { BOT_KINDS } from '../core/crowd.js';
import { botRating } from './game/elo.js';
import * as progress from './progress.js';
import * as cosmetics from './cosmetics.js';
import * as social from './social.js';
import * as admin from './admin.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

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
const coachUsers = new Set(); // у кого включён тренер

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
  // прогресс: итог раздачи, турнира, «обыграл всех ботов»
  onHandResult(uid, h) {
    progress.onHand(uid, h);
    // реферал: новичок сыграл 20 раздач — награда пригласившему
    const hands = progress.progressView(uid)?.stats.hands ?? 0;
    const inviter = social.checkRef(uid, hands);
    if (inviter) {
      hub.send(inviter, { t: 'toast', text: `Твой друг сыграл 20 раздач: +${social.REF_BONUS_INVITER} фишек и редкий сундук!` });
      notify(inviter, `Друг, которого ты позвал, сыграл 20 раздач — тебе <b>+${social.REF_BONUS_INVITER}</b> фишек и редкий сундук!`);
      hub.sendMe(inviter);
    }
  },
  // друг сел за стол — друзьям онлайн маленькое уведомление
  onSeated(uid) {
    const u = getUser(uid);
    for (const f of social.friendIds(uid)) if (hub.isOnline(f)) hub.send(f, { t: 'toast', text: `${u.name} сел за стол — можно посмотреть в «Друзьях»` });
  },
  onTourDone: (uid, ev) => progress.onEvent(uid, { type: 'tour', ...ev }),
  onBeatAll: (uid, bots) => progress.onEvent(uid, { type: 'beatAll', bots }),
  onCaughtCheater: (uid) => progress.onEvent(uid, { type: 'caughtCheater' }),
  onBotVs: (uid, bots, won, net) => progress.recordVs(uid, bots, won, net),
  // лестница: новая ступень — фишки, вся лестница — эпический сундук
  onLadderStep(uid, step, of) {
    const chips = step * 200;
    if (config.progressRewards) credit(uid, chips, 'ladder', String(step));
    if (step >= of) progress.grantChest(uid, 'epic');
    hub.send(uid, { t: 'toast', text: step >= of ? `Лестница пройдена! +${chips} фишек и эпический сундук` : `Новая ступень ${step + 1}! +${chips} фишек` });
    hub.sendMe(uid);
  },
  // команда 2 на 2 победила: редкий сундук
  onTeamWin(uid) {
    progress.grantChest(uid, 'rare');
    hub.send(uid, { t: 'toast', text: 'Команда победила! Редкий сундук твой' });
    hub.sendMe(uid);
  },
  // марафон: 1000 раздач сыграно — итог и обычный сундук
  onMarathonDone(uid, net) {
    progress.grantChest(uid, 'common');
    hub.send(uid, { t: 'toast', text: `Марафон окончен! Итог за 1000 раздач: ${net >= 0 ? '+' : '−'}${Math.abs(net).toLocaleString('ru')} фишек. Сундук твой` });
  },
  // босс-раш пройден: эпический сундук и фишки ×3 от бай-ина
  onRushDone(uid, buyin) {
    progress.grantChest(uid, 'epic');
    credit(uid, buyin * 3, 'rush', null);
    hub.send(uid, { t: 'toast', text: `Босс-раш пройден! +${(buyin * 3).toLocaleString('ru')} фишек и эпический сундук` });
    hub.sendMe(uid);
  },
  // Тень: обыграл — +1 уровень, крупно проиграл — −1
  onShadowResult(uid, net, buyin) {
    const delta = net > 0 ? 1 : net < -buyin / 2 ? -1 : 0;
    if (!delta) return;
    const lvl = progress.adjustShadow(uid, delta);
    hub.send(uid, { t: 'toast', text: delta > 0 ? `Тень стала сильнее: уровень ${lvl}` : `Тень ослабла: уровень ${lvl}` });
  },
  // тренер включён у игрока?
  coachOn: (uid) => coachUsers.has(uid),
  onSoloDone(tour) {
    if (solos.get(tour.userId) === tour) solos.delete(tour.userId);
  },
  onRoomClosed(uid, room, stack, net = null, kicked = false) {
    if (botRooms.get(uid) === room) botRooms.delete(uid);
    // итог сессии: сколько раздач сыграл и выиграл, ± фишки
    const seat = room.seatOf ? room.seatOf(uid) : room.seat;
    hub.send(uid, {
      t: 'left', stack, net, kicked, beatAll: !!room.beatAll, timed: !!room.endsAt,
      hands: seat?.session?.hands ?? 0, won: seat?.session?.won ?? 0, demo: !!room.table?.noStats,
    });
    hub.sendMe(uid);
  },
};
hooks.onBalance = (uid) => hub.sendMe(uid);
hooks.onRef = (uid, refBy) => social.registerRef(uid, refBy);
hooks.refBonus = social.REF_BONUS_NEW;
progress.setProgressNotifier((uid, text) => {
  hub.send(uid, { t: 'toast', text });
  hub.sendMe(uid);
});
hooks.onHandsWon = (uid, n) => {
  const at = activeTable(uid);
  const p = at?.table.players.find((x) => x.id === uid);
  if (p) {
    p.handsWon = n;
    at.table.broadcast();
  }
  hub.sendMe(uid);
};
const tournaments = new Tournaments(hub);

// Стол, где работают кнопки админа: только админ и только без других людей
// (столы с ботами, демо, сольные турниры)
// Пранк «тузы»: тебе два туза, ещё два — на тёрне и ривере
function acesPlan(uid) {
  const suits = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  return { holes: { [uid]: [48 + suits[0], 48 + suits[1]] }, board: [undefined, undefined, undefined, 48 + suits[2], 48 + suits[3]] };
}

// Пранк «кулер»: у друга два туза, до ривера он впереди, а на ривере ты его обыгрываешь
function coolerPlan(deck, uid, friend, ev) {
  const aces = deck.filter((c) => c >> 2 === 12);
  const rest = deck.filter((c) => c >> 2 !== 12);
  if (aces.length < 2 || rest.length < 7) return null;
  for (let i = 0; i < 20000; i++) {
    const fa = [...aces].sort(() => Math.random() - 0.5).slice(0, 2);
    const pick = [...rest].sort(() => Math.random() - 0.5).slice(0, 7);
    const mine = pick.slice(0, 2), board = pick.slice(2);
    const turn = board.slice(0, 4);
    if (ev([...mine, ...turn]) >= ev([...fa, ...turn])) continue; // до ривера друг впереди
    if (ev([...mine, ...board]) <= ev([...fa, ...board])) continue; // на ривере выигрываешь ты
    return { holes: { [uid]: mine, [friend]: fa }, board };
  }
  return null;
}

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

// где сейчас друг: онлайн и за каким столом (за чужим столом можно только смотреть)
function presence(id) {
  const a = activeTable(id);
  return {
    online: hub.isOnline(id),
    table: a ? { kind: a.table.kind, title: a.table.title, mixedId: a.table.kind === 'mixed' ? a.table.id.slice(1) : null } : null,
  };
}
const watching = new Map(); // uid -> стол, за которым он наблюдает

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
    rank: (({ name, color }) => ({ name, color }))(progress.rankOf(u.rating)),
    vip: cosmetics.vipEmotes(u.id),
    handsWon: u.hands_won, won: u.won, winRewards: WIN_REWARDS.map((r, i) => ({ ...r, done: i < u.won_rewards })), hints: u.hints,
    games: u.games, wins: u.wins, ...ranks(uid),
    bonus: config.dailyBonus > 0 ? { amount: config.dailyBonus, readyAt: u.bonus_at + 86400000 } : null,
    table: act ? { id: act.table.id, kind: act.table.kind } : null,
  };
}

function lobbyView(uid) {
  return {
    tournaments: tournaments.list(uid),
    event: admin.getEvent(),
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
  // таблицы лидеров: по Эло, по выигранным раздачам, по самому большому банку
  // админа в таблицах лидеров нет
  top: (uid, m) => {
    if (m.kind === 'bots') return { t: 'top', kind: 'bots', rating: botWeekTop().map((r) => ({ name: r.name, value: r.value, rank: 'бот', rankColor: '#9ad' })) };
    const kind = ['hands', 'pot'].includes(m.kind) ? m.kind : 'rating';
    const rows = kind === 'hands'
      ? db.prepare(`SELECT name, hands_won AS value, rating FROM users WHERE hands_won > 0 AND ${NOT_ADMIN} ORDER BY hands_won DESC LIMIT 20`).all()
      : kind === 'pot'
        ? db.prepare(`SELECT name, biggest_pot AS value, rating FROM users WHERE biggest_pot > 0 AND ${NOT_ADMIN} ORDER BY biggest_pot DESC LIMIT 20`).all()
        : db.prepare(`SELECT name, rating AS value, rating FROM users WHERE (games > 0 OR rating <> 1500) AND ${NOT_ADMIN} ORDER BY rating DESC LIMIT 20`).all();
    return { t: 'top', kind, rating: rows.map((r) => ({ name: r.name, value: Math.round(r.value), rank: progress.rankOf(r.rating).name, rankColor: progress.rankOf(r.rating).color })) };
  },
  // ---------- промокод (для всех) ----------
  redeemPromo(uid, m) {
    const text = admin.redeem(uid, m.code);
    hub.sendMe(uid);
    return { t: 'ok', text: `Промокод активирован: ${text}` };
  },
  // ---------- админка (только админ) ----------
  admin(uid, m) {
    if (!config.adminIds.includes(uid)) throw new Error('Нет доступа');
    const a = m.a;
    if (a === 'search') return { t: 'admin', users: admin.searchUsers(m.q) };
    if (a === 'adjust') {
      const u = admin.adjust(m.id, m.field, m.mode, m.value);
      hub.sendMe(u.id);
      // значок раздач за столом — сразу
      if (m.field === 'handsWon') hooks.onHandsWon?.(u.id, u.handsWon);
      return { t: 'admin', user: u, text: 'Сохранено' };
    }
    if (a === 'stats') {
      const tables = new Set([...botRooms.values()].map((r) => r.table)).size + solos.size + tournaments.running.size;
      return { t: 'admin', stats: admin.stats(tables), broadcast: admin.broadcastStatus() };
    }
    if (a === 'broadcast') {
      const st = admin.startBroadcast(m.text, (id, text) => api('sendMessage', { chat_id: id, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[openButton('Играть', '', 'success')]] } }));
      return { t: 'admin', broadcast: st, text: `Рассылка началась: ${st.total} игроков` };
    }
    if (a === 'promos') return { t: 'admin', promos: admin.listPromos() };
    if (a === 'promoCreate') {
      admin.createPromo(m.promo || {});
      return { t: 'admin', promos: admin.listPromos(), text: 'Промокод создан' };
    }
    if (a === 'promoDelete') {
      admin.deletePromo(m.code);
      return { t: 'admin', promos: admin.listPromos() };
    }
    if (a === 'event') {
      const e = admin.setEvent(m.kind || null, m.hours, m.title);
      hub.lobbyChanged();
      return { t: 'admin', event: m.kind ? e : null, text: m.kind ? 'Ивент включён' : 'Ивент выключен' };
    }
    throw new Error('Неизвестное действие');
  },
  // ---------- друзья, клубы, подарки, приглашения ----------
  friends: (uid) => ({ t: 'friends', ...social.friendsView(uid, presence), ref: { ...social.refStats(uid), link: bot.username ? `https://t.me/${bot.username}?start=r_${uid}` : null, bonusNew: social.REF_BONUS_NEW, bonusInviter: social.REF_BONUS_INVITER } }),
  addFriend(uid, m) {
    const r = social.addFriend(uid, m.ref);
    const me = getUser(uid);
    if (r.accepted) {
      hub.send(r.target.id, { t: 'toast', text: `${me.name} теперь твой друг` });
      notify(r.target.id, `<b>${me.name}</b> принял заявку — теперь вы друзья 🤝`);
    } else {
      hub.send(r.target.id, { t: 'toast', text: `${me.name} хочет добавить тебя в друзья` });
      notify(r.target.id, `<b>${me.name}</b> хочет добавить тебя в друзья. Открой «Друзья» в игре, чтобы принять.`);
    }
    return handlers.friends(uid);
  },
  removeFriend(uid, m) {
    social.removeFriend(uid, Number(m.id));
    return handlers.friends(uid);
  },
  gift(uid, m) {
    social.gift(uid, Number(m.id), { chips: m.chips, hints: m.hints });
    const me = getUser(uid);
    const what = [m.chips > 0 && `${Number(m.chips).toLocaleString('ru')} фишек`, m.hints > 0 && `${m.hints} подсказки`].filter(Boolean).join(' и ');
    hub.send(Number(m.id), { t: 'toast', text: `🎁 ${me.name} подарил тебе ${what}` });
    notify(Number(m.id), `🎁 <b>${me.name}</b> подарил тебе ${what}!`);
    hub.sendMe(uid);
    hub.sendMe(Number(m.id));
    return { ...handlers.friends(uid), text: 'Подарок отправлен' };
  },
  // позвать друга за свой стол с друзьями
  inviteFriend(uid, m) {
    const room = botRooms.get(uid);
    if (!(room instanceof MixedRoom)) throw new Error('Сначала создай стол с друзьями');
    const id = Number(m.id);
    if (!social.areFriends(uid, id)) throw new Error('Это не твой друг');
    const me = getUser(uid);
    hub.send(id, { t: 'invite', from: me.name, mixedId: room.id, duel: room.duel?.total ?? null });
    notify(id, `<b>${me.name}</b> зовёт тебя ${room.duel ? `на дуэль (${room.duel.total} раздач)` : 'за стол'} 🃏`, openButton('Сесть за стол', `#m=${room.id}`, 'success'));
    return { t: 'ok' };
  },
  // дуэль с другом: стол на двоих на N раздач
  duelFriend(uid, m) {
    if (activeTable(uid)) throw new Error('Ты уже за столом');
    const id = Number(m.id);
    if (!social.areFriends(uid, id)) throw new Error('Это не твой друг');
    const room = MixedRoom.open(hub, getUser(uid), { buyin: Number(m.buyin), bots: 0, duel: Number(m.hands) || 20, variant: m.variant });
    mixedRooms.set(room.id, room);
    botRooms.set(uid, room);
    handlers.inviteFriend(uid, { id });
    hub.sendMe(uid);
    return { t: 'ok' };
  },
  // смотреть за столом друга (чужие карты не видны)
  watch(uid, m) {
    const id = Number(m.id);
    if (!social.areFriends(uid, id)) throw new Error('Смотреть можно только за друзьями');
    if (activeTable(uid)) throw new Error('Сначала выйди из-за своего стола');
    const a = activeTable(id);
    if (!a) throw new Error('Друг сейчас не за столом');
    watching.get(uid)?.spectators?.delete(uid);
    a.table.spectators ||= new Map(); // зритель -> за кем смотрит
    a.table.spectators.set(uid, id);
    watching.set(uid, a.table);
    a.table.broadcast();
    return { t: 'ok' };
  },
  unwatch(uid) {
    watching.get(uid)?.spectators?.delete(uid);
    watching.delete(uid);
    return { t: 'ok' };
  },
  club: (uid) => ({ t: 'club', ...social.clubView(uid) }),
  createClub(uid, m) {
    social.createClub(uid, m.name);
    return handlers.club(uid);
  },
  joinClub(uid, m) {
    social.joinClub(uid, m.code);
    return handlers.club(uid);
  },
  leaveClub(uid) {
    social.leaveClub(uid);
    return handlers.club(uid);
  },
  tourSay(uid, m) {
    tournaments.say(getUser(uid), m.id, m.i);
    return null;
  },
  // картинка «поделиться»: сохраняем PNG и отдаём ссылку
  shareImage(uid, m) {
    const data = String(m.data || '');
    if (!data.startsWith('data:image/png;base64,')) throw new Error('Нужна картинка PNG');
    const buf = Buffer.from(data.slice(22), 'base64');
    if (buf.length > 700_000) throw new Error('Картинка слишком большая');
    const dir = join(config.dataDir, 'shares');
    mkdirSync(dir, { recursive: true });
    const id = randomBytes(8).toString('hex');
    writeFileSync(join(dir, `${id}.png`), buf);
    return { t: 'shared', url: `${(config.webAppUrl || '').replace(/\/?$/, '/')}s/${id}.png` };
  },
  // внешний вид: аватар, рамка, рубашка
  look: (uid) => ({ t: 'look', look: cosmetics.lookView(uid) }),
  equip(uid, m) {
    cosmetics.equip(uid, String(m.kind), m.id === null ? null : String(m.id));
    // за столом обновим сразу
    const at = activeTable(uid);
    const p = at?.table.players.find((x) => x.id === uid);
    if (p) {
      p.look = cosmetics.publicLook(uid);
      at.table.broadcast();
    }
    return { t: 'look', look: cosmetics.lookView(uid) };
  },
  // карточка игрока за твоим столом
  playerCard(uid, m) {
    const at = activeTable(uid);
    const p = at?.table.players.find((x) => x.id === Number(m.id));
    if (!p) throw new Error('Игрок не за твоим столом');
    if (p.isBot) {
      const info = BOTS.find((b) => b.name === p.name) || CROWD_VIEW.find((b) => b.name === p.name);
      const boss = BOSS_CLASSES.map((C) => new C({})).find((b) => b.name === p.name);
      const room = botRooms.get(uid);
      return {
        t: 'card',
        card: {
          bot: true, name: p.name, style: info?.style ?? boss?.style ?? '', handsWon: botHandsWon(p.name),
          elo: botRating(p.name, room?.level, room?.shadow), level: room?.level ?? 'normal', vs: progress.vsStats(uid, p.name),
        },
      };
    }
    const u = getUser(p.id);
    const P = progress.progressView(p.id);
    return {
      t: 'card',
      card: {
        bot: false, id: p.id, friend: social.areFriends(uid, p.id), name: u.name, rank: P.rank.name, rankColor: P.rank.color, rating: Math.round(u.rating), handsWon: u.hands_won,
        achievements: P.achievements.filter((a) => a.at).length, tourWins: u.wins, look: cosmetics.publicLook(p.id),
        stats: { hands: P.stats.hands, wins: P.stats.wins, bestCat: P.stats.bestCat },
      },
    };
  },
  // прогресс: задания, достижения, сундуки, пропуск
  progress: (uid) => ({ t: 'progress', progress: progress.progressView(uid) }),
  claimQuest(uid, m) {
    const text = progress.claimQuest(uid, m.period, m.key);
    hub.sendMe(uid);
    return { t: 'progress', progress: progress.progressView(uid), text };
  },
  claimDaily(uid) {
    const text = progress.claimDaily(uid);
    hub.sendMe(uid);
    return { t: 'progress', progress: progress.progressView(uid), text };
  },
  openChest(uid, m) {
    const res = progress.openChest(uid, String(m.kind));
    hub.sendMe(uid);
    return { t: 'progress', progress: progress.progressView(uid), chest: res };
  },
  claimPass(uid, m) {
    const text = progress.claimPass(uid, m.lvl);
    hub.sendMe(uid);
    return { t: 'progress', progress: progress.progressView(uid), text };
  },
  createT: (uid, m) => ({ t: 'created', id: tournaments.create(getUser(uid), m.tour || {}) }),
  reg: (uid, m) => (tournaments.register(getUser(uid), m.id), { t: 'ok' }),
  unreg: (uid, m) => (tournaments.unregister(getUser(uid), m.id), { t: 'ok' }),
  cancelT: (uid, m) => (tournaments.cancel(getUser(uid), m.id), { t: 'ok' }),
  sitBots(uid, m) {
    if (activeTable(uid)) throw new Error('Ты уже за столом');
    botRooms.set(uid, BotRoom.open(hub, getUser(uid), {
      mode: ['6', '9', 'rush', 'mega', 'ladder', 'team'].includes(m.mode) ? m.mode : 'hu', jokers: !!m.jokers, marathon: !!m.marathon, botName: m.botName, variant: m.variant === 'short' ? 'short' : null, chaos: !!m.chaos, buyin: Number(m.buyin), minutes: Number(m.minutes) || 0, fast: !!m.fast,
      level: m.level || 'normal', shadow: progress.shadowLevel(uid), mirror: progress.mirrorStats(uid), myBot: m.botName === '__my' ? botsx.myBot(uid) : null,
    }));
    hub.onSeated(uid);
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
  // тренер: после раздачи — разбор твоих ходов
  coach(uid, m) {
    if (m.on) coachUsers.add(uid);
    else coachUsers.delete(uid);
    return null;
  },
  // боссы и твоя статистика против каждого бота
  botsInfo: (uid) => ({
    t: 'botsInfo',
    bosses: BOSS_CLASSES.filter((C) => C.name !== 'Ghost' || ghostHour()).map((C) => {
      const b = new C({ shadowLevel: progress.shadowLevel(uid), mirror: progress.mirrorStats(uid) });
      return { name: b.name, style: b.style, elo: botRating(b.name, 'normal', progress.shadowLevel(uid)) };
    }),
    vs: progress.vsStats(uid),
    shadow: progress.shadowLevel(uid),
    ladder: { ...ladderStep(uid), steps: LADDER_STEPS },
    myBot: botsx.myBot(uid), kinds: BOT_KINDS, bank: botsx.bankView(uid), showPool: botsx.showPool(),
  }),
  // ---------- свой бот, бот-заменитель, шоу ботов ----------
  setMyBot(uid, m) { return { t: 'ok', bot: botsx.setMyBot(uid, m) }; },
  bankDeposit(uid, m) { botsx.bankDeposit(uid, m.amount); hub.sendMe(uid); return { t: 'ok', bank: botsx.bankView(uid) }; },
  bankWithdraw(uid) { const got = botsx.bankWithdraw(uid); hub.sendMe(uid); return { t: 'ok', got, bank: botsx.bankView(uid) }; },
  botShow(uid, m) {
    if (activeTable(uid)) throw new Error('Сначала выйди из-за стола');
    watching.get(uid)?.spectators?.delete(uid);
    const table = botsx.startShow(hub, uid, { kind: m.kind === 'duel' ? 'duel' : 'tour', bots: m.bots, pick: m.pick, bet: m.bet });
    watching.set(uid, table);
    hub.sendMe(uid);
    return { t: 'ok' };
  },
  // разоблачить Шулера
  expose(uid) {
    const room = botRooms.get(uid);
    if (!(room instanceof BotRoom)) throw new Error('Шулера за столом нет');
    const r = room.expose();
    return { t: 'ok', ...r, text: r.caught ? `🕵️ Поймал Шулера! Он уходит из-за стола${r.bonus && config.progressRewards ? `, +${r.bonus} фишек к стеку` : ''}` : `Ошибся — в последней раздаче он не подглядывал. Штраф ${r.fine} фишек` };
  },
  // эмодзи над собой за столом
  emote(uid, m) {
    activeTable(uid)?.table.emote(uid, String(m.e));
    return null;
  },
  // таймбанк: +15 секунд к ходу (3 раза за стол)
  timebank(uid) {
    const a = activeTable(uid);
    if (!a?.seat.extend?.()) throw new Error('Таймбанк закончился');
    return { t: 'ok', left: a.seat.timebanks };
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
    const room = MixedRoom.open(hub, getUser(uid), { buyin: Number(m.buyin), bots: Number(m.bots), seats: Number(m.seats), password: m.password || null, variant: m.variant });
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
    room.join(getUser(uid), m.password ? String(m.password) : null);
    botRooms.set(uid, room);
    hub.onSeated(uid);
    hub.sendMe(uid);
    return { t: 'ok' };
  },
  // сольный турнир с ботами — старт сразу
  startSolo(uid, m) {
    if (activeTable(uid) || solos.get(uid)) throw new Error('Ты уже за столом');
    const tour = SoloTour.open(hub, getUser(uid), { buyin: m.buyin, size: m.size, blindMin: m.blindMin, demo: !!m.demo, ko: !!m.ko, seats: m.seats });
    solos.set(uid, tour);
    if (!m.demo) hub.onSeated(uid);
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
  // Пранк админа за столом с друзьями: в следующей раздаче у всех на экране «чёрный экран и глаза»,
  // админу приходят два туза, ещё два — на тёрне и ривере. После раздачи каждый, кто проиграл,
  // получает на баланс ×1.5 от проигранного и сообщение, что это был пранк.
  // kind 'cooler' — другу приходят два туза, но ты обыгрываешь его на ривере; без эффектов на экране
  prank(uid, m) {
    if (!config.adminIds.includes(uid)) throw new Error('Нет доступа');
    const at = activeTable(uid);
    if (!at) throw new Error('Ты не за столом');
    const table = at.table;
    if (!table.players.some((p) => !p.isBot && p.id !== uid)) throw new Error('Только когда за столом есть друг');
    if (table.prank) throw new Error('Пранк уже заряжен');
    const cooler = m?.kind === 'cooler';
    const engine = table.engine;
    const prev = engine.demoDeck;
    table.prank = { adminId: uid, live: false };
    engine.demoDeck = (deck, ids) => {
      engine.demoDeck = prev;
      const d = prev ? prev(deck, ids) : deck;
      const friend = ids.find((id) => id !== uid && table.players.find((p) => p.id === id && !p.isBot));
      const plan = ids.includes(uid) && (cooler ? friend && coolerPlan(d, uid, friend, table.variant === 'short' ? evaluateShort : evaluate) : acesPlan(uid));
      if (!plan) { table.prank = null; return d; }
      table.prank.live = true;
      if (!cooler) for (const p of table.players) if (!p.isBot) hub.send(p.id, { t: 'prank', admin: uid, cards: plan.holes[uid] });
      return arrangeDeck(plan, d, ids);
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
    if (at.table.mega) throw new Error('За огромным столом подсказок нет');
    if (at.table.jokers) throw new Error('С джокерами подсказок нет');
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
  // картинки «поделиться»
  const sm = /^\/s\/([a-f0-9]{16})\.png$/.exec(url.pathname);
  if (sm) {
    try {
      const data = await readFile(join(config.dataDir, 'shares', `${sm[1]}.png`));
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000' });
      return res.end(data);
    } catch { return res.writeHead(404).end('not found'); }
  }
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
        admin.touch(uid); // для статистики «активные за сутки»
        if (!sockets.has(uid)) sockets.set(uid, new Set());
        sockets.get(uid).add(ws);
        reply({ t: 'hello', me: meView(uid), startParam: auth.startParam || null });
        // бот-заменитель доигрывает за время, пока тебя не было
        botsx.runOffline(uid).then((log) => {
          if (log) hub.send(uid, { t: 'toast', text: `🤖 Пока тебя не было, твой бот сыграл ${log.hands} раздач: ${log.net >= 0 ? '+' : '−'}${Math.abs(log.net).toLocaleString('ru')} фишек в его банке` });
        }).catch(() => {});
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
    if ((sockets.get(uid)?.size ?? 0) <= 1) handlers.unwatch(uid);
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
  // новый сезон: награды по рангу и мягкий сброс Эло
  try {
    progress.checkSeason((list) => {
      for (const x of list) {
        if (x.chips) notify(x.id, `Сезон закончился! Твой ранг: <b>${x.rank}</b>. Награда: <b>${x.chips.toLocaleString('ru')}</b> фишек. Эло частично сброшено — новый сезон начался.`);
        hub.sendMe(x.id);
      }
    });
  } catch (e) { console.error('season', e); }
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
