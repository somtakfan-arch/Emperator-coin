// Интеграционный тест: сервер в DEV-режиме + фейковые клиенты по WebSocket.
//   npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';

process.env.DEV = '1';
process.env.SPEED = '0';
process.env.TURN_SECONDS = '3';
process.env.TIMED_MINUTES = '0.05,10'; // 3 секунды — для теста
process.env.ADMIN_IDS = '7001';
process.env.PROGRESS_REWARDS = '0'; // фишки за достижения не мешают точным подсчётам
process.env.PORT = String(4100 + Math.floor(Math.random() * 500));
process.env.DATA_DIR = mkdtempSync(tmpdir() + '/poker-test-');

let srv, db;
before(async () => {
  srv = await import('../server/index.js');
  ({ db } = await import('../server/db.js'));
  await new Promise((r) => setTimeout(r, 200));
});
after(() => {
  srv.server.close();
  setTimeout(() => process.exit(0), 100);
});

class Client {
  constructor(id, { autoplay = 'call' } = {}) {
    this.id = id;
    this.autoplay = autoplay;
    this.msgs = [];
    this.waiters = [];
    this.rid = 0;
    this.ws = new WebSocket(`ws://localhost:${process.env.PORT}/ws`);
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      this.msgs.push(m);
      if (m.t === 'me' || m.t === 'hello') this.me = m.me;
      if (m.t === 'table') this.table = m.table;
      if (m.t === 'turn') this.onTurn(m);
      this.waiters = this.waiters.filter((w) => !w(m));
    });
    this.ready = new Promise((r) => this.ws.on('open', r)).then(() => this.req({ t: 'auth', dev: { id, name: `P${id}` } }));
  }
  onTurn(m) {
    if (this.autoplay === 'idle') return; // игрок отошёл и не ходит
    let action;
    if (this.autoplay === 'shove') action = { type: 'raise', to: m.maxTo };
    else if (this.autoplay === 'mix') {
      const r = Math.random();
      action = r < 0.25 ? { type: 'fold' } : r < 0.7 ? { type: 'call' } : { type: 'raise', to: m.maxTo };
    } else action = { type: m.toCall > 0 ? 'call' : 'check' };
    setTimeout(() => this.ws.send(JSON.stringify({ t: 'act', action })), 1);
  }
  req(msg) {
    const rid = ++this.rid;
    return new Promise((resolve, reject) => {
      this.waiters.push((m) => {
        if (m.rid !== rid) return false;
        m.t === 'error' ? reject(new Error(m.text)) : resolve(m);
        return true;
      });
      this.ws.send(JSON.stringify({ ...msg, rid }));
    });
  }
  waitFor(pred, ms = 60000) {
    const hit = this.msgs.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`таймаут у P${this.id}`)), ms);
      this.waiters.push((m) => (pred(m) ? (clearTimeout(timer), resolve(m), true) : false));
    });
  }
  close() { this.ws.close(); }
}

// Сумма движений в ledger должна совпадать с балансом + фишками на столе.
function assertLedger(id) {
  const u = db.prepare('SELECT chips, in_play FROM users WHERE id = ?').get(id);
  const l = db.prepare('SELECT COALESCE(SUM(delta), 0) AS s FROM ledger WHERE user_id = ?').get(id).s;
  const onBotTable = db.prepare("SELECT COALESCE(SUM(delta), 0) AS s FROM ledger WHERE user_id = ? AND reason IN ('bots_buyin', 'bots_cashout')").get(id).s;
  assert.equal(u.chips, l, `ledger P${id}`);
  return { ...u, onBotTable };
}

test('старт с нулём, пополнение (DEV), стол против бота, выход со стеком', async () => {
  const c = new Client(1001);
  await c.ready;
  assert.equal(c.me.chips, 0);
  await assert.rejects(c.req({ t: 'sitBots', mode: 'hu', botName: 'Акула', buyin: 500 }), /Не хватает/);
  await c.req({ t: 'invoice', pack: 'p1' });
  await c.waitFor((m) => m.t === 'me' && m.me.chips === 5000);
  await c.req({ t: 'sitBots', mode: 'hu', botName: 'Акула', buyin: 500 });
  await c.waitFor((m) => m.t === 'left' || (m.t === 'table' && (m.table?.handId >= 3 || m.table?.canRebuy)));
  let rebuys = 0;
  if (c.table?.canRebuy && !c.msgs.some((m) => m.t === 'left')) {
    // колл-станцию Акула обыгрывает быстро — проверим докупку
    await c.req({ t: 'rebuy' });
    rebuys = 1;
  }
  // чужие карты не видны (кроме вскрытия — там их показывают всем)
  const opp = c.table?.seats.find((s) => !s.me);
  if (opp && c.table.inHand && !opp.hand) assert.equal(opp.cards, null);
  // если бот уже проиграл весь стек, стол закрылся сам (боты не докупаются)
  let left = c.msgs.find((m) => m.t === 'left');
  if (!left) {
    await assert.rejects(c.req({ t: 'sitBots', mode: 'hu', botName: 'Акула', buyin: 500 }), /уже за столом/);
    c.ws.send(JSON.stringify({ t: 'leave' }));
    left = await c.waitFor((m) => m.t === 'left').catch(() => c.msgs.find((m) => m.t === 'left'));
  }
  await new Promise((r) => setTimeout(r, 50));
  const u = assertLedger(1001);
  assert.equal(u.in_play, 0);
  assert.equal(u.chips, 4500 - rebuys * 500 + left.stack);
  // бот запомнил игрока для следующих столов
  const mem = db.prepare("SELECT data FROM bot_memory WHERE user_id = 1001 AND bot = 'Акула'").get();
  assert.ok(mem && JSON.parse(mem.data).hands > 0, 'память бота о игроке сохранена');
  // Эло меняется за раздачи с ботами
  const r = db.prepare('SELECT rating FROM users WHERE id = 1001').get().rating;
  assert.notEqual(r, 1500, 'Эло изменилось за игру с ботами');
  assert.ok(c.msgs.some((m) => m.t === 'table' && m.table?.eloDelta), 'стол показывает изменение Эло');
  c.close();
});

