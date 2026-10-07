// 5. Рейтинг — топ игроков по стоимости портфеля и топ коллекционеров NFT.
import {
  collection, query, orderBy, limit, where, getDocs, getCountFromServer,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "../firebase.js";
import { getSession, START_USDT } from "../auth.js";
import { getItem, itemUsd } from "../nft-data.js";
import { fmtUsd, fmtPct } from "../format.js";
import { $, esc } from "../ui.js";

const TOP = 50;
const medal = (i) => (i < 3 ? `<span class="medal m${i + 1}">${i + 1}</span>` : `<span class="rank">${i + 1}</span>`);

export default {
  render(el) {
    el.innerHTML = `
      <section class="page-head">
        <div><h1 class="page-title">Рейтинг</h1><p class="page-sub" id="lbSub">Топ-${TOP} по стоимости портфеля · старт у всех 10 000 USDT</p></div>
        <button class="btn btn-sm" id="reload">Обновить</button>
      </section>
      <div class="seg lb-tabs" id="lbTabs"><button class="active" data-t="value">Портфель</button><button data-t="nft">Коллекционеры NFT</button></div>
      <div class="glass card">
        <div class="lb-head" id="lbHead"></div>
        <div id="lb"><div class="boot"><div class="spinner"></div></div></div>
      </div>`;

    let alive = true, tab = "value";
    const uid = () => getSession().user?.uid;
    const row = (i, id, nick, a, b, bCls = "muted") => `
      <a class="lb-row ${id === uid() ? "me" : ""}" href="#/player/${id}">
        ${medal(i)}
        <span class="lb-nick">${esc(nick)}${id === uid() ? ' <small class="you">ты</small>' : ""}</span>
        <span class="r"><b>${a}</b></span>
        <span class="r ${bCls}">${b}</span>
      </a>`;

    const loadValue = async () => {
      $("#lbHead", el).innerHTML = '<span>#</span><span>Игрок</span><span class="r">Портфель</span><span class="r">Доход</span>';
      $("#lbSub", el).textContent = `Топ-${TOP} по стоимости портфеля · старт у всех 10 000 USDT`;
      const snap = await getDocs(query(collection(db, "users"), orderBy("portfolioValue", "desc"), limit(TOP)));
      if (!alive || tab !== "value") return;
      const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const r = (i, u) => {
        const pnl = ((u.portfolioValue - START_USDT) / START_USDT) * 100;
        return row(i, u.id, u.nick, fmtUsd(u.portfolioValue), fmtPct(pnl), pnl > 0.005 ? "up" : pnl < -0.005 ? "down" : "muted");
      };
      let html = users.map((u, i) => r(i, u)).join("");
      const me = getSession().profile;
      if (me && !users.some((u) => u.id === uid())) {
        const higher = await getCountFromServer(query(collection(db, "users"), where("portfolioValue", ">", me.portfolioValue)));
        html += `<div class="lb-gap">···</div>${r(higher.data().count, { ...me, id: uid() })}`;
      }
      $("#lb", el).innerHTML = html || '<div class="empty">Пока никого нет</div>';
    };

    // Коллекционеры: все NFT публичны → считаем по владельцам.
    const loadNft = async () => {
      $("#lbHead", el).innerHTML = '<span>#</span><span>Игрок</span><span class="r">NFT</span><span class="r">Стоимость</span>';
      $("#lbSub", el).textContent = "Кто собрал больше всего NFT";
      const snap = await getDocs(collection(db, "nfts"));
      if (!alive || tab !== "nft") return;
      const by = {};
      snap.forEach((d) => {
        const o = d.data();
        const it = getItem(d.id);
        const b = (by[o.owner] = by[o.owner] || { id: o.owner, nick: o.ownerNick, n: 0, v: 0 });
        b.n++;
        b.v += (it && itemUsd(it)) || 0;
      });
      const list = Object.values(by).sort((a, b) => b.v - a.v).slice(0, TOP);
      $("#lb", el).innerHTML = list.map((u, i) => row(i, u.id, u.nick, `${u.n} шт`, `${fmtUsd(u.v)}`)).join("") || '<div class="empty">Пока никто не собрал NFT</div>';
    };

    const load = async () => {
      try { await (tab === "value" ? loadValue() : loadNft()); } catch (e) {
        console.error(e);
        if (alive) $("#lb", el).innerHTML = '<div class="empty">Не удалось загрузить рейтинг</div>';
      }
    };
    $("#lbTabs", el).onclick = (e) => {
      const b = e.target.closest("button[data-t]");
      if (!b) return;
      tab = b.dataset.t;
      el.querySelectorAll("#lbTabs button").forEach((x) => x.classList.toggle("active", x === b));
      $("#lb", el).innerHTML = '<div class="boot"><div class="spinner"></div></div>';
      load();
    };
    $("#reload", el).onclick = load;
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  },
};
