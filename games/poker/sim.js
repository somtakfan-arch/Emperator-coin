// Прогон ботов друг против друга.
//   node sim.js            — 2000 раздач, итоговая таблица
//   node sim.js 500 --log  — 500 раздач + лог первых раздач
//   node sim.js 2000 --seed 42
import { Table } from './engine.js';
import { createBots } from './bots.js';
import { cardStr, handName } from './cards.js';

const args = process.argv.slice(2);
const HANDS = Number(args.find((a) => /^\d+$/.test(a))) || 2000;
const LOG = args.includes('--log');
const seedArg = args.indexOf('--seed');
const seed = seedArg >= 0 ? Number(args[seedArg + 1]) : Date.now() % 1e9;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(seed);

const BB = 10, BUYIN = 1000;
const bots = createBots({ rng, iters: 160 });
const players = bots.map((bot, i) => {
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
      console.log(`  ${p.name.padEnd(9)} ${what}${e.allIn ? ' (олл-ин)' : ''}`);
    }
    if (e.type === 'showdown') {
      for (const r of e.reveals) console.log(`  ${byId(r.id).name.padEnd(9)} показывает ${r.cards.map(cardStr).join(' ')} — ${handName(r.score)}`);
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
    // кэш-игра: вылетел — докупился на 100 бб
    if (p.stack < BB * 2) { p.stack += BUYIN; p.invested += BUYIN; }
  }
  table.playHand();
}
const sec = (Date.now() - t0) / 1000;

console.log(`\n${HANDS} раздач, сид ${seed}, ${sec.toFixed(1)} c\n`);
const rows = players
  .map((p) => {
    const s = p.bot.stats;
    return {
      Бот: p.name,
      'бб/100': (((p.stack - p.invested) / BB / HANDS) * 100).toFixed(1),
      VPIP: pct(p.vpip / HANDS),
      PFR: pct(p.pfr / HANDS),
      Блефов: s.bluffs,
      'Блеф прошёл': s.bluffs ? pct(s.bluffWins / s.bluffs) : '-',
      'Колл-ловля': `${s.heroWins}/${s.heroCalls}`,
      Ловушек: s.traps,
    };
  })
  .sort((a, b) => b['бб/100'] - a['бб/100']);
console.table(rows);

function pct(x) {
  return `${Math.round(x * 100)}%`;
}
