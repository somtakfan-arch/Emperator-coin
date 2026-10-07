// Обмен в один клик: X → Y по рынку (через USDT, комиссия 0,1% за каждую сделку).
import { store } from "../store.js";
import { PAIRS, getPrice } from "../market.js";
import { marketOrder, tradeError, FEE, floor8 } from "../trade.js";
import { fmtAmount, fmtUsd, parseNum } from "../format.js";
import { $, toast } from "../ui.js";
import { sfx } from "../sound.js";

const priceOf = (c) => (c === "USDT" ? 1 : getPrice(`${c}USDT`));

export function openSwap() {
  const all = ["USDT", ...PAIRS.map((p) => p.base)];
  const have = all.filter((c) => (store.balances[c]?.amount || 0) > 1e-10);
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="modal glass">
    <h3 class="modal-title">Обмен</h3>
    <p class="muted small">Меняет одну монету на другую по рыночной цене. Комиссия 0,1% за каждую сделку.</p>
    <label class="field"><span>Отдаю</span><select class="input" id="swFrom">${have.map((c) => `<option>${c}</option>`).join("")}</select></label>
    <label class="field ifield"><span>Сколько</span><input class="input" id="swAmt" inputmode="decimal" placeholder="0" /><em id="swFromC">USDT</em></label>
    <div class="kv"><span>Доступно</span><span><span id="swAvail">—</span> <button class="link-btn" id="swMax" type="button">Макс</button></span></div>
    <button class="swap-flip" id="swFlip" type="button" aria-label="Поменять местами">⇅</button>
    <label class="field"><span>Получаю</span><select class="input" id="swTo">${all.map((c) => `<option ${c === "BTC" ? "selected" : ""}>${c}</option>`).join("")}</select></label>
    <div class="kv"><span>Получишь ≈</span><b id="swGet">—</b></div>
    <div class="kv"><span>Курс</span><span id="swRate">—</span></div>
    <div class="form-error" id="swErr"></div>
    <button class="btn btn-primary btn-block" id="swGo">Обменять</button>
    <button class="btn btn-block" data-close style="margin-top:8px">Отмена</button>
  </div>`;
  document.body.append(back);
  const close = () => back.remove();
  back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-close]")) close(); });
  const from = $("#swFrom", back), to = $("#swTo", back), amt = $("#swAmt", back), err = $("#swErr", back);

  const calc = () => {
    const f = from.value, t = to.value, a = parseNum(amt.value);
    const free = store.balances[f]?.amount || 0;
    $("#swFromC", back).textContent = f;
    $("#swAvail", back).textContent = `${f === "USDT" ? fmtUsd(free) : fmtAmount(free)} ${f}`;
    const pf = priceOf(f), pt = priceOf(t);
    const legs = (f === "USDT" ? 0 : 1) + (t === "USDT" ? 0 : 1);
    if (pf && pt) $("#swRate", back).textContent = `1 ${f} ≈ ${fmtAmount(pf / pt, 8)} ${t}`;
    $("#swGet", back).textContent = a > 0 && pf && pt && f !== t ? `${fmtAmount((a * pf / pt) * (1 - FEE) ** legs, 8)} ${t}` : "—";
  };
  [from, to].forEach((s) => (s.onchange = () => { err.textContent = ""; calc(); }));
  amt.oninput = () => { err.textContent = ""; calc(); };
  $("#swMax", back).onclick = () => { const f = from.value; const v = store.balances[f]?.amount || 0; amt.value = f === "USDT" ? String(Math.floor(v * 100) / 100) : String(floor8(v)); calc(); };
  $("#swFlip", back).onclick = () => {
    const t = to.value;
    if (have.includes(t)) { to.value = from.value; from.value = t; amt.value = ""; calc(); }
    else err.textContent = `У тебя нет ${t}, чтобы отдать`;
  };

  $("#swGo", back).onclick = async (e) => {
    const f = from.value, t = to.value, a = parseNum(amt.value);
    err.textContent = "";
    if (f === t) return (err.textContent = "Выбери разные монеты");
    if (!(a > 0)) return (err.textContent = "Укажи сумму");
    if (a > (store.balances[f]?.amount || 0) + 1e-9) return (err.textContent = `Недостаточно ${f}`);
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      let usdt = a;
      if (f !== "USDT") {
        const r = await marketOrder(`${f}USDT`, "sell", a);
        usdt = r.received;
      }
      if (t !== "USDT") {
        const pt = getPrice(`${t}USDT`);
        await marketOrder(`${t}USDT`, "buy", floor8((usdt * 0.9999) / pt));
      }
      toast(`Обмен ${f} → ${t} выполнен`, "ok");
      sfx.coin();
      close();
    } catch (e2) {
      console.error(e2);
      err.textContent = tradeError(e2);
      btn.disabled = false;
    }
  };
  calc();
}
