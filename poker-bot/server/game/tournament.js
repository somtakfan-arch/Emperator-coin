// Турниры: свои (от 2 до 60 игроков) и Большой — каждый день по расписанию.
// Взносы и призы — в фишках. Несколько столов по 6 с автобалансировкой.
import { randomBytes } from 'node:crypto';
import { db, tx, debit, credit } from '../db.js';
import { config, BLIND_LEVELS, payoutShares } from '../config.js';
import { notify, openButton, escapeHtml } from '../telegram.js';
import { GameTable, HumanSeat } from './table.js';
import { clubOf } from '../social.js';

// фразы в лобби турнира — только из набора, без свободного текста
export const TOUR_PHRASES = ['Всем удачи!', 'GG', 'Го-го-го!', 'Кто сегодня заберёт?', 'Ну держитесь 😎', '🔥🔥🔥', '👑', 'Я в деле!'];

const MAX_SEATS = 6; // столы по 6; турнир на 9 — один стол на 9
export const bountyOf = (t) => (t.ko ? Math.floor(t.buyin / 2) : 0);
const newId = () => randomBytes(6).toString('base64url').replace(/[^a-zA-Z0-9]/g, 'x');
const T = {
  get: db.prepare('SELECT * FROM tournaments WHERE id = ?'),
  regs: db.prepare('SELECT r.*, u.name, u.rating FROM regs r JOIN users u ON u.id = r.user_id WHERE r.t_id = ? ORDER BY r.at'),
  count: db.prepare('SELECT COUNT(*) AS n FROM regs WHERE t_id = ?'),
  isReg: db.prepare('SELECT 1 FROM regs WHERE t_id = ? AND user_id = ?'),
  setStatus: db.prepare('UPDATE tournaments SET status = ? WHERE id = ?'),
};

export class Tournaments {
  constructor(hub) {
    this.hub = hub;
    this.running = new Map(); // id -> RunningTournament
    this.chats = new Map(); // id -> последние фразы в лобби
  }

  // ---------- Лобби ----------

  view(t, uid) {
    const regs = T.regs.all(t.id);
    const run = this.running.get(t.id);
    return {
      id: t.id, name: t.name, kind: t.kind, maxPlayers: t.max_players, buyin: t.buyin,
      minRating: t.min_rating, blindMin: t.blind_min, startMode: t.start_mode, startAt: t.start_at,
      private: !!t.private, club: t.club_id || null, chat: this.chats.get(t.id) || [], status: t.status, count: regs.length, prizePool: regs.length * (t.buyin - bountyOf(t)), ko: !!t.ko, bounty: bountyOf(t),
      mine: t.creator === uid, registered: regs.some((r) => r.user_id === uid),
      players: regs.map((r) => ({ id: r.user_id, name: r.name, rating: Math.round(r.rating), place: r.place, prize: r.prize })),
      alive: run ? run.alive() : null,
      level: run ? run.levelInfo() : null,
    };
  }

  list(uid) {
    const rows = db.prepare(`
      SELECT * FROM tournaments
      WHERE status IN ('reg', 'running')
         OR (status IN ('done', 'cancelled') AND finished > ? AND id IN (SELECT t_id FROM regs WHERE user_id = ?))
      ORDER BY kind = 'big' DESC, created DESC LIMIT 100`).all(Date.now() - 86400000, uid);
    const myClub = clubOf(uid);
    return rows
      .filter((t) => !t.club_id || t.club_id === myClub) // клубные турниры видят только члены клуба
      .filter((t) => !t.private || t.creator === uid || T.isReg.get(t.id, uid))
      .map((t) => this.view(t, uid));
  }

  one(id, uid) {
    const t = T.get.get(String(id));
    return t ? this.view(t, uid) : null;
  }

  // ---------- Создание и регистрация ----------

