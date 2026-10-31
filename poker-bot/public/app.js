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
  gift: '<path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3.5-5-1s3 1 5 1c2 0 5 1.5 5-1s-3.5-2-5 1" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
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
      send({ t: 'look' });
      if (coachOn()) send({ t: 'coach', on: true });
      if (S.screen === 'loading') {
        openStart(m.startParam);
        // первый запуск: один раз спрашиваем, умеет ли человек играть
        if (!tutorialAsked() && !m.startParam) S.askTutorial = true;
      }
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
      trackSession(S.table, m.table);
      tableSounds(S.table, m.table);
      if (S.turn && m.table?.deadline > S.turn.deadline) S.turn.deadline = m.table.deadline; // таймбанк
      S.table = m.table;
      if (m.table && S.screen !== 'table' && !S.tableHidden) go('table');
      if (S.turn && m.table && m.table.actor !== S.me?.id) S.turn = null;
      break;
    case 'turn':
      // вибрация на твой ход (можно выключить в быстрых настройках)
      if (loadUi().vibro !== false) { try { if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('warning'); else navigator.vibrate?.(80); } catch {} }
      S.turn = m;
      S.hint = null;
      S.raiseTo = clampRaise(m.currentBet + 0.66 * (m.pot + m.toCall), m);
      tg?.HapticFeedback?.impactOccurred('medium');
      if (runPreAction(m)) break;
      sfx('turn');
      break;
    case 'tour': S.tour = m.tour; S.invite = m.invite; break;
    case 'top': S.top = m.rating; S.topKind = m.kind; break;
    case 'look':
      S.look = m.look;
      applyUi();
      break;
    case 'card': S.card = m.card; break;
    case 'botsInfo': S.botsInfo = m; break;
    case 'friends':
      S.friends = m;
      if (m.text) toast(m.text);
      break;
    case 'club': S.club = m; break;
    case 'admin':
      S.adm = { ...(S.adm || {}), ...m };
      if (m.user) S.adm.users = (S.adm.users || []).map((u) => (u.id === m.user.id ? m.user : u));
      if (m.text) toast(m.text);
      break;
    case 'invite': S.friendInvite = m; break;
    case 'watchEnd':
      toast('Друг встал из-за стола');
      S.table = null;
      go('friends');
      break;
    case 'coach':
      S.coachTips = m.tips;
      clearTimeout(S.coachTimer);
      S.coachTimer = setTimeout(() => { S.coachTips = null; render(); }, 9000);
      break;
    case 'progress':
      S.progress = m.progress;
      if (m.text) toast(m.text);
      if (m.chest) S.chestOpened = m.chest;
      break;
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
      S.pre = null;
      // итог сессии — карточкой в лобби
      S.summary = {
        title: m.beatAll ? 'Ты обыграл всех ботов!' : m.kicked ? 'Тебя убрали со стола: 2 хода подряд пропущено' : m.timed ? 'Время стола вышло' : 'Ты встал из-за стола',
        hands: m.hands, won: m.won, net: m.demo ? null : m.net, stack: m.stack,
        minutes: S.session ? Math.max(1, Math.round((Date.now() - S.session.start) / 60000)) : null,
        graph: S.session?.stacks?.length > 1 ? S.session.stacks.slice() : null,
      };
      S.session = null;
      go('lobby');
      // следующий стол сам: обыграл всех ботов — садимся за такой же
      if (m.beatAll && loadUi().autoNext && S.lastSit) setTimeout(() => sitBots(), 1500);
      break;
    case 'invoice':
      tg?.openInvoice(m.link, (status) => {
        if (status === 'paid') toast('Оплачено! Фишки зачислены');
        else if (status === 'failed') toast('Оплата не прошла');
      });
      break;
    case 'paid': toast('Фишки зачислены (тестовый режим)'); break;
    case 'toast': toast(m.text); break;
    case 'prank': prankFx(m); break;
    case 'replayShared': toast(`${m.from} прислал раздачу — открой в Telegram или в «Друзьях»`); break;
  }
  render();
}

// ---------- Сессия за столом: время, раздачи, выигрыши ----------

function trackSession(prev, next) {
  if (!next) return;
  const key = next.tournamentId || next.id;
  if (!S.session || S.session.key !== key) S.session = { key, start: Date.now(), hands: 0, won: 0, lastHand: null, stacks: [], lastRes: null };
  const ss = S.session;
  if (next.handId && next.handId !== ss.lastHand && next.seats.some((x) => x.me && (x.inHand || x.folded))) {
    ss.lastHand = next.handId;
    ss.hands++;
    S.dealPending = true; // анимация раздачи — в первой отрисовке новой раздачи
    S.pre = null;
  }
  if (next.result && !(prev?.result && prev.handId === next.handId) && next.result.some((w) => w.id === S.me?.id)) ss.won++;
  // график стека: точка после каждой раздачи
  const me = next.seats.find((x) => x.me);
  if (me && next.result && ss.lastRes !== next.handId) { ss.lastRes = next.handId; ss.stacks.push(me.stack); if (ss.stacks.length > 300) ss.stacks.shift(); }
}

// ---------- Звуки (синтез, без файлов) ----------

let audioCtx = null;
function setSound(on) {
  try { localStorage.setItem('sound', on ? 'on' : 'off'); } catch {}
  if (on) sfx('win');
}
function soundOn() {
  try { return localStorage.getItem('sound') !== 'off'; } catch { return true; }
}
function sfx(kind) {
  if (!soundOn() || document.hidden) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
    const tone = (freq, start, dur, type = 'sine', vol = 0.08) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + start);
      o.stop(ctx.currentTime + start + dur + 0.02);
    };
    if (kind === 'chip') { tone(2200, 0, 0.05, 'triangle', 0.05); tone(1700, 0.04, 0.05, 'triangle', 0.04); }
    if (kind === 'card') tone(900, 0, 0.06, 'square', 0.025);
    if (kind === 'turn') { tone(660, 0, 0.12); tone(880, 0.1, 0.16); }
    if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle', 0.07));
    if (kind === 'roar') { tone(110, 0, 0.25, 'sawtooth', 0.06); tone(90, 0.15, 0.3, 'sawtooth', 0.06); tone(70, 0.3, 0.35, 'square', 0.04); }
    if (kind === 'allin') { tone(196, 0, 0.3, 'sawtooth', 0.04); tone(147, 0.12, 0.35, 'sawtooth', 0.04); }
  } catch {}
}