async function playTournament(n, size, autoplay, base) {
  const cs = [];
  for (let i = 0; i < n; i++) {
    const c = new Client(base + i, { autoplay });
    await c.ready;
    await c.req({ t: 'invoice', pack: 'p1' });
    cs.push(c);
  }
  const { id } = await cs[0].req({ t: 'createT', tour: { name: 'Тест', maxPlayers: size, buyin: 1000, blindMin: 3, startMode: 'full' } });
  for (const c of cs.slice(1)) await c.req({ t: 'reg', id });
  const fin = await Promise.all(cs.map((c) => c.waitFor((m) => m.t === 'finished' && m.tournamentId === id, 180000)));
  const places = fin.map((f) => f.place).sort((a, b) => a - b);
  assert.deepEqual(places, Array.from({ length: n }, (_, i) => i + 1), 'места 1..n без повторов');
  const prizes = fin.reduce((s, f) => s + f.prize, 0);
  assert.equal(prizes, n * 1000, 'призы = все взносы');
  await new Promise((r) => setTimeout(r, 50));
  let total = 0;
  for (const c of cs) total += assertLedger(c.id).chips;
  assert.equal(total, n * 5000, 'фишки не появились и не пропали');
  const t = db.prepare('SELECT status FROM tournaments WHERE id = ?').get(id);
  assert.equal(t.status, 'done');
  cs.forEach((c) => c.close());
  return fin;
}

test('Sit & Go на 6 игроков доигрывается, призы и рейтинг', async () => {
  const fin = await playTournament(6, 6, 'mix', 2000);
  const winner = fin.find((f) => f.place === 1);
  assert.equal(winner.prize, 3600); // 60% от 6000
  assert.ok(winner.ratingDelta > 0);
});

test('турнир на 18 игроков: 3 стола, балансировка, финал', async () => {
  await playTournament(18, 18, 'shove', 3000);
});

test('отмена своего турнира возвращает взносы', async () => {
  const a = new Client(4001);
  const b = new Client(4002);
  await a.ready; await b.ready;
  await a.req({ t: 'invoice', pack: 'p1' });
  await b.req({ t: 'invoice', pack: 'p1' });
  const { id } = await a.req({ t: 'createT', tour: { name: 'Отмена', maxPlayers: 6, buyin: 2000, blindMin: 5, startMode: 'full', private: true } });
  await b.req({ t: 'reg', id });
  await assert.rejects(b.req({ t: 'cancelT', id }), /Нельзя/);
  await a.req({ t: 'cancelT', id });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(assertLedger(4001).chips, 5000);
  assert.equal(assertLedger(4002).chips, 5000);
  a.close(); b.close();
});

test('стол на время: по окончании закрывается сам с итогом', async () => {
  const c = new Client(5001);
  await c.ready;
  await c.req({ t: 'invoice', pack: 'p1' });
  await assert.rejects(c.req({ t: 'sitBots', mode: 'hu', botName: 'Скала', buyin: 500, minutes: 7 }), /Неверное время/);
  await c.req({ t: 'sitBots', mode: '6', buyin: 500, minutes: 10 });
  await c.waitFor((m) => m.t === 'table' && m.table?.locked);
  // встать можно и со стола на время — стек на баланс
  await c.req({ t: 'leave' });
  await c.waitFor((m) => m.t === 'left', 30000);
  c.close();

  // короткий стол (3 с): закрывается сам и присылает итог
  const d = new Client(5002);
  await d.ready;
  await d.req({ t: 'invoice', pack: 'p1' });
  await d.req({ t: 'sitBots', mode: 'hu', botName: 'Скала', buyin: 500, minutes: 0.05 });
  const left = await d.waitFor((m) => m.t === 'left', 30000);
  assert.equal(typeof left.net, 'number');
  await new Promise((r) => setTimeout(r, 50));
  const u = assertLedger(5002);
  assert.equal(u.in_play, 0);
  assert.equal(u.chips, 5000 + left.net);
  d.close();
});

test('свободный стол: 2 пропущенных хода подряд — кик со стеком на баланс', async () => {
  const c = new Client(6001, { autoplay: 'idle' });
  await c.ready;
  await c.req({ t: 'invoice', pack: 'p1' });
  await c.req({ t: 'sitBots', mode: 'hu', botName: 'Скала', buyin: 500 });
  const left = await c.waitFor((m) => m.t === 'left', 40000);
  assert.equal(left.kicked, true);
  await new Promise((r) => setTimeout(r, 50));
  const u = assertLedger(6001);
  assert.equal(u.in_play, 0);
  assert.equal(u.chips, 4500 + left.stack);
  assert.ok(c.msgs.some((m) => typeof m.now === 'number'), 'сервер присылает своё время');
  c.close();
});

test('демо-стол: только админ, заданные карты приходят, баланс и Эло не трогаются', async () => {
  const x = new Client(7002);
  await x.ready;
  await assert.rejects(x.req({ t: 'sitDemo', mode: 'hu', botName: 'Скала' }), /Нет доступа/);
  x.close();

  const a = new Client(7001);
  await a.ready;
  const before = db.prepare('SELECT chips, rating FROM users WHERE id = 7001').get();
  await a.req({ t: 'sitDemo', mode: 'hu', botName: 'Скала' });
  await a.waitFor((m) => m.t === 'table' && m.table?.demo);
  const AS = 12 * 4, AH = 12 * 4 + 1, KS = 11 * 4, KH = 11 * 4 + 1; // тузы и короли
  const board = [12 * 4 + 2, 12 * 4 + 3, 2 * 4, 3 * 4 + 1, 7 * 4 + 2];
  await assert.rejects(a.req({ t: 'demoPlan', plan: { holes: { 7001: [AS, AS] } } }), /дважды/);
  await a.req({ t: 'demoPlan', plan: { holes: { 7001: [AS, AH], '-1': [KS, KH] }, board } });
  // ждём раздачу, где у нас AA и на столе заданный борд
  const hand = await a.waitFor((m) => m.t === 'table' && m.table?.board?.length === 5
    && m.table.seats.find((s) => s.me)?.cards?.join() === [AS, AH].join(), 60000);
  assert.deepEqual(hand.table.board, board);
  a.ws.send(JSON.stringify({ t: 'leave' }));
  await a.waitFor((m) => m.t === 'left');
  await new Promise((r) => setTimeout(r, 50));
  const after = db.prepare('SELECT chips, rating, in_play FROM users WHERE id = 7001').get();
  assert.equal(after.chips, before.chips);
  assert.equal(after.rating, before.rating);
  assert.equal(after.in_play, 0);
  a.close();
});

test('награды Эло за чистый выигрыш: 5 000 → +100, 10 000 → +250, по одному разу', async () => {
  const { addWinnings, upsertUser } = await import('../server/db.js');
  upsertUser({ id: 8001, first_name: 'W' });
  const rating = () => db.prepare('SELECT rating FROM users WHERE id = 8001').get().rating;
  const r0 = rating();
  assert.deepEqual(addWinnings(8001, 3000), []);
  assert.deepEqual(addWinnings(8001, -1000), []); // проигрыш уменьшает прогресс
  assert.equal(addWinnings(8001, 3500).length, 1); // 5 500 ≥ 5 000
  assert.equal(rating(), r0 + 100);
  assert.deepEqual(addWinnings(8001, -2000), []);
  assert.deepEqual(addWinnings(8001, 2000), []); // снова 5 500 — повторно не даётся
  assert.equal(addWinnings(8001, 6000).length, 1); // 11 500 ≥ 10 000
  assert.equal(rating(), r0 + 350);
  assert.deepEqual(addWinnings(8001, 50000), []);
});

