// Кошелёк — пока временная версия: показывает стартовый баланс USDT (этап 1).
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "../firebase.js";
import { getSession } from "../auth.js";
import { fmtUsd } from "../format.js";

export default {
  render(el) {
    el.innerHTML = `
      <div class="glass card placeholder">
        <p class="muted">Баланс USDT</p>
        <div class="big-num" id="usdt">…</div>
        <p class="muted" style="margin-top:10px">Полный кошелёк появится на этапе 4.</p>
      </div>`;
    const uid = getSession().user.uid;
    return onSnapshot(doc(db, "users", uid, "balances", "USDT"), (snap) => {
      el.querySelector("#usdt").textContent = snap.exists() ? `${fmtUsd(snap.data().amount)} USDT` : "нет данных";
    });
  },
};