function tableSounds(prev, next) {
  if (!prev || !next || prev.id !== next.id || S.screen !== 'table') return;
  // субтитры и озвучка: что сделал игрок
  const ui = loadUi();
  if (ui.subs || ui.voice) {
    for (const s of next.seats) {
      const was = prev.seats.find((x) => x.id === s.id);
      if (!was || s.last === was.last || !s.last) continue;
      const line = `${s.me ? 'Ты' : s.name}: ${s.last}`;
      if (ui.subs) { S.subs = [...(S.subs || []).slice(-1), line]; }
      if (ui.voice && !s.me) { try { const u = new SpeechSynthesisUtterance(line); u.lang = 'ru-RU'; u.rate = 1.15; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {} }
    }
  }
  if (next.board.length > prev.board.length) sfx('card');
  const prevBet = Object.fromEntries(prev.seats.map((x) => [x.id, x.bet]));
  if (next.seats.some((x) => x.bet > (prevBet[x.id] || 0))) sfx('chip');
  if (next.seats.some((x) => x.allIn) && !prev.seats.some((x) => x.allIn)) sfx('allin');
  // голос бота: рык, когда бот идёт олл-ин
  const wasAll = new Set(prev.seats.filter((x) => x.allIn).map((x) => x.id));
  if (next.seats.some((x) => x.isBot && x.allIn && !wasAll.has(x.id))) setTimeout(() => sfx('roar'), 250);
  if (next.result && !prev.result && next.result.some((w) => w.id === S.me?.id)) {
    sfx('win');
    const mine = next.result.find((w) => w.id === S.me?.id);
    winEffect(); // эффект победы (выбирается в настройках)
    if (mine.amount >= 30 * next.bb) setTimeout(() => confetti(), 400); // большой банк — салют
  }
}

// ---------- Кнопки заранее: «чек/фолд», «чек», «колл любой» ----------

function runPreAction(t) {
  const p = S.pre;
  if (!p || p.hand !== S.table?.handId) return false;
  S.pre = null;
  let action = null;
  if (p.kind === 'cf') action = { type: t.toCall > 0 ? 'fold' : 'check' };
  if (p.kind === 'c' && t.toCall === 0) action = { type: 'check' };
  if (p.kind === 'any') action = { type: t.toCall > 0 ? 'call' : 'check' };
  if (p.kind === 'half') action = t.maxTo > t.currentBet ? { type: 'raise', to: clampRaise(t.currentBet + 0.5 * (t.pot + t.toCall), t) } : { type: t.toCall > 0 ? 'call' : 'check' };
  if (!action) return false;
  setTimeout(() => {
    send({ t: 'act', action });
    S.turn = null;
    render();
  }, 250);
  return true;
}

// ---------- Свои размеры ставок (в доле банка) ----------

const PRESET_OPTIONS = [0.33, 0.5, 0.66, 0.75, 1, 1.5, 2];
const presetLabel = (f) => ({ 0.33: '⅓ банка', 0.5: '½ банка', 0.66: '⅔ банка', 0.75: '¾ банка', 1: 'Банк', 1.5: '1.5 банка', 2: '2 банка' }[f] || `${f}×`);
function loadPresets() {
  try {
    const v = JSON.parse(localStorage.getItem('presets') || 'null');
    if (Array.isArray(v) && v.length === 3 && v.every((x) => PRESET_OPTIONS.includes(x))) return v;
  } catch {}
  return [0.5, 0.75, 1];
}
function togglePreset(f) {
  let cur = loadPresets();
  if (cur.includes(f)) return toast('Выбери 3 размера: нажми на другой, чтобы заменить');
  cur = [...cur.slice(1), f].sort((a, b) => a - b);
  try { localStorage.setItem('presets', JSON.stringify(cur)); } catch {}
  render();
}

// ---------- Салют на большой выигрыш ----------

function confetti() {
  if (document.hidden) return;
  const layer = fxLayer();
  const colors = ['#f2c94c', '#7fd1a8', '#eb5757', '#56ccf2', '#bb6bd9', '#fff'];
  for (let i = 0; i < 48; i++) {
    const c = h('div', { class: 'confetti', style: `left:${50 + (Math.random() - 0.5) * 20}%;top:45%;background:${colors[i % colors.length]}` });
    layer.append(c);
    const dx = (Math.random() - 0.5) * 520, dy = -180 - Math.random() * 260;
    const a = c.animate([
      { transform: 'translate(0,0) rotate(0)', opacity: 1 },
      { transform: `translate(${dx * 0.6}px, ${dy}px) rotate(${Math.random() * 540}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy + 520}px) rotate(${Math.random() * 900}deg)`, opacity: 0 },
    ], { duration: 1600 + Math.random() * 600, easing: 'cubic-bezier(.2,.6,.4,1)' });
    a.onfinish = () => c.remove();
  }
}

// ---------- Внешний вид: аватар, рамка, карточка игрока, настройки экрана ----------

function seatAvatar(s) {
  const a = s.look?.avatar;
  if (S.masksUntil > Date.now()) return h('div', { class: 'ava emoji' }, '🎭');
  const inner = a?.photo ? h('img', { src: a.photo, alt: '', referrerpolicy: 'no-referrer' }) : a?.emoji ? a.emoji : initial(s.name);
  return h('div', { class: `ava ${s.me ? 'me' : ''} ${a?.emoji ? 'emoji' : ''} ${ANIM_AVATARS.includes(a?.emoji) ? 'ava-anim' : ''} ${s.look?.frame ? `frame-${s.look.frame}` : ''}` }, inner);
}

function playerCardModal(c) {
  const close = () => { S.card = null; render(); };
  return h('div', { class: 'card-modal', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
    h('div', { class: 'glass card', style: 'gap:10px;background:rgba(12,24,26,0.96)' },
      c.look?.banner && h('div', { class: `pc-banner banner-${c.look.banner}` }),
      h('div', { class: 'row between' },
        h('div', { class: 'row' },
          c.bot ? h('div', { class: 'ava', style: 'width:44px;height:44px;font-size:18px' }, initial(c.name)) : seatAvatar({ name: c.name, look: c.look }),
          h('div', { class: 'col', style: 'gap:2px' }, h('div', { class: `b ${c.look?.nameFx ? `nfx-${c.look.nameFx}` : ''}`, style: 'font-size:17px' }, c.name),
            h('div', { class: 'small', style: c.rankColor ? `color:${c.rankColor}` : '' }, c.bot ? `Бот · ${fmt(c.elo)} Эло` : `${c.rank} · ${fmt(c.rating)} Эло`),
            c.look?.title && h('div', { class: 'small', style: 'color:#f5d37a' }, `«${c.look.title}»`))),
        h('button', { class: 'hint-x', 'aria-label': 'Закрыть', onclick: close }, '✕')),
      c.bot && h('div', { class: 'small soft', style: 'line-height:1.45' }, c.style),
      h('div', { class: 'grid3' },
        stat('Раздач выиграно', fmt(c.handsWon || 0)),
        c.bot ? stat('Эло', fmt(c.elo)) : stat('Достижений', c.achievements),
        c.bot ? stat('', '') : stat('Побед в турн.', c.tourWins || 0)),
      c.bot && c.vs?.hands > 0 && h('div', { class: 'small soft' }, `Против тебя: раздач ${fmt(c.vs.hands)}, ты выиграл ${fmt(c.vs.wins)} (${Math.round((c.vs.wins / c.vs.hands) * 100)}%)${c.vs.net ? ` · итог 1 на 1: ${c.vs.net > 0 ? '+' : '−'}${fmt(Math.abs(c.vs.net))}` : ''}`),
      c.bot && c.level && c.level !== 'normal' && h('div', { class: 'small muted' }, `Сложность: ${c.level === 'easy' ? 'лёгкий' : 'мастер'}`),
      // твоя заметка и метка — видишь только ты
      c.notes && c.id !== S.me.id && h('div', { class: 'col', style: 'gap:6px' },
        h('div', { class: 'small muted' }, 'Метка и заметка (видишь только ты)'),
        h('div', { class: 'row', style: 'gap:6px' }, ['red', 'orange', 'yellow', 'green', 'blue', 'purple', null].map((col) => h('button', {
          class: `tag-dot ${col ? `tag-bg-${col}` : ''} ${(c.notes.color || null) === col ? 'on' : ''}`, 'aria-label': col || 'без метки',
          onclick: async () => { c.notes.color = col; await run({ t: 'setNote', target: c.notes.target, note: c.notes.note || '', color: col }); render(); },
        }, col ? '' : '✕'))),
        h('input', { class: 'buyin-input', style: 'margin:0', placeholder: 'Заметка: «часто блефует на ривере»', value: c.notes.note || '', maxlength: 300,
          onchange: (e) => { c.notes.note = e.target.value; run({ t: 'setNote', target: c.notes.target, note: e.target.value, color: c.notes.color || null }); } })),
      !c.bot && c.id !== S.me.id && !c.friend && h('button', { class: 'btn-sm', onclick: async () => { if (await run({ t: 'addFriend', ref: c.id })) toast('Заявка в друзья отправлена'); } }, 'Добавить в друзья'),
      // витрина
      !c.bot && c.showcase && h('div', { class: 'showcase' },
        h('div', { class: 'small' }, `Уровень ${c.showcase.level}${c.showcase.prestige ? ` · ★${c.showcase.prestige}` : ''} · 🥇${c.showcase.medals.gold} 🥈${c.showcase.medals.silver} 🥉${c.showcase.medals.bronze}`),
        h('div', { class: 'small muted' }, `Коллекция карт ${c.showcase.cards}/52 · альбом ${c.showcase.album}/10`),
        c.showcase.best?.cards && h('div', { class: 'row', style: 'gap:6px;align-items:center' }, h('span', { class: 'small muted' }, 'Лучшая рука:'), h('div', { class: 'tut-cards' }, c.showcase.best.cards.map((x) => pcard(x, 'sm'))))),
      !c.bot && c.stats && h('div', { class: 'small muted' }, `Сыграно раздач: ${fmt(c.stats.hands)}${c.stats.bestCat >= 0 ? ` · лучшая рука: ${HAND_CATS[c.stats.bestCat]}` : ''}`)));
}

// Настройки экрана на этом устройстве: колода, сцена, фишки, анимация, режим
const SCENES = [['felt', 'Сукно'], ['casino', 'Казино'], ['city', 'Ночной город'], ['space', 'Космос'], ['sakura', 'Сакура'], ['vegas', 'Вегас'], ['yacht', 'Яхта'], ['dungeon', 'Подземелье'], ['neon', 'Неон-ночь'], ['photo', 'Своё фото']];
const CHIP_STYLES = [['classic', 'Классика'], ['neon', 'Неон'], ['gold', 'Золото'], ['halloween', 'Хэллоуин'], ['newyear', 'Новый год'], ['valentine', 'Валентин'],
  ['ocean', 'Океан'], ['forest', 'Лес'], ['candy', 'Конфеты'], ['pastel', 'Пастель'], ['metal', 'Металл'], ['ruby', 'Рубин'], ['emerald', 'Изумруд'], ['sapphire', 'Сапфир'], ['amethyst', 'Аметист'], ['obsidian', 'Обсидиан'], ['ivory', 'Слоновая кость'], ['retro', 'Ретро'], ['vaporwave', 'Вейпорвейв'], ['cyber', 'Кибер'], ['desert', 'Пустыня'], ['ice', 'Лёд'], ['lava', 'Лава'], ['jungle', 'Джунгли'], ['royal', 'Королевские'], ['mono', 'Монохром'], ['sakura', 'Сакура'], ['autumn', 'Осень'], ['winter', 'Зима'], ['spring', 'Весна'], ['summer', 'Лето'], ['mafia', 'Мафия'], ['arcade', 'Аркада'], ['galaxy', 'Галактика'], ['copper', 'Медь'], ['rainbow', 'Радуга']];
const WIN_FX = [['gold', 'Золотая вспышка'], ['rain', 'Золотой дождь'], ['lightning', 'Молния'], ['crown', 'Корона'], ['none', 'Без эффекта']];
const CARD_FONTS = [['classic', 'Классика'], ['minimal', 'Минимализм'], ['large', 'Крупные']];
const DEAL_ANIM = [['pretty', 'Красиво'], ['fast', 'Быстро'], ['off', 'Без анимации']];
const BANNER_NAMES = { none: 'Без баннера', sunset: 'Закат', ocean: 'Океан', forest: 'Лес', royal: 'Королевский', fire: 'Огонь', night: 'Ночь', gold: 'Золото' };
const FELTS = [['auto', 'По сцене'], ...[['emerald', 'Изумрудное'], ['royal', 'Королевское синее'], ['burgundy', 'Бордовое'], ['purple', 'Фиолетовое'], ['black', 'Чёрное'], ['grey', 'Графит'], ['teal', 'Бирюзовое'], ['orange', 'Апельсин'], ['pink', 'Розовое'], ['gold', 'Золотое'], ['sky', 'Небо'], ['olive', 'Оливковое'], ['wine', 'Вино'], ['mint', 'Мятное'], ['sand', 'Песок'], ['ice', 'Ледяное'], ['lava', 'Лава'], ['night', 'Ночное'], ['forest', 'Лесное'], ['cream', 'Сливочное']]];
const RIMS = [['auto', 'По сцене'], ...[['wood', 'Дерево'], ['mahogany', 'Красное дерево'], ['gold', 'Золото'], ['silver', 'Серебро'], ['black', 'Чёрный лак'], ['white', 'Белый'], ['neon_pink', 'Неон розовый'], ['neon_blue', 'Неон синий'], ['neon_green', 'Неон зелёный'], ['leather', 'Кожа'], ['chrome', 'Хром'], ['ruby', 'Рубин'], ['ice', 'Лёд'], ['fire', 'Огонь'], ['rainbow', 'Радуга']]];
const FACES = [['auto', 'Обычные'], ...[['dark', 'Тёмные'], ['cream', 'Винтаж'], ['neon', 'Неон'], ['gold', 'Золотая кайма'], ['blue', 'Голубые'], ['pink', 'Розовые'], ['mint', 'Мятные'], ['paper', 'Бумага'], ['glass', 'Стекло'], ['royal', 'Королевские']]];
const DBTNS = [['auto', 'Белый'], ...[['gold', 'Золотой'], ['black', 'Чёрный'], ['red', 'Красный'], ['neon', 'Неон'], ['crown', 'Корона']]];
const FONTS = [['auto', 'Обычный'], ...[['serif', 'С засечками'], ['mono', 'Моно'], ['rounded', 'Округлый'], ['narrow', 'Узкий'], ['classic', 'Классика']]];
const SLOTS = [['auto', 'Пунктир'], ...[['solid', 'Сплошные'], ['glow', 'Светящиеся'], ['none', 'Невидимые'], ['gold', 'Золотые'], ['dots', 'Точки']]];
const PILLS = [['auto', 'Белая'], ...[['dark', 'Тёмная'], ['gold', 'Золотая'], ['neon', 'Неон'], ['red', 'Красная'], ['blue', 'Синяя'], ['green', 'Зелёная'], ['glass', 'Стекло'], ['purple', 'Фиолетовая'], ['pink', 'Розовая'], ['outline', 'Контур']]];
const FELTS_X = [['xscarlet', 'Алая'], ['xcoral', 'Коралловая'], ['xcopper', 'Медная'], ['xamber', 'Янтарная'], ['xhoney', 'Медовая'], ['xlemon', 'Лимонная'], ['xpistachio', 'Фисташковая'], ['xgrass', 'Травяная'], ['xmalachite', 'Малахитовая'], ['xjade', 'Нефритовая'], ['xsea', 'Морская'], ['xlagoon', 'Лагуна'], ['xaqua', 'Аквамариновая'], ['xazure', 'Лазурная'], ['xcobalt', 'Кобальтовая'], ['xindigo', 'Индиго'], ['xultra', 'Ультрамарин'], ['xlavender', 'Лавандовая'], ['xlilac', 'Сиреневая'], ['xamethyst', 'Аметистовая'], ['xorchid', 'Орхидея'], ['xfuchsia', 'Фуксия'], ['xraspberry', 'Малиновая'], ['xcherry', 'Вишнёвая'], ['xgarnet', 'Гранатовая'], ['xcoffee', 'Кофейная'], ['xtobacco', 'Табачная'], ['xash', 'Пепельная'], ['xstorm', 'Грозовая'], ['xsage', 'Шалфейная']];
const RIMS_X = [['xscarlet', 'Алый'], ['xcoral', 'Коралловый'], ['xcopper', 'Медный'], ['xamber', 'Янтарный'], ['xhoney', 'Медовый'], ['xlemon', 'Лимонный'], ['xpistachio', 'Фисташковый'], ['xgrass', 'Травяной'], ['xmalachite', 'Малахитовый'], ['xjade', 'Нефритовый'], ['xsea', 'Морской'], ['xlagoon', 'Лагуна'], ['xaqua', 'Аквамариновый'], ['xazure', 'Лазурный'], ['xcobalt', 'Кобальтовый'], ['xindigo', 'Индиго'], ['xultra', 'Ультрамарин'], ['xlavender', 'Лавандовый'], ['xlilac', 'Сиреневый'], ['xamethyst', 'Аметистовый']];
const FACES_X = [['xscarlet', 'Алая'], ['xamber', 'Янтарная'], ['xpistachio', 'Фисташковая'], ['xjade', 'Нефритовая'], ['xaqua', 'Аквамариновая'], ['xindigo', 'Индиго'], ['xlilac', 'Сиреневая'], ['xfuchsia', 'Фуксия'], ['xgarnet', 'Гранатовая'], ['xash', 'Пепельная'], ['xcoral', 'Коралловая'], ['xhoney', 'Медовая'], ['xgrass', 'Травяная'], ['xsea', 'Морская'], ['xazure', 'Лазурная'], ['xultra', 'Ультрамарин'], ['xamethyst', 'Аметистовая'], ['xraspberry', 'Малиновая'], ['xcoffee', 'Кофейная'], ['xstorm', 'Грозовая']];
const DBTNS_X = [['xscarlet', 'Алый'], ['xcopper', 'Медный'], ['xhoney', 'Медовый'], ['xpistachio', 'Фисташковый'], ['xmalachite', 'Малахитовый'], ['xsea', 'Морской'], ['xaqua', 'Аквамариновый'], ['xcobalt', 'Кобальтовый'], ['xultra', 'Ультрамарин'], ['xlilac', 'Сиреневый'], ['xorchid', 'Орхидея'], ['xraspberry', 'Малиновый'], ['xgarnet', 'Гранатовый'], ['xtobacco', 'Табачный'], ['xstorm', 'Грозовой']];
const PILLS_X = [['xcoral', 'Коралловая'], ['xamber', 'Янтарная'], ['xlemon', 'Лимонная'], ['xgrass', 'Травяная'], ['xjade', 'Нефритовая'], ['xlagoon', 'Лагуна'], ['xazure', 'Лазурная'], ['xindigo', 'Индиго'], ['xlavender', 'Лавандовая'], ['xamethyst', 'Аметистовая'], ['xfuchsia', 'Фуксия'], ['xcherry', 'Вишнёвая'], ['xcoffee', 'Кофейная'], ['xash', 'Пепельная'], ['xsage', 'Шалфейная']];
const FONTS_X = [['xslab', 'Брусковый'], ['ximpact', 'Плакат'], ['xbook', 'Книжный'], ['xtech', 'Техно'], ['xhand', 'Рукописный']];
const SLOTS_X = [['xscarlet', 'Алые'], ['xamber', 'Янтарные'], ['xpistachio', 'Фисташковые'], ['xjade', 'Нефритовые'], ['xaqua', 'Аквамариновые'], ['xindigo', 'Индиго'], ['xlilac', 'Сиреневые'], ['xfuchsia', 'Фуксия'], ['xgarnet', 'Гранатовые'], ['xash', 'Пепельные']];
const BGS_X = [['xscarlet', 'Алый'], ['xcoral', 'Коралловый'], ['xcopper', 'Медный'], ['xamber', 'Янтарный'], ['xhoney', 'Медовый'], ['xlemon', 'Лимонный'], ['xpistachio', 'Фисташковый'], ['xgrass', 'Травяной'], ['xmalachite', 'Малахитовый'], ['xjade', 'Нефритовый'], ['xsea', 'Морской'], ['xlagoon', 'Лагуна'], ['xaqua', 'Аквамариновый'], ['xazure', 'Лазурный'], ['xcobalt', 'Кобальтовый'], ['xindigo', 'Индиго'], ['xultra', 'Ультрамарин'], ['xlavender', 'Лавандовый'], ['xlilac', 'Сиреневый'], ['xamethyst', 'Аметистовый'], ['xorchid', 'Орхидея'], ['xfuchsia', 'Фуксия'], ['xraspberry', 'Малиновый'], ['xcherry', 'Вишнёвый'], ['xgarnet', 'Гранатовый'], ['xcoffee', 'Кофейный'], ['xtobacco', 'Табачный'], ['xash', 'Пепельный'], ['xstorm', 'Грозовой'], ['xsage', 'Шалфейный']];
const TIMERS_X = [['xscarlet', 'Алый'], ['xcopper', 'Медный'], ['xhoney', 'Медовый'], ['xpistachio', 'Фисташковый'], ['xmalachite', 'Малахитовый'], ['xsea', 'Морской'], ['xaqua', 'Аквамариновый'], ['xcobalt', 'Кобальтовый'], ['xultra', 'Ультрамарин'], ['xlilac', 'Сиреневый'], ['xorchid', 'Орхидея'], ['xraspberry', 'Малиновый'], ['xgarnet', 'Гранатовый'], ['xtobacco', 'Табачный'], ['xstorm', 'Грозовой']];
const HANDS_X = [['xscarlet', 'Алая'], ['xcopper', 'Медная'], ['xhoney', 'Медовая'], ['xpistachio', 'Фисташковая'], ['xmalachite', 'Малахитовая'], ['xsea', 'Морская'], ['xaqua', 'Аквамариновая'], ['xcobalt', 'Кобальтовая'], ['xultra', 'Ультрамарин'], ['xlilac', 'Сиреневая'], ['xorchid', 'Орхидея'], ['xraspberry', 'Малиновая'], ['xgarnet', 'Гранатовая'], ['xtobacco', 'Табачная'], ['xstorm', 'Грозовая']];
const EMOS_X = [['xcoral', 'Коралловая'], ['xamber', 'Янтарная'], ['xlemon', 'Лимонная'], ['xgrass', 'Травяная'], ['xjade', 'Нефритовая'], ['xlagoon', 'Лагуна'], ['xazure', 'Лазурная'], ['xindigo', 'Индиго'], ['xlavender', 'Лавандовая'], ['xamethyst', 'Аметистовая'], ['xfuchsia', 'Фуксия'], ['xcherry', 'Вишнёвая'], ['xcoffee', 'Кофейная'], ['xash', 'Пепельная'], ['xsage', 'Шалфейная']];
// новые группы: фон экрана стола, таймер хода, плашка «моя комбинация», подложка эмодзи
const BGS = [['auto', 'По сцене'], ...BGS_X];
const TIMERS = [['auto', 'Серебро'], ...TIMERS_X];
const HANDS = [['auto', 'Обычная'], ...HANDS_X];
const EMOS = [['auto', 'Без подложки'], ...EMOS_X];
for (const [list, add] of [[FELTS, FELTS_X], [RIMS, RIMS_X], [FACES, FACES_X], [DBTNS, DBTNS_X], [PILLS, PILLS_X], [FONTS, FONTS_X], [SLOTS, SLOTS_X]]) list.push(...add);
const ANIM_AVATARS = ['🔥', '⚡', '🌀', '💫', '🌈', '👾'];
const MODES = [['normal', 'Обычный'], ['minimal', 'Минимализм'], ['large', 'Крупный'], ['stream', 'Стрим']];
function loadUi() {
  const def = { deck4: false, scene: 'felt', chips: 'classic', anim: false, mode: 'normal', winFx: 'gold', cardFont: 'classic', deal: 'pretty', oneHand: false, vibro: true };
  try { return { ...def, ...JSON.parse(localStorage.getItem('ui') || '{}') }; } catch { return def; }
}
function setUi(patch) {
  const ui = { ...loadUi(), ...patch };
  try { localStorage.setItem('ui', JSON.stringify(ui)); } catch {}
  applyUi();
  render();
}
function applyUi() {
  const ui = loadUi();
  const d = document.documentElement.dataset;
  d.scene = ui.scene;
  d.chips = ui.chips;
  d.mode = ui.mode;
  d.back = S.look?.back || 'classic';
  document.documentElement.classList.toggle('deck4', !!ui.deck4);
  document.documentElement.classList.toggle('anim', !!ui.anim);
  d.cardfont = ui.cardFont;
  // стиль и кастом: «auto» — без атрибута
  for (const k of ['felt', 'rim', 'face', 'dbtn', 'font', 'slots', 'pill', 'bg', 'timer', 'hand', 'emo']) { if (ui[k] && ui[k] !== 'auto') d[k] = ui[k]; else delete d[k]; }
  document.documentElement.classList.toggle('onehand', !!ui.oneHand);
  document.documentElement.classList.toggle('lefty', !!ui.lefty);
  document.documentElement.classList.toggle('bigbtns', !!ui.bigBtns);
  document.documentElement.classList.toggle('eco', !!ui.eco);
  d.deal = ui.deal;
  // своё фото на фоне стола (хранится только на этом устройстве)
  let bg = null;
  try { bg = localStorage.getItem('tableBg'); } catch {}
  document.documentElement.style.setProperty('--tbg', bg ? `url("${bg}")` : 'none');
}

// фото для фона стола: уменьшаем до 900px и сохраняем на устройстве
function pickTableBg() {
  const inp = h('input', { type: 'file', accept: 'image/*' });
  inp.onchange = () => {
    const f = inp.files?.[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 900 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      try { localStorage.setItem('tableBg', cv.toDataURL('image/jpeg', 0.8)); setUi({ scene: 'photo' }); toast('Фон стола обновлён'); } catch { toast('Фото слишком большое'); }
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  };
  inp.click();
}

// эффект победы — на выбор в настройках
function winEffect() {
  const fx = loadUi().winFx;
  if (fx === 'none' || document.hidden) return;
  if (fx === 'gold') return goldFlash();
  const box = h('div', { class: `win-fx win-${fx}`, 'aria-hidden': 'true' });
  if (fx === 'rain') for (let i = 0; i < 24; i++) box.append(h('span', { style: `left:${Math.random() * 100}%;animation-delay:${Math.random() * 0.6}s` }, '🪙'));
  if (fx === 'crown') box.append(h('span', {}, '👑'));
  if (fx === 'lightning') box.append(h('span', {}, '⚡'));
  document.body.append(box);
  setTimeout(() => box.remove(), 1600);
}

function goldFlash() {
  if (document.hidden) return;
  const el = h('div', { class: 'gold-flash', 'aria-hidden': 'true' });
  document.body.append(el);
  el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' }).onfinish = () => el.remove();
}

function lookCard() {
  const L = S.look;
  if (!L) return null;
  const ui = loadUi();
  const pick = (list, cur, onPick) => h('div', { class: 'choices wrap' }, list.map(([id, name]) => h('button', { class: cur === id ? 'on' : '', onclick: () => onPick(id) }, name)));
  return h('div', { class: 'col', style: 'gap:10px' },
    h('button', { class: 'item', onclick: () => go('style') }, h('div', { class: 'col' }, h('div', { class: 'b', style: 'font-size:14px' }, '🎨 Стиль и кастом'), h('div', { class: 'small muted' }, 'Ник, табличка, сукно, бортик, карты, фон, таймер, шрифт и ещё — 350 вариантов')), icon('chev')),
    // титул под ником — из открытых достижений
    h('div', { class: 'label' }, 'Титул'),
    (L.titles || []).length ? h('div', { class: 'choices wrap' },
      h('button', { class: !L.title ? 'on' : '', onclick: () => run({ t: 'equip', kind: 'title', id: null }) }, 'Без титула'),
      L.titles.map((t) => h('button', { class: L.title === t ? 'on' : '', onclick: () => run({ t: 'equip', kind: 'title', id: t }) }, t)))
      : h('div', { class: 'small muted' }, 'Титулы открываются с достижениями'),
    h('div', { class: 'label' }, 'Аватар'),
    h('div', { class: 'ava-grid' },
      h('button', { class: `ava-pick ${!L.avatar ? 'on' : ''}`, onclick: () => run({ t: 'equip', kind: 'avatar', id: null }) }, initial(S.me.name)),
      L.hasPhoto && h('button', { class: `ava-pick ${L.avatar === 'photo' ? 'on' : ''}`, onclick: () => run({ t: 'equip', kind: 'avatar', id: 'photo' }) }, 'Фото'),
      L.avatars.map((a) => h('button', { class: `ava-pick ${L.avatar === a ? 'on' : ''}`, onclick: () => run({ t: 'equip', kind: 'avatar', id: a }) }, a))),
    h('div', { class: 'label' }, 'Рамка аватара'),
    h('div', { class: 'item-grid' }, L.frames.map((f) => h('button', {
      class: `item-pick ${L.frame === f.id ? 'on' : ''} ${f.owned ? '' : 'locked'}`, onclick: () => (f.owned ? run({ t: 'equip', kind: 'frame', id: f.id }) : toast(`Закрыто: ${f.how}`)),
    }, h('div', { class: `ava frame-${f.id}` }, '🙂'), h('div', { class: 'small' }, f.name), !f.owned && h('div', { class: 'small muted', style: 'font-size:10px' }, `🔒 ${f.how}`)))),
    h('div', { class: 'label' }, 'Рубашка карт'),
    h('div', { class: 'item-grid' }, L.backs.map((b) => h('button', {
      class: `item-pick ${L.back === b.id ? 'on' : ''} ${b.owned ? '' : 'locked'}`, onclick: () => (b.owned ? run({ t: 'equip', kind: 'back', id: b.id }) : toast(`Закрыто: ${b.how}`)),
    }, h('div', { class: `pcard back sm preview back-${b.id}` }), h('div', { class: 'small' }, b.name), !b.owned && h('div', { class: 'small muted', style: 'font-size:10px' }, `🔒 ${b.how}`)))),
    h('div', { class: 'label' }, 'Баннер профиля'),
    h('div', { class: 'choices wrap' }, (L.banners || []).map((b) => h('button', { class: `banner-pick banner-${b} ${L.banner === b ? 'on' : ''}`, onclick: () => run({ t: 'equip', kind: 'banner', id: b }) }, BANNER_NAMES[b] || b))),
    h('div', { class: 'label' }, 'Сцена стола'),
    pick(SCENES, ui.scene, (id) => (id === 'photo' ? pickTableBg() : setUi({ scene: id }))),
    h('div', { class: 'label' }, 'Эффект победы'),
    pick(WIN_FX, ui.winFx, (id) => { setUi({ winFx: id }); winEffect(); }),
    h('div', { class: 'label' }, 'Шрифт карт'),
    pick(CARD_FONTS, ui.cardFont, (id) => setUi({ cardFont: id })),
    h('div', { class: 'label' }, 'Раздача карт'),
    pick(DEAL_ANIM, ui.deal, (id) => setUi({ deal: id })),
    h('div', { class: 'label' }, 'Фишки'),
    chipPicker(ui.chips),
    h('div', { class: 'label' }, 'Режим экрана'),
    pick(MODES, ui.mode, (id) => setUi({ mode: id })),
    h('label', { class: 'toggle-row' }, h('input', { type: 'checkbox', checked: ui.deck4, onchange: (e) => setUi({ deck4: e.target.checked }) }), h('span', {}, 'Колода в 4 цвета'), h('span', { class: 'small muted' }, '♦ синие, ♣ зелёные')),
    h('label', { class: 'toggle-row' }, h('input', { type: 'checkbox', checked: ui.anim, onchange: (e) => setUi({ anim: e.target.checked }) }), h('span', {}, 'Живой фон'), h('span', { class: 'small muted' }, 'лёгкие огоньки')));
}

// ---------- Эмодзи за столом ----------

const EMOTES = ['👍', '😂', '🔥', '😎', '😱', '🤡', '💀', '🙏', '😡', '🍀', '👑', '🤔'];
function emoteTray() {
  // VIP-эмодзи: с ранга «Золото» или 10 уровня пропуска
  const list = S.me?.vip ? [...EMOTES, ...(S.look?.vipEmotes || [])] : EMOTES;
  return h('div', { class: 'emote-tray' }, list.map((e) => h('button', {
    class: 'emote-pick', 'aria-label': `Эмодзи ${e}`, onclick: () => { send({ t: 'emote', e }); S.emoteOpen = false; render(); },
  }, e)));
}

function leaveTableScreen(tournamentId) {
  S.table = null;
  S.turn = null;
  openTour(tournamentId);
}

// ---------- Навигация ----------

const BACK = { stats: 'profile', style: 'profile', school: 'lobby', chart: 'school', quiz: 'school', exam: 'school', history: 'friends', replay: 'history', botlab: 'lobby', training: 'lobby', tutorial: 'lobby', admin: 'profile', friends: 'lobby', progress: 'lobby', solo: 'tours', mixed: 'lobby', bots: 'lobby', tours: 'lobby', tour: 'tours', create: 'tours', wallet: 'lobby', profile: 'lobby', table: 'lobby' };

function go(screen) {
  if (screen !== 'table' && S.screen === 'table' && S.table) S.tableHidden = true;
  if (screen === 'table') S.tableHidden = false;
  S.screen = screen;
  if (screen === 'profile') { S.top = null; send({ t: 'top', kind: S.topKind || 'rating' }); }
  if (screen === 'progress') send({ t: 'progress' });
  if (screen === 'bots') send({ t: 'botsInfo' });
  if (screen === 'friends') { send({ t: 'friends' }); send({ t: 'club' }); }
  if (screen === 'admin') { send({ t: 'admin', a: 'stats' }); send({ t: 'admin', a: 'promos' }); }
  if (screen !== 'table') S.card = null;
  window.scrollTo(0, 0);
  render();
}

// ---------- Обучение для тех, кто не умеет играть ----------

function tutorialAsked() {
  try { return localStorage.getItem('tutorialAsked') === '1'; } catch { return true; }
}
function markTutorialAsked() {
  try { localStorage.setItem('tutorialAsked', '1'); } catch {}
  S.askTutorial = false;
}
function openTutorial(page = 0) {
  markTutorialAsked();
  S.tutPage = page;
  S.tutBack = S.screen === 'tutorial' ? 'lobby' : S.screen;
  go('tutorial');
}

// карты для примеров: «A♠ K♥»
const tcards = (str) => h('div', { class: 'tut-cards' }, str.split(' ').map((x) => {
  const r = x.slice(0, -1), s = x.slice(-1);
  return pcard(RANKS.indexOf(r === '10' ? 'T' : r) * 4 + SUITS.indexOf(s), 'sm');
}));
const P_ = (...t) => h('p', { class: 'tut-p' }, ...t);
const B_ = (t) => h('b', {}, t);
const LI = (...t) => h('li', {}, ...t);
const UL = (...items) => h('ul', { class: 'tut-list' }, ...items);
const EX = (title, cards, note) => h('div', { class: 'tut-ex' }, h('div', { class: 'b', style: 'font-size:14px' }, title), cards && tcards(cards), note && h('div', { class: 'small soft' }, note));

const TUTORIAL = [
  {
    title: 'Что такое покер',
    body: () => [
      P_('Покер (Техасский холдем) — карточная игра, в которой игроки делают ставки фишками. Побеждает тот, у кого ', B_('самая сильная комбинация из пяти карт'), ', или тот, кто заставил всех остальных сдаться.'),
      P_('Каждая игра состоит из ', B_('раздач'), '. В одной раздаче все игроки ставят фишки в общий ', B_('банк'), '. Кто выиграл раздачу — забирает весь банк себе.'),
      P_('Цель игры — выиграть как можно больше фишек у соперников. Фишки в этом приложении — игровые: их нельзя вывести или обменять на деньги.'),
      P_('Выиграть раздачу можно двумя способами:'),
      UL(LI(B_('Показать лучшую комбинацию'), ' в конце раздачи (это называется ', B_('вскрытие'), ').'),
        LI(B_('Сделать так, чтобы все остальные сбросили карты'), ' — тогда банк твой, даже если карты были слабые. Это и есть блеф.')),
    ],
  },
  {
    title: 'Карты и колода',
    body: () => [
      P_('Колода — 52 карты: 4 масти по 13 карт.'),
      P_(B_('Масти: '), '♠ пики, ♥ червы, ♦ бубны, ♣ трефы. Масти равны — ни одна не старше другой.'),
      P_(B_('Старшинство карт'), ' (от младшей к старшей): 2, 3, 4, 5, 6, 7, 8, 9, 10, В (валет, J), Д (дама, Q), К (король, K), Т (туз, A).'),
      tcards('2♣ 5♦ 9♥ J♠ Q♥ K♣ A♠'),
      P_('Туз — самая старшая карта. Но в одном случае он может быть и самой младшей: в стрите A-2-3-4-5 («колесо»).'),
    ],
  },
  {
    title: 'Как проходит раздача',
    body: () => [
      P_('1. Каждому игроку раздают ', B_('2 карты в закрытую'), ' — их видишь только ты. Это твоя «рука».'),
      P_('2. Потом на стол по очереди выкладывают ', B_('5 общих карт'), ' — ими могут пользоваться все игроки:'),
      UL(LI(B_('Флоп'), ' — сразу 3 карты.'), LI(B_('Тёрн'), ' — 4-я карта.'), LI(B_('Ривер'), ' — 5-я карта.')),
      P_('3. Перед флопом, после флопа, после тёрна и после ривера идёт ', B_('круг торговли'), ' — каждый по очереди решает, ставить ли фишки. Всего 4 круга.'),
      P_('4. Если после ривера в игре осталось двое и больше — ', B_('вскрытие'), ': игроки показывают карты, и лучшая комбинация забирает банк.'),
      h('div', { class: 'b', style: 'font-size:15px' }, 'Пример'),
      h('div', { class: 'small muted' }, 'Твои карты:'), tcards('A♥ K♥'),
      h('div', { class: 'small muted' }, 'Стол (флоп, тёрн, ривер):'), tcards('Q♥ J♥ 10♥ 4♣ 7♦'),
      P_('Ты берёшь 5 лучших карт из своих 2 и 5 общих: A♥ K♥ Q♥ J♥ 10♥ — это ', B_('флеш-рояль'), ', самая сильная комбинация в покере.'),
    ],
  },
  {
    title: 'Блайнды и баттон',
    body: () => [
      P_('Чтобы в банке всегда было за что бороться, двое игроков перед раздачей ставят обязательные ставки — ', B_('блайнды'), ':'),
      UL(LI(B_('Малый блайнд (МБ)'), ' — половина обязательной ставки.'), LI(B_('Большой блайнд (ББ)'), ' — полная обязательная ставка.')),
      P_('Пример: стол 5/10 — малый блайнд 5 фишек, большой 10.'),
      P_(B_('Баттон (кнопка «D»)'), ' — значок дилера. Малый блайнд сидит слева от баттона, большой — следующим. После каждой раздачи баттон переходит к следующему игроку по кругу, поэтому блайнды платят все по очереди.'),
      P_('Перед флопом первым ходит игрок слева от большого блайнда. После флопа — первый живой игрок слева от баттона. Сидеть на баттоне выгодно: ты ходишь последним и видишь, что сделали другие.'),
    ],
  },
  {
    title: 'Что можно делать в свой ход',
    body: () => [
      UL(
        LI(B_('Фолд'), ' — сбросить карты и выйти из раздачи. Фишки, которые ты уже поставил, остаются в банке.'),
        LI(B_('Чек'), ' — пропустить ход, ничего не ставя. Можно, только если в этом круге ещё никто не поставил.'),
        LI(B_('Бет'), ' — сделать первую ставку в круге.'),
        LI(B_('Колл'), ' — уравнять чужую ставку (поставить столько же).'),
        LI(B_('Рейз'), ' — повысить: поставить больше, чем соперник. Тогда остальным нужно уравнять уже твою ставку.'),
        LI(B_('Олл-ин'), ' — поставить все свои фишки. Если у тебя меньше фишек, чем ставка соперника, ты всё равно можешь играть олл-ином — на ту часть банка, которую уравнял.'),
      ),
      P_('Круг торговли заканчивается, когда все оставшиеся игроки поставили одинаково (или все сделали чек).'),
      P_('В приложении на ход даётся ', B_('20 секунд'), '. Не успел — автоматически будет чек (если можно) или фолд. Кнопка «+15 с» добавляет время 3 раза за стол.'),
    ],
  },
  {
    title: 'Комбинации: от слабой к сильной',
    body: () => [
      P_('Всегда считаются ', B_('ровно 5 карт'), '. Чем выше в списке — тем слабее.'),
      EX('1. Старшая карта', 'A♠ J♦ 8♣ 6♥ 3♠', 'Ничего не собрано — решает самая старшая карта.'),
      EX('2. Пара', 'K♥ K♣ 9♠ 6♦ 2♣', 'Две карты одного достоинства.'),
      EX('3. Две пары', 'J♠ J♦ 5♥ 5♣ A♦', 'Две разные пары.'),
      EX('4. Сет (тройка)', '7♠ 7♥ 7♦ K♣ 2♠', 'Три карты одного достоинства.'),
      EX('5. Стрит', '9♣ 8♦ 7♠ 6♥ 5♣', 'Пять карт подряд, масти любые.'),
      EX('6. Флеш', 'A♥ J♥ 9♥ 6♥ 3♥', 'Пять карт одной масти, не подряд.'),
      EX('7. Фулл-хаус', 'Q♠ Q♥ Q♦ 4♣ 4♠', 'Тройка + пара.'),
      EX('8. Каре', '9♠ 9♥ 9♦ 9♣ K♠', 'Четыре карты одного достоинства.'),
      EX('9. Стрит-флеш', '8♣ 7♣ 6♣ 5♣ 4♣', 'Пять карт подряд одной масти.'),
      EX('10. Флеш-рояль', 'A♦ K♦ Q♦ J♦ 10♦', 'Стрит-флеш от десятки до туза — самая сильная рука.'),
      P_('В игре в любой момент можно нажать «?» вверху стола — откроется этот же список.'),
    ],
  },
  {
    title: 'Как сравнивают руки',
    body: () => [
      P_('Сначала сравнивают ', B_('вид комбинации'), ': любой флеш сильнее любого стрита, любая пара слабее двух пар и т. д.'),
      P_('Если комбинации одинаковые — сравнивают их ', B_('старшинство'), ': пара тузов сильнее пары королей; стрит до валета сильнее стрита до девятки.'),
      P_('Если и это равно — смотрят на ', B_('кикер'), ' (старшую карту, которая не входит в комбинацию):'),
      h('div', { class: 'small muted' }, 'У тебя пара тузов с королём:'), tcards('A♠ A♥ K♣ 9♦ 4♠'),
      h('div', { class: 'small muted' }, 'У соперника пара тузов с дамой:'), tcards('A♦ A♣ Q♠ 9♦ 4♠'),
      P_('Пара одинаковая, но твой кикер (король) старше — выигрываешь ты.'),
      P_('Если все 5 карт по силе совпадают — банк ', B_('делится поровну'), '. Масть при сравнении не важна никогда.'),
      P_('Важно: твоя рука — это 5 лучших карт из семи (2 твои + 5 на столе). Иногда лучшая комбинация целиком лежит на столе — тогда у всех она одинаковая.'),
    ],
  },
  {
    title: 'Банк, олл-ин и побочный банк',
    body: () => [
      P_('Все ставки в раздаче складываются в банк. Победитель забирает его целиком.'),
      P_('Если кто-то пошёл ', B_('олл-ин'), ' на меньшую сумму, чем ставят другие, он может выиграть из банка не больше, чем поставил сам — с каждого соперника.'),
      P_('Лишние фишки остальных игроков идут в ', B_('побочный банк'), ', который разыгрывают только те, кто в него ставил.'),
      P_('Пример: у тебя 100 фишек, у двух соперников по 500. Ты идёшь олл-ин на 100, они ставят по 300. Основной банк — 300 (по 100 от каждого), его можешь выиграть ты. Побочный — 400, его делят только двое соперников.'),
      P_('Приложение всё считает само — тебе не нужно ничего делить вручную.'),
    ],
  },
  {
    title: 'Советы новичку',
    body: () => [
      UL(
        LI(B_('Играй не все руки. '), 'Новички проигрывают чаще всего, потому что заходят в раздачу с любыми картами. Хорошие стартовые руки: пары (особенно от 8-8 и выше), туз с картой от 10 и выше (A-K, A-Q, A-J, A-10), две старшие карты (K-Q, K-J, Q-J).'),
        LI(B_('Слабое — сбрасывай. '), 'Руки вроде 7-2, 9-3, 10-4 разных мастей почти всегда лучше сбросить сразу.'),
        LI(B_('Позиция важна. '), 'Чем позже ты ходишь (ближе к баттону), тем больше рук можно играть: ты уже видишь, что сделали другие.'),
        LI(B_('Сильная рука — ставь. '), 'Если собрал хорошую комбинацию, делай бет или рейз, чтобы банк вырос.'),
        LI(B_('Не блефуй слишком часто. '), 'Блеф работает, когда он редкий и выглядит правдоподобно.'),
        LI(B_('Считай шансы. '), 'Если для колла нужно поставить мало, а банк большой — иногда стоит доиграть даже недособранную руку (например, ждать пятую карту к флешу).'),
        LI(B_('Не играй на последние фишки. '), 'Садись за стол с суммой, которую не жалко проиграть.'),
      ),
      P_('Лучший способ научиться — играть против ботов на лёгком уровне сложности и включить «Тренера» в настройках: после раздачи он подскажет, где ты ошибся.'),
    ],
  },
  {
    title: 'Как играть в этом приложении',
    body: () => [
      UL(
        LI(B_('Против ботов'), ' — лобби → «Против ботов». Выбери соперника, сложность и бай-ин (сколько фишек берёшь за стол). Встать можно в любой момент — стек вернётся на баланс.'),
        LI(B_('Турниры'), ' — все платят взнос, получают одинаковые фишки, блайнды растут. Кто вылетел — выбывает, призы получают лучшие места. Есть сольный турнир с ботами — стартует сразу.'),
        LI(B_('С друзьями'), ' — создай стол и отправь ссылку.'),
        LI(B_('Твой ход'), ' — внизу появятся кнопки: Фолд, Чек/Колл, Бет/Рейз. Ползунок и кнопки «½ банка», «Банк», «Олл-ин» помогают выбрать размер ставки.'),
        LI(B_('Твоя комбинация'), ' показывается рядом с твоими картами.'),
        LI(B_('Подсказка'), ' (лампочка вверху стола, в твой ход) подскажет лучший ход. Платная — за подсказки или звёзды.'),
        LI(B_('Фишки'), ' — игровые. Пополнить можно звёздами в «Кошельке», вывести нельзя.'),
      ),
      P_('Это обучение и тренировку всегда можно открыть снова: лобби → «Как играть» или «Тренировка».'),
    ],
  },
  {
    title: 'Словарик',
    body: () => [
      UL(
        LI(B_('Банк'), ' — все фишки, поставленные в раздаче.'),
        LI(B_('Бай-ин'), ' — сколько фишек ты берёшь за стол или платишь за турнир.'),
        LI(B_('Блайнды'), ' — обязательные ставки перед раздачей (малый и большой).'),
        LI(B_('ББ'), ' — большой блайнд; «30 ББ» значит «30 больших блайндов».'),
        LI(B_('Баттон (D)'), ' — место дилера, ходит последним после флопа.'),
        LI(B_('Флоп, тёрн, ривер'), ' — 3, 4 и 5-я общие карты.'),
        LI(B_('Префлоп'), ' — торговля до выхода флопа.'),
        LI(B_('Вскрытие'), ' — когда игроки показывают карты в конце.'),
        LI(B_('Кикер'), ' — старшая карта вне комбинации, решает при равных комбинациях.'),
        LI(B_('Олл-ин'), ' — поставить все фишки.'),
        LI(B_('Блеф'), ' — ставить со слабой рукой, чтобы соперник сбросил.'),
        LI(B_('Ауты'), ' — карты, которые улучшат твою руку.'),
        LI(B_('Стек'), ' — сколько фишек у игрока за столом.'),
      ),
      P_('Всё! Дальше — тренировка: 14 раздач-уроков против бота-учителя. Он ходит, ты отвечаешь, а после каждого хода объясняется, правильно ли ты сыграл. Фишки там учебные.'),
    ],
  },
];

function tutorialScreen() {
  const i = Math.max(0, Math.min(TUTORIAL.length - 1, S.tutPage || 0));
  const page = TUTORIAL[i];
  const last = i === TUTORIAL.length - 1;
  const goPage = (n) => { S.tutPage = n; render(); window.scrollTo(0, 0); };
  return h('div', { class: 'screen tut' },
    header('Как играть'),
    h('div', { class: 'small muted' }, `Шаг ${i + 1} из ${TUTORIAL.length}`),
    h('h2', { class: 'tut-title' }, page.title),
    page.body(),
    // тренировка доступна с любой страницы обучения
    h('button', { class: 'item', onclick: () => openTraining(0) },
      h('div', { class: 'col' }, h('div', { class: 'b', style: 'font-size:14px' }, 'Попробовать на практике'), h('div', { class: 'small muted' }, 'Раздачи против бота-учителя, фишки учебные')),
      icon('chev')),
    // оглавление
    h('details', { class: 'tut-toc' },
      h('summary', {}, 'Все разделы'),
      TUTORIAL.map((p, n) => h('button', { class: `tut-toc-item ${n === i ? 'on' : ''}`, onclick: () => goPage(n) }, `${n + 1}. ${p.title}`))),
    h('div', { class: 'tut-nav' },
      h('button', { class: 'btn-ghost', disabled: i === 0, onclick: () => goPage(i - 1) }, 'Назад'),
      last ? h('button', { class: 'btn', onclick: () => openTraining(0) }, 'К тренировке')
        : h('button', { class: 'btn', onclick: () => goPage(i + 1) }, 'Далее')));
}

// ---------- Тренировка: раздачи против бота-учителя по сценарию ----------
// Всё на клиенте, фишки учебные — баланс и Эло не меняются.
// Шаг: info — текст и «Дальше»; ask — выбор хода (right — правильный, why — почему другие хуже).
// set — что меняется на столе; состояние = все set от начала урока до текущего шага.

const LESSONS = [
  {
    title: 'Сильная рука — ставь',
    steps: [
      { t: 'info', set: { hole: 'A♠ A♥', botCards: 'K♣ Q♣', board: '', me: 995, bot: 990, pot: 15, botShow: false, mySay: 'МБ 5', botSay: 'ББ 10' },
        text: 'Тебе раздали A♠ A♥ — пару тузов. Это самая сильная стартовая рука в покере.\n\nТы на малом блайнде (поставил 5), бот — на большом (поставил 10). В банке 15. До флопа первым ходишь ты.' },
      { t: 'ask', text: 'Чтобы играть дальше, нужно доплатить 5 (до 10). Что сделаешь?',
        opts: [['fold', 'Фолд'], ['call', 'Колл 5'], ['raise', 'Рейз до 30']], right: 'raise',
        why: { fold: 'Тузы — лучшая рука. Сбросить их — значит отдать банк просто так.', call: 'Колл — не ошибка, но с сильной рукой лучше повысить: так в банке будет больше фишек, которые ты выиграешь.' } },
      { t: 'info', set: { me: 970, bot: 970, pot: 60, mySay: 'Рейз 30', botSay: 'Колл' },
        text: '✓ Правильно: с сильной рукой повышай.\n\nБот уравнял (колл) — доплатил 20. В банке 60. Сейчас откроется флоп.' },
      { t: 'info', set: { board: 'A♦ 7♣ 2♥', mySay: '', botSay: '' },
        text: 'Флоп: A♦ 7♣ 2♥. Вместе с твоими тузами это три туза — сет. Очень сильная комбинация.\n\nВ игре один на один после флопа первым ходит большой блайнд — то есть бот.' },
      { t: 'info', set: { botSay: 'Чек' }, text: 'Бот сделал чек — пропустил ход, ничего не поставив.' },
      { t: 'ask', text: 'Твой ход. В банке 60.', opts: [['check', 'Чек'], ['bet', 'Бет 40']], right: 'bet',
        why: { check: 'Чек можно, но когда рука сильная — лучше ставить. Иначе бот бесплатно увидит следующую карту, а банк не вырастет.' } },
      { t: 'info', set: { me: 930, bot: 930, pot: 140, mySay: 'Бет 40', botSay: 'Колл' }, text: '✓ Верно. Бот уравнял 40. В банке 140.' },
      { t: 'info', set: { board: 'A♦ 7♣ 2♥ 9♠', mySay: '', botSay: 'Чек' }, text: 'Тёрн — 9♠. У тебя по-прежнему сет тузов. Бот снова сделал чек.' },
      { t: 'ask', text: 'Твой ход. В банке 140.', opts: [['check', 'Чек'], ['bet', 'Бет 100']], right: 'bet',
        why: { check: 'Рука всё ещё очень сильная — продолжай ставить, чтобы банк рос.' } },
      { t: 'info', set: { me: 830, bot: 830, pot: 340, mySay: 'Бет 100', botSay: 'Колл' }, text: '✓ Бот снова уравнял. В банке 340.' },
      { t: 'info', set: { board: 'A♦ 7♣ 2♥ 9♠ 4♦', mySay: '', botSay: 'Чек' }, text: 'Ривер — 4♦. Это последняя карта. Бот — чек.' },
      { t: 'ask', text: 'Последний круг торговли. Сколько поставишь?', opts: [['check', 'Чек'], ['bet', 'Бет 200'], ['allin', 'Олл-ин 830']], right: 'bet',
        why: { check: 'У тебя почти наверняка лучшая рука — нужно ставить, а не отдавать карты бесплатно.', allin: 'Слишком много: с более слабой рукой бот такую ставку не уравняет и сбросит — и ты выиграешь меньше. Ставь столько, сколько он может заплатить.' } },
      { t: 'info', set: { me: 630, bot: 630, pot: 740, mySay: 'Бет 200', botSay: 'Колл' }, text: '✓ Бот уравнял. В банке 740. Теперь вскрытие — игроки показывают карты.' },
      { t: 'info', set: { botShow: true, mySay: '', botSay: '' },
        text: 'У бота K♣ Q♣. Его лучшие 5 карт: A K Q 9 7 — это просто старшая карта (туз он берёт со стола).\n\nУ тебя сет тузов. Сет сильнее старшей карты — банк 740 твой!' },
      { t: 'done', set: { me: 1370, pot: 0 }, text: 'Урок пройден.\n\nГлавное: с сильной рукой ставь и повышай, чтобы банк рос. Но не ставь так много, что сопернику проще сбросить.' },
    ],
  },
  {
    title: 'Когда сбрасывать',
    steps: [
      { t: 'info', set: { hole: '7♣ 2♦', botCards: 'J♠ J♦', board: '', me: 990, bot: 995, pot: 15, botShow: false, mySay: 'ББ 10', botSay: 'МБ 5' },
        text: 'У тебя 7♣ 2♦ — маленькие карты, разные масти, далеко друг от друга. Это самая слабая стартовая рука.\n\nТы на большом блайнде, бот — на малом. До флопа первым ходит бот.' },
      { t: 'info', set: { bot: 970, pot: 40, botSay: 'Рейз 30' }, text: 'Бот повысил до 30.' },
      { t: 'ask', text: 'Чтобы играть дальше, нужно доплатить 20. Что сделаешь?', opts: [['fold', 'Фолд'], ['call', 'Колл 20'], ['raise', 'Рейз до 90']], right: 'fold',
        why: { call: 'С 7-2 почти любая рука соперника сильнее. Платить 20, чтобы, скорее всего, проиграть, — плохая идея.', raise: 'Повышать с худшей рукой — это блеф, и против рейза он редко срабатывает. Новичку лучше сбросить.' } },
      { t: 'info', set: { botShow: true, mySay: 'Фолд', botSay: '' },
        text: '✓ Правильно. Ты потерял только 10 фишек большого блайнда, банк забрал бот.\n\nА было у него J♠ J♦ — пара валетов. Ты почти наверняка проиграл бы.' },
      { t: 'info', set: { hole: 'J♥ 10♥', botCards: 'K♦ 9♣', board: '', me: 990, bot: 995, pot: 15, botShow: false, mySay: 'ББ 10', botSay: 'МБ 5' },
        text: 'Следующая раздача. У тебя J♥ 10♥ — неплохая рука: две карты подряд одной масти. Ты снова на большом блайнде.' },
      { t: 'info', set: { bot: 990, pot: 20, botSay: 'Колл' }, text: 'Бот уравнял до 10 (колл).' },
      { t: 'ask', text: 'Ставки равны — флоп можно посмотреть бесплатно.', opts: [['check', 'Чек'], ['raise', 'Рейз до 40']], right: 'check',
        why: { raise: 'Так тоже можно, но в этом уроке посмотрим флоп бесплатно — нажми «Чек».' } },
      { t: 'info', set: { board: 'K♠ 4♣ 2♦', mySay: '', botSay: '' },
        text: '✓ Флоп: K♠ 4♣ 2♦. Он тебе не помог: у тебя нет даже пары, только старшая карта — валет.\n\nПосле флопа первым ходишь ты (ты на большом блайнде).' },
      { t: 'ask', text: 'Твой ход. В банке 20.', opts: [['check', 'Чек'], ['bet', 'Бет 15']], right: 'check',
        why: { bet: 'Ставить без руки — это блеф. Иногда он работает, но сейчас лучше пропустить ход бесплатно.' } },
      { t: 'info', set: { mySay: 'Чек', bot: 950, pot: 60, botSay: 'Бет 40' }, text: '✓ Ты сделал чек. Бот поставил 40 — в два раза больше банка. Похоже, у него король.' },
      { t: 'ask', text: 'Чтобы играть дальше, нужно доплатить 40. Что сделаешь?', opts: [['fold', 'Фолд'], ['call', 'Колл 40'], ['raise', 'Рейз до 120']], right: 'fold',
        why: { call: 'У тебя ничего нет. Платить 40 в надежде на чудо — так и теряют фишки.', raise: 'Блеф против сильной ставки — большой риск. Здесь лучше сбросить.' } },
      { t: 'info', set: { botShow: true, mySay: 'Фолд', botSay: '' }, text: '✓ Правильно. У бота K♦ 9♣ — пара королей. Ты потерял всего 10 фишек.' },
      { t: 'done', text: 'Урок пройден.\n\nГлавное: слабые руки сбрасывай сразу. А если стол тебе не помог и соперник ставит много — не бойся нажать «Фолд». Сбросить — не значит проиграть.' },
    ],
  },
  {
    title: 'Дро: ждём нужную карту',
    steps: [
      { t: 'info', set: { hole: 'A♥ 5♥', botCards: 'K♣ J♦', board: '', me: 995, bot: 990, pot: 15, botShow: false, mySay: 'МБ 5', botSay: 'ББ 10' },
        text: 'У тебя A♥ 5♥ — туз и две карты одной масти. Нормальная рука. Ты на малом блайнде.' },
      { t: 'ask', text: 'Доплати 5, чтобы посмотреть флоп?', opts: [['fold', 'Фолд'], ['call', 'Колл 5'], ['raise', 'Рейз до 30']], right: 'call',
        why: { fold: 'Туз с картой той же масти — нормальная рука, сбрасывать за 5 фишек незачем.', raise: 'Можно и так, но в этом уроке сыграем колл.' } },
      { t: 'info', set: { me: 990, pot: 20, mySay: 'Колл', botSay: 'Чек' }, text: '✓ Ты уравнял, бот сделал чек. В банке 20. Открывается флоп.' },
      { t: 'info', set: { board: 'K♥ 8♥ 3♣', mySay: '', botSay: '' },
        text: 'Флоп: K♥ 8♥ 3♣. У тебя уже 4 червы: A♥ 5♥ K♥ 8♥. До флеша не хватает одной.\n\nТакая рука называется «дро» — ей нужна ещё одна карта. Червей в колоде осталось 9 — это твои «ауты».' },
      { t: 'info', set: { bot: 980, pot: 30, botSay: 'Бет 10' }, text: 'Бот поставил 10 — совсем немного.' },
      { t: 'ask', text: 'Нужно доплатить 10, а в банке будет 40. Что сделаешь?', opts: [['fold', 'Фолд'], ['call', 'Колл 10'], ['raise', 'Рейз до 40']], right: 'call',
        why: { fold: 'Ставка маленькая, а банк большой: платишь 10, чтобы бороться за 40. С 9 аутами это выгодно.', raise: 'Флеша ещё нет. Рейз сделает игру дороже, а ты пока только ждёшь карту. Колл лучше.' } },
      { t: 'info', set: { me: 980, pot: 40, mySay: 'Колл', botSay: '' }, text: '✓ Верно: маленькая ставка + дро = колл.' },
      { t: 'info', set: { board: 'K♥ 8♥ 3♣ 2♠', mySay: '', botSay: 'Чек' }, text: 'Тёрн — 2♠. Не черва, флеша пока нет. Бот сделал чек.' },
      { t: 'ask', text: 'Твой ход. В банке 40.', opts: [['check', 'Чек'], ['bet', 'Бет 30']], right: 'check',
        why: { bet: 'У тебя пока ничего не собрано. Сделай чек — и бесплатно увидишь последнюю карту.' } },
      { t: 'info', set: { board: 'K♥ 8♥ 3♣ 2♠ Q♥', mySay: 'Чек', botSay: '' },
        text: '✓ Ривер — Q♥! Пятая черва. У тебя флеш: A♥ K♥ Q♥ 8♥ 5♥. Это очень сильная рука.' },
      { t: 'info', set: { bot: 950, pot: 70, mySay: '', botSay: 'Бет 30' }, text: 'Бот поставил 30.' },
      { t: 'ask', text: 'Флеш собран. Что сделаешь?', opts: [['fold', 'Фолд'], ['call', 'Колл 30'], ['raise', 'Рейз до 100']], right: 'raise',
        why: { fold: 'Сбрасывать флеш — ни в коем случае!', call: 'Колл неплох, но с такой сильной рукой лучше повысить — выиграешь больше.' } },
      { t: 'info', set: { me: 880, bot: 880, pot: 240, mySay: 'Рейз 100', botSay: 'Колл' }, text: '✓ Бот уравнял. В банке 240. Вскрытие!' },
      { t: 'info', set: { botShow: true, mySay: '', botSay: '' }, text: 'У бота K♣ J♦ — пара королей. Флеш сильнее пары. Банк 240 твой!' },
      { t: 'done', set: { me: 1120, pot: 0 }, text: 'Урок пройден.\n\nГлавное: если до сильной руки не хватает одной карты, а ставка маленькая — можно доплатить и посмотреть. Если ставка огромная — лучше сбросить.' },
    ],
  },
  {
    title: 'Олл-ин',
    steps: [
      { t: 'info', set: { hole: 'Q♦ Q♣', botCards: 'A♠ K♦', board: '', me: 990, bot: 995, pot: 15, botShow: false, mySay: 'ББ 10', botSay: 'МБ 5' },
        text: 'У тебя Q♦ Q♣ — пара дам. Одна из самых сильных стартовых рук. Ты на большом блайнде.' },
      { t: 'info', set: { bot: 0, pot: 1010, botSay: 'Олл-ин 1000' }, text: 'Бот пошёл олл-ин — поставил все свои 1000 фишек!' },
      { t: 'ask', text: 'Чтобы ответить, нужно доплатить 990 — почти все твои фишки. Что сделаешь?', opts: [['fold', 'Фолд'], ['call', 'Колл 990']], right: 'call',
        why: { fold: 'Пара дам — очень сильная рука. Против олл-ина её почти всегда уравнивают.' } },
      { t: 'info', set: { me: 0, pot: 2000, mySay: 'Колл', botShow: true },
        text: '✓ Ты уравнял. Когда все в олл-ине, карты открывают сразу и ставок больше нет — просто выкладывают оставшиеся общие карты.\n\nУ бота A♠ K♦ — пары нет, только туз. Сейчас впереди ты.' },
      { t: 'info', set: { board: '9♠ 6♦ 2♣', mySay: '', botSay: '' }, text: 'Флоп: 9♠ 6♦ 2♣. Боту не помог.' },
      { t: 'info', set: { board: '9♠ 6♦ 2♣ J♥ 4♠' }, text: 'Тёрн J♥ и ривер 4♠ — тоже мимо. У бота осталась старшая карта — туз.' },
      { t: 'info', set: { me: 2000, pot: 0 },
        text: 'Пара дам сильнее старшей карты. Ты удвоился — 2000 фишек!\n\nНо помни: если бы вышел туз или король, выиграл бы бот. Олл-ин — это всегда риск, даже с хорошей рукой.' },
      { t: 'done', text: 'Урок пройден.\n\nГлавное: олл-ин соперника уравнивай только с очень сильной рукой. Со средней — лучше сбросить.' },
    ],
  },
  {
    title: 'Позиция',
    steps: [
      { t: 'info', set: { hole: 'K♠ J♦', botCards: '9♣ 4♦', board: '', me: 995, bot: 990, pot: 15, botShow: false, mySay: 'МБ 5', botSay: 'ББ 10' },
        text: 'Чем позже ты ходишь, тем больше знаешь о соперниках. Это называется позиция.\n\nУ тебя K♠ J♦, ты на баттоне (в игре один на один баттон — это малый блайнд).' },
      { t: 'ask', text: 'Что сделаешь?', opts: [['fold', 'Фолд'], ['call', 'Колл 5'], ['raise', 'Рейз до 30']], right: 'raise',
        why: { fold: 'K-J на баттоне — сильная рука. Сбрасывать её с поздней позиции — ошибка.', call: 'Колл можно, но на баттоне выгоднее атаковать рейзом.' } },
      { t: 'info', set: { me: 970, bot: 970, pot: 60, mySay: 'Рейз 30', botSay: 'Колл' }, text: '✓ Бот уравнял. В банке 60.' },
      { t: 'info', set: { board: 'Q♥ 7♣ 2♠', mySay: '', botSay: 'Чек' }, text: 'Флоп Q♥ 7♣ 2♠ — у тебя ничего, кроме двух старших карт. Но бот ходит первым и сделал чек — это знак слабости.' },
      { t: 'ask', text: 'Ты ходишь последним. Что сделаешь?', opts: [['check', 'Чек'], ['bet', 'Бет 30']], right: 'bet',
        why: { check: 'Можно, но позиция — твоё преимущество: после чека соперника небольшая ставка часто забирает банк.' } },
      { t: 'info', set: { me: 940, pot: 90, mySay: 'Бет 30', botSay: 'Фолд', botShow: true }, text: '✓ Бот сбросил 9♣ 4♦. Банк твой — без вскрытия!' },
      { t: 'done', set: { me: 1030, pot: 0 }, text: 'Урок пройден.\n\nГлавное: на поздней позиции играй больше рук и пользуйся тем, что ходишь последним.' },
    ],
  },
  {
    title: 'Блеф',
    steps: [
      { t: 'info', set: { hole: '8♠ 7♠', botCards: 'A♦ 3♣', board: '', me: 970, bot: 970, pot: 60, botShow: false, mySay: '', botSay: '' }, text: 'Раздача уже идёт: до флопа вы оба поставили по 30. У тебя 8♠ 7♠.' },
      { t: 'info', set: { board: 'K♦ K♣ 4♥', botSay: 'Чек' }, text: 'Флоп K♦ K♣ 4♥. У тебя ничего. Бот сделал чек.' },
      { t: 'ask', text: 'Короли на столе пугают — у бота вряд ли король, он чекнул. Что сделаешь?', opts: [['check', 'Чек'], ['bet', 'Бет 25']], right: 'bet',
        why: { check: 'Можно, но это хорошее место для блефа: стол «страшный», а бот показал слабость.' } },
      { t: 'info', set: { me: 945, bot: 945, pot: 110, mySay: 'Бет 25', botSay: 'Колл' }, text: 'Бот уравнял. Значит, у него что-то есть.' },
      { t: 'info', set: { board: 'K♦ K♣ 4♥ 2♦', mySay: '', botSay: 'Чек' }, text: 'Тёрн 2♦ — ничего не изменил. Бот снова чек.' },
      { t: 'ask', text: 'Блефовать второй раз?', opts: [['check', 'Чек'], ['bet', 'Бет 80']], right: 'check',
        why: { bet: 'Бот уже уравнял одну ставку — сбрасывать он не хочет. Второй блеф в того, кто коллирует, — дорогая ошибка.' } },
      { t: 'info', set: { board: 'K♦ K♣ 4♥ 2♦ J♠', mySay: 'Чек', botSay: 'Чек' }, text: '✓ Ривер J♠. Оба чек — вскрытие.' },
      { t: 'info', set: { botShow: true, mySay: '', botSay: '' }, text: 'У бота A♦ 3♣ — старший туз. У тебя только восьмёрка, банк забирает бот.\n\nНо ты потерял немного: не стал вкладываться во второй блеф.' },
      { t: 'done', text: 'Урок пройден.\n\nГлавное: блефуй, когда стол страшный, а соперник показал слабость. Если он уравнял — второй раз не блефуй.' },
    ],
  },
  {
    title: 'Шансы банка',
    steps: [
      { t: 'info', set: { hole: 'J♣ 10♣', botCards: 'A♠ K♥', board: 'Q♦ 9♠ 3♥', me: 900, bot: 900, pot: 200, botShow: false, mySay: '', botSay: '' },
        text: 'У тебя J♣ 10♣, на столе Q♦ 9♠ 3♥. Любая восьмёрка или король дадут стрит — это 8 аутов.' },
      { t: 'info', set: { bot: 850, pot: 250, botSay: 'Бет 50' }, text: 'Бот поставил 50. В банке 250.' },
      { t: 'info', text: 'Считаем: доплатить 50, чтобы бороться за банк 300 (250 + твои 50). Цена — 50 из 300, примерно 17%.\n\nШанс собрать стрит за две карты с 8 аутами — около 32%. Это больше 17%.' },
      { t: 'ask', text: 'Выгодно ли доплачивать?', opts: [['fold', 'Фолд'], ['call', 'Колл 50']], right: 'call', why: { fold: 'Шанс (~32%) больше цены (~17%) — колл окупается.' } },
      { t: 'info', set: { me: 850, pot: 300, mySay: 'Колл', botSay: '' }, text: '✓ Правильно! Колл выгоден, когда шанс собрать руку больше доли, которую доплачиваешь.' },
      { t: 'info', set: { board: 'Q♦ 9♠ 3♥ 8♥', bot: 550, pot: 600, mySay: '', botSay: 'Бет 300' }, text: 'Тёрн 8♥ — стрит: Q-J-10-9-8! Бот ставит 300.' },
      { t: 'ask', text: 'У тебя стрит. Что сделаешь?', opts: [['fold', 'Фолд'], ['call', 'Колл 300'], ['raise', 'Олл-ин']], right: 'raise',
        why: { fold: 'Сбрасывать стрит — нельзя!', call: 'Колл не ошибка, но с готовым стритом давим сильнее.' } },
      { t: 'info', set: { me: 0, bot: 0, pot: 2000, mySay: 'Олл-ин', botSay: 'Колл', botShow: true, board: 'Q♦ 9♠ 3♥ 8♥ 2♣' }, text: 'Бот уравнял с A♠ K♥. Ривер 2♣. Стрит сильнее старшей карты — банк 2000 твой!' },
      { t: 'done', set: { me: 2000, pot: 0 }, text: 'Урок пройден.\n\nГлавное: сравнивай шанс собрать руку с ценой колла. Примерно: каждый аут ≈ 2% на одну карту и ≈ 4% на две.' },
    ],
  },
  {
    title: 'Кикер',
    steps: [
      { t: 'info', set: { hole: 'A♥ 4♣', botCards: 'A♠ Q♦', board: '', me: 990, bot: 995, pot: 15, botShow: false, mySay: 'ББ 10', botSay: 'МБ 5' }, text: 'У тебя A♥ 4♣. Туз — хорошо, но вторая карта слабая.' },
      { t: 'info', set: { bot: 970, pot: 40, botSay: 'Рейз 30' }, text: 'Бот повысил до 30.' },
      { t: 'ask', text: 'Доплатить 20?', opts: [['fold', 'Фолд'], ['call', 'Колл 20']], right: 'call', why: { fold: 'Один на один туз с любой картой — нормальная рука. Можно посмотреть флоп.' } },
      { t: 'info', set: { me: 970, pot: 60, mySay: 'Колл', botSay: '', board: 'A♦ 9♣ 6♠' }, text: '✓ Флоп A♦ 9♣ 6♠. У тебя пара тузов!' },
      { t: 'info', set: { bot: 910, pot: 120, mySay: '', botSay: 'Бет 60' }, text: 'Но бот ставит 60, а до флопа он повышал. Если у него тоже туз — всё решит кикер.' },
      { t: 'ask', text: 'Твой кикер — четвёрка, очень слабый. Что сделаешь?', opts: [['fold', 'Фолд'], ['call', 'Колл 60'], ['raise', 'Рейз до 200']], right: 'call',
        why: { fold: 'Пара тузов — это много, сбрасывать сразу рано.', raise: 'Рейз с худшим кикером опасен: если у бота туз, у него почти всегда кикер лучше.' } },
      { t: 'info', set: { me: 910, pot: 180, mySay: 'Колл', botSay: '', board: 'A♦ 9♣ 6♠ K♥' }, text: '✓ Тёрн K♥.' },
      { t: 'info', set: { bot: 760, pot: 330, botSay: 'Бет 150' }, text: 'Бот ставит 150 — второй раз крупно.' },
      { t: 'ask', text: 'Он ставит снова и снова. Что сделаешь?', opts: [['fold', 'Фолд'], ['call', 'Колл 150']], right: 'fold',
        why: { call: 'Рейз до флопа и две большие ставки — почти наверняка туз с кикером лучше твоего. Сбрасывай.' } },
      { t: 'info', set: { botShow: true, mySay: 'Фолд', botSay: '' }, text: '✓ Правильно. У бота A♠ Q♦ — та же пара тузов, но кикер дама старше четвёрки. Ты сэкономил 150 фишек.' },
      { t: 'done', text: 'Урок пройден.\n\nГлавное: с парой и слабым кикером не вкладывай много — при равной паре побеждает старший кикер.' },
    ],
  },
  {
    title: 'Слоуплей',
    steps: [
      { t: 'info', set: { hole: '9♠ 9♥', botCards: 'K♣ Q♣', board: '', me: 970, bot: 970, pot: 60, botShow: false, mySay: '', botSay: '' }, text: 'До флопа вы оба поставили по 30. У тебя 9♠ 9♥.' },
      { t: 'info', set: { board: '9♦ 4♣ 2♥' }, text: 'Флоп 9♦ 4♣ 2♥ — у тебя сет девяток! А стол «сухой»: стрита или флеша тут почти не бывает.' },
      { t: 'info', set: { botSay: 'Чек' }, text: 'Бот сделал чек.' },
      { t: 'ask', text: 'С монстром иногда выгодно притвориться слабым (слоуплей). Что сделаешь?', opts: [['check', 'Чек'], ['bet', 'Бет 40']], right: 'check',
        why: { bet: 'Можно и так, но на сухом столе чек даёт боту шанс что-то поймать или сблефовать — и вложить больше.' } },
      { t: 'info', set: { board: '9♦ 4♣ 2♥ K♦', mySay: 'Чек', bot: 920, pot: 110, botSay: 'Бет 50' }, text: '✓ Тёрн K♦. Бот поймал пару королей и ставит 50!' },
      { t: 'ask', text: 'Теперь у него есть рука. Что сделаешь?', opts: [['call', 'Колл 50'], ['raise', 'Рейз до 180']], right: 'raise', why: { call: 'Хватит прятаться: у бота пара, он заплатит. Повышай!' } },
      { t: 'info', set: { me: 790, bot: 790, pot: 420, mySay: 'Рейз 180', botSay: 'Колл' }, text: '✓ Бот уравнял. В банке 420.' },
      { t: 'info', set: { board: '9♦ 4♣ 2♥ K♦ 5♠', botShow: true, mySay: '', botSay: '' }, text: 'Ривер 5♠. У бота K♣ Q♣ — пара королей. Сет девяток сильнее — банк 420 твой!' },
      { t: 'done', set: { me: 1210, pot: 0 }, text: 'Урок пройден.\n\nГлавное: с очень сильной рукой на сухом столе можно чекнуть и дать сопернику поставить. Но как только у него появилась рука — повышай.' },
    ],
  },
  {
    title: 'Маленькая пара',
    steps: [
      { t: 'info', set: { hole: '5♣ 5♦', botCards: 'A♥ K♠', board: '', me: 995, bot: 990, pot: 15, botShow: false, mySay: 'МБ 5', botSay: 'ББ 10' },
        text: 'У тебя 5♣ 5♦ — маленькая пара. Сама по себе слабая, но если на флопе выйдет пятёрка — будет сет. Это бывает примерно 1 раз из 8.' },
      { t: 'ask', text: 'Доплатить 5, чтобы посмотреть флоп?', opts: [['fold', 'Фолд'], ['call', 'Колл 5'], ['raise', 'Рейз до 30']], right: 'call',
        why: { fold: 'Дёшево посмотреть флоп с парой — выгодно: если выйдет сет, можно выиграть много.', raise: 'Можно, но цель — дёшево увидеть флоп. Колл.' } },
      { t: 'info', set: { me: 990, bot: 960, pot: 50, mySay: 'Колл', botSay: 'Рейз 40' }, text: 'Бот повысил до 40.' },
      { t: 'ask', text: 'Доплатить 30. Если флоп мимо — сбросишь. Что сделаешь?', opts: [['fold', 'Фолд'], ['call', 'Колл 30']], right: 'call',
        why: { fold: 'Колл 30 — всего 3% стека. Шанс сета ~12%, а выиграть можно весь стек соперника. Выгодно.' } },
      { t: 'info', set: { me: 960, pot: 80, mySay: 'Колл', botSay: '', board: 'K♥ 5♠ 8♦' }, text: '✓ Флоп K♥ 5♠ 8♦ — сет пятёрок! А у бота, похоже, король.' },
      { t: 'info', set: { bot: 880, pot: 160, botSay: 'Бет 80' }, text: 'Бот ставит 80.' },
      { t: 'ask', text: 'Что сделаешь?', opts: [['call', 'Колл 80'], ['raise', 'Рейз до 250']], right: 'raise', why: { call: 'Колл неплох, но бот с королём заплатит рейз — растим банк.' } },
      { t: 'info', set: { me: 710, bot: 710, pot: 580, mySay: 'Рейз 250', botSay: 'Колл' }, text: '✓ Бот уравнял. В банке 580.' },
      { t: 'info', set: { board: 'K♥ 5♠ 8♦ 2♣ 3♦', botShow: true, mySay: '', botSay: '' }, text: 'Тёрн и ривер ничего не изменили. У бота A♥ K♠ — пара королей. Сет сильнее — банк 580 твой!' },
      { t: 'done', set: { me: 1290, pot: 0 }, text: 'Урок пройден.\n\nГлавное: маленькие пары играй дёшево ради сета. Не попал на флопе — сбрасывай.' },
    ],
  },
  {
    title: 'Турнир: короткий стек',
    steps: [
      { t: 'info', set: { hole: 'A♣ 9♦', botCards: 'K♥ J♣', board: '', me: 800, bot: 2800, pot: 300, botShow: false, mySay: 'ББ 200', botSay: 'МБ 100' },
        text: 'Турнир. Блайнды 100/200, у тебя было 1000 фишек — всего 5 больших блайндов. Ты на большом блайнде, у тебя A♣ 9♦.' },
      { t: 'info', set: { bot: 0, pot: 3100, botSay: 'Олл-ин' }, text: 'Бот пошёл олл-ин.' },
      { t: 'ask', text: 'С коротким стеком ждать нельзя — блайнды съедят фишки. Туз — хорошая рука. Что сделаешь?', opts: [['fold', 'Фолд'], ['call', 'Колл (олл-ин 800)']], right: 'call',
        why: { fold: 'При 5 блайндах туз с девяткой — отличная рука для олл-ина. Сбросишь — останется 800, и блайнды быстро добьют.' } },
      { t: 'info', set: { me: 0, bot: 1900, pot: 2000, mySay: 'Колл', botShow: true }, text: '✓ Карты открыты: у бота K♥ J♣. Твой туз впереди — примерно 60% на победу.\n\nЛишние 1900 фишек бота сверх твоего стека ему просто вернулись.' },
      { t: 'info', set: { board: 'A♥ 7♠ 3♦ 10♣ 2♥', mySay: '', botSay: '' }, text: 'Стол: A♥ 7♠ 3♦ 10♣ 2♥ — у тебя пара тузов!' },
      { t: 'info', set: { me: 2000, pot: 0 }, text: 'Ты удвоился: было 1000, стало 2000.' },
      { t: 'done', text: 'Урок пройден.\n\nГлавное: в турнире с коротким стеком (до 10 блайндов) играют «олл-ин или фолд». Хорошая рука — сразу всё.' },
    ],
  },
  {
    title: 'Продолженная ставка',
    steps: [
      { t: 'info', set: { hole: 'A♠ Q♠', botCards: '7♦ 7♣', board: '', me: 970, bot: 970, pot: 60, botShow: false, mySay: '', botSay: '' }, text: 'Ты повысил до флопа с A♠ Q♠, бот уравнял. В банке 60.' },
      { t: 'info', set: { board: 'K♣ 8♥ 3♦', botSay: 'Чек' }, text: 'Флоп K♣ 8♥ 3♦ — мимо. Но бот чекнул.' },
      { t: 'ask', text: 'Кто повышал до флопа, часто ставит снова — это «продолженная ставка». Соперник думает, что у тебя сильная рука. Что сделаешь?', opts: [['check', 'Чек'], ['bet', 'Бет 30']], right: 'bet',
        why: { check: 'Можно, но маленькая продолженная ставка тут часто забирает банк: король на столе пугает соперника.' } },
      { t: 'info', set: { me: 940, pot: 90, mySay: 'Бет 30', botSay: 'Фолд', botShow: true }, text: '✓ Бот сбросил 7♦ 7♣ — пару семёрок, которая была лучше твоей руки! Банк 90 твой.' },
      { t: 'done', set: { me: 1030, pot: 0 }, text: 'Урок пройден.\n\nГлавное: если повышал до флопа — небольшая ставка на флопе часто выигрывает банк, даже без попадания.' },
    ],
  },
  {
    title: 'Повторный рейз (3-бет)',
    steps: [
      { t: 'info', set: { hole: 'Q♥ Q♣', botCards: 'A♦ 10♠', board: '', me: 990, bot: 995, pot: 15, botShow: false, mySay: 'ББ 10', botSay: 'МБ 5' }, text: 'У тебя Q♥ Q♣ — пара дам. Ты на большом блайнде.' },
      { t: 'info', set: { bot: 970, pot: 40, botSay: 'Рейз 30' }, text: 'Бот повысил до 30.' },
      { t: 'ask', text: 'Ответное повышение называется 3-бет. С сильной рукой это лучший ход. Что сделаешь?', opts: [['fold', 'Фолд'], ['call', 'Колл 20'], ['raise', 'Рейз до 90']], right: 'raise',
        why: { fold: 'Дамы — третья по силе стартовая рука, сбрасывать нельзя.', call: 'Колл возможен, но 3-бет делает банк больше и отсекает слабые руки.' } },
      { t: 'info', set: { me: 910, bot: 910, pot: 180, mySay: 'Рейз 90', botSay: 'Колл' }, text: '✓ Бот уравнял. В банке 180.' },
      { t: 'info', set: { board: 'J♠ 6♥ 2♣', mySay: '', botSay: 'Чек' }, text: 'Флоп J♠ 6♥ 2♣ — твои дамы выше всех карт на столе (это «оверпара»). Бот чек.' },
      { t: 'ask', text: 'Что сделаешь?', opts: [['check', 'Чек'], ['bet', 'Бет 100']], right: 'bet', why: { check: 'Оверпара — это сильно. Ставь, пока соперник не поймал туза или короля.' } },
      { t: 'info', set: { me: 810, bot: 810, pot: 380, mySay: 'Бет 100', botSay: 'Колл' }, text: '✓ Бот уравнял.' },
      { t: 'info', set: { board: 'J♠ 6♥ 2♣ 4♦ 8♣', botShow: true, mySay: '', botSay: '' }, text: 'Тёрн 4♦, ривер 8♣ — туз не пришёл. У бота A♦ 10♠ — старшая карта. Дамы выигрывают банк 380!' },
      { t: 'done', set: { me: 1190, pot: 0 }, text: 'Урок пройден.\n\nГлавное: с очень сильной рукой на рейз соперника отвечай повторным рейзом.' },
    ],
  },
  {
    title: 'Когда сбросить дро',
    steps: [
      { t: 'info', set: { hole: '6♥ 5♥', botCards: 'A♣ A♦', board: 'K♥ 9♥ 2♠', me: 900, bot: 900, pot: 200, botShow: false, mySay: '', botSay: '' },
        text: 'У тебя 6♥ 5♥, на столе K♥ 9♥ 2♠ — четыре червы, флеш-дро (9 аутов).' },
      { t: 'info', set: { bot: 0, pot: 1100, botSay: 'Олл-ин 900' }, text: 'Бот пошёл олл-ин на 900 — в 4 раза больше банка.' },
      { t: 'info', text: 'Считаем: доплатить 900, чтобы бороться за 2000. Цена — 45%.\n\nШанс собрать флеш за две карты — около 35%. Это меньше 45%.' },
      { t: 'ask', text: 'Выгодно ли?', opts: [['fold', 'Фолд'], ['call', 'Колл 900']], right: 'fold', why: { call: 'Шанс (~35%) меньше цены (45%). В долгую такой колл проигрывает.' } },
      { t: 'info', set: { botShow: true, mySay: 'Фолд', botSay: '' }, text: '✓ Правильно. У бота A♣ A♦. Иногда флеш приходит, но в среднем такой колл теряет фишки.' },
      { t: 'done', text: 'Урок пройден.\n\nГлавное: с дро коллируй маленькие ставки и сбрасывай огромные. Всегда сравнивай шанс с ценой.' },
    ],
  },
];

function openTraining(n = 0) {
  S.tr = { lesson: n, step: 0, wrong: null };
  if (S.screen !== 'training') S.trBack = S.screen === 'tutorial' ? 'lobby' : S.screen;
  go('training');
}
const trainingDone = () => { try { return JSON.parse(localStorage.getItem('trainingDone') || '[]'); } catch { return []; } };
function markLessonDone(n) {
  try { const d = new Set(trainingDone()); d.add(n); localStorage.setItem('trainingDone', JSON.stringify([...d])); } catch {}
}

const tcard = (x) => { const r = x.slice(0, -1); return pcard(RANKS.indexOf(r === '10' ? 'T' : r) * 4 + SUITS.indexOf(x.slice(-1))); };
const tsplit = (s) => (s ? s.split(' ') : []);

function trainingScreen() {
  const tr = S.tr || (S.tr = { lesson: 0, step: 0, wrong: null });
  if (tr.lesson >= LESSONS.length) tr.lesson = 0;
  const L = LESSONS[tr.lesson];
  const step = L.steps[tr.step];
  const st = Object.assign({}, ...L.steps.slice(0, tr.step + 1).map((s) => s.set || {}));
  const board = tsplit(st.board);
  const next = () => { tr.step++; tr.wrong = null; render(); };
  const choose = (k) => { if (k === step.right) next(); else { tr.wrong = k; render(); } };
  const lastLesson = tr.lesson === LESSONS.length - 1;
  if (step.t === 'done') markLessonDone(tr.lesson);

  const seat = (name, stack, cards, say) => h('div', { class: 'tr-seat' },
    h('div', { class: 'row between' }, h('div', { class: 'b' }, name), h('div', { class: 'small soft' }, `${fmt(stack)} фишек`)),
    h('div', { class: 'row', style: 'gap:8px;align-items:center' }, h('div', { class: 'tut-cards' }, cards),
      say && h('div', { class: 'tr-say' }, say)));

  return h('div', { class: 'screen tut' },
    header('Тренировка'),
    h('div', { class: 'small muted' }, `Урок ${tr.lesson + 1} из ${LESSONS.length}: ${L.title}`),
    h('div', { class: 'glass card tr-table' },
      seat('🤖 Бот-учитель', st.bot, tsplit(st.botCards).map((c) => (st.botShow ? tcard(c) : pcard(null))), st.botSay),
      h('div', { class: 'tr-board' },
        h('div', { class: 'tut-cards', style: 'justify-content:center;min-height:56px' }, board.length ? board.map(tcard) : h('div', { class: 'small muted', style: 'align-self:center' }, 'Общих карт пока нет')),
        h('div', { class: 'small soft', style: 'text-align:center' }, `Банк: ${fmt(st.pot)}`)),
      seat('Ты', st.me, tsplit(st.hole).map(tcard), st.mySay)),
    h('div', { class: 'glass card tr-coach' },
      h('div', { class: 'tr-text' }, step.text),
      tr.wrong && h('div', { class: 'tr-wrong' }, '✗ Не лучший ход. ', step.why?.[tr.wrong] || 'Попробуй другой вариант.', ' Попробуй ещё раз.')),
    step.t === 'ask' && h('div', { class: 'tr-opts' }, step.opts.map(([k, label]) =>
      h('button', { class: k === 'fold' ? 'btn-ghost' : 'btn', onclick: () => choose(k) }, label))),
    step.t === 'info' && h('button', { class: 'btn', onclick: next }, 'Дальше'),
    step.t === 'done' && (lastLesson
      ? h('div', { class: 'col', style: 'gap:10px' },
        h('div', { class: 'small soft', style: 'line-height:1.45' }, 'Тренировка пройдена! Теперь попробуй настоящую игру против ботов на лёгкой сложности — фишки там уже твои.'),
        h('button', { class: 'btn', onclick: () => { S.botLevel = 'easy'; go('bots'); } }, 'Играть против ботов'),
        h('button', { class: 'btn-ghost', onclick: () => openTraining(0) }, 'Пройти тренировку заново'))
      : h('button', { class: 'btn', onclick: () => openTraining(tr.lesson + 1) }, 'Следующий урок')),
    // выбор урока
    h('details', { class: 'tut-toc' },
      h('summary', {}, 'Все уроки'),
      LESSONS.map((l, n) => h('button', { class: `tut-toc-item ${n === tr.lesson ? 'on' : ''}`, onclick: () => openTraining(n) },
        `${trainingDone().includes(n) ? '✓ ' : ''}${n + 1}. ${l.title}`))));
}

// Пранк: чёрный экран, красные глаза, потом к админу ползут два туза.
// Рисуется поверх всего, отдельно от render() — перерисовка стола его не сбивает.
function prankFx(m) {
  // перевёрнутый стол: экран крутится на 180° на 3 секунды
  if (m.kind === 'flip') {
    const el = document.querySelector('.table-screen');
    el?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(180deg)', offset: 0.15 }, { transform: 'rotate(180deg)', offset: 0.85 }, { transform: 'rotate(360deg)' }], { duration: 3200, easing: 'ease-in-out' });
    return;
  }
  // маски: у всех за столом аватар 🎭 на 10 секунд
  if (m.kind === 'masks') {
    S.masksUntil = Date.now() + 10000;
    render();
    setTimeout(render, 10100);
    return;
  }
  const mine = m.admin === S.me?.id;
  const el = h('div', { class: 'prank' },
    h('div', { class: 'prank-eyes' }, h('div', { class: 'prank-eye' }), h('div', { class: 'prank-eye' })),
    h('div', { class: `prank-aces ${mine ? 'down' : 'up'}` }, (m.cards || [48, 49]).map((c) => pcard(c))));
  document.body.appendChild(el);
  try { navigator.vibrate?.([80, 60, 200]); } catch {}
  setTimeout(() => el.classList.add('crawl'), 1000);
  setTimeout(() => el.remove(), 3600);
}

// ---------- Мастерская ботов: свой бот, бот-заменитель, шоу ботов ----------

function openBotLab() {
  go('botlab');
  run({ t: 'botsInfo' }).then((r) => { if (r) { S.botsInfo = r; render(); } });
}

function botLabScreen() {
  const I = S.botsInfo || {};
  const my = I.myBot;
  const kinds = I.kinds || [];
  const pool = I.showPool || [];
  S.lab ||= { name: my?.name || '', kind: my?.kind ?? 3, avatar: my?.avatar || '🤖', duel: ['Акула', 'Скала'], tour: null, pick: 'Акула', bet: 0, dep: 1000 };
  const L = S.lab;
  if (!L.tour && pool.length) L.tour = [...pool].sort(() => Math.random() - 0.5).slice(0, 6);
  const sel = (value, onchange) => h('select', { class: 'buyin-input', onchange: (e) => onchange(e.target.value) },
    pool.map((n) => h('option', { value: n, selected: n === value }, n)));
  const bank = I.bank || { bank: 0 };
  return h('div', { class: 'screen' },
    header('Мастерская ботов'),
    // свой бот
    h('div', { class: 'glass card', style: 'gap:10px' },
      h('div', { class: 'b', style: 'font-size:16px' }, my ? `${my.avatar} Твой бот: ${my.name}` : 'Создай своего бота'),
      h('input', { class: 'buyin-input', placeholder: 'Имя бота', value: L.name, maxlength: 14, oninput: (e) => { L.name = e.target.value; } }),
      h('div', { class: 'choices' }, ['🤖', '🦊', '🐺', '🦁', '🐉', '👽', '🎩', '💀'].map((a) => h('button', { class: L.avatar === a ? 'on' : '', onclick: () => { L.avatar = a; render(); } }, a))),
      h('div', { class: 'label' }, 'Характер'),
      h('div', { class: 'col', style: 'gap:6px' }, kinds.map((k) => h('button', { class: `item ${L.kind === k.id ? 'on' : ''}`, style: L.kind === k.id ? 'border-color:#f5d37a' : null, onclick: () => { L.kind = k.id; render(); } },
        h('div', { class: 'col' }, h('div', { class: 'b', style: 'font-size:14px' }, k.kind), h('div', { class: 'small muted' }, k.text))))),
      h('div', { class: 'grid2' },
        h('button', { class: 'btn-ghost', onclick: async () => { const r = await run({ t: 'setMyBot', name: L.name, kind: L.kind, avatar: L.avatar }); if (r) { I.myBot = r.bot; toast('Бот сохранён'); render(); } } }, 'Сохранить'),
        my && h('button', { class: 'btn', style: 'height:46px;font-size:14px', onclick: async () => { S.botMode = 'hu'; S.botName = '__my'; const r = await run({ t: 'sitBots', mode: 'hu', botName: '__my', buyin: S.buyin || 500 }); if (r) go('table'); } }, 'Играть против него'))),
    // бот-заменитель
    h('div', { class: 'glass card', style: 'gap:10px' },
      h('div', { class: 'b', style: 'font-size:16px' }, '🤖 Бот-заменитель'),
      h('div', { class: 'small soft', style: 'line-height:1.45' }, 'Пока тебя нет в игре, твой бот играет за тебя — по 30 раздач в час, максимум 12 часов. Играет на отдельный банк: положи туда фишки, забрать можно в любой момент. Он может и выиграть, и проиграть.'),
      h('div', { class: 'row between' }, h('div', {}, 'В банке бота'), h('div', { class: 'b' }, fmt(bank.bank))),
      bank.log && h('div', { class: 'small muted' }, `Последний раз: ${bank.log.hands} раздач, ${bank.log.net >= 0 ? '+' : '−'}${fmt(Math.abs(bank.log.net))}`),
      h('div', { class: 'grid2' },
        h('input', { class: 'buyin-input', type: 'number', inputmode: 'numeric', min: 100, value: L.dep, oninput: (e) => { L.dep = Number(e.target.value); } }),
        h('button', { class: 'btn-ghost', onclick: async () => { const r = await run({ t: 'bankDeposit', amount: L.dep }); if (r) { I.bank = r.bank; render(); } } }, 'Положить')),
      bank.bank > 0 && h('button', { class: 'btn-ghost', onclick: async () => { const r = await run({ t: 'bankWithdraw' }); if (r) { I.bank = r.bank; toast(`+${fmt(r.got)} на баланс`); render(); } } }, 'Забрать всё на баланс')),
    // шоу ботов
    h('div', { class: 'glass card', style: 'gap:10px' },
      h('div', { class: 'b', style: 'font-size:16px' }, '🍿 Шоу ботов'),
      h('div', { class: 'small soft', style: 'line-height:1.45' }, 'Смотри, как играют боты. Можно поставить фишки на победителя: дуэль — выигрыш ×1.9, турнир на 6 — ×5. Без ставки — просто смотришь.'),
      h('div', { class: 'label' }, 'Дуэль 1 на 1'),
      h('div', { class: 'grid2' }, sel(L.duel[0], (v) => { L.duel[0] = v; render(); }), sel(L.duel[1], (v) => { L.duel[1] = v; render(); })),
      h('div', { class: 'label' }, 'Турнир на 6'),
      h('div', { class: 'small soft' }, (L.tour || []).join(' · '), ' ', h('button', { class: 'btn-sm', onclick: () => { L.tour = null; render(); } }, '🔀')),
      h('div', { class: 'label' }, 'Ставка на победителя'),
      h('div', { class: 'grid2' },
        h('select', { class: 'buyin-input', onchange: (e) => { L.pick = e.target.value; } },
          [...new Set([...L.duel, ...(L.tour || [])])].map((n) => h('option', { value: n, selected: n === L.pick }, n))),
        h('input', { class: 'buyin-input', type: 'number', inputmode: 'numeric', placeholder: '0 — без ставки', value: L.bet || '', oninput: (e) => { L.bet = Number(e.target.value) || 0; } })),
      h('div', { class: 'grid2' },
        h('button', { class: 'btn-ghost', onclick: async () => { if (await run({ t: 'botShow', kind: 'duel', bots: L.duel, pick: L.pick, bet: L.duel.includes(L.pick) ? L.bet : 0 })) go('table'); } }, 'Смотреть дуэль'),
        h('button', { class: 'btn', style: 'height:46px;font-size:14px', onclick: async () => { if (await run({ t: 'botShow', kind: 'tour', bots: L.tour, pick: L.pick, bet: (L.tour || []).includes(L.pick) ? L.bet : 0 })) go('table'); } }, 'Смотреть турнир'))));
}

// ---------- История раздач за сутки и повтор ----------

async function openLastReplay() {
  const r = await run({ t: 'history' });
  if (!r?.hands?.length) return toast('Ещё нет сыгранных раздач');
  openReplay(r.hands[0].id);
}
async function openHistory() {
  go('history');
  const r = await run({ t: 'history' });
  if (r) { S.history = r.hands; render(); }
}
async function openReplay(id) {
  const r = await run({ t: 'replay', id });
  if (!r) return go('lobby');
  S.replay = { ...r.replay, step: 0 };
  go('replay');
}

function historyScreen() {
  const list = S.history;
  return h('div', { class: 'screen' },
    header('Раздачи за сутки'),
    list && h('div', { class: 'choices wrap' }, [['all', 'Все'], ['won', 'Выигранные'], ['lost', 'Проигранные'], ['sd', 'Со вскрытием'], ['big', 'Крупные']].map(([k, n]) =>
      h('button', { class: (S.histFilter || 'all') === k ? 'on' : '', onclick: () => { S.histFilter = k; render(); } }, n))),
    !list ? h('div', { class: 'muted small' }, 'Загрузка…')
      : list.length ? list.filter((x) => ({ all: true, won: x.net > 0, lost: x.net < 0, sd: !!x.hand, big: Math.abs(x.net) >= 1000 })[S.histFilter || 'all']).map((x) => h('button', { class: 'item', onclick: () => openReplay(x.id) },
        h('div', { class: 'row', style: 'gap:8px;min-width:0' },
          h('div', { class: 'tut-cards' }, (x.hole || []).map((c) => pcard(c, 'sm'))),
          h('div', { class: 'col', style: 'gap:1px;min-width:0' },
            h('div', { class: 'b', style: `font-size:14px;color:${x.net > 0 ? 'var(--green)' : x.net < 0 ? '#ff8a80' : '#fff'}` }, `${x.net > 0 ? '+' : x.net < 0 ? '−' : ''}${fmt(Math.abs(x.net))}${x.hand ? ` · ${x.hand}` : ''}`),
            h('div', { class: 'small muted' }, `${new Date(x.at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })} · ${x.title}`))),
        icon('chev'))) : h('div', { class: 'muted small' }, 'За последние сутки раздач нет'));
}

// повтор: события раздачи по шагам — карты, ставки, банк
function replayScreen() {
  const R = S.replay;
  if (!R) return h('div', { class: 'screen' }, header('Повтор'));
  const evs = R.events || [];
  const step = Math.min(R.step, evs.length);
  const name = (id) => (R.players.find((p) => p.id === id)?.name ?? '?');
  const ACT = { fold: 'фолд', check: 'чек', call: 'колл', raise: 'рейз' };
  const STREET = { flop: 'Флоп', turn: 'Тёрн', river: 'Ривер' };
  let board = [];
  const lines = [];
  const shown = {};
  for (const e of evs.slice(0, step)) {
    if (e.type === 'blinds') lines.push(`Блайнды: ${name(e.sb.id)} ${e.sb.amount}, ${name(e.bb.id)} ${e.bb.amount}`);
    if (e.type === 'street') { board = e.board; lines.push(`— ${STREET[e.street]} —`); }
    if (e.type === 'action') lines.push(`${name(e.id)}: ${ACT[e.action]}${e.action === 'raise' || e.action === 'call' ? ` ${fmt(e.to)}` : ''}${e.allIn ? ' (олл-ин)' : ''}`);
    if (e.type === 'showdown') { lines.push('— Вскрытие —'); for (const r of e.reveals) shown[r.id] = r.cards; }
    if (e.type === 'handEnd') for (const w of e.winners) lines.push(`🏆 ${name(w.id)} забирает ${fmt(w.amount)}`);
  }
  const friends = S.friends?.friends || [];
  return h('div', { class: 'screen' },
    header('Повтор раздачи'),
    h('div', { class: 'small muted' }, `${R.title}${R.owner ? ` · раздача ${R.owner}` : ''}`),
    h('div', { class: 'glass card', style: 'gap:8px' },
      h('div', { class: 'small muted' }, 'Карты игрока'),
      h('div', { class: 'tut-cards' }, (R.hole || []).map((c) => pcard(c))),
      h('div', { class: 'small muted' }, 'Стол'),
      h('div', { class: 'tut-cards', style: 'min-height:62px' }, board.length ? board.map((c) => pcard(c)) : h('div', { class: 'small muted' }, 'пока нет')),
      Object.keys(shown).length > 0 && h('div', { class: 'col', style: 'gap:4px' }, Object.entries(shown).map(([id, cards]) => h('div', { class: 'row', style: 'gap:6px;align-items:center' }, h('span', { class: 'small' }, name(Number(id))), h('div', { class: 'tut-cards' }, cards.map((c) => pcard(c, 'sm'))))))),
    h('div', { class: 'glass card', style: 'gap:4px' }, lines.length ? lines.map((t) => h('div', { class: 'small' }, t)) : h('div', { class: 'small muted' }, 'Жми «Дальше», чтобы смотреть ход за ходом')),
    h('div', { class: 'tut-nav' },
      h('button', { class: 'btn-ghost', disabled: step === 0, onclick: () => { R.step = Math.max(0, step - 1); render(); } }, 'Назад'),
      step < evs.length ? h('button', { class: 'btn', onclick: () => { R.step = step + 1; render(); } }, 'Дальше')
        : h('button', { class: 'btn', onclick: () => { R.step = 0; render(); } }, 'Сначала')),
    R.canReview && R.ownerId === S.me.id && h('button', { class: 'btn-ghost', onclick: async () => { const r = await run({ t: 'review', id: R.id }); if (r) { R.review = r.steps; render(); } } }, '🔍 Разбор моих ходов'),
    R.review && h('div', { class: 'glass card', style: 'gap:6px' }, R.review.length ? R.review.map((x) => h('div', { class: 'small', style: `line-height:1.45;color:${x.verdict === 'bad' ? '#ffb4b4' : x.verdict === 'meh' ? '#f5d37a' : 'var(--green)'}` }, `${x.verdict === 'bad' ? '❌' : x.verdict === 'meh' ? '⚠️' : '✅'} ${x.text}${x.verdict !== 'ok' ? ` · лучше: ${x.best}` : ''}`)) : h('div', { class: 'small muted' }, 'В этой раздаче ты не принимал решений')),
    friends.length > 0 && h('div', { class: 'label' }, 'Отправить другу'),
    friends.length > 0 && h('div', { class: 'choices wrap' }, friends.map((f) => h('button', { onclick: async () => { if (await run({ t: 'shareReplay', id: R.id, to: f.id })) toast(`Отправлено: ${f.name}`); } }, f.name))));
}

// график стека за сессию (SVG, без библиотек)
function stackGraph(pts) {
  const W = 300, H = 70, min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const xy = pts.map((v, i) => `${((i / (pts.length - 1)) * W).toFixed(1)},${(H - 4 - ((v - min) / span) * (H - 8)).toFixed(1)}`);
  const up = pts[pts.length - 1] >= pts[0];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'stack-graph');
  svg.innerHTML = `<polyline points="${xy.join(' ')}" fill="none" stroke="${up ? '#6fdc8c' : '#ff8a80'}" stroke-width="2.5" stroke-linejoin="round"/>`;
  return h('div', { class: 'col', style: 'gap:2px' }, h('div', { class: 'small muted' }, `Стек по раздачам: от ${fmt(min)} до ${fmt(max)}`), svg);
}

// ---------- Школа покера: таблица рук, викторина, экзамен, слабые места ----------

function openSchool() { go('school'); run({ t: 'weakSpots' }).then((r) => { if (r) { S.weak = r; render(); } }); }

function schoolScreen() {
  const W = S.weak;
  const item = (title, sub, onclick) => h('button', { class: 'item', onclick }, h('div', { class: 'col' }, h('div', { class: 'b', style: 'font-size:14px' }, title), h('div', { class: 'small muted' }, sub)), icon('chev'));
  return h('div', { class: 'screen' },
    header('Школа покера'),
    item('Как играть', 'Правила с нуля — простыми словами', () => openTutorial(0)),
    item('Тренировка', `${LESSONS.length} уроков против бота-учителя`, () => openTraining(0)),
    item('Таблица стартовых рук', 'Какие руки играть с какой позиции', () => go('chart')),
    item('Викторина', 'Какая рука сильнее — на скорость', openQuiz),
    item('Экзамен', 'Сдай — получишь значок «Знаток покера»', openExam),
    h('div', { class: 'label' }, 'Мои слабые места'),
    h('div', { class: 'glass card', style: 'gap:8px' },
      !W ? h('div', { class: 'small muted' }, 'Загрузка…')
        : !W.ready ? h('div', { class: 'small muted' }, `Сыграй ещё ${W.need} раздач — и я скажу, где ты теряешь фишки`)
          : [W.tips.map((t) => h('div', { class: 'small', style: `line-height:1.45;color:${t.bad ? '#ffb4b4' : 'var(--green)'}` }, `${t.bad ? '⚠️' : '✅'} ${t.text}`)),
            h('div', { class: 'small muted' }, 'Бот Тень учится как раз на таких привычках — исправь их, и обыграть его станет проще.')]));
}

// таблица 13×13: пары по диагонали, сверху одномастные, снизу разномастные
const CHART_POS = [['early', 'Ранняя'], ['middle', 'Средняя'], ['late', 'Поздняя (баттон)'], ['blinds', 'Блайнды']];
// формула Чена: очки старшей карты, пары, масть, разрыв между картами
function handScore(hi, lo, suited) {
  const pts = (r) => (r === 12 ? 10 : r === 11 ? 8 : r === 10 ? 7 : r === 9 ? 6 : (r + 2) / 2);
  if (hi === lo) return Math.max(5, pts(hi) * 2);
  const gap = hi - lo - 1;
  let s = pts(hi) + (suited ? 2 : 0) - [0, 1, 2, 4][Math.min(gap, 3)] - (gap >= 4 ? 1 : 0);
  if (gap <= 1 && hi < 10) s += 1;
  return Math.ceil(s);
}
function chartScreen() {
  const pos = S.chartPos || 'middle';
  const need = { early: 8, middle: 7, late: 5, blinds: 6 }[pos];
  const R = 'AKQJT98765432';
  const cells = [];
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) {
    const hi = 12 - Math.min(i, j), lo = 12 - Math.max(i, j), suited = j > i;
    const sc = handScore(hi, lo, suited);
    const cls = sc >= need + 3 ? 'raise' : sc >= need ? 'play' : 'fold';
    cells.push(h('div', { class: `ch-cell ${cls}` }, `${R[Math.min(i, j)]}${R[Math.max(i, j)]}${i === j ? '' : suited ? 's' : 'o'}`));
  }
  return h('div', { class: 'screen' },
    header('Стартовые руки'),
    h('div', { class: 'choices wrap' }, CHART_POS.map(([k, n]) => h('button', { class: pos === k ? 'on' : '', onclick: () => { S.chartPos = k; render(); } }, n))),
    h('div', { class: 'chart-grid' }, cells),
    h('div', { class: 'small soft', style: 'line-height:1.5' }, '🟩 играй смело, можно рейзить · 🟨 можно играть · ⬛ лучше сбросить. «s» — одной масти, «o» — разных мастей. Чем позже твоя позиция, тем больше рук можно играть.'));
}

// викторина
async function openQuiz() {
  const r = await run({ t: 'quiz' });
  if (!r) return;
  S.quiz = { qs: r.questions, i: 0, score: 0, start: Date.now(), picked: null };
  go('quiz');
}
function quizScreen() {
  const Q = S.quiz;
  if (!Q) return h('div', { class: 'screen' }, header('Викторина'));
  let best = 0;
  try { best = Number(localStorage.getItem('quizBest')) || 0; } catch {}
  if (Q.i >= Q.qs.length) {
    const sec = Math.round((Q.end - Q.start) / 1000);
    if (Q.score > best) { best = Q.score; try { localStorage.setItem('quizBest', String(best)); } catch {} }
    return h('div', { class: 'screen' }, header('Викторина'),
      h('div', { class: 'glass card', style: 'gap:8px;align-items:center' },
        h('div', { style: 'font-size:40px;font-weight:800' }, `${Q.score} / ${Q.qs.length}`),
        h('div', { class: 'small muted' }, `за ${sec} с · рекорд ${best}`)),
      h('button', { class: 'btn', onclick: openQuiz }, 'Ещё раз'));
  }
  const q = Q.qs[Q.i];
  const pick = (x) => {
    if (Q.picked) return;
    Q.picked = x;
    if (x === q.answer) Q.score++;
    render();
    setTimeout(() => { Q.i++; Q.picked = null; if (Q.i >= Q.qs.length) Q.end = Date.now(); render(); }, 1200);
  };
  const side = (k, cards, name) => h('button', { class: `quiz-side ${Q.picked ? (q.answer === k || q.answer === 'tie' ? 'right' : Q.picked === k ? 'wrong' : '') : ''}`, onclick: () => pick(k) },
    h('div', { class: 'tut-cards' }, cards.map((c) => pcard(c))), Q.picked && h('div', { class: 'small' }, name));
  return h('div', { class: 'screen' }, header('Викторина'),
    h('div', { class: 'small muted' }, `Вопрос ${Q.i + 1} из ${Q.qs.length} · верно ${Q.score}`),
    h('div', { class: 'b' }, 'Стол:'),
    h('div', { class: 'tut-cards' }, q.board.map((c) => pcard(c))),
    h('div', { class: 'b' }, 'Чья рука сильнее?'),
    h('div', { class: 'grid2' }, side('a', q.a, q.aName), side('b', q.b, q.bName)),
    h('button', { class: 'btn-ghost', onclick: () => pick('tie') }, 'Ничья'));
}

// экзамен
async function openExam() {
  const r = await run({ t: 'exam' });
  if (!r) return;
  S.exam = { qs: r.questions, pass: r.pass, answers: {}, result: null };
  go('exam');
}
function examScreen() {
  const E = S.exam;
  if (!E) return h('div', { class: 'screen' }, header('Экзамен'));
  if (E.result) {
    const R = E.result;
    return h('div', { class: 'screen' }, header('Экзамен'),
      h('div', { class: 'glass card', style: 'gap:8px;align-items:center' },
        h('div', { style: 'font-size:40px;font-weight:800' }, `${R.right} / ${R.total}`),
        h('div', { class: 'b', style: `color:${R.passed ? 'var(--green)' : '#ff8a80'}` }, R.passed ? 'Сдал! Значок «Знаток покера» твой' : `Не сдал — нужно ${E.pass} правильных`)),
      R.wrong.length > 0 && h('div', { class: 'label' }, 'Ошибки'),
      R.wrong.map((w) => h('div', { class: 'glass card', style: 'gap:4px' }, h('div', { class: 'small' }, w.q), h('div', { class: 'small', style: 'color:var(--green)' }, `Правильно: ${w.right}`))),
      h('button', { class: 'btn', onclick: openExam }, 'Пройти снова'));
  }
  const done = Object.keys(E.answers).length;
  return h('div', { class: 'screen' }, header('Экзамен'),
    h('div', { class: 'small muted' }, `Отвечено ${done} из ${E.qs.length} · сдать — от ${E.pass} правильных`),
    E.qs.map((q, n) => h('div', { class: 'glass card', style: 'gap:6px' },
      h('div', { class: 'b', style: 'font-size:14px' }, `${n + 1}. ${q.q}`),
      h('div', { class: 'col', style: 'gap:4px' }, q.a.map((a, i) => h('button', { class: `exam-opt ${E.answers[q.id] === i ? 'on' : ''}`, onclick: () => { E.answers[q.id] = i; render(); } }, a))))),
    h('button', { class: 'btn', disabled: done < E.qs.length, onclick: async () => { const r = await run({ t: 'examSubmit', answers: E.answers }); if (r) { E.result = r; render(); window.scrollTo(0, 0); } } }, 'Сдать'));
}

// мини-превью стиля фишек: три стопки своих цветов (стиль — на контейнере, не на всём экране)
function chipPreview(id) {
  return h('div', { class: 'chip-prev', 'data-chips': id }, ['c-white', 'c-red', 'c-gold'].map((c, i) =>
    h('div', { class: 'stack' }, Array.from({ length: 3 + i }, () => h('div', { class: `chip ${c}` })))));
}
function chipPicker(cur) {
  return h('div', { class: 'item-grid' }, CHIP_STYLES.map(([id, name]) => h('button', {
    class: `item-pick ${cur === id ? 'on' : ''}`, onclick: () => { setUi({ chips: id }); render(); },
  }, chipPreview(id), h('div', { class: 'small' }, name))));
}
function backPicker() {
  const L = S.look;
  if (!L) return null;
  return h('div', { class: 'item-grid' }, L.backs.filter((b) => b.owned).map((b) => h('button', {
    class: `item-pick ${L.back === b.id ? 'on' : ''}`, onclick: () => run({ t: 'equip', kind: 'back', id: b.id }),
  }, h('div', { class: `pcard back sm preview back-${b.id}` }), h('div', { class: 'small' }, b.name))));
}

// быстрые настройки прямо за столом
function quickSettings() {
  const ui = loadUi();
  const tog = (label, on, fn) => h('label', { class: 'toggle-row' }, h('input', { type: 'checkbox', checked: !!on, onchange: (e) => { fn(e.target.checked); render(); } }), h('span', {}, label));
  return h('div', { class: 'quick-set glass card' },
    h('div', { class: 'row between' }, h('div', { class: 'b' }, 'Быстрые настройки'), h('button', { class: 'hint-x', 'aria-label': 'Закрыть', onclick: () => { S.quickSet = false; render(); } }, '✕')),
    tog('Звуки', soundOn(), (v) => setSound(v)),
    tog('Вибрация на мой ход', ui.vibro !== false, (v) => setUi({ vibro: v })),
    tog('Колода в 4 цвета', ui.deck4, (v) => setUi({ deck4: v })),
    tog('Режим одной рукой', ui.oneHand, (v) => setUi({ oneHand: v })),
    tog('Режим для левшей', ui.lefty, (v) => setUi({ lefty: v })),
    tog('Крупные кнопки', ui.bigBtns, (v) => setUi({ bigBtns: v })),
    tog('Экономия батареи (без анимаций)', ui.eco, (v) => setUi({ eco: v })),
    tog('Отмена фолда (2 секунды)', ui.undoFold, (v) => setUi({ undoFold: v })),
    tog('Подтверждать олл-ин', ui.confirmAllin, (v) => setUi({ confirmAllin: v })),
    tog('Озвучка ходов', ui.voice, (v) => setUi({ voice: v })),
    tog('Субтитры действий', ui.subs, (v) => setUi({ subs: v })),
    tog('Напоминать про перерыв (каждый час)', ui.breakRemind !== false, (v) => setUi({ breakRemind: v })),
    h('div', { class: 'small muted', style: 'line-height:1.4' }, 'На ПК: F — фолд, C — чек/колл, R — рейз, A — олл-ин, H — подсказка. На телефоне: свайп влево по панели — фолд, вверх — чек/колл, двойной тап по столу — чек/колл.'),
    h('div', { class: 'small muted' }, 'Раздача карт'),
    h('div', { class: 'choices wrap' }, DEAL_ANIM.map(([k, n]) => h('button', { class: ui.deal === k ? 'on' : '', onclick: () => { setUi({ deal: k }); render(); } }, n))),
    h('div', { class: 'small muted' }, 'Сцена'),
    h('div', { class: 'choices wrap' }, SCENES.filter(([k]) => k !== 'photo').map(([k, n]) => h('button', { class: ui.scene === k ? 'on' : '', onclick: () => { setUi({ scene: k }); render(); } }, n))),
    h('div', { class: 'small muted' }, 'Фишки'),
    chipPicker(ui.chips),
    h('div', { class: 'small muted' }, 'Рубашка карт'),
    backPicker(),
    h('button', { class: 'btn-ghost', onclick: () => { S.quickSet = false; S.tableHidden = true; go('style'); } }, '🎨 Всё оформление (350 вариантов)'));
}

// ---------- Стиль и кастом: 100 вариантов оформления ----------

function styleScreen() {
  const ui = loadUi();
  const L = S.look;
  const grid = (list, cur, key, pv) => h('div', { class: 'item-grid' }, list.map(([id, name]) => h('button', {
    class: `item-pick ${(cur || 'auto') === id ? 'on' : ''}`, onclick: () => { setUi({ [key]: id }); render(); },
  }, pv(id), h('div', { class: 'small' }, name))));
  const srvGrid = (list, cur, kind, pv) => h('div', { class: 'item-grid' }, (list || []).map((x) => h('button', {
    class: `item-pick ${cur === x.id ? 'on' : ''} ${x.owned ? '' : 'locked'}`, onclick: () => (x.owned ? run({ t: 'equip', kind, id: x.id }) : toast(`Закрыто: ${x.how}`)),
  }, pv(x.id), h('div', { class: 'small' }, x.name), !x.owned && h('div', { class: 'small muted', style: 'font-size:10px' }, `🔒 ${x.how}`))));
  const sample = [h('div', { class: 'pcard red' }, h('div', { class: 'r' }, 'A'), h('div', { class: 's' }, '♥')), h('div', { class: 'pcard' }, h('div', { class: 'r' }, 'K'), h('div', { class: 's' }, '♠'))];
  return h('div', { class: 'screen' },
    header('Стиль и кастом'),
    h('div', { class: 'small soft', style: 'line-height:1.45' }, 'Рамку, эффект ника и табличку видят все за столом. Остальное — только у тебя на экране.'),
    h('div', { class: 'label' }, 'Эффект ника · видят все'),
    L && srvGrid(L.nameFxs, L.nameFx, 'namefx', (id) => h('div', { class: `pv-name ${id !== 'none' ? `nfx-${id}` : ''}` }, S.me.name.slice(0, 10))),
    h('div', { class: 'label' }, 'Табличка игрока · видят все'),
    L && srvGrid(L.plates, L.plate, 'plate', (id) => h('div', { class: `pv-plate ${id !== 'none' ? `pv-plate-${id}` : ''}` }, h('span', { class: 'nm' }, 'Ты'), h('span', { class: 'st' }, '5 000'))),
    h('div', { class: 'label' }, 'Рамка аватара · видят все'),
    L && srvGrid(L.frames, L.frame, 'frame', (id) => h('div', { class: `ava frame-${id}`, style: 'margin:4px auto' }, '🙂')),
    h('div', { class: 'label' }, 'Цвет сукна'),
    grid(FELTS, ui.felt, 'felt', (id) => h('div', { class: `pv-felt ${id !== 'auto' ? `pv-felt-${id}` : ''}` })),
    h('div', { class: 'label' }, 'Бортик стола'),
    grid(RIMS, ui.rim, 'rim', (id) => h('div', { class: `pv-rim ${id !== 'auto' ? `pv-rim-${id}` : ''}` })),
    h('div', { class: 'label' }, 'Лицевая сторона карт'),
    grid(FACES, ui.face, 'face', (id) => h('div', { class: `pv-face ${id !== 'auto' ? `pv-face-${id}` : ''}` }, sample.map((c) => c.cloneNode(true)))),
    h('div', { class: 'label' }, 'Баттон дилера'),
    grid(DBTNS, ui.dbtn, 'dbtn', (id) => h('div', { class: `pv-dbtn ${id !== 'auto' ? `pv-dbtn-${id}` : ''}` }, 'D')),
    h('div', { class: 'label' }, 'Плашка ставки'),
    grid(PILLS, ui.pill, 'pill', (id) => h('div', { class: `pv-pill ${id !== 'auto' ? `pv-pill-${id}` : ''}` }, '250')),
    h('div', { class: 'label' }, 'Ячейки для карт на столе'),
    grid(SLOTS, ui.slots, 'slots', (id) => h('div', { class: `pv-slots ${id !== 'auto' ? `pv-slots-${id}` : ''}` })),
    h('div', { class: 'label' }, 'Фон вокруг стола'),
    grid(BGS, ui.bg, 'bg', (id) => h('div', { class: `pv-bg ${id !== 'auto' ? `pv-bg-${id}` : ''}` })),
    h('div', { class: 'label' }, 'Полоска таймера хода'),
    grid(TIMERS, ui.timer, 'timer', (id) => h('div', { class: `pv-timer ${id !== 'auto' ? `pv-timer-${id}` : ''}` }, h('div'))),
    h('div', { class: 'label' }, 'Плашка «моя комбинация»'),
    grid(HANDS, ui.hand, 'hand', (id) => h('div', { class: `pv-hand ${id !== 'auto' ? `pv-hand-${id}` : ''}` }, 'Пара тузов')),
    h('div', { class: 'label' }, 'Подложка эмодзи'),
    grid(EMOS, ui.emo, 'emo', (id) => h('div', { class: `pv-emo ${id !== 'auto' ? `pv-emo-${id}` : ''}` }, '😎')),
    h('div', { class: 'label' }, 'Шрифт приложения'),
    grid(FONTS, ui.font, 'font', (id) => h('div', { class: `pv-fontx ${id !== 'auto' ? `pv-font-${id}` : ''}` }, 'Аа 123')),
    h('button', { class: 'btn-ghost', onclick: () => { setUi({ felt: 'auto', rim: 'auto', face: 'auto', dbtn: 'auto', font: 'auto', slots: 'auto', pill: 'auto', bg: 'auto', timer: 'auto', hand: 'auto', emo: 'auto' }); render(); toast('Сброшено'); } }, 'Сбросить моё оформление'),
    h('div', { style: 'height:70px' }));
}

// ---------- Моя статистика ----------

async function openStats() {
  go('stats');
  const r = await run({ t: 'myStats' });
  if (r) { S.stats = r.stats; S.achPct = r.ach; render(); }
  const rec = await run({ t: 'serverRecords' });
  if (rec) { S.records = rec.records; render(); }
}

// маленький линейный график (SVG)
function lineGraph(pts, color = '#6fdc8c', H = 70) {
  if (!pts || pts.length < 2) return h('div', { class: 'small muted' }, 'Мало данных для графика');
  const W = 300, min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const xy = pts.map((v, i) => `${((i / (pts.length - 1)) * W).toFixed(1)},${(H - 4 - ((v - min) / span) * (H - 8)).toFixed(1)}`);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'stack-graph');
  svg.innerHTML = `<polyline points="${xy.join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>`;
  return svg;
}