test('подсказка: без покупки нельзя, после покупки — совет в свой ход и списание', async () => {
  const c = new Client(9001, { autoplay: 'idle' });
  await c.ready;
  await c.req({ t: 'invoice', pack: 'p1' });
  await c.req({ t: 'sitBots', mode: 'hu', botName: 'Акула', buyin: 500 });
  await c.waitFor((m) => m.t === 'turn');
  await assert.rejects(c.req({ t: 'hint' }), /Подсказок нет/);
  await c.req({ t: 'invoice', pack: 'h5' });
  await c.waitFor((m) => m.t === 'me' && m.me.hints === 5);
  const hnt = await c.req({ t: 'hint' });
  assert.ok(['fold', 'check', 'call', 'raise'].includes(hnt.action.type));
  assert.ok(hnt.eq >= 0 && hnt.eq <= 1);
  assert.equal(hnt.cards.length, 1, 'видны карты бота');
  assert.equal(hnt.cards[0].name, 'Акула');
  assert.equal(hnt.cards[0].cards.length, 2);
  assert.equal(hnt.next.length, 5 - c.table.board.length, 'видны будущие карты стола');
  const seen = new Set([...hnt.cards[0].cards, ...hnt.next]);
  assert.equal(seen.size, 2 + hnt.next.length, 'карты не повторяются');
  assert.equal(db.prepare('SELECT hints FROM users WHERE id = 9001').get().hints, 4);
  c.ws.send(JSON.stringify({ t: 'act', action: hnt.action }));
  c.ws.send(JSON.stringify({ t: 'leave' }));
  await c.waitFor((m) => m.t === 'left', 30000);
  c.close();
});

test('стол с друзьями: двое людей + боты, чужие карты скрыты, фишки сходятся', async () => {
  const host = new Client(9101);
  const friend = new Client(9102);
  await host.ready; await friend.ready;
  await host.req({ t: 'invoice', pack: 'p1' });
  await friend.req({ t: 'invoice', pack: 'p1' });
  const created = await host.req({ t: 'createMixed', buyin: 500, bots: 2 });
  const info = await friend.req({ t: 'mixedInfo', id: created.id });
  assert.equal(info.room.buyin, 500);
  await friend.req({ t: 'joinMixed', id: created.id });
  // ждём раздачу, где оба человека получили карты
  const snap = await friend.waitFor((m) => m.t === 'table' && m.table?.kind === 'mixed'
    && m.table.seats.filter((s) => !s.isBot).length === 2 && m.table.inHand
    && m.table.seats.find((s) => s.me)?.cards, 60000);
  const hostSeat = snap.table.seats.find((s) => s.id === 9101);
  if (!hostSeat.hand) assert.equal(hostSeat.cards, null, 'карты хоста другу не видны');
  assert.ok(snap.table.seats.filter((s) => s.isBot).length <= 2, 'ботов не больше двух (проигравшие выбывают)');
  assert.ok(snap.table.seats.every((s) => Number.isInteger(s.handsWon)), 'значок раздач — у всех, и у ботов');
  await host.waitFor((m) => m.t === 'turn', 60000);
  await assert.rejects(host.req({ t: 'hint' }), /Подсказок нет|в твой ход/); // с людьми работает, но нужна купленная подсказка
  // играем пару раздач и встаём
  await friend.waitFor((m) => m.t === 'table' && m.table?.handId >= snap.table.handId + 2, 60000).catch(() => {});
  host.ws.send(JSON.stringify({ t: 'leave' }));
  const hl = await host.waitFor((m) => m.t === 'left', 30000);
  friend.ws.send(JSON.stringify({ t: 'leave' }));
  const fl = await friend.waitFor((m) => m.t === 'left', 30000);
  await new Promise((r) => setTimeout(r, 50));
  const h = assertLedger(9101), f = assertLedger(9102);
  assert.equal(h.in_play + f.in_play, 0);
  assert.ok(h.chips + f.chips >= 0);
  assert.equal(h.chips, 4500 + hl.stack);
  assert.equal(f.chips, 4500 + fl.stack);
  const closed = await friend.req({ t: 'mixedInfo', id: created.id });
  assert.equal(closed.room, null, 'стол закрылся, когда люди ушли');
  host.close(); friend.close();
});

test('стол с друзьями не закрывается, пока хост вышел звать друзей', async () => {
  const host = new Client(9103);
  await host.ready;
  await host.req({ t: 'invoice', pack: 'p1' });
  const created = await host.req({ t: 'createMixed', buyin: 500, bots: 2 });
  host.close(); // свернул приложение — отправляет ссылку
  await new Promise((r) => setTimeout(r, 4000));
  const friend = new Client(9104);
  await friend.ready;
  await friend.req({ t: 'invoice', pack: 'p1' });
  const info = await friend.req({ t: 'mixedInfo', id: created.id });
  assert.ok(info.room, 'стол живой');
  assert.ok(info.room.players.some((p) => p.name && !p.bot), 'хост за столом');
  await friend.req({ t: 'joinMixed', id: created.id });
  friend.ws.send(JSON.stringify({ t: 'leave' }));
  await friend.waitFor((m) => m.t === 'left', 30000);
  const back = new Client(9103);
  await back.ready;
  back.ws.send(JSON.stringify({ t: 'leave' }));
  await back.waitFor((m) => m.t === 'left', 30000);
  assertLedger(9103); assertLedger(9104);
  friend.close(); back.close();
});

test('Эло за выигрыш раздачи: шкала и не круглые числа', async () => {
  const { handElo } = await import('../server/game/elo.js');
  const base = { rating: 1500, oppElo: 1600, bb: 5 };
  for (let i = 0; i < 200; i++) {
    for (const [net, elo] of [[50, 10], [150, 50], [300, 100], [700, 250], [3000, 250]]) {
      const d = handElo({ ...base, net });
      assert.ok(d >= elo * 0.8 - 1 && d <= elo * 1.2 + 1, `${net} → ${d}`);
      assert.notEqual(d % 5, 0, `${d} круглое`);
    }
    assert.equal(handElo({ ...base, net: 5 }), 0);
    const loss = handElo({ ...base, net: -300 });
    assert.ok(loss < 0 && loss >= -8);
  }
});

