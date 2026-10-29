// Покер — мини-апп. Все данные приходят с сервера по WebSocket;
// пользовательский текст всегда вставляется через textContent (без innerHTML).
const tg = window.Telegram?.WebApp;
// Часы сервера: сдвиг считается по каждому сообщению, чтобы таймеры не врали,
// если часы телефона спешат или отстают
let skew = 0;
const nowSrv = () => Date.now() + skew;
const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');

const S = {
  me: null, lobby: null, table: null, turn: null, tour: null, invite: null, top: null,
  screen: 'loading', tab: 'all', botMode: 'hu', botName: 'Охотник', buyin: 500, botMinutes: 0, raiseTo: 0,
  create: { name: '', maxPlayers: 6, buyin: 1000, customBuyin: '', minRating: '', blindMin: 5, startMode: 'full', startIn: 60, private: false },
  connected: false, error: null,
};

const BOT_INFO = {
  Скала: { text: 'Аккуратный, бьёт только сильным', aggr: 25 },
  Акула: { text: 'Баланс, не читается', aggr: 55 },
  Маньяк: { text: 'Борзый, давит овербетами', aggr: 95 },
  Охотник: { text: 'Учит тебя и бьёт по слабостям', aggr: 60 },
  Хамелеон: { text: 'Меняет стиль по ходу игры', aggr: 70 },
  Король: { text: 'Мега-босс · 3500 Эло: овербеты, олл-ины, почти не сбрасывает', aggr: 90, boss: true },
};

// ---------- DOM ----------

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const ICONS = {
  back: '<path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  chev: '<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  home: '<path d="M4 11l8-6 8 6v8H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0012 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  trophy: '<path d="M7 4h10v4a5 5 0 01-10 0zM12 13v4M8 20h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 12h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  user: '<circle cx="12" cy="9" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 20c1.5-4 14.5-4 16 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  chip: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill="#f2c94c"/>',
};
function icon(name, size = 20) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name]; // только константы выше
  return s;
}
const initial = (name) => (String(name || '?').trim()[0] || '?').toUpperCase();

let toastTimer;
function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// ---------- Связь с сервером ----------

let ws, rid = 0, retry = 500;
const waiting = new Map();

function connect() {
  const url = location.origin.replace(/^http/, 'ws') + '/ws';
  ws = new WebSocket(url);
  ws.onopen = () => {
    retry = 500;
    S.connected = true;
    const dev = new URLSearchParams(location.search).get('dev');
    if (tg?.initData) send({ t: 'auth', initData: tg.initData });
    else if (dev) send({ t: 'auth', dev: { id: Number(dev), name: `Тест ${dev}` } });
    else {
      S.error = 'Открой приложение через Telegram-бота';
      render();
    }
  };
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onclose = () => {
    S.connected = false;
    setTimeout(connect, (retry = Math.min(retry * 2, 8000)));
  };
}

function send(msg) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
}

function req(msg) {
  const id = ++rid;
  send({ ...msg, rid: id });
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
}

async function run(msg) {
  try {
    return await req(msg);
  } catch (e) {
    toast(e.message);
    return null;
  }
}

function onMessage(m) {
  if (m.now) skew = m.now - Date.now();
  if (m.rid && waiting.has(m.rid)) {
    const w = waiting.get(m.rid);
    waiting.delete(m.rid);
    if (m.t === 'error') w.reject(new Error(m.text));
    else w.resolve(m);
  } else if (m.t === 'error') toast(m.text);

  switch (m.t) {
    case 'hello':
      S.me = m.me;
      if (S.screen === 'loading') openStart(m.startParam);
      break;
    case 'me': S.me = m.me; break;
    case 'lobby':
      S.lobby = m;
      if (S.screen === 'tour' && S.tour) send({ t: 'tour', id: S.tour.id });
      break;
    case 'table':
      if (m.table && S.table?.id !== m.table.id) S.turn = null;
      // запоминаем, где были фишки до перерисовки, — для анимации
      if (S.screen === 'table') S.pendingFx = { prev: S.table, before: measureChips() };
      S.table = m.table;
      if (m.table && S.screen !== 'table' && !S.tableHidden) go('table');
      if (S.turn && m.table && m.table.actor !== S.me?.id) S.turn = null;
      break;
    case 'turn':
      S.turn = m;
      S.hint = null;
      S.raiseTo = clampRaise(m.currentBet + 0.66 * (m.pot + m.toCall), m);
      tg?.HapticFeedback?.impactOccurred('medium');
      break;
    case 'tour': S.tour = m.tour; S.invite = m.invite; break;
    case 'top': S.top = m.rating; break;
    case 'busted':
      toast(`Ты выбыл: ${m.place} место из ${m.total}`);
      leaveTableScreen(m.tournamentId);
      break;
    case 'finished':
      toast(m.demo ? `Демо-турнир окончен: ${m.place} место из ${m.total}` : m.prize ? `${m.place} место! Приз ${fmt(m.prize)} фишек` : `${m.place} место из ${m.total}`);
      if (m.solo) {
        S.table = null;
        S.turn = null;
        go('tours');
      } else leaveTableScreen(m.tournamentId);
      break;
    case 'left':
      S.table = null;
      S.turn = null;
      toast(m.beatAll
        ? `Ты обыграл всех ботов! На баланс: ${fmt(m.stack)}`
        : m.kicked
        ? `Тебя убрали со стола: пропущено 2 хода подряд. На баланс: ${fmt(m.stack)}`
        : m.net != null
        ? `Время вышло! Итог: ${m.net >= 0 ? '+' : '−'}${fmt(Math.abs(m.net))} фишек`
        : m.stack ? `Со стола на баланс: ${fmt(m.stack)}` : 'Ты встал из-за стола');
      go('lobby');
      break;
    case 'invoice':
      tg?.openInvoice(m.link, (status) => {
        if (status === 'paid') toast('Оплачено! Фишки зачислены');
        else if (status === 'failed') toast('Оплата не прошла');
      });
      break;
    case 'paid': toast('Фишки зачислены (тестовый режим)'); break;
    case 'toast': toast(m.text); break;
  }
  render();
}

function leaveTableScreen(tournamentId) {
  S.table = null;
  S.turn = null;
  openTour(tournamentId);
}

// ---------- Навигация ----------

const BACK = { solo: 'tours', mixed: 'lobby', bots: 'lobby', tours: 'lobby', tour: 'tours', create: 'tours', wallet: 'lobby', profile: 'lobby', table: 'lobby' };

function go(screen) {
  if (screen !== 'table' && S.screen === 'table' && S.table) S.tableHidden = true;
  if (screen === 'table') S.tableHidden = false;
  S.screen = screen;
  if (screen === 'profile') send({ t: 'top' });
  window.scrollTo(0, 0);
  render();
}

function openCombos() {
  S.comboBack = S.screen;
  go('combos');
}

function openTour(id) {
  S.tour = null;
  send({ t: 'tour', id });
  go('tour');
}

function openStart(startParam) {
  const hash = location.hash.slice(1);
  const tId = (startParam?.startsWith('t_') && startParam.slice(2)) || (hash.startsWith('t=') && hash.slice(2));
  if (tId) return openTour(tId);
  const mId = (startParam?.startsWith('m_') && startParam.slice(2)) || (hash.startsWith('m=') && hash.slice(2));
  if (mId) return openMixed(mId);
  if (hash === 'tournaments') return go('tours');
  if (hash === 'wallet') return go('wallet');
  if (hash === 'profile') return go('profile');
  go('lobby');
}

tg?.BackButton.onClick(() => back());
window.addEventListener('hashchange', () => S.me && openStart(null));
function back() {
  if (S.screen === 'combos') return go(S.comboBack || 'lobby');
  // демо-турнир админа: «назад» — выйти из него (фишки ненастоящие)
  if (S.screen === 'table' && S.table?.kind === 'tour' && S.table.demo) {
    if (confirm('Выйти из демо-турнира?')) send({ t: 'leave' });
    return;
  }
  if (S.screen === 'table' && (S.table?.kind === 'bots' || S.table?.kind === 'mixed')) return leaveAny(S.table.kind);
  go(BACK[S.screen] || 'lobby');
}

