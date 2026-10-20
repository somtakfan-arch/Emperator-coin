// Дубликат-дуэль один на один: две параллельные игры с одинаковыми колодами,
// во второй боты сидят наоборот. Везение на картах почти сокращается —
// остаётся только разница в силе игры.
//   node duel.js Охотник v1:Охотник 2000
//   node duel.js Акула station 1000 --seed 3
import { Table } from './engine.js';
import { BOT_CLASSES } from './bots.js';
import { V1_CLASSES, CallingStation, Aggressor, Nit, RandomBot } from './benchmarks.js';

const args = process.argv.slice(2);
const [A, Bname] = args;
const HANDS = Number(args[2]) || 1000;
const si = args.indexOf('--seed');
const seed = si >= 0 ? Number(args[si + 1]) : Date.now() % 1e9;
const BB = 10, STACK = 1000;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeBot(t, rng) {
  if (t === 'station') return new CallingStation();
  if (t === 'aggro') return new Aggressor();
  if (t === 'nit') return new Nit();
  if (t === 'random') return new RandomBot(rng);
  const v1 = t.startsWith('v1:');
  const list = v1 ? V1_CLASSES : BOT_CLASSES;
  const name = v1 ? t.slice(3) : t;
  const C = list.find((C) => new C({}).name === name);
  if (!C) throw new Error(`нет бота ${t}`);
  return new C({ rng, iters: v1 ? 160 : 300 });
}

async function match(first, second, botRng) {
  const players = [first, second].map((tok, i) => {
    const bot = makeBot(tok, botRng);
    bot.id = i;
    return { id: i, name: tok, stack: STACK, bot };
  });
  const table = new Table({ players, smallBlind: BB / 2, bigBlind: BB, rng: botRng, deckRng: mulberry32(seed) });
  const net = [];
  for (let h = 0; h < HANDS; h++) {
    for (const p of players) p.stack = STACK;
    await table.playHand();
    net.push(players[0].stack - STACK); // результат первого места
  }
  return net;
}

const t0 = Date.now();
const m1 = await match(A, Bname, mulberry32(seed + 1)); // A на месте 0
const m2 = await match(Bname, A, mulberry32(seed + 2)); // B на месте 0 — те же карты
const pairs = m1.map((x, i) => x - m2[i]); // выигрыш A за пару раздач
const mean = pairs.reduce((a, b) => a + b, 0) / pairs.length;
const sd = Math.sqrt(pairs.reduce((a, b) => a + (b - mean) ** 2, 0) / pairs.length);
const bb100 = (mean / 2 / BB) * 100;
const err = ((sd / Math.sqrt(pairs.length)) / 2 / BB) * 100;
console.log(`${A} против ${Bname}: ${bb100 >= 0 ? '+' : ''}${bb100.toFixed(1)} бб/100 ± ${(err * 2).toFixed(1)} (95%), ${HANDS}×2 раздач, сид ${seed}, ${((Date.now() - t0) / 1000).toFixed(0)} с`);