function statsScreen() {
  const T = S.stats;
  if (!T) return h('div', { class: 'screen' }, header('Моя статистика'), h('div', { class: 'muted small' }, 'Загрузка…'));
  const sec = (title, ...body) => [h('div', { class: 'label' }, title), h('div', { class: 'glass card', style: 'gap:8px' }, ...body)];
  const sign = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${fmt(Math.abs(x))}`;
  const R = 'AKQJT98765432';
  const by = Object.fromEntries((T.classes || []).map((c) => [c.k, c]));
  const heat = [];
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) {
    const k = i === j ? R[i] + R[j] : i < j ? R[i] + R[j] + 's' : R[j] + R[i] + 'o';
    const c = by[k];
    const v = c ? Math.max(-1, Math.min(1, c.bb / 20)) : 0;
    const bg = !c ? 'rgba(255,255,255,0.05)' : v >= 0 ? `rgba(79,199,122,${0.25 + v * 0.75})` : `rgba(255,90,90,${0.25 - v * 0.75})`;
    heat.push(h('div', { class: 'ch-cell', style: `background:${bg};color:${c ? '#111' : 'rgba(255,255,255,0.35)'}`, title: c ? `${k}: ${c.n} раздач, ${c.bb} ББ` : k }, k));
  }
  const L = T.luck;
  const maxH = Math.max(1, ...T.byHour.map(Math.abs));
  const hand = (x) => h('div', { class: 'row between' }, h('div', { class: 'tut-cards' }, x.cards.map((c) => pcard(c, 'sm'))), h('div', { class: 'b', style: `color:${x.net >= 0 ? 'var(--green)' : '#ff8a80'}` }, sign(x.net)));
  const REC = S.records;
  return h('div', { class: 'screen' },
    header('Моя статистика'),
    h('div', { class: 'small soft' }, `Раздач в статистике: ${fmt(T.hands)} · в игре ${Math.floor(T.playMinutes / 60)} ч ${T.playMinutes % 60} мин`),
    sec('Стиль игры',
      h('div', { class: 'grid3' }, stat('VPIP', `${T.vpip}%`), stat('PFR', `${T.pfr}%`), stat('Вскрытия', `${T.sdPct}%`)),
      h('div', { class: 'small muted', style: 'line-height:1.45' }, 'VPIP — в скольких раздачах ты вкладываешь фишки до флопа. PFR — как часто повышаешь до флопа. Хороший игрок: VPIP 20–30%, PFR чуть меньше.'),
      h('div', { class: 'grid3' }, stat('Победы на вскрытии', `${T.sdWin}%`), stat('Блефов', T.bluff.n), stat('Удачных блефов', T.bluff.n ? `${Math.round((T.bluff.won / T.bluff.n) * 100)}%` : '—'))),
    sec('Агрессия по улицам', ...T.aggression.map((a) => h('div', { class: 'row between' }, h('div', {}, a.name), h('div', { class: 'small soft' }, `рейзов ${a.raises} · коллов ${a.calls} · AF ${a.af}`)))),
    sec('Тепловая карта рук (итог в ББ)', h('div', { class: 'chart-grid' }, heat), h('div', { class: 'small muted' }, 'Зелёный — руки в плюс, красный — в минус. Сверху — одномастные (s), снизу — разномастные (o).')),
    T.topHands.length > 0 && sec('Лучшие стартовые руки', ...T.topHands.map((c) => h('div', { class: 'row between' }, h('div', { class: 'b' }, c.k), h('div', { class: 'small soft' }, `${c.n} раздач · ${sign(c.bb)} ББ`)))),
    T.worstHands.length > 0 && sec('Худшие стартовые руки', ...T.worstHands.map((c) => h('div', { class: 'row between' }, h('div', { class: 'b' }, c.k), h('div', { class: 'small soft' }, `${c.n} раздач · ${sign(c.bb)} ББ`)))),
    T.byPos.length > 0 && sec('Итог по позициям (ББ)', ...T.byPos.map((p) => h('div', { class: 'row between' }, h('div', {}, p.name), h('div', { class: 'small soft' }, `${p.n} раздач · ${sign(p.bb)}`)))),
    sec('Лучшие и худшие раздачи', ...T.best.map(hand), ...T.worst.map(hand),
      T.costlyFold && h('div', { class: 'small soft' }, `💸 Самый дорогой фолд: ${fmt(T.costlyFold.amount)} фишек`),
      T.bestCall && h('div', { class: 'small soft' }, `🎯 Лучший колл на ривере: ${fmt(T.bestCall.amount)} фишек — и выиграл`)),
    sec('Удача в олл-инах',
      L.allins ? [h('div', { class: 'grid3' }, stat('Олл-инов', L.allins), stat('Ожидалось побед', L.expected), stat('Выиграно', L.actual)),
        h('div', { class: 'small soft' }, L.actual >= L.expected ? `🍀 Тебе везёт: на ${Math.round((L.actual - L.expected) * 10) / 10} побед больше расчёта` : `😬 Не везёт: на ${Math.round((L.expected - L.actual) * 10) / 10} побед меньше расчёта`),
        h('div', { class: 'small muted' }, `Ауты зашли (выиграл, будучи позади): ${L.suckouts} · «бэд-биты» (проиграл, будучи впереди): ${L.badBeats}`)]
        : h('div', { class: 'small muted' }, 'Олл-инов со вскрытием пока не было')),
    sec('График Эло за 30 дней', lineGraph(T.elo, '#8fb8ff')),
    sec('Итог по времени суток (ББ, по Москве)',
      h('div', { class: 'hour-bars' }, T.byHour.map((v, i) => h('div', { class: 'hour-col', title: `${i}:00 — ${v} ББ, раздач ${T.byHourN[i]}` },
        h('div', { class: `hour-bar ${v >= 0 ? 'up' : 'down'}`, style: `height:${Math.round((Math.abs(v) / maxH) * 40)}px` }),
        i % 6 === 0 && h('div', { class: 'small muted', style: 'font-size:9px' }, i))))),
    sec(`Турниры · ROI ${T.roi == null ? '—' : `${T.roi}%`}`,
      T.tours.length ? T.tours.slice(0, 10).map((t) => h('div', { class: 'row between' }, h('div', { class: 'small' }, `${t.name} · ${t.place}/${t.size}`), h('div', { class: 'small soft' }, t.prize ? `+${fmt(t.prize)}` : '—')))
        : h('div', { class: 'small muted' }, 'Турниров пока не было'),
      h('div', { class: 'small muted' }, 'ROI — сколько процентов от взносов ты в среднем возвращаешь сверху.')),
    T.vs.length > 0 && sec('Против живых игроков', ...T.vs.map((v) => h('div', { class: 'row between' }, h('div', {}, v.name), h('div', { class: 'small soft' }, `раздач ${v.hands} · твоих побед ${v.won}${v.net ? ` · 1 на 1 ${sign(v.net)}` : ''}`)))),
    REC && sec('Рекорды сервера',
      REC.pot && h('div', { class: 'small' }, `💰 Самый большой банк: ${fmt(REC.pot.v)} — ${REC.pot.name}`),
      REC.hands && h('div', { class: 'small' }, `🏆 Больше всех раздач: ${fmt(REC.hands.v)} — ${REC.hands.name}`),
      REC.rating && h('div', { class: 'small' }, `📈 Лучшее Эло: ${fmt(REC.rating.v)} — ${REC.rating.name}`),
      REC.tours && h('div', { class: 'small' }, `🥇 Больше всех побед в турнирах: ${fmt(REC.tours.v)} — ${REC.tours.name}`),
      REC.hand?.v > 0 && h('div', { class: 'small' }, `🔥 Самый крупный выигрыш за раздачу: ${fmt(REC.hand.v)} — ${REC.hand.name}`)),
    h('button', { class: 'btn-ghost', onclick: exportStats }, '⬇️ Скачать историю раздач (CSV)'),
    h('div', { style: 'height:70px' }));
}

// 73 экспорт: CSV-файл; если скачивание недоступно — копируем в буфер
async function exportStats() {
  const r = await run({ t: 'exportStats' });
  if (!r) return;
  const head = 'время;позиция;рука;итог;большой блайнд;выиграл;вскрытие;стол';
  const csv = [head, ...r.rows.map((x) => [new Date(x.at).toLocaleString('ru'), x.pos || '', x.hand || '', x.net, x.bb, x.won ? 'да' : 'нет', x.sd ? 'да' : 'нет', x.kind].join(';'))].join('\n');
  try {
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })), download: 'poker-history.csv' });
    document.body.append(a); a.click(); a.remove();
    toast('Файл скачивается');
  } catch {
    navigator.clipboard?.writeText(csv).then(() => toast('Скопировано в буфер'));
  }
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
  const rId = (startParam?.startsWith('rp_') && startParam.slice(3)) || (hash.startsWith('r=') && hash.slice(2));
  if (rId) return openReplay(rId);
  if (hash === 'tournaments') return go('tours');
  if (hash === 'wallet') return go('wallet');
  if (hash === 'profile') return go('profile');
  if (hash === 'progress') return go('progress');
  if (hash === 'stats') return openStats();
  go('lobby');
}

tg?.BackButton.onClick(() => back());
window.addEventListener('hashchange', () => S.me && openStart(null));
function back() {
  if (S.screen === 'combos') return go(S.comboBack || 'lobby');
  if (S.screen === 'style' && S.table) return go('table'); // из оформления — обратно за стол
  if (S.screen === 'table' && S.table?.watching) return stopWatching();
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
    item('lobby', 'home', 'Лобби'), item('tours', 'trophy', 'Турниры'), item('progress', 'gift', 'Награды'),
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

// Настройки игры: звук и свои размеры ставок (на этом устройстве)
function coachOn() {
  try { return localStorage.getItem('coach') === 'on'; } catch { return false; }
}

function settingsCard() {
  const presets = loadPresets();
  return h('div', { class: 'col', style: 'gap:10px' },
    h('div', { class: 'label' }, 'Настройки'),
    h('label', { class: 'toggle-row glass', style: 'padding:12px 14px;border-radius:14px' },
      h('input', { type: 'checkbox', checked: soundOn(), onchange: (e) => { try { localStorage.setItem('sound', e.target.checked ? 'on' : 'off'); } catch {} if (e.target.checked) sfx('win'); } }),
    // напоминания в Telegram (бонус дня)
    h('label', { class: 'toggle-row glass', style: 'padding:12px 14px;border-radius:14px' },
      h('input', { type: 'checkbox', checked: S.me.remind !== false, onchange: async (e) => { await run({ t: 'setRemind', on: e.target.checked }); S.me.remind = e.target.checked; } }),
      h('span', {}, 'Напоминания в Telegram'), h('span', { class: 'small muted' }, 'бонус дня и турниры')),
    h('button', { class: 'item', onclick: openStats }, h('div', { class: 'col' }, h('div', { class: 'b', style: 'font-size:14px' }, '📊 Моя статистика'), h('div', { class: 'small muted' }, 'VPIP, позиции, тепловая карта рук, удача, турниры, Эло')), icon('chev')),
    h('button', { class: 'item', onclick: openHistory }, h('div', { class: 'col' }, h('div', { class: 'b', style: 'font-size:14px' }, 'История раздач'), h('div', { class: 'small muted' }, 'Все раздачи за сутки с повтором и разбором')), icon('chev')),
      h('span', {}, 'Звуки за столом')),
    h('label', { class: 'toggle-row glass', style: 'padding:12px 14px;border-radius:14px' },
      h('input', { type: 'checkbox', checked: coachOn(), onchange: (e) => { try { localStorage.setItem('coach', e.target.checked ? 'on' : 'off'); } catch {} send({ t: 'coach', on: e.target.checked }); } }),
      h('span', {}, 'Тренер'), h('span', { class: 'small muted' }, 'после раздачи подскажет, где ошибся')),
    h('div', { class: 'small soft' }, 'Кнопки ставок за столом (выбери 3):'),
    h('div', { class: 'choices' }, PRESET_OPTIONS.map((f) => h('button', { class: presets.includes(f) ? 'on' : '', onclick: () => togglePreset(f) }, presetLabel(f)))));
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
          h('div', { class: 'small muted' }, me.rank && h('b', { style: `color:${me.rank.color}` }, `${me.rank.name} `), `Эло ${me.rating} · место ${fmt(me.ratingPlace)} · раздач выиграно ${fmt(me.handsWon || 0)}`))),
      balancePill()),
    // первый запуск: спросить, нужно ли обучение
    S.askTutorial && h('div', { class: 'glass card', style: 'gap:10px' },
      h('div', { class: 'b', style: 'font-size:16px' }, 'Ты умеешь играть в покер?'),
      h('div', { class: 'small soft', style: 'line-height:1.45' }, 'Если нет — за пару минут объясним правила: карты, ставки, комбинации и как пользоваться приложением.'),
      h('div', { class: 'grid2' },
        h('button', { class: 'btn-ghost', onclick: () => { markTutorialAsked(); render(); } }, 'Умею'),
        h('button', { class: 'btn', style: 'height:46px;font-size:14px', onclick: () => openTutorial(0) }, 'Научи меня'))),
    // ивент (x2 награды / опыт)
    S.lobby?.event && h('div', { class: 'glass card event-banner' },
      h('div', { class: 'b' }, `🎉 ${S.lobby.event.title}`),
      h('div', { class: 'small soft' }, `до ${new Date(S.lobby.event.until).toLocaleString('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`)),
    // друг зовёт за стол
    S.friendInvite && h('div', { class: 'glass card', style: 'border-color:rgba(127,209,168,0.6)' },
      h('div', { class: 'row between' }, h('div', { class: 'b' }, `${S.friendInvite.from} зовёт ${S.friendInvite.duel ? `на дуэль (${S.friendInvite.duel} раздач)` : 'за стол'}`),
        h('button', { class: 'hint-x', 'aria-label': 'Закрыть', onclick: () => { S.friendInvite = null; render(); } }, '✕')),
      h('button', { class: 'btn', onclick: () => { const id = S.friendInvite.mixedId; S.friendInvite = null; openMixed(id); } }, 'Посмотреть стол')),
    // итог последнего стола
    S.summary && h('div', { class: 'glass card summary' },
      h('div', { class: 'row between' }, h('div', { class: 'b' }, S.summary.title),
        h('button', { class: 'hint-x', 'aria-label': 'Закрыть итог', onclick: () => { S.summary = null; render(); } }, '✕')),
      h('div', { class: 'grid3' },
        stat('Раздач', fmt(S.summary.hands || 0)), stat('Выиграно', fmt(S.summary.won || 0)),
        S.summary.net != null ? stat('Итог', `${S.summary.net >= 0 ? '+' : '−'}${fmt(Math.abs(S.summary.net))}`) : stat('Минут', S.summary.minutes ?? '—')),
      S.summary.graph && stackGraph(S.summary.graph),
      S.summary.net != null && h('button', { class: 'btn-sm', onclick: () => shareCard({ title: 'Итог сессии', subtitle: `${S.summary.net >= 0 ? '+' : '−'}${fmt(Math.abs(S.summary.net))} фишек · раздач ${S.summary.hands || 0}`, cards: [], board: [], footer: 'Покер в Telegram' }, `Мой итог за сессию: ${S.summary.net >= 0 ? '+' : '−'}${fmt(Math.abs(S.summary.net))} фишек! Го играть:`) }, '📤 Поделиться итогом'),
      S.summary.stack > 0 && h('div', { class: 'small soft' }, `На баланс вернулось ${fmt(S.summary.stack)} фишек${S.summary.minutes ? ` · ${S.summary.minutes} мин за столом` : ''}`)),
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
    h('button', { class: 'item', onclick: () => go('friends') },
      h('div', { class: 'col' }, h('div', { class: 'b', style: 'font-size:14px' }, 'Друзья и клуб'), h('div', { class: 'small muted' }, 'Смотреть игру друзей, дуэли, подарки, клубные турниры')),
      icon('chev')),
    h('button', { class: 'item', onclick: () => openTutorial(0) },
      h('div', { class: 'col' }, h('div', { class: 'b', style: 'font-size:14px' }, 'Как играть'), h('div', { class: 'small muted' }, 'Правила покера с нуля — простыми словами')),
      icon('chev')),
    h('button', { class: 'item', onclick: openSchool },
      h('div', { class: 'col' }, h('div', { class: 'b', style: 'font-size:14px' }, 'Школа покера'), h('div', { class: 'small muted' }, 'Таблица рук, викторина, экзамен, твои слабые места')),
      icon('chev')),
    h('button', { class: 'item', onclick: openBotLab },
      h('div', { class: 'col' }, h('div', { class: 'b', style: 'font-size:14px' }, 'Мастерская ботов'), h('div', { class: 'small muted' }, 'Свой бот, бот-заменитель, шоу ботов')),
      icon('chev')),
    h('button', { class: 'item', onclick: () => openTraining(0) },
      h('div', { class: 'col' }, h('div', { class: 'b', style: 'font-size:14px' }, 'Тренировка'), h('div', { class: 'small muted' }, 'Раздачи против бота-учителя с подсказками')),
      icon('chev')),
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

// твоя статистика против бота: выиграно раздач и итог в фишках
function vsLine(name) {
  const v = S.botsInfo?.vs?.[name];
  if (!v?.hands) return null;
  return h('div', { class: 'small muted', style: 'font-size:10.5px;white-space:nowrap' },
    `ты: ${v.wins}/${v.hands}${v.net ? ` · ${v.net > 0 ? '+' : '−'}${fmt(Math.abs(v.net))}` : ''}`);
}

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
        h('button', { class: S.botMode === '9' ? 'on' : '', onclick: () => { S.botMode = '9'; render(); } }, 'Стол на 9')),
      h('div', { class: 'seg', style: 'margin-top:6px' },
        h('button', { class: S.botMode === 'rush' ? 'on' : '', onclick: () => { S.botMode = 'rush'; render(); } }, 'Босс-раш'),
        h('button', { class: S.botMode === 'mixed' ? 'on' : '', onclick: () => { S.botMode = 'mixed'; render(); } }, 'С друзьями')),
      h('div', { class: 'seg', style: 'margin-top:6px' },
        h('button', { class: S.botMode === 'mega' ? 'on' : '', onclick: () => { S.botMode = 'mega'; render(); } }, 'Огромный стол · 101')),
      h('div', { class: 'seg', style: 'margin-top:6px' },
        h('button', { class: S.botMode === 'ladder' ? 'on' : '', onclick: () => { S.botMode = 'ladder'; render(); } }, 'Лестница'),
        h('button', { class: S.botMode === 'team' ? 'on' : '', onclick: () => { S.botMode = 'team'; render(); } }, 'Команда 2 на 2')),
      S.botMode === 'ladder' && h('div', { class: 'small soft', style: 'line-height:1.45' },
        `12 ступеней 1 на 1: от слабых ботов до Короля. Обыграл — следующая ступень и +200 фишек за каждую новую. Проиграл стек — ступень сохраняется, приходи снова. Сейчас ты на ступени ${(S.botsInfo?.ladder?.step ?? 0) + 1}${S.botsInfo?.ladder?.steps ? `: ${S.botsInfo.ladder.steps[S.botsInfo.ladder.step || 0]}` : ''}.`),
      S.botMode === 'team' && h('div', { class: 'small soft', style: 'line-height:1.45' },
        'Ты и бот-напарник Профессор против Акулы и Охотника. Напарник сидит напротив. Выбили обоих соперников — команда победила, редкий сундук. Выбыл ты — команда проиграла.'),
      S.botMode === 'mega' && h('div', { class: 'small soft', style: 'line-height:1.45' },
        'Ты и 100 ботов за одним столом. Играют сразу 6 колод — карты могут повторяться, бывает даже пять одинаковых (считается как каре). Боты ходят почти мгновенно. Проигравшие боты выбывают. Подсказок здесь нет.'),
      S.botMode === 'rush' && h('div', { class: 'small soft', style: 'line-height:1.45' },
        'Шесть сильнейших по очереди: Скала → Маньяк → Хамелеон → Акула → Охотник → Король. Обыграл одного — садится следующий, твой стек сохраняется. Проиграл стек — забег окончен, докупки нет. Прошёл всех — фишки ×3 от бай-ина и эпический сундук.'),
      // варианты игры
      h('label', { class: 'toggle-row', style: 'margin-top:8px' },
        h('input', { type: 'checkbox', checked: !!S.shortDeck, onchange: (e) => { S.shortDeck = e.target.checked; } }),
        h('span', {}, 'Short Deck'), h('span', { class: 'small muted' }, 'без 2–5, флеш старше фулл-хауса')),
      S.botMode !== 'mixed' && h('label', { class: 'toggle-row' },
        h('input', { type: 'checkbox', checked: !!S.chaos, onchange: (e) => { S.chaos = e.target.checked; } }),
        h('span', {}, 'Хаос'), h('span', { class: 'small muted' }, 'случайное событие каждую раздачу')),
      S.botMode !== 'mixed' && h('label', { class: 'toggle-row' },
        h('input', { type: 'checkbox', checked: !!S.jokers, onchange: (e) => { S.jokers = e.target.checked; } }),
        h('span', {}, 'Джокеры'), h('span', { class: 'small muted' }, 'два джокера в колоде, заменяют любую карту')),
      ['6', '9'].includes(S.botMode) && h('label', { class: 'toggle-row' },
        h('input', { type: 'checkbox', checked: !!S.marathon, onchange: (e) => { S.marathon = e.target.checked; } }),
        h('span', {}, 'Марафон'), h('span', { class: 'small muted' }, '1000 раздач, в конце итог и сундук')),
      !['mixed', 'ladder', 'rush'].includes(S.botMode) && h('div', { class: 'col', style: 'gap:4px;margin-top:6px' },
        h('label', { class: 'toggle-row' }, h('input', { type: 'checkbox', checked: !!S.autoTopUp, onchange: (e) => { S.autoTopUp = e.target.checked; } }), h('span', {}, 'Авто-докупка'), h('span', { class: 'small muted' }, 'стек меньше половины — долить до бай-ина')),
        h('label', { class: 'toggle-row' }, h('input', { type: 'checkbox', checked: !!loadUi().autoNext, onchange: (e) => setUi({ autoNext: e.target.checked }) }), h('span', {}, 'Следующий стол сам'), h('span', { class: 'small muted' }, 'обыграл всех — сразу новый стол')),
        h('div', { class: 'small muted' }, 'Авто-стоп: встать, если проиграл'),
        h('div', { class: 'choices' }, [[0, 'Выкл'], [0.5, 'половину'], [0.75, '¾ бай-ина']].map(([v, l]) => h('button', { class: (S.stopLoss || 0) === v ? 'on' : '', onclick: () => { S.stopLoss = v; render(); } }, l))))),
    S.botMode === 'mixed' && h('div', { class: 'field' },
      h('div', { class: 'label' }, 'Мест за столом'),
      h('div', { class: 'choices' }, [6, 9].map((n) => h('button', { class: (S.mixedSeats || 6) === n ? 'on' : '', onclick: () => { S.mixedSeats = n; S.mixedBots = Math.min(S.mixedBots ?? 2, n - 2); render(); } }, n))),
      h('div', { class: 'label' }, 'Ботов за столом'),
      h('div', { class: 'choices' }, Array.from({ length: (S.mixedSeats || 6) - 1 }, (_, n) => n).map((n) =>
        h('button', { class: (S.mixedBots ?? 2) === n ? 'on' : '', onclick: () => { S.mixedBots = n; render(); } }, n))),
      h('input', { class: 'buyin-input', type: 'text', maxlength: 20, placeholder: 'Пароль стола (необязательно)', 'aria-label': 'Пароль стола', value: S.mixedPass || '', id: 'mixed-pass', oninput: (e) => { S.mixedPass = e.target.value; } }),
      h('div', { class: 'small muted', style: 'line-height:1.45' },
        'Создаёшь стол и зовёшь друзей по ссылке — каждый садится со своими фишками. Боты занимают свободные места (всего до 6). Встать можно в любой момент.')),
    !['mixed', 'mega', 'ladder', 'team'].includes(S.botMode) && h('div', { class: 'field' },
      h('div', { class: 'label' }, S.botMode === 'hu' ? 'Соперник' : 'За столом все пятеро (Король — только 1 на 1)'),
      Object.entries(BOT_INFO).map(([name, info]) => h('button', {
        class: `bot ${info.boss ? 'boss' : ''} ${S.botMode === 'hu' && S.botName === name ? 'on' : ''}`,
        onclick: () => { S.botName = name; S.botMode = 'hu'; render(); },
      },
      h('div', { class: 'letter' }, name[0]),
      h('div', { class: 'col', style: 'flex:1' }, h('div', { class: 'b', style: 'font-size:15px' }, name), h('div', { class: 'small soft' }, info.text)),
      h('div', { class: 'col', style: 'align-items:flex-end' },
        h('div', { class: 'small muted', style: 'font-size:11px' }, 'агрессия'),
        h('div', { class: 'meter' }, h('div', { style: `width:${info.aggr}%` })),
        vsLine(name)))),
      // боссы: Король, Мафия, Робот, Шейх и Тень, которая растёт вместе с тобой
      S.botMode !== '6' && (S.botsInfo?.bosses || []).length > 0 && h('div', { class: 'label', style: 'padding-top:6px' }, 'Боссы — только 1 на 1'),
      S.botMode !== '6' && (S.botsInfo?.bosses || []).map((b) => h('button', {
        class: `bot boss ${S.botMode === 'hu' && S.botName === b.name ? 'on' : ''}`,
        onclick: () => { S.botName = b.name; S.botMode = 'hu'; render(); },
      },
      h('div', { class: 'letter' }, b.name[0]),
      h('div', { class: 'col', style: 'flex:1' }, h('div', { class: 'b', style: 'font-size:15px' }, b.name), h('div', { class: 'small soft' }, b.style)),
      h('div', { class: 'col', style: 'align-items:flex-end' },
        h('div', { class: 'b', style: 'font-size:13px;color:#f7dd8a' }, `${fmt(b.elo)} Эло`),
        vsLine(b.name)))),
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
        ? `Стол на ${S.botMinutes} минут: когда время выйдет, стек вернётся на баланс. Встать можно и раньше.`
        : 'Встать можно в любой момент — стек сразу вернётся на баланс.'),
      // быстрый стол: боты думают меньше, паузы короче
      h('label', { class: 'toggle-row' },
        h('input', { type: 'checkbox', checked: !!S.botFast, onchange: (e) => { S.botFast = e.target.checked; } }),
        h('span', {}, 'Быстрый стол'), h('span', { class: 'small muted' }, 'боты ходят почти сразу'))),
    S.botMode !== 'mixed' && h('div', { class: 'field' },
      h('div', { class: 'label' }, 'Сложность ботов'),
      h('div', { class: 'seg' }, [['easy', 'Лёгкий'], ['normal', 'Нормальный'], ['master', 'Мастер']].map(([k, label]) => h('button', {
        class: (S.botLevel || 'normal') === k ? 'on' : '', onclick: () => { S.botLevel = k; render(); },
      }, label))),
      h('div', { class: 'small muted' }, 'Лёгкий — больше ошибок, меньше Эло за победу. Мастер — сильнее и Эло больше.')),
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
  const r = await run({ t: 'createMixed', buyin: S.buyin, bots: S.mixedBots ?? 2, seats: S.mixedSeats || 6, password: (S.mixedPass || '').trim() || null, variant: S.shortDeck ? 'short' : null });
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
      ? h('div', { class: 'col', style: 'gap:8px' },
        r.private && h('input', { class: 'buyin-input', type: 'text', placeholder: '🔒 Пароль стола', 'aria-label': 'Пароль стола', id: 'join-pass', value: S.joinPass || '', oninput: (e) => { S.joinPass = e.target.value; } }),
        h('button', { class: 'btn', onclick: async () => { if (await run({ t: 'joinMixed', id: r.id, password: (S.joinPass || '').trim() || null })) go('table'); } }, `Сесть · бай-ин ${fmt(r.buyin)}`))
      : h('button', { class: 'btn', onclick: () => go('wallet') }, `Пополнить — бай-ин ${fmt(r.buyin)}`));
}