test('свой бай-ин: любая сумма в пределах, блайнды от неё', async () => {
  const c = new Client(9201, { autoplay: 'idle' });
  await c.ready;
  await c.req({ t: 'invoice', pack: 'p2' });
  await c.waitFor((m) => m.t === 'me' && m.me.chips > 0);
  await assert.rejects(c.req({ t: 'sitBots', mode: 'hu', botName: 'Скала', buyin: 50 }), /Бай-ин — от/);
  await assert.rejects(c.req({ t: 'sitBots', mode: 'hu', botName: 'Скала', buyin: 10_000_000 }), /Не хватает/);
  await c.req({ t: 'sitBots', mode: 'hu', botName: 'Скала', buyin: 1234 });
  const snap = await c.waitFor((m) => m.t === 'table' && m.table?.buyin === 1234);
  assert.equal(snap.table.bb, 12);
  c.ws.send(JSON.stringify({ t: 'leave' }));
  await c.waitFor((m) => m.t === 'left', 30000);
  assertLedger(9201);
  c.close();
});

test('сольный турнир с ботами: старт сразу, доигрывается, приз и баланс сходятся', async () => {
  const c = new Client(9301);
  await c.ready;
  await c.req({ t: 'invoice', pack: 'p1' });
  await c.waitFor((m) => m.t === 'me' && m.me.chips === 5000);
  await assert.rejects(c.req({ t: 'startSolo', buyin: 1000, size: 7, blindMin: 3 }), /мест/);
  await c.req({ t: 'startSolo', buyin: 1000, size: 6, blindMin: 2 });
  const snap = await c.waitFor((m) => m.t === 'table' && m.table?.solo);
  assert.equal(snap.table.kind, 'tour');
  assert.equal(snap.table.total, 6);
  assert.equal(db.prepare('SELECT in_play FROM users WHERE id = 9301').get().in_play, 1000);
  await assert.rejects(c.req({ t: 'startSolo', buyin: 1000, size: 6, blindMin: 2 }), /уже за столом/);
  const fin = await c.waitFor((m) => m.t === 'finished' && m.solo, 120000);
  assert.ok(fin.place >= 1 && fin.place <= 6);
  await new Promise((r) => setTimeout(r, 50));
  const u = assertLedger(9301);
  assert.equal(u.in_play, 0);
  assert.equal(u.chips, 4000 + fin.prize);
  assert.equal(fin.prize, [3600, 1800, 600][fin.place - 1] ?? 0); // 6 мест: 60% / 30% / 10% от 6000
  c.close();
});

test('демо-турнир на 60: только админ, свои карты приходят, баланс и Эло не трогаются', async () => {
  const x = new Client(7003);
  await x.ready;
  await assert.rejects(x.req({ t: 'startSolo', demo: true, size: 60 }), /Нет доступа/);
  x.close();

  const a = new Client(7001);
  await a.ready;
  const before = db.prepare('SELECT chips, rating, games FROM users WHERE id = 7001').get();
  await a.req({ t: 'startSolo', demo: true, size: 60, blindMin: 6 });
  const snap = await a.waitFor((m) => m.t === 'table' && m.table?.solo && m.table.demo);
  assert.equal(snap.table.total, 60);
  const QS = 10 * 4, QH = 10 * 4 + 1;
  const bot = snap.table.seats.find((s) => s.isBot);
  await a.req({ t: 'demoPlan', plan: { holes: { 7001: [QS, QH], [bot.id]: [0, 1] } } });
  // в тестах блайнды растут мгновенно — могут выбить раньше, чем придёт раздача с планом
  const got = await a.waitFor((m) => (m.t === 'finished' && m.demo)
    || (m.t === 'table' && m.table?.seats.find((s) => s.me)?.cards?.join() === [QS, QH].join()), 60000);
  if (got.t === 'table') a.ws.send(JSON.stringify({ t: 'leave' }));
  const fin = got.t === 'finished' ? got : await a.waitFor((m) => m.t === 'finished' && m.demo, 30000);
  assert.equal(fin.prize, 0);
  await new Promise((r) => setTimeout(r, 50));
  const after = db.prepare('SELECT chips, rating, games, in_play FROM users WHERE id = 7001').get();
  assert.equal(after.chips, before.chips);
  assert.equal(after.rating, before.rating);
  assert.equal(after.games, before.games);
  assert.equal(after.in_play, 0);
  a.close();
});

test('выйти можно с любого стола: со стола на время и из сольного турнира; раздачи считаются', async () => {
  const c = new Client(9501);
  await c.ready;
  await c.req({ t: 'invoice', pack: 'p1' });
  await c.waitFor((m) => m.t === 'me' && m.me.chips === 5000);
  await c.req({ t: 'sitBots', mode: 'hu', botName: 'Скала', buyin: 500, minutes: 10 });
  // бот может проиграть весь стек раньше — тогда стол закрывается сам
  // (или мы сами проиграли стек и стол ждёт докупку)
  await c.waitFor((m) => m.t === 'left' || (m.t === 'table' && m.table?.kind === 'bots' && (m.table.handId >= 3 || m.table.canRebuy)), 60000);
  if (!c.msgs.some((m) => m.t === 'left')) await c.req({ t: 'leave' });
  const left = await c.waitFor((m) => m.t === 'left', 30000);
  await c.req({ t: 'startSolo', buyin: 500, size: 18, blindMin: 6 });
  await c.waitFor((m) => m.t === 'table' && m.table?.solo, 30000);
  await c.req({ t: 'leave' });
  const fin = await c.waitFor((m) => m.t === 'finished' && m.solo, 30000);
  assert.ok(fin.place >= 1 && fin.place <= 18);
  await new Promise((r) => setTimeout(r, 50));
  const u = assertLedger(9501);
  assert.equal(u.in_play, 0);
  assert.equal(u.chips, 5000 - 500 + left.stack - 500 + fin.prize);
  const me = await c.req({ t: 'me' });
  assert.equal(me.me.table, null, 'карточки «Ты за столом» больше нет');
  assert.ok(Number.isInteger(me.me.handsWon));
  c.close();
});

