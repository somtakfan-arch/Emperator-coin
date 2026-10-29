// Расчёты для красоты за столом: шансы при олл-ине, ауты, выигрышные 5 карт.
import { evaluate, handCategory } from '../../core/cards.js';

// Шансы каждого игрока, когда карты всех известны (олл-ин до ривера).
// Тёрн и ривер — точный перебор, флоп и префлоп — Монте-Карло.
export function knownEquity(holes, board) {
  const ids = Object.keys(holes);
  const used = new Set([...board, ...ids.flatMap((id) => holes[id])]);
  const rest = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) rest.push(c);
  const need = 5 - board.length;
  const win = Object.fromEntries(ids.map((id) => [id, 0]));
  let total = 0;
  const score = (full) => {
    let best = -1, who = [];
    for (const id of ids) {
      const v = evaluate(holes[id].concat(full));
      if (v > best) { best = v; who = [id]; } else if (v === best) who.push(id);
    }
    for (const id of who) win[id] += 1 / who.length;
    total++;
  };
  if (need === 0) score(board);
  else if (need === 1) for (const a of rest) score(board.concat(a));
  else if (need === 2) {
    for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) score(board.concat(rest[i], rest[j]));
  } else {
    for (let it = 0; it < 2000; it++) {
      const pick = new Set();
      while (pick.size < need) pick.add(rest[(Math.random() * rest.length) | 0]);
      score(board.concat([...pick]));
    }
  }
  return Object.fromEntries(ids.map((id) => [id, Math.round((win[id] / total) * 100)]));
}

// Лучшие 5 карт из 7 — их подсвечиваем у победителя.
export function bestFive(cards) {
  let best = -1, pick = cards.slice(0, 5);
  const n = cards.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const five = cards.filter((_, i) => i !== a && i !== b);
    if (five.length !== 5) continue;
    const v = evaluate(five);
    if (v > best) { best = v; pick = five; }
  }
  return n <= 5 ? cards.slice() : pick;
}

// Ауты: карты, которые улучшают ТВОЮ руку до комбинации старше
// (и не просто ложатся на стол всем — улучшение должно быть твоим).
export function outs(hole, board) {
  if (board.length < 3 || board.length > 4) return [];
  const used = new Set([...hole, ...board]);
  const cur = handCategory(evaluate(hole.concat(board)));
  const res = [];
  for (let c = 0; c < 52; c++) {
    if (used.has(c)) continue;
    const mine = handCategory(evaluate(hole.concat(board, c)));
    const boardOnly = handCategory(evaluate(board.concat(c)));
    if (mine > cur && mine > boardOnly) res.push(c);
  }
  return res;
}
