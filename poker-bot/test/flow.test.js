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
  await c.waitFor((m) => m.t === 'table' && (m.table?.handId >= 3 || m.table?.canRebuy));
  let rebuys = 0;
  if (c.table.canRebuy) {
    // колл-станцию Акула обыгрывает быстро — проверим докупку
    await c.req({ t: 'rebuy' });
    rebuys = 1;
  }
  // чужие карты не видны (кроме вскрытия — там их показывают всем)
  const opp = c.table.seats.find((s) => !s.me);
  if (c.table.inHand && !opp.hand) assert.equal(opp.cards, null);
  await assert.rejects(c.req({ t: 'sitBots', mode: 'hu', botName: 'Акула', buyin: 500 }), /уже за столом/);
  c.ws.send(JSON.stringify({ t: 'leave' }));
  const left = await c.waitFor((m) => m.t === 'left');
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

test('стол на время: встать нельзя, по окончании закрывается сам с итогом', async () => {
  const c = new Client(5001);
  await c.ready;
  await c.req({ t: 'invoice', pack: 'p1' });
  await assert.rejects(c.req({ t: 'sitBots', mode: 'hu', botName: 'Скала', buyin: 500, minutes: 7 }), /Неверное время/);
  await c.req({ t: 'sitBots', mode: '6', buyin: 500, minutes: 10 });
  await c.waitFor((m) => m.t === 'table' && m.table?.locked);
  await assert.rejects(c.req({ t: 'leave' }), /стол на время/);
  // свободного выхода нет — проверим, что стол всё ещё идёт
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(c.table && !c.msgs.some((m) => m.t === 'left'));
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
  assert.equal(snap.table.seats.filter((s) => s.isBot).length, 2);
  await host.waitFor((m) => m.t === 'turn', 60000);
  await assert.rejects(host.req({ t: 'hint' }), /только с ботами|с ботами/);
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