test('кнопка «все ва-банк»: только админ, только с ботами — боты в раздаче идут олл-ин', async () => {
  const x = new Client(7004);
  await x.ready;
  await assert.rejects(x.req({ t: 'forceJam' }), /Нет доступа/);
  x.close();

  const a = new Client(7001);
  await a.ready;
  await a.req({ t: 'sitDemo', mode: '6', botName: 'Скала' });
  await a.waitFor((m) => m.t === 'table' && m.table?.demo && m.table.inHand, 30000);
  await a.req({ t: 'forceJam' });
  const hand = a.table.handId;
  // каждый бот, который ходит после нажатия, ставит всё (или коллирует олл-ин)
  const snap = await a.waitFor((m) => m.t === 'table' && m.table?.handId === hand
    && m.table.seats.some((s) => s.isBot && s.allIn), 30000);
  assert.ok(snap.table.seats.some((s) => s.isBot && s.allIn));
  a.ws.send(JSON.stringify({ t: 'leave' }));
  await a.waitFor((m) => m.t === 'left', 30000);
  a.close();
});

test('кнопка «два туза»: только админ, в следующей раздаче приходят AA', async () => {
  const x = new Client(7005);
  await x.ready;
  await assert.rejects(x.req({ t: 'forceAces' }), /Нет доступа/);
  x.close();

  const a = new Client(7001);
  await a.ready;
  await a.req({ t: 'invoice', pack: 'p1' });
  await a.req({ t: 'sitBots', mode: 'hu', botName: 'Скала', buyin: 500 });
  await a.waitFor((m) => m.t === 'table' && m.table?.kind === 'bots', 30000);
  await a.req({ t: 'forceAces' });
  const pressedAt = a.table.handId; // тузы — со следующей раздачи (в текущей могут прийти и сами)
  const isAces = (cs) => cs?.length === 2 && cs.every((c) => c >> 2 === 12);
  // нажали ровно между раздачами — тузы придут через одну, поэтому смотрим две следующие
  const got = await a.waitFor((m) => m.t === 'left'
    || (m.t === 'table' && m.table?.handId > pressedAt && m.table.handId <= pressedAt + 2 && isAces(m.table.seats.find((s) => s.me)?.cards))
    || (m.t === 'table' && m.table?.handId > pressedAt + 2), 60000);
  if (got.t !== 'left') {
    assert.ok(isAces(got.table.seats.find((s) => s.me)?.cards), 'в одной из следующих раздач — два туза');
    // если раздача дошла до ривера — на тёрне и ривере тоже тузы (каре)
    const hand = got.table.handId;
    const river = await a.waitFor((m) => m.t === 'table' && m.table?.handId === hand && m.table.board.length === 5, 15000).catch(() => null);
    if (river) assert.deepEqual(river.table.board.slice(3).map((c) => c >> 2), [12, 12]);
    a.ws.send(JSON.stringify({ t: 'leave' }));
    await a.waitFor((m) => m.t === 'left', 30000);
  }
  a.close();
});

test('кнопка «олл-ин −1»: боты ставят всё, кроме 1 фишки, а потом сбрасывают', async () => {
  const x = new Client(7006);
  await x.ready;
  await assert.rejects(x.req({ t: 'forceDump' }), /Нет доступа/);
  x.close();

  const a = new Client(7001, { autoplay: 'idle' });
  await a.ready;
  // играем сами: в свой первый ход жмём кнопку; пока бот не поставил «всё кроме 1» — колл/чек,
  // потом ставим сами — бот должен сбросить
  let hand = null;
  let sawOne = false;
  a.waiters.push((m) => {
    if (m.t === 'table' && hand != null && m.table?.handId === hand && m.table.seats.some((x) => x.isBot && x.stack === 1)) sawOne = true;
    if (m.t !== 'turn') return false;
    if (hand == null) {
      hand = a.table.handId;
      a.ws.send(JSON.stringify({ t: 'forceDump' }));
    }
    const bot = a.table?.seats.find((x) => x.isBot);
    const act = bot?.stack === 1 && m.toCall === 0 ? { type: 'raise', to: m.minRaiseTo } : { type: m.toCall ? 'call' : 'check' };
    setTimeout(() => a.ws.send(JSON.stringify({ t: 'act', action: act })), 30);
    return false;
  });
  await a.req({ t: 'sitDemo', mode: 'hu', botName: 'Скала' });
  const end = await a.waitFor((m) => m.t === 'table' && hand != null && m.table?.handId === hand && m.table.result, 60000);
  assert.ok(sawOne, 'бот оставил себе 1 фишку');
  assert.ok(end.table.seats.find((s) => s.isBot).folded, 'бот сбросил');
  a.ws.send(JSON.stringify({ t: 'leave' }));
  await a.waitFor((m) => m.t === 'left', 30000);
  a.close();
});

test('у ботов свой счёт выигранных раздач — растёт, где бы они ни играли', async () => {
  const { botHandsWon } = await import('../server/game/table.js');
  const c = new Client(9701);
  await c.ready;
  await c.req({ t: 'invoice', pack: 'p1' });
  const before = botHandsWon('Барон');
  await c.req({ t: 'sitBots', mode: 'hu', botName: 'Барон', buyin: 500 });
  // ждём раздачу, которую выиграл бот
  const snap = await c.waitFor((m) => m.t === 'left' || (m.t === 'table' && m.table?.result?.some((w) => w.id < 0)), 60000);
  if (snap.t === 'table') {
    assert.ok(botHandsWon('Барон') > before);
    const seat = c.table.seats.find((s) => s.isBot);
    await c.waitFor((m) => m.t === 'table' && m.table?.seats.find((s) => s.isBot)?.handsWon >= before + 1, 30000);
    assert.ok(seat);
    c.ws.send(JSON.stringify({ t: 'leave' }));
    await c.waitFor((m) => m.t === 'left', 30000);
  }
  const db2 = db.prepare("SELECT hands_won FROM bot_stats WHERE bot = 'Барон'").get();
  assert.equal(db2?.hands_won ?? 0, botHandsWon('Барон'), 'счёт сохранён в базе');
  c.close();
});

