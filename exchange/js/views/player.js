// Профиль игрока: #/player — свой (уровень, статистика, ачивки), #/player/<uid> — чужой (витрина NFT).
import {
  doc, getDoc, collection, query, where, getDocs, getCountFromServer,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "../firebase.js";
import { getSession, START_USDT } from "../auth.js";
import { store, onStore } from "../store.js";
import { getItem, itemUsd, nftSvg } from "../nft-data.js";
import { addressOf } from "../transfer.js";
import { loadTrades, computeStats, computeAchievements, computeLevel } from "../stats.js";
import { openSend, copyText } from "./send.js";
import { fmtUsd, fmtPct, fmtDate, fmtAmount } from "../format.js";
import { $, esc } from "../ui.js";

export default {
  render(el, params) {
    const me = getSession().user.uid;
    const uid = params[0] || me;
    const self = uid === me;
    let alive = true;

    el.innerHTML = `
      <section class="glass card profile-head">
        <div class="pf-avatar" id="pfAvatar">…</div>
        <div class="pf-main">
          <h1 class="page-title" id="pfNick">…</h1>
          <div class="muted small" id="pfMeta"></div>
          <div class="pf-level" id="pfLevel" hidden></div>
        </div>
        <div class="pf-value"><small class="muted">Портфель</small><b id="pfValue">—</b><span id="pfPnl"></span></div>
      </section>
      <div class="glass addr-card">
        <div><small class="muted">Адрес</small><code>${addressOf(uid)}</code></div>
        ${self ? '<button class="btn btn-sm" id="pfCopy">Копировать</button>' : '<button class="btn btn-sm btn-primary" id="pfSend">Отправить</button>'}
      </div>
      ${self ? `
      <section class="glass card"><p class="card-title">Статистика</p><div class="stat-grid" id="pfStats"><div class="boot"><div class="spinner"></div></div></div></section>
      <section class="glass card"><p class="card-title">Ачивки <span class="count" id="achCount"></span></p><div class="ach-grid" id="pfAch"></div></section>` : ""}
      <section class="glass card"><p class="card-title">Витрина NFT <span class="count" id="pfNftCount"></span><span class="muted" id="pfNftValue"></span></p><div id="pfNfts"><div class="boot"><div class="spinner"></div></div></div></section>`;

    if (self) $("#pfCopy", el).onclick = () => copyText(addressOf(uid));
    else $("#pfSend", el).onclick = () => openSend({ to: addressOf(uid) });

    (async () => {
      try {
        const u = await getDoc(doc(db, "users", uid));
        if (!alive) return;
        if (!u.exists()) { el.innerHTML = '<div class="glass card placeholder"><h2>Игрок не найден</h2></div>'; return; }
        const p = u.data();
        $("#pfAvatar", el).textContent = (p.nick || "?")[0].toUpperCase();
        $("#pfNick", el).innerHTML = `${esc(p.nick)}${self ? ' <small class="you">ты</small>' : ""}`;
        const pnl = ((p.portfolioValue - START_USDT) / START_USDT) * 100;
        $("#pfValue", el).textContent = `${fmtUsd(p.portfolioValue)} USDT`;
        $("#pfPnl", el).innerHTML = `<span class="${pnl >= 0 ? "up" : "down"}">${fmtPct(pnl)}</span>`;
        const higher = await getCountFromServer(query(collection(db, "users"), where("portfolioValue", ">", p.portfolioValue)));
        if (alive) $("#pfMeta", el).textContent = `Место в рейтинге: ${higher.data().count + 1} · в игре с ${fmtDate(p.createdAt?.toMillis?.()).split(",")[0]}`;
      } catch (e) { console.error(e); }
    })();

    // витрина NFT (публичные данные)
    getDocs(query(collection(db, "nfts"), where("owner", "==", uid))).then((snap) => {
      if (!alive) return;
      const list = snap.docs.map((d) => getItem(d.id)).filter(Boolean).sort((a, b) => (itemUsd(b) || 0) - (itemUsd(a) || 0));
      $("#pfNftCount", el).textContent = list.length || "";
      $("#pfNftValue", el).textContent = list.length ? ` · ${fmtUsd(list.reduce((s, it) => s + (itemUsd(it) || 0), 0))} USDT` : "";
      $("#pfNfts", el).innerHTML = list.length ? `<div class="nft-grid small">${list.slice(0, 24).map((it) => `
        <a class="nft-card glass" href="#/nft/${it.col.id}/${it.n}">${nftSvg(it, "nft-art")}
          <div class="nft-meta"><div class="nft-name"><b>${esc(it.short || it.name)}</b><span class="tier ${it.tier.cls}">${it.tier.name}</span></div></div></a>`).join("")}</div>
          ${list.length > 24 ? `<p class="muted small" style="margin-top:8px">и ещё ${list.length - 24}…</p>` : ""}`
        : '<div class="empty">NFT пока нет</div>';
    }).catch((e) => console.error(e));

    // своя статистика, уровень и ачивки
    let stats = null;
    const drawSelf = () => {
      if (!alive || !stats) return;
      const ach = computeAchievements(stats);
      const lv = computeLevel(stats, ach);
      const L = $("#pfLevel", el);
      L.hidden = false;
      L.innerHTML = `<span class="lv-badge">Ур. ${lv.level}</span><b>${lv.title}</b><div class="q-bar"><i style="width:${(lv.progress * 100).toFixed(1)}%"></i></div><small class="muted">${lv.xp} XP · до следующего уровня ${lv.toNext} XP</small>`;
      const S = [
        ["Сделок", stats.trades], ["Оборот", `${fmtUsd(stats.volume)} USDT`], ["Комиссий заплачено", `${fmtUsd(stats.fees)} USDT`],
        ["Самая крупная сделка", `${fmtUsd(stats.biggest)} USDT`], ["Любимая монета", stats.favPair || "—"], ["Лимиток исполнено", stats.limits],
        ["Боксов открыто", stats.reveals], ["NFT куплено / продано", `${stats.nftBought} / ${stats.nftSold}`], ["Крафтов", stats.crafts],
        ["Заданий выполнено", stats.quests], ["Дней в игре", stats.activeDays], ["Монет на балансе", fmtAmount(Object.keys(store.balances).length)],
      ];
      $("#pfStats", el).innerHTML = S.map(([k, v]) => `<div class="stat"><small>${k}</small><b>${v}</b></div>`).join("");
      $("#achCount", el).textContent = `${ach.filter((a) => a.done).length} / ${ach.length}`;
      $("#pfAch", el).innerHTML = ach.sort((a, b) => b.done - a.done || b.pct - a.pct).map((a) => `
        <div class="ach ${a.done ? "done" : ""}" title="${esc(a.desc)}">
          <span class="ach-icon">${a.icon}</span>
          <b>${a.name}</b><small class="muted">${a.desc}</small>
          ${a.done ? '<small class="up">Получено ✓</small>' : `<div class="q-bar"><i style="width:${(a.pct * 100).toFixed(0)}%"></i></div>`}
        </div>`).join("");
    };
    let unsub = () => {};
    if (self) {
      loadTrades().then((t) => { stats = computeStats(t); drawSelf(); }).catch((e) => console.error(e));
      unsub = onStore(drawSelf);
    }
    return () => { alive = false; unsub(); };
  },
};
