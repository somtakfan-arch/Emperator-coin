// 2. Торговля — график, стакан, форма купить/продать, открытые ордера.
import { PAIRS, pairBySymbol, onPrices, tickers, getPrice, fetchKlines, fetchDepth, wsKline, liveStream } from "../market.js";
import { store, onStore } from "../store.js";
import { marketOrder, placeLimit, cancelOrder, tradeError, FEE, MIN_TOTAL, floor8 } from "../trade.js";
import { fmtPrice, fmtPct, fmtAmount, fmtUsd, fmtCompact, fmtDate, priceDecimals, parseNum, toInput } from "../format.js";
import { $, esc, toast, coinIcon, sourceBadge } from "../ui.js";

const TFS = [["1m", "1м"], ["15m", "15м"], ["1h", "1ч"], ["1d", "1д"]];
const UP = "#5fae8f", DOWN = "#c97474";

export default {
  render(el, params) {
    const pair = pairBySymbol((params[0] || "").toUpperCase()) || PAIRS[0];
    const { symbol, base } = pair;
    let alive = true;
    const stops = [() => (alive = false)];
    const isDesktop = () => matchMedia("(min-width: 900px)").matches;

    el.innerHTML = `
    <section class="trade">
      <div class="tr-head glass">
        <div class="tr-pair">
          ${coinIcon(pair, "lg")}
          <label class="pair-select">
            <select id="pairSel" aria-label="Пара">
              ${PAIRS.map((p) => `<option value="${p.symbol}" ${p.symbol === symbol ? "selected" : ""}>${p.base}/USDT</option>`).join("")}
            </select>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 9 6 6 6-6"/></svg>
          </label>
        </div>
        <div class="tr-last">
          <div class="tr-price" id="lastPrice">—</div>
          <div class="tr-chg" id="lastChg">—</div>
        </div>
        <div class="tr-stats">
          <div><small>Макс 24ч</small><span id="st-high">—</span></div>
          <div><small>Мин 24ч</small><span id="st-low">—</span></div>
          <div><small>Объём 24ч</small><span id="st-vol">—</span></div>
          <div id="src"></div>
        </div>
      </div>

      <div class="tr-chart glass">
        <div class="tr-chart-bar">
          <div class="seg seg-sm" id="tfSeg">
            ${TFS.map(([v, l], i) => `<button type="button" data-tf="${v}" class="${i === 0 ? "active" : ""}">${l}</button>`).join("")}
          </div>
          <span class="muted small" id="ohlc"></span>
          <span class="ma-legend small"><i class="ma7"></i>MA7 <i class="ma25"></i>MA25</span>
        </div>
        <div class="chart-box" id="chart"><div class="chart-msg" id="chartMsg"><div class="spinner"></div></div></div>
      </div>

      <div class="tr-book glass">
        <h3 class="card-title">Стакан</h3>
        <div class="book-head"><span>Цена (USDT)</span><span class="r">Кол-во (${base})</span><span class="r">Сумма</span></div>
        <div class="book-side asks" id="asks"></div>
        <div class="book-mid" id="bookMid">—</div>
        <div class="book-side bids" id="bids"></div>
      </div>

      <div class="tr-form glass">
        <div class="seg side-seg" id="sideSeg">
          <button type="button" data-side="buy" class="active buy">Купить</button>
          <button type="button" data-side="sell" class="sell">Продать</button>
        </div>
        <div class="type-tabs" id="typeTabs">
          <button type="button" data-type="limit" class="active">Лимит</button>
          <button type="button" data-type="market">Рынок</button>
        </div>
        <form id="orderForm" novalidate autocomplete="off">
          <label class="field ifield">
            <span>Цена</span>
            <input class="input" id="fPrice" inputmode="decimal" placeholder="0" />
            <em>USDT</em>
          </label>
          <label class="field ifield">
            <span>Количество</span>
            <input class="input" id="fAmount" inputmode="decimal" placeholder="0" />
            <em>${base}</em>
          </label>
          <div class="pct" id="pct">
            ${[25, 50, 75, 100].map((p) => `<button type="button" data-pct="${p}">${p}%</button>`).join("")}
          </div>
          <label class="field ifield">
            <span>Сумма</span>
            <input class="input" id="fTotal" inputmode="decimal" placeholder="мин. ${MIN_TOTAL}" />
            <em>USDT</em>
          </label>
          <div class="kv"><span>Доступно</span><span id="avail">—</span></div>
          <div class="kv"><span>Комиссия 0,1%</span><span id="feeEst">—</span></div>
          <div class="kv"><span>Получишь ≈</span><span id="recvEst">—</span></div>
          <div class="form-error" id="formErr"></div>
          <button class="btn btn-block btn-buy" id="submitBtn" type="submit">Купить ${base}</button>
        </form>
      </div>

      <div class="tr-orders glass">
        <h3 class="card-title">Открытые ордера <span class="count" id="ordCount"></span></h3>
        <div id="orders"></div>
      </div>
    </section>`;

    // ───────── шапка пары ─────────
    $("#pairSel", el).onchange = (e) => (location.hash = `#/trade/${e.target.value}`);
    // ───────── график ─────────
    const LWC = window.LightweightCharts;
    let chart = null, candles = null, volume = null, klineStop = null, tfToken = 0;
    const chartMsg = (html) => { const m = $("#chartMsg", el); m.hidden = !html; m.innerHTML = html || ""; };

    if (!LWC) {
      chartMsg('<span class="muted">Не загрузилась библиотека графиков</span>');
    } else {
      const d = priceDecimals(tickers[symbol]?.price ?? 100);
      chart = LWC.createChart($("#chart", el), {
        autoSize: true,
        layout: { background: { type: "solid", color: "transparent" }, textColor: "#8b919a", fontFamily: "Inter, system-ui, sans-serif", fontSize: 11 },
        grid: { vertLines: { color: "rgba(255,255,255,0.035)" }, horzLines: { color: "rgba(255,255,255,0.035)" } },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
        timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
        crosshair: {
          vertLine: { color: "rgba(201,206,214,0.35)", labelBackgroundColor: "#2a2d33" },
          horzLine: { color: "rgba(201,206,214,0.35)", labelBackgroundColor: "#2a2d33" },
        },
        localization: { locale: "ru-RU" },
      });
      candles = chart.addSeries(LWC.CandlestickSeries, {
        upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN,
        priceFormat: { type: "price", precision: d, minMove: 1 / 10 ** d },
      });
      volume = chart.addSeries(LWC.HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "", lastValueVisible: false, priceLineVisible: false });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      // скользящие средние MA7 и MA25
      const maOpts = (color) => ({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      const ma7 = chart.addSeries(LWC.LineSeries, maOpts("rgba(233,236,240,0.75)"));
      const ma25 = chart.addSeries(LWC.LineSeries, maOpts("rgba(201,162,255,0.7)"));
      let closes = [];
      const maAt = (arr, n, i) => { if (i + 1 < n) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += arr[k].close; return s / n; };
      const maData = (arr, n) => arr.map((c, i) => ({ time: c.time, value: maAt(arr, n, i) })).filter((p) => p.value != null);
      const volBar = (c) => ({ time: c.time, value: c.volume, color: c.close >= c.open ? "rgba(95,174,143,0.28)" : "rgba(201,116,116,0.28)" });

      chart.subscribeCrosshairMove((p) => {
        const c = p?.seriesData?.get(candles);
        $("#ohlc", el).textContent = c ? `O ${fmtPrice(c.open)}  H ${fmtPrice(c.high)}  L ${fmtPrice(c.low)}  C ${fmtPrice(c.close)}` : "";
      });

      const loadTf = async (tf) => {
        const token = ++tfToken;
        klineStop?.();
        chartMsg('<div class="spinner"></div>');
        try {
          const data = await fetchKlines(symbol, tf, { limit: 500 });
          if (token !== tfToken || !alive) return;
          const dd = priceDecimals(data.at(-1)?.close ?? 100);
          candles.applyOptions({ priceFormat: { type: "price", precision: dd, minMove: 1 / 10 ** dd } });
          candles.setData(data);
          volume.setData(data.map(volBar));
          closes = data.slice();
          ma7.setData(maData(closes, 7));
          ma25.setData(maData(closes, 25));
          chart.timeScale().fitContent();
          chart.timeScale().scrollToRealTime();
          chartMsg("");
          let lastTime = data.at(-1)?.time ?? 0;
          const push = (c) => {
            if (token !== tfToken || c.time < lastTime) return;
            lastTime = c.time;
            candles.update(c);
            volume.update(volBar(c));
            if (closes.at(-1)?.time === c.time) closes[closes.length - 1] = c; else closes.push(c);
            const i = closes.length - 1;
            if (i >= 6) ma7.update({ time: c.time, value: maAt(closes, 7, i) });
            if (i >= 24) ma25.update({ time: c.time, value: maAt(closes, 25, i) });
          };
          klineStop = liveStream(
            [`${symbol.toLowerCase()}@kline_${tf}`],
            (_, m) => m.k && push(wsKline(m.k)),
            async () => (await fetchKlines(symbol, tf, { limit: 2 })).forEach(push),
            { pollMs: 4000 },
          );
        } catch {
          if (token === tfToken && alive) chartMsg('<span class="muted">График недоступен — нет связи с Binance</span>');
        }
      };

      $("#tfSeg", el).onclick = (e) => {
        const b = e.target.closest("button[data-tf]");
        if (!b) return;
        $("#tfSeg", el).querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
        loadTf(b.dataset.tf);
      };
      loadTf("1m");
      stops.push(() => { tfToken++; klineStop?.(); chart.remove(); });
    }

    // ───────── стакан ─────────
    let book = null, bookQueued = false;
    const renderSide = (levels) => {
      let cum = 0;
      return levels.map(([p, q]) => { cum += p * q; return { p, q, cum }; });
    };
    const drawBook = () => {
      bookQueued = false;
      if (!alive || !book) return;
      const n = isDesktop() ? 11 : 8;
      const asks = book.asks.slice(0, n).map(([p, q]) => [+p, +q]);
      const bids = book.bids.slice(0, n).map(([p, q]) => [+p, +q]);
      const a = renderSide(asks), b = renderSide(bids);
      const max = Math.max(a.at(-1)?.cum || 0, b.at(-1)?.cum || 0, 1);
      const row = (r, side) => `
        <div class="book-row" data-price="${r.p}">
          <i style="width:${((r.cum / max) * 100).toFixed(1)}%"></i>
          <span class="${side}">${fmtPrice(r.p)}</span><span class="r">${fmtAmount(r.q, 5)}</span><span class="r muted">${fmtCompact(r.p * r.q)}</span>
        </div>`;
      $("#asks", el).innerHTML = a.reverse().map((r) => row(r, "down")).join("");
      $("#bids", el).innerHTML = b.map((r) => row(r, "up")).join("");
    };
    const updateMid = () => {
      const t = tickers[symbol];
      if (!t) return;
      const m = $("#bookMid", el);
      m.textContent = fmtPrice(t.price);
      m.className = `book-mid ${t.prev != null && t.price < t.prev ? "down" : "up"}`;
    };
    const onBook = (d) => {
      book = d;
      if (!bookQueued) { bookQueued = true; setTimeout(drawBook, 250); }
    };
    stops.push(liveStream([`${symbol.toLowerCase()}@depth20@100ms`], (_, d) => onBook(d), async () => onBook(await fetchDepth(symbol)), { pollMs: 2000, timeoutMs: 5000 }));
    const bookEmptyTimer = setTimeout(() => {
      if (!book) $("#asks", el).innerHTML = '<div class="empty">Стакан недоступен — нет связи с Binance</div>';
    }, 10000);
    stops.push(() => clearTimeout(bookEmptyTimer));
    // клик по уровню — подставляет цену в лимитку
    el.querySelector(".tr-book").onclick = (e) => {
      const r = e.target.closest(".book-row");
      if (!r) return;
      setType("limit");
      fPrice.value = toInput(+r.dataset.price);
      onAmountInput();
    };

    // ───────── форма ─────────
    let side = "buy", type = "limit", lastEdited = "amount";
    const fPrice = $("#fPrice", el), fAmount = $("#fAmount", el), fTotal = $("#fTotal", el);
    const err = $("#formErr", el), submit = $("#submitBtn", el);

    const curPrice = () => (type === "market" ? getPrice(symbol) : parseNum(fPrice.value));
    const avail = () => (side === "buy" ? store.balances.USDT?.amount || 0 : store.balances[base]?.amount || 0);

    function setSide(s) {
      side = s;
      $("#sideSeg", el).querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.side === s));
      submit.className = `btn btn-block ${s === "buy" ? "btn-buy" : "btn-sell"}`;
      submit.textContent = `${s === "buy" ? "Купить" : "Продать"} ${base}`;
      err.textContent = "";
      refreshForm();
    }
    function setType(t) {
      type = t;
      $("#typeTabs", el).querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.type === t));
      fPrice.disabled = t === "market";
      if (t === "market") { fPrice.value = ""; fPrice.placeholder = "По рынку"; }
      else { fPrice.placeholder = "0"; if (!fPrice.value && getPrice(symbol)) fPrice.value = toInput(getPrice(symbol), priceDecimals(getPrice(symbol))); }
      lastEdited === "total" ? onTotalInput() : onAmountInput();
    }
    function onAmountInput() {
      lastEdited = "amount";
      err.textContent = "";
      const p = curPrice(), q = parseNum(fAmount.value);
      fTotal.value = p > 0 && q > 0 ? toInput(p * q, 2) : "";
      refreshForm();
    }
    function onTotalInput() {
      lastEdited = "total";
      err.textContent = "";
      const p = curPrice(), t = parseNum(fTotal.value);
      fAmount.value = p > 0 && t > 0 ? toInput(floor8(t / p)) : "";
      refreshForm();
    }
    function refreshForm() {
      if (type === "market" && lastEdited === "amount" && fAmount.value) {
        const p = getPrice(symbol), q = parseNum(fAmount.value);
        if (p && q > 0) fTotal.value = toInput(p * q, 2);
      }
      if (type === "limit" && !fPrice.value && document.activeElement !== fPrice && getPrice(symbol)) {
        fPrice.value = toInput(getPrice(symbol), priceDecimals(getPrice(symbol)));
      }
      $("#avail", el).textContent = side === "buy" ? `${fmtUsd(avail())} USDT` : `${fmtAmount(avail())} ${base}`;
      const p = curPrice(), q = parseNum(fAmount.value);
      if (p > 0 && q > 0) {
        if (side === "buy") {
          $("#feeEst", el).textContent = `${fmtAmount(q * FEE)} ${base}`;
          $("#recvEst", el).textContent = `${fmtAmount(q * (1 - FEE))} ${base}`;
        } else {
          $("#feeEst", el).textContent = `${fmtUsd(p * q * FEE)} USDT`;
          $("#recvEst", el).textContent = `${fmtUsd(p * q * (1 - FEE))} USDT`;
        }
      } else {
        $("#feeEst", el).textContent = "—";
        $("#recvEst", el).textContent = "—";
      }
    }

    $("#sideSeg", el).onclick = (e) => { const b = e.target.closest("button"); if (b) setSide(b.dataset.side); };
    $("#typeTabs", el).onclick = (e) => { const b = e.target.closest("button"); if (b) setType(b.dataset.type); };
    fPrice.oninput = () => (lastEdited === "total" ? onTotalInput() : onAmountInput());
    fAmount.oninput = onAmountInput;
    fTotal.oninput = onTotalInput;
    $("#pct", el).onclick = (e) => {
      const b = e.target.closest("button[data-pct]");
      if (!b) return;
      const k = +b.dataset.pct / 100;
      const p = curPrice();
      if (side === "buy") {
        if (!(p > 0)) return;
        fAmount.value = toInput(floor8((avail() * k) / p));
      } else {
        fAmount.value = toInput(floor8(avail() * k));
      }
      onAmountInput();
    };

    $("#orderForm", el).onsubmit = async (e) => {
      e.preventDefault();
      err.textContent = "";
      const p = curPrice(), q = floor8(parseNum(fAmount.value));
      if (!(p > 0)) return (err.textContent = type === "market" ? "Нет актуальной цены" : "Укажи цену");
      if (!(q > 0)) return (err.textContent = "Укажи количество");
      if (p * q < MIN_TOTAL) return (err.textContent = `Минимальная сумма сделки — ${MIN_TOTAL} USDT`);
      if (side === "buy" && p * q > avail() + 1e-6) return (err.textContent = "Недостаточно USDT");
      if (side === "sell" && q > avail() + 1e-9) return (err.textContent = `Недостаточно ${base}`);

      submit.disabled = true;
      try {
        if (type === "market") {
          const r = await marketOrder(symbol, side, q);
          toast(`${side === "buy" ? "Куплено" : "Продано"} ${fmtAmount(r.qty)} ${base} по ${fmtPrice(r.price)}`, "ok");
        } else {
          await placeLimit(symbol, side, p, q);
          toast(`Лимитный ордер выставлен: ${fmtAmount(q)} ${base} по ${fmtPrice(p)}`, "ok");
        }
        fAmount.value = "";
        fTotal.value = "";
        refreshForm();
      } catch (e2) {
        console.error(e2);
        err.textContent = tradeError(e2);
      } finally {
        submit.disabled = false;
      }
    };

    // ───────── открытые ордера ─────────
    const ordersEl = $("#orders", el);
    ordersEl.onclick = async (e) => {
      const b = e.target.closest("button[data-cancel]");
      if (!b) return;
      b.disabled = true;
      try {
        await cancelOrder(b.dataset.cancel);
        toast("Ордер отменён, средства разморожены", "ok");
      } catch (e2) {
        toast(tradeError(e2), "err");
        b.disabled = false;
      }
    };
    stops.push(onStore((s) => {
      refreshForm();
      $("#ordCount", el).textContent = s.orders.length ? s.orders.length : "";
      if (!s.ordersReady) return;
      if (!s.orders.length) {
        ordersEl.innerHTML = '<div class="empty">Нет открытых ордеров</div>';
        return;
      }
      ordersEl.innerHTML = `
        <div class="olist">
          <div class="olist-head hide-m"><span>Пара</span><span>Сторона</span><span class="r">Цена</span><span class="r">Кол-во</span><span class="r">Сумма</span><span>Создан</span><span></span></div>
          ${s.orders.map((o) => {
            const pb = pairBySymbol(o.pair);
            return `
            <div class="orow">
              <span class="o-pair"><b>${esc(pb.base)}</b>/USDT</span>
              <span class="o-side ${o.side === "buy" ? "up" : "down"}">${o.side === "buy" ? "Покупка" : "Продажа"} · лимит</span>
              <span class="r"><small class="lbl">Цена</small>${fmtPrice(o.price)}</span>
              <span class="r"><small class="lbl">Кол-во</small>${fmtAmount(o.amount)}</span>
              <span class="r"><small class="lbl">Сумма</small>${fmtUsd(o.price * o.amount)}</span>
              <span class="muted o-date">${fmtDate(o.createdAtMs)}</span>
              <span class="r"><button class="btn btn-sm" data-cancel="${o.id}">Отменить</button></span>
            </div>`;
          }).join("")}
        </div>`;
    }));

    setSide("buy");
    setType("limit");

    // подписка на цены — в конце, когда всё выше уже объявлено
    let lastPriceShown = null;
    stops.push(onPrices((all, source) => {
      $("#src", el).innerHTML = sourceBadge(source);
      const t = all[symbol];
      if (!t) return;
      const lp = $("#lastPrice", el);
      lp.textContent = fmtPrice(t.price);
      if (lastPriceShown != null && t.price !== lastPriceShown) lp.className = `tr-price ${t.price > lastPriceShown ? "up" : "down"}`;
      lastPriceShown = t.price;
      const c = $("#lastChg", el);
      c.textContent = fmtPct(t.change);
      c.className = `tr-chg ${t.change >= 0 ? "up" : "down"}`;
      $("#st-high", el).textContent = t.high != null ? fmtPrice(t.high) : "—";
      $("#st-low", el).textContent = t.low != null ? fmtPrice(t.low) : "—";
      $("#st-vol", el).textContent = t.quoteVolume != null ? fmtCompact(t.quoteVolume) : "—";
      document.title = `${fmtPrice(t.price)} · ${base}/USDT · Bed Exchange`;
      refreshForm();
      updateMid();
    }));


    return () => stops.forEach((s) => { try { s(); } catch (e) { console.error(e); } });
  },
};
