// Казино: 15 игр. Через WebSocket — каждая игра и её ошибки; напрямую — тысячи раундов:
// баланс сходится с журналом, деньги не появляются из воздуха, отдача в разумных пределах.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';

process.env.DEV = '1';
process.env.SPEED = '0';
process.env.ADMIN_IDS = '7001';
process.env.PROGRESS_REWARDS = '0';
process.env.CRASH_BET_MS = '700';
process.env.CRASH_PAUSE_MS = '200';
process.env.PORT = String(4700 + Math.floor(Math.random() * 500));
process.env.DATA_DIR = mkdtempSync(tmpdir() + '/casino-test-');

let srv, db, C, credit;
before(async () => {
  srv = await import('../server/index.js');
  ({ db, credit } = await import('../server/db.js'));
  C = await import('../server/casino.js');
  await new Promise((r) => setTimeout(r, 200));
});
after(() => { srv.server.close(); setTimeout(() => process.exit(0), 100); });

class Client {
  constructor(id) {
    this.msgs = []; this.waiters = []; this.rid = 0;
    this.ws = new WebSocket(`ws://localhost:${process.env.PORT}/ws`);
    this.ws.on('message', (raw) => { const m = JSON.parse(raw); this.msgs.push(m); if (m.t === 'me' || m.t === 'hello') this.me = m.me; this.waiters = this.waiters.filter((w) => !w(m)); });
    this.ready = new Promise((r) => this.ws.on('open', r)).then(() => this.req({ t: 'auth', dev: { id, name: `C${id}` } }));
  }
  req(msg) {
    const rid = ++this.rid;
    return new Promise((resolve, reject) => {
      this.waiters.push((m) => { if (m.rid !== rid) return false; m.t === 'error' ? reject(new Error(m.text)) : resolve(m); return true; });
      this.ws.send(JSON.stringify({ ...msg, rid }));
    });
  }
  waitFor(pred, ms = 20000) {
    const hit = this.msgs.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('таймаут')), ms); this.waiters.push((m) => (pred(m) ? (clearTimeout(t), resolve(m), true) : false)); });
  }
  close() { this.ws.close(); }
}
const chips = (id) => db.prepare('SELECT chips FROM users WHERE id = ?').get(id).chips;
function ledgerOk(id) {
  const l = db.prepare('SELECT COALESCE(SUM(delta), 0) AS s FROM ledger WHERE user_id = ?').get(id).s;
  assert.equal(chips(id), l, `журнал и баланс у ${id}`);
  const h = db.prepare('SELECT COALESCE(SUM(win - bet), 0) AS s FROM casino_hist WHERE user_id = ?').get(id).s;
  const c = db.prepare("SELECT COALESCE(SUM(delta), 0) AS s FROM ledger WHERE user_id = ? AND reason = 'casino'").get(id).s;
  assert.equal(h, c, `история казино и журнал у ${id}`);
}

