// Эло за раздачу против ботов.
// Выигрыш — по размеру чистого выигрыша в фишках, с разбросом ±20%, чтобы числа были не круглые:
//   10–99 → ~10, 100–249 → ~50, 250–499 → ~100, от 500 → ~250.
// Проигрыш — немного (до −8): чем сильнее бот, тем меньше снимают.
const WIN_STEPS = [
  { from: 500, elo: 250 },
  { from: 250, elo: 100 },
  { from: 100, elo: 50 },
  { from: 10, elo: 10 },
];

export function handElo({ rating, oppElo, net, bb }) {
  if (net > 0) {
    const step = WIN_STEPS.find((s) => net >= s.from);
    if (!step) return 0;
    let d = Math.round(step.elo * (0.8 + Math.random() * 0.4));
    if (d % 5 === 0) d += Math.random() < 0.5 ? 1 : -1; // не круглое
    return d;
  }
  const expected = 1 / (1 + 10 ** ((oppElo - rating) / 400));
  const k = Math.min(8, 2 + Math.abs(net) / bb / 10);
  return -k * expected;
}
