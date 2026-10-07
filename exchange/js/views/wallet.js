// 3. Кошелёк — балансы, общая стоимость в USDT, прибыль/убыток.
import { PAIRS, onPrices, getPrice } from "../market.js";
import { store, onStore, total, portfolioValue, nftsValue } from "../store.js";
import { nftSvg, itemUsd, boxSvg, BOX } from "../nft-data.js";
import { openReveal } from "./nft.js";
import { START_USDT } from "../auth.js";
import { fmtUsd, fmtAmount, fmtPrice, fmtPct } from "../format.js";
import { $, esc, coinIcon } from "../ui.js";

const SHADES = ["#e9ecf0", "#c3c8cf", "#9da3ab", "#7c828a", "#61666d", "#4b4f55", "#3a3d42", "#2e3034"];
const signCls = (v) => (v > 0.005 ? "up" : v < -0.005 ? "down" : "");
const signed = (v) => (Math.abs(v) < 0.005 ? "0.00" : `${v > 0 ? "+" : "−"}${fmtUsd(Math.abs(v))}`);

export default {
  render(el) {
    el.innerHTML = `
      <section class="page-head"><div><h1 class="page-title">Кошелёк</h1><p class="page-sub">Все суммы — виртуальные USDT</p></div></section>
      <div class="wallet-grid">
        <div class="glass card hero">
          <p class="card-title">Стоимость портфеля</p>
          <div class="big-num" id="wTotal">—</div>
          <div class="pnl" id="wPnl">—</div>
          <div class="alloc" id="alloc"></div>
          <div class="legend" id="legend"></div>
        </div>
        <div class="glass card">
          <p class="card-title">Активы</p>
          <div class="asset-head hide-m"><span>Актив</span><span class="r">Баланс</span><span class="r">Цена / средняя покупки</span><span class="r">Прибыль</span></div>
          <div class="assets" id="assets"><div class="boot"><div class="spinner"></div></div></div>
        </div>
        <div class="glass card wallet-nft">
          <p class="card-title">NFT <span class="count" id="nftCount"></span><span class="muted" id="nftTotal"></span></p>
          <div id="nftList"></div>
        </div>
      </div>`;

    let alive = true;
    const draw = () => {
      if (!alive || !store.balancesReady) return;
      const b = store.balances;
      const rows = [];
      const usdt = total(b.USDT);
      rows.push({ coin: "USDT", name: "Tether", qty: usdt, locked: b.USDT?.locked || 0, value: usdt, price: 1 });
      for (const p of PAIRS) {
        const qty = total(b[p.base]);
        if (qty <= 1e-10) continue;
        const price = getPrice(p.symbol);
        const avg = b[p.base].avgPrice || 0;
        const value = price != null ? qty * price : null;
        rows.push({ coin: p.base, name: p.name, pair: p, qty, locked: b[p.base].locked || 0, price, avg, value,
          pnl: value != null && avg ? value - qty * avg : null, pnlPct: price != null && avg ? (price / avg - 1) * 100 : null });
      }
      rows.sort((x, y) => (y.value ?? 0) - (x.value ?? 0));

      const nv = nftsValue();
      const tv = portfolioValue();
      $("#wTotal", el).innerHTML = tv == null ? "—" : `${fmtUsd(tv)} <small>USDT</small>`;
      if (tv != null) {
        const diff = tv - START_USDT;
        $("#wPnl", el).innerHTML = `<span class="${signCls(diff)}">${signed(diff)} USDT · ${fmtPct((diff / START_USDT) * 100)}</span><span class="muted"> с начала игры</span>`;
        let parts = rows.filter((r) => r.value > 0).map((r) => ({ coin: r.coin, value: r.value }));
        if (nv > 0) parts.push({ coin: "NFT", value: nv });
        parts.sort((a, b) => b.value - a.value);
        if (parts.length > 7) parts = [...parts.slice(0, 6), { coin: "Другое", value: parts.slice(6).reduce((x, p) => x + p.value, 0) }];
        $("#alloc", el).innerHTML = parts.map((r, i) => `<i style="width:${(r.value / tv) * 100}%;background:${SHADES[i % SHADES.length]}" title="${r.coin}"></i>`).join("");
        $("#legend", el).innerHTML = parts.map((r, i) => `<span><i style="background:${SHADES[i % SHADES.length]}"></i>${r.coin} ${((r.value / tv) * 100).toFixed(1)}%</span>`).join("");
      }

      $("#assets", el).innerHTML = rows.map((r) => `
        <${r.pair ? `a href="#/trade/${r.pair.symbol}"` : "div"} class="asset">
          <span class="pair-cell">${coinIcon(r.pair)}<span><b>${r.coin}</b><small>${r.name}</small></span></span>
          <span class="r">
            <b>${r.coin === "USDT" ? fmtUsd(r.qty) : fmtAmount(r.qty)}</b>
            <small>${r.locked > 0 ? `в ордерах ${r.coin === "USDT" ? fmtUsd(r.locked) : fmtAmount(r.locked)}` : r.coin === "USDT" ? "свободно" : `≈ ${r.value != null ? fmtUsd(r.value) : "—"} USDT`}</small>
          </span>
          <span class="r hide-m"><small class="lbl">Цена / средняя</small>${r.coin === "USDT" ? "—" : `${r.price != null ? fmtPrice(r.price) : "—"}<small>ср. ${fmtPrice(r.avg)}</small>`}</span>
          <span class="r asset-pnl">${r.pnl == null ? '<span class="muted">—</span>'
            : `<span class="${signCls(r.pnl)}">${signed(r.pnl)}</span><small class="${signCls(r.pnl)}">${fmtPct(r.pnlPct)}</small>`}</span>
        </${r.pair ? "a" : "div"}>`).join("");

      // NFT
      const nb = store.boxes.length;
      $("#nftCount", el).textContent = store.nfts.length + nb || "";
      $("#nftTotal", el).textContent = nv ? ` · ${fmtUsd(nv)} USDT` : "";
      const boxCard = nb ? `
          <button class="nft-card glass box-card" id="wOpenBox">
            ${boxSvg("nft-art")}
            <div class="nft-meta">
              <div class="nft-name"><b>Мистери-бокс ×${nb}</b></div>
              <div class="nft-price"><small class="muted">Открыть за ${BOX.reveal} USDT</small></div>
            </div>
          </button>` : "";
      $("#nftList", el).innerHTML = store.nfts.length || nb ? `<div class="nft-grid small">${boxCard}${store.nfts.map((n) => {
        const v = itemUsd(n.item);
        const pnl = v != null ? v - n.price : null;
        return `
          <a class="nft-card glass" href="#/nft/${n.item.col.id}/${n.item.n}">
            ${nftSvg(n.item, "nft-art")}
            <div class="nft-meta">
              <div class="nft-name"><b>${esc(n.item.name)}</b></div>
              <div class="nft-price"><span>${v != null ? fmtUsd(v) : "—"}</span>${pnl == null ? "" : `<small class="${signCls(pnl)}">${signed(pnl)}</small>`}</div>
            </div>
          </a>`;
      }).join("")}</div>` : '<div class="empty">NFT пока нет — загляни во вкладку <a class="link-btn" href="#/nft">NFT</a></div>';
      $("#wOpenBox", el)?.addEventListener("click", () => openReveal());
    };

    let queued = false;
    const schedule = () => { if (!queued) { queued = true; setTimeout(() => { queued = false; draw(); }, 500); } };
    const s1 = onStore(draw);
    const s2 = onPrices(schedule);
    return () => { alive = false; s1(); s2(); };
  },
};