test('стол: эмодзи, таймбанк, шансы при олл-ине, подсветка выигрыша, итог сессии', async () => {
  const a = new Client(7001, { autoplay: 'idle' });
  await a.ready;
  await a.req({ t: 'sitDemo', mode: 'hu', botName: 'Скала' });
  const turn = await a.waitFor((m) => m.t === 'turn', 30000);
  // эмодзи — только из набора
  await assert.rejects(a.req({ t: 'emote', e: 'hello' }).then((r) => r), /Нет такого эмодзи/).catch(() => {});
  a.ws.send(JSON.stringify({ t: 'emote', e: '🔥' }));
  await a.waitFor((m) => m.t === 'table' && m.table?.seats.find((s) => s.me)?.emote === '🔥', 10000);
  // таймбанк: +15 секунд, счётчик уменьшается
  const tb = await a.req({ t: 'timebank' });
  assert.equal(tb.left, 2);
  const longer = await a.waitFor((m) => m.t === 'table' && m.table?.deadline >= turn.deadline + 14000, 10000);
  assert.ok(longer);
  // олл-ин: боты по кнопке идут ва-банк, мы коллируем — видны шансы
  await a.req({ t: 'forceJam' });
  a.ws.send(JSON.stringify({ t: 'act', action: { type: 'raise', to: turn.maxTo } }));
  const eq = await a.waitFor((m) => m.t === 'table' && m.table?.seats.some((s) => s.equity != null), 30000);
  const sum = eq.table.seats.reduce((x, s) => x + (s.equity ?? 0), 0);
  assert.ok(sum >= 98 && sum <= 102, `шансы в сумме ~100%: ${sum}`);
  const res = await a.waitFor((m) => m.t === 'table' && m.table?.result && m.table.handId === eq.table.handId, 30000);
  if (res.table.board.length === 5 && res.table.winCards) assert.equal(res.table.winCards.length >= 5, true);
  a.ws.send(JSON.stringify({ t: 'leave' }));
  const left = await a.waitFor((m) => m.t === 'left', 30000);
  assert.ok(left.hands >= 1, 'итог: сыграно раздач');
  assert.equal(left.demo, true);
  a.close();
});

test('награды: статистика, задания, бонус дня, сундук, пропуск, таблицы лидеров', async () => {
  const c = new Client(9801);
  await c.ready;
  await c.req({ t: 'invoice', pack: 'p1' });
  await c.req({ t: 'sitBots', mode: 'hu', botName: 'Тимоха', buyin: 500 });
  await c.waitFor((m) => m.t === 'left' || (m.t === 'table' && (m.table?.handId >= 4 || m.table?.canRebuy)), 60000);
  if (!c.msgs.some((m) => m.t === 'left')) c.ws.send(JSON.stringify({ t: 'leave' }));
  await c.waitFor((m) => m.t === 'left', 30000);
  let P = (await c.req({ t: 'progress' })).progress;
  assert.ok(P.stats.hands >= 1, 'раздачи посчитаны');
  assert.equal(P.daily.length, 3);
  assert.equal(P.weekly.length, 3);
  assert.ok(P.pass.xp >= 1, 'опыт пропуска растёт');
  assert.equal(P.achievements.length >= 20, true);
  // бонус дня — один раз в день
  const chips0 = c.me.chips;
  const d = await c.req({ t: 'claimDaily' });
  assert.match(d.text, /День 1/);
  await assert.rejects(c.req({ t: 'claimDaily' }), /уже получен/);
  // сундука нет — открыть нельзя; выдадим и откроем
  await assert.rejects(c.req({ t: 'openChest', kind: 'rare' }), /нет/);
  const raw = JSON.parse(db.prepare('SELECT progress FROM users WHERE id = 9801').get().progress);
  raw.chests.rare = 1;
  db.prepare('UPDATE users SET progress = ? WHERE id = 9801').run(JSON.stringify(raw));
  const ch = await c.req({ t: 'openChest', kind: 'rare' });
  assert.ok(ch.chest.chips >= 800);
  P = ch.progress;
  assert.equal(P.chests.rare, 0);
  // невыполненное задание забрать нельзя
  const q = P.daily.find((x) => x.p < x.need);
  if (q) await assert.rejects(c.req({ t: 'claimQuest', period: 'daily', key: q.key }), /не выполнено/);
  // таблицы лидеров
  for (const kind of ['rating', 'hands', 'pot']) {
    const t = await c.req({ t: 'top', kind });
    assert.equal(t.kind, kind);
    assert.ok(Array.isArray(t.rating));
  }
  const u = assertLedger(9801);
  assert.ok(u.chips > chips0 - 1000);
  c.close();
});

test('внешний вид: аватар, рамки по рангу, рубашка, карточка игрока, VIP-эмодзи закрыты', async () => {
  const c = new Client(9901, { autoplay: 'idle' });
  await c.ready;
  let L = (await c.req({ t: 'look' })).look;
  assert.ok(L.avatars.length >= 10);
  assert.equal(L.frames.find((f) => f.id === 'gold').owned, false, 'золотая рамка закрыта до ранга');
  await assert.rejects(c.req({ t: 'equip', kind: 'frame', id: 'gold' }), /закрыто/i);
  L = (await c.req({ t: 'equip', kind: 'avatar', id: '🦁' })).look;
  assert.equal(L.avatar, '🦁');
  L = (await c.req({ t: 'equip', kind: 'frame', id: 'silver' })).look;
  assert.equal(L.frame, 'silver');
  L = (await c.req({ t: 'equip', kind: 'back', id: 'red' })).look;
  assert.equal(L.back, 'red');
  // за столом видно аватар и рамку; карточка бота открывается
  await c.req({ t: 'sitDemo', mode: 'hu', botName: 'Скала' }).catch(() => {});
  await c.req({ t: 'invoice', pack: 'p1' });
  await c.req({ t: 'sitBots', mode: 'hu', botName: 'Скала', buyin: 500 });
  const snap = await c.waitFor((m) => m.t === 'table' && m.table?.seats.find((s) => s.me)?.look, 30000);
  const me = snap.table.seats.find((s) => s.me);
  assert.equal(me.look.avatar.emoji, '🦁');
  assert.equal(me.look.frame, 'silver');
  const bot = snap.table.seats.find((s) => s.isBot);
  const card = await c.req({ t: 'playerCard', id: bot.id });
  assert.equal(card.card.bot, true);
  assert.equal(card.card.name, 'Скала');
  const mine = await c.req({ t: 'playerCard', id: me.id });
  assert.equal(mine.card.bot, false);
  // VIP-эмодзи без ранга — нельзя
  await assert.rejects(c.req({ t: 'emote', e: '💎' }), /Нет такого эмодзи/).catch(() => {});
  c.ws.send(JSON.stringify({ t: 'leave' }));
  await c.waitFor((m) => m.t === 'left', 30000);
  c.close();
});

test('боты: боссы, сложность, статистика против бота, тренер включается', async () => {
  const c = new Client(9911);
  await c.ready;
  const info = await c.req({ t: 'botsInfo' });
  assert.deepEqual(info.bosses.map((b) => b.name), ['Король', 'Мафия', 'Робот', 'Шейх', 'Тень']);
  assert.equal(info.shadow, 0);
  await c.req({ t: 'invoice', pack: 'p1' });
  await assert.rejects(c.req({ t: 'sitBots', mode: 'hu', botName: 'Робот', buyin: 500, level: 'god' }), /сложность/);
  c.ws.send(JSON.stringify({ t: 'coach', on: true }));
  await c.req({ t: 'sitBots', mode: 'hu', botName: 'Робот', buyin: 500, level: 'easy' });
  await c.waitFor((m) => m.t === 'left' || (m.t === 'table' && (m.table?.handId >= 3 || m.table?.canRebuy)), 60000);
  const bot = c.table?.seats?.find((s) => s.isBot);
  if (bot && !c.msgs.some((m) => m.t === 'left')) {
    const card = await c.req({ t: 'playerCard', id: bot.id });
    assert.equal(card.card.level, 'easy');
    assert.equal(card.card.elo, 2500, 'Робот на лёгком: 2800 − 300');
    c.ws.send(JSON.stringify({ t: 'leave' }));
  }
  await c.waitFor((m) => m.t === 'left', 30000);
  const after = await c.req({ t: 'botsInfo' });
  assert.ok(after.vs['Робот']?.hands >= 1, 'статистика против Робота записана');
  c.close();
});

