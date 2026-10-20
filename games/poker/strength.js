// Сила каждой из 1326 комбинаций на текущей доске: перцентиль готовой руки
// среди всех возможных рук + бонус за дро. -1 — комбинация невозможна (карта на доске).
// Все боты за столом видят одну доску, поэтому результат кэшируется.
import { COMBOS, PRE_STRENGTH, evaluate, boardContext, handCategory, drawScore } from './cards.js';

const cache = new Map();

export function strengths(board) {
  if (!board.length) return PRE_STRENGTH;
  const key = board.join(',');
  const hit = cache.get(key);
  if (hit) return hit;

  const dead = new Set(board);
  const ctx = boardContext(board);
  const n = COMBOS.length;
  const vals = new Float64Array(n);
  const draw = new Float32Array(n);
  const live = [];
  const cards = board.slice();
  for (let i = 0; i < n; i++) {
    const [a, b] = COMBOS[i];
    if (dead.has(a) || dead.has(b)) continue;
    cards[board.length] = a;
    cards[board.length + 1] = b;
    vals[i] = evaluate(cards);
    if (board.length < 5) draw[i] = drawScore([a, b], ctx, handCategory(vals[i]));
    live.push(i);
  }
  live.sort((x, y) => vals[x] - vals[y]);
  const S = new Float32Array(n).fill(-1);
  const L = live.length;
  for (let k = 0; k < L; ) {
    let j = k;
    while (j + 1 < L && vals[live[j + 1]] === vals[live[k]]) j++;
    const pct = ((k + j) / 2 + 0.5) / L;
    for (let t = k; t <= j; t++) S[live[t]] = pct;
    k = j + 1;
  }
  // дро тянет руку вверх: флеш-дро на флопе играет как средняя пара
  for (const i of live) if (draw[i] > 0) S[i] += draw[i] * 1.6 * (1 - S[i]);

  if (cache.size > 64) cache.clear();
  cache.set(key, S);
  return S;
}