  create(user, o) {
    const name = String(o.name || '').trim().slice(0, 40) || `Стол ${user.name}`;
    const maxPlayers = Number(o.maxPlayers);
    const buyin = Math.floor(Number(o.buyin));
    const blindMin = Number(o.blindMin);
    const minRating = Math.max(0, Math.floor(Number(o.minRating) || 0));
    if (!config.tournament.sizes.includes(maxPlayers)) throw new Error('Неверное число игроков');
    if (!(buyin >= 100 && buyin <= 1_000_000)) throw new Error('Взнос от 100 до 1 000 000');
    if (!config.tournament.blindOptions.includes(blindMin)) throw new Error('Неверная скорость блайндов');
    if (user.rating < minRating) throw new Error('Твой рейтинг ниже порога этого турнира');
    const startMode = o.startMode === 'time' ? 'time' : 'full';
    let startAt = null;
    if (startMode === 'time') {
      const min = Number(o.startIn);
      if (!(min >= 5 && min <= 7 * 24 * 60)) throw new Error('Старт — от 5 минут до 7 дней');
      startAt = Date.now() + min * 60000;
    }
    const club = o.club ? clubOf(user.id) : null;
    if (o.club && !club) throw new Error('Ты не в клубе');
    const open = db.prepare("SELECT COUNT(*) AS n FROM tournaments WHERE creator = ? AND status = 'reg'").get(user.id).n;
    if (open >= config.tournament.maxOpenPerUser) throw new Error('У тебя уже много открытых турниров');
    const id = newId();
    tx(() => {
      db.prepare(`INSERT INTO tournaments (id, name, creator, kind, max_players, buyin, min_rating, blind_min, start_mode, start_at, private, status, created, ko)
        VALUES (?, ?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, 'reg', ?, ?)`)
        .run(id, name, user.id, maxPlayers, buyin, minRating, blindMin, startMode, startAt, o.private ? 1 : 0, Date.now(), o.ko ? 1 : 0);
      if (club) db.prepare('UPDATE tournaments SET club_id = ? WHERE id = ?').run(club, id);
    });
    this.register(user, id); // создатель сразу в турнире
    return id;
  }

  register(user, id) {
    const t = T.get.get(String(id));
    if (!t || t.status !== 'reg') throw new Error('Регистрация закрыта');
    if (T.isReg.get(t.id, user.id)) return;
    if (t.club_id && clubOf(user.id) !== t.club_id) throw new Error('Только для участников клуба');
    if (user.rating < t.min_rating) throw new Error(`Нужен рейтинг ${t.min_rating}`);
    if (T.count.get(t.id).n >= t.max_players) throw new Error('Мест нет');
    if (!debit(user.id, t.buyin, 'tour_buyin', t.id)) throw new Error('Не хватает фишек — пополни кошелёк');
    db.prepare('INSERT INTO regs (t_id, user_id, at) VALUES (?, ?, ?)').run(t.id, user.id, Date.now());
    if (t.start_mode === 'full' && T.count.get(t.id).n >= t.max_players) this.start(t.id);
    this.hub.lobbyChanged();
  }

  unregister(user, id) {
    const t = T.get.get(String(id));
    if (!t || t.status !== 'reg' || !T.isReg.get(t.id, user.id)) throw new Error('Нельзя отменить');
    if (t.creator === user.id && t.kind === 'user') return this.cancel(user, id);
    db.prepare('DELETE FROM regs WHERE t_id = ? AND user_id = ?').run(t.id, user.id);
    credit(user.id, t.buyin, 'tour_refund', t.id);
    this.hub.lobbyChanged();
  }

  // Создатель отменяет свой турнир до старта — всем возвращаются взносы.
  cancel(user, id) {
    const t = T.get.get(String(id));
    if (!t || t.status !== 'reg' || (user && t.creator !== user.id)) throw new Error('Нельзя отменить');
    tx(() => {
      for (const r of T.regs.all(t.id)) {
        db.prepare('UPDATE users SET chips = chips + ? WHERE id = ?').run(t.buyin, r.user_id);
        db.prepare('INSERT INTO ledger (user_id, delta, reason, ref, at) VALUES (?, ?, ?, ?, ?)').run(r.user_id, t.buyin, 'tour_refund', t.id, Date.now());
      }
      db.prepare("UPDATE tournaments SET status = 'cancelled', finished = ? WHERE id = ?").run(Date.now(), t.id);
    });
    for (const r of T.regs.all(t.id)) this.hub.sendMe(r.user_id);
    this.hub.lobbyChanged();
  }