test('все 15 игр через сервер: ставки, выигрыши, ошибки, журнал', async () => {
  const c = new Client(5001);
  await c.ready;
  credit(5001, 1_000_000, 'test');
  const P = (m) => { if (process.env.CDBG) console.log("P", JSON.stringify(m)); return c.req({ t: "casino", ...m }); };
  // общие ошибки
  await assert.rejects(P({ game: 'nope' }), /Нет такой игры/);
  await assert.rejects(P({ game: 'coin', side: 'h', bet: 5 }), /от 10/);
  await assert.rejects(P({ game: 'coin', side: 'h', bet: 10.5 }), /от 10/);
  await assert.rejects(P({ game: 'coin', side: 'h', bet: -100 }), /от 10/);
  await assert.rejects(P({ game: 'coin', side: 'h', bet: 2e9 }), /большая/);
  await assert.rejects(P({ game: 'coin', side: 'x', bet: 100 }), /орёл/);
  await assert.rejects(P({ game: 'coin', side: 'h', bet: 999_999_999 }), /Не хватает/);
  ledgerOk(5001);

  // 1 рулетка
  const r1 = await P({ game: 'roulette', bets: [{ k: 'n', v: 17, a: 100 }, { k: 'red', a: 50 }, { k: 'dozen', v: 2, a: 30 }, { k: 'col', v: 3, a: 20 }] });
  assert.ok(r1.result >= 0 && r1.result <= 36);
  const x = r1.result;
  const exp = (x === 17 ? 3600 : 0) + (C.RED.has(x) ? 100 : 0) + (x > 0 && Math.ceil(x / 12) === 2 ? 90 : 0) + (x > 0 && (x - 1) % 3 === 2 ? 60 : 0);
  assert.equal(r1.win, exp);
  await assert.rejects(P({ game: 'roulette', bets: [] }), /Поставь/);
  await assert.rejects(P({ game: 'roulette', bets: [{ k: 'n', v: 37, a: 100 }] }), /Непонятная/);
  await assert.rejects(P({ game: 'roulette', bets: [{ k: 'zz', a: 100 }] }), /Непонятная/);

  // 2 блэкджек: играем до конца, повторная раздача во время игры — ошибка
  for (let i = 0; i < 30; i++) {
    let s = await P({ game: 'blackjack', a: 'deal', bet: 100 });
    if (!s.over) await assert.rejects(P({ game: 'blackjack', a: 'deal', bet: 100 }), /доиграй/);
    let guard = 0;
    while (!s.over && guard++ < 20) {
      const me = s.hands[s.cur];
      const a = s.canSplit && i % 3 === 0 ? 'split' : s.canDouble && i % 5 === 0 ? 'double' : me.total < 17 ? 'hit' : 'stand';
      s = await P({ game: 'blackjack', a });
    }
    assert.ok(s.over, 'блэкджек закончился');
    assert.equal(s.dealer.length >= 2, true);
  }
  await assert.rejects(P({ game: 'blackjack', a: 'hit' }), /не начата/);

  // 3 слоты
  const sl = await P({ game: 'slots', bet: 100 });
  assert.equal(sl.grid.length, 9);
  // 4 кости
  await assert.rejects(P({ game: 'dice', target: 99, bet: 100 }), /от 2 до 98/);
  const d = await P({ game: 'dice', target: 50, over: true, bet: 100 });
  assert.equal(d.ok, d.roll >= 50); assert.equal(d.win, d.ok ? 196 : 0);
  // 5 краш — общий раунд: смотрим, ставим с авто-выводом, ждём взрыва; вторая ставка в раунде — ошибка
  const w0 = await P({ game: 'crash', a: 'watch' });
  assert.ok(['bet', 'fly', 'crashed'].includes(w0.phase) && Array.isArray(w0.hist));
  const betPhase = () => c.waitFor((m) => m.t === 'crashRound' && m.phase === 'bet' && !c.msgs.some((x) => x.t === 'crashRound' && x.id === m.id && x.mine), 20000);
  c.msgs = c.msgs.filter((m) => m.t !== 'crashRound');
  const rb = await betPhase();
  const placed = await P({ game: 'crash', a: 'bet', bet: 100, auto: 1.01 });
  assert.equal(placed.mine.bet, 100);
  await assert.rejects(P({ game: 'crash', a: 'bet', bet: 100 }), /уже поставил/);
  await assert.rejects(P({ game: 'crash', a: 'bet', bet: 100, auto: 0.5 }), /уже поставил|Авто-вывод/);
  const end = await c.waitFor((m) => m.t === 'crashRound' && m.id === rb.id && m.phase === 'crashed', 60000);
  assert.ok(end.C >= 1 && end.players.length >= 1);
  assert.equal(end.mine.cash ? end.mine.win : 0, end.C >= 1.01 ? 101 : 0, `авто ×1.01 при взрыве ×${end.C}`);
  // ручной вывод во время полёта
  c.msgs = c.msgs.filter((m) => m.t !== 'crashRound' && m.t !== 'crashTick');
  for (let tries = 0; tries < 8; tries++) {
    const r2 = await betPhase();
    await P({ game: 'crash', a: 'bet', bet: 100 });
    const tick = await c.waitFor((m) => (m.t === 'crashTick' && m.id === r2.id && m.k >= 3) || (m.t === 'crashRound' && m.id === r2.id && m.phase === 'crashed'), 60000);
    if (tick.t === 'crashRound') { c.msgs = c.msgs.filter((m) => m.t !== 'crashRound' && m.t !== 'crashTick'); continue; }
    const out = await P({ game: 'crash', a: 'cashout' }).catch((e) => ({ err: e.message }));
    if (out.err) { assert.match(out.err, /взорвалась/); c.msgs = c.msgs.filter((m) => m.t !== 'crashRound' && m.t !== 'crashTick'); continue; }
    assert.ok(out.cashed >= 1 && out.win === Math.floor(100 * out.cashed));
    await assert.rejects(P({ game: 'crash', a: 'cashout' }), /Уже забрал/);
    break;
  }
  await assert.rejects(P({ game: 'crash', a: 'cashout' }), /Уже забрал|ставки нет|взорвалась/);
  // 6 мины
  await assert.rejects(P({ game: 'mines', a: 'start', mines: 25, bet: 100 }), /от 1 до 24/);
  let mn = await P({ game: 'mines', a: 'start', mines: 3, bet: 100 });
  await assert.rejects(P({ game: 'mines', a: 'cashout' }), /хотя бы одну/);
  for (let cell = 0; cell < 25 && !mn.over; cell++) {
    mn = await P({ game: 'mines', a: 'open', cell });
    if (!mn.over && mn.opened.length >= 3) mn = await P({ game: 'mines', a: 'cashout' });
  }
  assert.ok(mn.over && mn.bombs.length === 3);
  // 7 плинко
  const pl = await P({ game: 'plinko', risk: 'high', bet: 100 });
  assert.equal(pl.path.length, 12); assert.equal(pl.win, Math.floor(100 * C.PLINKO.high[pl.slot]));
  // 8 монетка
  const cn = await P({ game: 'coin', side: 't', bet: 100 });
  assert.equal(cn.win, cn.ok ? 196 : 0);
  // 9 колесо
  const wh = await P({ game: 'wheel', bet: 100 });
  assert.equal(wh.win, Math.floor(100 * C.WHEEL[wh.i]));
  // 10 баккара
  await assert.rejects(P({ game: 'baccarat' }), /Поставь/);
  const bc = await P({ game: 'baccarat', player: 100, tie: 10 });
  assert.ok(['p', 'b', 't'].includes(bc.w));
  // 11 хай-лоу
  let hl = await P({ game: 'hilo', a: 'start', bet: 100 });
  await assert.rejects(P({ game: 'hilo', a: 'cashout' }), /хотя бы раз/);
  hl = await P({ game: 'hilo', a: 'skip' });
  hl = await P({ game: 'hilo', a: (hl.card >> 2) >= 6 ? 'lo' : 'hi' });
  if (!hl.over) { hl = await P({ game: 'hilo', a: 'cashout' }); assert.ok(hl.win >= 100); }
  // 12 кено
  await assert.rejects(P({ game: 'keno', picks: [1, 1], bet: 100 }), /разных/);
  await assert.rejects(P({ game: 'keno', picks: [41], bet: 100 }), /разных/);
  const kn = await P({ game: 'keno', picks: [1, 2, 3, 4, 5], bet: 100 });
  assert.equal(kn.drawn.length, 10);
  assert.equal(kn.hits, [1, 2, 3, 4, 5].filter((n) => kn.drawn.includes(n)).length);
  // 13 видео-покер
  const vp = await P({ game: 'videopoker', a: 'deal', bet: 100 });
  assert.equal(vp.hand.length, 5);
  const vp2 = await P({ game: 'videopoker', a: 'draw', hold: [true, true, false, false, false] });
  assert.equal(vp2.hand[0], vp.hand[0]); assert.equal(new Set(vp2.hand).size, 5);
  await assert.rejects(P({ game: 'videopoker', a: 'draw', hold: [] }), /не начата/);
  // 14 башня
  let tw = await P({ game: 'tower', a: 'start', diff: 'easy', bet: 100 });
  await assert.rejects(P({ game: 'tower', a: 'pick', col: 4 }), /Нет такой/);
  tw = await P({ game: 'tower', a: 'pick', col: 0 });
  if (!tw.over) { tw = await P({ game: 'tower', a: 'cashout' }); assert.equal(tw.win, Math.floor(100 * C.towerMult('easy', 1))); }
  // 15 дракон и тигр
  const dt = await P({ game: 'dragontiger', dragon: 100 });
  assert.equal(dt.win, dt.w === 'd' ? 200 : dt.w === 't' ? 50 : 0);

  const info = await c.req({ t: 'casinoInfo' });
  assert.ok(info.hist.length >= 10 && info.my.length >= 10);
  ledgerOk(5001);
  c.close();
});