async function sitBots() {
  S.lastSit = { mode: S.botMode, botName: S.botName, buyin: S.buyin, minutes: S.botMinutes };
  const r = await run({ t: 'sitBots', mode: S.botMode, botName: S.botName, buyin: S.buyin, minutes: S.botMinutes, fast: !!S.botFast, level: S.botLevel || 'normal', variant: S.shortDeck ? 'short' : null, chaos: !!S.chaos, jokers: !!S.jokers, marathon: ['6', '9'].includes(S.botMode) && !!S.marathon, stopLoss: S.stopLoss || 0, autoTopUp: !!S.autoTopUp });
  if (r) go('table');
}

async function sitDemo() {
  const r = await run({ t: 'sitDemo', mode: S.botMode, botName: S.botName });
  if (r) go('table');
}

// ---------- Демо-стол: выбор карт на следующую раздачу (только админ) ----------

const cardText = (c) => c >= 52 ? '🃏' : (RANKS[c >> 2] === 'T' ? '10' : RANKS[c >> 2]) + SUITS[c & 3];

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
function pcard(c, size = '', extra = '') {
  if (c == null) return h('div', { class: `pcard back ${size} ${extra}` });
  if (c >= 52) return h('div', { class: `pcard joker ${size} ${extra}`, 'aria-label': 'Джокер' }, h('div', { class: 'r' }, 'J★'), h('div', { class: 's' }, '🃏'));
  const red = (c & 3) === 1 || (c & 3) === 2;
  const r = RANKS[c >> 2] === 'T' ? '10' : RANKS[c >> 2];
  return h('div', { class: `pcard ${size} ${red ? 'red' : ''} s${c & 3} ${extra}`, 'aria-label': r + SUITS[c & 3] },
    h('div', { class: 'r' }, r), h('div', { class: 's' }, SUITS[c & 3]));
}

