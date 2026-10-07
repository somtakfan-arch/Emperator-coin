// NFT-маркет: коллекции → коллекция → токен.
import {
  collection, query, where, onSnapshot, doc,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "../firebase.js";
import { onPrices } from "../market.js";
import { store, onStore } from "../store.js";
import { TIERS, COLLECTIONS, collectionById, getItems, getItem, nftSvg, floorCoin, floorUsd, itemUsd, floorChange24h, BOX, boxSvg, boxOdds, allItems, nextDropAt } from "../nft-data.js";
import { buyNft, sellNft, buyBoxes, revealBox, revealMany, sellMany, BUY_PACKS, OPEN_PACKS, craft, craftTarget, CRAFT_COST } from "../nft.js";
import { tradeError, FEE } from "../trade.js";
import { fmtUsd, fmtPct, fmtAmount, fmtDate } from "../format.js";
import { $, esc, toast, confetti } from "../ui.js";
import { loadDaily, claimFreeBox, claimQuest, nextDayAt } from "../bonus.js";
import { openSend } from "./send.js";

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
    <section class="glass card daily" id="daily">
      <div class="daily-head"><p class="card-title">Ежедневное</p><span class="muted small">Обновится через <b id="dailyIn">—</b></span></div>
      <div class="daily-grid">
        <div class="daily-box">${boxSvg("nft-art")}<div><b>Бесплатный бокс</b><small class="muted">Раз в сутки</small></div><button class="btn btn-primary btn-sm" id="freeBox" disabled>…</button></div>
        <div class="quests" id="quests"><div class="boot"><div class="spinner"></div></div></div>
      </div>
    </section>
    <section class="glass box-hero">
      <div class="box-art">${boxSvg("nft-art box-float")}</div>
      <div class="box-info">
        <div class="col-title"><h2 class="box-title">Мистери-бокс</h2><span class="chain">РАНДОМ</span></div>
        <p class="muted small">Внутри — случайный токен из любой из ${COLLECTIONS.length} коллекций. Покупаешь бокс, а когда захочешь — открываешь за ${BOX.reveal} USDT и получаешь коллекционный NFT, который можно продать. Дешёвые токены выпадают чаще, легендарные — редко.</p>
        <div class="box-odds" id="odds"></div>
        <div class="kv"><span>Средняя цена токена из бокса</span><span id="ev">—</span></div>
        <div class="box-actions">
          <div class="pack-row"><span class="muted small">Купить боксы · ${fmtUsd(BOX.price * (1 + FEE))} USDT за штуку</span>
            <div class="packs" id="buyPacks">${BUY_PACKS.map((n) => `<button class="pack buy" data-n="${n}"><b>×${n}</b><small>${fmtUsd(n * BOX.price * (1 + FEE))}</small></button>`).join("")}</div></div>
          <div class="pack-row"><span class="muted small">Открыть · ${BOX.reveal} USDT за штуку · у тебя <b id="boxCount">0</b></span>
            <div class="packs" id="openPacks">${OPEN_PACKS.map((n) => `<button class="pack" data-n="${n}" disabled><b>×${n}</b><small>${fmtUsd(n * BOX.reveal)}</small></button>`).join("")}</div></div>
        </div>
      </div>
    </section>
    <section class="glass card craft-card">
      <div class="daily-head"><p class="card-title">Крафт</p><span class="muted small">${CRAFT_COST} токена одной редкости → 1 случайный следующей редкости</span></div>
      <div class="craft-rows" id="craftRows"></div>
    </section>
    <div class="drop-bar glass"><span>Новый дроп <b>Sigils</b> выходит каждый понедельник и сразу попадает в бокс.</span><span class="muted">Следующий через <b id="dropIn">—</b></span></div>
    <h2 class="section-title">Коллекции</h2>
    <div class="col-grid">
      ${COLLECTIONS.map((c) => {
        const top = [...getItems(c.id)].sort((a, b) => a.rank - b.rank).slice(0, 3);
        return `
        <a class="glass col-card" href="#/nft/${c.id}" data-col="${c.id}">
          <div class="col-mosaic">${top.map((it) => nftSvg(it, "nft-art")).join("")}</div>
          <div class="col-body">
            <div class="col-title"><b>${c.name}</b><span class="chain">${c.chain}</span>${c.boxOnly ? '<span class="chain box-only">ТОЛЬКО БОКС</span>' : ""}${c.drop && Date.now() - c.releasedAt < 7 * 86400e3 ? '<span class="chain new">НОВЫЙ ДРОП</span>' : ""}</div>
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

  let alive = true, owned = new Set(), ownedReady = false;
  const unsubOwned = onSnapshot(collection(db, "nfts"), (snap) => {
    owned = new Set(snap.docs.map((d) => d.id));
    ownedReady = true;
    for (const c of COLLECTIONS) {
      const sold = snap.docs.filter((d) => d.data().collection === c.id).length;
      el.querySelector(`[data-col="${c.id}"] [data-f="sold"]`).textContent = `${sold} / ${c.size}`;
    }
    drawBox();
  }, (e) => console.error(e));

  // шансы по редкости среди свободных токенов
  const drawBox = () => {
    if (!alive) return;
    const free = allItems().filter((it) => !owned.has(it.id));
    const { weights, total } = boxOdds(free);
    if (total && ownedReady) {
      const byTier = {};
      let ev = 0;
      free.forEach((it, i) => {
        byTier[it.tier.name] = (byTier[it.tier.name] || { p: 0, cls: it.tier.cls });
        byTier[it.tier.name].p += weights[i] / total;
        ev += (itemUsd(it) || 0) * weights[i] / total;
      });
      const order = ["Обычный", "Необычный", "Редкий", "Эпический", "Легендарный"];
      $("#odds", el).innerHTML = order.filter((t) => byTier[t]).map((t) =>
        `<span class="odd"><span class="tier ${byTier[t].cls}">${t}</span><b>${(byTier[t].p * 100).toFixed(byTier[t].p < 0.01 ? 2 : 1)}%</b></span>`).join("");
      $("#ev", el).textContent = `≈ ${fmtUsd(ev)} USDT`;
    }
    const left = Math.max(0, nextDropAt() - Date.now());
    const dd = Math.floor(left / 86400e3), hh = Math.floor((left % 86400e3) / 3600e3), mm = Math.floor((left % 3600e3) / 60e3);
    $("#dropIn", el).textContent = dd ? `${dd} д ${hh} ч` : `${hh} ч ${mm} мин`;
    const left2 = Math.max(0, nextDayAt() - Date.now());
    $("#dailyIn", el).textContent = `${Math.floor(left2 / 3600e3)} ч ${Math.floor((left2 % 3600e3) / 60e3)} мин`;
    drawCraft();
    const n = store.boxes.length;
    $("#boxCount", el).textContent = String(n);
    el.querySelectorAll("#openPacks .pack").forEach((b) => (b.disabled = +b.dataset.n > n));
  };

  // ── ежедневное ──
  let daily = null;
  const drawDaily = () => {
    if (!alive || !daily) return;
    const fb = $("#freeBox", el);
    fb.disabled = daily.freeBoxClaimed;
    fb.textContent = daily.freeBoxClaimed ? "Получен ✓" : "Забрать";
    $("#quests", el).innerHTML = daily.quests.map((q) => `
      <div class="quest ${q.claimed ? "done" : ""}">
        <div class="q-main"><b>${q.title}</b>
          <div class="q-bar"><i style="width:${(q.progress / q.goal) * 100}%"></i></div>
          <small class="muted">${q.progress} / ${q.goal} · награда ${q.reward} USDT</small></div>
        <button class="btn btn-sm ${q.progress >= q.goal && !q.claimed ? "btn-primary" : ""}" data-q="${q.id}" ${q.progress < q.goal || q.claimed ? "disabled" : ""}>${q.claimed ? "✓" : "Забрать"}</button>
      </div>`).join("");
  };
  const refreshDaily = async () => {
    try { daily = await loadDaily(); drawDaily(); } catch (e) { console.error(e); }
  };
  $("#freeBox", el).onclick = async (e) => {
    e.currentTarget.disabled = true;
    try { await claimFreeBox(); toast("Бесплатный бокс твой — открывай!", "ok"); } catch (e2) { toast(tradeError(e2), "err"); }
    refreshDaily();
  };
  $("#quests", el).onclick = async (e) => {
    const b = e.target.closest("button[data-q]");
    if (!b) return;
    b.disabled = true;
    const q = daily.quests.find((x) => x.id === b.dataset.q);
    try { await claimQuest(q); toast(`+${q.reward} USDT за задание`, "ok"); } catch (e2) { toast(tradeError(e2), "err"); }
    refreshDaily();
  };
  refreshDaily();
  const dailyT = setInterval(refreshDaily, 60000);

  // ── крафт ──
  const drawCraft = () => {
    if (!alive) return;
    const rows = TIERS.slice(1).reverse().map((t) => {
      const mine = store.nfts.filter((n) => n.item.tier === t);
      const target = craftTarget(t.name);
      const can = mine.length >= CRAFT_COST;
      return `<div class="craft-row">
        <span><span class="tier ${t.cls}">${t.name}</span> ×${CRAFT_COST} → <span class="tier ${target.cls}">${target.name}</span></span>
        <span class="muted small">у тебя ${mine.length}</span>
        <button class="btn btn-sm ${can ? "btn-primary" : ""}" data-craft="${t.name}" ${can ? "" : "disabled"}>Скрафтить</button>
      </div>`;
    });
    $("#craftRows", el).innerHTML = rows.join("");
  };
  $("#craftRows", el).onclick = async (e) => {
    const b = e.target.closest("button[data-craft]");
    if (!b) return;
    const tierName = b.dataset.craft;
    // берём 3 самых дешёвых токена этой редкости
    const pickList = store.nfts.filter((n) => n.item.tier.name === tierName)
      .sort((x, y) => (itemUsd(x.item) || 0) - (itemUsd(y.item) || 0)).slice(0, CRAFT_COST).map((n) => n.item);
    if (!confirm(`Сжечь ${pickList.map((it) => it.name).join(", ")} и получить случайный токен редкости «${craftTarget(tierName).name}»?`)) return;
    b.disabled = true;
    try {
      const it = await craft(pickList);
      showResult(it, "Скрафчено!");
      refreshDaily();
    } catch (e2) {
      toast(tradeError(e2), "err");
      b.disabled = false;
    }
  };

  $("#buyPacks", el).onclick = async (e) => {
    const b = e.target.closest(".pack");
    if (!b) return;
    const n = +b.dataset.n;
    el.querySelectorAll("#buyPacks .pack").forEach((x) => (x.disabled = true));
    try {
      await buyBoxes(n);
      toast(n === 1 ? "Мистери-бокс куплен" : `Куплено боксов: ${n}`, "ok");
    } catch (e2) {
      toast(tradeError(e2), "err");
    } finally {
      el.querySelectorAll("#buyPacks .pack").forEach((x) => (x.disabled = false));
    }
  };
  $("#openPacks", el).onclick = (e) => {
    const b = e.target.closest(".pack");
    if (b && !b.disabled) openReveal(+b.dataset.n);
  };

  const draw = () => {
    for (const c of COLLECTIONS) {
      const card = el.querySelector(`[data-col="${c.id}"]`);
      const fu = floorUsd(c);
      card.querySelector('[data-f="floor"]').innerHTML = `${fu != null ? fmtUsd(fu) : "—"} <small class="muted">${fmtCoin(floorCoin(c))} ${c.chain}</small>`;
      card.querySelector('[data-f="chg"]').innerHTML = chg(floorChange24h(c));
    }
    $("#myNft", el).textContent = store.nfts.length ? `Мои NFT · ${store.nfts.length}` : "Мои NFT";
  };
  const s1 = onPrices(() => { draw(); drawBox(); }), s2 = onStore(() => { draw(); drawBox(); });
  const t = setInterval(drawBox, 5000);
  return () => { alive = false; s1(); s2(); unsubOwned(); clearInterval(t); clearInterval(dailyT); };
}

// ═════════ открытие бокса ═════════
export async function openReveal(count = 1) {
  if (!store.boxes.length) return;
  if (count > 1) return openRevealMany(Math.min(count, store.boxes.length));
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="modal glass reveal">
    <div class="reveal-stage"><div class="reveal-box shaking">${boxSvg("nft-art")}</div></div>
    <p class="muted" id="rvText">Открываем бокс…</p>
    <div class="reveal-actions" id="rvActions"></div>
  </div>`;
  document.body.append(back);
  const close = () => back.remove();
  back.addEventListener("click", (e) => { if (e.target === back) close(); });

  const box = store.boxes[0];
  const minWait = new Promise((r) => setTimeout(r, 1600));
  let item;
  try {
    [item] = await Promise.all([revealBox(box.id), minWait]);
  } catch (e) {
    console.error(e);
    $("#rvText", back).textContent = tradeError(e);
    $("#rvActions", back).innerHTML = '<button class="btn btn-block" id="rvClose">Закрыть</button>';
    $("#rvClose", back).onclick = close;
    return;
  }
  const price = itemUsd(item);
  if (item.tier.cls === "t-epic" || item.tier.cls === "t-leg") confetti();
  back.querySelector(".reveal-stage").innerHTML = `<div class="reveal-item ${item.tier.cls}">${nftSvg(item, "nft-art")}</div>`;
  $("#rvText", back).innerHTML = `
    <span class="tier ${item.tier.cls}">${item.tier.name}</span>
    <b class="rv-name">${esc(item.name)}</b>
    <span class="muted">${item.col.name} · цена ≈ <b class="rv-price">${price != null ? fmtUsd(price) : "—"} USDT</b></span>`;
  const left = store.boxes.filter((b) => b.id !== box.id).length;
  $("#rvActions", back).innerHTML = `
    <a class="btn btn-primary btn-block" href="#/nft/${item.col.id}/${item.n}" id="rvGo">Смотреть токен</a>
    <button class="btn btn-sell btn-block" id="rvSell">Продать сразу · ${price != null ? fmtUsd(price * (1 - FEE)) : "—"} USDT</button>
    ${left > 0 ? `<button class="btn btn-block" id="rvMore">Открыть ещё · осталось ${left}</button>` : ""}
    <button class="btn btn-block" id="rvClose">Закрыть</button>`;
  $("#rvGo", back).onclick = close;
  $("#rvClose", back).onclick = close;
  $("#rvSell", back).onclick = async (e) => {
    e.currentTarget.disabled = true;
    try {
      const r = await sellNft(item);
      toast(`${item.name} продан за ${fmtUsd(r.price - r.fee)} USDT`, "ok");
      close();
    } catch (e2) {
      toast(tradeError(e2), "err");
      e.currentTarget.disabled = false;
    }
  };
  if (left > 0) $("#rvMore", back).onclick = () => { close(); openReveal(); };
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
        <div class="col-title"><h1 class="page-title">${col.name}</h1><span class="chain">${col.chain}</span>${col.boxOnly ? '<span class="chain box-only">ТОЛЬКО БОКС</span>' : ""}</div>
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
      ${items[0].traits["Предмет"] ? `<label class="sort glass"><span class="muted">Предмет</span>
        <select id="kind"><option value="">Все</option>${[...new Set(items.map((it) => it.traits["Предмет"]))].map((k) => `<option>${k}</option>`).join("")}</select></label>` : ""}
      <label class="sort glass"><span class="muted">Сортировка</span>
        <select id="sort"><option value="rank">Редкость</option><option value="cheap">Цена ↑</option><option value="expensive">Цена ↓</option><option value="n">Номер</option></select>
      </label>
    </div>
    <div class="nft-grid" id="grid"></div>
    <button class="btn btn-block more" id="more" hidden>Показать ещё</button>`;

  let owners = {}, filter = "all", sort = "rank", kind = "", shown = PAGE, alive = true;
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
    const state = !o ? `<span class="own free">${col.boxOnly ? "В боксе" : "Свободен"}</span>` : mine ? '<span class="own mine">Твой</span>' : `<span class="own taken">${esc(o.ownerNick)}</span>`;
    return `
      <a class="nft-card glass" href="#/nft/${col.id}/${it.n}" data-id="${it.id}">
        ${nftSvg(it, "nft-art")}
        <div class="nft-meta">
          <div class="nft-name"><b>${esc(it.short || (it.col.id === "deck" ? it.name : `#${it.n}`))}</b>${tierBadge(it)}</div>
          <div class="nft-price"><span data-price="${it.id}">—</span>${state}</div>
        </div>
      </a>`;
  };

  const list = () => {
    let arr = items.filter((it) => {
      if (kind && it.traits["Предмет"] !== kind) return false;
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
  if ($("#kind", el)) $("#kind", el).onchange = (e) => { kind = e.target.value; shown = PAGE; drawGrid(); };
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
          <button class="btn btn-block" id="iSend" hidden style="margin-top:8px">Отправить другу по адресу</button>
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
    $("#iOwner", el).innerHTML = !owner ? `<span class="own free">${col.boxOnly ? "Ещё в мистери-боксе" : "Свободен — продаёт маркет"}</span>` : mine ? '<span class="own mine">Ты</span>' : esc(owner.ownerNick);
    $("#iBoughtRow", el).hidden = !mine;
    $("#iSend", el).hidden = !mine;
    $("#iPnlRow", el).hidden = !mine;
    if (mine) {
      $("#iBought", el).textContent = `${fmtUsd(owner.price)} USDT · ${fmtDate(owner.boughtAt?.toMillis?.())}`;
      const pnl = fu ? price * (1 - FEE) - owner.price : null;
      $("#iPnl", el).innerHTML = pnl == null ? "—" : `<span class="${pnl >= 0 ? "up" : "down"}">${pnl >= 0 ? "+" : "−"}${fmtUsd(Math.abs(pnl))} USDT</span>`;
    }
    if (busy) return;
    if (!loaded) { btn.disabled = true; btn.textContent = "…"; return; }
    if (!owner && col.boxOnly) {
      btn.className = "btn btn-block";
      btn.textContent = "Только из мистери-бокса";
      btn.disabled = true;
    } else if (!owner) {
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

  $("#iSend", el).onclick = () => openSend({ nftId: it.id });
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

// ═════════ массовое открытие ═════════
const TIER_ORDER = ["t-leg", "t-epic", "t-rare", "t-unc", "t-com"];
async function openRevealMany(count) {
  const ids = store.boxes.slice(0, count).map((b) => b.id);
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="modal glass reveal wide">
    <div class="reveal-stage"><div class="reveal-box shaking">${boxSvg("nft-art")}</div></div>
    <p class="muted" id="rvText">Открываем 0 / ${count}…</p>
    <div class="progress"><i id="rvBar"></i></div>
    <div class="reveal-actions" id="rvActions"></div>
  </div>`;
  document.body.append(back);
  let done = false;
  const close = () => back.remove();
  back.addEventListener("click", (e) => { if (done && e.target === back) close(); });
  const prog = (k, n, word = "Открываем") => {
    $("#rvText", back).textContent = `${word} ${k} / ${n}…`;
    $("#rvBar", back).style.width = `${(k / n) * 100}%`;
  };

  const [{ items, error }] = await Promise.all([revealMany(ids, (k, n) => prog(k, n)), new Promise((r) => setTimeout(r, 1200))]);
  done = true;
  if (!items.length) {
    $("#rvText", back).textContent = tradeError(error);
    $("#rvActions", back).innerHTML = '<button class="btn btn-block" id="rvClose">Закрыть</button>';
    $("#rvClose", back).onclick = close;
    return;
  }
  items.sort((a, b) => TIER_ORDER.indexOf(a.tier.cls) - TIER_ORDER.indexOf(b.tier.cls) || (itemUsd(b) || 0) - (itemUsd(a) || 0));
  const value = items.reduce((s, it) => s + (itemUsd(it) || 0), 0);
  const spent = items.length * (BOX.price * (1 + FEE) + BOX.reveal);
  const commons = items.filter((it) => it.tier.cls === "t-com");
  const commonsValue = commons.reduce((s, it) => s + (itemUsd(it) || 0), 0) * (1 - FEE);
  const counts = TIER_ORDER.map((c) => [c, items.filter((it) => it.tier.cls === c)]).filter(([, a]) => a.length);
  const best = items[0];
  if (best.tier.cls === "t-epic" || best.tier.cls === "t-leg") confetti();
  const diff = value - spent;

  back.querySelector(".reveal-stage").outerHTML = `<div class="reveal-grid">${items.map((it, i) => `
    <a class="rg-item ${it.tier.cls} ${i === 0 ? "best" : ""}" href="#/nft/${it.col.id}/${it.n}" style="animation-delay:${Math.min(i, 30) * 40}ms" title="${esc(it.name)}">${nftSvg(it, "nft-art")}</a>`).join("")}</div>`;
  $("#rvText", back).innerHTML = `
    <b class="rv-name">Открыто ${items.length}${error ? ` из ${count}` : ""}</b>
    <span class="rv-tiers">${counts.map(([c, a]) => `<span class="tier ${c}">${a[0].tier.name} ×${a.length}</span>`).join("")}</span>
    <span class="muted">Лучший: <b class="rv-price">${esc(best.name)}</b> · ≈ ${fmtUsd(itemUsd(best) || 0)} USDT</span>
    <span class="muted">Стоимость всего ≈ <b class="rv-price">${fmtUsd(value)} USDT</b> · потрачено ${fmtUsd(spent)}
      · <span class="${diff >= 0 ? "up" : "down"}">${diff >= 0 ? "+" : "−"}${fmtUsd(Math.abs(diff))}</span></span>
    ${error ? `<span class="down small">${esc(tradeError(error))}</span>` : ""}`;
  back.querySelector(".progress").remove();
  const left = store.boxes.filter((b) => !ids.includes(b.id)).length;
  $("#rvActions", back).innerHTML = `
    ${commons.length && commons.length < items.length ? `<button class="btn btn-sell btn-block" id="rvSellCommon">Продать обычные (${commons.length}) · ≈ ${fmtUsd(commonsValue)} USDT</button>` : ""}
    <button class="btn btn-block" id="rvSellAll">Продать всё · ≈ ${fmtUsd(value * (1 - FEE))} USDT</button>
    <a class="btn btn-primary btn-block" href="#/wallet" id="rvWallet">Оставить и открыть кошелёк</a>
    ${left > 0 ? `<button class="btn btn-block" id="rvMore">Открыть ещё ${Math.min(left, count)} · осталось ${left}</button>` : ""}
    <button class="btn btn-block" id="rvClose">Закрыть</button>`;
  $("#rvClose", back).onclick = close;
  $("#rvWallet", back).onclick = close;
  back.querySelectorAll(".rg-item").forEach((a) => (a.onclick = close));
  if (left > 0) $("#rvMore", back).onclick = () => { close(); openReveal(Math.min(left, count)); };
  const sell = async (list, btn) => {
    back.querySelectorAll("#rvActions button").forEach((b) => (b.disabled = true));
    const r = await sellMany(list, (k, n) => (btn.textContent = `Продаём ${k} / ${n}…`));
    toast(`Продано ${r.sold} шт. за ${fmtUsd(r.total)} USDT`, "ok");
    close();
  };
  $("#rvSellAll", back).onclick = (e) => sell(items, e.currentTarget);
  if ($("#rvSellCommon", back)) $("#rvSellCommon", back).onclick = (e) => sell(commons, e.currentTarget);
}

// Простое окно результата (крафт).
function showResult(item, title) {
  const back = document.createElement("div");
  back.className = "modal-back";
  const price = itemUsd(item);
  back.innerHTML = `<div class="modal glass reveal">
    <div class="reveal-stage"><div class="reveal-item ${item.tier.cls}">${nftSvg(item, "nft-art")}</div></div>
    <p id="rvText"><b class="rv-name">${title}</b><span class="tier ${item.tier.cls}">${item.tier.name}</span>
      <b class="rv-name">${esc(item.name)}</b><span class="muted">${item.col.name} · ≈ <b class="rv-price">${price != null ? fmtUsd(price) : "—"} USDT</b></span></p>
    <div class="reveal-actions"><a class="btn btn-primary btn-block" href="#/nft/${item.col.id}/${item.n}" data-close>Смотреть токен</a><button class="btn btn-block" data-close>Закрыть</button></div>
  </div>`;
  document.body.append(back);
  back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-close]")) back.remove(); });
  if (item.tier.cls === "t-epic" || item.tier.cls === "t-leg" || item.tier.cls === "t-rare") confetti(item.tier.cls === "t-rare" ? 40 : 90);
}
