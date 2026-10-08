// 1. Рынки — список пар, цена, изменение за 24ч, поиск.
import { PAIRS, onPrices, tickers, fetchSpark, fetchFearGreed, usMarketOpen, usMarketHoursLocal, getStockSource } from "../market.js";
import { isFav, toggleFav, prefs } from "../prefs.js";
import { fmtPrice, fmtPct, fmtCompact } from "../format.js";
import { $, coinIcon, sourceBadge } from "../ui.js";

export default {
  render(el) {
    el.innerHTML = `
      <section class="page-head">
        <div>
          <h1 class="page-title">Рынки</h1>
          <p class="page-sub" id="mkSub"><span id="mkSubText">Спот · пары к USDT</span> <span id="src"></span></p>
        </div>
        <label class="search glass">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="q" type="search" placeholder="Поиск монеты или акции" autocomplete="off" />
        </label>
      </section>
      <div class="seg kind-seg" id="kindSeg"><button class="active" data-k="crypto">🪙 Крипта</button><button data-k="stock">📊 Акции</button></div>
      <div class="stock-note glass" id="stockNote" hidden></div>
      <div class="mk-top">
        <div class="glass fng" id="fng"><small class="muted">Индекс страха и жадности</small><div class="fng-body">…</div></div>
        <div class="seg seg-sm view-seg" id="viewSeg"><button data-v="list" class="active">Список</button><button data-v="map">Карта</button></div>
      </div>
      <div class="chips" id="sortChips">
        <button class="chip" data-s="fav">★ Избранное</button>
        <button class="chip active" data-s="vol">По объёму</button>
        <button class="chip" data-s="gain">Рост</button>
        <button class="chip" data-s="loss">Падение</button>
        <button class="chip" data-s="price">Цена</button>
        <button class="chip" data-s="az">А–Я</button>
      </div>
      <div class="glass market-table">
        <div class="mt-head">
          <span>Пара</span><span class="r">Цена</span><span class="r">24ч</span><span class="r hide-m">7 дней</span>
          <span class="r hide-m">Макс 24ч</span><span class="r hide-m">Мин 24ч</span><span class="r hide-m">Объём 24ч</span>
        </div>
        <div id="rows">
          ${PAIRS.map((p) => `
            <a class="mt-row" href="#/trade/${p.symbol}" data-symbol="${p.symbol}" data-kind="${p.stock ? "stock" : "crypto"}" data-search="${(p.base + " " + (p.ticker || "") + " " + p.name).toLowerCase()}">
              <span class="pair-cell"><button class="fav ${isFav(p.symbol) ? "on" : ""}" data-fav="${p.symbol}" aria-label="В избранное">★</button>${coinIcon(p)}<span><b>${p.stock ? p.ticker : p.base}</b><span class="muted">${p.stock ? "" : "/USDT"}</span><small>${p.name}</small></span></span>
              <span class="r price" data-f="price">—</span>
              <span class="r"><span class="chg" data-f="chg">—</span></span>
              <span class="r hide-m spark" data-f="spark"></span>
              <span class="r hide-m muted" data-f="high">—</span>
              <span class="r hide-m muted" data-f="low">—</span>
              <span class="r hide-m muted" data-f="vol">—</span>
            </a>`).join("")}
        </div>
        <div class="empty" id="empty" hidden>Ничего не найдено</div>
      </div>
      <div class="heatmap" id="heatmap" hidden></div>`;

    const q = $("#q", el);
    let onlyFav = false, kind = "crypto";
    const applyFilter = () => {
      const v = q.value.trim().toLowerCase();
      let shown = 0;
      el.querySelectorAll(".mt-row").forEach((r) => {
        // при поиске показываем и крипту, и акции
        const ok = (!v || r.dataset.search.includes(v)) && (v || onlyFav || r.dataset.kind === kind) && (!onlyFav || isFav(r.dataset.symbol));
        r.hidden = !ok;
        shown += ok;
      });
      $("#empty", el).hidden = shown > 0;
      $("#empty", el).textContent = onlyFav && !prefs().favs.length ? "Нажми ★ у монеты, чтобы добавить её в избранное" : "Ничего не найдено";
    };
    q.oninput = applyFilter;
    const drawNote = () => {
      const open = usMarketOpen();
      const src = { gate: "живые, биржа Gate", coingecko: "CoinGecko, обновление раз в 30 с", offline: "нет связи — проверь интернет", connecting: "загружаются…" }[getStockSource()];
      $("#stockNote", el).innerHTML = `<b>${open ? "🟢 Биржа США открыта" : "🌙 Биржа США закрыта"}</b> — работает пн–пт ${usMarketHoursLocal()} по твоему времени.
        <span class="muted">Цены: ${src}.</span>
        <span class="muted">Здесь — токенизированные акции: цена 1 к 1 повторяет настоящую, купить можно в любое время, но двигается цена в основном когда биржа открыта.</span>`;
    };
    $("#kindSeg", el).onclick = (e) => {
      const b = e.target.closest("button[data-k]");
      if (!b) return;
      kind = b.dataset.k;
      el.querySelectorAll("#kindSeg button").forEach((x) => x.classList.toggle("active", x === b));
      $("#stockNote", el).hidden = kind !== "stock";
      $("#mkSubText", el).textContent = kind === "stock" ? "Акции США · токены 1 к 1 · цены в USDT" : "Спот · пары к USDT";
      $("#src", el).hidden = kind === "stock";
      $("#fng", el).style.display = kind === "stock" ? "none" : "";
      drawNote();
      applyFilter();
      drawMap();
    };
    applyFilter();

    // звёздочка — избранное (ссылку при этом не открываем)
    $("#rows", el).addEventListener("click", (e) => {
      const f = e.target.closest("[data-fav]");
      if (!f) return;
      e.preventDefault();
      toggleFav(f.dataset.fav);
      f.classList.toggle("on", isFav(f.dataset.fav));
      applyFilter();
    });

    // мини-графики за 7 дней
    const sparkSvg = (arr) => {
      if (!arr?.length) return "";
      const min = Math.min(...arr), max = Math.max(...arr), w = 90, h = 28;
      const pts = arr.map((v, i) => `${((i / (arr.length - 1)) * w).toFixed(1)},${(h - ((v - min) / (max - min || 1)) * (h - 4) - 2).toFixed(1)}`).join(" ");
      const up = arr.at(-1) >= arr[0];
      return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="${up ? "var(--up)" : "var(--down)"}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    };
    let alive = true;
    if (matchMedia("(min-width: 900px)").matches) {
      PAIRS.forEach((p, i) => setTimeout(async () => {
        try { const d = await fetchSpark(p.symbol); if (alive) el.querySelector(`[data-symbol="${p.symbol}"] [data-f="spark"]`).innerHTML = sparkSvg(d); } catch { /* нет связи */ }
      }, i * 60));
    }

    // индекс страха и жадности
    fetchFearGreed().then((d) => {
      if (!alive) return;
      const v = d[0].value;
      const RU = { "Extreme Fear": "Сильный страх", Fear: "Страх", Neutral: "Нейтрально", Greed: "Жадность", "Extreme Greed": "Сильная жадность" };
      const cls = v < 45 ? "down" : v > 55 ? "up" : "";
      $(".fng-body", el).innerHTML = `<b class="${cls}">${v}</b><span>${RU[d[0].label] || d[0].label}</span>
        <span class="fng-bar"><i style="left:${v}%"></i></span><small class="muted">вчера ${d[1].value} · неделю назад ${d[7]?.value ?? "—"}</small>`;
    }).catch(() => { if (alive) $("#fng", el).hidden = true; });

    // тепловая карта
    let view = "list";
    const drawMap = () => {
      if (view !== "map") return;
      const list = PAIRS.filter((p) => (kind === "stock") === !!p.stock).map((p) => ({ p, t: tickers[p.symbol] })).filter((x) => x.t).sort((a, b) => (b.t.quoteVolume || 0) - (a.t.quoteVolume || 0));
      const maxV = Math.max(...list.map((x) => x.t.quoteVolume || 1));
      $("#heatmap", el).innerHTML = list.map(({ p, t }) => {
        const c = Math.max(-8, Math.min(8, t.change)) / 8;
        const bg = c >= 0 ? `rgba(95,174,143,${0.12 + c * 0.55})` : `rgba(201,116,116,${0.12 - c * 0.55})`;
        const span = (t.quoteVolume || 0) > maxV * 0.25 ? 2 : 1;
        return `<a class="hm-tile" href="#/trade/${p.symbol}" style="background:${bg};grid-column:span ${span};grid-row:span ${span}"><b>${p.stock ? p.ticker : p.base}</b><span>${fmtPct(t.change)}</span><small>${fmtPrice(t.price)}</small></a>`;
      }).join("");
    };
    $("#viewSeg", el).onclick = (e) => {
      const b = e.target.closest("button[data-v]");
      if (!b) return;
      view = b.dataset.v;
      el.querySelectorAll("#viewSeg button").forEach((x) => x.classList.toggle("active", x === b));
      el.querySelector(".market-table").hidden = view === "map";
      $("#sortChips", el).hidden = view === "map";
      $("#heatmap", el).hidden = view !== "map";
      drawMap();
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
      if (b.dataset.s === "fav") {
        onlyFav = !onlyFav;
        b.classList.toggle("active", onlyFav);
        applyFilter();
        return;
      }
      sortBy = b.dataset.s;
      el.querySelectorAll("#sortChips .chip:not([data-s=fav])").forEach((c) => c.classList.toggle("active", c === b));
      resort();
    };

    let lastMap = 0;
    const stopPrices = onPrices((tickers, source) => {
      if (Date.now() - lastSort > 5000) resort();
      if (view === "map" && Date.now() - lastMap > 3000) { lastMap = Date.now(); drawMap(); }
      if (kind === "stock") drawNote();
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
    return () => { alive = false; stopPrices(); };
  },
};
