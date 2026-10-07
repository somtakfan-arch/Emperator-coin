// Настройки на этом устройстве (localStorage): избранное, алерты, звук, фон, обучение.
const KEY = "bedx.prefs.v1";
const defaults = { favs: [], alerts: [], sound: true, bg: "night", tourDone: false, notifs: [] };
let state = { ...defaults };
try { state = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { /* приватный режим */ }

const listeners = new Set();
export const prefs = () => state;
export function setPref(k, v) {
  state = { ...state, [k]: v };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((cb) => cb(state));
}
export const onPrefs = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };

export const isFav = (symbol) => state.favs.includes(symbol);
export const toggleFav = (symbol) =>
  setPref("favs", isFav(symbol) ? state.favs.filter((s) => s !== symbol) : [...state.favs, symbol]);
