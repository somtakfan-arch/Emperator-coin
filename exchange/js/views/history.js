// 4. История сделок.
import {
  collection, query, orderBy, limit, onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "../firebase.js";
import { store } from "../store.js";
import { PAIRS, pairBySymbol } from "../market.js";
import { fmtPrice, fmtAmount, fmtUsd, fmtDate } from "../format.js";
import { $, esc, coinIcon } from "../ui.js";
import { getItem, nftSvg, boxSvg } from "../nft-data.js";

const PAGE = 50;

export default {
  render(el) {
    el.innerHTML = `
      <section class="page-head">
        <div><h1 class="page-title">История сделок</h1><p class="page-sub" id="hSub">Все исполненные сделки</p></div>
      </section>
      <div class="chips" id="chips">
        <button class="chip active" data-f="">Все</button>
        <button class="chip" data-f="NFT">NFT</button>
        ${PAIRS.map((p) => `<button class="chip" data-f="${p.symbol}">${p.base}</button>`).join("")}
      </div>
      <div class="glass card">
        <div class="hlist-head hide-m"><span>Время</span><span>Пара</span><span>Сторона</span><span class="r">Цена</span><span class="r">Кол-во</span><span class="r">Сумма</span><span class="r">Комиссия</span></div>
        <div id="hList"><div class="boot"><div class="spinner"></div></div></div>
        <button class="btn btn-block more" id="more" hidden>Показать ещё</button>
      </div>`;

    let filter = "", n = PAGE, trades = [], full = false, unsub = null;

    const draw = () => {
      const list = filter ? trades.filter((t) => t.pair === filter) : trades;
      $("#hSub", el).textContent = trades.length ? `Сделок: ${trades.length}${full ? "" : "+"}` : "Все исполненные сделки";
      $("#hList", el).innerHTML = list.length ? list.map((t) => {
        const p = pairBySymbol(t.pair);
        const buy = t.side === "buy";
        const it = t.pair === "NFT" ? getItem(t.nft) : null;
        if (t.type === "quest" || t.type === "daily") return `
          <div class="hrow">
            <span class="muted h-time">${fmtDate(t.time?.toMillis?.())}</span>
            <span class="pair-cell sm"><span class="nft-mini">${boxSvg()}</span><b>${t.type === "daily" ? "Бесплатный бокс" : "Награда за задание"}</b></span>
            <span class="h-side"><span class="tag up">Бонус</span></span>
            <span class="r"><small class="lbl">Цена</small>—</span>
            <span class="r"><small class="lbl">Кол-во</small>1</span>
            <span class="r"><small class="lbl">Сумма</small>${t.type === "daily" ? "бокс" : `+${fmtUsd(t.total)} USDT`}</span>
            <span class="r muted"><small class="lbl">Комиссия</small>0</span>
          </div>`;
        if (t.type === "box") return `
          <div class="hrow">
            <span class="muted h-time">${fmtDate(t.time?.toMillis?.())}</span>
            <a class="pair-cell sm" href="#/nft"><span class="nft-mini">${boxSvg()}</span><b>Мистери-бокс</b></a>
            <span class="h-side"><span class="tag up">Покупка</span><small class="muted">бокс</small></span>
            <span class="r"><small class="lbl">Цена</small>${fmtUsd(t.price)}</span>
            <span class="r"><small class="lbl">Кол-во</small>1 шт</span>
            <span class="r"><small class="lbl">Сумма</small>${fmtUsd(t.total)}</span>
            <span class="r muted"><small class="lbl">Комиссия</small>${fmtUsd(t.fee)} USDT</span>
          </div>`;
        if (it) return `
          <div class="hrow">
            <span class="muted h-time">${fmtDate(t.time?.toMillis?.())}</span>
            <a class="pair-cell sm" href="#/nft/${it.col.id}/${it.n}"><span class="nft-mini">${nftSvg(it)}</span><b>${esc(it.name)}</b></a>
            <span class="h-side"><span class="tag ${buy ? "up" : "down"}">${t.type === "reveal" ? "Из бокса" : t.type === "craft" ? "Крафт" : buy ? "Покупка" : "Продажа"}</span><small class="muted">NFT</small></span>
            <span class="r"><small class="lbl">Цена</small>${fmtUsd(t.price)}</span>
            <span class="r"><small class="lbl">Кол-во</small>1 шт</span>
            <span class="r"><small class="lbl">Сумма</small>${fmtUsd(t.total)}</span>
            <span class="r muted"><small class="lbl">Комиссия</small>${fmtUsd(t.fee)} USDT</span>
          </div>`;
        return `
          <div class="hrow">
            <span class="muted h-time">${fmtDate(t.time?.toMillis?.())}</span>
            <span class="pair-cell sm">${coinIcon(p, "sm")}<span><b>${p?.base}</b><span class="muted">/USDT</span></span></span>
            <span class="h-side"><span class="tag ${buy ? "up" : "down"}">${buy ? "Покупка" : "Продажа"}</span><small class="muted">${t.type === "limit" ? "лимит" : "рынок"}</small></span>
            <span class="r"><small class="lbl">Цена</small>${fmtPrice(t.price)}</span>
            <span class="r"><small class="lbl">Кол-во</small>${fmtAmount(t.amount)} ${p?.base}</span>
            <span class="r"><small class="lbl">Сумма</small>${fmtUsd(t.total ?? t.price * t.amount)}</span>
            <span class="r muted"><small class="lbl">Комиссия</small>${t.feeAsset === "USDT" ? fmtUsd(t.fee) : fmtAmount(t.fee)} ${t.feeAsset}</span>
          </div>`;
      }).join("") : `<div class="empty">${trades.length ? "По этой паре сделок нет" : "Сделок пока нет — начни с вкладки «Торговля»"}</div>`;
      $("#more", el).hidden = full;
    };

    const subscribe = () => {
      unsub?.();
      unsub = onSnapshot(query(collection(db, "users", store.uid, "trades"), orderBy("time", "desc"), limit(n)), (snap) => {
        trades = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        full = snap.size < n;
        draw();
      }, (e) => {
        console.error(e);
        $("#hList", el).innerHTML = '<div class="empty">Не удалось загрузить историю</div>';
      });
    };

    $("#chips", el).onclick = (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      filter = b.dataset.f;
      el.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === b));
      draw();
    };
    $("#more", el).onclick = () => { n += PAGE; subscribe(); };

    subscribe();
    return () => unsub?.();
  },
};
