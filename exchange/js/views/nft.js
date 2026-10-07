// NFT-маркет: коллекции → коллекция → токен.
import {
  collection, query, where, onSnapshot, doc, getCountFromServer,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "../firebase.js";
import { onPrices } from "../market.js";
import { store, onStore } from "../store.js";
import { COLLECTIONS, collectionById, getItems, getItem, nftSvg, floorCoin, floorUsd, itemUsd, floorChange24h } from "../nft-data.js";
import { buyNft, sellNft } from "../nft.js";
import { tradeError, FEE } from "../trade.js";
import { fmtUsd, fmtPct, fmtAmount, fmtDate } from "../format.js";
import { $, esc, toast } from "../ui.js";

const fmtCoin = (v) => fmtAmount(v, v >= 100 ? 1 : v >= 1 ? 3 : 4);
const chg = (v) => `<span class="${v >= 0 ? "up" : "down"}">${fmtPct(v)}</span>`;
const tierBadge = (it) => `<span class="tier ${it.tier.cls}">${it.tier.name}</span>`;

export default {
  render(el, params) {
    const [colId, n] = params;
    if (colId && n && getItem(`${colId}-${n}`)) return renderItem(el, getItem(`${colId}-${n}`));
    if (colId && collectionById(colId)) return renderCollection(el, collectionById(colId));
    return renderOverview(el);
  },
};

// ═════════ все коллекции ═════════
function renderOverview(el) {
  const total = COLLECTIONS.reduce((s, c) => s + c.size, 0);
  el.innerHTML = `
    <section class="page-head">
      <div><h1 class="page-title">NFT</h1><p class="page-sub">${COLLECTIONS.length} коллекций · ${total} уникальных токенов · цены по живому курсу</p></div>
      <a class="btn btn-sm" href="#/wallet" id="myNft">Мои NFT</a>
    </section>
    <div class="col-grid">
      ${COLLECTIONS.map((c) => {
        const top = [...getItems(c.id)].sort((a, b) => a.rank - b.rank).slice(0, 3);
        return `
        <a class="glass col-card" href="#/nft/${c.id}" data-col="${c.id}">
          <div class="col-mosaic">${top.map((it) => nftSvg(it, "nft-art")).join("")}</div>
          <div class="col-body">
            <div class="col-title"><b>${c.name}</b><span class="chain">${c.chain}</span></div>
            <p class="muted small">${c.desc}</p>
            <div class="col-stats">
              <div><small>Флор</small><span data-f="floor">—</span></div>
              <div><small>24ч</small><span data-f="chg">—</span></div>
              <div><small>Куплено</small><span data-f="sold">— / ${c.size}</span></div>
            </div>
          </div>
        </a>`;
      }).join("")}
    </div>`;

  let alive = true;
  COLLECTIONS.forEach(async (c) => {
    try {
      const snap = await getCountFromServer(query(collection(db, "nfts"), where("collection", "==", c.id)));
      if (alive) el.querySelector(`[data-col="${c.id}"] [data-f="sold"]`).textContent = `${snap.data().count} / ${c.size}`;
    } catch (e) { console.error(e); }
  });
  const draw = () => {
    for (const c of COLLECTIONS) {
      const card = el.querySelector(`[data-col="${c.id}"]`);
      const fu = floorUsd(c);
      card.querySelector('[data-f="floor"]').innerHTML = `${fu != null ? fmtUsd(fu) : "—"} <small class="muted">${fmtCoin(floorCoin(c))} ${c.chain}</small>`;
      card.querySelector('[data-f="chg"]').innerHTML = chg(floorChange24h(c));
    }
    $("#myNft", el).textContent = store.nfts.length ? `Мои NFT · ${store.nfts.length}` : "Мои NFT";
  };
  const s1 = onPrices(draw), s2 = onStore(draw);
  return () => { alive = false; s1(); s2(); };
}

// ═════════ коллекция ═════════
const PAGE = 30;
function renderCollection(el, col) {
  const items = getItems(col.id);
  el.innerHTML = `
    <a class="back" href="#/nft">← Все коллекции</a>
    <section class="glass card col-head">
      <div class="col-head-art">${nftSvg([...items].sort((a, b) => a.rank - b.rank)[0], "nft-art")}</div>
      <div class="col-head-info">
        <div class="col-title"><h1 class="page-title">${col.name}</h1><span class="chain">${col.chain}</span></div>
        <p class="muted">${col.desc}</p>
        <div class="col-stats big">
          <div><small>Флор</small><span id="cFloor">—</span></div>
          <div><small>24ч (${col.chain})</small><span id="cChg">—</span></div>
          <div><small>Куплено</small><span id="cSold">—</span></div>
          <div><small>Мои</small><span id="cMine">—</span></div>
        </div>
      </div>
      <div class="col-chart">
        <div class="tr-chart-bar"><span class="muted small">Флор, ${col.chain}</span>
          <div class="seg seg-sm" id="range"><button data-d="7">7д</button><button data-d="30" class="active">30д</button><button data-d="90">90д</button></div></div>
        <div class="chart-box sm" id="cChart"></div>
      </div>
    </section>
    <div class="nft-tools">
      <div class="chips" id="filter">
        <button class="chip active" data-f="all">Все</button><button class="chip" data-f="free">Свободные</button>
        <button class="chip" data-f="mine">Мои</button><button class="chip" data-f="taken">Куплены</button>
      </div>
      <label class="sort glass"><span class="muted">Сортировка</span>
        <select id="sort"><option value="rank">Редкость</option><option value="cheap">Цена ↑</option><option value="expensive">Цена ↓</option><option value="n">Номер</option></select>
      </label>
    </div>
    <div class="nft-grid" id="grid"></div>
    <button class="btn btn-block more" id="more" hidden>Показать ещё</button>`;

  let owners = {}, filter = "all", sort = "rank", shown = PAGE, alive = true;
  const stops = [() => (alive = false)];

  // график флора (детерминированный — считаем сами)
  const LWC = window.LightweightCharts;
  if (LWC) {
    const chart = LWC.createChart($("#cChart", el), {
      autoSize: true,
      layout: { background: { type: "solid", color: "transparent" }, textColor: "#8b919a", fontFamily: "Inter, system-ui, sans-serif", fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: "rgba(255,255,255,0.035)" } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false },
      handleScroll: false, handleScale: false,
      localization: { locale: "ru-RU" },
    });
    const area = chart.addSeries(LWC.AreaSeries, {
      lineColor: "#c9ced6", lineWidth: 2, topColor: "rgba(201,206,214,0.28)", bottomColor: "rgba(201,206,214,0)",
      priceFormat: { type: "price", precision: col.base >= 10 ? 2 : 4, minMove: col.base >= 10 ? 0.01 : 0.0001 },
    });
    const tz = -new Date().getTimezoneOffset() * 60;
    const setRange = (days) => {
      const step = days <= 7 ? 3600e3 : days <= 30 ? 3 * 3600e3 : 8 * 3600e3;
      const now = Date.now(), pts = [];
      for (let t = now - days * 86400e3; t <= now; t += step) pts.push({ time: Math.floor(t / 1000) + tz, value: floorCoin(col, t) });
      area.setData(pts);
      chart.timeScale().fitContent();
    };
    setRange(30);
    $("#range", el).onclick = (e) => {
      const b = e.target.closest("button[data-d]");
      if (!b) return;
      $("#range", el).querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
      setRange(+b.dataset.d);
    };
    stops.push(() => chart.remove());
  }

  const card = (it) => {
    const o = owners[it.id];
    const mine = o?.owner === store.uid;
    const state = !o ? '<span class="own free">Свободен</span>' : mine ? '<span class="own mine">Твой</span>' : `<span class="own taken">${esc(o.ownerNick)}</span>`;
    return `
      <a class="nft-card glass" href="#/nft/${col.id}/${it.n}" data-id="${it.id}">
        ${nftSvg(it, "nft-art")}
        <div class="nft-meta">
          <div class="nft-name"><b>${esc(it.col.id === "deck" ? it.name : `#${it.n}`)}</b>${tierBadge(it)}</div>
          <div class="nft-price"><span data-price="${it.id}">—</span>${state}</div>
        </div>
      </a>`;
  };

  const list = () => {
    let arr = items.filter((it) => {
      const o = owners[it.id];
      return filter === "all" || (filter === "free" && !o) || (filter === "mine" && o?.owner === store.uid) || (filter === "taken" && o);
    });
    const sorters = { rank: (a, b) => a.rank - b.rank, cheap: (a, b) => a.tier.mult - b.tier.mult || b.rank - a.rank,
      expensive: (a, b) => b.tier.mult - a.tier.mult || a.rank - b.rank, n: (a, b) => a.n - b.n };
    return arr.sort(sorters[sort]);
  };

  const drawGrid = () => {
    if (!alive) return;
    const arr = list();
    $("#grid", el).innerHTML = arr.length ? arr.slice(0, shown).map(card).join("") : '<div class="empty">Здесь пока пусто</div>';
    $("#more", el).hidden = arr.length <= shown;
    drawPrices();
  };
  const drawPrices = () => {
    if (!alive) return;
    const fu = floorUsd(col);
    $("#cFloor", el).innerHTML = `${fu != null ? fmtUsd(fu) : "—"} <small class="muted">${fmtCoin(floorCoin(col))} ${col.chain}</small>`;
    $("#cChg", el).innerHTML = chg(floorChange24h(col));
    el.querySelectorAll("[data-price]").forEach((s) => {
      const v = itemUsd(getItem(s.dataset.price));
      s.textContent = v != null ? fmtUsd(v) : "—";
    });
  };

  stops.push(onSnapshot(query(collection(db, "nfts"), where("collection", "==", col.id)), (snap) => {
    owners = {};
    snap.forEach((d) => (owners[d.id] = d.data()));
    $("#cSold", el).textContent = `${snap.size} / ${col.size}`;
    $("#cMine", el).textContent = String(Object.values(owners).filter((o) => o.owner === store.uid).length);
    drawGrid();
  }, (e) => console.error(e)));

  $("#filter", el).onclick = (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    filter = b.dataset.f; shown = PAGE;
    el.querySelectorAll("#filter .chip").forEach((c) => c.classList.toggle("active", c === b));
    drawGrid();
  };
  $("#sort", el).onchange = (e) => { sort = e.target.value; shown = PAGE; drawGrid(); };
  $("#more", el).onclick = () => { shown += PAGE; drawGrid(); };

  drawGrid();
  stops.push(onPrices(drawPrices));
  const t = setInterval(drawPrices, 5000);
  stops.push(() => clearInterval(t));
  return () => stops.forEach((s) => s());
}

// ═════════ токен ═════════
function renderItem(el, it) {
  const col = it.col;
  el.innerHTML = `
    <a class="back" href="#/nft/${col.id}">← ${col.name}</a>
    <section class="nft-item">
      <div class="glass nft-item-art">${nftSvg(it, "nft-art")}</div>
      <div class="nft-item-side">
        <div class="glass card">
          <div class="nft-name big"><h1 class="page-title">${esc(it.name)}</h1>${tierBadge(it)}</div>
          <p class="muted small">${col.name} · #${it.n} · место по редкости <b>${it.rank}</b> из ${col.size}</p>
          <div class="nft-buy">
            <small class="muted">Цена</small>
            <div class="big-num" id="iPrice">—</div>
            <div class="muted small" id="iCoin">—</div>
          </div>
          <div class="kv"><span>Владелец</span><span id="iOwner">—</span></div>
          <div class="kv" id="iBoughtRow" hidden><span>Куплен за</span><span id="iBought">—</span></div>
          <div class="kv" id="iPnlRow" hidden><span>Прибыль при продаже</span><span id="iPnl">—</span></div>
          <div class="kv"><span>Комиссия 0,1%</span><span id="iFee">—</span></div>
          <div class="kv"><span>Доступно</span><span id="iAvail">—</span></div>
          <div class="form-error" id="iErr"></div>
          <button class="btn btn-block" id="iBtn" disabled>…</button>
        </div>
        <div class="glass card">
          <p class="card-title">Черты</p>
          <div class="traits">
            ${Object.entries(it.traits).map(([k, v]) => `
              <div class="trait"><small>${esc(k)}</small><b>${esc(v)}</b><span class="muted">${(it.traitFreq[k] * 100).toFixed(1)}% имеют</span></div>`).join("")}
          </div>
        </div>
      </div>
    </section>`;

  let owner = null, loaded = false, busy = false, alive = true;
  const btn = $("#iBtn", el), err = $("#iErr", el);

  const draw = () => {
    if (!alive) return;
    const price = itemUsd(it);
    const fu = price != null;
    $("#iPrice", el).innerHTML = fu ? `${fmtUsd(price)} <small>USDT</small>` : "—";
    $("#iCoin", el).textContent = `≈ ${fmtCoin(floorCoin(col) * it.tier.mult)} ${col.chain} · флор × ${it.tier.mult}`;
    $("#iFee", el).textContent = fu ? `${fmtUsd(price * FEE)} USDT` : "—";
    $("#iAvail", el).textContent = `${fmtUsd(store.balances.USDT?.amount || 0)} USDT`;
    const mine = owner?.owner === store.uid;
    $("#iOwner", el).innerHTML = !owner ? '<span class="own free">Свободен — продаёт маркет</span>' : mine ? '<span class="own mine">Ты</span>' : esc(owner.ownerNick);
    $("#iBoughtRow", el).hidden = !mine;
    $("#iPnlRow", el).hidden = !mine;
    if (mine) {
      $("#iBought", el).textContent = `${fmtUsd(owner.price)} USDT · ${fmtDate(owner.boughtAt?.toMillis?.())}`;
      const pnl = fu ? price * (1 - FEE) - owner.price : null;
      $("#iPnl", el).innerHTML = pnl == null ? "—" : `<span class="${pnl >= 0 ? "up" : "down"}">${pnl >= 0 ? "+" : "−"}${fmtUsd(Math.abs(pnl))} USDT</span>`;
    }
    if (busy) return;
    if (!loaded) { btn.disabled = true; btn.textContent = "…"; return; }
    if (!owner) {
      btn.className = "btn btn-block btn-buy";
      btn.textContent = fu ? `Купить за ${fmtUsd(price * (1 + FEE))} USDT` : "Ждём курс…";
      btn.disabled = !fu;
    } else if (mine) {
      btn.className = "btn btn-block btn-sell";
      btn.textContent = fu ? `Продать маркету за ${fmtUsd(price * (1 - FEE))} USDT` : "Ждём курс…";
      btn.disabled = !fu;
    } else {
      btn.className = "btn btn-block";
      btn.textContent = "Уже куплен другим игроком";
      btn.disabled = true;
    }
  };

  btn.onclick = async () => {
    err.textContent = "";
    const mine = owner?.owner === store.uid;
    busy = true; btn.disabled = true;
    try {
      if (mine) {
        const r = await sellNft(it);
        toast(`${it.name} продан за ${fmtUsd(r.price - r.fee)} USDT`, "ok");
      } else {
        const r = await buyNft(it);
        toast(`${it.name} теперь твой · ${fmtUsd(r.price + r.fee)} USDT`, "ok");
      }
    } catch (e) {
      console.error(e);
      err.textContent = tradeError(e);
    } finally {
      busy = false;
      draw();
    }
  };

  const stops = [() => (alive = false)];
  stops.push(onSnapshot(doc(db, "nfts", it.id), (snap) => {
    owner = snap.exists() ? snap.data() : null;
    loaded = true;
    draw();
  }, (e) => console.error(e)));
  stops.push(onPrices(draw), onStore(draw));
  const t = setInterval(draw, 3000);
  stops.push(() => clearInterval(t));
  return () => stops.forEach((s) => s());
}