  // фраза в лобби турнира — видят все зарегистрированные
  say(user, id, i) {
    const t = T.get.get(String(id));
    if (!t) throw new Error('Нет турнира');
    if (!T.isReg.get(t.id, user.id)) throw new Error('Писать могут только участники');
    const text = TOUR_PHRASES[Number(i)];
    if (!text) throw new Error('Нет такой фразы');
    const list = this.chats.get(t.id) || [];
    const last = list[list.length - 1];
    if (last?.uid === user.id && Date.now() - last.at < 3000) return; // не чаще раза в 3 секунды
    list.push({ uid: user.id, name: user.name, text, at: Date.now() });
    this.chats.set(t.id, list.slice(-20));
    for (const r of T.regs.all(t.id)) this.hub.send(r.user_id, { t: 'tour', tour: this.one(t.id, r.user_id) });
  }

  // ---------- Расписание ----------

  ensureBig() {
    const has = db.prepare("SELECT 1 FROM tournaments WHERE kind = 'big' AND status = 'reg'").get();
    if (has) return;
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), config.big.hourUtc));
    if (start.getTime() - Date.now() < 10 * 60000) start.setUTCDate(start.getUTCDate() + 1);
    db.prepare(`INSERT INTO tournaments (id, name, creator, kind, max_players, buyin, min_rating, blind_min, start_mode, start_at, private, status, created)
      VALUES (?, 'Большой турнир', NULL, 'big', ?, ?, ?, ?, 'time', ?, 0, 'reg', ?)`)
      .run(newId(), config.big.maxPlayers, config.big.buyin, config.big.minRating, config.big.blindMinutes, start.getTime(), Date.now());
  }

  tick() {
    this.ensureBig();
    const now = Date.now();
    for (const t of db.prepare("SELECT * FROM tournaments WHERE status = 'reg' AND start_mode = 'time'").all()) {
      if (!t.reminded && t.start_at - now < 10 * 60000) {
        db.prepare('UPDATE tournaments SET reminded = 1 WHERE id = ?').run(t.id);
        for (const r of T.regs.all(t.id)) notify(r.user_id, `«${escapeHtml(t.name)}» начнётся через 10 минут.`, openButton('Открыть', `#t=${t.id}`));
      }
      if (t.start_at <= now) {
        if (T.count.get(t.id).n >= 2) this.start(t.id);
        else this.cancel(null, t.id);
      }
    }
  }

  // ---------- Игра ----------

  start(id) {
    const t = T.get.get(id);
    if (!t || t.status !== 'reg') return;
    db.prepare("UPDATE tournaments SET status = 'running', started = ? WHERE id = ?").run(Date.now(), id);
    const run = new RunningTournament(this, T.get.get(id), T.regs.all(id));
    this.running.set(id, run);
    run.start();
    for (const r of T.regs.all(id)) notify(r.user_id, `«${escapeHtml(t.name)}» начался! Садись за стол.`, openButton('За стол', `#t=${id}`, 'success'));
    this.hub.lobbyChanged();
  }

  // сдаться: за столом сразу фолд, после раздачи — вылет (место по текущему)
  forfeit(userId) {
    const t = this.tableOf(userId);
    if (!t) return;
    const p = t.table.players.find((x) => x.id === userId);
    p.forfeit = true;
    p.bot.sittingOut = true;
    p.bot.forceFold();
    if (!t.table.inHand) t.run.afterHand(t.table);
  }

  tableOf(userId) {
    for (const run of this.running.values()) {
      const tb = run.tableOf(userId);
      if (tb) return { run, table: tb };
    }
    return null;
  }
}