// места вокруг стола (в % от области стола); я всегда снизу
const SPOTS = {
  bottom: [50, 99], bl: [18, 64], tl: [18, 26], top: [50, 8], tr: [82, 26], br: [82, 64],
  // стол на 9
  l9: [14, 46], tl9: [20, 18], tc9l: [36, 6], tc9r: [64, 6], tr9: [80, 18], r9: [86, 46], bl9: [16, 72], br9: [84, 72],
};
const LAYOUT = {
  1: ['top'], 2: ['tl', 'tr'], 3: ['tl', 'top', 'tr'], 4: ['bl', 'tl', 'tr', 'br'], 5: ['bl', 'tl', 'top', 'tr', 'br'],
  6: ['bl9', 'l9', 'tc9l', 'tc9r', 'r9', 'br9'], 7: ['bl9', 'l9', 'tl9', 'top', 'tr9', 'r9', 'br9'], 8: ['bl9', 'l9', 'tl9', 'tc9l', 'tc9r', 'tr9', 'r9', 'br9'],
};

// Место за огромным столом: кружок с именем и стеком по овалу (снизу — ты)
function megaSeat(s, i, n, T) {
  const a = (115 + (i + 0.5) * (310 / n)) * Math.PI / 180; // от низа-слева по часовой до низа-справа
  const x = 50 + 46 * Math.cos(a), y = 50 + 46 * Math.sin(a);
  // ставка — внутри стола, на той же линии к центру
  const bx = 50 + 34 * Math.cos(a), by = 50 + 36 * Math.sin(a);
  const bet = s.bet > 0 && h('div', { class: 'mbet', style: `left:${bx}%;top:${by}%` }, fmtShort(s.bet));
  const won = !T.inHand && T.result?.some((w) => w.id === s.id);
  // при 100 местах подписаны только те, кто сейчас важен: ходит, поставил, ещё в игре после флопа, выиграл
  const shown = n <= 45 || T.actor === s.id || s.bet > 0 || won || s.cards || (T.board.length > 0 && s.inHand && !s.folded);
  if (!shown) {
    return [h('div', { class: `mdot ${s.folded || !s.inHand ? 'out' : ''}`, style: `left:${x}%;top:${y}%`, 'aria-label': `${s.name}, ${fmt(s.stack)}`,
      onclick: () => run({ t: 'playerCard', id: s.id }) }), bet];
  }
  return [bet, h('div', {
    class: `mseat ${T.actor === s.id ? 'turn' : ''} ${s.folded || !s.inHand ? 'out' : ''} ${won ? 'win' : ''}`,
    style: `left:${x}%;top:${y}%`, 'aria-label': `${s.name}, ${fmt(s.stack)}`,
  },
    h('div', { class: 'mnm' }, s.name.slice(0, 7)),
    h('div', { class: 'mst' }, s.allIn ? 'олл-ин' : fmtShort(s.stack)),
    T.buttonId === s.id && h('div', { class: 'mdealer' }, 'D'),
    s.cards && h('div', { class: 'mcards' }, s.cards.map(cardText).join(' ')))];
}

