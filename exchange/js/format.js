// Форматирование чисел. Пробел как разделитель тысяч, точка — дробная часть.
const cache = new Map();
function nf(min, max) {
  const key = `${min}-${max}`;
  if (!cache.has(key)) {
    cache.set(key, new Intl.NumberFormat("ru-RU", { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: true }));
  }
  return cache.get(key);
}
const fix = (s) => s.replace(/ | /g, " ").replace(",", ".");

// Сколько знаков показывать для цены.
export function priceDecimals(p) {
  if (p >= 1000) return 2;
  if (p >= 1) return 4;
  if (p >= 0.01) return 5;
  return 8;
}

export const fmtPrice = (p) => (p == null || isNaN(p) ? "—" : fix(nf(priceDecimals(p), priceDecimals(p)).format(p)));
export const fmtUsd = (v) => (v == null || isNaN(v) ? "—" : fix(nf(2, 2).format(v)));
export const fmtAmount = (v, max = 8) => (v == null || isNaN(v) ? "—" : fix(nf(0, max).format(v)));
export function fmtPct(v) {
  if (v == null || isNaN(v)) return "—";
  return `${v > 0 ? "+" : ""}${fix(nf(2, 2).format(v))}%`;
}
export const fmtDate = (d) =>
  d ? new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