test('тысячи раундов напрямую: баланс сходится, отдача разумная, без отрицательного баланса', async () => {
  const uid = 5002;
  db.prepare('INSERT INTO users (id, name, chips, created) VALUES (?, ?, 0, ?)').run(uid, 'Sim', Date.now());
  credit(uid, 100_000_000, 'test');
  const res = {};
  const run = (game, n, mk, finish) => {
    let bet = 0, win = 0;
    for (let i = 0; i < n; i++) {
      let r = C.play(uid, mk(i));
      if (finish) r = finish(r);
      bet += r.bet; win += r.win;
    }
    res[game] = win / bet;
  };
  run('roulette', 3000, () => ({ game: 'roulette', bets: [{ k: 'red', a: 100 }] }));
  run('slots', 6000, () => ({ game: 'slots', bet: 100 }));
  run('dice', 3000, (i) => ({ game: 'dice', target: 10 + (i % 80), over: i % 2 === 0, bet: 100 }));
  run('coin', 3000, (i) => ({ game: 'coin', side: i % 2 ? 'h' : 't', bet: 100 }));
  run('wheel', 3000, () => ({ game: 'wheel', bet: 100 }));
  run('plinko', 3000, () => ({ game: 'plinko', risk: 'low', bet: 100 }));
  run('keno', 3000, () => ({ game: 'keno', picks: [3, 7, 11, 19], bet: 100 }));
  run('baccarat', 3000, () => ({ game: 'baccarat', banker: 100 }));
  run('dragontiger', 3000, () => ({ game: 'dragontiger', tiger: 100 }));
  run('blackjack', 3000, () => ({ game: 'blackjack', a: 'deal', bet: 100 }), (r) => {
    while (!r.over) { const hd = r.hands[r.cur]; r = C.play(uid, { game: 'blackjack', a: hd.total < 17 ? 'hit' : 'stand' }); }
    return r;
  });
  run('mines', 3000, () => ({ game: 'mines', a: 'start', mines: 3, bet: 100 }), (r) => {
    let k = 0;
    while (!r.over) r = k++ < 2 ? C.play(uid, { game: 'mines', a: 'open', cell: [...Array(25).keys()].find((c) => !r.opened.includes(c)) }) : C.play(uid, { game: 'mines', a: 'cashout' });
    return r;
  });
  run('tower', 3000, () => ({ game: 'tower', a: 'start', diff: 'mid', bet: 100 }), (r) => {
    while (!r.over) r = r.lvl < 2 ? C.play(uid, { game: 'tower', a: 'pick', col: 1 }) : C.play(uid, { game: 'tower', a: 'cashout' });
    return r;
  });
  run('hilo', 3000, () => ({ game: 'hilo', a: 'start', bet: 100 }), (r) => {
    while (!r.over) r = r.steps < 2 ? C.play(uid, { game: 'hilo', a: (r.card >> 2) >= 6 ? 'lo' : 'hi' }) : C.play(uid, { game: 'hilo', a: 'cashout' });
    return r;
  });
  run('videopoker', 3000, () => ({ game: 'videopoker', a: 'deal', bet: 100 }), (r) => {
    // держим пары и выше, иначе меняем всё
    const cnt = {}; for (const c of r.hand) cnt[c >> 2] = (cnt[c >> 2] || 0) + 1;
    const suits = {}; for (const c of r.hand) suits[c & 3] = (suits[c & 3] || 0) + 1;
    const fs = Object.entries(suits).find(([, k]) => k === 4)?.[0];
    const pair = r.hand.some((c) => cnt[c >> 2] >= 2);
    const hold = r.rank ? r.hand.map(() => true) : pair ? r.hand.map((c) => cnt[c >> 2] >= 2)
      : fs != null ? r.hand.map((c) => String(c & 3) === fs) : r.hand.map((c) => c >> 2 >= 9); // пара, флеш-дро, картинки
    return C.play(uid, { game: 'videopoker', a: 'draw', hold });
  });
  for (const [g, v] of Object.entries(res)) assert.ok(v > (g === 'videopoker' ? 0.6 : 0.75) && v < 1.15, `${g}: отдача ${v.toFixed(3)}`);
  console.log('отдача:', Object.entries(res).map(([g, v]) => `${g} ${(v * 100).toFixed(1)}%`).join(', '));
  ledgerOk(uid);
  assert.ok(chips(uid) > 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM casino_state WHERE user_id = ?').get(uid).n, 0, 'не осталось недоигранных');
});

test('логика: блэкджек-очки, баккара-правила, видео-покер, множители, точная отдача', () => {
  const card = (s) => '23456789TJQKA'.indexOf(s[0]) * 4 + 'shdc'.indexOf(s[1]);
  const cs = (str) => str.split(' ').map(card);
  assert.equal(C.bjTotal(cs('As Kd')).t, 21);
  assert.equal(C.bjTotal(cs('As Ad 9c')).t, 21);
  assert.equal(C.bjTotal(cs('As 5d Kc')).t, 16);
  assert.equal(C.vpRank(cs('Ts Js Qs Ks As')), 'royal');
  assert.equal(C.vpRank(cs('As 2d 3c 4h 5s')), 'straight');
  assert.equal(C.vpRank(cs('Js Jd 3c 4h 5s')), 'jacks');
  assert.equal(C.vpRank(cs('Ts Td 3c 4h 5s')), null);
  assert.equal(C.vpRank(cs('2s 2d 2c 4h 4s')), 'full');
  assert.equal(C.vpRank(cs('Ks Qs 3s 7s 9s')), 'flush');
  assert.equal(C.minesMult(1, 1), 1.01);
  assert.equal(C.minesMult(24, 1), 24.25);
  assert.equal(C.towerMult('hard', 1), 1.94);
  // краш: точка взрыва — 15% сразу, авто-вывод на любой множитель в плюс не выходит; линия доходит до C ровно в конце
  const pts = Array.from({ length: 100000 }, () => C.crashPoint());
  const surv = (x) => pts.filter((c) => c >= x).length / pts.length;
  assert.ok(Math.abs(pts.filter((c) => c === 1).length / pts.length - 0.15) < 0.01);
  for (const x of [1.5, 2, 5, 10, 25, 50]) assert.ok(surv(x) * x < 1.02, `краш авто ×${x}: ${surv(x) * x}`);
  assert.ok(surv(25) > 0.035);
  for (const c of [1, 1.3, 7, 40, 1000]) { const p = C.crashPath(c); assert.equal(p[p.length - 1], c); assert.ok(p.slice(0, -1).every((x) => x < c && x >= 1)); }
  for (let r = 0; r < 13; r++) for (const d of ['hi', 'lo']) assert.ok(C.hlStep(r, d) > 1, `хай-лоу: ${r} ${d} — выигрыш должен быть больше ставки`);
  // баккара: на большой выборке доли как у настоящей игры (игрок ~44.6%, банкир ~45.9%, ничья ~9.5%)
  const cnt = { p: 0, b: 0, t: 0 };
  for (let i = 0; i < 40000; i++) { const sh = Array.from({ length: 416 }, (_, k) => k % 52).sort(() => Math.random() - 0.5); cnt[C.baccaratDeal(sh).w]++; }
  assert.ok(Math.abs(cnt.p / 40000 - 0.446) < 0.015 && Math.abs(cnt.b / 40000 - 0.458) < 0.015, JSON.stringify(cnt));
  // точная отдача там, где её можно посчитать
  assert.ok(C.slotsRtp() > 0.93 && C.slotsRtp() < 0.98);
  for (const r of ['low', 'mid', 'high']) assert.ok(C.plinkoRtp(r) < 1 && C.plinkoRtp(r) > 0.97);
  for (let k = 1; k <= 10; k++) assert.ok(C.kenoRtp(k) > 0.92 && C.kenoRtp(k) < 0.98, `кено ${k}`);
  assert.ok(C.WHEEL.reduce((a, b) => a + b, 0) / C.WHEEL.length < 1);
});
