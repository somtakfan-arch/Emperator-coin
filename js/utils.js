/* Общие вспомогательные функции */

function clampNum(n, min, max) { return Math.max(min, Math.min(max, n)); }
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function chance(p) { return Math.random() < p; }

/** Масштабирует "базовую" сумму (рассчитанную под средний класс)
 *  под текущее благосостояние персонажа, чтобы решения ощущались
 *  соразмерно и у бомжа, и у миллиардера. */
function scaleByWealth(state, base) {
  const wealthRef = Math.max(Math.abs(state.money), 3000);
  const factor = clampNum(wealthRef / 150000, 0.12, 400);
  const result = Math.round((base * factor) / 10) * 10;
  return Math.max(result, 50);
}

function formatMoney(n) {
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(Math.round(n));
  return sign + abs.toLocaleString('ru-RU') + ' ₽';
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function getTier(money) {
  for (const t of window.TIERS) {
    if (money >= t.min && money < t.max) return t;
  }
  return money < 0 ? window.TIERS[0] : window.TIERS[window.TIERS.length - 1];
}
