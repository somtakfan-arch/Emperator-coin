// 5. Рейтинг — топ игроков по стоимости портфеля.
import {
  collection, query, orderBy, limit, where, getDocs, getCountFromServer,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "../firebase.js";
import { getSession, START_USDT } from "../auth.js";
import { fmtUsd, fmtPct } from "../format.js";
import { $, esc } from "../ui.js";

const TOP = 50;
const medal = (i) => (i < 3 ? `<span class="medal m${i + 1}">${i + 1}</span>` : `<span class="rank">${i + 1}</span>`);

export default {
  render(el) {
    el.innerHTML = `
      <section class="page-head">
        <div><h1 class="page-title">Рейтинг</h1><p class="page-sub">Топ-${TOP} по стоимости портфеля · старт у всех 10 000 USDT</p></div>
        <button class="btn btn-sm" id="reload">Обновить</button>
      </section>
      <div class="glass card">
        <div class="lb-head"><span>#</span><span>Игрок</span><span class="r">Портфель</span><span class="r">Доход</span></div>
        <div id="lb"><div class="boot"><div class="spinner"></div></div></div>
      </div>`;

    let alive = true;
    const row = (i, u, me) => {
      const pnl = ((u.portfolioValue - START_USDT) / START_USDT) * 100;
      return `
        <div class="lb-row ${me ? "me" : ""}">
          ${medal(i)}
          <span class="lb-nick">${esc(u.nick)}${me ? ' <small class="you">ты</small>' : ""}</span>
          <span class="r"><b>${fmtUsd(u.portfolioValue)}</b></span>
          <span class="r ${pnl > 0.005 ? "up" : pnl < -0.005 ? "down" : "muted"}">${fmtPct(pnl)}</span>
        </div>`;
    };

    const load = async () => {
      const uid = getSession().user?.uid;
      try {
        const snap = await getDocs(query(collection(db, "users"), orderBy("portfolioValue", "desc"), limit(TOP)));
        if (!alive) return;
        const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        let html = users.map((u, i) => row(i, u, u.id === uid)).join("");
        // если меня нет в топе — показываем моё место отдельно
        const me = getSession().profile;
        if (me && !users.some((u) => u.id === uid)) {
          const higher = await getCountFromServer(query(collection(db, "users"), where("portfolioValue", ">", me.portfolioValue)));
          html += `<div class="lb-gap">···</div>${row(higher.data().count, { ...me }, true)}`;
        }
        $("#lb", el).innerHTML = html || '<div class="empty">Пока никого нет</div>';
      } catch (e) {
        console.error(e);
        if (alive) $("#lb", el).innerHTML = '<div class="empty">Не удалось загрузить рейтинг</div>';
      }
    };
    $("#reload", el).onclick = load;
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  },
};
