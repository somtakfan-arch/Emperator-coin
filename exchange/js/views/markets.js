// 1. Рынки — список пар, цена, изменение за 24ч, поиск.
import { PAIRS, onPrices, tickers } from "../market.js";
import { fmtPrice, fmtPct, fmtCompact } from "../format.js";
import { $, coinIcon, sourceBadge } from "../ui.js";

export default {
  render(el) {
    el.innerHTML = `
      <section class="page-head">
        <div>
          <h1 class="page-title">Рынки</h1>
          <p class="page-sub">Спот · пары к USDT <span id="src"></span></p>
        </div>
        <label class="search glass">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="q" type="search" placeholder="Поиск монеты" autocomplete="off" />
        </label>
      </section>
      <div class="chips" id="sortChips">
        <button class="chip active" data-s="vol">По объёму</button>
        <button class="chip" data-s="gain">Рост</button>
        <button class="chip" data-s="loss">Падение</button>
        <button class="chip" data-s="price">Цена</button>
        <button class="chip" data-s="az">А–Я</button>
      </div>
      <div class="glass market-table">
        <div class="mt-head">
          <span>Пара</span><span class="r">Цена</span><span class="r">24ч</span>
          <span class="r hide-m">Макс 24ч</span><span class="r hide-m">Мин 24ч</span><span class="r hide-m">Объём 24ч</span>
        </div>
        <div id="rows">
          ${PAIRS.map((p) => `
            <a class="mt-row" href="#/trade/${p.symbol}" data-symbol="${p.symbol}" data-search="${(p.base + " " + p.name).toLowerCase()}">
              <span class="pair-cell">${coinIcon(p)}<span><b>${p.base}</b><span class="muted">/USDT</span><small>${p.name}</small></span></span>
              <span class="r price" data-f="price">—</span>
              <span class="r"><span class="chg" data-f="chg">—</span></span>
              <span class="r hide-m muted" data-f="high">—</span>
              <span class="r hide-m muted" data-f="low">—</span>
              <span class="r hide-m muted" data-f="vol">—</span>
            </a>`).join("")}
        </div>
        <div class="empty" id="empty" hidden>Ничего не найдено</div>
      </div>`;

    const q = $("#q", el);
    q.oninput = () => {
      const v = q.value.trim().toLowerCase();
      let shown = 0;
      el.querySelectorAll(".mt-row").forEach((r) => {
        const ok = !v || r.dataset.search.includes(v);
        r.hidden = !ok;
        shown += ok;
      });
      $("#empty", el).hidden = shown > 0;
    };

    // сортировка
    let sortBy = "vol", lastSort = 0;
    const SORTS = {
      vol: (a, b) => (tickers[b.symbol]?.quoteVolume ?? 0) - (tickers[a.symbol]?.quoteVolume ?? 0),
      gain: (a, b) => (tickers[b.symbol]?.change ?? -1e9) - (tickers[a.symbol]?.change ?? -1e9),
      loss: (a, b) => (tickers[a.symbol]?.change ?? 1e9) - (tickers[b.symbol]?.change ?? 1e9),
      price: (a, b) => (tickers[b.symbol]?.price ?? 0) - (tickers[a.symbol]?.price ?? 0),
      az: (a, b) => a.base.localeCompare(b.base),
    };
    const resort = () => {
      lastSort = Date.now();
      const rows = $("#rows", el);
      [...PAIRS].sort(SORTS[sortBy]).forEach((p) => rows.append(rows.querySelector(`[data-symbol="${p.symbol}"]`)));
    };
    $("#sortChips", el).onclick = (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      sortBy = b.dataset.s;
      el.querySelectorAll("#sortChips .chip").forEach((c) => c.classList.toggle("active", c === b));
      resort();
    };

    return onPrices((tickers, source) => {
      if (Date.now() - lastSort > 5000) resort();
      $("#src", el).innerHTML = sourceBadge(source);
      for (const p of PAIRS) {
        const t = tickers[p.symbol];
        if (!t) continue;
        const row = el.querySelector(`[data-symbol="${p.symbol}"]`);
        const priceEl = row.querySelector('[data-f="price"]');
        const txt = fmtPrice(t.price);
        if (priceEl.textContent !== txt) {
          if (priceEl.textContent !== "—" && t.prev != null && t.prev !== t.price) {
            priceEl.classList.remove("flash-up", "flash-down");
            void priceEl.offsetWidth;
            priceEl.classList.add(t.price > t.prev ? "flash-up" : "flash-down");
          }
          priceEl.textContent = txt;
        }
        const chg = row.querySelector('[data-f="chg"]');
        chg.textContent = fmtPct(t.change);
        chg.className = `chg ${t.change >= 0 ? "up" : "down"}`;
        row.querySelector('[data-f="high"]').textContent = t.high != null ? fmtPrice(t.high) : "—";
        row.querySelector('[data-f="low"]').textContent = t.low != null ? fmtPrice(t.low) : "—";
        row.querySelector('[data-f="vol"]').textContent = t.quoteVolume != null ? fmtCompact(t.quoteVolume) : "—";
      }
    });
  },
};
