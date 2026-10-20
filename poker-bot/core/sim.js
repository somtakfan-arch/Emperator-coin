// Прогон ботов друг против друга.
//   node sim.js                         — 5 элитных ботов, 2000 раздач
//   node sim.js 500 --log               — с логом первых раздач
//   node sim.js 3000 --seed 42          — воспроизводимый прогон
//   node sim.js 3000 --lineup Акула,Охотник,v1:Акула,v1:Маньяк,station
//
// В составе: имена элиты (Скала, Акула, Маньяк, Охотник, Хамелеон),
// v1:<имя> — первая версия, station / aggro / nit / random — эксплойт-боты.
import { Table } from './engine.js';
import { BOT_CLASSES } from './bots.js';
import { V1_CLASSES, CallingStation, Aggressor, Nit, RandomBot } from './benchmarks.js';
import { cardStr, handName } from './cards.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const HANDS = Number(args.find((a) => /^\d+$/.test(a))) || 2000;
const LOG = args.includes('--log');
const seed = flag('--seed') != null ? Number(flag('--seed')) : Date.now() % 1e9;
const ITERS = Number(flag('--iters')) || 300;
const lineup = (flag('--lineup') || 'Скала,Акула,Маньяк,Охотник,Хамелеон').split(',');

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(seed);

function makeBot(token) {
  const opts = { rng, iters: ITERS };
  const t = token.trim();
  if (t === 'station') return new CallingStation();
  if (t === 'aggro') return new Aggressor();
  if (t === 'nit') return new Nit();
  if (t === 'random') return new RandomBot(rng);
  if (t.startsWith('v1:')) {
    const C = V1_CLASSES.find((C) => new C(opts).name === t.slice(3));
    if (!C) throw new Error(`нет v1-бота ${t}`);
    const b = new C({ rng, iters: 160 });
    b.name += ' v1';
    return b;
  }
  const C = BOT_CLASSES.find((C) => new C(opts).name === t);
  if (!C) throw new Error(`нет бота ${t}`);
  return new C(opts);
}

const BB = 10, BUYIN = 1000;
const players = lineup.map((tok, i) => {
  const bot = makeBot(tok);
  bot.id = i;
  return { id: i, name: bot.name, stack: BUYIN, bot, invested: BUYIN, vpip: 0, pfr: 0 };
});
const byId = (id) => players[id];

let logLeft = LOG ? 6 : 0;
const table = new Table({
  players, smallBlind: BB / 2, bigBlind: BB, rng,
  onEvent(e) {
    if (e.type === 'action' && e.street === 'preflop') {
      const p = byId(e.id);
      if (p.lastHand !== e.handId) { p.lastHand = e.handId; p.flagV = p.flagR = false; }
      if ((e.action === 'call' || e.action === 'raise') && !p.flagV) { p.flagV = true; p.vpip++; }
      if (e.action === 'raise' && !p.flagR) { p.flagR = true; p.pfr++; }
    }
    if (!logLeft) return;
    if (e.type === 'handStart') console.log(`\n=== Раздача #${e.handId} ===`);
    if (e.type === 'street') console.log(`  -- ${e.street}: ${e.board.map(cardStr).join(' ')}`);
    if (e.type === 'action') {
      const p = byId(e.id);
      const what = e.action === 'raise' ? `рейз до ${e.to}` : e.action === 'call' ? `колл ${e.added}` : e.action === 'check' ? 'чек' : 'фолд';
      console.log(`  ${p.name.padEnd(12)} ${what}${e.allIn ? ' (олл-ин)' : ''}`);
    }
    if (e.type === 'showdown') {
      for (const r of e.reveals) console.log(`  ${byId(r.id).name.padEnd(12)} показывает ${r.cards.map(cardStr).join(' ')} — ${handName(r.score)}`);
    }
    if (e.type === 'handEnd') {
      for (const w of e.winners) console.log(`  >> ${byId(w.id).name} забирает ${w.amount}`);
      logLeft--;
    }
  },
});

const t0 = Date.now();
for (let h = 0; h < HANDS; h++) {
  for (const p of players) {
    // кэш-игра: стек ниже 100 бб — докупаемся до 100 бб
    if (p.stack < BUYIN) { p.invested += BUYIN - p.stack; p.stack = BUYIN; }
  }
  await table.playHand();
}
const sec = (Date.now() - t0) / 1000;

console.log(`\n${HANDS} раздач, сид ${seed}, ${sec.toFixed(1)} c\n`);
const rows = players
  .map((p) => {
    const s = p.bot.stats;
    return {
      Бот: p.name,
      'бб/100': +(((p.stack - p.invested) / BB / HANDS) * 100).toFixed(1),
      VPIP: pct(p.vpip / HANDS),
      PFR: pct(p.pfr / HANDS),
      Блефов: s.bluffs,
      'Блеф прошёл': s.bluffs ? pct(s.bluffWins / s.bluffs) : '-',
      'Поймал блеф': `${s.heroWins}/${s.heroCalls}`,
    };
  })
  .sort((a, b) => b['бб/100'] - a['бб/100']);
console.table(rows);

function pct(x) {
  return `${Math.round(x * 100)}%`;
}
