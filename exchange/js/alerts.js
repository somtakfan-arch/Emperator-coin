// Ценовые алерты: «скажи, когда BTC станет выше/ниже X». Работают, пока сайт открыт.
import { onPrices, pairBySymbol } from "./market.js";
import { prefs, setPref } from "./prefs.js";
import { toast } from "./ui.js";
import { sfx } from "./sound.js";
import { fmtPrice } from "./format.js";

export function addAlert(symbol, op, price) {
  const a = { id: Math.random().toString(36).slice(2), symbol, op, price, createdAt: Date.now() };
  setPref("alerts", [...prefs().alerts, a]);
  try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch { /* ignore */ }
  return a;
}
export const removeAlert = (id) => setPref("alerts", prefs().alerts.filter((a) => a.id !== id));

export function startAlerts() {
  return onPrices((tickers) => {
    const fired = [];
    for (const a of prefs().alerts) {
      const t = tickers[a.symbol];
      if (!t) continue;
      if ((a.op === ">" && t.price >= a.price) || (a.op === "<" && t.price <= a.price)) fired.push({ a, price: t.price });
    }
    if (!fired.length) return;
    setPref("alerts", prefs().alerts.filter((a) => !fired.some((f) => f.a.id === a.id)));
    for (const { a, price } of fired) {
      const text = `🔔 ${pairBySymbol(a.symbol)?.base}/USDT ${a.op === ">" ? "выше" : "ниже"} ${fmtPrice(a.price)} — сейчас ${fmtPrice(price)}`;
      toast(text, "ok");
      sfx.alert();
      try { if ("Notification" in window && Notification.permission === "granted") new Notification("Bed Exchange", { body: text, icon: "assets/icons/icon-192.png" }); } catch { /* ignore */ }
    }
  });
}