class RunningTournament {
  constructor(mgr, t, regs) {
    this.mgr = mgr;
    this.hub = mgr.hub;
    this.t = t;
    this.n = regs.length;
    this.startedAt = Date.now();
    this.players = regs.map((r) => ({ id: r.user_id, name: r.name, rating: r.rating }));
    this.tables = [];
    this.seats = this.n === 9 ? 9 : MAX_SEATS;
    this.placesLeft = this.n;
    this.done = false;
  }

  level() {
    const ms = this.t.blind_min * 60000 * Math.max(config.speed, 0.001);
    return Math.min(Math.floor((Date.now() - this.startedAt) / ms), BLIND_LEVELS.length - 1);
  }

  levelInfo() {
    const l = this.level();
    const ms = this.t.blind_min * 60000 * Math.max(config.speed, 0.001);
    return { level: l + 1, sb: BLIND_LEVELS[l][0], bb: BLIND_LEVELS[l][1], nextAt: this.startedAt + (l + 1) * ms };
  }

  alive() {
    return this.tables.reduce((n, tb) => n + tb.players.length, 0);
  }

  tableOf(userId) {
    return this.tables.find((tb) => tb.players.some((p) => p.id === userId)) || null;
  }

  start() {
    const order = this.players.slice().sort(() => Math.random() - 0.5);
    const k = Math.ceil(order.length / this.seats);
    for (let i = 0; i < k; i++) this.tables.push(this.newTable(i + 1));
    order.forEach((p, i) => {
      this.tables[i % k].addPlayer({ id: p.id, name: p.name, stack: config.tournament.stack, bot: new HumanSeat(p.id, this.hub), isBot: false });
    });
    for (const tb of this.tables) tb.run();
  }

  newTable(num) {
    const tb = new GameTable({ id: `${this.t.id}:${num}`, kind: 'tour', title: `${this.t.name} · стол ${num}`, hub: this.hub, sb: 10, bb: 20 });
    tb.extra = () => ({
      tournamentId: this.t.id, alive: this.alive(), total: this.n, ...this.levelInfo(),
      prizePool: this.n * (this.t.buyin - bountyOf(this.t)), tableNo: num, ko: !!this.t.ko, bounty: bountyOf(this.t),
    });
    tb.beforeHand = () => {
      // остался один за столом — пересаживаем к остальным
      if (tb.players.length < 2 && !this.done) this.rebalance(tb);
      const [sb, bb] = BLIND_LEVELS[this.level()];
      tb.setBlinds(sb, bb);
      this.startStacks = new Map(tb.players.map((p) => [p.id, p.stack]));
      tb.handStacks = this.startStacks;
    };
    tb.afterHand = () => this.afterHand(tb);
    return tb;
  }

  afterHand(tb) {
    if (this.done) return;
    for (const p of tb.players) if (p.forfeit) p.stack = 0; // сдавшиеся выбывают
    // вылетевшие: кто раньше раздачи имел больше — тот выше
    const busted = tb.players.filter((p) => p.stack === 0)
      .sort((a, b) => (tb.handStacks?.get(b.id) ?? 0) - (tb.handStacks?.get(a.id) ?? 0));
    for (const p of busted) {
      tb.removePlayer(p.id);
      this.setPlace(p.id, this.placesLeft--);
      this.knockout(tb, p);
    }
    if (this.alive() <= 1) return this.finish();
    this.rebalance(tb);
    this.hub.lobbyChanged();
  }

  // Нокаут: кто выбил — забирает награду за голову (половину взноса выбывшего)
  knockout(tb, busted) {
    const bounty = bountyOf(this.t);
    if (!bounty) return;
    const w = (tb.v.result || []).filter((x) => x.id !== busted.id).sort((a, b) => b.amount - a.amount)[0];
    if (!w || w.id < 0) return;
    credit(w.id, bounty, 'tour_bounty', this.t.id);
    this.hub.send(w.id, { t: 'toast', text: `Нокаут! Ты выбил ${busted.name}: +${bounty.toLocaleString('ru')} фишек` });
    this.hub.sendMe(w.id);
  }

