// Окна «Получить» (мой адрес) и «Отправить» (перевод по адресу).
import { store } from "../store.js";
import { PAIRS } from "../market.js";
import { addressOf, lookupAddress, sendCoin, sendNft } from "../transfer.js";
import { tradeError } from "../trade.js";
import { fmtAmount, fmtUsd, parseNum } from "../format.js";
import { $, esc, toast } from "../ui.js";

function modal(html) {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="modal glass">${html}</div>`;
  document.body.append(back);
  const close = () => back.remove();
  back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-close]")) close(); });
  return { back, close };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Адрес скопирован", "ok");
  } catch {
    prompt("Скопируй адрес:", text);
  }
}

export function openReceive() {
  const addr = addressOf(store.uid);
  const { back } = modal(`
    <h3 class="modal-title">Получить</h3>
    <p class="muted small">Отправь этот адрес другу — он сможет перевести тебе монеты, USDT или NFT. Деньги виртуальные.</p>
    <div class="addr-box"><code>${addr}</code></div>
    <button class="btn btn-primary btn-block" id="cp">Скопировать адрес</button>
    <button class="btn btn-block" data-close style="margin-top:8px">Закрыть</button>`);
  $("#cp", back).onclick = () => copyText(addr);
}

// prefill: { nftId } — сразу выбрать NFT
export function openSend(prefill = {}) {
  const coins = [{ coin: "USDT", free: store.balances.USDT?.amount || 0 },
    ...PAIRS.map((p) => ({ coin: p.base, free: store.balances[p.base]?.amount || 0 })).filter((c) => c.free > 1e-10)];
  const nfts = store.nfts;
  const { back, close } = modal(`
    <h3 class="modal-title">Отправить</h3>
    <label class="field"><span>Адрес получателя</span>
      <input class="input mono" id="to" placeholder="BED…" autocomplete="off" spellcheck="false" />
    </label>
    <div class="to-info small" id="toInfo"></div>
    <label class="field"><span>Что отправить</span>
      <select class="input" id="asset">
        <optgroup label="Монеты">${coins.map((c) => `<option value="c:${c.coin}">${c.coin} · доступно ${c.coin === "USDT" ? fmtUsd(c.free) : fmtAmount(c.free)}</option>`).join("")}</optgroup>
        ${nfts.length ? `<optgroup label="NFT">${nfts.map((n) => `<option value="n:${n.id}" ${prefill.nftId === n.id ? "selected" : ""}>${esc(n.item.name)}</option>`).join("")}</optgroup>` : ""}
      </select>
    </label>
    <label class="field ifield" id="amtField"><span>Сумма</span>
      <input class="input" id="amt" inputmode="decimal" placeholder="0" /><em id="amtCoin">USDT</em>
    </label>
    <div class="kv" id="availRow"><span>Доступно</span><span><span id="avail">—</span> <button class="link-btn" id="max" type="button">Макс</button></span></div>
    <div class="kv"><span>Комиссия сети</span><span>0 — переводы бесплатные</span></div>
    <div class="form-error" id="err"></div>
    <button class="btn btn-primary btn-block" id="go">Отправить</button>
    <button class="btn btn-block" data-close style="margin-top:8px">Отмена</button>`);

  const to = $("#to", back), asset = $("#asset", back), amt = $("#amt", back), err = $("#err", back), go = $("#go", back);
  let recipient = null, lookupT = null;

  const sel = () => {
    const [kind, id] = asset.value.split(":");
    return kind === "n" ? { nft: nfts.find((n) => n.id === id) } : { coin: id, free: coins.find((c) => c.coin === id)?.free || 0 };
  };
  const refresh = () => {
    const s = sel();
    $("#amtField", back).hidden = !!s.nft;
    $("#availRow", back).hidden = !!s.nft;
    if (!s.nft) {
      $("#amtCoin", back).textContent = s.coin;
      $("#avail", back).textContent = `${s.coin === "USDT" ? fmtUsd(s.free) : fmtAmount(s.free)} ${s.coin}`;
    }
    const what = s.nft ? s.nft.item.name : `${amt.value || "0"} ${s.coin}`;
    go.textContent = recipient ? `Отправить ${what} → ${recipient.nick}` : "Отправить";
  };
  asset.onchange = () => { amt.value = ""; err.textContent = ""; refresh(); };
  amt.oninput = () => { err.textContent = ""; refresh(); };
  $("#max", back).onclick = () => { const s = sel(); amt.value = s.coin === "USDT" ? String(Math.floor(s.free * 100) / 100) : String(Math.floor(s.free * 1e8) / 1e8); refresh(); };
  to.oninput = () => {
    recipient = null;
    err.textContent = "";
    clearTimeout(lookupT);
    const v = to.value.trim();
    $("#toInfo", back).textContent = "";
    refresh();
    if (v.length < 10) return;
    lookupT = setTimeout(async () => {
      try {
        recipient = await lookupAddress(v);
        $("#toInfo", back).innerHTML = `<span class="up">✓ Получатель: <b>${esc(recipient.nick)}</b></span>`;
      } catch (e) {
        $("#toInfo", back).innerHTML = `<span class="down">${esc(tradeError(e))}</span>`;
      }
      refresh();
    }, 350);
  };

  go.onclick = async () => {
    err.textContent = "";
    const s = sel();
    go.disabled = true;
    try {
      if (s.nft) {
        const r = await sendNft(to.value, s.nft.item);
        toast(`${s.nft.item.name} отправлен игроку ${r.to.nick}`, "ok");
      } else {
        const v = parseNum(amt.value);
        if (!(v > 0)) throw new Error("Укажи сумму");
        if (v > s.free + 1e-9) throw new Error(`Недостаточно ${s.coin}`);
        const r = await sendCoin(to.value, s.coin, v);
        toast(`Отправлено ${s.coin === "USDT" ? fmtUsd(r.amount) : fmtAmount(r.amount)} ${s.coin} → ${r.to.nick}`, "ok");
      }
      close();
    } catch (e) {
      console.error(e);
      err.textContent = e.message && !e.code ? e.message : tradeError(e);
      go.disabled = false;
    }
  };
  refresh();
  if (prefill.to) { to.value = prefill.to; to.dispatchEvent(new Event("input")); } else to.focus();
}
