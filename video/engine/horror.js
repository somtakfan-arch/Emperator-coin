// Хоррор «Правила подъезда»: 3 серии по 2,5–3 минуты. Номера 501–503.
// Свой сюжет. Страшно атмосферой: тьма, мигающий свет, тень, звук. Без крови.

PRESETS.oldman = { hair: 'short', hairCol: '#c9ced8', top: '#5c4a3a', top2: '#4e3f31', mustache: true, beard: true };
const HRED = '#ff4d4d';

// время из кадра: число или 'v3' / 'v3+0.5' — момент начала 3-й фразы озвучки
function rt(P, at) {
  if (typeof at !== 'string') return at;
  const m = at.match(/^v(\d+)([+-][\d.]+)?$/);
  if (!m) return 0;
  const base = (P.voT && P.voT[+m[1]]) ? P.voT[+m[1]][0] : +m[1] * 2;
  return base + (m[2] ? +m[2] : 0);
}
const kfr = (list, lt, P) => kf((list || []).map(([a, s]) => [rt(P, a), s]), lt);
const flick = (lt, P) => {
  for (const [a, b] of P.flicker || []) { const A = rt(P, a), B = rt(P, b); if (lt > A && lt < B) return rnd(Math.floor(lt * 18)) > .45 ? 1 : .15; }
  return 1;
};
function snowLayer(lt, n = 60, col = '#fff') {
  let s = '';
  for (let i = 0; i < n; i++) { const x = (rnd(i) * W + Math.sin(lt * .8 + i) * 30 + lt * 15) % W, y = (rnd(i + 99) * H + lt * (60 + rnd(i + 7) * 90)) % H; s += `<circle cx="${x}" cy="${y}" r="${1.5 + rnd(i + 3) * 3}" fill="${col}" opacity="${.35 + rnd(i + 5) * .5}"/>`; }
  return s;
}
const vignette = (k = .85, col = '#000') => `<defs><radialGradient id="vgn" cx=".5" cy=".45" r=".75"><stop offset=".45" stop-color="${col}" stop-opacity="0"/><stop offset="1" stop-color="${col}" stop-opacity="${k}"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#vgn)"/>`;

// тень-фигура: turn 0 — спиной, 1 — лицом (белые точки глаз)
function shade(x, y, s, turn = 0, reach = 0) {
  const eyes = turn > .5 ? `<circle cx="-14" cy="-388" r="5" fill="#f1f3f5" opacity="${(turn - .5) * 2}"/><circle cx="14" cy="-388" r="5" fill="#f1f3f5" opacity="${(turn - .5) * 2}"/>` : '';
  const arm = (side) => `<path d="M${side * 48},-300 Q${side * (70 + reach * 60)},${-180 - reach * 120} ${side * (60 + reach * 140)},${-40 - reach * 200}" fill="none" stroke="#05060a" stroke-width="22" stroke-linecap="round"/>`;
  return `<g transform="translate(${x},${y}) scale(${s})"><ellipse cx="0" cy="0" rx="70" ry="14" fill="#000" opacity=".5"/><path d="M-50,-320 Q-60,-150 -40,0 L-12,0 L-6,-140 L6,-140 L12,0 L40,0 Q60,-150 50,-320 Q30,-350 0,-352 Q-30,-350 -50,-320Z" fill="#05060a"/>${arm(-1)}${arm(1)}<ellipse cx="0" cy="-385" rx="38" ry="46" fill="#05060a"/>${eyes}</g>`;
}

