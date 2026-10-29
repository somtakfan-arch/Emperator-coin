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
