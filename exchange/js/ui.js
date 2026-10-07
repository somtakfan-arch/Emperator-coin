// Мелкие UI-утилиты.
export const $ = (sel, root = document) => root.querySelector(sel);

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function toast(text, kind = "") {
  const box = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = text;
  box.append(el);
  setTimeout(() => el.remove(), 3800);
}

const ICONS = {
  markets: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
  trade: '<path d="M7 4v16M7 8h-2v6h2M17 4v16M17 10h-2v4h2"/>',
  nft: '<path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4z"/><path d="m7.5 15 3-3.5 2 2 1.5-1.5 2.5 3"/><circle cx="14.5" cy="9" r="1"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 14.5h2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  leaderboard: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3"/>',
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

export const coinIcon = (p, size = "") =>
  `<span class="coin ${size} ${p && p.glyph.length > 1 ? "two" : ""}" aria-hidden="true">${p ? p.glyph : "$"}</span>`;

export function sourceBadge(source) {
  const map = {
    binance: ["live", "Live · Binance"],
    coingecko: ["warn", "CoinGecko · обновление раз в 30 с"],
    offline: ["off", "Нет связи с биржей"],
    connecting: ["warn", "Подключение…"],
  };
  const [cls, text] = map[source] || map.connecting;
  return `<span class="src-badge ${cls}"><i></i>${text}</span>`;
}