function clampRaise(x, t) {
  return Math.round(Math.max(t.minRaiseTo, Math.min(t.maxTo, x)));
}

function tableScreen() {
  const T = S.table;
  if (!T) {
    return h('div', { class: 'screen' }, header('Стол'), h('div', { class: 'center-msg' }, h('div', { class: 'muted' }, 'Загружаем стол…')));
  }
  // зритель: друг, за которым смотришь, — внизу
  const meIdx = T.watching ? T.seats.findIndex((s) => s.id === T.focus) : T.seats.findIndex((s) => s.me);
  const ordered = meIdx >= 0 ? [...T.seats.slice(meIdx), ...T.seats.slice(0, meIdx)] : T.seats;
  const mySeat = meIdx >= 0 && !T.watching ? T.seats[meIdx] : null;
  // зритель: нижнее место занимает первый игрок, остальные — по кругу
  const bottomSeat = mySeat ? null : ordered[0];
  const others = ordered.slice(1);
  const spots = LAYOUT[Math.min(others.length, 8)] || [];
  const mega = others.length > 8; // огромный стол: маленькие места по овалу
  const nine = others.length > 5; // стол на 9 — компактнее
  const myTurn = S.turn && T.actor === S.me.id && S.turn.tableId === T.id;

  // выигрышные 5 карт подсвечиваем, раздаём карты с анимацией
  const win = T.result && T.winCards?.length ? new Set(T.winCards) : null;
  const dealing = S.dealPending ? 'deal' : '';
  S.dealPending = false;
  const hl = (c) => (win ? (win.has(c) ? 'hl' : 'dim') : '');
  const seatEl = (s, spot) => {
    const [x, y] = SPOTS[spot];
    const top = y < 50;
    const cards = s.me
      ? (s.cards ? s.cards.map((c) => pcard(c, 'lg', `${hl(c)} ${dealing} ${s.myHandCat >= 3 && T.inHand ? 'strong' : ''}`)) : [])
      : s.cards ? s.cards.map((c) => pcard(c, 'sm', hl(c))) : s.inHand && T.inHand ? [pcard(null, 'sm', dealing), pcard(null, 'sm', dealing)] : [];
    const won = !T.inHand && T.result?.some((w) => w.id === s.id);
    const plate = h('div', {
      'data-seat': s.id, class: `plate ${s.tag ? `tag-${s.tag}` : ''} ${s.look?.plate ? `plate-${s.look.plate}` : ''} ${T.actor === s.id ? 'turn' : ''} ${s.folded || s.away ? 'out' : ''} ${won ? 'win' : ''}`,
      role: 'button', 'aria-label': `Карточка игрока ${s.me ? 'ты' : s.name}`, onclick: () => run({ t: 'playerCard', id: s.id }),
    },
      seatAvatar(s),
      h('div', { class: 'col', style: 'gap:0;min-width:0' },
        // ник окрашен цветом ранга
        h('div', { class: `nm ${s.look?.nameFx ? `nfx-${s.look.nameFx}` : ''}`, style: s.look?.rankColor ? `color:${s.look.rankColor}` : null }, s.team ? (s.team === 'A' ? '🔵 ' : '🔴 ') : '', s.cheat ? '👁 ' : '', s.tilt ? '😤 ' : '', s.me ? 'Ты' : s.name),
        // стек и рядом значок выигранных раздач (у людей и у ботов) — внутри таблички, ничего не закрывает
        h('div', { class: 'st' }, s.allIn ? 'олл-ин' : fmt(s.stack),
          s.handsWon > 0 && h('span', { class: 'wins-badge', title: 'Выиграно раздач', 'aria-label': `Выиграно раздач: ${s.handsWon}` },
            icon('trophy', 9), fmtShort(s.handsWon)),
          // серия побед подряд
          s.streak >= 2 && h('span', { class: 'streak-badge', title: 'Серия побед', 'aria-label': `Серия побед: ${s.streak}` }, `🔥${s.streak}`))),
      // эмодзи над игроком
      s.emote && h('div', { class: 'emote-bubble', 'aria-label': `Эмодзи ${s.emote}` }, s.emote),
      // фраза бота
      s.say && h('div', { class: 'say-bubble' }, s.say),
      // шансы при олл-ине
      s.equity != null && h('div', { class: 'equity-chip' }, `${s.equity}%`));
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
              h('button', { class: 'emote-btn', 'aria-label': 'Эмодзи', onclick: () => { S.emoteOpen = !S.emoteOpen; render(); } }, '😊'),
              (s.hand || s.myHand) && h('button', { class: 'my-hand', onclick: openCombos, 'aria-label': 'Моя комбинация — открыть справочник' },
                s.hand || s.myHand,
                // ауты: сколько карт улучшат твою руку
                !s.hand && s.outs?.length > 0 && h('span', { class: 'outs' }, ` · аутов ${s.outs.length}`))),
            timer]
          : [extras, h('div', { class: 'cards' }, cards), plate, s.hand && h('div', { class: 'hand-name' }, s.hand), timer]);
  };

  const board = [];
  for (let i = 0; i < 5; i++) board.push(T.board[i] != null ? pcard(T.board[i], '', hl(T.board[i])) : h('div', { class: 'pcard empty' }));

  const info = T.kind === 'tour'
    ? [T.title, h('br'), `Уровень ${T.level} · ${T.sb}/${T.bb} · осталось ${T.alive} из ${T.total}`]
    : T.endsAt ? [T.title, h('br'), h('span', { class: 'ends', 'data-ends': T.endsAt }, `осталось ${clockLeft(T.endsAt)}`)]
    : T.kind === 'mixed' ? [T.title, h('br'),
      T.invite ? h('button', { class: 'invite-pill', onclick: () => shareMixed(T.invite) }, `Позвать друзей · мест ${T.seatsFree}`) : `мест свободно: ${T.seatsFree}`]
    : [T.title];
  // время сессии и раздачи — обновляется каждую секунду
  const sessionLine = S.session && h('div', { class: 'session-line', 'data-session': '1' }, sessionText());
  // за столами с людьми правило про подсказки видно всем
  const hintRule = T.kind === 'mixed' || (T.kind === 'tour' && !T.solo)
    ? h('div', { class: 'hint-rule' }, 'Здесь работают подсказки — они видят карты') : null;

  const elo = !T.inHand && T.eloDelta ? Math.round(T.eloDelta) || (T.eloDelta > 0 ? 1 : -1) : 0;
  const myWin = T.result?.find((w) => w.id === S.me.id);
  const result = !T.inHand && T.result
    ? h('div', { class: 'result' },
      T.result.map((w) => `${w.id === S.me.id ? 'Ты забираешь' : `${w.name} забирает`} ${fmt(w.amount)}${w.hand ? ` · ${w.hand}` : ''}`).join(', '),
      elo ? h('span', { class: `elo ${elo > 0 ? 'up' : 'down'}` }, ` Эло ${elo > 0 ? '+' : '−'}${Math.abs(elo)}`) : null,
      // поделиться выигрышем
      myWin && !T.watching && h('button', {
        class: 'share-btn', 'aria-label': 'Поделиться раздачей',
        onclick: () => shareCard({
          title: 'Я выиграл банк!', subtitle: `${myWin.hand ? `${myWin.hand} · ` : ''}+${fmt(myWin.amount)} фишек`,
          cards: mySeat?.cards || [], board: T.board, footer: 'Покер в Telegram',
        }, `Выиграл ${fmt(myWin.amount)} фишек${myWin.hand ? ` с рукой «${myWin.hand}»` : ''}! Го играть:`),
      }, '📤'))
    : null;

  const adminDock = S.me.isAdmin && (T.kind === 'bots' || T.solo);
  return h('div', { class: `table-screen ${adminDock ? 'with-admin' : ''} ${nine ? 'nine' : ''} ${mega ? 'mega' : ''}` },
    // режим стрима: водяной знак для записи
    h('div', { class: 'stream-mark', 'aria-hidden': 'true' }, '♠ Покер в Telegram · @pokergamebetbot'),
    h('div', { class: 'table-top' },
      h('button', { class: 'icon-btn', 'aria-label': T.kind === 'tour' ? 'В лобби' : 'Встать из-за стола', onclick: back }, icon('back', 18)),
      h('div', { class: 'title' }, info,
        // Хаос / босс-раш — строкой в шапке, чтобы не закрывать игроков
        (T.chaos || T.rush) && h('div', { class: 'mode-line' }, T.rush ? `Босс ${T.rush.i} из ${T.rush.of}: ${T.rush.name}` : T.chaos),
        T.show && h('div', { class: 'mode-line' }, T.show.bet ? `Ставка ${fmt(T.show.bet)} на ${T.show.pick} · выигрыш ${fmt(T.show.win)}` : 'Шоу ботов — просто смотри'),
        loadUi().subs && S.subs?.length > 0 && h('div', { class: 'mode-line subs' }, S.subs.join(' · ')),
        T.ladder && h('div', { class: 'mode-line' }, `Ступень ${T.ladder.step} из ${T.ladder.of}: ${T.ladder.name}`),
        T.marathon && h('div', { class: 'mode-line' }, `Марафон: раздача ${Math.min(T.marathon.hand, T.marathon.of)} из ${T.marathon.of} · итог ${T.marathon.net >= 0 ? '+' : '−'}${fmt(Math.abs(T.marathon.net))}`),
        T.team && h('div', { class: 'mode-line' }, '🔵 твоя команда · 🔴 соперники'),
        T.seats.some((s) => s.cheat) && !T.inHand && !T.watching && h('button', { class: 'invite-pill', onclick: async () => { const r = await run({ t: 'expose' }); if (r) toast(r.text); } }, '🕵️ Разоблачить Шулера'),
        T.target && h('div', { class: 'mode-line' }, `🎯 Цель: ${T.target} — за неё двойная награда`),
        sessionLine),
      // подсказка — круглая кнопка в шапке, чтобы не закрывать игроков
      myTurn && !S.hint && !T.mega && h('button', { class: 'icon-btn hint-ico', 'aria-label': 'Подсказка', onclick: askHint },
        icon('bulb', 18), h('span', { class: 'hint-ico-count' }, T.demo ? '∞' : S.me.hints ? S.me.hints : '5⭐')),
      h('button', { class: 'icon-btn', 'aria-label': 'Быстрые настройки', onclick: () => { S.quickSet = !S.quickSet; render(); } }, '⚙️'),
      h('button', { class: 'icon-btn', 'aria-label': 'Справочник комбинаций', onclick: openCombos, style: 'font-weight:800;font-size:17px' }, '?')),
    S.quickSet && quickSettings(),
    h('div', { class: 'felt-wrap' },
      h('div', { class: 'felt' }),
      h('div', { class: 'center' },
        h('div', { class: 'pot-chips', id: 'pot-chips' }, !(T.result && !T.inHand) && chipStacks(T.pot - T.seats.reduce((a, x) => a + x.bet, 0), T.bb)),
        h('div', { class: 'pot' }, 'Банк ', h('b', {}, fmt(T.pot)),
          T.demo && T.plan?.board?.length ? h('span', { class: 'planned', style: 'margin-left:6px' }, T.plan.board.map(cardText).join(' ')) : null),
        h('div', { class: 'board', style: 'align-items:center' },
          T.demo && h('button', { class: 'pick-btn', 'aria-label': 'Выбрать карты стола', onclick: () => openPicker({ board: true }) }, '✎'),
          board)),
      mega ? others.map((s, i) => megaSeat(s, i, others.length, T)) : others.map((s, i) => spots[i] && seatEl(s, spots[i])),
      mySeat && seatEl(mySeat, 'bottom'),
      bottomSeat && seatEl(bottomSeat, 'bottom')),
    result,
    hintRule,

    myTurn && hintFloat(T),
    // низ экрана: кнопки админа (только в играх с ботами) над панелью хода
    h('div', { class: 'bottom-dock' },
      // режим одной рукой: кнопки шапки — над панелью хода, под большим пальцем
      loadUi().oneHand && h('div', { class: 'onehand-row' },
        myTurn && !S.hint && !T.mega && h('button', { class: 'icon-btn', 'aria-label': 'Подсказка', onclick: askHint }, icon('bulb', 18)),
        h('button', { class: 'icon-btn', 'aria-label': 'Справочник комбинаций', onclick: openCombos, style: 'font-weight:800;font-size:17px' }, '?'),
        h('button', { class: 'icon-btn', 'aria-label': 'Быстрые настройки', onclick: () => { S.quickSet = !S.quickSet; render(); } }, '⚙️'),
        h('button', { class: 'icon-btn', 'aria-label': 'Встать', onclick: back }, icon('back', 18))),
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
      // пранк админа: только за столом с другом
      S.me.isAdmin && T.seats.some((s) => !s.isBot && !s.me && s.id > 0) && h('div', { class: 'admin-btns' },
        h('button', { class: 'jam-btn', 'aria-label': 'Пранк в следующей раздаче', onclick: async () => { if (await run({ t: 'prank' })) toast('😈 Пранк в следующей раздаче'); } }, '😈'),
        h('button', { class: 'jam-btn', 'aria-label': 'Перевернуть стол', onclick: () => run({ t: 'prank', kind: 'flip' }) }, '🙃'),
        h('button', { class: 'jam-btn', 'aria-label': 'Всем маски', onclick: () => run({ t: 'prank', kind: 'masks' }) }, '🎭'),
        h('button', { class: 'jam-btn', 'aria-label': 'Тихий пранк: у друга тузы, выигрываешь ты', onclick: async () => { if (await run({ t: 'prank', kind: 'cooler' })) toast('🤫 Тихий пранк: у друга будут тузы, а выиграешь ты'); } }, '🤫')),
      S.emoteOpen && emoteTray(),
      S.coachTips && h('div', { class: 'coach-card' },
        h('div', { class: 'row between' }, h('div', { class: 'b', style: 'font-size:13px' }, '🎓 Тренер'),
          h('button', { class: 'hint-x', 'aria-label': 'Закрыть', onclick: () => { S.coachTips = null; render(); } }, '✕')),
        S.coachTips.map((t) => h('div', { class: 'small', style: 'line-height:1.4' }, t))),
      S.card && playerCardModal(S.card),
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
  if (!from || !to || document.hidden || loadUi().eco) return;
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

// Отправка хода с удобствами: отмена фолда на 2 секунды, подтверждение олл-ина
function sendAct(action, t) {
  const ui = loadUi();
  if (action.type === 'raise' && action.to >= t.maxTo && ui.confirmAllin && !confirm(`Олл-ин на ${fmt(t.maxTo)}?`)) return;
  const fire = () => { send({ t: 'act', action }); S.turn = null; S.hint = null; S.undo = null; render(); };
  const left = (t.deadline || 0) - nowSrv();
  if (action.type === 'fold' && ui.undoFold && t.toCall > 0 && left > 3500) {
    S.undo = { timer: setTimeout(fire, 2000) };
    render();
    return;
  }
  fire();
}
function cancelUndo() { if (S.undo) { clearTimeout(S.undo.timer); S.undo = null; render(); } }

function actionPanel(T, me, myTurn) {
  if (T.watching) {
    return h('div', { class: 'panel' },
      h('div', { class: 'soft', style: 'text-align:center;font-size:14px' }, T.show ? 'Шоу ботов · карты видно на вскрытии' : 'Ты смотришь игру друга · карты игроков скрыты'),
      h('button', { class: 'btn-ghost', onclick: stopWatching }, 'Перестать смотреть'));
  }
  if (myTurn) {
    const t = S.turn;
    const canRaise = t.maxTo > t.currentBet && t.maxTo > t.myBet + t.toCall;
    const preset = (label, frac) => h('button', {
      onclick: () => { S.raiseTo = frac === 'all' ? t.maxTo : clampRaise(t.currentBet + frac * (t.pot + t.toCall), t); render(); },
    }, label);
    const act = (action) => sendAct(action, t);
    S.curAct = act; // для горячих клавиш, свайпов и двойного тапа
    const callAmt = Math.min(t.toCall, t.maxTo - t.myBet);
    if (S.undo) {
      return h('div', { class: 'panel' },
        h('div', { class: 'soft', style: 'text-align:center;font-size:14px' }, 'Фолд через 2 секунды…'),
        h('button', { class: 'btn', onclick: cancelUndo }, 'Отменить фолд'));
    }
    // шансы банка: какую долю нужно выигрывать, чтобы колл окупался
    const odds = t.toCall > 0 ? Math.round((callAmt / (t.pot + callAmt)) * 100) : 0;
    // пресеты: до флопа — в больших блайндах, после — в долях банка
    const pre = !T.board.length;
    const presetsRow = pre
      ? [2.5, 3, 4].map((x) => h('button', { onclick: () => { S.raiseTo = clampRaise(x * t.bb + (t.toCall > t.bb ? t.currentBet - t.bb : 0), t); render(); } }, `${x} ББ`))
      : loadPresets().map((f) => preset(presetLabel(f), f));
    return h('div', { class: 'panel' },
      t.deadline > 0 && h('div', { class: 'countdown', 'data-countdown': t.deadline },
        h('span', { class: 'cd-label' }, 'Твой ход', odds ? h('span', { class: 'cd-odds', title: 'Какую долю нужно выигрывать, чтобы колл окупался' }, ` · колл = ${odds}% банка`) : ''),
        // таймбанк: +15 секунд, 3 раза за стол
        me?.timebanks > 0 && h('button', { class: 'timebank-btn', onclick: () => run({ t: 'timebank' }) }, `+15 с · ${me.timebanks}`),
        h('span', { class: 'cd-sec' }, ''),
        h('div', { class: 'cd-bar' }, h('div', { 'data-deadline': t.deadline }))),
      canRaise && h('div', { class: 'presets' }, presetsRow, preset('Олл-ин', 'all')),
      canRaise && t.maxTo > t.minRaiseTo && h('div', { class: 'bb-step' },
        h('button', { 'aria-label': 'Минус большой блайнд', onclick: () => { S.raiseTo = clampRaise(S.raiseTo - t.bb, t); render(); } }, '−'),
        h('input', {
        type: 'range', min: t.minRaiseTo, max: t.maxTo, step: Math.max(1, Math.floor(t.bb / 2)), value: S.raiseTo,
        'aria-label': 'Размер ставки',
        oninput: (e) => {
          S.raiseTo = Number(e.target.value);
          document.getElementById('raise-btn').textContent = raiseLabel(t);
        },
      }),
        h('button', { 'aria-label': 'Плюс большой блайнд', onclick: () => { S.raiseTo = clampRaise(S.raiseTo + t.bb, t); render(); } }, '+')),
      h('div', { class: 'acts' },
        h('button', { class: 'a-fold', onclick: () => act({ type: 'fold' }) }, 'Фолд'),
        h('button', { class: 'a-call', onclick: () => act({ type: t.toCall > 0 ? 'call' : 'check' }) }, t.toCall > 0 ? `Колл ${fmt(callAmt)}` : 'Чек'),
        canRaise
          ? h('button', { class: 'a-raise', id: 'raise-btn', onclick: () => act({ type: 'raise', to: S.raiseTo }) }, raiseLabel(t))
          : h('div')));
  }
  if (me?.away && !T.leaving) {
    return h('div', { class: 'panel' },
      h('div', { class: 'soft', style: 'text-align:center;font-size:14px' }, S.awayMine ? '☕ Ты отошёл — ходы пропускаются, место держится 10 минут' : 'Ты пропустил ход и отошёл от стола'),
      h('button', { class: 'btn', onclick: () => { S.awayMine = false; send({ t: 'back' }); } }, 'Я вернулся'));
  }
  if (T.canRebuy) {
    return h('div', { class: 'panel' },
      h('div', { class: 'soft', style: 'text-align:center;font-size:14px' }, 'Фишки на столе закончились'),
      h('div', { class: 'grid2' },
        h('button', { class: 'btn-ghost', onclick: () => send({ t: 'leave' }) }, 'Встать'),
        h('button', { class: 'btn', style: 'height:46px;font-size:14px', onclick: () => run({ t: 'rebuy' }) }, `Докупить ${fmt(T.buyin)}`)));
  }
  // кнопки заранее, пока ходят другие
  if (T.inHand && me?.inHand && !me.allIn && !T.leaving) {
    const actorNow = T.seats.find((s) => s.id === T.actor);
    const pre = (kind, label) => h('button', {
      class: S.pre?.kind === kind && S.pre.hand === T.handId ? 'on' : '',
      onclick: () => { S.pre = S.pre?.kind === kind && S.pre.hand === T.handId ? null : { kind, hand: T.handId }; render(); },
    }, label);
    return h('div', { class: 'panel' },
      h('div', { class: 'row between', style: 'gap:6px' },
        h('button', { class: 'btn-sm ghost', onclick: async () => { if (await run({ t: 'away' })) { S.awayMine = true; toast('☕ Отошёл: место держится 10 минут'); } } }, '☕ Отойти'),
        h('div', { class: 'soft', style: 'text-align:center;font-size:13px' }, actorNow ? `Ходит ${actorNow.name}` : 'Раздача идёт'),
        h('button', { class: 'btn-sm ghost', onclick: openLastReplay }, '⏮ Прошлая')),
      h('div', { class: 'pre-acts' }, pre('cf', 'Чек / фолд'), pre('c', 'Чек'), pre('any', 'Колл любой'), pre('half', 'Рейз ½')));
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

// ---------- Награды: ранг, сезон, пропуск, бонус дня, сундуки, задания, достижения, статистика ----------

const HAND_CATS = ['Старшая карта', 'Пара', 'Две пары', 'Сет', 'Стрит', 'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш'];
const CHEST_NAMES = { common: 'Обычный', rare: 'Редкий', epic: 'Эпический' };

function progressScreen() {
  const P = S.progress;
  if (!P) return h('div', { class: 'screen' }, header('Награды'), h('div', { class: 'center-msg muted' }, 'Загрузка…'), nav());
  const r = P.rank;
  const daysLeft = Math.max(0, Math.ceil((P.season.endsAt - nowSrv()) / 86400000));
  const lvlXp = P.pass.xp % P.pass.perLevel;
  const st = P.stats;
  const pctOf = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const quest = (period) => (q) => h('div', { class: 'quest' },
    h('div', { class: 'col', style: 'gap:4px;flex:1;min-width:0' },
      h('div', { class: 'b', style: 'font-size:14px' }, q.text),
      h('div', { class: 'progress' }, h('div', { style: `width:${(q.p / q.need) * 100}%` })),
      h('div', { class: 'small muted' }, `${q.p}/${q.need} · +${fmt(q.chips)} фишек · +${q.xp} опыта${q.chest ? ` · ${CHEST_NAMES[q.chest].toLowerCase()} сундук` : ''}`)),
    q.claimed ? h('span', { class: 'small', style: 'color:var(--green)' }, 'Получено')
      : h('button', { class: 'btn-sm', disabled: q.p < q.need, onclick: () => run({ t: 'claimQuest', period, key: q.key }) }, 'Забрать'));
  const setP = (r) => { if (r?.progress) { S.progress = r.progress; render(); } };
  if (!S.achPct && !S.achPctLoading) { S.achPctLoading = true; run({ t: 'myStats' }).then((r) => { if (r) { S.achPct = r.ach; render(); } }); }
  const L = P.level || { lvl: 0, xp: 0, per: 300, points: 0, prestige: 0, prestigeAt: 30 };
  const cal = P.calendar || { days: [], today: 1 };
  const daysInMonth = new Date(Number(cal.month?.slice(0, 4)), Number(cal.month?.slice(5, 7)), 0).getDate() || 30;
  return h('div', { class: 'screen' },
    header('Награды'),
    // колесо удачи и испытание дня
    h('div', { class: 'grid2' },
      h('div', { class: 'glass card', style: 'gap:8px' },
        h('div', { class: 'b' }, '🎡 Колесо удачи'),
        h('div', { class: 'small muted', style: 'line-height:1.4' }, (P.wheel?.segments || []).join(' · ')),
        P.wheel?.today ? h('div', { class: 'small', style: 'color:var(--green)' }, 'Уже крутил — завтра снова')
          : h('button', { class: 'btn-sm', onclick: async () => { const r = await run({ t: 'spinWheel' }); if (r) { toast(`🎡 ${r.text}`); setP(r); } } }, 'Крутить')),
      h('div', { class: 'glass card', style: 'gap:8px' },
        h('div', { class: 'b' }, '🎯 Испытание дня'),
        h('div', { class: 'small soft', style: 'line-height:1.4' }, P.challenge?.text || ''),
        P.challenge?.done ? h('div', { class: 'small', style: 'color:var(--green)' }, 'Выполнено ✓') : h('div', { class: 'small muted' }, `+${fmt(P.challenge?.chips || 0)} фишек`))),
    // уровень аккаунта и навыки
    h('div', { class: 'label' }, `Уровень ${L.lvl}${L.prestige ? ` · ★${L.prestige} престиж` : ''} · очков навыков: ${L.points}`),
    h('div', { class: 'glass card', style: 'gap:10px' },
      h('div', { class: 'progress' }, h('div', { style: `width:${(L.xp / L.per) * 100}%` })),
      h('div', { class: 'small muted' }, `${L.xp}/${L.per} опыта до уровня ${L.lvl + 1} · каждый уровень — очко навыка`),
      (P.skills || []).map((sk) => h('div', { class: 'row between', style: 'gap:8px' },
        h('div', { class: 'col', style: 'gap:2px;min-width:0' }, h('div', { class: 'b', style: 'font-size:14px' }, `${sk.name} · ${sk.lvl}/${sk.max}`), h('div', { class: 'small muted' }, sk.text)),
        h('button', { class: 'btn-sm', disabled: sk.lvl >= sk.max || L.points <= 0, onclick: async () => setP(await run({ t: 'learnSkill', key: sk.key })) }, '+'))),
      L.lvl >= L.prestigeAt && h('button', { class: 'btn-ghost', onclick: async () => { if (!confirm('Престиж: уровень и навыки сбросятся, взамен — звезда престижа и рамка. Точно?')) return; const r = await run({ t: 'prestige' }); if (r) { toast(r.text); setP(r); } } }, `★ Престиж (с ${L.prestigeAt} уровня)`)),
    // календарь месяца
    h('div', { class: 'label' }, `Календарь входа · ${cal.days.length} из ${daysInMonth} дней`),
    h('div', { class: 'glass card', style: 'gap:8px' },
      h('div', { class: 'cal-grid' }, Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => h('div', { class: `cal-day ${cal.days.includes(d) ? 'done' : ''} ${d === cal.today ? 'today' : ''}` }, [10, 20, 30].includes(d) ? '📦' : d))),
      h('div', { class: 'small muted' }, 'День засчитывается, когда забираешь бонус за вход. 10 и 20 дней — редкий сундук, 30 — эпический.')),
    // ранг
    h('div', { class: 'glass card' },
      h('div', { class: 'row between' },
        h('div', { class: 'col', style: 'gap:2px' }, h('div', { class: 'small muted' }, 'Твой ранг'),
          h('div', { style: `font-size:24px;font-weight:800;color:${r.color}` }, r.name)),
        h('div', { class: 'col', style: 'align-items:flex-end;gap:2px' }, h('div', { class: 'small muted' }, 'Эло'), h('div', { class: 'b', style: 'font-size:20px' }, fmt(r.rating)))),
      r.next && h('div', { class: 'small soft' }, `До ранга «${r.next.name}»: ${fmt(Math.max(0, r.next.from - r.rating))} Эло`),
      h('div', { class: 'small muted' }, `${P.season.name} · осталось ${daysLeft} дн. В конце сезона — награда по рангу, Эло частично сбрасывается.`)),
    // пропуск сезона
    h('div', { class: 'label' }, `Пропуск сезона · уровень ${P.pass.level}`),
    h('div', { class: 'glass card', style: 'gap:10px' },
      h('div', { class: 'progress' }, h('div', { style: `width:${(lvlXp / P.pass.perLevel) * 100}%` })),
      h('div', { class: 'small muted' }, `${lvlXp}/${P.pass.perLevel} опыта до следующего уровня · опыт за раздачи, победы, задания и сундуки`),
      h('div', { class: 'pass-row' }, P.pass.levels.map((L) => {
        const open = P.pass.level >= L.lvl;
        const got = P.pass.claimed.includes(L.lvl);
        const label = L.chips ? `${fmt(L.chips)}` : L.hints ? '💡 1' : `📦 ${CHEST_NAMES[L.chest]}`;
        return h('button', { class: `pass-lvl ${open ? 'open' : ''} ${got ? 'got' : ''}`, disabled: !open || got, onclick: () => run({ t: 'claimPass', lvl: L.lvl }) },
          h('div', { class: 'small muted' }, `ур. ${L.lvl}`), h('div', { class: 'b', style: 'font-size:12px' }, label), got && h('div', { class: 'small', style: 'color:var(--green)' }, '✓'));
      }))),
    // бонус дня
    h('div', { class: 'label' }, `Бонус за вход · день ${P.bonus.streak || 0} подряд`),
    h('div', { class: 'glass card', style: 'gap:10px' },
      h('div', { class: 'streak-row' }, P.bonus.table.map((rew, i) => {
        const day = i + 1;
        const cur = ((P.bonus.streak || 0) - 1) % 7 + 1;
        const done = P.bonus.today ? day <= cur : day < (P.bonus.streak ? cur + 1 : 1);
        return h('div', { class: `streak-day ${done ? 'done' : ''}` }, h('div', { class: 'small muted' }, `д${day}`), h('div', { class: 'b', style: 'font-size:12px' }, rew === 'chest' ? '📦' : fmt(rew)));
      })),
      h('button', { class: 'btn', disabled: P.bonus.today, onclick: () => run({ t: 'claimDaily' }) }, P.bonus.today ? 'Сегодня уже получен — приходи завтра' : 'Забрать бонус')),
    // сундуки
    h('div', { class: 'label' }, 'Сундуки'),
    h('div', { class: 'grid3' }, Object.entries(CHEST_NAMES).map(([k, name]) => h('button', {
      class: `chest ${k}`, disabled: !(P.chests[k] > 0), onclick: () => run({ t: 'openChest', kind: k }),
    }, h('div', { style: 'font-size:28px' }, '📦'), h('div', { class: 'b', style: 'font-size:13px' }, name), h('div', { class: 'small muted' }, `есть: ${P.chests[k] || 0}`)))),
    S.chestOpened && h('div', { class: 'glass card chest-res' },
      h('div', { class: 'row between' }, h('div', { class: 'b' }, `${S.chestOpened.name} открыт!`),
        h('button', { class: 'hint-x', 'aria-label': 'Закрыть', onclick: () => { S.chestOpened = null; render(); } }, '✕')),
      h('div', { class: 'small' }, `+${fmt(S.chestOpened.chips)} фишек${S.chestOpened.hints ? ` · +${S.chestOpened.hints} подсказки` : ''} · +${S.chestOpened.xp} опыта${S.chestOpened.cosmetic ? ` · ${S.chestOpened.cosmetic}` : ''}`)),
    // задания
    h('div', { class: 'label' }, 'Задания дня'),
    h('div', { class: 'col', style: 'gap:8px' }, P.daily.map(quest('daily'))),
    h('div', { class: 'label' }, 'Задания недели'),
    h('div', { class: 'col', style: 'gap:8px' }, P.weekly.map(quest('weekly'))),
    // достижения
    h('div', { class: 'label' }, `Достижения · ${P.achievements.filter((a) => a.at).length}/${P.achievements.length}`),
    h('div', { class: 'small muted' }, 'Нажми на открытое достижение, чтобы поделиться им в сторис или чате'),
    h('div', { class: 'ach-grid' }, P.achievements.map((a) => h('div', {
      class: `ach ${a.at ? 'got' : ''}`, title: a.text, role: a.at ? 'button' : null,
      onclick: a.at ? () => { S.shareTo = tg?.shareToStory ? 'story' : 'link'; shareCard({ title: '🏅 Достижение', subtitle: a.name, footer: a.text }, `Получил достижение «${a.name}» в покере!`); } : null,
    },
      h('div', { style: 'font-size:22px' }, a.at ? '🏅' : '🔒'),
      h('div', { class: 'b', style: 'font-size:12px' }, a.name),
      h('div', { class: 'small muted', style: 'font-size:10.5px;line-height:1.3' }, a.text),
      S.achPct?.[a.key] != null && !a.secret && h('div', { class: 'small', style: 'font-size:10px;color:#f5d37a' }, `есть у ${S.achPct[a.key]}% игроков`)))),
    // статистика
    h('div', { class: 'label' }, 'Статистика'),
    h('div', { class: 'glass card' },
      h('div', { class: 'grid3' }, stat('Раздач', fmt(st.hands)), stat('Выиграно', pctOf(st.wins, st.hands)), stat('Вход в игру', pctOf(st.vpip, st.hands))),
      h('div', { class: 'grid3' }, stat('Вскрытий', fmt(st.showdowns)), stat('Победы на вскр.', pctOf(st.showdownWins, st.showdowns)), stat('Лучшая серия', st.bestStreak || 0)),
      h('div', { class: 'grid3' }, stat('Лучшая рука', st.bestCat >= 0 ? HAND_CATS[st.bestCat] : '—'), stat('Турниров', st.tours), stat('Побед в турн.', st.tourWins))),
    // рекорды и медали
    h('div', { class: 'label' }, 'Рекорды и медали'),
    h('div', { class: 'glass card', style: 'gap:10px' },
      h('div', { class: 'grid3' }, stat('🥇', P.medals?.gold || 0), stat('🥈', P.medals?.silver || 0), stat('🥉', P.medals?.bronze || 0)),
      h('div', { class: 'grid3' }, stat('Самый большой банк', fmt(P.records?.biggestPot || 0)), stat('Серия побед', P.records?.bestStreak || 0), stat('Раздач выиграно', fmt(P.records?.wins || 0))),
      P.best && h('div', { class: 'col', style: 'gap:6px' },
        h('div', { class: 'small muted' }, `Лучшая рука в жизни: ${P.best.name}`),
        P.best.cards && h('div', { class: 'tut-cards' }, P.best.cards.map((c) => pcard(c, 'sm'))))),
    // альбом комбинаций
    h('div', { class: 'label' }, `Альбом комбинаций · ${Object.keys(P.album || {}).length} из 10`),
    h('div', { class: 'glass card' },
      h('div', { class: 'album-grid' }, [...HAND_CATS.map((n, i) => [String(i), n]), ['royal', 'Флеш-рояль']].map(([k, n]) =>
        h('div', { class: `album-item ${P.album?.[k] ? 'got' : ''}` }, P.album?.[k] ? '✓ ' : '', n)))),
    // коллекция карт
    h('div', { class: 'label' }, `Коллекция карт · ${(P.cards || []).length} из 52`),
    h('div', { class: 'glass card', style: 'gap:8px' },
      h('div', { class: 'small muted' }, 'Карта попадает в коллекцию, когда ты выигрываешь раздачу с ней на руках. Собери все 52 — эпический сундук.'),
      // 4 ряда по мастям, в ряду — от двойки до туза
      h('div', { class: 'coll-grid' }, Array.from({ length: 52 }, (_, i) => i).map((i) => {
        const c = (i % 13) * 4 + Math.floor(i / 13);
        return h('div', { class: `coll-card ${(P.cards || []).includes(c) ? 'got' : ''} ${(c & 3) === 1 || (c & 3) === 2 ? 'red' : ''}` }, cardText(c));
      }))),
    // зал славы
    h('button', { class: 'item', onclick: async () => { const r = await run({ t: 'fame' }); if (r) { S.fame = r; render(); } } },
      h('div', { class: 'col' }, h('div', { class: 'b', style: 'font-size:14px' }, '🏛 Зал славы'), h('div', { class: 'small muted' }, 'Очки за турниры за неделю: 1 место — 10, 2 — 6, 3 — 4, участие — 1')), icon('chev')),
    S.fame && h('div', { class: 'glass card', style: 'gap:6px' },
      h('div', { class: 'b' }, 'Эта неделя'),
      S.fame.week.length ? S.fame.week.map((r, i) => h('div', { class: 'row between' }, h('div', {}, `${i + 1}. ${r.name}`), h('div', { class: 'b' }, r.points))) : h('div', { class: 'small muted' }, 'Пока никого — сыграй турнир'),
      S.fame.hall.length > 0 && h('div', { class: 'b', style: 'padding-top:6px' }, 'Прошлые недели'),
      S.fame.hall.map((w) => h('div', { class: 'small soft' }, `${w.week}: ${w.top.map((t, i) => `${['🥇', '🥈', '🥉'][i]} ${t.name}`).join('  ')}`))),
    h('div', { style: 'height:80px' }),
    nav());
}

// ---------- Админка ----------

function adminScreen() {
  const A = S.adm || {};
  const tab = S.admTab || 'stats';
  const st = A.stats;
  const adj = (u, field, label) => h('div', { class: 'row', style: 'gap:6px;align-items:center' },
    h('div', { class: 'small', style: 'width:92px' }, label),
    h('input', { class: 'buyin-input', style: 'margin:0;flex:1;height:36px', type: 'number', id: `adj-${u.id}-${field}`, placeholder: '±число или =число' }),
    h('button', { class: 'btn-sm', onclick: () => {
      const raw = document.getElementById(`adj-${u.id}-${field}`).value.trim();
      if (!raw) return;
      run({ t: 'admin', a: 'adjust', id: u.id, field, mode: raw.startsWith('=') ? 'set' : 'add', value: raw.replace('=', '') });
    } }, 'OK'));
  const tabs = h('div', { class: 'seg' }, [['stats', 'Стата'], ['users', 'Игроки'], ['promo', 'Промо'], ['more', 'Ещё']].map(([k, l]) =>
    h('button', { class: tab === k ? 'on' : '', onclick: () => { S.admTab = k; render(); } }, l)));
  let body;
  if (tab === 'stats') {
    const max = Math.max(1, ...(st?.days || []).map((d) => d.stars));
    body = !st ? h('div', { class: 'muted small' }, 'Загрузка…') : [
      h('div', { class: 'glass card' },
        h('div', { class: 'grid3' }, stat('Игроков', fmt(st.users)), stat('За сутки', fmt(st.dau)), stat('За неделю', fmt(st.wau))),
        h('div', { class: 'grid3' }, stat('Звёзд всего', `⭐ ${fmt(st.starsTotal)}`), stat('Платежей', fmt(st.paymentsTotal)), stat('Платят', fmt(st.payers))),
        h('div', { class: 'grid3' }, stat('Фишек у всех', fmtShort(st.chips)), stat('Столов сейчас', st.activeTables), stat('', ''))),
      h('div', { class: 'label' }, 'Звёзды по дням (14 дней)'),
      h('div', { class: 'glass card bars' }, st.days.map((d) => h('div', { class: 'bar-col', title: `${d.day}: ⭐${d.stars}, платежей ${d.payments}, новых ${d.newUsers}` },
        h('div', { class: 'small', style: 'font-size:9.5px' }, d.stars ? d.stars : ''),
        h('div', { class: 'bar', style: `height:${Math.round((d.stars / max) * 90)}px` }),
        h('div', { class: 'small muted', style: 'font-size:9px' }, d.day.slice(3))))),
      h('div', { class: 'small muted' }, 'Новых игроков по дням: ' + st.days.map((d) => d.newUsers).join(' · ')),
      h('button', { class: 'btn-ghost', onclick: () => send({ t: 'admin', a: 'stats' }) }, 'Обновить'),
      // онлайн по часам
      h('button', { class: 'btn-ghost', onclick: () => send({ t: 'admin', a: 'online' }) }, '📈 Онлайн по часам'),
      A.online && h('div', { class: 'glass card bars' }, A.online.map((x) => {
        const mx = Math.max(1, ...A.online.map((y) => y.peak));
        return h('div', { class: 'bar-col', title: `${x.hour.slice(11)}:00 — ${x.peak}` },
          h('div', { class: 'small', style: 'font-size:9px' }, x.peak || ''),
          h('div', { class: 'bar', style: `height:${Math.round((x.peak / mx) * 90)}px` }),
          h('div', { class: 'small muted', style: 'font-size:9px' }, x.hour.slice(11)));
      })),
      // логи пранков
      h('button', { class: 'btn-ghost', onclick: () => send({ t: 'admin', a: 'pranks' }) }, '😈 Логи пранков'),
      A.pranks && h('div', { class: 'glass card', style: 'gap:4px' }, A.pranks.length ? A.pranks.map((x) => h('div', { class: 'small' }, `${new Date(x.at).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${{ aces: '😈 тузы', cooler: '🤫 тихий', flip: '🙃 стол', masks: '🎭 маски' }[x.kind] || x.kind} · ${x.text}`)) : h('div', { class: 'small muted' }, 'Пранков пока не было')),
    ];
  } else if (tab === 'users') {
    body = [
      h('div', { class: 'row', style: 'gap:8px' },
        h('input', { class: 'buyin-input', style: 'margin:0;flex:1', id: 'adm-q', placeholder: 'id, имя или @ник', value: S.admQ || '', oninput: (e) => { S.admQ = e.target.value; } }),
        h('button', { class: 'btn-sm', onclick: () => send({ t: 'admin', a: 'search', q: S.admQ || '' }) }, 'Найти')),
      h('div', { class: 'small muted' }, '«+500» — добавить, «-500» — забрать, «=1800» — поставить'),
      (A.users || []).map((u) => h('div', { class: 'glass card', style: 'gap:6px' },
        h('div', { class: 'row between' }, h('div', { class: 'b' }, `${u.name}${u.username ? ` @${u.username}` : ''}`), h('div', { class: 'small muted' }, `id ${u.id}`)),
        h('div', { class: 'small soft' }, `Фишки ${fmt(u.chips)} (в игре ${fmt(u.inPlay)}) · Эло ${u.rating} · подсказок ${u.hints} · раздач ${fmt(u.handsWon)} · турниров ${u.games}/${u.wins}`),
        adj(u, 'chips', 'Фишки'), adj(u, 'rating', 'Эло'), adj(u, 'hints', 'Подсказки'), adj(u, 'handsWon', 'Раздачи'),
        h('div', { class: 'row', style: 'gap:6px' },
          h('button', { class: `btn-sm ${u.banned ? '' : 'ghost'}`, onclick: () => { if (u.banned || confirm(`Забанить ${u.name}?`)) run({ t: 'admin', a: 'ban', id: u.id, on: !u.banned }); } }, u.banned ? '🔓 Разбанить' : '⛔ Бан'),
          h('button', { class: `btn-sm ${u.muted ? '' : 'ghost'}`, onclick: () => run({ t: 'admin', a: 'mute', id: u.id, on: !u.muted }) }, u.muted ? '🔊 Снять мут' : '🔇 Мут')))),
    ];
  } else if (tab === 'promo') {
    const P = S.admPromo || (S.admPromo = { code: '', chips: 1000, hints: 0, chest: '', maxUses: 100, days: 7 });
    const inp = (k, ph, type = 'text') => h('input', { class: 'buyin-input', style: 'margin:0', type, id: `promo-${k}`, placeholder: ph, value: P[k] ?? '', oninput: (e) => { P[k] = e.target.value; } });
    body = [
      h('div', { class: 'glass card', style: 'gap:8px' },
        h('div', { class: 'b' }, 'Новый промокод'),
        inp('code', 'КОД (латиница)'), inp('chips', 'Фишки', 'number'), inp('hints', 'Подсказки', 'number'),
        h('div', { class: 'choices' }, [['', 'Без сундука'], ['common', 'Обычный'], ['rare', 'Редкий'], ['epic', 'Эпический']].map(([k, l]) => h('button', { class: P.chest === k ? 'on' : '', onclick: () => { P.chest = k; render(); } }, l))),
        inp('maxUses', 'Сколько раз можно ввести', 'number'), inp('days', 'Сколько дней действует', 'number'),
        h('button', { class: 'btn', onclick: () => run({ t: 'admin', a: 'promoCreate', promo: { ...P, chest: P.chest || null } }) }, 'Создать')),
      h('div', { class: 'label' }, 'Промокоды'),
      (A.promos || []).map((p) => h('div', { class: 'item' },
        h('div', { class: 'col' }, h('div', { class: 'b' }, p.code),
          h('div', { class: 'small muted' }, `${[p.chips && `${fmt(p.chips)} фишек`, p.hints && `${p.hints} подск.`, p.chest && `сундук: ${p.chest}`].filter(Boolean).join(', ')} · ${p.used}/${p.max_uses} · до ${new Date(p.expires).toLocaleDateString('ru')}`)),
        h('button', { class: 'btn-sm ghost', onclick: () => { if (confirm(`Удалить ${p.code}?`)) run({ t: 'admin', a: 'promoDelete', code: p.code }); } }, '✕'))),
    ];
  } else {
    const E = S.admEvent || (S.admEvent = { kind: 'x2chips', hours: 48, title: '' });
    const bs = A.broadcast;
    body = [
      h('div', { class: 'glass card', style: 'gap:8px' },
        h('div', { class: 'b' }, '📣 Рассылка всем игрокам'),
        h('textarea', { class: 'buyin-input', style: 'margin:0;height:110px;padding:10px', id: 'adm-bc', placeholder: 'Текст сообщения (можно <b>жирный</b>)', oninput: (e) => { S.admBc = e.target.value; } }, S.admBc || ''),
        h('button', { class: 'btn', onclick: () => { if (confirm('Отправить всем игрокам?')) run({ t: 'admin', a: 'broadcast', text: S.admBc }); } }, 'Отправить всем'),
        bs && h('div', { class: 'small soft' }, `Отправлено ${bs.sent} из ${bs.total}${bs.failed ? `, не дошло ${bs.failed}` : ''}${bs.done ? ' · готово' : ' · идёт…'}`)),
      h('div', { class: 'glass card', style: 'gap:8px' },
        h('div', { class: 'b' }, '🎉 Ивент'),
        h('div', { class: 'choices' }, [['x2chips', 'x2 фишки'], ['x2xp', 'x2 опыт']].map(([k, l]) => h('button', { class: E.kind === k ? 'on' : '', onclick: () => { E.kind = k; render(); } }, l))),
        h('div', { class: 'choices' }, [24, 48, 72, 168].map((hh) => h('button', { class: E.hours === hh ? 'on' : '', onclick: () => { E.hours = hh; render(); } }, hh < 168 ? `${hh} ч` : 'неделя'))),
        h('input', { class: 'buyin-input', style: 'margin:0', id: 'adm-ev', placeholder: 'Название (например «x2 на выходных!»)', value: E.title, oninput: (e) => { E.title = e.target.value; } }),
        h('div', { class: 'row', style: 'gap:8px' },
          h('button', { class: 'btn-sm', onclick: () => run({ t: 'admin', a: 'event', kind: E.kind, hours: E.hours, title: E.title }) }, 'Включить'),
          h('button', { class: 'btn-sm ghost', onclick: () => run({ t: 'admin', a: 'event', kind: null }) }, 'Выключить'))),
      h('div', { class: 'small muted', style: 'line-height:1.45' }, 'Режим стрима: Профиль → Настройки экрана → «Стрим». Скрывает лишние кнопки и добавляет водяной знак для записи.'),
    ];
  }
  return h('div', { class: 'screen' }, header('Админка'), tabs, body, h('div', { style: 'height:80px' }), nav());
}

// ---------- Друзья и клуб ----------

async function stopWatching() {
  await run({ t: 'unwatch' });
  S.table = null;
  go('friends');
}

function friendsScreen() {
  const F = S.friends, C = S.club;
  const tab = S.friendsTab || 'friends';
  const atMixed = S.me.table?.kind === 'mixed';
  const row = (f, buttons) => h('div', { class: 'friend' },
    h('div', { class: 'row', style: 'gap:10px;min-width:0;flex:1' },
      h('span', { class: `dot ${f.online ? '' : 'off'}` }),
      h('div', { class: 'col', style: 'gap:1px;min-width:0' },
        h('div', { class: 'b', style: `font-size:14px;color:${f.rankColor || '#fff'}` }, f.name),
        h('div', { class: 'small muted' }, f.free ? h('span', { style: 'color:var(--green)' }, '🟢 свободен поиграть · ') : '', f.table ? `за столом: ${f.table.title}` : f.online ? 'онлайн' : 'не в сети', ` · ${fmt(f.rating)} Эло`))),
    h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;justify-content:flex-end' }, buttons));
  const friendsTab = () => !F ? h('div', { class: 'muted small' }, 'Загрузка…') : [
    // статус и история раздач
    h('div', { class: 'grid2' },
      h('button', { class: F.meFree ? 'btn' : 'btn-ghost', style: 'height:44px;font-size:13px', onclick: async () => { if (await run({ t: 'setFree', on: !F.meFree })) send({ t: 'friends' }); } }, F.meFree ? '🟢 Свободен поиграть' : 'Я свободен поиграть'),
      h('button', { class: 'btn-ghost', style: 'height:44px;font-size:13px', onclick: openHistory }, '📜 Мои раздачи за сутки')),
    // поиск игроков по имени
    h('div', { class: 'row', style: 'gap:8px' },
      h('input', { class: 'buyin-input', style: 'margin:0;flex:1', placeholder: 'Найти игрока по имени', value: S.findQ || '', oninput: (e) => { S.findQ = e.target.value; } }),
      h('button', { class: 'btn-sm', onclick: async () => { const r = await run({ t: 'findPlayers', q: S.findQ }); if (r) { S.found = r.players; render(); } } }, 'Найти')),
    S.found && (S.found.length ? S.found.map((p) => h('div', { class: 'item' },
      h('div', { class: 'col', style: 'gap:0' }, h('div', { class: 'b', style: 'font-size:14px' }, p.name), h('div', { class: 'small muted' }, `${p.username ? `@${p.username} · ` : ''}${fmt(p.rating)} Эло`)),
      h('button', { class: 'btn-sm', onclick: async () => { if (await run({ t: 'addFriend', ref: p.id })) toast('Заявка отправлена'); } }, 'В друзья'))) : h('div', { class: 'small muted' }, 'Никого не нашли')),
    // подарки-сюрпризы
    (F.surprises || []).map((g) => h('div', { class: 'glass card', style: 'gap:6px' },
      h('div', { class: 'b' }, `🎁 Сюрприз от ${g.from}`),
      h('button', { class: 'btn-sm', onclick: async () => { const r = await run({ t: 'openSurprise', id: g.id }); if (r) { toast(r.text); send({ t: 'friends' }); } } }, 'Открыть'))),
    // пари
    (F.bets || []).length > 0 && h('div', { class: 'label' }, 'Пари'),
    (F.bets || []).map((b) => h('div', { class: 'glass card', style: 'gap:6px' },
      h('div', { class: 'b', style: 'font-size:14px' }, `🤝 С ${b.with} на ${fmt(b.stake)}`),
      b.status === 'active' ? h('div', { class: 'small soft' }, `Счёт: ты ${b.mine} — ${b.his} · до конца ${Math.max(0, Math.ceil((b.ends - nowSrv()) / 60000))} мин`)
        : b.incoming ? h('div', { class: 'row', style: 'gap:6px' },
          h('button', { class: 'btn-sm', onclick: async () => { if (await run({ t: 'answerBet', id: b.id, accept: true })) send({ t: 'friends' }); } }, `Принять (${fmt(b.stake)})`),
          h('button', { class: 'btn-sm ghost', onclick: async () => { if (await run({ t: 'answerBet', id: b.id, accept: false })) send({ t: 'friends' }); } }, 'Отказаться'))
          : h('div', { class: 'row between' }, h('div', { class: 'small muted' }, 'Ждём ответа друга'), h('button', { class: 'btn-sm ghost', onclick: async () => { if (await run({ t: 'answerBet', id: b.id, accept: false })) send({ t: 'friends' }); } }, 'Отменить')))),
    // наставник
    (F.mentor || (F.mentees || []).length > 0) && h('div', { class: 'small soft' }, F.mentor ? `🎓 Твой наставник: ${F.mentor.name}` : '', (F.mentees || []).length ? ` 🎓 Твои ученики: ${F.mentees.map((m) => m.name).join(', ')}` : ''),
    h('div', { class: 'row', style: 'gap:8px' },
      h('input', { class: 'buyin-input', style: 'margin:0;flex:1', id: 'friend-ref', placeholder: '@ник друга', value: S.friendRef || '', oninput: (e) => { S.friendRef = e.target.value; } }),
      h('button', { class: 'btn-sm', onclick: async () => { if (S.friendRef && await run({ t: 'addFriend', ref: S.friendRef.trim() })) { S.friendRef = ''; toast('Заявка отправлена'); } } }, 'Добавить')),
    F.incoming.length > 0 && h('div', { class: 'label' }, 'Заявки в друзья'),
    F.incoming.map((f) => row(f, [
      h('button', { class: 'btn-sm', onclick: () => run({ t: 'addFriend', ref: f.id }) }, 'Принять'),
      h('button', { class: 'btn-sm ghost', onclick: () => run({ t: 'removeFriend', id: f.id }) }, '✕')])),
    h('div', { class: 'label' }, `Друзья · ${F.friends.length}`),
    F.friends.length ? F.friends.map((f) => h('div', { class: 'col', style: 'gap:6px' },
      row(f, [
        f.table && h('button', { class: 'btn-sm', onclick: async () => { if (await run({ t: 'watch', id: f.id })) go('table'); } }, 'Смотреть'),
        f.table?.mixedId && h('button', { class: 'btn-sm', onclick: () => openMixed(f.table.mixedId) }, 'Сесть'),
        atMixed && h('button', { class: 'btn-sm', onclick: async () => { if (await run({ t: 'inviteFriend', id: f.id })) toast('Приглашение отправлено'); } }, 'Позвать'),
        h('button', { class: 'btn-sm ghost', onclick: () => { S.friendAct = S.friendAct?.id === f.id ? null : { id: f.id }; render(); } }, '⋯')]),
      S.friendAct?.id === f.id && friendActions(f))) : h('div', { class: 'muted small' }, 'Пока никого — добавь по нику или позови по ссылке ниже'),
    // реферальная ссылка
    F.ref?.link && h('div', { class: 'glass card', style: 'gap:8px' },
      h('div', { class: 'b' }, 'Позови друга — получите фишки оба'),
      h('div', { class: 'small soft', style: 'line-height:1.45' }, `Друг получит +${F.ref.bonusNew} фишек сразу, а ты — +${F.ref.bonusInviter} и редкий сундук, когда он сыграет 20 раздач. Позвал: ${F.ref.invited}, награды: ${F.ref.rewarded}.`),
      h('button', { class: 'btn', onclick: () => shareLink(F.ref.link, 'Го играть в покер со мной!') }, 'Поделиться ссылкой')),
  ];
  const clubTab = () => !C ? h('div', { class: 'muted small' }, 'Загрузка…') : [
    C.club ? [
      h('div', { class: 'glass card', style: 'gap:6px' },
        h('div', { class: 'row between' }, h('div', { class: 'b', style: 'font-size:18px' }, C.club.name), h('div', { class: 'small muted' }, `код: ${C.club.code}`)),
        h('div', { class: 'small soft' }, `Игроков: ${C.club.members.length}. Зови друзей — пусть вступят по коду.`),
        h('div', { class: 'row', style: 'gap:8px' },
          h('button', { class: 'btn-sm', onclick: () => { S.create = { ...S.create, club: true, name: `Клуб ${C.club.name}` }; go('create'); } }, 'Клубный турнир'),
          h('button', { class: 'btn-sm ghost', onclick: () => run({ t: 'leaveClub' }) }, 'Выйти из клуба'))),
      // клубный банк
      h('div', { class: 'glass card', style: 'gap:8px' },
        h('div', { class: 'row between' }, h('div', { class: 'b' }, '🏦 Банк клуба'), h('div', { class: 'b' }, fmt(C.club.bank || 0))),
        h('div', { class: 'small muted' }, C.club.owner ? 'Скидывайтесь всем клубом. Глава выдаёт фишки участникам — например, на турнир.' : 'Скидывайтесь всем клубом. Выдаёт фишки глава клуба.'),
        h('div', { class: 'row', style: 'gap:6px' },
          h('input', { class: 'buyin-input', style: 'margin:0;flex:1', type: 'number', inputmode: 'numeric', placeholder: 'Сколько', value: S.clubAmt || '', oninput: (e) => { S.clubAmt = Number(e.target.value); } }),
          h('button', { class: 'btn-sm', onclick: async () => { const r = await run({ t: 'clubDeposit', amount: S.clubAmt }); if (r) { S.club = r; render(); } } }, 'Положить'))),
      // клубные войны
      h('button', { class: 'item', onclick: async () => { const r = await run({ t: 'clubWar' }); if (r) { S.clubWar = r; render(); } } },
        h('div', { class: 'col' }, h('div', { class: 'b', style: 'font-size:14px' }, '⚔️ Клубные войны'), h('div', { class: 'small muted' }, 'Чей клуб выиграет больше раздач за неделю')), icon('chev')),
      S.clubWar && h('div', { class: 'glass card', style: 'gap:6px' },
        S.clubWar.champion && h('div', { class: 'small', style: 'color:#f5d37a' }, `🏆 Чемпион прошлой недели: ${S.clubWar.champion.name} (${S.clubWar.champion.score})`),
        S.clubWar.week.length ? S.clubWar.week.map((c, i) => h('div', { class: 'row between' }, h('div', {}, `${i + 1}. ${c.name}`), h('div', { class: 'b' }, c.score))) : h('div', { class: 'small muted' }, 'На этой неделе пока пусто')),
      h('div', { class: 'label' }, 'Участники'),
      C.club.members.map((m, i) => h('div', { class: 'item' },
        h('div', { class: 'row' }, h('div', { class: 'seat-dot taken' }, i + 1), h('div', { class: 'col', style: 'gap:0' }, h('div', { class: 'b', style: 'font-size:14px' }, m.name), h('div', { class: 'small', style: `color:${m.rankColor}` }, m.rank))),
        h('div', { class: 'row', style: 'gap:6px' }, h('div', { class: 'b' }, fmt(m.rating)),
          C.club.owner && C.club.bank > 0 && h('button', { class: 'btn-sm', onclick: async () => { const n = Number(prompt(`Сколько выдать ${m.name} из банка (есть ${C.club.bank})?`)); if (n > 0) { const r = await run({ t: 'clubPay', to: m.id, amount: n }); if (r) { S.club = r; render(); } } } }, '💸')))),
    ] : [
      h('div', { class: 'glass card', style: 'gap:8px' },
        h('div', { class: 'b' }, 'Создай клуб'),
        h('input', { class: 'buyin-input', style: 'margin:0', id: 'club-name', placeholder: 'Название клуба', value: S.clubName || '', oninput: (e) => { S.clubName = e.target.value; } }),
        h('button', { class: 'btn', onclick: () => run({ t: 'createClub', name: S.clubName }) }, 'Создать')),
      h('div', { class: 'glass card', style: 'gap:8px' },
        h('div', { class: 'b' }, 'Или вступи по коду'),
        h('input', { class: 'buyin-input', style: 'margin:0', id: 'club-code', placeholder: 'Код клуба', value: S.clubCode || '', oninput: (e) => { S.clubCode = e.target.value; } }),
        h('button', { class: 'btn', onclick: () => run({ t: 'joinClub', code: S.clubCode }) }, 'Вступить')),
    ],
    h('div', { class: 'label' }, 'Лучшие клубы'),
    C.top.length ? C.top.map((c, i) => h('div', { class: 'item' },
      h('div', { class: 'row' }, h('div', { class: 'seat-dot taken' }, i + 1), h('div', { class: 'col', style: 'gap:0' }, h('div', { class: 'b', style: 'font-size:14px' }, c.name), h('div', { class: 'small muted' }, `игроков: ${c.members}`))),
      h('div', { class: 'b' }, fmt(c.score)))) : h('div', { class: 'muted small' }, 'Клубов пока нет — создай первый'),
  ];
  return h('div', { class: 'screen' },
    header('Друзья и клуб'),
    h('div', { class: 'seg' }, [['friends', 'Друзья'], ['club', 'Клуб']].map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => { S.friendsTab = k; render(); } }, l))),
    tab === 'friends' ? friendsTab() : clubTab(),
    h('div', { style: 'height:80px' }),
    nav());
}

// подарок и дуэль другу
function friendActions(f) {
  const a = S.friendAct;
  return h('div', { class: 'glass card', style: 'gap:8px;padding:12px' },
    h('div', { class: 'small b' }, '🎁 Подарить'),
    h('div', { class: 'row', style: 'gap:6px' },
      h('input', { class: 'buyin-input', style: 'margin:0;flex:1', type: 'number', inputmode: 'numeric', id: 'gift-chips', placeholder: `Фишки (сегодня до ${fmt(S.friends?.giftLeft ?? 0)})`, value: a.chips || '', oninput: (e) => { a.chips = e.target.value; } }),
      h('input', { class: 'buyin-input', style: 'margin:0;width:90px', type: 'number', inputmode: 'numeric', id: 'gift-hints', placeholder: 'Подсказки', value: a.hints || '', oninput: (e) => { a.hints = e.target.value; } })),
    h('button', { class: 'btn-sm', onclick: () => run({ t: 'gift', id: f.id, chips: Number(a.chips) || 0, hints: Number(a.hints) || 0 }) }, 'Подарить'),
    h('div', { class: 'small b', style: 'margin-top:6px' }, '⚔️ Дуэль 1 на 1'),
    h('div', { class: 'choices' }, [10, 20, 50].map((n) => h('button', { class: (a.hands || 20) === n ? 'on' : '', onclick: () => { a.hands = n; render(); } }, `${n} раздач`))),
    h('div', { class: 'choices' }, [200, 500, 1000, 5000].map((b) => h('button', { class: (a.buyin || 500) === b ? 'on' : '', onclick: () => { a.buyin = b; render(); } }, fmt(b)))),
    h('button', { class: 'btn-sm', onclick: async () => { if (await run({ t: 'duelFriend', id: f.id, hands: a.hands || 20, buyin: a.buyin || 500 })) { toast('Вызов отправлен — ждём друга'); go('table'); } } }, 'Вызвать на дуэль'),
    h('div', { class: 'small b', style: 'margin-top:6px' }, '🎁 Подарок-сюрприз'),
    h('div', { class: 'small muted' }, 'Друг увидит только коробку и узнает сумму, когда откроет'),
    h('button', { class: 'btn-sm', onclick: async () => { if (await run({ t: 'surprise', to: f.id, chips: Number(a.chips) || 0 })) toast('Сюрприз отправлен'); } }, `Отправить сюрприз (${fmt(Number(a.chips) || 0)} фишек)`),
    h('div', { class: 'small b', style: 'margin-top:6px' }, '🤝 Пари на вечер'),
    h('div', { class: 'small muted' }, 'Кто выиграет больше раздач за 3 часа. Ставите одинаково, победитель забирает всё'),
    h('div', { class: 'choices' }, [500, 1000, 5000].map((b) => h('button', { class: (a.bet || 1000) === b ? 'on' : '', onclick: () => { a.bet = b; render(); } }, fmt(b)))),
    h('button', { class: 'btn-sm', onclick: async () => { if (await run({ t: 'proposeBet', to: f.id, stake: a.bet || 1000 })) { toast('Пари предложено'); send({ t: 'friends' }); } } }, 'Предложить пари'),
    h('button', { class: 'btn-sm ghost', style: 'margin-top:6px', onclick: async () => { const r = await run({ t: 'compareFriend', id: f.id }); if (r) { a.cmp = r; render(); } } }, '📊 Сравнить статистику'),
    a.cmp && h('div', { class: 'glass card', style: 'gap:4px;padding:10px' },
      [['Эло', 'rating'], ['Раздач выиграно', 'handsWon'], ['Раздач в статистике', 'hands'], ['VPIP %', 'vpip'], ['PFR %', 'pfr'], ['Победы на вскрытии %', 'sdWin'], ['ROI турниров %', 'roi'], ['Минут в игре', 'minutes']].map(([n, k]) =>
        h('div', { class: 'row between' }, h('div', { class: 'small' }, n), h('div', { class: 'small b' }, `${a.cmp.me[k] ?? '—'} : ${a.cmp.him[k] ?? '—'}`)))),
    !S.friends?.mentor && h('button', { class: 'btn-sm ghost', style: 'margin-top:6px', onclick: async () => { if (await run({ t: 'setMentor', id: f.id })) { toast(`${f.name} теперь твой наставник`); send({ t: 'friends' }); } } }, '🎓 Сделать наставником'),
    h('button', { class: 'btn-sm ghost', style: 'margin-top:6px', onclick: () => { if (confirm(`Удалить ${f.name} из друзей?`)) run({ t: 'removeFriend', id: f.id }); } }, 'Удалить из друзей'));
}

// ---------- Поделиться: картинка раздачи / достижения ----------

function shareLink(url, text) {
  const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(link);
  else navigator.clipboard?.writeText(url).then(() => toast('Ссылка скопирована'));
}

// рисуем карточку 1080×1080 на canvas
function drawShareCard({ title, subtitle, cards = [], board = [], footer }) {
  const c = document.createElement('canvas');
  c.width = 1080; c.height = 1080;
  const g = c.getContext('2d');
  const bg = g.createRadialGradient(540, 420, 80, 540, 540, 760);
  bg.addColorStop(0, '#1f4a4f'); bg.addColorStop(0.5, '#10272a'); bg.addColorStop(1, '#070e10');
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1080);
  g.fillStyle = '#eef2f4'; g.textAlign = 'center';
  g.font = '800 64px Inter, system-ui, sans-serif'; g.fillText(title, 540, 170);
  g.fillStyle = '#f2c94c'; g.font = '700 46px Inter, system-ui, sans-serif'; g.fillText(subtitle, 540, 250);
  const drawCard = (card, x, y, w, hh) => {
    g.fillStyle = '#f4f6f7'; g.beginPath(); g.roundRect(x, y, w, hh, 16); g.fill();
    const red = (card & 3) === 1 || (card & 3) === 2;
    g.fillStyle = red ? '#b3261e' : '#0b1416';
    const r = RANKS[card >> 2] === 'T' ? '10' : RANKS[card >> 2];
    g.font = `800 ${Math.round(w * 0.42)}px Inter, system-ui, sans-serif`; g.fillText(r, x + w / 2, y + hh * 0.45);
    g.font = `${Math.round(w * 0.4)}px sans-serif`; g.fillText(SUITS[card & 3], x + w / 2, y + hh * 0.85);
  };
  board.forEach((cd, i) => drawCard(cd, 540 - (board.length * 150) / 2 + i * 150 + 10, 360, 130, 182));
  cards.forEach((cd, i) => drawCard(cd, 540 - 160 + i * 170, board.length ? 620 : 420, 150, 210));
  g.fillStyle = '#b9c4c9'; g.font = '600 38px Inter, system-ui, sans-serif'; g.fillText(footer, 540, 1000);
  return c.toDataURL('image/png');
}