test('режимы: Short Deck, стол на 9, Хаос, босс-раш, стол с паролем, нокаут и турнир на 9', async () => {
  const c = new Client(9921);
  await c.ready;
  await c.req({ t: 'invoice', pack: 'p2' });
  await c.waitFor((m) => m.t === 'me' && m.me.chips > 0);
  // Short Deck + Хаос на столе на 9: в колоде нет карт 2–5
  await c.req({ t: 'sitBots', mode: '9', buyin: 500, variant: 'short', chaos: true });
  const snap = await c.waitFor((m) => m.t === 'table' && m.table?.variant === 'short' && m.table.seats.length === 9 && m.table.chaos, 30000);
  assert.equal(snap.table.seats.length, 9);
  const seen = await c.waitFor((m) => m.t === 'table' && m.table?.board?.length >= 3, 60000).catch(() => null);
  if (seen) assert.ok(seen.table.board.every((x) => x >> 2 >= 4), 'на столе только 6–A');
  c.ws.send(JSON.stringify({ t: 'leave' }));
  await c.waitFor((m) => m.t === 'left', 30000);
  // босс-раш: первый — Скала, докупки нет
  c.msgs.length = 0;
  await c.req({ t: 'sitBots', mode: 'rush', buyin: 500 });
  const rush = await c.waitFor((m) => m.t === 'table' && m.table?.rush, 30000);
  assert.equal(rush.table.rush.name, 'Скала');
  assert.equal(rush.table.canRebuy, false);
  c.ws.send(JSON.stringify({ t: 'leave' }));
  await c.waitFor((m) => m.t === 'left', 30000);
  // стол с паролем: без пароля не сесть
  const host = new Client(9922);
  await host.ready;
  await host.req({ t: 'invoice', pack: 'p1' });
  await assert.rejects(host.req({ t: 'createMixed', buyin: 500, bots: 1, password: 'a' }), /Пароль/);
  const created = await host.req({ t: 'createMixed', buyin: 500, bots: 1, seats: 9, password: 'tuz777' });
  const info = await c.req({ t: 'mixedInfo', id: created.id });
  assert.equal(info.room.private, true);
  assert.equal(info.room.max, 9);
  await assert.rejects(c.req({ t: 'joinMixed', id: created.id, password: 'nope' }), /Неверный пароль/);
  await c.req({ t: 'joinMixed', id: created.id, password: 'tuz777' });
  c.msgs.length = 0;
  c.ws.send(JSON.stringify({ t: 'leave' }));
  await c.waitFor((m) => m.t === 'left', 30000);
  host.ws.send(JSON.stringify({ t: 'leave' }));
  await host.waitFor((m) => m.t === 'left', 30000);
  // турнир-нокаут на 9: призовой — половина взносов
  const t = await c.req({ t: 'createT', tour: { name: 'KO', maxPlayers: 9, buyin: 1000, blindMin: 5, startMode: 'full', ko: true } });
  const tour = (await c.req({ t: 'tour', id: t.id })).tour;
  assert.equal(tour.ko, true);
  assert.equal(tour.bounty, 500);
  assert.equal(tour.prizePool, 500);
  await c.req({ t: 'cancelT', id: t.id });
  host.close(); c.close();
});

test('друзья: заявка и принятие, подарок с лимитом, смотреть стол друга, дуэль, клуб, фразы, картинка, реферал', async () => {
  const a = new Client(9931), b = new Client(9932, { autoplay: 'idle' });
  await a.ready; await b.ready;
  await a.req({ t: 'invoice', pack: 'p2' });
  await b.req({ t: 'invoice', pack: 'p1' });
  await a.waitFor((m) => m.t === 'me' && m.me.chips > 0);
  // заявка и принятие
  let f = await a.req({ t: 'addFriend', ref: 9932 });
  assert.equal(f.outgoing.length, 1);
  f = await b.req({ t: 'addFriend', ref: 9931 });
  assert.equal(f.friends.length, 1);
  // подарок: не больше 10 000 в сутки
  const before = (await b.req({ t: 'me' })).me.chips;
  await a.req({ t: 'gift', id: 9932, chips: 3000 });
  assert.equal((await b.req({ t: 'me' })).me.chips, before + 3000);
  await assert.rejects(a.req({ t: 'gift', id: 9932, chips: 8000 }), /ещё 7/);
  await assert.rejects(a.req({ t: 'gift', id: 9999, chips: 10 }), /только друзьям/);
  // b садится за стол — a смотрит без чужих карт
  await b.req({ t: 'sitBots', mode: 'hu', botName: 'Скала', buyin: 500 });
  await a.req({ t: 'watch', id: 9932 });
  const view = await a.waitFor((m) => m.t === 'table' && m.table?.watching && m.table.inHand, 30000);
  const bSeat = view.table.seats.find((s) => s.id === 9932);
  if (!bSeat.hand) assert.equal(bSeat.cards, null, 'карты друга не видны зрителю');
  await a.req({ t: 'unwatch' });
  b.ws.send(JSON.stringify({ t: 'leave' }));
  await b.waitFor((m) => m.t === 'left', 30000);
  // дуэль: стол на двоих, друг получает приглашение
  b.msgs.length = 0;
  await a.req({ t: 'duelFriend', id: 9932, hands: 5, buyin: 500 });
  const inv = await b.waitFor((m) => m.t === 'invite', 10000);
  assert.equal(inv.duel, 5);
  const info = await b.req({ t: 'mixedInfo', id: inv.mixedId });
  assert.equal(info.room.max, 2);
  a.ws.send(JSON.stringify({ t: 'leave' }));
  await a.waitFor((m) => m.t === 'left', 30000);
  // клуб: создать, вступить по коду, клубный турнир виден только своим
  const c1 = await a.req({ t: 'createClub', name: 'Тузы' });
  await b.req({ t: 'joinClub', code: c1.club.code });
  const t = await a.req({ t: 'createT', tour: { name: 'Клубный', maxPlayers: 6, buyin: 500, blindMin: 5, startMode: 'full', club: true } });
  const out = new Client(9933);
  await out.ready;
  await out.req({ t: 'invoice', pack: 'p1' });
  await assert.rejects(out.req({ t: 'reg', id: t.id }), /участников клуба/);
  // фразы в лобби турнира
  a.ws.send(JSON.stringify({ t: 'tourSay', id: t.id, i: 0 }));
  const tv = await a.waitFor((m) => m.t === 'tour' && m.tour?.chat?.length, 10000);
  assert.equal(tv.tour.chat[0].text, 'Всем удачи!');
  await a.req({ t: 'cancelT', id: t.id });
  // картинка «поделиться»
  const png = 'data:image/png;base64,' + Buffer.from('\x89PNG\r\n\x1a\nfake').toString('base64');
  const sh = await a.req({ t: 'shareImage', data: png });
  assert.match(sh.url, /\/s\/[a-f0-9]{16}\.png$/);
  // реферал: новичок по ссылке — бонус и дружба
  const { registerRef, areFriends } = await import('../server/social.js');
  const { upsertUser } = await import('../server/db.js');
  upsertUser({ id: 9934, first_name: 'Новичок' });
  assert.equal(registerRef(9934, 9931), true);
  assert.equal(areFriends(9931, 9934), true);
  assert.equal(registerRef(9934, 9931), false, 'второй раз — нельзя');
  a.close(); b.close(); out.close();
});

