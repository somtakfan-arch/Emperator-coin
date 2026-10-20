// Монте-Карло эквити против диапазонов соперников.
// opp = { threshold: 0..1 — минимальная сила руки, с которой он так играет,
//         bluff: 0..1 — шанс, что он делает это с любым мусором }
import { evaluate, preflopPct, postflopStrength, boardContext } from './cards.js';

const TRIES = 8;

export function equity(hole, board, opps, iters = 250, rng = Math.random) {
  if (!opps.length) return 1;
  const used = new Set([...hole, ...board]);
  const base = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) base.push(c);
  const ctx = board.length ? boardContext(board) : null;
  const strength = (h) => (ctx ? postflopStrength(h, board, ctx).s : preflopPct(h));
  const need = 5 - board.length;
  const full = board.slice();
  const myHand = hole.slice();
  const oppHands = opps.map(() => [0, 0]);
  let total = 0;

  for (let it = 0; it < iters; it++) {
    const pool = base.slice();
    let n = pool.length;
    for (let k = 0; k < opps.length; k++) {
      const o = opps[k];
      const anyHand = o.threshold <= 0 || rng() < (o.bluff || 0);
      let best = null, bestS = -1, ok = false;
      for (let t = 0; t < (anyHand ? 1 : TRIES); t++) {
        const i = (rng() * n) | 0;
        [pool[i], pool[n - 1]] = [pool[n - 1], pool[i]];
        const j = (rng() * (n - 1)) | 0;
        [pool[j], pool[n - 2]] = [pool[n - 2], pool[j]];
        if (anyHand) { ok = true; break; }
        const h = [pool[n - 1], pool[n - 2]];
        const s = strength(h);
        if (s >= o.threshold) { ok = true; break; }
        if (s > bestS) { bestS = s; best = h; }
      }
      if (!ok) {
        // ни одна попытка не прошла фильтр — берём сильнейшую из найденных
        for (let q = 0; q < 2; q++) {
          const idx = pool.indexOf(best[q], 0);
          [pool[idx], pool[n - 1 - q]] = [pool[n - 1 - q], pool[idx]];
        }
      }
      oppHands[k][0] = pool[n - 1];
      oppHands[k][1] = pool[n - 2];
      n -= 2;
    }
    for (let b = 0; b < need; b++) {
      const i = (rng() * n) | 0;
      [pool[i], pool[n - 1]] = [pool[n - 1], pool[i]];
      full[board.length + b] = pool[n - 1];
      n--;
    }
    const mine = evaluate(myHand.concat(full));
    let bestOpp = -1, ties = 0;
    for (const h of oppHands) {
      const v = evaluate(h.concat(full));
      if (v > bestOpp) { bestOpp = v; ties = 0; }
      if (v === bestOpp) ties++;
    }
    if (mine > bestOpp) total += 1;
    else if (mine === bestOpp) total += 1 / (ties + 1);
  }
  return total / iters;
}