async function shareCard(card, text) {
  const r = await run({ t: 'shareImage', data: drawShareCard(card) });
  if (!r?.url) return;
  // в сторис (если Telegram умеет), иначе — ссылкой в чат
  if (S.shareTo === 'story' && tg?.shareToStory) tg.shareToStory(r.url, { text });
  else shareLink(r.url, text);
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
      `Ты и боты. Старт сразу. Столы по ${size === 9 ? 9 : size === 6 ? 6 : (S.soloSeats ?? 6)}, блайнды растут, вылетевших пересаживают — как в Большом турнире. Вылетел — турнир для тебя закончен, приз по месту.`),
    h('div', { class: 'field' },
      h('div', { class: 'label' }, 'Мест'),
      h('div', { class: 'choices' }, cfg.sizes.map((n) => h('button', { class: size === n ? 'on' : '', onclick: () => { S.soloSize = n; render(); } }, n)))),
    h('div', { class: 'field' },
      h('label', { class: 'toggle-row', style: 'margin-bottom:8px' },
        h('input', { type: 'checkbox', checked: !!S.soloKo, onchange: (e) => { S.soloKo = e.target.checked; render(); } }),
        h('span', {}, 'Нокаут'), h('span', { class: 'small muted' }, 'за каждого выбитого бота — полвзноса сразу')),
      // на 18 и 60 мест можно выбрать размер столов
      size > 9 && h('div', { class: 'label' }, 'Игроков за столом'),
      size > 9 && h('div', { class: 'choices', style: 'margin-bottom:8px' }, [6, 9].map((n) => h('button', { class: (S.soloSeats ?? 6) === n ? 'on' : '', onclick: () => { S.soloSeats = n; render(); } }, `по ${n}`))),
      h('div', { class: 'label' }, 'Блайнды растут каждые'),
      h('div', { class: 'choices' }, cfg.blinds.map((n) => h('button', { class: blind === n ? 'on' : '', onclick: () => { S.soloBlind = n; render(); } }, n < 1 ? `${n * 60} с · турбо` : `${n} мин`)))),
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
  const r = await run({ t: 'startSolo', demo: true, size: S.soloSize ?? 18, blindMin: S.soloBlind ?? 3, seats: S.soloSeats ?? 6 });
  if (r) go('table');
}