// ---------------- СЦЕНЫ ----------------
const SC = {};
SC.ext = (lt, P) => {
  let s = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070d"/><stop offset="1" stop-color="#1b2238"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  s += `<rect x="110" y="170" width="500" height="940" fill="#20263a" stroke="#0b0e16" stroke-width="8"/>`;
  for (let r = 0; r < 12; r++) for (let c = 0; c < 5; c++) {
    const lit = (r === 0 && c === 3) || rnd(r * 7 + c) > .82;
    s += `<rect x="${140 + c * 92}" y="${1050 - (r + 1) * 72}" width="54" height="44" fill="${lit ? '#ffd27a' : '#0f1320'}" opacity="${lit ? .9 : 1}"/>`;
  }
  s += `<rect y="1100" width="${W}" height="180" fill="#c9d1dc"/><rect x="330" y="980" width="70" height="120" fill="#0f1320" stroke="#0b0e16" stroke-width="6"/>`;
  s += `<rect x="40" y="760" width="12" height="340" fill="#2a2f3a"/><path d="M46,760 L100,760" stroke="#2a2f3a" stroke-width="10"/><circle cx="100" cy="770" r="14" fill="#ffe8a0"/><path d="M100,770 L20,1100 L200,1100Z" fill="#ffe8a0" opacity=".12"/>`;
  const kx = lerp(120, 330, eio(seg(lt, .5, rt(P, 'v2'))));
  s += `<g transform="translate(${kx},1160) scale(.32)">${person({ who: 'kid', eyes: 'tired', mouth: 'flat', armL: 5, armR: 5, bob: Math.abs(Math.sin(lt * 6)) * -8 })}</g>`;
  s += snowLayer(lt, 80);
  return { bg: s };
};
SC.liftIn = (lt, P) => {
  const fl = flick(lt, P);
  let s = `<defs><linearGradient id="lw" x1="0" x2="1"><stop offset="0" stop-color="#2c313b"/><stop offset=".5" stop-color="#4a505c"/><stop offset="1" stop-color="#2c313b"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#lw)"/>`;
  for (let i = 0; i < 24; i++) s += `<line x1="${i * 30}" y1="0" x2="${i * 30}" y2="${H}" stroke="#fff" stroke-opacity=".025" stroke-width="2"/>`;
  s += `<rect y="1120" width="${W}" height="160" fill="#1c1f26"/><rect x="0" y="0" width="${W}" height="70" fill="#1c1f26"/><rect x="200" y="20" width="320" height="34" rx="10" fill="#fffbe0" opacity="${.25 + .75 * fl}"/>`;
  if (fl > .5) s += `<path d="M200,54 L520,54 L700,500 L20,500Z" fill="#fffbe0" opacity=".05"/>`;
  // табло этажа
  const fs = kfr(P.floor, lt, P);
  s += `<rect x="560" y="380" width="120" height="70" rx="8" fill="#0b0b0d" stroke="#111" stroke-width="5"/><text x="620" y="432" font-size="46" font-weight="800" fill="${HRED}" text-anchor="middle" font-family="JetBrains Mono">${esc(fs.n ?? '1')}</text>`;
  // панель
  s += `<rect x="565" y="470" width="110" height="${P.zero ? 470 : 410}" rx="10" fill="#8a919c" stroke="#2a2e36" stroke-width="5"/>`;
  for (let i = 0; i < 12; i++) { const c = i % 2, r = Math.floor(i / 2); const lab = String(12 - (r * 2 + (1 - c))); s += `<circle cx="${595 + c * 50}" cy="${510 + r * 60}" r="18" fill="${(fs.lit || []).includes(lab) ? '#ffd27a' : '#c9ced8'}" stroke="#2a2e36" stroke-width="4"/><text x="${595 + c * 50}" y="${516 + r * 60}" font-size="16" font-weight="800" fill="#2a2e36" text-anchor="middle">${lab}</text>`; }
  if (P.zero) s += `<circle cx="620" cy="890" r="20" fill="${HRED}" stroke="#2a2e36" stroke-width="4" opacity="${.6 + .4 * Math.sin(lt * 4)}"/><text x="620" y="897" font-size="18" font-weight="900" fill="#fff" text-anchor="middle">0</text>`;
  if (P.noteWall !== false) s += `<g transform="translate(120,560) rotate(-4)"><rect width="150" height="190" fill="#efe6cf"/>${[0, 1, 2, 3, 4].map(i => `<rect x="18" y="${40 + i * 28}" width="${110 - (i % 2) * 30}" height="8" fill="#5c5040" opacity=".6"/>`).join('')}<rect x="50" y="-10" width="50" height="20" fill="#d9d0b8" opacity=".85"/></g>`;
  return { bg: s, dark: (1 - fl) * .7 };
};
SC.doors = (lt, P) => {
  const red = P.red, fl = flick(lt, P);
  const o = eio(clamp(kfr(P.open, lt, P).v ?? 0));
  const wall = red ? '#2a0d10' : '#151821', floor = red ? '#1a0608' : '#0c0e14', lamp = red ? '#ff3b3b' : '#fff1c1';
  let s = `<rect width="${W}" height="${H}" fill="#07080b"/>`;
  // коридор в перспективе
  s += `<path d="M60,180 L300,520 L420,520 L660,180Z" fill="${wall}" opacity=".9"/><path d="M60,1180 L300,760 L420,760 L660,1180Z" fill="${floor}"/><path d="M60,180 L300,520 L300,760 L60,1180Z" fill="${wall}"/><path d="M660,180 L420,520 L420,760 L660,1180Z" fill="${wall}"/><rect x="300" y="520" width="120" height="240" fill="${red ? '#120406' : '#08090d'}"/>`;
  for (let i = 0; i < 4; i++) { const k = .25 + i * .2; s += `<rect x="${lerp(60, 300, k) - 6}" y="${lerp(330, 560, k)}" width="${lerp(60, 20, k)}" height="${lerp(420, 160, k)}" fill="${red ? '#3a1015' : '#1d212c'}" stroke="#000" stroke-width="3"/><rect x="${lerp(660, 420, k) - lerp(60, 20, k) + 6}" y="${lerp(330, 560, k)}" width="${lerp(60, 20, k)}" height="${lerp(420, 160, k)}" fill="${red ? '#3a1015' : '#1d212c'}" stroke="#000" stroke-width="3"/>`; }
  s += `<defs><radialGradient id="lampg" cx=".5" cy=".3" r=".6"><stop offset="0" stop-color="${lamp}" stop-opacity="${.55 * fl}"/><stop offset="1" stop-color="${lamp}" stop-opacity="0"/></radialGradient></defs><rect x="240" y="470" width="240" height="330" fill="url(#lampg)"/><rect x="300" y="520" width="120" height="240" fill="${lamp}" opacity="${.18 * fl}"/><circle cx="360" cy="535" r="10" fill="${lamp}" opacity="${fl}"/>`;
  const F = kfr(P.fig, lt, P);
  if (F.show) s += shade(360 + (F.x || 0), F.y ?? 760, F.s ?? .35, F.turn ?? 0, F.reach ?? 0);
  if (red && P.mirror) s += `<text x="360" y="300" font-size="40" font-weight="900" fill="#ff8a8a" opacity=".5" text-anchor="middle" transform="scale(-1,1) translate(-720,0)">12</text>`;
  // створки
  const lx = 360 - o * 300;
  s += `<rect x="${lx - 320}" y="120" width="320" height="1100" fill="#6b717c" stroke="#2a2e36" stroke-width="6"/><rect x="${720 - lx}" y="120" width="320" height="1100" fill="#6b717c" stroke="#2a2e36" stroke-width="6"/>`;
  s += `<rect x="0" y="0" width="${W}" height="120" fill="#2a2e36"/><rect x="0" y="1220" width="${W}" height="60" fill="#2a2e36"/><rect x="0" y="0" width="40" height="${H}" fill="#2a2e36"/><rect x="680" y="0" width="40" height="${H}" fill="#2a2e36"/>`;
  return { bg: s, dark: red ? .1 : (1 - fl) * .5, tint: red ? '#ff0000' : null };
};
SC.note = (lt, P) => {
  let s = `<rect width="${W}" height="${H}" fill="#1a1c22"/>`;
  s += `<g transform="translate(360,620) rotate(${-2 + Math.sin(lt * .6)}) scale(${1 + seg(lt, 0, 6) * .04})"><rect x="-300" y="-430" width="600" height="860" fill="${P.red ? '#e9cfc6' : '#efe6cf'}" stroke="#00000033" stroke-width="2"/><rect x="-60" y="-450" width="120" height="40" fill="#d9d0b8" opacity=".9"/>`;
  s += `<text x="0" y="-350" font-size="40" font-weight="700" fill="#2a2016" text-anchor="middle" font-family="DejaVu Serif" font-style="italic">${esc(P.head || 'Правила для жильцов')}</text><text x="0" y="-305" font-size="30" fill="#2a2016" text-anchor="middle" font-family="DejaVu Serif" font-style="italic">${esc(P.sub || 'после 00:00')}</text>`;
  let y = -220;
  (P.rules || []).forEach((r, i) => {
    const at = rt(P, r.at ?? 0); if (lt < at) { y += 40 + wrap(r.text, 26).length * 44; return; }
    const p = clamp((lt - at) / .6), lines = wrap(r.text, 26), hi = r.red;
    lines.forEach((l, k) => s += `<text x="-250" y="${y + k * 44}" font-size="34" fill="${hi ? '#a51d1d' : '#2a2016'}" font-family="DejaVu Serif" font-style="italic" opacity="${p}">${esc(l)}</text>`);
    if (P.hi === i && lt > rt(P, P.hiAt ?? 0)) s += `<path d="M-255,${y + lines.length * 44 - 30} L250,${y + lines.length * 44 - 26}" stroke="${HRED}" stroke-width="5" opacity=".8"/>`;
    y += 40 + lines.length * 44;
  });
  s += `</g>`;
  return { bg: s, dark: 0 };
};
SC.panel = (lt, P) => {
  const fl = flick(lt, P);
  let s = `<rect width="${W}" height="${H}" fill="#3a3f49"/><rect x="160" y="160" width="400" height="${P.zero ? 1000 : 900}" rx="24" fill="#9aa1ac" stroke="#2a2e36" stroke-width="8"/>`;
  const fs = kfr(P.floor, lt, P);
  s += `<rect x="230" y="200" width="260" height="120" rx="10" fill="#0b0b0d"/><text x="360" y="292" font-size="90" font-weight="800" fill="${HRED}" text-anchor="middle" font-family="JetBrains Mono">${esc(fs.n ?? '1')}</text>`;
  const pressed = kfr(P.press, lt, P).b;
  const btn = (x, y, lab, red) => { const on = pressed === lab || (fs.lit || []).includes(lab); return `<circle cx="${x}" cy="${y}" r="46" fill="${red ? HRED : on ? '#ffd27a' : '#d9dde3'}" stroke="#2a2e36" stroke-width="6"/>${on ? `<circle cx="${x}" cy="${y}" r="70" fill="#ffd27a" opacity=".2"/>` : ''}<text x="${x}" y="${y + 14}" font-size="38" font-weight="900" fill="${red ? '#fff' : '#2a2e36'}" text-anchor="middle">${lab}</text>`; };
  for (let i = 0; i < 12; i++) { const c = i % 2, r = Math.floor(i / 2); s += btn(290 + c * 140, 400 + r * 115, String(12 - (r * 2 + (1 - c)))); }
  if (P.zero) s += btn(360, 1100, '0', true);
  // палец
  const H2 = kfr(P.hand, lt, P);
  if (H2.at) { const [hx, hy] = H2.at; const push = Math.max(0, Math.sin((lt - rt(P, H2.t || 0)) * 10)) * 10; s += `<g transform="translate(${hx + 30},${hy + 40 + push})"><rect x="-26" y="0" width="52" height="260" rx="26" fill="#f1d3b8" stroke="${OL}" stroke-width="6"/><rect x="-80" y="200" width="160" height="300" rx="50" fill="#f1d3b8" stroke="${OL}" stroke-width="6"/><rect x="-18" y="8" width="36" height="34" rx="12" fill="#f8e6d6"/></g>`; }
  return { bg: s, dark: (1 - fl) * .6 };
};
SC.hall = (lt, P) => {
  const lit = clamp(kfr(P.lit, lt, P).v ?? 0);
  const shake = (P.knocks || []).reduce((a, k) => { const t0 = rt(P, k); for (let j = 0; j < 3; j++) { const d = lt - (t0 + j * .45); if (d > 0 && d < .18) a = Math.sin(d * 120) * 8 * (1 - d / .18); } return a; }, 0);
  let s = `<rect width="${W}" height="${H}" fill="${lit > .5 ? '#5a5046' : '#1d1a17'}"/><rect y="1080" width="${W}" height="200" fill="${lit > .5 ? '#3a2f26' : '#0f0d0b'}"/>`;
  s += `<g transform="translate(${shake},0)"><rect x="230" y="320" width="270" height="760" fill="#4a3426" stroke="#120d0a" stroke-width="10"/><rect x="255" y="350" width="220" height="700" fill="#553c2c"/><circle cx="365" cy="480" r="12" fill="#c9ced8" stroke="#000" stroke-width="5"/>`;
  const ang = kfr(P.handle, lt, P).a || 0;
  s += `<g transform="translate(455,720) rotate(${ang})"><rect x="-60" y="-10" width="70" height="20" rx="10" fill="#c9b48a" stroke="#000" stroke-width="4"/></g><circle cx="455" cy="720" r="16" fill="#a88f62" stroke="#000" stroke-width="4"/>`;
  const tight = ang < -10;
  s += `<path d="M470,600 ${tight ? 'L520,600' : 'Q495,640 520,600'}" fill="none" stroke="#c9ced8" stroke-width="6" stroke-dasharray="8 4"/><rect x="515" y="588" width="18" height="26" fill="#adb5bd"/></g>`;
  s += `<rect x="585" y="660" width="50" height="76" rx="8" fill="#e9ecef" stroke="#000" stroke-width="4"/><rect x="600" y="${lit > .5 ? 676 : 700}" width="20" height="26" rx="4" fill="#adb5bd"/>`;
  (P.knocks || []).forEach((k, i) => { const t0 = rt(P, k); for (let j = 0; j < 3; j++) { const d = lt - (t0 + j * .45); if (d > 0 && d < .7) s += `<text x="${560 - j * 40}" y="${520 + j * 60}" font-size="44" font-weight="900" fill="#e9ecef" opacity="${1 - d / .7}" transform="rotate(${-8 + j * 6} 520 560)">тук</text>`; } });
  if (lit > .5) s += `<rect x="300" y="0" width="120" height="30" fill="#fff6d6"/>`;
  return { bg: s, dark: lit > .5 ? 0 : .55 };
};
SC.room = (lt, P) => {
  let s = `<rect width="${W}" height="${H}" fill="#14171f"/><rect x="420" y="180" width="240" height="320" fill="#1d2a44" stroke="#0a0c12" stroke-width="10"/><circle cx="560" cy="260" r="34" fill="#dfe6f2"/><path d="M420,500 L660,500 L560,1080 L250,1080Z" fill="#9fb4d6" opacity=".08"/>`;
  s += `<rect x="40" y="900" width="520" height="80" rx="16" fill="#2a3042"/><rect x="40" y="960" width="560" height="200" fill="#20253a"/><rect x="60" y="860" width="140" height="70" rx="20" fill="#cfd6e4"/>`;
  return { bg: s, dark: .25 };
};
SC.momRoom = (lt, P) => {
  let s = `<rect width="${W}" height="${H}" fill="#0f1218"/><rect x="40" y="200" width="160" height="880" fill="#2a2016" stroke="#000" stroke-width="8"/><path d="M200,200 L700,320 L700,1080 L200,1080Z" fill="#161b26"/><path d="M500,330 L620,350 L540,1080 L330,1080Z" fill="#a8b8d8" opacity=".07"/>`;
  s += `<rect x="260" y="760" width="420" height="200" rx="20" fill="#3a4258"/><rect x="250" y="700" width="440" height="110" rx="40" fill="#5c6f9e"/><ellipse cx="330" cy="700" rx="70" ry="40" fill="#dfe3ea"/>`;
  const br = Math.sin(lt * 1.6) * 4;
  s += `<g transform="translate(345,${676 + br}) rotate(-80) scale(.5)"><g transform="translate(0,420)">${person({ who: 'mom', eyes: 'closed', mouth: 'flat', legs: false, armL: 10, armR: 10 })}</g></g><path d="M260,${720 + br} Q470,${660 + br} 690,${720 + br} L690,820 L260,820Z" fill="#6b7fb0"/>`;
  return { bg: s, dark: .3 };
};
SC.peep = (lt, P) => {
  let inner = SC.doors(lt, Object.assign({}, P, { open: [[0, { v: 1 }]] })).bg;
  const r = 300;
  let s = `<rect width="${W}" height="${H}" fill="#000"/><defs><clipPath id="pp"><circle cx="360" cy="620" r="${r}"/></clipPath><radialGradient id="ppv"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".95"/></radialGradient></defs>`;
  s += `<g clip-path="url(#pp)"><g transform="translate(360,620) scale(1.25,1.25) translate(-360,-640)">${inner}</g><rect x="0" y="0" width="${W}" height="${H}" fill="#000" opacity=".35"/><circle cx="360" cy="620" r="${r}" fill="url(#ppv)"/></g>`;
  return { bg: s, dark: 0 };
};
SC.phone = (lt, P) => {
  let s = `<rect width="${W}" height="${H}" fill="#07080b"/><circle cx="360" cy="620" r="420" fill="#4a6cff" opacity=".08"/>`;
  let inner = `<rect x="-152" y="-312" width="304" height="624" rx="36" fill="#0f1320"/><text y="-240" font-size="18" font-weight="700" fill="#8a92a6" text-anchor="middle">Неизвестный номер</text>`;
  (P.msgs || []).forEach((m, i) => { const at = rt(P, m.at); if (lt < at) return; const p = seg(lt, at, at + .35); const lines = wrap(m.text, 18); inner += `<g opacity="${p}" transform="translate(-130,${-180 + i * 120})"><rect width="${Math.max(...lines.map(l => l.length)) * 11 + 34}" height="${26 + lines.length * 26}" rx="18" fill="#2a2f3e"/>${lines.map((l, k) => `<text x="17" y="${32 + k * 26}" font-size="20" font-weight="600" fill="#f1f3f5">${esc(l)}</text>`).join('')}</g>`; });
  s += phoneFrame(360, 620, 1.1, inner, -2, true);
  return { bg: s, dark: 0 };
};
SC.dayHall = (lt, P) => {
  let s = `<rect width="${W}" height="${H}" fill="#cfc6b4"/><rect y="1000" width="${W}" height="280" fill="#8a7d6a"/>`;
  for (let y = 1000; y < H; y += 60) for (let x = (y / 60 % 2) * 30; x < W; x += 60) s += `<rect x="${x}" y="${y}" width="56" height="56" fill="#9a8c76" opacity=".5"/>`;
  [['46', 40], ['47', 280], ['48', 520]].forEach(([n, x]) => { s += `<rect x="${x}" y="360" width="170" height="640" fill="#5c4636" stroke="#2a2016" stroke-width="8"/><text x="${x + 85}" y="420" font-size="34" font-weight="800" fill="#e9dcc3" text-anchor="middle">${n}</text>`; });
  if (P.sealed !== false) s += `<path d="M285,560 L445,760 M445,560 L285,760" stroke="#e9e2cf" stroke-width="22"/><rect x="315" y="620" width="100" height="80" fill="#f3efe3" stroke="#a51d1d" stroke-width="4"/><circle cx="365" cy="660" r="20" fill="none" stroke="#a51d1d" stroke-width="4"/>`;
  return { bg: s, dark: 0 };
};
SC.title = (lt, P) => {
  const fl = rnd(Math.floor(lt * 14)) > .15 ? 1 : .3;
  let s = `<rect width="${W}" height="${H}" fill="#050507"/>${snowLayer(lt, 40, '#8a92a6')}`;
  s += `<text x="360" y="520" font-size="34" font-weight="700" fill="#8a92a6" text-anchor="middle" letter-spacing="6">ПРАВИЛА ПОДЪЕЗДА</text>`;
  s += `<text x="360" y="610" font-size="44" font-weight="800" fill="#c9ced8" text-anchor="middle" opacity="${eo(seg(lt, .3, .9))}">${esc(P.kicker)}</text>`;
  wrap(P.name, 14).forEach((l, i) => s += `<text x="360" y="${720 + i * 86}" font-size="78" font-weight="900" fill="${HRED}" text-anchor="middle" opacity="${fl * eo(seg(lt, .6, 1.3))}">${esc(l)}</text>`);
  return { bg: s, dark: 0 };
};
SC.end = (lt, P) => {
  const fl = rnd(Math.floor(lt * 10)) > .12 ? 1 : .2;
  let s = `<rect width="${W}" height="${H}" fill="#050507"/>`;
  wrap(P.name || 'Продолжение следует', 16).forEach((l, i) => s += `<text x="360" y="${600 + i * 70}" font-size="56" font-weight="900" fill="${HRED}" text-anchor="middle" opacity="${fl * eo(seg(lt, .2, 1))}">${esc(l)}</text>`);
  if (P.sub) s += `<text x="360" y="760" font-size="30" font-weight="700" fill="#8a92a6" text-anchor="middle">${esc(P.sub)}</text>`;
  return { bg: s, dark: 0 };
};