  setPlace(userId, place) {
    db.prepare('UPDATE regs SET place = ? WHERE t_id = ? AND user_id = ?').run(place, this.t.id, userId);
    this.hub.send(userId, { t: 'busted', tournamentId: this.t.id, place, total: this.n });
  }

  // Балансировка: лишний стол расформировываем, разница между столами — не больше 1.
  rebalance(tb) {
    if (tb.closed) return;
    const live = this.tables.filter((x) => !x.closed);
    const total = this.alive();
    const need = Math.ceil(total / this.seats);
    const byCount = () => live.filter((x) => x !== tb && !x.closed).sort((a, b) => a.players.length - b.players.length);
    if (live.length > need && tb.players.length === Math.min(...live.map((x) => x.players.length))) {
      for (const p of tb.players.slice()) {
        const dest = byCount().find((x) => x.players.length < this.seats);
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
    to.addPlayer(p);
    this.hub.send(p.id, { t: 'toast', text: `Тебя пересадили за стол ${to.id.split(':')[1]}` });
    from.broadcast();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const winner = this.tables.flatMap((tb) => tb.players)[0];
    if (winner) this.setPlace(winner.id, 1);
    for (const tb of this.tables) tb.closed = true;

    const pool = this.n * (this.t.buyin - bountyOf(this.t));
    const shares = payoutShares(this.n);
    const regs = T.regs.all(this.t.id).sort((a, b) => a.place - b.place);
    const prizes = shares.map((s) => Math.floor(pool * s));
    prizes[0] += pool - prizes.reduce((a, b) => a + b, 0); // остаток от округления — победителю

    // Эло: каждый с каждым, выше место — победа
    const delta = new Map(regs.map((r) => [r.user_id, 0]));
    const K = 32 / Math.max(1, regs.length - 1);
    for (let i = 0; i < regs.length; i++)
      for (let j = i + 1; j < regs.length; j++) {
        const a = regs[i], b = regs[j];
        const e = 1 / (1 + 10 ** ((b.rating - a.rating) / 400));
        delta.set(a.user_id, delta.get(a.user_id) + K * (1 - e));
        delta.set(b.user_id, delta.get(b.user_id) - K * (1 - e));
      }

    tx(() => {
      for (const r of regs) {
        const prize = prizes[r.place - 1] || 0;
        db.prepare('UPDATE regs SET prize = ? WHERE t_id = ? AND user_id = ?').run(prize, this.t.id, r.user_id);
        db.prepare('UPDATE users SET chips = chips + ?, rating = rating + ?, games = games + 1, wins = wins + ? WHERE id = ?')
          .run(prize, delta.get(r.user_id), r.place === 1 ? 1 : 0, r.user_id);
        if (prize) db.prepare('INSERT INTO ledger (user_id, delta, reason, ref, at) VALUES (?, ?, ?, ?, ?)').run(r.user_id, prize, 'tour_prize', this.t.id, Date.now());
      }
      db.prepare("UPDATE tournaments SET status = 'done', finished = ? WHERE id = ?").run(Date.now(), this.t.id);
    });
    this.mgr.running.delete(this.t.id);

    for (const r of regs) {
      const prize = prizes[r.place - 1] || 0;
      const d = Math.round(delta.get(r.user_id));
      const text = `«${escapeHtml(this.t.name)}»: ${r.place} место из ${this.n}${prize ? `, приз ${prize.toLocaleString('ru')} фишек` : ''}. Рейтинг ${d >= 0 ? '+' : ''}${d}.`;
      this.hub.send(r.user_id, { t: 'finished', tournamentId: this.t.id, place: r.place, prize, total: this.n, ratingDelta: d });
      this.hub.sendMe(r.user_id);
      notify(r.user_id, text, openButton('Открыть', `#t=${this.t.id}`));
      this.hub.onWinnings?.(r.user_id, prize - this.t.buyin); // в счёт наград за выигрыш
      this.hub.onTourDone?.(r.user_id, { place: r.place, size: this.n, solo: false });
    }
    this.hub.lobbyChanged();
  }
}