async function startSolo() {
  const r = await run({ t: 'startSolo', buyin: S.soloBuyin ?? 1000, size: S.soloSize ?? 18, blindMin: S.soloBlind ?? 3, ko: !!S.soloKo, seats: S.soloSeats ?? 6 });
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

const TOUR_PHRASES = ['Всем удачи!', 'GG', 'Го-го-го!', 'Кто сегодня заберёт?', 'Ну держитесь 😎', '🔥🔥🔥', '👑', 'Я в деле!'];

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
    // фразы в лобби турнира (только из набора)
    t.registered && h('div', { class: 'col', style: 'gap:8px' },
      h('div', { class: 'label' }, 'Чат участников'),
      (t.chat || []).length > 0 && h('div', { class: 'tour-chat' }, t.chat.slice(-8).map((c) => h('div', { class: 'small' }, h('b', {}, `${c.name}: `), c.text))),
      h('div', { class: 'phrase-row' }, TOUR_PHRASES.map((p, i) => h('button', { class: 'phrase', onclick: () => send({ t: 'tourSay', id: t.id, i }) }, p)))),
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
    h('div', { class: 'item', style: 'padding:14px;border-radius:16px' },
      h('div', { class: 'col' }, h('div', { style: 'font-size:15px;font-weight:600' }, 'Нокаут'), h('div', { class: 'small soft' }, 'Половина взноса — награда за голову: выбил игрока — забрал сразу')),
      h('button', { class: `switch ${c.ko ? 'on' : ''}`, role: 'switch', 'aria-checked': String(!!c.ko), 'aria-label': 'Турнир-нокаут', onclick: () => { c.ko = !c.ko; render(); } })),
    h('div', { class: 'small muted', style: 'line-height:1.5;padding-bottom:70px' }, prizeText(c.maxPlayers)),
    h('button', { class: 'btn cta', onclick: createTour }, 'Создать и позвать друзей'));
}

async function createTour() {
  const c = S.create;
  const buyin = c.buyin === 'own' ? Number(c.customBuyin) : c.buyin;
  const r = await run({ t: 'createT', tour: { ...c, buyin, minRating: Number(c.minRating) || 0 } });
  if (r) {
    S.create.club = false;
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
    // промокод
    h('div', { class: 'row', style: 'gap:8px' },
      h('input', { class: 'buyin-input', style: 'margin:0;flex:1', id: 'promo', placeholder: 'Промокод', value: S.promo || '', oninput: (e) => { S.promo = e.target.value; } }),
      h('button', { class: 'btn-sm', onclick: async () => { const r = await run({ t: 'redeemPromo', code: S.promo }); if (r) { toast(r.text); S.promo = ''; render(); } } }, 'Активировать')),
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
    me.isAdmin && h('button', { class: 'btn-ghost', onclick: () => go('admin') }, '⚙️ Админка'),
    h('div', { class: 'glass card' },
      h('div', { class: 'grid3' }, stat('Место', fmt(me.ratingPlace)), stat('Турниров', me.games), stat('Побед', me.wins)),
      h('div', { class: 'grid3' }, stat('Раздач выиграно', fmt(me.handsWon || 0)), stat('Эло', me.rating), stat('Подсказок', me.hints || 0)),
      h('div', { class: 'grid3' }, stat('Фишки', fmt(me.chips)), stat('В игре', fmt(me.inPlay)), stat('По фишкам', fmt(me.chipsPlace)))),
    winRewardsCard(me),
    themesCard(),
    lookCard(),
    settingsCard(),
    h('button', { class: 'item', onclick: () => openTutorial(0) },
      h('div', { class: 'col' }, h('div', { class: 'b', style: 'font-size:14px' }, 'Как играть'), h('div', { class: 'small muted' }, 'Обучение покеру с нуля')),
      icon('chev')),
    // таблицы лидеров
    h('div', { class: 'label' }, 'Лучшие игроки'),
    h('div', { class: 'seg' }, [['rating', 'Эло'], ['hands', 'Раздачи'], ['pot', 'Банк'], ['bots', 'Боты']].map(([k, label]) => h('button', {
      class: (S.topKind || 'rating') === k ? 'on' : '', onclick: () => { S.topKind = k; S.top = null; send({ t: 'top', kind: k }); render(); },
    }, label))),
    S.top == null ? h('div', { class: 'muted small' }, 'Загрузка…')
      : S.top.length ? S.top.map((p, i) => h('div', { class: 'item' },
        h('div', { class: 'row' }, h('div', { class: 'seat-dot taken' }, i + 1),
          h('div', { class: 'col', style: 'gap:0' }, h('div', { class: 'b', style: 'font-size:14px' }, p.name),
            h('div', { class: 'small', style: `color:${p.rankColor}` }, p.rank))),
        h('div', { class: 'b' }, fmt(p.value))))
        : h('div', { class: 'muted small' }, 'Пока пусто — сыграй первым'),
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

const SCREENS = { stats: statsScreen, style: styleScreen, school: schoolScreen, chart: chartScreen, quiz: quizScreen, exam: examScreen, history: historyScreen, replay: replayScreen, botlab: botLabScreen, training: trainingScreen, tutorial: tutorialScreen, admin: adminScreen, friends: friendsScreen, progress: progressScreen, solo: soloScreen, mixed: mixedScreen, combos: combosScreen, lobby: lobbyScreen, bots: botsScreen, table: tableScreen, tours: toursScreen, tour: tourScreen, create: createScreen, wallet: walletScreen, profile: profileScreen };

function render() {
  const app = document.getElementById('app');
  const active = document.activeElement;
  const focusId = active?.id && active.tagName !== 'BUTTON' ? active.id : null;
  if (S.error) return app.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'center-msg' }, h('div', { class: 'h2' }, 'Покер'), h('div', { class: 'muted' }, S.error))));
  if (!S.me || S.screen === 'loading') return app.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'center-msg muted' }, S.connected ? 'Входим…' : 'Подключаемся…')));
  app.replaceChildren(SCREENS[S.screen]());
  // ты за столом, но смотришь меню — маленькая плашка, нажми чтобы вернуться
  if (S.table && S.screen !== 'table' && !S.table.watching) {
    const myTurnNow = S.turn && S.table.actor === S.me.id;
    app.append(h('button', { class: `mini-table ${myTurnNow ? 'turn' : ''}`, onclick: () => go('table') }, myTurnNow ? '⏰ Твой ход!' : `🃏 За столом · банк ${fmt(S.table.pot || 0)}`));
  }
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
function sessionText() {
  const ss = S.session;
  if (!ss) return '';
  const sec = Math.floor((Date.now() - ss.start) / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} · раздач ${ss.hands} · выиграно ${ss.won}`;
}

setInterval(() => {
  const sl = document.querySelector('[data-session]');
  if (sl) sl.textContent = sessionText();
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
applyUi();
tg?.disableVerticalSwipes?.();
render();
connect();
setInterval(() => { if (['lobby', 'tours', 'tour'].includes(S.screen)) render(); }, 30000);

// ---------- Горячие клавиши (ПК), свайпы и двойной тап (телефон) ----------
function myTurnNow() { return S.screen === 'table' && S.turn && S.table?.actor === S.me?.id && S.curAct; }
document.addEventListener('keydown', (e) => {
  if (!myTurnNow() || e.target.tagName === 'INPUT') return;
  const t = S.turn;
  const k = e.key.toLowerCase();
  if (k === 'f' || k === 'а') S.curAct({ type: 'fold' });
  else if (k === 'c' || k === 'с') S.curAct({ type: t.toCall > 0 ? 'call' : 'check' });
  else if ((k === 'r' || k === 'к') && t.maxTo > t.currentBet) S.curAct({ type: 'raise', to: S.raiseTo });
  else if ((k === 'a' || k === 'ф') && t.maxTo > t.currentBet) S.curAct({ type: 'raise', to: t.maxTo });
  else if (k === 'h' || k === 'р') askHint();
});
let touch0 = null;
document.addEventListener('touchstart', (e) => { const p = e.touches[0]; touch0 = { x: p.clientX, y: p.clientY, el: e.target, at: Date.now() }; }, { passive: true });
document.addEventListener('touchend', (e) => {
  if (!touch0 || !myTurnNow()) return;
  const p = e.changedTouches[0];
  const dx = p.clientX - touch0.x, dy = p.clientY - touch0.y;
  const onPanel = touch0.el.closest?.('.panel') && !touch0.el.closest('input');
  if (onPanel && Date.now() - touch0.at < 600) {
    if (dx < -80 && Math.abs(dy) < 50) S.curAct({ type: 'fold' });
    else if (dy < -70 && Math.abs(dx) < 50) S.curAct({ type: S.turn.toCall > 0 ? 'call' : 'check' });
  }
  touch0 = null;
}, { passive: true });
let lastTap = 0;
document.addEventListener('click', (e) => {
  if (!e.target.closest?.('.felt-wrap') || e.target.closest('button, [data-seat]') || !myTurnNow()) return;
  if (Date.now() - lastTap < 350) { S.curAct({ type: S.turn.toCall > 0 ? 'call' : 'check' }); lastTap = 0; } else lastTap = Date.now();
});
// напоминание про перерыв: час подряд за столом
setInterval(() => {
  if (!S.session || loadUi().breakRemind === false) return;
  const mins = Math.floor((Date.now() - S.session.start) / 60000);
  if (mins > 0 && mins % 60 === 0 && S.session.lastBreak !== mins) { S.session.lastBreak = mins; toast(`⏸ Ты играешь уже ${mins / 60} ч — сделай перерыв, разомнись и попей воды`); }
}, 30000);