// ---------------- ШАБЛОН ----------------
T.hor = {
  draw(lt, P, t) {
    const sc = SC[P.scene](lt, P);
    let s = sc.bg;
    (P.chars || []).forEach((c, i) => {
      const st = kfr(c.k, lt, P);
      const o = Object.assign({ who: c.who }, c.o || {}, st);
      const speaking = (P.lines || []).some(l => l.who === (i === 0 ? 'A' : 'B') && lt >= l.at && lt < l.until - .5);
      if (speaking) o.mouth = Math.floor(lt * 8) % 2 ? 'open' : (st.mouth || 'flat');
      s += `<g transform="translate(${c.x},${c.y ?? 1330}) scale(${c.s ?? 1})">${person(o)}</g>`;
    });
    if (sc.fg) s += sc.fg;
    const cur = [...(P.lines || [])].reverse().find(l => lt >= l.at && lt < l.until);
    if (cur && P.chars) { const c = P.chars[cur.who === 'A' ? 0 : 1] || P.chars[0]; s += speech(clamp(c.x, 200, 520), P.bubbleY ?? 380, cur.text, seg(lt, cur.at, cur.at + .3), clamp(c.x - clamp(c.x, 200, 520), -120, 120)); }
    if (cur && !P.chars) s += speech(360, P.bubbleY ?? 300, cur.text, seg(lt, cur.at, cur.at + .3), 0, true);
    const dark = (sc.dark || 0) + (P.dark || 0);
    if (dark > 0) s += `<rect width="${W}" height="${H}" fill="#000" opacity="${clamp(dark, 0, .9)}"/>`;
    if (sc.tint) s += `<rect width="${W}" height="${H}" fill="${sc.tint}" opacity=".12"/>`;
    s += vignette(P.vig ?? .85);
    // HUD: время и этаж
    if (P.time) {
      let tm = P.time;
      if (Array.isArray(tm)) { let a = hm(tm[0]), b = hm(tm[1]); if (b < a) b += 1440; tm = fmtTime(lerp(a, b, seg(lt, .3, P.d - .3))); }
      s += `<g transform="translate(24,40)"><rect width="150" height="56" rx="12" fill="#000" opacity=".7" stroke="#3a3f4a" stroke-width="2"/><circle cx="26" cy="28" r="7" fill="${HRED}" opacity="${.5 + .5 * Math.sin(lt * 5)}"/><text x="88" y="38" font-size="28" font-weight="800" fill="#e9ecef" text-anchor="middle" font-family="JetBrains Mono">${tm}</text></g>`;
    }
    if (P.floorHud) { const fs = kfr(P.floor, lt, P); s += `<g transform="translate(546,40)"><rect width="150" height="56" rx="12" fill="#000" opacity=".7" stroke="#3a3f4a" stroke-width="2"/><text x="75" y="38" font-size="26" font-weight="800" fill="${String(fs.n || '').startsWith('-') ? HRED : '#e9ecef'}" text-anchor="middle">этаж ${esc(fs.n ?? '1')}</text></g>`; }
    return s;
  },
  sfx(P) {
    const ev = [];
    (P.knocks || []).forEach(k => { const t0 = rt(P, k); for (let j = 0; j < 3; j++) ev.push([t0 + j * .45, 'knock']); });
    (P.flicker || []).forEach(([a, b]) => ev.push([rt(P, a), 'fbuzz', { d: rt(P, b) - rt(P, a) }]));
    (P.sfx || []).forEach(([a, k, o]) => ev.push([rt(P, a), k, o || {}]));
    return ev;
  },
};

