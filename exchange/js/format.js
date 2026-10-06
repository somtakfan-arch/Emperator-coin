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
  if (p >= 100) return 2;
  if (p >= 1) return 4;
  if (p >= 0.01) return 5;
  return 8;
}

export const fmtPrice = (p) => (p == null || isNaN(p) ? "—" : fix(nf(priceDecimals(p), priceDecimals(p)).format(p)));
export const fmtUsd = (v) => (v == null || isNaN(v) ? "—" : fix(nf(2, 2).format(v)));
export const fmtAmount = (v, max = 8) => (v == null || isNaN(v) ? "—" : fix(nf(0, max).format(v)));
export function fmtPct(v) {
  if (v == null || isNaN(v)) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${fix(nf(2, 2).format(Math.abs(v)))}%`;
}
export const fmtDate = (d) =>
  d ? new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

// 1 234 567 → 1.23M
export function fmtCompact(v) {
  if (v == null || isNaN(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toFixed(2);
}

// Парсинг ввода: принимает и запятую, и точку.
export const parseNum = (s) => {
  const v = parseFloat(String(s ?? "").replace(/\s/g, "").replace(",", "."));
  return isFinite(v) ? v : NaN;
};

// Значение для поля ввода без лишних нулей.
export const toInput = (v, max = 8) => (v > 0 && isFinite(v) ? String(+v.toFixed(max)) : "");
