// Точка входа: сессия, навигация, роутер по #hash.
import { isConfigured } from "./firebase.js";
import { initAuth, onSession, logout } from "./auth.js";
import { $, esc, icon, toast } from "./ui.js";
import authView from "./views/auth.js";
import markets from "./views/markets.js";
import trade from "./views/trade.js";
import wallet from "./views/wallet.js";
import history from "./views/history.js";
import leaderboard from "./views/leaderboard.js";

const ROUTES = {
  markets: { view: markets, label: "Рынки" },
  trade: { view: trade, label: "Торговля" },
  wallet: { view: wallet, label: "Кошелёк" },
  history: { view: history, label: "История" },
  leaderboard: { view: leaderboard, label: "Рейтинг" },
};

const viewEl = $("#view");
let cleanup = null;
let currentKey = null;

function parseHash() {
  const [, name = "markets", ...params] = location.hash.replace(/^#/, "").split("/");
  return { name: ROUTES[name] ? name : "markets", params };
}

function mount(view, params) {
  try { cleanup?.(); } catch (e) { console.error(e); }
  cleanup = null;
  viewEl.innerHTML = "";
  cleanup = view.render(viewEl, params) || null;
  window.scrollTo(0, 0);
}

// ───────── навигация ─────────
function renderNav() {
  const items = Object.entries(ROUTES);
  $("#tabbar").innerHTML = items
    .map(([k, r]) => `<a class="tab" data-route="${k}" href="#/${k}">${icon(k)}<span>${r.label}</span></a>`)
    .join("");
  $("#navDesktop").innerHTML = items
    .map(([k, r]) => `<a data-route="${k}" href="#/${k}">${r.label}</a>`)
    .join("");
}

function markActive(name) {
  document.querySelectorAll("[data-route]").forEach((a) => a.classList.toggle("active", a.dataset.route === name));
}

function renderUser(session) {
  const slot = $("#userSlot");
  if (!session?.user) { slot.innerHTML = ""; return; }
  const nick = session.profile?.nick || session.user.displayName || "Игрок";
  slot.innerHTML = `
    <button class="user-chip" id="userBtn" aria-haspopup="true" aria-expanded="false">
      <span class="nick">${esc(nick)}</span>
      <span class="avatar">${esc(nick[0].toUpperCase())}</span>
    </button>
    <div class="menu glass" id="userMenu" hidden>
      <div class="menu-head">${esc(nick)}<small>${esc(session.user.email || "")}</small></div>
      <button id="logoutBtn">Выйти</button>
    </div>`;
  const btn = $("#userBtn");
  const menu = $("#userMenu");
  btn.onclick = (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute("aria-expanded", String(!menu.hidden));
  };
  $("#logoutBtn").onclick = async () => {
    await logout();
    toast("Ты вышел из аккаунта");
  };
}
document.addEventListener("click", () => { const m = $("#userMenu"); if (m) m.hidden = true; });

// ───────── роутинг ─────────
let session = null;

function route() {
  if (!session?.user) {
    $("#tabbar").hidden = true;
    $("#navDesktop").hidden = true;
    if (currentKey !== "auth") { currentKey = "auth"; mount(authView, []); }
    return;
  }
  if (!session.profile) {
    currentKey = "noprofile";
    mount({ render: (el) => { el.innerHTML = `
      <div class="glass card placeholder">
        <h2>Профиль не создан</h2>
        <p>Проверь, что правила из <code>firestore.rules</code> опубликованы в Firebase Console, и обнови страницу.</p>
      </div>`; } }, []);
    return;
  }
  $("#tabbar").hidden = false;
  $("#navDesktop").hidden = false;
  const { name, params } = parseHash();
  const key = `${name}/${params.join("/")}`;
  markActive(name);
  if (key === currentKey) return;
  currentKey = key;
  document.title = `${ROUTES[name].label} · Emperator Exchange`;
  mount(ROUTES[name].view, params);
}

window.addEventListener("hashchange", route);

// ───────── старт ─────────
renderNav();
if (!isConfigured) {
  mount(authView, ["no-config"]);
} else {
  initAuth();
  onSession((s) => {
    const wasLogged = !!session?.user;
    session = s;
    renderUser(s);
    if (wasLogged !== !!s.user) currentKey = null;
    if (s.user && !location.hash) location.replace("#/markets");
    route();
  });
}
