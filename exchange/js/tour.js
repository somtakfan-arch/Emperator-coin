// Короткое обучение для новичков (показывается один раз).
import { prefs, setPref } from "./prefs.js";

const STEPS = [
  ["👋", "Добро пожаловать в Bed Exchange!", "Это симулятор биржи: цены настоящие, деньги виртуальные. У тебя 10 000 USDT — попробуй их приумножить."],
  ["📈", "Рынки и Торговля", "На «Рынках» — все монеты. Нажми на любую, чтобы открыть график и купить её. Кнопка «Рынок» покупает сразу."],
  ["🎁", "NFT и боксы", "Во вкладке NFT забирай бесплатный бокс и выполняй задания каждый день. Из боксов выпадают редкие NFT, их можно крафтить и продавать."],
  ["👛", "Кошелёк", "Здесь всё твоё имущество, прибыль и твой адрес — по нему друзья могут прислать монеты или NFT."],
  ["🏆", "Рейтинг", "Соревнуйся с друзьями: у кого больше портфель. Если что-то непонятно — открой «Справку» в меню профиля."],
];

let open = false;
export function startTour(force = false) {
  if (open || (prefs().tourDone && !force)) return;
  open = true;
  let i = 0;
  const back = document.createElement("div");
  back.className = "modal-back";
  document.body.append(back);
  const done = () => { setPref("tourDone", true); back.remove(); open = false; };
  const draw = () => {
    const [ic, title, text] = STEPS[i];
    back.innerHTML = `<div class="modal glass tour">
      <div class="tour-ic">${ic}</div><h3 class="modal-title">${title}</h3><p class="muted">${text}</p>
      <div class="tour-dots">${STEPS.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
      <div class="tour-actions"><button class="btn" id="tSkip">${i ? "Назад" : "Пропустить"}</button><button class="btn btn-primary" id="tNext">${i === STEPS.length - 1 ? "Начать!" : "Дальше"}</button></div>
    </div>`;
    back.querySelector("#tNext").onclick = () => (i === STEPS.length - 1 ? done() : (i++, draw()));
    back.querySelector("#tSkip").onclick = () => (i ? (i--, draw()) : done());
  };
  draw();
}