const clockLeft = (ts) => {
  const sec = Math.max(0, Math.ceil((ts - nowSrv()) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

// Встать / выйти с любого стола. Свой стол — стек на баланс; турнир — вылет с текущим местом.
function leaveAny(kind) {
  const text = kind === 'tour'
    ? 'Выйти из турнира? Это как вылететь сейчас: место и приз — по текущему месту.'
    : 'Встать из-за стола? Стек вернётся на баланс.';
  const doLeave = async () => {
    if (await run({ t: 'leave' })) {
      S.table = null;
      S.turn = null;
      go('lobby');
    }
  };
  if (tg?.showConfirm) tg.showConfirm(text, (ok) => ok && doLeave());
  else if (confirm(text)) doLeave();
}

// ---------- Общие куски ----------

function header(title, right) {
  return h('div', { class: 'row between' },
    h('div', { class: 'row' },
      h('button', { class: 'icon-btn', 'aria-label': 'Назад', onclick: back }, icon('back', 18)),
      h('h1', { class: 'h2' }, title)),
    right || null);
}

function nav() {
  const item = (screen, ic, text) => h('button', { class: S.screen === screen ? 'on' : '', onclick: () => go(screen) }, icon(ic), text);
  return h('nav', { class: 'nav' },
    item('lobby', 'home', 'Лобби'), item('tours', 'trophy', 'Турниры'),
    item('wallet', 'wallet', 'Кошелёк'), item('profile', 'user', 'Профиль'));
}

function balancePill() {
  return h('button', { class: 'pill', onclick: () => go('wallet'), 'aria-label': 'Кошелёк' },
    icon('chip', 16), h('span', { class: 'b' }, fmt(S.me?.chips)), h('span', { class: 'plus' }, '+'));
}

// 1 234 → 1,2k — чтобы значок не разрастался
const fmtShort = (n) => (n >= 10000 ? `${Math.floor(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : String(n));

function timeLeft(ts) {
  const min = Math.max(0, Math.round((ts - nowSrv()) / 60000));
  if (min < 60) return `${min} мин`;
  const hh = Math.floor(min / 60);
  return hh < 24 ? `${hh} ч ${min % 60} мин` : `${Math.floor(hh / 24)} д`;
}
const clock = (ts) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

// ---------- Лобби ----------

// ---------- Темы оформления (запоминаются на этом устройстве) ----------

const THEMES = [
  { id: 'emerald', name: 'Изумруд', bg: '#070e10', felt: '#2a6a62' },
  { id: 'red', name: 'Красный', bg: '#120607', felt: '#8a2a2f' },
  { id: 'blue', name: 'Синий', bg: '#060a14', felt: '#2a4f8a' },
  { id: 'purple', name: 'Фиолет', bg: '#0c0614', felt: '#5a2a8a' },
  { id: 'gold', name: 'Золото', bg: '#0a0906', felt: '#6a5a2a' },
  { id: 'graphite', name: 'Графит', bg: '#080808', felt: '#3a3a3a' },
];

function loadTheme() {
  try { return localStorage.getItem('theme') || 'emerald'; } catch { return 'emerald'; }
}

function applyTheme(id) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  if (t.id === 'emerald') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t.id;
  tg?.setHeaderColor?.(t.bg);
  tg?.setBackgroundColor?.(t.bg);
  S.theme = t.id;
}

function setTheme(id) {
  applyTheme(id);
  try { localStorage.setItem('theme', id); } catch {}
  render();
}

function themesCard() {
  return h('div', { class: 'col', style: 'gap:10px' },
    h('div', { class: 'label' }, 'Оформление'),
    h('div', { class: 'themes' }, THEMES.map((t) => h('button', { class: `theme-btn ${S.theme === t.id ? 'on' : ''}`, onclick: () => setTheme(t.id) },
      h('span', { class: 'theme-swatch', style: `background:radial-gradient(circle at 50% 40%, ${t.felt}, ${t.bg})` }), t.name))));
}

function lobbyScreen() {
  const me = S.me;
  const upcoming = (S.lobby?.tournaments || []).filter((t) => t.status === 'reg').slice(0, 2);
  return h('div', { class: 'screen' },
    h('div', { class: 'row between' },
      h('div', { class: 'row' },
        h('div', { class: 'avatar' }, initial(me.name)),
        h('div', { class: 'col' },
          h('div', { class: 'b', style: 'font-size:15px' }, me.name),
          h('div', { class: 'small muted' }, `Эло ${me.rating} · место ${fmt(me.ratingPlace)} · раздач выиграно ${fmt(me.handsWon || 0)}`))),
      balancePill()),
    me.table && h('div', { class: 'glass card at-table' },
      h('button', { class: 'at-table-back', onclick: () => { send({ t: 'table' }); go('table'); } },
        h('div', { class: 'row between' }, h('div', { class: 'b' }, 'Ты за столом'), icon('chev')),
        h('div', { class: 'small soft' }, 'Вернуться к игре')),
      h('button', { class: 'btn-sm leave-btn', onclick: () => leaveAny(me.table.kind) }, 'Выйти')),
    h('div', { class: 'col', style: 'padding-top:8px' },
      h('div', { class: 'small muted b', style: 'letter-spacing:3px' }, 'ТЕХАССКИЙ ХОЛДЕМ'),
      h('div', { style: 'font-size:32px;font-weight:800;letter-spacing:-0.5px' }, 'Покер')),
    h('button', { class: 'glass card', onclick: () => go('bots') },
      h('div', { class: 'row between' }, h('div', { class: 'card-title' }, 'Против ботов'), icon('chev', 22)),
      h('div', { class: 'soft', style: 'font-size:14px;line-height:1.45' }, '5 соперников с разным стилем. Сел и играешь — без ожидания.'),
      h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' }, Object.keys(BOT_INFO).map((n) => h('span', { class: 'tag' }, n)))),
    h('button', { class: 'glass card', onclick: () => go('tours') },
      h('div', { class: 'row between' }, h('div', { class: 'card-title' }, 'Против людей'), icon('chev', 22)),
      h('div', { class: 'soft', style: 'font-size:14px;line-height:1.45' }, 'Турниры от 2 до 60 игроков. Создай свой и позови друзей по ссылке.'),
      h('div', { class: 'row', style: 'font-size:13px' }, h('span', { class: 'dot' }), `Сейчас онлайн: ${fmt(S.lobby?.online)}`)),
    h('button', { class: 'item', onclick: openCombos },
      h('div', { class: 'col' }, h('div', { class: 'b', style: 'font-size:14px' }, 'Справочник комбинаций'), h('div', { class: 'small muted' }, 'Какие бывают руки и что сильнее')),
      icon('chev')),
    upcoming.length > 0 && h('div', { class: 'col', style: 'gap:10px' },
      h('div', { class: 'label' }, 'Ближайшие турниры'),
      upcoming.map((t) => h('button', { class: 'item', onclick: () => openTour(t.id) },
        h('div', { class: 'col' },
          h('div', { class: 'b', style: 'font-size:14px' }, t.name),
          h('div', { class: 'small muted' },
            `${t.startMode === 'time' ? clock(t.startAt) : 'при сборе'} · взнос ${fmt(t.buyin)} · ${t.count}/${t.maxPlayers}`)),
        h('div', { class: 'b', style: 'font-size:13px' },
          t.startMode === 'time' ? timeLeft(t.startAt) : `ждёт ${t.maxPlayers - t.count}`)))),
    nav());
}

// ---------- Против ботов ----------

function botsScreen() {
  const blinds = (b) => {
    const bb = Math.max(2, Math.floor(b / 100));
    return `Блайнды ${Math.max(1, Math.floor(bb / 2))} / ${bb} · на балансе ${fmt(S.me.chips)} фишек`;
  };
  const presets = S.lobby?.buyins || [200, 500, 1000, 5000];
  const min = S.lobby?.buyinMin || 100, max = Math.max(min, S.me.chips); // сверху — весь баланс
  const enough = S.me.chips >= S.buyin;
  return h('div', { class: 'screen' },
    header('Против ботов'),
    h('div', { class: 'field' },
      h('div', { class: 'label' }, 'Стол'),
      h('div', { class: 'seg' },
        h('button', { class: S.botMode === 'hu' ? 'on' : '', onclick: () => { S.botMode = 'hu'; render(); } }, '1 на 1'),
        h('button', { class: S.botMode === '6' ? 'on' : '', onclick: () => { S.botMode = '6'; render(); } }, 'Стол на 6'),
        h('button', { class: S.botMode === 'mixed' ? 'on' : '', onclick: () => { S.botMode = 'mixed'; render(); } }, 'С друзьями'))),
    S.botMode === 'mixed' && h('div', { class: 'field' },
      h('div', { class: 'label' }, 'Ботов за столом'),
      h('div', { class: 'choices' }, [0, 1, 2, 3, 4].map((n) =>
        h('button', { class: (S.mixedBots ?? 2) === n ? 'on' : '', onclick: () => { S.mixedBots = n; render(); } }, n))),
      h('div', { class: 'small muted', style: 'line-height:1.45' },
        'Создаёшь стол и зовёшь друзей по ссылке — каждый садится со своими фишками. Боты занимают свободные места (всего до 6). Встать можно в любой момент.')),
    S.botMode !== 'mixed' && h('div', { class: 'field' },
      h('div', { class: 'label' }, S.botMode === 'hu' ? 'Соперник' : 'За столом все пятеро (Король — только 1 на 1)'),
      Object.entries(BOT_INFO).map(([name, info]) => h('button', {
        class: `bot ${info.boss ? 'boss' : ''} ${S.botMode === 'hu' && S.botName === name ? 'on' : ''}`,
        onclick: () => { S.botName = name; S.botMode = 'hu'; render(); },
      },
      h('div', { class: 'letter' }, name[0]),
      h('div', { class: 'col', style: 'flex:1' }, h('div', { class: 'b', style: 'font-size:15px' }, name), h('div', { class: 'small soft' }, info.text)),
      h('div', { class: 'col', style: 'align-items:flex-end' },
        h('div', { class: 'small muted', style: 'font-size:11px' }, 'агрессия'),
        h('div', { class: 'meter' }, h('div', { style: `width:${info.aggr}%` }))))),
      // ещё 60 ботов попроще — только для игры 1 на 1
      S.lobby?.crowd?.length > 0 && h('button', { class: 'btn-ghost', onclick: () => { S.showCrowd = !S.showCrowd; render(); } },
        S.showCrowd ? 'Скрыть остальных ботов' : `Ещё ${S.lobby.crowd.length} ботов попроще`),
      S.showCrowd && h('div', { class: 'crowd' }, S.lobby.crowd.map((c) => h('button', {
        class: `crowd-bot ${S.botMode === 'hu' && S.botName === c.name ? 'on' : ''}`,
        onclick: () => { S.botName = c.name; S.botMode = 'hu'; render(); },
      }, h('div', { class: 'b' }, c.name), h('div', { class: 'small muted' }, `${c.kind} · ${c.elo}`))))),
    S.botMode !== 'mixed' && h('div', { class: 'field' },
      h('div', { class: 'label' }, 'Режим'),
      h('div', { class: 'seg' },
        h('button', { class: !S.botMinutes ? 'on' : '', onclick: () => { S.botMinutes = 0; render(); } }, 'Свободный'),
        h('button', { class: S.botMinutes ? 'on' : '', onclick: () => { S.botMinutes = S.botMinutes || (S.lobby?.timedMinutes || [10])[0]; render(); } }, 'На время')),
      S.botMinutes > 0 && h('div', { class: 'choices' }, (S.lobby?.timedMinutes || [10, 20, 30]).map((m) =>
        h('button', { class: S.botMinutes === m ? 'on' : '', onclick: () => { S.botMinutes = m; render(); } }, `${m} мин`))),
      h('div', { class: 'small muted', style: 'line-height:1.45' }, S.botMinutes
        ? `Встать нельзя ${S.botMinutes} минут. Закроешь приложение — за тебя будут чек/фолд. Когда время выйдет, стек вернётся на баланс.`
        : 'Встать можно в любой момент — стек сразу вернётся на баланс.')),
    h('div', { class: 'field', style: 'padding-bottom:70px' },
      h('div', { class: 'label' }, 'Бай-ин (100 больших блайндов)'),
      h('div', { class: 'choices' }, presets.map((b) =>
        h('button', { class: S.buyin === b ? 'on' : '', onclick: () => { S.buyin = b; render(); } }, fmt(b))),
        S.me.chips >= min && h('button', { class: S.buyin === S.me.chips ? 'on' : '', onclick: () => { S.buyin = S.me.chips; render(); } }, 'Всё')),
      // своя сумма
      h('input', {
        class: `buyin-input ${presets.includes(S.buyin) ? '' : 'on'}`, type: 'number', inputmode: 'numeric', min, max, step: 100,
        placeholder: `Своя сумма: от ${fmt(min)} до ${fmt(max)} (весь баланс)`, 'aria-label': 'Своя сумма бай-ина',
        value: presets.includes(S.buyin) ? '' : S.buyin,
        oninput: (e) => {
          const v = Math.floor(Number(e.target.value));
          if (v >= min && v <= max) {
            S.buyin = v;
            document.getElementById('blinds-info').textContent = blinds(v);
          }
        },
        onchange: () => render(),
      }),
      h('div', { class: 'small muted', id: 'blinds-info' }, blinds(S.buyin))),
    S.me.isAdmin && S.botMode !== 'mixed' && h('button', { class: 'btn-ghost', style: 'margin-bottom:70px', onclick: sitDemo }, 'Демо-стол для видео — без фишек, карты выбираешь сам'),
    !enough ? h('button', { class: 'btn cta', onclick: () => go('wallet') }, 'Пополнить фишки')
      : S.botMode === 'mixed' ? h('button', { class: 'btn cta', onclick: createMixed }, 'Создать стол и позвать друзей')
      : h('button', { class: 'btn cta', onclick: sitBots }, 'Сесть за стол'));
}

// ---------- Стол с друзьями ----------

async function createMixed() {
  const r = await run({ t: 'createMixed', buyin: S.buyin, bots: S.mixedBots ?? 2 });
  if (!r) return;
  go('table');
  if (r.invite) shareMixed(r.invite);
}

function shareMixed(invite) {
  const url = `https://t.me/share/url?url=${encodeURIComponent(invite)}&text=${encodeURIComponent('Го за мой покерный стол!')}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else navigator.clipboard?.writeText(invite).then(() => toast('Ссылка скопирована'));
}

function openMixed(id) {
  S.mixed = null;
  S.mixedId = id;
  run({ t: 'mixedInfo', id }).then((r) => {
    S.mixed = r?.room || false;
    render();
  });
  go('mixed');
}

function mixedScreen() {
  const r = S.mixed;
  if (r === null) return h('div', { class: 'screen' }, header('Стол с друзьями'), h('div', { class: 'center-msg muted' }, 'Загрузка…'));
  if (!r) return h('div', { class: 'screen' }, header('Стол с друзьями'), h('div', { class: 'center-msg' }, h('div', { class: 'muted' }, 'Этот стол уже закрыт')));
  const enough = S.me.chips >= r.buyin;
  return h('div', { class: 'screen' },
    header('Стол с друзьями'),
    h('div', { class: 'glass card' },
      h('div', { class: 'b', style: 'font-size:18px' }, `Стол ${r.host}`),
      h('div', { class: 'grid3' }, stat('Бай-ин', fmt(r.buyin)), stat('Блайнды', `${Math.max(1, Math.floor(r.bb / 2))}/${r.bb}`), stat('Мест', `${r.seats} из ${r.max}`)),
      h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' }, r.players.map((p) => h('span', { class: 'tag' }, p.bot ? `${p.name} (бот)` : p.name)))),
    enough
      ? h('button', { class: 'btn', onclick: async () => { if (await run({ t: 'joinMixed', id: r.id })) go('table'); } }, `Сесть · бай-ин ${fmt(r.buyin)}`)
      : h('button', { class: 'btn', onclick: () => go('wallet') }, `Пополнить — бай-ин ${fmt(r.buyin)}`));
}

async function sitBots() {
  const r = await run({ t: 'sitBots', mode: S.botMode, botName: S.botName, buyin: S.buyin, minutes: S.botMinutes });
  if (r) go('table');
}

async function sitDemo() {
  const r = await run({ t: 'sitDemo', mode: S.botMode, botName: S.botName });
  if (r) go('table');
}

// ---------- Демо-стол: выбор карт на следующую раздачу (только админ) ----------

const cardText = (c) => (RANKS[c >> 2] === 'T' ? '10' : RANKS[c >> 2]) + SUITS[c & 3];

function openPicker(target) {
  const plan = S.table?.plan || { holes: {}, board: [] };
  const sel = target.board ? [...(plan.board || [])] : [...(plan.holes?.[target.hole] || [])];
  S.pick = { target, sel };
  render();
}

function pickerModal(T) {
  const p = S.pick;
  const plan = T.plan || { holes: {}, board: [] };
  const max = p.target.board ? 5 : 2;
  // карты, уже занятые другими местами плана
  const taken = new Set([
    ...Object.entries(plan.holes || {}).filter(([id]) => p.target.board || Number(id) !== p.target.hole).flatMap(([, cs]) => cs),
    ...(p.target.board ? [] : plan.board || []),
  ]);
  const who = p.target.board ? 'Карты стола: флоп, тёрн, ривер (по порядку)'
    : `Карты: ${T.seats.find((s) => s.id === p.target.hole)?.me ? 'тебе' : T.seats.find((s) => s.id === p.target.hole)?.name}`;
  const save = (sel) => {
    const next = { holes: { ...(plan.holes || {}) }, board: [...(plan.board || [])] };
    if (p.target.board) next.board = sel;
    else if (sel.length === 2) next.holes[p.target.hole] = sel;
    else delete next.holes[p.target.hole];
    S.pick = null;
    run({ t: 'demoPlan', plan: next });
    render();
  };
  const grid = [];
  for (let s = 0; s < 4; s++)
    for (let r = 12; r >= 0; r--) {
      const c = r * 4 + s;
      const i = p.sel.indexOf(c);
      grid.push(h('button', {
        class: `pk ${(s === 1 || s === 2) ? 'red' : ''} ${i >= 0 ? 'on' : ''}`,
        disabled: taken.has(c) || (i < 0 && p.sel.length >= max),
        onclick: () => { i >= 0 ? p.sel.splice(i, 1) : p.sel.push(c); render(); },
      }, cardText(c), i >= 0 && p.target.board ? h('sup', {}, i + 1) : null));
    }
  return h('div', { class: 'picker-bg' },
    h('div', { class: 'picker glass' },
      h('div', { class: 'b' }, who),
      h('div', { class: 'small muted' }, `Выбрано ${p.sel.length} из ${max}. Сработает на следующей раздаче, остальное — случайно.`),
      h('div', { class: 'pk-grid' }, grid),
      h('div', { class: 'grid2' },
        h('button', { class: 'btn-ghost', onclick: () => save([]) }, 'Очистить'),
        h('button', { class: 'btn', style: 'height:46px;font-size:14px', disabled: !p.target.board && p.sel.length === 1, onclick: () => save(p.sel) }, 'Готово')),
      h('button', { class: 'btn-ghost', onclick: () => { S.pick = null; render(); } }, 'Отмена')));
}

// ---------- Стол ----------

const RANKS = '23456789TJQKA';
const SUITS = ['♠', '♥', '♦', '♣'];
function pcard(c, size = '') {
  if (c == null) return h('div', { class: `pcard back ${size}` });
  const red = (c & 3) === 1 || (c & 3) === 2;
  const r = RANKS[c >> 2] === 'T' ? '10' : RANKS[c >> 2];
  return h('div', { class: `pcard ${size} ${red ? 'red' : ''}`, 'aria-label': r + SUITS[c & 3] },
    h('div', { class: 'r' }, r), h('div', { class: 's' }, SUITS[c & 3]));
}

// места вокруг стола (в % от области стола); я всегда снизу
const SPOTS = {
  bottom: [50, 99], bl: [18, 64], tl: [18, 26], top: [50, 8], tr: [82, 26], br: [82, 64],
};
const LAYOUT = { 1: ['top'], 2: ['tl', 'tr'], 3: ['tl', 'top', 'tr'], 4: ['bl', 'tl', 'tr', 'br'], 5: ['bl', 'tl', 'top', 'tr', 'br'] };

function clampRaise(x, t) {
  return Math.round(Math.max(t.minRaiseTo, Math.min(t.maxTo, x)));
}

function tableScreen() {
  const T = S.table;
  if (!T) {
    return h('div', { class: 'screen' }, header('Стол'), h('div', { class: 'center-msg' }, h('div', { class: 'muted' }, 'Загружаем стол…')));
  }
  const meIdx = T.seats.findIndex((s) => s.me);
  const ordered = meIdx >= 0 ? [...T.seats.slice(meIdx), ...T.seats.slice(0, meIdx)] : T.seats;
  const mySeat = meIdx >= 0 ? T.seats[meIdx] : null;
  const others = ordered.slice(mySeat ? 1 : 0);
  const spots = LAYOUT[Math.min(others.length, 5)] || [];
  const myTurn = S.turn && T.actor === S.me.id && S.turn.tableId === T.id;

  const seatEl = (s, spot) => {
    const [x, y] = SPOTS[spot];
    const top = y < 50;
    const cards = s.me
      ? (s.cards ? s.cards.map((c) => pcard(c, 'lg')) : [])
      : s.cards ? s.cards.map((c) => pcard(c, 'sm')) : s.inHand && T.inHand ? [pcard(null, 'sm'), pcard(null, 'sm')] : [];
    const won = !T.inHand && T.result?.some((w) => w.id === s.id);
    const plate = h('div', { 'data-seat': s.id, class: `plate ${T.actor === s.id ? 'turn' : ''} ${s.folded || s.away ? 'out' : ''} ${won ? 'win' : ''}` },
      s.me ? h('div', { class: 'avatar', style: 'width:24px;height:24px;font-size:11px' }, initial(s.name)) : h('div', { class: 'ini' }, initial(s.name)),
      h('div', { class: 'col', style: 'gap:0;min-width:0' },
        h('div', { class: 'nm' }, s.me ? 'Ты' : s.name),
        // стек и рядом значок выигранных раздач (у людей и у ботов) — внутри таблички, ничего не закрывает
        h('div', { class: 'st' }, s.allIn ? 'олл-ин' : fmt(s.stack),
          s.handsWon > 0 && h('span', { class: 'wins-badge', title: 'Выиграно раздач', 'aria-label': `Выиграно раздач: ${s.handsWon}` },
            icon('trophy', 9), fmtShort(s.handsWon)))));
    const planned = T.demo && T.plan?.holes?.[s.id];
    const extras = h('div', { class: 'row', style: 'gap:4px;min-height:20px' },
      T.demo && h('button', { class: 'pick-btn', 'aria-label': `Выбрать карты: ${s.me ? 'мне' : s.name}`, onclick: () => openPicker({ hole: s.id }) }, '✎'),
      planned && h('span', { class: 'planned' }, planned.map(cardText).join(' ')),
      T.buttonId === s.id && h('div', { class: 'dealer', title: 'Баттон' }, 'D'),
      s.bet > 0 ? h('div', { class: 'chip-bet', 'data-bet': s.id }, h('span', { class: `chip-ico ${chipColor(s.bet, T.bb)}` }), fmt(s.bet))
        : s.last ? h('div', { class: 'chip-last' }, s.last) : null);
    const timer = T.actor === s.id && T.deadline ? h('div', { class: 'timer' }, h('div', { 'data-deadline': T.deadline })) : null;
    return h('div', { class: `seat ${s.me ? 'me' : ''}`, style: `left:${x}%;top:${y}%` },
      top ? [cards.length ? h('div', { class: 'cards' }, cards) : null, plate, s.hand && h('div', { class: 'hand-name' }, s.hand), timer, extras]
        : s.me
          // твоя комбинация — справа от твоей таблички: не закрывает ни флоп, ни соседей
          ? [extras, h('div', { class: 'cards' }, cards),
            h('div', { class: 'my-plate' }, plate,
              (s.hand || s.myHand) && h('button', { class: 'my-hand', onclick: openCombos, 'aria-label': 'Моя комбинация — открыть справочник' }, s.hand || s.myHand)),
            timer]
          : [extras, h('div', { class: 'cards' }, cards), plate, s.hand && h('div', { class: 'hand-name' }, s.hand), timer]);
  };

  const board = [];
  for (let i = 0; i < 5; i++) board.push(T.board[i] != null ? pcard(T.board[i]) : h('div', { class: 'pcard empty' }));

  const info = T.kind === 'tour'
    ? [T.title, h('br'), `Уровень ${T.level} · ${T.sb}/${T.bb} · осталось ${T.alive} из ${T.total}`]
    : T.endsAt ? [T.title, h('br'), h('span', { class: 'ends', 'data-ends': T.endsAt }, `осталось ${clockLeft(T.endsAt)}`)]
    : T.kind === 'mixed' ? [T.title, h('br'),
      T.invite ? h('button', { class: 'invite-pill', onclick: () => shareMixed(T.invite) }, `Позвать друзей · мест ${T.seatsFree}`) : `мест свободно: ${T.seatsFree}`]
    : [T.title];
  // за столами с людьми правило про подсказки видно всем
  const hintRule = T.kind === 'mixed' || (T.kind === 'tour' && !T.solo)
    ? h('div', { class: 'hint-rule' }, 'Здесь работают подсказки — они видят карты') : null;

  const elo = !T.inHand && T.eloDelta ? Math.round(T.eloDelta) || (T.eloDelta > 0 ? 1 : -1) : 0;
  const result = !T.inHand && T.result
    ? h('div', { class: 'result' },
      T.result.map((w) => `${w.id === S.me.id ? 'Ты забираешь' : `${w.name} забирает`} ${fmt(w.amount)}${w.hand ? ` · ${w.hand}` : ''}`).join(', '),
      elo ? h('span', { class: `elo ${elo > 0 ? 'up' : 'down'}` }, ` Эло ${elo > 0 ? '+' : '−'}${Math.abs(elo)}`) : null)
    : null;

  const adminDock = S.me.isAdmin && (T.kind === 'bots' || T.solo);
  return h('div', { class: `table-screen ${adminDock ? 'with-admin' : ''}` },
    h('div', { class: 'table-top' },
      h('button', { class: 'icon-btn', 'aria-label': T.kind === 'tour' ? 'В лобби' : 'Встать из-за стола', onclick: back }, icon('back', 18)),
      h('div', { class: 'title' }, info),
      // подсказка — круглая кнопка в шапке, чтобы не закрывать игроков
      myTurn && !S.hint && h('button', { class: 'icon-btn hint-ico', 'aria-label': 'Подсказка', onclick: askHint },
        icon('bulb', 18), h('span', { class: 'hint-ico-count' }, T.demo ? '∞' : S.me.hints ? S.me.hints : '5⭐')),
      h('button', { class: 'icon-btn', 'aria-label': 'Справочник комбинаций', onclick: openCombos, style: 'font-weight:800;font-size:17px' }, '?')),
    h('div', { class: 'felt-wrap' },
      h('div', { class: 'felt' }),
      h('div', { class: 'center' },
        h('div', { class: 'pot-chips', id: 'pot-chips' }, !(T.result && !T.inHand) && chipStacks(T.pot - T.seats.reduce((a, x) => a + x.bet, 0), T.bb)),
        h('div', { class: 'pot' }, 'Банк ', h('b', {}, fmt(T.pot)),
          T.demo && T.plan?.board?.length ? h('span', { class: 'planned', style: 'margin-left:6px' }, T.plan.board.map(cardText).join(' ')) : null),
        h('div', { class: 'board', style: 'align-items:center' },
          T.demo && h('button', { class: 'pick-btn', 'aria-label': 'Выбрать карты стола', onclick: () => openPicker({ board: true }) }, '✎'),
          board)),
      others.map((s, i) => seatEl(s, spots[i])),
      mySeat && seatEl(mySeat, 'bottom')),
    result,
    hintRule,
    myTurn && hintFloat(T),
    // низ экрана: кнопки админа (только в играх с ботами) над панелью хода
    h('div', { class: 'bottom-dock' },
      // только админ, только игры с ботами: все боты в раздаче — олл-ин
      adminDock && h('div', { class: 'admin-btns' },
        T.inHand && h('button', {
          class: 'jam-btn', 'aria-label': 'Все боты — олл-ин', onclick: async () => { if (await run({ t: 'forceJam' })) toast('Боты идут ва-банк'); },
        }, 'Олл-ин'),
        T.inHand && h('button', {
          class: 'jam-btn', 'aria-label': 'Боты ставят всё кроме 1 фишки и сбрасывают',
          onclick: async () => { if (await run({ t: 'forceDump' })) toast('Боты ставят почти всё — и сбросят'); },
        }, 'Олл-ин −1'),
        h('button', {
          class: 'jam-btn aces-btn', 'aria-label': 'Два туза в следующей раздаче, ещё два на тёрне и ривере', onclick: async () => { if (await run({ t: 'forceAces' })) toast('Следующая раздача: тузы у тебя и на тёрне с ривером'); },
        }, 'A A')),
      actionPanel(T, mySeat, myTurn)),
    T.demo && S.pick && pickerModal(T));
}

// ---------- Фишки и анимации ----------

const CHIP_COLORS = ['c-white', 'c-red', 'c-green', 'c-black', 'c-purple', 'c-gold'];
function chipColor(amount, bb) {
  const x = amount / Math.max(1, bb);
  return CHIP_COLORS[x < 2 ? 0 : x < 6 ? 1 : x < 20 ? 2 : x < 60 ? 3 : x < 200 ? 4 : 5];
}

// Стопки фишек в банке: чем больше банк (в больших блайндах), тем выше и больше стопок
function chipStacks(amount, bb) {
  if (amount <= 0) return null;
  const units = amount / Math.max(1, bb);
  const total = Math.min(30, Math.max(2, Math.round(Math.log2(units + 1) * 3)));
  const nStacks = Math.min(4, Math.ceil(total / 8));
  const stacks = [];
  for (let i = 0; i < nStacks; i++) {
    const n = Math.ceil((total - i * 2) / nStacks);
    const color = CHIP_COLORS[(CHIP_COLORS.indexOf(chipColor(amount, bb)) + i) % CHIP_COLORS.length];
    const chips = [];
    for (let k = 0; k < Math.max(1, n); k++) chips.push(h('div', { class: `chip ${color}` }));
    stacks.push(h('div', { class: 'stack' }, chips));
  }
  return stacks;
}

function centerOf(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function measureChips() {
  const bets = {};
  for (const el of document.querySelectorAll('[data-bet]')) bets[el.dataset.bet] = centerOf(el);
  return { bets, pot: centerOf(document.getElementById('pot-chips')) };
}

function fxLayer() {
  let el = document.getElementById('fx');
  if (!el) {
    el = h('div', { id: 'fx', 'aria-hidden': 'true' });
    document.body.append(el);
  }
  return el;
}

function flyChips(from, to, { n = 3, delay = 0, color = 'c-red' } = {}) {
  if (!from || !to || document.hidden) return;
  const layer = fxLayer();
  for (let i = 0; i < n; i++) {
    const c = h('div', { class: `fly-chip ${color}`, style: `left:${from.x}px;top:${from.y}px` });
    layer.append(c);
    const dx = to.x - from.x + (i - (n - 1) / 2) * 4;
    const dy = to.y - from.y - i * 2;
    const a = c.animate([
      { transform: 'translate(-50%, -50%) scale(0.9)', opacity: 0.9 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 1 },
    ], { duration: 460, delay: delay + i * 70, easing: 'cubic-bezier(.2,.75,.3,1)', fill: 'backwards' });
    a.onfinish = () => c.remove();
    a.oncancel = () => c.remove();
  }
}

function runFx({ prev, before }, next) {
  if (!prev || !next || prev.id !== next.id || prev.handId !== next.handId || S.screen !== 'table') return;
  const seatPos = (id) => centerOf(document.querySelector(`[data-seat="${id}"]`));
  const potPos = centerOf(document.getElementById('pot-chips'));
  const prevBet = Object.fromEntries(prev.seats.map((x) => [x.id, x.bet]));
  const sameStreet = next.board.length === prev.board.length && !next.result;

  // ставка: от игрока к его фишкам на столе
  if (sameStreet) {
    for (const s of next.seats) {
      if (s.bet > (prevBet[s.id] || 0)) {
        flyChips(seatPos(s.id), centerOf(document.querySelector(`[data-bet="${s.id}"]`)), { color: chipColor(s.bet - (prevBet[s.id] || 0), next.bb) });
      }
    }
    return;
  }
  // конец улицы или раздачи: ставки съезжают в банк
  let delay = 0;
  for (const [id, pos] of Object.entries(before.bets)) {
    flyChips(pos, potPos || before.pot, { n: 2, color: chipColor(prevBet[id] || 0, next.bb) });
    delay = 380;
  }
  // выигрыш: банк летит победителю
  if (next.result && !prev.result) {
    for (const w of next.result) {
      flyChips(before.pot || potPos, seatPos(w.id), { n: 6, delay, color: chipColor(w.amount, next.bb) });
      if (w.id === S.me.id) setTimeout(() => tg?.HapticFeedback?.notificationOccurred('success'), delay + 500);
    }
  }
}

// ---------- Подсказка ----------

async function askHint() {
  if (!S.table?.demo && !S.me.hints) {
    toast('Подсказки закончились — купи в кошельке');
    return go('wallet');
  }
  const r = await run({ t: 'hint' });
  if (r && S.turn) {
    S.hint = r;
    render();
  }
}

const pct = (x) => `${Math.round(x * 100)}%`;

// Подсказка — маленькая карточка в правом верхнем углу, чтобы не закрывать карты
function hintFloat(T) {
  const t = S.turn;
  if (!S.hint) return null; // кнопка — в шапке стола
  const act = (action) => {
    send({ t: 'act', action });
    S.turn = null;
    S.hint = null;
    render();
  };
  return h('div', { class: 'hint-float' }, hintCard(S.hint, t, act));
}

function hintCard(hnt, t, act) {
  const a = hnt.action;
  const label = a.type === 'fold' ? 'Фолд'
    : a.type === 'check' ? 'Чек'
    : a.type === 'call' ? `Колл ${fmt(Math.min(t.toCall, t.maxTo - t.myBet))}`
    : a.to >= t.maxTo ? 'Олл-ин' : `${t.currentBet > 0 ? 'Рейз' : 'Бет'} до ${fmt(a.to)}`;
  const why = hnt.sure
    ? { win: 'Ты выигрываешь эту раздачу, если дойдёт до вскрытия', tie: 'Будет ничья — банк делится', lose: 'Ты проигрываешь эту раздачу' }[hnt.sure]
    : t.toCall > 0
      ? `Твои шансы ${pct(hnt.eq)} · чтобы колл окупался, нужно ${pct(hnt.potOdds)}`
      : `Твои шансы выиграть раздачу ${pct(hnt.eq)}`;
  return h('div', { class: 'hint-card' },
    h('div', { class: 'row between' },
      h('div', {}, h('span', { class: 'small soft' }, 'Совет: '), h('span', { class: 'b', style: 'font-size:16px' }, label)),
      h('button', { class: 'hint-x', 'aria-label': 'Свернуть подсказку', onclick: () => { S.hint = null; render(); } }, '✕')),
    h('button', { class: 'btn-sm', onclick: () => act(a.type === 'raise' ? { type: 'raise', to: a.to } : { type: a.type }) }, 'Сделать'),
    h('div', { class: 'small' }, why),
    hnt.cards?.length > 0 && h('div', { class: 'row', style: 'flex-wrap:wrap;gap:10px' },
      hnt.cards.map((o) => h('div', { class: 'row', style: 'gap:4px;align-items:center' },
        h('span', { class: 'small soft' }, `${o.name}:`), pcard(o.cards[0], 'xs'), pcard(o.cards[1], 'xs')))),
    hnt.next?.length > 0 && h('div', { class: 'row', style: 'gap:4px;align-items:center;flex-wrap:wrap' },
      h('span', { class: 'small soft' }, 'Дальше выйдут:'), hnt.next.map((c) => pcard(c, 'xs'))),
    hnt.range?.length > 0 && h('div', { class: 'small soft', style: 'line-height:1.45' },
      `${hnt.opp || 'Соперник'} скорее всего держит: `, hnt.range.map((r) => `${r.name.toLowerCase()} ${r.pct}%`).join(' · ')),
    !hnt.cards?.length && h('div', { class: 'small muted', style: 'font-size:11px' }, 'Это расчёт по его ставкам, а не его настоящие карты.'));
}

function actionPanel(T, me, myTurn) {
  if (myTurn) {
    const t = S.turn;
    const canRaise = t.maxTo > t.currentBet && t.maxTo > t.myBet + t.toCall;
    const preset = (label, frac) => h('button', {
      onclick: () => { S.raiseTo = frac === 'all' ? t.maxTo : clampRaise(t.currentBet + frac * (t.pot + t.toCall), t); render(); },
    }, label);
    const act = (action) => {
      send({ t: 'act', action });
      S.turn = null;
      S.hint = null;
      render();
    };
    const callAmt = Math.min(t.toCall, t.maxTo - t.myBet);
    return h('div', { class: 'panel' },
      t.deadline > 0 && h('div', { class: 'countdown', 'data-countdown': t.deadline },
        h('span', { class: 'cd-label' }, 'Твой ход'),
        h('span', { class: 'cd-sec' }, ''),
        h('div', { class: 'cd-bar' }, h('div', { 'data-deadline': t.deadline }))),
      canRaise && h('div', { class: 'presets' }, preset('½ банка', 0.5), preset('¾ банка', 0.75), preset('Банк', 1), preset('Олл-ин', 'all')),
      canRaise && t.maxTo > t.minRaiseTo && h('input', {
        type: 'range', min: t.minRaiseTo, max: t.maxTo, step: Math.max(1, Math.floor(t.bb / 2)), value: S.raiseTo,
        'aria-label': 'Размер ставки',
        oninput: (e) => {
          S.raiseTo = Number(e.target.value);
          document.getElementById('raise-btn').textContent = raiseLabel(t);
        },
      }),
      h('div', { class: 'acts' },
        h('button', { class: 'a-fold', onclick: () => act({ type: 'fold' }) }, 'Фолд'),
        h('button', { class: 'a-call', onclick: () => act({ type: t.toCall > 0 ? 'call' : 'check' }) }, t.toCall > 0 ? `Колл ${fmt(callAmt)}` : 'Чек'),
        canRaise
          ? h('button', { class: 'a-raise', id: 'raise-btn', onclick: () => act({ type: 'raise', to: S.raiseTo }) }, raiseLabel(t))
          : h('div')));
  }
  if (me?.away && !T.leaving) {
    return h('div', { class: 'panel' },
      h('div', { class: 'soft', style: 'text-align:center;font-size:14px' }, 'Ты пропустил ход и отошёл от стола'),
      h('button', { class: 'btn', onclick: () => send({ t: 'back' }) }, 'Я вернулся'));
  }
  if (T.canRebuy) {
    return h('div', { class: 'panel' },
      h('div', { class: 'soft', style: 'text-align:center;font-size:14px' }, 'Фишки на столе закончились'),
      h('div', { class: 'grid2' },
        h('button', { class: 'btn-ghost', onclick: () => send({ t: 'leave' }) }, 'Встать'),
        h('button', { class: 'btn', style: 'height:46px;font-size:14px', onclick: () => run({ t: 'rebuy' }) }, `Докупить ${fmt(T.buyin)}`)));
  }
  const actor = T.seats.find((s) => s.id === T.actor);
  const text = T.leaving ? 'Встаём после раздачи…'
    : actor ? (actor.me ? 'Твой ход' : `Ходит ${actor.name}`)
    : T.inHand ? 'Раздача идёт' : 'Следующая раздача…';
  return h('div', { class: 'panel' }, h('div', { class: 'soft', style: 'text-align:center;font-size:14px;padding:8px 0' }, text));
}

function raiseLabel(t) {
  if (S.raiseTo >= t.maxTo) return 'Олл-ин';
  return `${t.currentBet > 0 ? 'Рейз' : 'Бет'} ${fmt(S.raiseTo)}`;
}

// ---------- Турниры ----------

function toursScreen() {
  const all = S.lobby?.tournaments || [];
  const list = S.tab === 'mine' ? all.filter((t) => t.registered || t.mine) : all.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const big = list.filter((t) => t.kind === 'big');
  const rest = list.filter((t) => t.kind !== 'big');
  const me = S.me;
  return h('div', { class: 'screen', style: 'padding-bottom:120px' },
    header('Турниры', h('button', { class: 'btn-sm', onclick: () => go('create') }, icon('plus', 14), 'Создать')),
    h('div', { class: 'seg' },
      h('button', { class: S.tab === 'all' ? 'on' : '', onclick: () => { S.tab = 'all'; render(); } }, 'Все'),
      h('button', { class: S.tab === 'mine' ? 'on' : '', onclick: () => { S.tab = 'mine'; render(); } }, 'Мои')),
    h('button', { class: 'glass card', style: 'background:rgba(127,209,168,0.08)', onclick: () => go('solo') },
      h('div', { class: 'row between' }, h('div', { style: 'font-size:18px;font-weight:800' }, 'Сольный турнир с ботами'), icon('chev')),
      h('div', { class: 'small soft', style: 'line-height:1.45' }, 'Старт сразу, в любое время. Ты и боты: 6, 18 или 60 мест, взнос — любой.')),
    big.map(bigCard),
    rest.length > 0 && h('div', { class: 'label', style: 'padding-top:4px' }, 'Турниры игроков'),
    rest.map(sngCard),
    !list.length && h('div', { class: 'muted', style: 'text-align:center;padding:30px 0' }, S.tab === 'mine' ? 'Ты пока ни в одном турнире' : 'Пока пусто — создай первый турнир'),
    h('div', { class: 'statbar' },
      h('b', {}, `${me.name}:`), ` Эло `, h('b', {}, me.rating), ` · место `, h('b', {}, fmt(me.ratingPlace)), ` · игр `, h('b', {}, me.games), h('br'),
      `фишки `, h('b', {}, fmt(me.chips)), ` · место по фишкам `, h('b', {}, fmt(me.chipsPlace))));
}

// ---------- Сольный турнир ----------

function soloScreen() {
  const cfg = S.lobby?.solo || { sizes: [6, 18, 60], blinds: [2, 3, 6], shares: {} };
  const size = S.soloSize ?? 18;
  const blind = S.soloBlind ?? 3;
  const min = S.lobby?.buyinMin || 100;
  const buyin = S.soloBuyin ?? 1000;
  const presets = [500, 1000, 5000, 10000];
  const pool = size * buyin;
  const shares = cfg.shares[size] || [1];
  const prizeText = () => shares.map((s, i) => `${i + 1} место — ${fmt(Math.floor((size * (S.soloBuyin ?? 1000)) * s))}`).join(' · ');
  const enough = S.me.chips >= buyin;
  return h('div', { class: 'screen' },
    header('Сольный турнир'),
    h('div', { class: 'small soft', style: 'line-height:1.5' },
      'Ты и боты. Старт сразу. Столы по 6, блайнды растут, вылетевших пересаживают — как в Большом турнире. Вылетел — турнир для тебя закончен, приз по месту.'),
    h('div', { class: 'field' },
      h('div', { class: 'label' }, 'Мест'),
      h('div', { class: 'choices' }, cfg.sizes.map((n) => h('button', { class: size === n ? 'on' : '', onclick: () => { S.soloSize = n; render(); } }, n)))),
    h('div', { class: 'field' },
      h('div', { class: 'label' }, 'Блайнды растут каждые'),
      h('div', { class: 'choices' }, cfg.blinds.map((n) => h('button', { class: blind === n ? 'on' : '', onclick: () => { S.soloBlind = n; render(); } }, `${n} мин`)))),
    h('div', { class: 'field' },
      h('div', { class: 'label' }, 'Взнос'),
      h('div', { class: 'choices' }, presets.map((b) => h('button', { class: buyin === b ? 'on' : '', onclick: () => { S.soloBuyin = b; render(); } }, fmt(b))),
        S.me.chips >= min && h('button', { class: buyin === S.me.chips ? 'on' : '', onclick: () => { S.soloBuyin = S.me.chips; render(); } }, 'Всё')),
      h('input', {
        class: `buyin-input ${presets.includes(buyin) ? '' : 'on'}`, type: 'number', inputmode: 'numeric', min, step: 100,
        placeholder: `Своя сумма: от ${fmt(min)} до ${fmt(Math.max(min, S.me.chips))}`, 'aria-label': 'Свой взнос',
        value: presets.includes(buyin) ? '' : buyin,
        oninput: (e) => {
          const v = Math.floor(Number(e.target.value));
          if (v >= min) {
            S.soloBuyin = v;
            document.getElementById('solo-pool').textContent = `Призовой фонд ${fmt(size * v)}`;
            document.getElementById('solo-prizes').textContent = prizeText();
          }
        },
        onchange: () => render(),
      }),
      h('div', { class: 'small muted' }, `на балансе ${fmt(S.me.chips)} фишек`)),
    h('div', { class: 'glass card' },
      h('div', { class: 'b', id: 'solo-pool' }, `Призовой фонд ${fmt(pool)}`),
      h('div', { class: 'small soft', id: 'solo-prizes', style: 'line-height:1.5' }, prizeText())),
    S.me.isAdmin && h('button', { class: 'btn-ghost', onclick: startDemoSolo }, `Демо-турнир на ${size} для видео — без фишек, карты выбираешь сам`),
    h('div', { style: 'height:70px' }),
    !enough ? h('button', { class: 'btn cta', onclick: () => go('wallet') }, 'Пополнить фишки')
      : h('button', { class: 'btn cta', onclick: startSolo }, `Начать · взнос ${fmt(buyin)}`));
}

async function startDemoSolo() {
  const r = await run({ t: 'startSolo', demo: true, size: S.soloSize ?? 18, blindMin: S.soloBlind ?? 3 });
  if (r) go('table');
}

async function startSolo() {
  const r = await run({ t: 'startSolo', buyin: S.soloBuyin ?? 1000, size: S.soloSize ?? 18, blindMin: S.soloBlind ?? 3 });
  if (r) go('table');
}

function statusText(t) {
  if (t.status === 'running') return `идёт · осталось ${t.alive ?? '?'} из ${t.count}`;
  if (t.status === 'done') return 'завершён';
  if (t.status === 'cancelled') return 'отменён';
  return t.startMode === 'time' ? `старт ${clock(t.startAt)} · через ${timeLeft(t.startAt)}` : 'старт при сборе';
}

function bigCard(t) {
  return h('button', { class: 'glass card', style: 'background:rgba(255,255,255,0.08)', onclick: () => openTour(t.id) },
    h('div', { class: 'row between' }, h('div', { style: 'font-size:18px;font-weight:800' }, t.name), icon('chev')),
    h('div', { class: 'grid3' },
      stat('Рейтинг', t.minRating ? `от ${t.minRating}` : 'любой'), stat('Взнос', fmt(t.buyin)), stat('Призовой', fmt(t.prizePool))),
    h('div', { class: 'col', style: 'gap:6px' },
      h('div', { class: 'row between', style: 'font-size:13px' },
        h('span', { class: 'soft' }, `Игроков ${t.count} из ${t.maxPlayers}`), h('span', { class: 'b' }, statusText(t))),
      h('div', { class: 'progress' }, h('div', { style: `width:${(t.count / t.maxPlayers) * 100}%` }))),
    t.registered && h('div', { class: 'small', style: 'color:var(--green)' }, 'Ты зарегистрирован'));
}

function sngCard(t) {
  const seats = [];
  for (let i = 0; i < Math.min(t.maxPlayers, 10); i++) {
    const p = t.players[i];
    seats.push(h('div', { class: `seat-dot ${p ? 'taken' : ''}` }, p ? initial(p.name) : ''));
  }
  return h('button', { class: 'glass card', style: 'padding:14px;border-radius:18px', onclick: () => openTour(t.id) },
    h('div', { class: 'row between' },
      h('div', { class: 'col' },
        h('div', { class: 'b', style: 'font-size:15px' }, t.name),
        h('div', { class: 'small soft' }, `Рейтинг ${t.minRating ? `от ${t.minRating}` : 'любой'} · взнос ${fmt(t.buyin)}`)),
      h('div', { class: 'b', style: 'font-size:13px' }, `${t.count} из ${t.maxPlayers}`)),
    h('div', { class: 'seats' }, seats),
    h('div', { class: 'small muted' }, statusText(t), t.private ? ' · закрытый' : ''));
}

const stat = (k, v) => h('div', { class: 'col stat', style: 'gap:2px' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));

function tourScreen() {
  const t = S.tour;
  if (!t) return h('div', { class: 'screen' }, header('Турнир'), h('div', { class: 'center-msg muted' }, 'Загрузка…'));
  const me = S.me;
  const atTable = me.table?.kind === 'tour' && me.table.id.startsWith(t.id + ':');
  let action = null;
  if (t.status === 'reg') {
    if (t.registered) {
      action = h('div', { class: 'col', style: 'gap:8px' },
        S.invite && h('button', { class: 'btn', onclick: () => share(t) }, 'Позвать друзей'),
        h('button', { class: 'btn-ghost', onclick: async () => { await run({ t: t.mine && t.kind === 'user' ? 'cancelT' : 'unreg', id: t.id }); send({ t: 'tour', id: t.id }); } },
          t.mine && t.kind === 'user' ? 'Отменить турнир (взносы вернутся)' : 'Отменить регистрацию'));
    } else if (me.rating < t.minRating) {
      action = h('button', { class: 'btn-ghost', disabled: true }, `Нужен рейтинг ${t.minRating} · у тебя ${me.rating}`);
    } else if (t.count >= t.maxPlayers) {
      action = h('button', { class: 'btn-ghost', disabled: true }, 'Мест нет');
    } else if (me.chips < t.buyin) {
      action = h('button', { class: 'btn', onclick: () => go('wallet') }, `Пополнить — взнос ${fmt(t.buyin)}`);
    } else {
      action = h('button', { class: 'btn', onclick: async () => { await run({ t: 'reg', id: t.id }); send({ t: 'tour', id: t.id }); } }, `Играть · взнос ${fmt(t.buyin)}`);
    }
  } else if (t.status === 'running' && atTable) {
    action = h('button', { class: 'btn', onclick: () => { send({ t: 'table' }); go('table'); } }, 'За стол');
  }
  const done = t.status === 'done';
  const players = t.players.slice().sort((a, b) => (a.place ?? 1e9) - (b.place ?? 1e9));
  return h('div', { class: 'screen' },
    header(t.name),
    h('div', { class: 'glass card' },
      h('div', { class: 'grid3' }, stat('Рейтинг', t.minRating ? `от ${t.minRating}` : 'любой'), stat('Взнос', fmt(t.buyin)), stat('Призовой', fmt(t.prizePool))),
      h('div', { class: 'grid3' }, stat('Игроков', `${t.count} / ${t.maxPlayers}`), stat('Блайнды', `${t.blindMin} мин`), stat('Старт', t.startMode === 'time' ? clock(t.startAt) : 'при сборе')),
      h('div', { class: 'progress' }, h('div', { style: `width:${(t.count / t.maxPlayers) * 100}%` })),
      h('div', { class: 'small b' }, statusText(t)),
      t.level && h('div', { class: 'small soft' }, `Уровень ${t.level.level} · блайнды ${t.level.sb}/${t.level.bb}`),
      h('div', { class: 'small muted' }, prizeText(t.status === 'reg' ? t.maxPlayers : t.count))),
    action,
    h('div', { class: 'label' }, done ? 'Итоги' : 'Участники'),
    players.length ? players.map((p) => h('div', { class: 'item' },
      h('div', { class: 'row' },
        h('div', { class: 'seat-dot taken' }, p.place ?? initial(p.name)),
        h('div', { class: 'col' }, h('div', { class: 'b', style: 'font-size:14px' }, p.id === me.id ? `${p.name} (ты)` : p.name), h('div', { class: 'small muted' }, `Эло ${p.rating}`))),
      p.prize ? h('div', { class: 'b' }, `+${fmt(p.prize)}`) : null))
      : h('div', { class: 'muted small' }, 'Пока никого'));
}

function prizeText(n) {
  const shares = n <= 2 ? [100] : n <= 5 ? [70, 30] : n <= 17 ? [60, 30, 10] : [45, 25, 15, 10, 5];
  return `Призы: ${shares.map((s, i) => `${i + 1} место ${s}%`).join(', ')}. Взносы и призы — в фишках.`;
}

function share(t) {
  const text = `Го в покер-турнир «${t.name}»!`;
  const url = `https://t.me/share/url?url=${encodeURIComponent(S.invite)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else navigator.clipboard?.writeText(S.invite).then(() => toast('Ссылка скопирована'));
}

// ---------- Создать турнир ----------

function createScreen() {
  const c = S.create;
  const choice = (key, values, labelFn = fmt) => h('div', { class: 'choices' }, values.map((v) =>
    h('button', { class: c[key] === v ? 'on' : '', onclick: () => { c[key] = v; render(); } }, labelFn(v))));
  return h('div', { class: 'screen' },
    header('Новый турнир'),
    h('div', { class: 'field' },
      h('label', { class: 'label', for: 't-name' }, 'Название'),
      h('input', { id: 't-name', class: 'input', maxlength: 40, value: c.name, placeholder: `Стол ${S.me.name}`, oninput: (e) => { c.name = e.target.value; } })),
    h('div', { class: 'field' }, h('div', { class: 'label' }, 'Игроков'), choice('maxPlayers', S.lobby?.sizes || [2, 3, 6, 18, 60])),
    h('div', { class: 'field' },
      h('div', { class: 'label' }, 'Взнос (фишки)'),
      choice('buyin', [500, 1000, 5000, 'own'], (v) => (v === 'own' ? 'Свой' : fmt(v))),
      c.buyin === 'own' && h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 100, placeholder: 'От 100', value: c.customBuyin, 'aria-label': 'Свой взнос', oninput: (e) => { c.customBuyin = e.target.value; } })),
    h('div', { class: 'grid2' },
      h('div', { class: 'field' },
        h('label', { class: 'label', for: 't-rating' }, 'Рейтинг от'),
        h('input', { id: 't-rating', class: 'input', type: 'number', inputmode: 'numeric', placeholder: 'любой', value: c.minRating, oninput: (e) => { c.minRating = e.target.value; } })),
      h('div', { class: 'field' },
        h('label', { class: 'label', for: 't-speed' }, 'Рост блайндов'),
        h('select', { id: 't-speed', class: 'input', onchange: (e) => { c.blindMin = Number(e.target.value); } },
          (S.lobby?.blindOptions || [3, 5, 10]).map((m) => h('option', { value: m, selected: c.blindMin === m }, `каждые ${m} мин`))))),
    h('div', { class: 'field' },
      h('div', { class: 'label' }, 'Старт'),
      h('div', { class: 'seg' },
        h('button', { class: c.startMode === 'full' ? 'on' : '', onclick: () => { c.startMode = 'full'; render(); } }, 'Когда соберутся'),
        h('button', { class: c.startMode === 'time' ? 'on' : '', onclick: () => { c.startMode = 'time'; render(); } }, 'По времени')),
      c.startMode === 'time' && h('select', { class: 'input', 'aria-label': 'Через сколько старт', onchange: (e) => { c.startIn = Number(e.target.value); } },
        [[15, 'через 15 минут'], [30, 'через 30 минут'], [60, 'через час'], [180, 'через 3 часа'], [720, 'через 12 часов'], [1440, 'через сутки']]
          .map(([v, l]) => h('option', { value: v, selected: c.startIn === v }, l)))),
    h('div', { class: 'item', style: 'padding:14px;border-radius:16px' },
      h('div', { class: 'col' }, h('div', { style: 'font-size:15px;font-weight:600' }, 'Закрытый'), h('div', { class: 'small soft' }, 'Зайти можно только по твоей ссылке')),
      h('button', { class: `switch ${c.private ? 'on' : ''}`, role: 'switch', 'aria-checked': String(c.private), 'aria-label': 'Закрытый турнир', onclick: () => { c.private = !c.private; render(); } })),
    h('div', { class: 'small muted', style: 'line-height:1.5;padding-bottom:70px' }, prizeText(c.maxPlayers)),
    h('button', { class: 'btn cta', onclick: createTour }, 'Создать и позвать друзей'));
}

async function createTour() {
  const c = S.create;
  const buyin = c.buyin === 'own' ? Number(c.customBuyin) : c.buyin;
  const r = await run({ t: 'createT', tour: { ...c, buyin, minRating: Number(c.minRating) || 0 } });
  if (r) {
    toast('Турнир создан — зови друзей');
    openTour(r.id);
  }
}

// ---------- Кошелёк ----------

function walletScreen() {
  const me = S.me;
  const bonus = me.bonus;
  return h('div', { class: 'screen' },
    header('Кошелёк'),
    h('div', { class: 'glass card balance' },
      h('div', { class: 'small soft', style: 'font-size:13px' }, 'Фишки'),
      h('div', { class: 'big' }, fmt(me.chips)),
      h('div', { class: 'small muted' }, `В игре: ${fmt(me.inPlay)} · место по фишкам: ${fmt(me.chipsPlace)}`)),
    bonus && h('div', { class: 'item', style: 'padding:14px;border-radius:16px' },
      h('div', { class: 'col' }, h('div', { style: 'font-size:15px;font-weight:600' }, 'Ежедневный бонус'), h('div', { class: 'small soft' }, `+${fmt(bonus.amount)} фишек раз в сутки`)),
      h('button', { class: 'btn-sm', disabled: nowSrv() < bonus.readyAt, onclick: () => run({ t: 'bonus' }) },
        nowSrv() < bonus.readyAt ? `через ${timeLeft(bonus.readyAt)}` : 'Забрать')),
    h('div', { class: 'label' }, 'Пополнить звёздами'),
    h('div', { class: 'grid2' }, (S.lobby?.packs || []).map((p) => h('button', { class: `pack`, onclick: () => run({ t: 'invoice', pack: p.id }) },
      h('span', { class: 'chips' }, fmt(p.chips)),
      h('span', { class: 'small soft' }, `фишек ${p.bonus ? `· ${p.bonus}` : ''}`),
      h('span', { class: 'row b', style: 'gap:6px;font-size:15px' }, icon('star', 16), fmt(p.stars))))),
    h('div', { class: 'small muted', style: 'line-height:1.5' }, 'Фишки — игровая валюта: на них играют, их выигрывают, но вывести или обменять их нельзя. Оплата звёздами проходит внутри Telegram.'),
    h('div', { class: 'label', id: 'hints-section', style: 'padding-top:6px' }, `Подсказки · у тебя ${me.hints || 0}`),
    h('div', { class: 'small soft', style: 'line-height:1.45' }, 'В свой ход: карты соперников, какие карты выйдут на стол дальше и лучший ход. За столом с людьми они увидят, что ты взял подсказку.'),
    h('div', { class: 'grid3' }, (S.lobby?.hintPacks || []).map((p) => h('button', { class: 'pack', onclick: () => run({ t: 'invoice', pack: p.id }) },
      h('span', { class: 'chips' }, p.hints),
      h('span', { class: 'small soft' }, p.hints === 1 ? 'подсказка' : p.hints < 5 ? 'подсказки' : 'подсказок'),
      h('span', { class: 'row b', style: 'gap:6px;font-size:15px' }, icon('star', 16), fmt(p.stars))))),
    h('div', { style: 'height:80px' }),
    nav());
}

// ---------- Профиль ----------

// Награды Эло за чистый выигрыш (выигрыши минус проигрыши в играх)
function winRewardsCard(me) {
  const rewards = me.winRewards || [];
  if (!rewards.length) return null;
  const next = rewards.find((r) => !r.done);
  const won = me.won || 0;
  return h('div', { class: 'glass card', style: 'gap:12px' },
    h('div', { class: 'row between' },
      h('div', { class: 'b' }, 'Награды за выигрыш'),
      h('div', { class: 'small soft' }, `чистый выигрыш ${won < 0 ? '−' : ''}${fmt(Math.abs(won))}`)),
    next && h('div', { class: 'progress' }, h('div', { style: `width:${Math.max(0, Math.min(100, (won / next.at) * 100))}%;background:#f2c94c` })),
    rewards.map((r) => h('div', { class: 'row between', style: 'font-size:14px' },
      h('span', { class: r.done ? 'soft' : '' }, `${fmt(r.at)} фишек`),
      h('span', { class: 'b', style: `color:${r.done ? '#7fd1a8' : '#f2c94c'}` }, r.done ? `+${r.elo} Эло — получено` : `+${r.elo} Эло`))),
    h('div', { class: 'small muted', style: 'line-height:1.45' }, 'Считаются итоги столов с ботами и турниров: выигрыши минус проигрыши. Покупка фишек не в счёт.'));
}

function profileScreen() {
  const me = S.me;
  return h('div', { class: 'screen' },
    h('div', { class: 'row' },
      h('div', { class: 'avatar', style: 'width:56px;height:56px;font-size:22px' }, initial(me.name)),
      h('div', { class: 'col' }, h('h1', { class: 'h2' }, me.name), h('div', { class: 'small muted' }, `Эло ${me.rating}`))),
    h('div', { class: 'glass card' },
      h('div', { class: 'grid3' }, stat('Место', fmt(me.ratingPlace)), stat('Турниров', me.games), stat('Побед', me.wins)),
      h('div', { class: 'grid3' }, stat('Раздач выиграно', fmt(me.handsWon || 0)), stat('Эло', me.rating), stat('Подсказок', me.hints || 0)),
      h('div', { class: 'grid3' }, stat('Фишки', fmt(me.chips)), stat('В игре', fmt(me.inPlay)), stat('По фишкам', fmt(me.chipsPlace)))),
    winRewardsCard(me),
    themesCard(),
    h('div', { class: 'label' }, 'Топ игроков по рейтингу'),
    S.top == null ? h('div', { class: 'muted small' }, 'Загрузка…')
      : S.top.length ? S.top.map((p, i) => h('div', { class: 'item' },
        h('div', { class: 'row' }, h('div', { class: 'seat-dot taken' }, i + 1), h('div', { class: 'b', style: 'font-size:14px' }, p.name)),
        h('div', { class: 'col', style: 'align-items:flex-end' }, h('div', { class: 'b' }, p.rating), h('div', { class: 'small muted' }, `${p.games} турн.`))))
        : h('div', { class: 'muted small' }, 'Рейтинг появится после первых турниров'),
    h('div', { style: 'height:70px' }),
    nav());
}

// ---------- Справочник комбинаций ----------

const C = (str) => str.split(' ').map((x) => {
  const r = '23456789TJQKA'.indexOf(x[0]);
  return { c: r * 4 + 'shdc'.indexOf(x[1]), dim: x[2] === '-' };
});
// от сильной к слабой; номер = категория оценщика (8 — стрит-флеш … 0 — старшая карта)
const COMBOS = [
  { cat: 9, name: 'Роял-флеш', text: 'Туз, король, дама, валет, десятка одной масти. Сильнее не бывает.', cards: C('As Ks Qs Js Ts') },
  { cat: 8, name: 'Стрит-флеш', text: 'Пять карт подряд одной масти.', cards: C('9h 8h 7h 6h 5h') },
  { cat: 7, name: 'Каре', text: 'Четыре карты одного достоинства.', cards: C('Kc Kd Kh Ks 7d-') },
  { cat: 6, name: 'Фулл-хаус', text: 'Сет и пара вместе.', cards: C('Qs Qh Qd 9c 9s') },
  { cat: 5, name: 'Флеш', text: 'Пять карт одной масти, не подряд.', cards: C('Ad Jd 8d 6d 2d') },
  { cat: 4, name: 'Стрит', text: 'Пять карт подряд любых мастей. Туз может быть и младшим: A-2-3-4-5.', cards: C('Tc 9d 8s 7h 6c') },
  { cat: 3, name: 'Сет (тройка)', text: 'Три карты одного достоинства.', cards: C('8s 8h 8d Kc- 3s-') },
  { cat: 2, name: 'Две пары', text: 'Две разные пары.', cards: C('Jh Jc 4s 4d Ac-') },
  { cat: 1, name: 'Пара', text: 'Две карты одного достоинства.', cards: C('As Ad Kc- 9h- 5s-') },
  { cat: 0, name: 'Старшая карта', text: 'Ничего не собрано — решает самая старшая карта.', cards: C('Ac Qd- 9s- 6h- 3c-') },
];

function combosScreen() {
  const me = S.table?.seats.find((s) => s.me);
  // роял-флеш — тоже категория 8, но с тузом во главе
  const myCat = me?.myHandCat == null ? null : me.myHandCat === 8 && me.myHand === 'Роял-флеш' ? 9 : me.myHandCat;
  const myTurn = S.turn && S.table && S.table.actor === S.me.id;
  return h('div', { class: 'screen' },
    header('Комбинации'),
    myTurn && h('button', { class: 'btn', onclick: () => go('table') }, 'Твой ход — к столу'),
    h('div', { class: 'small soft', style: 'line-height:1.5' },
      'Из семи карт — двух твоих и пяти на столе — берутся лучшие пять. Сверху самая сильная. Масти равны; при одинаковой комбинации решают старшие карты (кикеры).'),
    COMBOS.map((k, i) => h('div', { class: `combo ${myCat === k.cat ? 'mine' : ''}` },
      h('div', { class: 'row between' },
        h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'combo-n' }, i + 1), h('span', { class: 'b', style: 'font-size:16px' }, k.name)),
        myCat === k.cat && h('span', { class: 'tag', style: 'background:var(--silver);color:var(--ink);font-weight:700' }, 'у тебя')),
      h('div', { class: 'board', style: 'gap:4px' }, k.cards.map(({ c, dim }) => {
        const el = pcard(c, 'sm');
        if (dim) el.classList.add('dim');
        return el;
      })),
      h('div', { class: 'small soft', style: 'line-height:1.45' }, k.text))),
    h('div', { style: 'height:20px' }));
}

// ---------- Рендер ----------

const SCREENS = { solo: soloScreen, mixed: mixedScreen, combos: combosScreen, lobby: lobbyScreen, bots: botsScreen, table: tableScreen, tours: toursScreen, tour: tourScreen, create: createScreen, wallet: walletScreen, profile: profileScreen };

function render() {
  const app = document.getElementById('app');
  const active = document.activeElement;
  const focusId = active?.id && active.tagName !== 'BUTTON' ? active.id : null;
  if (S.error) return app.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'center-msg' }, h('div', { class: 'h2' }, 'Покер'), h('div', { class: 'muted' }, S.error))));
  if (!S.me || S.screen === 'loading') return app.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'center-msg muted' }, S.connected ? 'Входим…' : 'Подключаемся…')));
  app.replaceChildren(SCREENS[S.screen]());
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus(); if (el.setSelectionRange && el.type === 'text') el.setSelectionRange(el.value.length, el.value.length); }
  }
  if (S.pendingFx) {
    const fx = S.pendingFx;
    S.pendingFx = null;
    try { runFx(fx, S.table); } catch {}
  }
  // таймер хода
  for (const bar of app.querySelectorAll('[data-deadline]')) {
    const left = Number(bar.dataset.deadline) - nowSrv();
    const total = (S.lobby?.turnSeconds || 20) * 1000;
    bar.style.width = `${Math.max(0, Math.min(100, (left / total) * 100))}%`;
    requestAnimationFrame(() => { bar.style.transition = `width ${Math.max(0, left)}ms linear`; bar.style.width = '0%'; });
  }
  if (tg) S.screen === 'lobby' ? tg.BackButton.hide() : tg.BackButton.show();
}

// Обратный отсчёт хода: обновляем только цифры, без перерисовки (не сбивает слайдер)
let buzzed = 0;
setInterval(() => {
  for (const e of document.querySelectorAll('[data-ends]')) {
    const left = Number(e.dataset.ends) - nowSrv();
    e.textContent = left > 0 ? `осталось ${clockLeft(Number(e.dataset.ends))}` : 'время вышло — доигрываем раздачу';
  }
  const el = document.querySelector('[data-countdown]');
  if (!el) return;
  const deadline = Number(el.dataset.countdown);
  const sec = Math.max(0, Math.ceil((deadline - nowSrv()) / 1000));
  el.querySelector('.cd-sec').textContent = `${sec} с`;
  el.classList.toggle('hurry', sec <= 5);
  if (sec <= 5 && sec > 0 && buzzed !== deadline) {
    buzzed = deadline;
    tg?.HapticFeedback?.notificationOccurred('warning');
  }
}, 200);

tg?.ready();
tg?.expand();
applyTheme(loadTheme());
tg?.disableVerticalSwipes?.();
render();
connect();
setInterval(() => { if (['lobby', 'tours', 'tour'].includes(S.screen)) render(); }, 30000);