// ---------------- СЕРИИ ----------------
const N = t => ['h_n', t];
const hs = (scene, seq, o = {}) => Object.assign({ type: 'hor', scene, seq }, o);
const KID = (k, x = 360, s = 1.15, y = 1340) => ({ who: 'kid', x, y, s, k });

const HORROR = [
{ n: 501, title: 'Записка в лифте', mood: 'horror', shots: [
  hs('title', [N('Правила подъезда. Часть первая. *Записка в лифте*.')], { kicker: 'Часть 1', name: 'Записка в лифте', noSubs: true, sfx: [[.1, 'stinger']] }),
  hs('ext', [N('Ты переехал в этот дом *три дня* назад.'), N('Двенадцать этажей, старый лифт и соседи, которых ты *ни разу* не видел.'), N('Сегодня ты возвращаешься с тренировки позже обычного. Почти *полночь*.'), N('Во дворе ни души. Только снег и *жёлтый* фонарь.')], { time: '23:52' }),
  hs('liftIn', [N('Заходишь в лифт. Нажимаешь *двенадцать*.'), N('Лифт старый. Гудит так, будто думает, *стоит ли* вообще ехать.'), N('И замечаешь на стене *листок*, приклеенный скотчем.')], { time: '23:58', floor: [[0, { n: '1', lit: ['12'] }]], floorHud: true, chars: [KID([[0, { eyes: 'tired', mouth: 'flat' }], ['v2', { eyes: 'normal', look: [-.9, -.3] }]])], sfx: [[.2, 'ding'], [.4, 'hum', { d: 8 }]] }),
  hs('note', [N('«Правила для жильцов. *После полуночи*».'), N('Правило первое. Если лифт остановился на этаже, который ты *не нажимал*, — не выходи. И не смотри в коридор.'), N('Правило второе. Если ночью в дверь стучит *кто-то знакомый*, — не открывай. Даже если голос родной.'), N('Правило третье. Никогда не нажимай кнопку *ноль*.')], { time: '23:59', rules: [{ text: '1. Если лифт остановился на этаже, который ты не нажимал, — не выходи и не смотри в коридор.', at: 'v1' }, { text: '2. Если ночью стучит кто-то знакомый — не открывай.', at: 'v2' }, { text: '3. Никогда не нажимай кнопку «0».', at: 'v3' }] }),
  hs('liftIn', [N('Ты усмехаешься. Кто-то из соседей решил *пошутить*.'), N('Тем более на панели и кнопки ноль *нет*.')], { time: '23:59', floor: [[0, { n: '4', lit: ['12'] }]], floorHud: true, chars: [KID([[0, { eyes: 'normal', mouth: 'smirk' }]])] }),
  hs('panel', [N('Пятый этаж. Шестой. *Седьмой*.'), N('Часы на телефоне показывают *ноль-ноль ноль-ноль*.')], { time: [ '23:59', '00:00'], floorHud: true, mood: 'tense', floor: [[0, { n: '5', lit: ['12'] }], [1.2, { n: '6', lit: ['12'] }], [2.2, { n: '7', lit: ['12'] }], ['v1', { n: '8', lit: ['12'] }]], sfx: [[1.2, 'tick'], [2.2, 'tick'], ['v1', 'tick']] }),
  hs('liftIn', [N('Свет *моргает*.'), N('И лифт *останавливается*. На девятом.')], { time: '00:00', floorHud: true, flicker: [[.2, 'v1+.4']], floor: [[0, { n: '8', lit: ['12'] }], ['v1+.6', { n: '9', lit: ['12'] }]], chars: [KID([[0, { eyes: 'normal', mouth: 'flat', look: [0, -.8] }], ['v1+.6', { eyes: 'wide', mouth: 'o', sweat: true }]])], shake: [], sfx: [['v1+.6', 'clunk'], ['v1+.9', 'ding']] }),
  hs('liftIn', [N('Ты *не нажимал* девятый.')], { time: '00:00', floorHud: true, floor: [[0, { n: '9', lit: ['12'] }]], chars: [KID([[0, { eyes: 'wide', mouth: 'o', sweat: true, look: [0, 0] }]], 360, 1.6, 1500)], zoomIn: true, sfx: [[0, 'heart', { d: 3 }]] }),
  hs('doors', [N('Двери медленно *разъезжаются*.'), N('За ними — тёмный коридор. Только одна лампа *мигает* в самом конце.')], { time: '00:01', floorHud: true, floor: [[0, { n: '9' }]], open: [[0, { v: 0 }], [.3, { v: .2 }], [1.2, { v: .6 }], [2.2, { v: 1 }]], flicker: [['v1', 'v1+3']], sfx: [[.3, 'slide']] }),
  hs('doors', [N('Под лампой кто-то *стоит*. Спиной к тебе. Лицом к стене.'), N('*Не двигается*.'), N('Ты слышишь, как *гудит* лампа. И как бьётся твоё сердце.')], { time: '00:01', floorHud: true, floor: [[0, { n: '9' }]], open: [[0, { v: 1 }]], fig: [[0, { show: true, s: .3, y: 720, turn: 0 }]], flicker: [[2, 3]], mood: 'tense', sfx: [[0, 'drone', { d: 6 }]] }),
  hs('note', [N('*Не выходи*. *Не смотри* в коридор.')], { time: '00:01', rules: [{ text: '1. Если лифт остановился на этаже, который ты не нажимал, — не выходи и не смотри в коридор.', at: 0, red: true }], hi: 0, hiAt: .3, sfx: [[0, 'whisper']] }),
  hs('panel', [N('Ты опускаешь глаза в пол и жмёшь кнопку закрытия. Ещё раз. *Ещё раз*.')], { time: '00:01', floorHud: true, floor: [[0, { n: '9', lit: ['12'] }]], hand: [[.3, { at: [430, 975], t: .3 }]], sfx: [[.5, 'click'], ['v0+1.6', 'click'], ['v0+2.6', 'click'], [0, 'heart', { d: 4 }]] }),
  hs('doors', [N('Краем глаза ты видишь, как тот, у стены, *медленно поворачивает голову*.'), N('Двери *закрываются*.')], { time: '00:01', floorHud: true, floor: [[0, { n: '9' }]], open: [[0, { v: 1 }], ['v1', { v: .5 }], ['v1+.8', { v: 0 }]], fig: [[0, { show: true, s: .3, y: 720, turn: 0 }], [1.2, { show: true, s: .3, y: 720, turn: .55 }], ['v0+3', { show: true, s: .32, y: 730, turn: 1 }]], shake: ['v1+.8'], sfx: [['v0+3', 'stinger'], ['v1', 'slide']] }),
  hs('hall', [N('Дома тихо. Мама давно спит.'), N('Ты закрываешь дверь на *замок и цепочку*. Сам не знаешь зачем.'), N('Ты долго смотришь в потолок. Это просто совпадение. Просто *сломанный лифт*.')], { time: '00:09', chars: [KID([[0, { eyes: 'tired', mouth: 'flat', look: [.6, 0] }]], 140, .95)] }),
  hs('room', [N('Ты просыпаешься от *звука*.'), N('Два пятьдесят *девять*.')], { time: '02:59', chars: [KID([[0, { eyes: 'closed', mouth: 'flat' }], ['v0', { eyes: 'wide', mouth: 'o', look: [.8, -.2] }]], 300, .9, 1180)] }),
  hs('hall', [N('Кто-то *стучит* во входную дверь. Три раза.')], { time: '03:00', knocks: [.4], chars: [KID([[0, { eyes: 'wide', mouth: 'o', look: [.8, 0] }]], 140, .95)], mood: 'tense' }),
  hs('hall', [['h_mom', 'Сынок, это мама. Открой, я ключи забыла.']], { time: '03:00', knocks: [], vig: .95, sfx: [[0, 'drone', { d: 4 }]] }),
  hs('momRoom', [N('Ты встаёшь. Проходишь мимо маминой комнаты.'), N('Мама *спит* в своей кровати.'), N('Тогда кто… *стоит за дверью*?')], { time: '03:01', sfx: [['v1', 'stinger'], [0, 'heart', { d: 6 }]], zoomIn: true }),
  hs('end', [N('Продолжение *следует*.')], { name: 'Продолжение следует', sub: 'Часть 2 — «Голос за дверью»', noSubs: true }),
]},
{ n: 502, title: 'Голос за дверью', mood: 'horror', shots: [
  hs('title', [N('Правила подъезда. Часть вторая. *Голос за дверью*.')], { kicker: 'Часть 2', name: 'Голос за дверью', noSubs: true, sfx: [[.1, 'stinger']] }),
  hs('momRoom', [N('Мама спит. Ты слышишь её *дыхание*.'), N('Ты стоишь посреди тёмного коридора и *не дышишь*.'), N('А в дверь снова *стучат*.')], { time: '03:01', sfx: [['v2', 'knock'], ['v2+.45', 'knock'], ['v2+.9', 'knock']] }),
  hs('hall', [['h_mom', 'Ну что ты там? Открывай, мне *холодно*.'], ['h_mom', 'Ты же дома, я знаю. Я слышу, как ты *дышишь*.']], { time: '03:02', knocks: [.1], chars: [KID([[0, { eyes: 'wide', mouth: 'flat', look: [.8, 0], sweat: true }]], 140, .95)] }),
  hs('hall', [N('Голос *точно* как у мамы. Те же слова, та же интонация.'), N('Ты подходишь к двери. *Медленно*.')], { time: '03:02', chars: [KID([[0, { eyes: 'wide', mouth: 'flat', look: [.8, 0] }]], 160, .95)], sfx: [[.5, 'steps', { n: 4 }]] }),
  hs('peep', [N('Смотришь в *глазок*.'), N('В коридоре *никого*. Только темнота. Даже лампа на площадке не горит.'), N('Ты отходишь от двери на *шаг*.')], { time: '03:02', fig: [[0, { show: false }]], sfx: [[0, 'drone', { d: 6 }]] }),
  hs('hall', [N('Но стук продолжается. *Прямо* по ту сторону двери.')], { time: '03:03', knocks: [.2, 1.8], chars: [KID([[0, { eyes: 'wide', mouth: 'o', look: [.8, 0], sweat: true }]], 160, .95)], mood: 'tense' }),
  hs('phone', [N('Телефон *вибрирует*.'), N('Сообщение с *неизвестного* номера.'), N('«Открой. Я *замёрзла*».'), N('«Я вижу тебя в *глазок*».'), N('Но свет в коридоре выключен. Глазок изнутри *тёмный*. Как он может тебя видеть?')], { time: '03:03', msgs: [{ text: 'Открой. Я замёрзла.', at: 'v2' }, { text: 'Я вижу тебя в глазок.', at: 'v3' }], sfx: [[.1, 'buzz', { d: 1.2 }], ['v2', 'pop'], ['v3', 'stinger']] }),
  hs('hall', [N('Ручка двери начинает *медленно* поворачиваться.'), N('Цепочка *натягивается*.'), N('Ты держишь дверь *плечом* и чувствуешь, как с той стороны давят.')], { time: '03:04', handle: [[0, { a: 0 }], [1, { a: -10 }], ['v1', { a: -35 }]], chars: [KID([[0, { eyes: 'wide', mouth: 'o', look: [.8, 0], sweat: true }]], 150, .95)], sfx: [[1, 'creak'], ['v1', 'chain']], mood: 'tense' }),
  hs('note', [N('Ты вспоминаешь листок из лифта.'), N('На обратной стороне было написано мелко, *от руки*.'), N('«Если стучат — включи свет *во всей* квартире. Они не любят свет».')], { time: '03:04', head: 'На обороте:', sub: '', rules: [{ text: 'Если стучат — включи свет во всей квартире. Они не любят свет.', at: 'v2', red: true }] }),
  hs('hall', [N('Ты бежишь по квартире и щёлкаешь выключателями.'), N('Коридор. Кухня. Ванная. *Твоя комната*.'), N('Свет режет глаза, но тебе *всё равно*.')], { time: '03:05', lit: [[0, { v: 0 }], ['v1', { v: 1 }]], chars: [KID([[0, { eyes: 'wide', mouth: 'flat', armR: -60 }]], 520, .95)], sfx: [['v1', 'switch'], ['v1+1', 'switch'], ['v1+2', 'switch'], ['v1+3', 'switch']] }),
  hs('hall', [N('Стук *обрывается*.'), N('Тишина. Такая, что слышно, как гудит *холодильник*.'), N('На часах — *три тридцать три*.')], { time: '03:33', lit: [[0, { v: 1 }]], chars: [KID([[0, { eyes: 'tired', mouth: 'flat', look: [.6, 0] }]], 150, .95)], mood: 'sad', sfx: [[0, 'hum', { d: 6 }]] }),
  hs('room', [N('Ты сползаешь по стене и сидишь так, пока за окном *не светлеет*.'), N('До утра ты так и *не уснул*.')], { time: ['03:40', '07:30'], chars: [KID([[0, { eyes: 'tired', mouth: 'flat' }]], 300, .9, 1180)] }),
  hs('dayHall', [N('Утром в коридоре ты встречаешь *соседа*. Старик из квартиры напротив.')], { time: '08:10', chars: [{ who: 'kid', x: 170, y: 1300, s: .85, k: [[0, { eyes: 'tired', mouth: 'flat', look: [.8, 0] }]] }, { who: 'oldman', x: 560, y: 1300, s: .85, k: [[0, { eyes: 'normal', mouth: 'flat', look: [-.8, 0] }]] }] }),
  hs('dayHall', [['B', 'Новенький? Правила в лифте *читал*?'], ['A', 'Читал.'], ['B', 'Вот и правильно. Прошлый жилец из *сорок седьмой* не читал.'], ['B', 'Правила висят не для красоты. Они для тех, кто хочет *дожить до утра*.']], { time: '08:11', A: 'h_kid', B: 'h_old', bubbleY: 360, chars: [{ who: 'kid', x: 170, y: 1300, s: .85, k: [[0, { eyes: 'wide', mouth: 'flat', look: [.8, 0] }]] }, { who: 'oldman', x: 560, y: 1300, s: .85, k: [[0, { eyes: 'normal', mouth: 'flat', look: [-.8, 0] }]] }] }),
  hs('dayHall', [N('Дверь сорок седьмой *опечатана*. Бумажка с печатью уже *пожелтела*.')], { time: '08:12', zoomIn: true, sfx: [[0, 'drone', { d: 4 }]] }),
  hs('liftIn', [N('Ты заходишь в лифт. Листка с правилами *больше нет*.'), N('Только светлый прямоугольник на стене, где он *висел*.')], { time: '08:13', noteWall: false, floor: [[0, { n: '12' }]], floorHud: true, chars: [KID([[0, { eyes: 'normal', mouth: 'flat', look: [-.9, -.3] }]])] }),
  hs('panel', [N('А на панели, под кнопкой первого этажа, появилась *новая* кнопка.'), N('Кнопка *ноль*.')], { time: '08:13', zero: true, floor: [[0, { n: '12' }]], sfx: [['v1', 'stinger']], mood: 'tense' }),
  hs('end', [N('Продолжение *следует*.')], { name: 'Продолжение следует', sub: 'Часть 3 — «Кнопка ноль»', noSubs: true }),
]},
{ n: 503, title: 'Кнопка ноль', mood: 'horror', shots: [
  hs('title', [N('Правила подъезда. Часть третья. *Кнопка ноль*.')], { kicker: 'Часть 3', name: 'Кнопка ноль', noSubs: true, sfx: [[.1, 'stinger']] }),
  hs('hall', [N('Вечером к тебе заходит *Дэн*. Ты рассказываешь ему всё.'), ['B', 'Бро, это чей-то прикол. Пойдём *проверим*.'], ['A', 'Не надо.'], ['B', 'Да ладно, что будет-то?'], N('Ты не хочешь ехать. Но остаться одному в квартире ещё *страшнее*.')], { time: '23:40', A: 'h_kid', B: 'h_den', lit: [[0, { v: 1 }]], bubbleY: 330, chars: [{ who: 'kid', x: 170, y: 1320, s: .9, k: [[0, { eyes: 'normal', mouth: 'flat', look: [.8, 0] }]] }, { who: 'den', x: 560, y: 1320, s: .9, k: [[0, { eyes: 'happy', mouth: 'grin', look: [-.8, 0] }]] }] }),
  hs('liftIn', [N('В три минуты первого вы стоите в лифте.'), N('Дэн смеётся и *нажимает ноль*.'), N('Кнопка под пальцем *холодная*, как лёд.')], { time: '00:03', zero: true, noteWall: false, floorHud: true, floor: [[0, { n: '12' }]], chars: [{ who: 'den', x: 170, y: 1340, s: 1, k: [[0, { eyes: 'happy', mouth: 'grin', look: [.8, -.2] }], ['v1', { armR: -110 }]] }, { who: 'kid', x: 410, y: 1340, s: 1, k: [[0, { eyes: 'wide', mouth: 'o', look: [-.8, 0] }]] }], sfx: [['v1+.8', 'click'], ['v1+1', 'stinger']] }),
  hs('liftIn', [N('Лифт *дёргается* и едет вниз.'), N('Первый этаж. Подвал. А потом цифры на табло становятся *минусовыми*.'), N('Уши закладывает, как в самолёте.')], { time: '00:03', zero: true, noteWall: false, floorHud: true, flicker: [[0, 1.5], ['v1+1.5', 'v1+3']], floor: [[0, { n: '8' }], [.8, { n: '4' }], ['v1', { n: '1' }], ['v1+1', { n: '0' }], ['v1+1.8', { n: '-1' }], ['v1+2.4', { n: '-3' }], ['v1+3', { n: '-5' }], ['v1+3.6', { n: '-7' }]], chars: [{ who: 'den', x: 170, y: 1340, s: 1, k: [[0, { eyes: 'wide', mouth: 'o', look: [.4, -.8] }]] }, { who: 'kid', x: 410, y: 1340, s: 1, k: [[0, { eyes: 'wide', mouth: 'flat', look: [.6, -.8], sweat: true }]] }], shake: [.2], sfx: [[.2, 'clunk'], [.4, 'drop', { d: 6 }]], mood: 'tense' }),
  hs('liftIn', [['A', 'Э-э… это что такое?']], { time: '00:04', A: 'h_den', zero: true, noteWall: false, floorHud: true, floor: [[0, { n: '-7' }]], dark: .2, bubbleY: 340, chars: [{ who: 'den', x: 170, y: 1340, s: 1, k: [[0, { eyes: 'wide', mouth: 'o', sweat: true }]] }, { who: 'kid', x: 410, y: 1340, s: 1, k: [[0, { eyes: 'wide', mouth: 'flat' }]] }], sfx: [[0, 'ding']] }),
  hs('doors', [N('Двери *открываются*.'), N('За ними — *ваш* этаж. Те же двери, та же плитка.'), N('Только всё *наоборот*, как в зеркале. И свет — *красный*.'), N('Пахнет *сыростью* и ржавчиной.')], { time: '00:04', red: true, mirror: true, floorHud: true, floor: [[0, { n: '-7' }]], open: [[0, { v: 0 }], [.3, { v: .3 }], [1.6, { v: 1 }]], sfx: [[.3, 'slide'], [0, 'drone', { d: 10 }]] }),
  hs('note', [N('На стене — тот же листок с *правилами*.'), N('Но в конце дописано *новое*.'), N('«Тем, кто нажал ноль: *не говори ни слова*. И нажми двенадцать — *три раза*».')], { time: '00:05', red: true, rules: [{ text: '1. Не выходи и не смотри в коридор.', at: 0 }, { text: '2. Знакомым ночью не открывай.', at: 0 }, { text: '3. Не нажимай «0».', at: 0 }, { text: 'Нажал «0»? Не говори ни слова. Нажми «12» три раза.', at: 'v2', red: true }] }),
  hs('doors', [N('В конце коридора что-то *шевелится*.'), N('Оно высокое. *Слишком* высокое для человека.'), N('И стоит оно у двери *вашей квартиры*.')], { time: '00:05', red: true, mirror: true, floorHud: true, floor: [[0, { n: '-7' }]], open: [[0, { v: 1 }]], fig: [[0, { show: true, s: .28, y: 720, turn: 0 }], [1.5, { show: true, s: .28, y: 720, turn: .3, x: 10 }]], sfx: [[0, 'heart', { d: 4 }]] }),
  hs('liftIn', [['A', 'Слушай, давай выйдем, посмотри только…'], N('Дэн начинает говорить — и тень в конце коридора *поворачивается* на звук.')], { time: '00:05', A: 'h_den', zero: true, noteWall: false, floorHud: true, floor: [[0, { n: '-7' }]], dark: .25, bubbleY: 340, chars: [{ who: 'den', x: 170, y: 1340, s: 1, k: [[0, { eyes: 'normal', mouth: 'smile', look: [.8, -.2], armR: -60 }]] }, { who: 'kid', x: 410, y: 1340, s: 1, k: [[0, { eyes: 'wide', mouth: 'o', look: [-.8, 0], sweat: true }]] }], sfx: [['v1+1.5', 'stinger']] }),
  hs('liftIn', [N('Ты *зажимаешь* ему рот рукой.')], { time: '00:05', zero: true, noteWall: false, floorHud: true, floor: [[0, { n: '-7' }]], dark: .25, chars: [{ who: 'den', x: 220, y: 1340, s: 1, k: [[0, { eyes: 'wide', mouth: 'flat' }]] }, { who: 'kid', x: 380, y: 1340, s: 1, k: [[0, { eyes: 'angry', mouth: 'flat', armL: -110 }]] }], shake: [.1] }),
  hs('panel', [N('Двенадцать. *Раз*. *Два*.'), N('Палец дрожит и *соскальзывает* с кнопки.'), N('Тень *бежит*.')], { time: '00:05', zero: true, floor: [[0, { n: '-7' }]], hand: [[.2, { at: [430, 400], t: .2 }]], press: [[.4, { b: '12' }]], sfx: [['v0+1', 'click'], ['v0+1.8', 'click'], ['v2', 'steps', { n: 6, fast: true }], [0, 'heart', { d: 5 }]], mood: 'tense' }),
  hs('doors', [N('*Три*.'), N('Двери закрываются, когда до вас остаётся *один шаг*.')], { time: '00:06', red: true, mirror: true, floorHud: true, floor: [[0, { n: '-7' }]], open: [[0, { v: 1 }], ['v1', { v: .4 }], ['v1+1.2', { v: 0 }]], fig: [[0, { show: true, s: .45, y: 820, turn: 1, reach: .2 }], [1, { show: true, s: .8, y: 1020, turn: 1, reach: .7 }], ['v1+.8', { show: true, s: 1.2, y: 1250, turn: 1, reach: 1 }]], shake: ['v1+1.2'], sfx: [[0, 'click'], ['v1+1.2', 'stinger'], ['v1+1.2', 'slam']] }),
  hs('liftIn', [N('Лифт едет *вверх*. Минус семь. Минус три. Первый.'), N('*Двенадцатый*.'), N('Дэн сидит на полу и смотрит в *одну точку*.')], { time: '00:06', zero: true, noteWall: false, floorHud: true, floor: [[0, { n: '-7' }], [1, { n: '-3' }], [2.2, { n: '1' }], ['v1', { n: '12' }]], chars: [{ who: 'den', x: 170, y: 1340, s: 1, k: [[0, { eyes: 'closed', mouth: 'flat' }]] }, { who: 'kid', x: 410, y: 1340, s: 1, k: [[0, { eyes: 'tired', mouth: 'flat', sweat: true }]] }], sfx: [['v1', 'ding']], mood: 'sad' }),
  hs('panel', [N('Утром кнопки ноль на панели *нет*.'), N('Дэн молчит весь день и *больше не смеётся*.'), N('Ты пробуешь рассказать маме. Она смеётся и говорит, что тебе *приснилось*.')], { time: '08:20', floor: [[0, { n: '12' }]] }),
  hs('note', [N('А вечером в кармане куртки ты находишь *сложенный листок*.'), N('«Правило четвёртое. *Не рассказывай* о правилах тем, кто их не читал».'), N('Ты всматриваешься в буквы. Почерк — *твой*.')], { time: '21:00', head: 'Правило 4', sub: '', rules: [{ text: 'Не рассказывай о правилах тем, кто их не читал.', at: 'v1', red: true }], sfx: [['v1', 'whisper']] }),
  hs('end', [N('Кажется, ты только что рассказал *всем*.'), N('Ну что… *ты прочитал* правила?')], { name: 'Ты прочитал правила?', noSubs: false, sfx: [['v1', 'stinger']] }),
]},
];
HORROR.forEach(f => { f.voiced = true; f.shots.forEach(s => { s.d = s.d || 3; s.lead = s.lead ?? .6; s.gap = s.gap ?? .6; s.tail = s.tail ?? 1.0; s.hlCol = HRED; if (s.zoomIn) s.zoom = [1, 1.12, 360, 700]; }); });
if (typeof module !== 'undefined') module.exports = { HORROR };