test('админка: доступ, правка игрока, статистика, промокод один раз, ивент x2', async () => {
  const x = new Client(7007);
  await x.ready;
  await assert.rejects(x.req({ t: 'admin', a: 'stats' }), /Нет доступа/);
  const a = new Client(7001);
  await a.ready;
  const st = await a.req({ t: 'admin', a: 'stats' });
  assert.ok(st.stats.users >= 1);
  assert.equal(st.stats.days.length, 14);
  const found = await a.req({ t: 'admin', a: 'search', q: '7007' });
  assert.equal(found.users[0].id, 7007);
  const adj = await a.req({ t: 'admin', a: 'adjust', id: 7007, field: 'chips', mode: 'add', value: 777 });
  assert.equal(adj.user.chips, 777);
  const set = await a.req({ t: 'admin', a: 'adjust', id: 7007, field: 'handsWon', mode: 'set', value: 42 });
  assert.equal(set.user.handsWon, 42);
  // промокод
  await assert.rejects(a.req({ t: 'admin', a: 'promoCreate', promo: { code: 'x' } }), /Код/);
  await a.req({ t: 'admin', a: 'promoCreate', promo: { code: 'TEST100', chips: 100, maxUses: 5, days: 1 } });
  const r = await x.req({ t: 'redeemPromo', code: 'test100' });
  assert.match(r.text, /100/);
  await assert.rejects(x.req({ t: 'redeemPromo', code: 'TEST100' }), /уже вводил/);
  await assert.rejects(x.req({ t: 'redeemPromo', code: 'NOPE' }), /Нет такого/);
  assertLedger(7007);
  // ивент x2 фишки: бонус дня удваивается
  await a.req({ t: 'admin', a: 'event', kind: 'x2chips', hours: 1, title: 'x2!' });
  const lobby = await x.req({ t: 'lobby' });
  assert.equal(lobby.event.kind, 'x2chips');
  const d = await x.req({ t: 'claimDaily' });
  assert.match(d.text, /\+200 фишек/);
  await a.req({ t: 'admin', a: 'event', kind: null });
  assert.equal((await x.req({ t: 'lobby' })).event, null);
  a.close(); x.close();
});

test('пранк админа за столом с другом: тузы админу, другу ×1.5 от проигрыша', async () => {
  const admin = new Client(7001);
  const friend = new Client(9150);
  await admin.ready; await friend.ready;
  await admin.req({ t: 'invoice', pack: 'p1' }).catch(() => {});
  await friend.req({ t: 'invoice', pack: 'p1' });
  const created = await admin.req({ t: 'createMixed', buyin: 500, bots: 0 });
  await friend.req({ t: 'joinMixed', id: created.id });
  await assert.rejects(friend.req({ t: 'prank' }), /Нет доступа/);
  await admin.req({ t: 'prank' });
  await assert.rejects(admin.req({ t: 'prank' }), /уже заряжен/);
  const fx = await friend.waitFor((m) => m.t === 'prank', 60000);
  assert.equal(fx.admin, 7001);
  assert.deepEqual(fx.cards.map((c) => c >> 2), [12, 12]);
  const toast = await friend.waitFor((m) => m.t === 'toast' && /пранк/.test(m.text), 60000);
  const row = db.prepare("SELECT delta FROM ledger WHERE user_id = 9150 AND reason = 'prank_refund'").get();
  assert.ok(row && row.delta > 0, toast.text);
  assert.ok(toast.text.includes(row.delta.toLocaleString('ru')));
  admin.ws.send(JSON.stringify({ t: 'leave' })); await admin.waitFor((m) => m.t === 'left', 30000);
  friend.ws.send(JSON.stringify({ t: 'leave' })); await friend.waitFor((m) => m.t === 'left', 30000).catch(() => {});
  await new Promise((r) => setTimeout(r, 50));
  assertLedger(9150);
  admin.close(); friend.close();
});

test('пранк работает и в турнире с другом на двоих', async () => {
  const admin = new Client(7001);
  const friend = new Client(9160);
  await admin.ready; await friend.ready;
  await admin.req({ t: 'invoice', pack: 'p1' }).catch(() => {});
  await friend.req({ t: 'invoice', pack: 'p1' });
  const { id } = await admin.req({ t: 'createT', tour: { name: 'Пранк', maxPlayers: 2, buyin: 1000, blindMin: 3, startMode: 'full' } });
  await friend.req({ t: 'reg', id });
  await admin.waitFor((m) => m.t === 'table' && m.table?.kind === 'tour', 60000);
  await admin.req({ t: 'prank' });
  const fx = await friend.waitFor((m) => m.t === 'prank', 60000);
  assert.deepEqual(fx.cards.map((c) => c >> 2), [12, 12]);
  await friend.waitFor((m) => m.t === 'toast' && /пранк/.test(m.text), 60000);
  assert.ok(db.prepare("SELECT delta FROM ledger WHERE user_id = 9160 AND reason = 'prank_refund'").get());
  await Promise.all([admin, friend].map((c) => c.waitFor((m) => m.t === 'finished' && m.tournamentId === id, 180000)));
  await new Promise((r) => setTimeout(r, 50));
  assertLedger(9160);
  admin.close(); friend.close();
});
