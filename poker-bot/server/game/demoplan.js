// Выбор карт для демо (только админ, для видео): проверка плана и раскладка колоды.

// План на следующую раздачу: { holes: { [id]: [c1, c2] }, board: [до 5 карт] }
export function checkPlan(players, plan) {
  const ids = new Set(players.map((p) => p.id));
  const holes = {};
  const all = [];
  for (const [id, cards] of Object.entries(plan?.holes || {})) {
    if (!ids.has(Number(id))) throw new Error('Нет такого игрока');
    if (!Array.isArray(cards) || cards.length !== 2) throw new Error('Игроку нужно ровно 2 карты');
    holes[Number(id)] = cards.map(Number);
    all.push(...holes[Number(id)]);
  }
  const board = (plan?.board || []).map(Number);
  if (board.length > 5) throw new Error('На столе максимум 5 карт');
  all.push(...board);
  if (all.some((c) => !Number.isInteger(c) || c < 0 || c > 51)) throw new Error('Неверная карта');
  if (new Set(all).size !== all.length) throw new Error('Одна карта выбрана дважды');
  return all.length ? { holes, board } : null;
}

// Колода раскладывается в порядке раздачи движка: карты игроков, сжиг, флоп, сжиг, тёрн, сжиг, ривер
export function arrangeDeck(plan, deck, ids) {
  if (!plan) return deck;
  const fixed = new Set([...Object.values(plan.holes).flat(), ...plan.board]);
  const rest = deck.filter((c) => !fixed.has(c));
  const seq = [];
  for (const id of ids) {
    const h = plan.holes[id];
    seq.push(h ? h[0] : rest.pop(), h ? h[1] : rest.pop());
  }
  const b = plan.board;
  seq.push(rest.pop(), b[0] ?? rest.pop(), b[1] ?? rest.pop(), b[2] ?? rest.pop());
  seq.push(rest.pop(), b[3] ?? rest.pop());
  seq.push(rest.pop(), b[4] ?? rest.pop());
  return rest.concat(seq.reverse()); // движок берёт с конца
}
