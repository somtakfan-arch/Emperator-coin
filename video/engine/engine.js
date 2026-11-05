// Движок вертикальных мультсерий: кадр собирается как SVG по времени t.
// Серия описывается данными (см. episodes.js), шаблоны сцен лежат здесь.
const W = 720, H = 1280;
const OL = '#121621';
const SKIN = '#f6f2ea';
const YEL = '#ffc83d';
const GREEN = '#1f9d57', RED = '#e5484d';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, p) => a + (b - a) * p;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eo = p => 1 - Math.pow(1 - p, 3);
const eio = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const back = p => { const c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
const pop = (t, a, d = .35) => back(seg(t, a, a + d));
const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = n => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';

// ключевые кадры: [[время, {состояние}], ...] — состояния накапливаются
function kf(list, lt) {
  const s = {};
  if (!list) return s;
  for (const [at, st] of list) if (lt >= at) Object.assign(s, st);
  return s;
}
function wrap(text, max) {
  const out = []; let cur = '';
  for (const w of String(text).split(' ')) {
    if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) out.push(cur);
  return out;
}

// ---------------- ПЕРСОНАЖИ ----------------
const PRESETS = {
  kid:     { hair: 'messy', hairCol: '#1a1d26', top: '#262a35', top2: '#30354a', chain: true, strings: true },
  mom:     { hair: 'long', hairCol: '#6b3b22', top: '#8d4a5c', top2: '#7a3f50', brows: 'soft' },
  den:     { hair: 'cap', hairCol: '#2a1f18', capCol: '#2f9e6e', top: '#d9902f', top2: '#c47f25' },
  gleb:    { hair: 'short', hairCol: '#c27b2a', top: '#b23a48', top2: '#9c3240', glasses: true },
  rustam:  { hair: 'bald', hairCol: '#2b2b2b', top: '#3f4a63', top2: '#36405a', mustache: true, beard: true, wide: 1.12 },
  baker:   { hair: 'bun', hairCol: '#c9a26b', top: '#f1e6d2', top2: '#e5d6bb', blushDefault: true },
  teacher: { hair: 'bun', hairCol: '#8b8f99', top: '#5b6b8a', top2: '#4f5e7b', glasses: true },
};

function person(o = {}) {
  const P = Object.assign({}, PRESETS[o.who || 'kid'], o);
  const eyes = P.eyes || 'normal', mouth = P.mouth || 'smile';
  const aL = P.armL ?? 8, aR = P.armR ?? 8, lk = P.look || [0, 0];
  const wd = P.wide || 1;
  let s = `<g transform="translate(0,${P.bob || 0}) rotate(${P.lean || 0})">`;
  if (P.legs !== false) {
    s += `<rect x="-62" y="-140" width="52" height="128" rx="14" fill="#1b2030" stroke="${OL}" stroke-width="6"/>
      <rect x="10" y="-140" width="52" height="128" rx="14" fill="#1b2030" stroke="${OL}" stroke-width="6"/>
      <ellipse cx="-38" cy="-8" rx="40" ry="18" fill="#e9e9ee" stroke="${OL}" stroke-width="6"/>
      <ellipse cx="38" cy="-8" rx="40" ry="18" fill="#e9e9ee" stroke="${OL}" stroke-width="6"/>`;
  }
  if (P.hair === 'long') {
    s += `<path d="M-112,-380 Q-132,-530 0,-532 Q132,-530 112,-380 Q104,-300 72,-292 L-72,-292 Q-104,-300 -112,-380Z" fill="${P.hairCol}" stroke="${OL}" stroke-width="6"/>`;
  }
  const arm = (side, ang) => {
    const sx = side * 82 * wd, sy = -292, L = 150;
    const r = (side * ang) * Math.PI / 180;
    const ex = sx + Math.sin(r) * L, ey = sy + Math.cos(r) * L;
    return `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${OL}" stroke-width="58" stroke-linecap="round"/>
      <line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${P.top}" stroke-width="46" stroke-linecap="round"/>
      <circle cx="${ex + Math.sin(r) * 20}" cy="${ey + Math.cos(r) * 20}" r="25" fill="${SKIN}" stroke="${OL}" stroke-width="6"/>`;
  };
  const bw = 100 * wd;
  s += `<path d="M${-bw},-305 Q${-bw - 4},-150 ${-bw + 8},-128 L${bw - 8},-128 Q${bw + 4},-150 ${bw},-305 Q${bw * .6},-330 0,-330 Q${-bw * .6},-330 ${-bw},-305Z" fill="${P.top}" stroke="${OL}" stroke-width="6"/>
      <path d="M-40,-200 L40,-200 L46,-150 L-46,-150Z" fill="${P.top2}" stroke="${OL}" stroke-width="5"/>`;
  if (P.strings) s += `<line x1="-14" y1="-318" x2="-18" y2="-250" stroke="#cfd3dc" stroke-width="5" stroke-linecap="round"/><line x1="14" y1="-318" x2="18" y2="-250" stroke="#cfd3dc" stroke-width="5" stroke-linecap="round"/>`;
  if (P.chain) {
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * (0.12 + 0.76 * i / 12), x = Math.cos(a) * -64, y = -322 + Math.sin(a) * 58;
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5" fill="none" stroke="#dfe3ea" stroke-width="3.2"/>`;
    }
  }
  s += arm(-1, aL) + arm(1, aR);
  s += `<g transform="translate(0,-420)">`;
  s += `<circle cx="0" cy="0" r="100" fill="${SKIN}" stroke="${OL}" stroke-width="7"/>`;
  const hc = P.hairCol;
  if (P.hair === 'messy') s += `<path d="M-98,-14 Q-108,-92 -30,-104 Q10,-122 52,-100 Q104,-86 100,-12 Q84,-48 60,-52 Q40,-30 14,-58 Q-10,-34 -34,-56 Q-60,-34 -98,-14Z" fill="${hc}" stroke="${OL}" stroke-width="6" stroke-linejoin="round"/>`;
  if (P.hair === 'short' || P.hair === 'bun') s += `<path d="M-99,-10 Q-104,-100 0,-104 Q104,-100 99,-10 Q80,-56 0,-58 Q-80,-56 -99,-10Z" fill="${hc}" stroke="${OL}" stroke-width="6" stroke-linejoin="round"/>`;
  if (P.hair === 'bun') s += `<circle cx="0" cy="-112" r="34" fill="${hc}" stroke="${OL}" stroke-width="6"/>`;
  if (P.hair === 'long') s += `<path d="M-96,-6 Q-90,-96 0,-98 Q90,-96 96,-6 Q60,-60 0,-54 Q-60,-60 -96,-6Z" fill="${hc}" stroke="${OL}" stroke-width="6"/>`;
  if (P.hair === 'cap') s += `<path d="M-100,-24 Q-100,-108 0,-110 Q100,-108 100,-24Z" fill="${P.capCol}" stroke="${OL}" stroke-width="6"/><path d="M60,-30 Q130,-36 150,-18 L100,-20Z" fill="${P.capCol}" stroke="${OL}" stroke-width="6" stroke-linejoin="round"/>`;
  if (P.hair === 'bald') s += `<path d="M-60,-70 Q-30,-88 0,-86" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".8"/>`;
  const ex = [-36, 36], ey = 6;
  for (let i = 0; i < 2; i++) {
    const x = ex[i];
    if (eyes === 'happy') { s += `<path d="M${x - 20},${ey + 6} Q${x},${ey - 20} ${x + 20},${ey + 6}" fill="none" stroke="${OL}" stroke-width="7" stroke-linecap="round"/>`; continue; }
    if (eyes === 'closed' || P.blink) { s += `<path d="M${x - 20},${ey} Q${x},${ey + 12} ${x + 20},${ey}" fill="none" stroke="${OL}" stroke-width="7" stroke-linecap="round"/>`; continue; }
    const R = eyes === 'wide' ? 33 : 27, pr = eyes === 'wide' ? 8 : 11;
    s += `<circle cx="${x}" cy="${ey}" r="${R}" fill="#fff" stroke="${OL}" stroke-width="6"/>`;
    s += `<circle cx="${x + lk[0] * R * .45}" cy="${ey + lk[1] * R * .45}" r="${pr}" fill="${OL}"/>`;
    if (eyes === 'tired') s += `<path d="M${x - R - 3},${ey - 2} L${x + R + 3},${ey - 2} L${x + R + 3},${ey - R - 6} L${x - R - 3},${ey - R - 6}Z" fill="${SKIN}"/><line x1="${x - R + 2}" y1="${ey - 2}" x2="${x + R - 2}" y2="${ey - 2}" stroke="${OL}" stroke-width="6" stroke-linecap="round"/><path d="M${x - 18},${ey + R + 8} Q${x},${ey + R + 16} ${x + 18},${ey + R + 8}" fill="none" stroke="#b9a99a" stroke-width="4" stroke-linecap="round"/>`;
    if (eyes === 'angry') s += `<line x1="${x - 26}" y1="${ey - 38 + (i ? 12 : -2)}" x2="${x + 26}" y2="${ey - 38 + (i ? -2 : 12)}" stroke="${OL}" stroke-width="7" stroke-linecap="round"/>`;
    if (eyes === 'sad') s += `<line x1="${x - 24}" y1="${ey - 36 + (i ? -6 : 8)}" x2="${x + 24}" y2="${ey - 36 + (i ? 8 : -6)}" stroke="${OL}" stroke-width="6" stroke-linecap="round"/>`;
  }
  if (eyes === 'wide') s += `<path d="M-60,-40 Q-36,-54 -14,-42" fill="none" stroke="${OL}" stroke-width="6" stroke-linecap="round"/><path d="M14,-42 Q36,-54 60,-40" fill="none" stroke="${OL}" stroke-width="6" stroke-linecap="round"/>`;
  if (P.glasses) s += `<circle cx="-36" cy="6" r="34" fill="none" stroke="${OL}" stroke-width="6"/><circle cx="36" cy="6" r="34" fill="none" stroke="${OL}" stroke-width="6"/><line x1="-4" y1="2" x2="4" y2="2" stroke="${OL}" stroke-width="6"/>`;
  if (P.beard) s += `<path d="M-84,30 Q-80,104 0,108 Q80,104 84,30 Q60,70 0,72 Q-60,70 -84,30Z" fill="${hc}" stroke="${OL}" stroke-width="6" stroke-linejoin="round"/>`;
  const m = {
    smile: `<path d="M-22,52 Q0,68 22,52" fill="none" stroke="${OL}" stroke-width="6" stroke-linecap="round"/>`,
    grin: `<path d="M-34,44 Q0,92 34,44Z" fill="#7a2b33" stroke="${OL}" stroke-width="6" stroke-linejoin="round"/><path d="M-26,48 L26,48 L22,56 L-22,56Z" fill="#fff"/>`,
    o: `<ellipse cx="0" cy="58" rx="12" ry="16" fill="#5a1f26" stroke="${OL}" stroke-width="6"/>`,
    open: `<path d="M-20,50 Q0,78 20,50Z" fill="#5a1f26" stroke="${OL}" stroke-width="6" stroke-linejoin="round"/>`,
    flat: `<line x1="-18" y1="58" x2="18" y2="58" stroke="${OL}" stroke-width="6" stroke-linecap="round"/>`,
    sad: `<path d="M-20,64 Q0,50 20,64" fill="none" stroke="${OL}" stroke-width="6" stroke-linecap="round"/>`,
    wave: `<path d="M-24,58 q8,-8 16,0 q8,8 16,0 q8,-8 16,0" fill="none" stroke="${OL}" stroke-width="6" stroke-linecap="round"/>`,
    smirk: `<path d="M-18,60 Q6,62 24,48" fill="none" stroke="${OL}" stroke-width="6" stroke-linecap="round"/>`,
  }[mouth] || '';
  s += m;
  if (P.mustache) s += `<path d="M-40,44 Q-20,30 0,40 Q20,30 40,44 Q20,52 0,46 Q-20,52 -40,44Z" fill="${hc}" stroke="${OL}" stroke-width="5" stroke-linejoin="round"/>`;
  if (P.blush || P.blushDefault) s += `<ellipse cx="-62" cy="40" rx="16" ry="9" fill="#ff8c9a" opacity=".55"/><ellipse cx="62" cy="40" rx="16" ry="9" fill="#ff8c9a" opacity=".55"/>`;
  if (P.sweat) s += `<path d="M86,-30 q10,18 0,26 q-10,-8 0,-26Z" fill="#7fd0ff" stroke="${OL}" stroke-width="4"/>`;
  if (P.glow) s += `<circle cx="0" cy="0" r="100" fill="#7ab8ff" opacity="${P.glow}"/>`;
  s += `</g></g>`;
  return s;
}

// ---------------- ПРЕДМЕТЫ ----------------
function phoneFrame(x, y, sc, inner, rot = 0, dark = false) {
  return `<g transform="translate(${x},${y}) rotate(${rot}) scale(${sc})">
   <rect x="-170" y="-330" width="340" height="660" rx="48" fill="#0b0d12" stroke="${OL}" stroke-width="8"/>
   <rect x="-152" y="-312" width="304" height="624" rx="36" fill="${dark ? '#1b2340' : '#f3f4f7'}"/>
   ${inner}
   <rect x="-44" y="-300" width="88" height="22" rx="11" fill="#0b0d12"/></g>`;
}
function avatar(x, y, r, col, letter) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}"/><text x="${x}" y="${y + r * .36}" font-size="${r}" font-weight="800" fill="#fff" text-anchor="middle">${esc(letter)}</text>`;
}
function laptop(x, y, sc, screen, openP = 1, silver = false) {
  const body = silver ? '#c9ced8' : '#1c1f27';
  return `<g transform="translate(${x},${y}) scale(${sc})">
   <g transform="scale(1,${openP})">
     <rect x="-190" y="-250" width="380" height="250" rx="16" fill="${body}" stroke="${OL}" stroke-width="7"/>
     <rect x="-172" y="-234" width="344" height="216" rx="6" fill="#0f1a2c"/>
     <g clip-path="url(#scr)">${screen}</g>
   </g>
   <path d="M-220,0 L220,0 L200,22 L-200,22Z" fill="${silver ? '#dfe3ea' : '#a7adba'}" stroke="${OL}" stroke-width="7" stroke-linejoin="round"/>
  </g>`;
}
function monitor(x, y, sc, screen) {
  return `<g transform="translate(${x},${y}) scale(${sc})">
    <rect x="-20" y="-40" width="40" height="40" fill="#2a2e38" stroke="${OL}" stroke-width="6"/>
    <rect x="-80" y="-6" width="160" height="16" rx="6" fill="#2a2e38" stroke="${OL}" stroke-width="6"/>
    <g transform="translate(0,-40)"><rect x="-190" y="-250" width="380" height="250" rx="14" fill="#1c1f27" stroke="${OL}" stroke-width="7"/>
    <rect x="-172" y="-234" width="344" height="216" rx="6" fill="#0f1a2c"/><g clip-path="url(#scr)">${screen}</g></g></g>`;
}
function codeScreen(t, speed = 1) {
  let s = ''; const off = (t * speed * 60) % 34;
  for (let i = 0; i < 9; i++) {
    const ii = i + Math.floor(t * speed * 60 / 34);
    const w = 40 + rnd(ii) * 190, ind = Math.floor(rnd(ii + 7) * 3) * 18;
    const c = ['#7dd3fc', '#f9a8d4', '#bef264', '#fcd34d'][ii % 4];
    s += `<rect x="${-155 + ind}" y="${-220 + i * 26 - off + 8}" width="${w}" height="12" rx="6" fill="${c}" opacity=".85"/>`;
  }
  return s;
}
function screenContent(mode, t) {
  if (!mode || mode === 'code') return codeScreen(t, 1);
  if (mode === 'fast') return codeScreen(t, 2.4);
  if (mode === 'slow') return codeScreen(t, .25);
  if (mode === 'off') return `<rect x="-172" y="-234" width="344" height="216" fill="#07090e"/>`;
  if (mode === 'error') return `<rect x="-172" y="-234" width="344" height="216" fill="#3a0f14"/><text x="0" y="-110" font-size="54" font-weight="900" fill="#ff6b6b" text-anchor="middle">502</text><text x="0" y="-70" font-size="18" font-weight="700" fill="#ffb3b3" text-anchor="middle">Сервер не отвечает</text>`;
  if (mode.startsWith('site:')) return `<g transform="translate(-172,-234) scale(.5733)">${siteMock(mode.slice(5), t)}</g>`;
  return '';
}
function can(x, y, i) {
  return `<g transform="translate(${x},${y})"><rect x="-17" y="-62" width="34" height="62" rx="6" fill="${['#2ec4b6', '#ff4d6d', '#b5e655'][i % 3]}" stroke="${OL}" stroke-width="5"/><rect x="-17" y="-44" width="34" height="14" fill="#fff" opacity=".85"/><rect x="-12" y="-68" width="24" height="7" rx="3" fill="#c9ced8" stroke="${OL}" stroke-width="4"/></g>`;
}
function sticky(x, y, text, col = '#ffe066', rot = 0, sc = 1, w = 190) {
  const lines = wrap(text, Math.floor(w / 13));
  const h = 30 + lines.length * 26;
  let tt = ''; lines.forEach((l, i) => tt += `<text x="${w / 2}" y="${34 + i * 26}" font-size="20" font-weight="700" fill="#2a2a2a" text-anchor="middle">${esc(l)}</text>`);
  return `<g transform="translate(${x},${y}) rotate(${rot}) scale(${sc}) translate(${-w / 2},${-h / 2})"><rect width="${w}" height="${h}" fill="${col}" stroke="${OL}" stroke-width="4"/><rect x="${w / 2 - 26}" y="-8" width="52" height="16" fill="#f3f0e6" opacity=".8"/>${tt}</g>`;
}

// ---------------- ИКОНКИ И САЙТЫ ----------------
function icon(kind, r, col) {
  const ink = '#2a2118';
  switch (kind) {
    case 'bread': return `<ellipse rx="${r * .8}" ry="${r * .5}" fill="#e6b36d" stroke="${ink}" stroke-width="5"/><path d="M${-r * .4},${-r * .2} l${r * .2},${r * .3} M${-r * .05},${-r * .3} l${r * .2},${r * .3} M${r * .3},${-r * .25} l${r * .2},${r * .3}" stroke="#b97f39" stroke-width="6" stroke-linecap="round"/>`;
    case 'flower': { let s = ''; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; s += `<circle cx="${Math.cos(a) * r * .45}" cy="${Math.sin(a) * r * .45}" r="${r * .32}" fill="#f783ac" stroke="${ink}" stroke-width="4"/>`; } return s + `<circle r="${r * .25}" fill="#ffd43b" stroke="${ink}" stroke-width="4"/>`; }
    case 'beard': return `<circle r="${r * .7}" fill="#f6e1c8" stroke="${ink}" stroke-width="4"/><path d="M${-r * .7},0 Q${-r * .6},${r * .9} 0,${r * .9} Q${r * .6},${r * .9} ${r * .7},0 Q${r * .3},${r * .35} 0,${r * .3} Q${-r * .3},${r * .35} ${-r * .7},0Z" fill="#6b4226" stroke="${ink}" stroke-width="4"/><circle cx="${-r * .25}" cy="${-r * .15}" r="5" fill="${ink}"/><circle cx="${r * .25}" cy="${-r * .15}" r="5" fill="${ink}"/>`;
    case 'scissors': return `<circle cx="${-r * .35}" cy="${r * .4}" r="${r * .22}" fill="none" stroke="${ink}" stroke-width="6"/><circle cx="${r * .35}" cy="${r * .4}" r="${r * .22}" fill="none" stroke="${ink}" stroke-width="6"/><line x1="${-r * .2}" y1="${r * .25}" x2="${r * .3}" y2="${-r * .6}" stroke="${ink}" stroke-width="7"/><line x1="${r * .2}" y1="${r * .25}" x2="${-r * .3}" y2="${-r * .6}" stroke="${ink}" stroke-width="7"/>`;
    case 'paw': return `<ellipse cy="${r * .25}" rx="${r * .38}" ry="${r * .3}" fill="${ink}"/>${[-.45, -.15, .15, .45].map((k, i) => `<ellipse cx="${k * r}" cy="${-r * (i === 0 || i === 3 ? .15 : .38)}" rx="${r * .14}" ry="${r * .18}" fill="${ink}"/>`).join('')}`;
    case 'bowl': return `<path d="M${-r * .75},${-r * .05} L${r * .75},${-r * .05} Q${r * .7},${r * .7} 0,${r * .7} Q${-r * .7},${r * .7} ${-r * .75},${-r * .05}Z" fill="#f2f2f2" stroke="${ink}" stroke-width="5"/><path d="M${-r * .4},${-r * .25} q8,-20 0,-36 M0,${-r * .25} q8,-20 0,-36 M${r * .4},${-r * .25} q8,-20 0,-36" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`;
    case 'bolt': return `<path d="M${r * .1},${-r * .8} L${-r * .45},${r * .1} L${-r * .02},${r * .1} L${-r * .15},${r * .8} L${r * .45},${-r * .12} L${r * .02},${-r * .12}Z" fill="#ffd43b" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>`;
    case 'code': return `<text y="${r * .25}" font-size="${r * .8}" font-weight="900" fill="#e6e8ee" text-anchor="middle" font-family="JetBrains Mono">&lt;/&gt;</text>`;
    case 'monitor': return `<rect x="${-r * .8}" y="${-r * .6}" width="${r * 1.6}" height="${r}" rx="8" fill="#1c1f27" stroke="${ink}" stroke-width="5"/><rect x="${-r * .7}" y="${-r * .5}" width="${r * 1.4}" height="${r * .8}" fill="#5aa9ff"/><rect x="-8" y="${r * .4}" width="16" height="${r * .3}" fill="#1c1f27"/><rect x="${-r * .35}" y="${r * .66}" width="${r * .7}" height="10" rx="4" fill="#1c1f27"/>`;
    case 'laptop': return `<rect x="${-r * .75}" y="${-r * .6}" width="${r * 1.5}" height="${r}" rx="8" fill="#c9ced8" stroke="${ink}" stroke-width="5"/><rect x="${-r * .65}" y="${-r * .5}" width="${r * 1.3}" height="${r * .8}" fill="#20283a"/><path d="M${-r * .95},${r * .42} L${r * .95},${r * .42} L${r * .85},${r * .58} L${-r * .85},${r * .58}Z" fill="#dfe3ea" stroke="${ink}" stroke-width="5"/>`;
    default: return '';
  }
}
const SITES = {
  kolosok: { name: 'Колосок', tag: 'Свежий хлеб с 7 утра', url: 'kolosok-bakery.ru', bg: '#f7e7cf', acc: '#f59e0b', ink: '#5b3a1e', icon: 'bread', cards: ['#e6b36d', '#d4945a', '#f0cf8f'] },
  pion: { name: 'Пион', tag: 'Цветы с доставкой', url: 'pion-flowers.ru', bg: '#fde7ef', acc: '#e64980', ink: '#6b1f3a', icon: 'flower', cards: ['#f783ac', '#fcc2d7', '#e599f7'] },
  pionmix: { name: 'Пион', tag: 'Цветы с доставкой', url: 'pion-flowers.ru', bg: '#fde7ef', acc: '#e64980', ink: '#6b1f3a', icon: 'beard', cards: ['#6b4226', '#8a5a3a', '#4a2e1c'] },
  boroda: { name: 'Борода', tag: 'Стрижка и запись онлайн', url: 'boroda-barber.ru', bg: '#e3e7ee', acc: '#2b2f3a', ink: '#1b1f2a', icon: 'scissors', cards: ['#6b4226', '#8a8f9c', '#4a2e1c'] },
  gleb: { name: 'Сайт за 5 000 ₽!!!', tag: 'Быстро. Дёшево. Сегодня', url: 'gleb-web.ru', bg: '#fff3a8', acc: '#e5484d', ink: '#111', icon: 'bolt', cards: ['#ff8787', '#ffd43b', '#74c0fc'] },
  folio: { name: 'Портфолио', tag: 'Сайты, которые работают', url: 'moi-saity.ru', bg: '#1b1f2a', acc: '#e6e8ee', ink: '#f3f4f7', btnInk: '#1b1f2a', icon: 'code', cards: ['#e6b36d', '#8a8f9c', '#f783ac'], labels: ['Колосок', 'Борода', 'Пион'] },
  dvor: { name: 'Сытый двор', tag: 'Доставка за 40 минут', url: 'sytyi-dvor.ru', bg: '#e9f3e1', acc: '#2f7d4f', ink: '#1f3b2a', icon: 'bowl', cards: ['#f4a261', '#e9c46a', '#a7c957'] },
  dvorapp: { name: 'Сытый двор', tag: 'Приложение · 4 ресторана', url: 'app.sytyi-dvor.ru', bg: '#e9f3e1', acc: '#2f7d4f', ink: '#1f3b2a', icon: 'bowl', cards: ['#f4a261', '#e9c46a', '#a7c957'], btn: 'Открыть' },
  monitor: { product: true, title: 'Монитор 27"', price: '12 000 ₽', url: 'market.ru/monitor', icon: 'monitor' },
  laptop: { product: true, title: 'Ноутбук 16"', price: '95 000 ₽', url: 'market.ru/laptop', icon: 'laptop' },
};
// сайт в коробке 600×464, начало координат — левый верх
function siteMock(key, t, o = {}) {
  const S = SITES[key];
  if (!S) return '';
  if (S.product) {
    const bought = o.bought;
    return `<rect width="600" height="464" fill="#fff"/>
      <rect x="30" y="40" width="260" height="260" rx="18" fill="#eef1f6"/><g transform="translate(160,170)">${icon(S.icon, 100)}</g>
      <text x="320" y="90" font-size="34" font-weight="800" fill="#141821">${esc(S.title)}</text>
      <text x="320" y="130" font-size="20" font-weight="600" fill="#6b7385">★★★★★ 4,9</text>
      <text x="320" y="200" font-size="44" font-weight="900" fill="#141821">${esc(S.price)}</text>
      <rect x="320" y="230" width="230" height="64" rx="16" fill="${bought ? GREEN : '#3b82f6'}"/>
      <text x="435" y="272" font-size="26" font-weight="800" fill="#fff" text-anchor="middle">${bought ? 'Куплено ✓' : 'Купить'}</text>
      <rect x="30" y="330" width="540" height="16" rx="8" fill="#e1e4ea"/><rect x="30" y="360" width="420" height="16" rx="8" fill="#e1e4ea"/><rect x="30" y="390" width="480" height="16" rx="8" fill="#e1e4ea"/>`;
  }
  let s = `<rect width="600" height="464" fill="#fff"/><rect width="600" height="230" fill="${S.bg}"/>`;
  s += `<g transform="translate(470,112)"><circle r="82" fill="${S.acc}" opacity=".18"/>${icon(S.icon, 70)}</g>`;
  const nameSize = S.name.length > 12 ? 30 : 42;
  s += `<text x="36" y="84" font-size="${nameSize}" font-weight="900" fill="${S.ink}">${esc(S.name)}</text>`;
  s += `<text x="36" y="122" font-size="20" font-weight="600" fill="${S.ink}" opacity=".75">${esc(S.tag)}</text>`;
  s += `<rect x="36" y="150" width="180" height="52" rx="14" fill="${S.acc}"/><text x="126" y="184" font-size="22" font-weight="800" fill="${S.btnInk || '#fff'}" text-anchor="middle">${esc(S.btn || 'Заказать')}</text>`;
  for (let i = 0; i < 3; i++) {
    const x = 30 + i * 185;
    s += `<rect x="${x}" y="252" width="170" height="190" rx="14" fill="#fff" stroke="#e1e4ea" stroke-width="3"/><circle cx="${x + 85}" cy="${320}" r="44" fill="${S.cards[i]}"/>`;
    if (S.labels) s += `<text x="${x + 85}" y="400" font-size="20" font-weight="800" fill="#141821" text-anchor="middle">${esc(S.labels[i])}</text><rect x="${x + 45}" y="412" width="80" height="10" rx="5" fill="#d9dde6"/>`;
    else s += `<rect x="${x + 20}" y="382" width="${90 + i * 10}" height="14" rx="7" fill="#d9dde6"/><rect x="${x + 20}" y="406" width="60" height="14" rx="7" fill="${S.acc}"/>`;
  }
  return s;
}

// ---------------- ФОНЫ ----------------
function roomBg(t, light = 'night') {
  const pal = {
    night: { wall: '#1a2135', low: '#121828', sky: '#0b1122', bld: '#18213a', win: '#ffd36b' },
    evening: { wall: '#2a2440', low: '#1f1a31', sky: '#f08a5d', bld: '#3b2c4a', win: '#ffe08a' },
    day: { wall: '#bfcadb', low: '#a6b3c7', sky: '#8fd0ff', bld: '#6f87a8', win: '#d8ecff' },
  }[light];
  let s = `<rect width="${W}" height="${H}" fill="${pal.wall}"/><rect x="0" y="900" width="${W}" height="380" fill="${pal.low}"/>`;
  s += `<g transform="translate(400,200)"><rect width="270" height="380" rx="10" fill="${pal.sky}" stroke="${OL}" stroke-width="10"/>`;
  if (light === 'night') s += `<circle cx="200" cy="70" r="34" fill="#f2efe1"/><circle cx="214" cy="62" r="30" fill="${pal.sky}"/>`;
  if (light === 'evening') s += `<rect y="190" width="270" height="190" fill="#f3b07a"/><circle cx="90" cy="240" r="40" fill="#ffd9a0"/>`;
  if (light === 'day') s += `<ellipse cx="80" cy="80" rx="50" ry="20" fill="#fff"/><ellipse cx="190" cy="130" rx="40" ry="16" fill="#fff"/>`;
  for (let i = 0; i < 7; i++) {
    const bx = 10 + i * 38, bh = 120 + rnd(i) * 170;
    s += `<rect x="${bx}" y="${380 - bh}" width="36" height="${bh}" fill="${pal.bld}"/>`;
    if (light !== 'day') for (let j = 0; j < 6; j++) if (rnd(i * 13 + j) > .5) s += `<rect x="${bx + 8 + (j % 2) * 12}" y="${380 - bh + 14 + Math.floor(j / 2) * 26}" width="7" height="10" fill="${pal.win}" opacity="${.5 + .5 * rnd(j + i)}"/>`;
  }
  s += `<line x1="135" y1="0" x2="135" y2="380" stroke="${OL}" stroke-width="8"/><line x1="0" y1="190" x2="270" y2="190" stroke="${OL}" stroke-width="8"/></g>`;
  // постер без надписей: горы и луна
  s += `<g transform="translate(60,250) rotate(-4)"><rect width="150" height="200" fill="#2b2f3d" stroke="${OL}" stroke-width="6"/><circle cx="105" cy="60" r="18" fill="#cfd3dc"/><path d="M10,180 L60,95 L90,140 L110,115 L140,180Z" fill="#596079"/><path d="M60,95 L72,115 L50,113Z" fill="#e6e8ee"/></g>`;
  return s;
}
function desk() {
  return `<rect x="-20" y="880" width="${W + 40}" height="40" rx="8" fill="#5b4636" stroke="${OL}" stroke-width="8"/><rect x="-20" y="912" width="${W + 40}" height="400" fill="#47372b" stroke="${OL}" stroke-width="8"/>`;
}
function placeBg(place) {
  if (place === 'kitchen') {
    let s = `<rect width="${W}" height="${H}" fill="#e8dcc6"/>`;
    for (let y = 520; y < 820; y += 50) for (let x = 0; x < W; x += 50) s += `<rect x="${x + 2}" y="${y + 2}" width="46" height="46" fill="#f4ecdd" stroke="#d8c9ad" stroke-width="2"/>`;
    s += `<rect x="0" y="820" width="${W}" height="460" fill="#c9b08a"/><rect x="0" y="820" width="${W}" height="14" fill="#a68a63"/>`;
    s += `<rect x="40" y="200" width="200" height="260" fill="#9fd3f5" stroke="${OL}" stroke-width="8"/><line x1="140" y1="200" x2="140" y2="460" stroke="${OL}" stroke-width="6"/>`;
    s += `<rect x="520" y="230" width="170" height="590" rx="16" fill="#f3f4f7" stroke="${OL}" stroke-width="8"/><line x1="520" y1="430" x2="690" y2="430" stroke="${OL}" stroke-width="6"/><rect x="540" y="300" width="12" height="80" rx="6" fill="#9aa3b5"/><rect x="540" y="460" width="12" height="80" rx="6" fill="#9aa3b5"/>`;
    s += `<g transform="translate(330,330)"><circle r="46" fill="#fff" stroke="${OL}" stroke-width="7"/><line y2="-28" stroke="${OL}" stroke-width="6" stroke-linecap="round" transform="rotate(300)"/><line y2="-18" stroke="${OL}" stroke-width="7" stroke-linecap="round" transform="rotate(30)"/></g>`;
    return s;
  }
  if (place === 'street') {
    let s = `<rect width="${W}" height="${H}" fill="#9fd0ef"/>`;
    s += `<ellipse cx="160" cy="220" rx="70" ry="24" fill="#fff"/><ellipse cx="520" cy="300" rx="90" ry="26" fill="#fff"/>`;
    const cols = ['#d98c6a', '#e4c27a', '#9fb4c9', '#c98f9f'];
    for (let i = 0; i < 4; i++) {
      const x = -20 + i * 190, h = 380 + rnd(i + 4) * 160;
      s += `<rect x="${x}" y="${900 - h}" width="180" height="${h}" fill="${cols[i]}" stroke="${OL}" stroke-width="6"/>`;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) s += `<rect x="${x + 22 + c * 50}" y="${900 - h + 30 + r * 70}" width="30" height="40" fill="#f6f1e2" stroke="${OL}" stroke-width="4"/>`;
    }
    s += `<rect y="900" width="${W}" height="380" fill="#8a8f99"/><rect y="900" width="${W}" height="20" fill="#6f747e"/>`;
    for (let i = 0; i < 6; i++) s += `<rect x="${i * 140 + 20}" y="1060" width="80" height="12" rx="6" fill="#c8ccd4"/>`;
    return s;
  }
  if (place === 'cafe' || place === 'bakery') {
    const warm = place === 'cafe' ? '#5a3f33' : '#d9b48a';
    let s = `<rect width="${W}" height="${H}" fill="${warm}"/>`;
    for (let x = 0; x < W; x += 60) s += `<rect x="${x}" y="0" width="30" height="900" fill="#000" opacity=".05"/>`;
    for (let i = 0; i < 3; i++) s += `<line x1="${140 + i * 220}" y1="0" x2="${140 + i * 220}" y2="200" stroke="${OL}" stroke-width="4"/><path d="M${100 + i * 220},240 Q${140 + i * 220},180 ${180 + i * 220},240Z" fill="#f2c14e" stroke="${OL}" stroke-width="6"/><ellipse cx="${140 + i * 220}" cy="260" rx="80" ry="30" fill="#ffd36b" opacity=".18"/>`;
    if (place === 'bakery') {
      for (let r = 0; r < 2; r++) { s += `<rect x="40" y="${360 + r * 170}" width="640" height="20" fill="#8a5a3a" stroke="${OL}" stroke-width="5"/>`; for (let k = 0; k < 6; k++) s += `<g transform="translate(${90 + k * 108},${340 + r * 170})">${icon('bread', 46)}</g>`; }
    } else {
      s += `<rect x="60" y="340" width="260" height="190" rx="10" fill="#2f2a26" stroke="${OL}" stroke-width="8"/><text x="190" y="390" font-size="30" font-weight="800" fill="#f3e7d3" text-anchor="middle">Меню</text>`;
      for (let k = 0; k < 3; k++) s += `<rect x="90" y="${415 + k * 34}" width="${120 + rnd(k) * 60}" height="12" rx="6" fill="#f3e7d3" opacity=".7"/>`;
      s += `<rect x="440" y="360" width="220" height="160" rx="10" fill="#e9f3e1" stroke="${OL}" stroke-width="8"/><g transform="translate(550,440)">${icon('bowl', 60)}</g>`;
    }
    s += `<rect y="900" width="${W}" height="380" fill="#3b2a22"/><rect y="900" width="${W}" height="16" fill="#2a1e18"/>`;
    return s;
  }
  if (place === 'hall') {
    let s = `<rect width="${W}" height="${H}" fill="#cdbfa8"/><rect y="900" width="${W}" height="380" fill="#8b6b4e"/>`;
    s += `<rect x="260" y="300" width="200" height="600" fill="#5b4636" stroke="${OL}" stroke-width="8"/><circle cx="430" cy="620" r="12" fill="#d8b56a" stroke="${OL}" stroke-width="4"/>`;
    s += `<rect x="520" y="320" width="150" height="200" rx="8" fill="#e8eef6" stroke="${OL}" stroke-width="8"/>`;
    return s;
  }
  return `<rect width="${W}" height="${H}" fill="#1a2135"/>`;
}

// ---------------- ОБЩИЕ НАКЛАДКИ ----------------
function stampsLayer(list, lt) {
  let s = '';
  for (const st of list || []) {
    if (lt < st.at || (st.until !== undefined && lt > st.until)) continue;
    const p = pop(lt, st.at), col = st.col || GREEN;
    const fs = st.size || 34;
    const w = Math.max(140, st.text.length * fs * .62 + 50);
    s += `<g transform="translate(${st.x ?? 540},${st.y ?? 300}) scale(${p}) rotate(${st.rot ?? -5})"><rect x="${-w / 2}" y="${-fs * 1.05}" width="${w}" height="${fs * 2.1}" rx="18" fill="${col}" stroke="${OL}" stroke-width="6"/><text y="${fs * .36}" font-size="${fs}" font-weight="900" fill="${st.ink || '#fff'}" text-anchor="middle">${esc(st.text)}</text></g>`;
  }
  return s;
}
function notifCard(x, y, from, text, col, letter, p, w = 520) {
  const sc = back(p);
  return `<g transform="translate(${x},${y}) scale(${sc})" opacity="${clamp(p * 3)}"><rect x="${-w / 2}" y="-52" width="${w}" height="104" rx="22" fill="#f3f4f7" stroke="${OL}" stroke-width="5"/>${avatar(-w / 2 + 52, 0, 30, col, letter)}<text x="${-w / 2 + 96}" y="-8" font-size="21" font-weight="800" fill="#141821">${esc(from)}</text><text x="${-w / 2 + 96}" y="24" font-size="19" font-weight="500" fill="#4b5263">${esc(text)}</text></g>`;
}
function speech(x, y, text, p, tailX = 0, dark = false) {
  const lines = wrap(text, 17);
  const fs = 29, lh = 38, w = Math.max(...lines.map(l => l.length)) * fs * .56 + 56, h = lines.length * lh + 36;
  let tt = ''; lines.forEach((l, i) => tt += `<text x="0" y="${-h / 2 + 18 + (i + .78) * lh}" font-size="${fs}" font-weight="800" fill="${dark ? '#fff' : '#141821'}" text-anchor="middle">${esc(l)}</text>`);
  return `<g transform="translate(${x},${y}) scale(${back(p)})" opacity="${clamp(p * 3)}"><path d="M${-w / 2 + 20},${-h / 2} L${w / 2 - 20},${-h / 2} Q${w / 2},${-h / 2} ${w / 2},${-h / 2 + 20} L${w / 2},${h / 2 - 20} Q${w / 2},${h / 2} ${w / 2 - 20},${h / 2} L${tailX + 22},${h / 2} L${tailX},${h / 2 + 34} L${tailX - 18},${h / 2} L${-w / 2 + 20},${h / 2} Q${-w / 2},${h / 2} ${-w / 2},${h / 2 - 20} L${-w / 2},${-h / 2 + 20} Q${-w / 2},${-h / 2} ${-w / 2 + 20},${-h / 2}Z" fill="${dark ? '#1b2030' : '#fff'}" stroke="${OL}" stroke-width="6" stroke-linejoin="round"/>${tt}</g>`;
}
function confetti(lt, from) {
  let s = '';
  for (let i = 0; i < 60; i++) {
    const st = from + rnd(i) * .4, p = lt - st; if (p < 0) continue;
    const x = rnd(i + 1) * W + Math.sin(p * 3 + i) * 30, y = -30 + p * (300 + rnd(i + 2) * 300);
    s += `<rect x="${x}" y="${y}" width="12" height="20" fill="${['#ffc83d', '#45e08a', '#7dd3fc', '#f9a8d4', '#e6e8ee'][i % 5]}" transform="rotate(${p * 300 + i * 40} ${x + 6} ${y + 10})"/>`;
  }
  return s;
}
const talking = (lt, at, text) => lt >= at && lt < at + Math.min(1.8, .4 + text.length * .045);

// ---------------- ШАБЛОНЫ СЦЕН ----------------
// Каждый шаблон: (lt — локальное время, P — параметры кадра, t — общее время) → SVG.
// sfx(P) возвращает звуковые события [время, вид, параметры].
const T = {};

T.title = {
  draw(lt, P) {
    const p = eo(seg(lt, 0, .5)), q = eo(seg(lt, .35, .9));
    let s = `<defs><radialGradient id="tg" cx=".5" cy=".7" r=".7"><stop offset="0" stop-color="${P.glow || '#2b3550'}"/><stop offset="1" stop-color="#0c0e13"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#tg)"/>`;
    s += `<g opacity="${p}"><text x="${W / 2}" y="330" font-size="26" font-weight="700" fill="#8b93a7" text-anchor="middle" letter-spacing="2">${esc(P.series || 'Сайт до утра')}</text>`;
    s += `<text x="${W / 2}" y="${420 + (1 - p) * 20}" font-size="40" font-weight="700" fill="#cfd3dc" text-anchor="middle">${esc(P.kicker)}</text></g>`;
    const lines = wrap(P.name, 14);
    lines.forEach((l, i) => s += `<text x="${W / 2}" y="${520 + i * 84 + (1 - q) * 30}" font-size="76" font-weight="900" fill="#f3f4f7" text-anchor="middle" opacity="${q}" letter-spacing="-1">${esc(l)}</text>`);
    const k = eo(seg(lt, .2, .8));
    s += `<g transform="translate(${W / 2},${1420 - k * 150}) scale(1.05)">${person(Object.assign({ who: 'kid', look: [0, -.4] }, P.kid || {}))}</g>`;
    return s;
  },
  sfx: () => [[.05, 'hit']],
};
T.tease = {
  draw(lt, P) {
    const p = eo(seg(lt, 0, .4));
    let s = `<rect width="${W}" height="${H}" fill="#0c0e13"/>`;
    s += `<g opacity="${p}" transform="translate(0,${(1 - p) * 20})"><text x="${W / 2}" y="560" font-size="32" font-weight="700" fill="#8b93a7" text-anchor="middle">${esc(P.kicker || 'В следующей серии')}</text>`;
    wrap(P.name, 16).forEach((l, i) => s += `<text x="${W / 2}" y="${650 + i * 72}" font-size="62" font-weight="900" fill="#f3f4f7" text-anchor="middle">${esc(l)}</text>`);
    if (P.sub) s += `<text x="${W / 2}" y="${800}" font-size="28" font-weight="600" fill="#8b93a7" text-anchor="middle">${esc(P.sub)}</text>`;
    s += `</g>`;
    return s;
  },
  sfx: () => [[.05, 'tick']],
};

T.room = {
  draw(lt, P, t) {
    let s = roomBg(t, P.light || 'night');
    if (P.stickies) P.stickies.forEach((n, i) => { if (lt >= (n.at || 0)) s += sticky(n.x ?? 130, n.y ?? (520 + i * 0), n.text, n.col, n.rot ?? (-4 + i * 5), pop(lt, n.at || -1), n.w || 190); });
    const door = P.door;
    let dOpen = 0;
    if (door) {
      dOpen = eo(seg(lt, door.at, door.at + .7));
      s += `<rect x="20" y="520" width="200" height="380" fill="${dOpen > 0 ? '#ffe8b0' : '#0e1320'}" stroke="${OL}" stroke-width="8"/>`;
      s += `<g transform="translate(20,520) scale(${1 - dOpen * .85},1)"><rect width="200" height="380" fill="#3a2f2a" stroke="${OL}" stroke-width="8"/><circle cx="170" cy="200" r="10" fill="#d8b56a" stroke="${OL}" stroke-width="4"/></g>`;
      if (dOpen > 0) s += `<path d="M220,520 L220,900 L520,1280 L0,1280 L20,900Z" fill="#ffe8b0" opacity="${.18 * dOpen}"/>`;
      const mi = eo(seg(lt, door.at + .4, door.at + 1));
      if (mi > 0) s += `<g transform="translate(120,905) scale(.72)" opacity="${mi}">${person(Object.assign({ who: door.who || 'mom' }, kf(door.k, lt)))}</g>`;
      if (door.line && lt >= door.lineAt && lt < (door.until ?? 99)) s += speech(270, 330, door.line, seg(lt, door.lineAt, door.lineAt + .35), -60);
    }
    const st = kf(P.k, lt);
    const kx = P.kx ?? 360;
    const typing = st.typing;
    const jig = typing ? Math.sin(lt * 30) * 3 : 0;
    const kidO = Object.assign({ who: 'kid', legs: false, glow: .08 }, st);
    if (typing) { kidO.armL = 28 + jig * 3; kidO.armR = 28 - jig * 3; kidO.look = kidO.look || [0, .8]; }
    s += `<g transform="translate(${kx},${1010 + (st.dy || 0)})">${person(kidO)}</g>`;
    s += desk();
    const scr = kf(P.screen, lt).m || (typing ? 'code' : 'slow');
    let open = 1;
    if (P.closed) open = .04;
    if (P.slamAt !== undefined && lt > P.slamAt) open = Math.max(.04, 1 - eo(seg(lt, P.slamAt, P.slamAt + .15)));
    if (P.monitor) s += monitor(590, 892, .62, screenContent(kf(P.screen2, lt).m || 'code', t + 3));
    s += laptop(P.monitor ? 300 : kx, 900, P.monitor ? .9 : 1, screenContent(scr, t), open, P.silver);
    const cans = Math.floor(kf(P.cans, lt).n || 0);
    for (let i = 0; i < cans; i++) s += `<g transform="translate(${(P.monitor ? 80 : 600) + (i - 1) * 42},905) scale(${pop(lt, (P.cansAt || [])[i] ?? -1, .3)})">${can(0, 0, i)}</g>`;
    if (P.phone !== false) {
      const buzz = P.buzz && lt > P.buzz[0] && lt < P.buzz[1] ? Math.sin(lt * 80) * 4 : 0;
      const lit = P.buzz && lt > P.buzz[0] && lt < P.buzz[1] + 2;
      if (!P.monitor) s += `<g transform="translate(${(kx > 400 ? 160 : 600) + buzz},905) rotate(80)"><rect x="-26" y="-50" width="52" height="100" rx="10" fill="#0b0d12" stroke="${OL}" stroke-width="5"/><rect x="-20" y="-42" width="40" height="84" rx="6" fill="${lit ? '#6ea8ff' : '#1c2333'}"/></g>`;
      if (buzz) for (let k = 0; k < 2; k++) { const sg = k ? 1 : -1, px = kx > 400 ? 160 : 600; s += `<path d="M${px + sg * 70},880 q${sg * 12},12 0,24 M${px + sg * 88},872 q${sg * 16},20 0,40" fill="none" stroke="${YEL}" stroke-width="5" stroke-linecap="round" opacity="${.5 + .5 * Math.sin(lt * 20)}"/>`; }
    }
    if (P.slamAt !== undefined && lt > P.slamAt + .15 && lt < P.slamAt + .8) {
      const p = seg(lt, P.slamAt + .15, P.slamAt + .8);
      s += `<g opacity="${1 - p}">`;
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; s += `<line x1="${kx + Math.cos(a) * (60 + p * 80)}" y1="${880 + Math.sin(a) * (30 + p * 40)}" x2="${kx + Math.cos(a) * (90 + p * 110)}" y2="${880 + Math.sin(a) * (45 + p * 60)}" stroke="${YEL}" stroke-width="7" stroke-linecap="round"/>`; }
      s += `</g>`;
    }
    if (P.flying && typing) for (let i = 0; i < 10; i++) {
      const st0 = i * .55, p = ((lt - st0) % 2.2) / 2.2; if (lt < st0) continue;
      s += `<text x="${kx + (rnd(i) - .5) * 360 * p}" y="${640 - p * 360}" font-size="${26 + rnd(i + 3) * 12}" font-weight="800" fill="${['#7dd3fc', '#f9a8d4', '#bef264', '#fcd34d'][i % 4]}" opacity="${1 - p}" font-family="JetBrains Mono">${esc(['{ }', '</>', '=>', '()', 'px', ';', 'div', 'css', 'if', 'js'][i])}</text>`;
    }
    if (P.broken && lt > P.broken) {
      const p = pop(lt, P.broken), wob = Math.sin(lt * 6) * 8;
      s += `<g transform="translate(360,330) scale(${p * .82})"><rect x="-200" y="-120" width="400" height="240" rx="18" fill="#f3f4f7" stroke="${OL}" stroke-width="6"/><rect x="-200" y="-120" width="400" height="36" rx="18" fill="#d9dde6"/><circle cx="-172" cy="-102" r="7" fill="#ff5f57"/><circle cx="-150" cy="-102" r="7" fill="#febc2e"/><circle cx="-128" cy="-102" r="7" fill="#28c840"/>
        <text x="-170" y="-50" font-size="24" font-weight="800" fill="#141821">${esc(P.brokenName || 'Колосок')}</text>
        <g transform="translate(${40 + wob},-10) rotate(${12 + wob})"><rect x="-70" y="-24" width="140" height="48" rx="12" fill="#f59e0b"/><text y="8" font-size="20" font-weight="800" fill="#fff" text-anchor="middle">Заказать</text></g>
        <g transform="translate(${-90 - wob},60) rotate(-8)"><rect x="-70" y="-22" width="140" height="44" rx="12" fill="#3b82f6"/><text y="7" font-size="18" font-weight="800" fill="#fff" text-anchor="middle">Меню</text></g></g>`;
    }
    // уведомления
    const ns = P.notifs || [];
    ns.forEach((n, i) => {
      if (lt < n.at) return;
      const stack = P.stackNotifs;
      const next = ns[i + 1];
      if (!stack && next && lt > next.at) return;
      if (n.until !== undefined && lt > n.until) return;
      const y = stack ? 240 + i * 120 : (n.y ?? 330);
      s += notifCard(360, y, n.from, n.text, n.col || '#f59e0b', n.letter || n.from[0], seg(lt, n.at, n.at + .4));
    });
    // поток сообщений
    if (P.flood) {
      const F = P.flood;
      F.items.forEach((m, i) => {
        const at = F.at + i * F.step; if (lt < at) return;
        const p = pop(lt, at, .3), y = (F.y0 ?? 290) + i * (F.dy ?? 80), x = i % 2 ? 380 : 340, w = Math.min(460, m.length * 14.5 + 100), last = i === F.items.length - 1 && F.redLast;
        s += `<g transform="translate(${x},${y}) scale(${p}) rotate(${(rnd(i) - .5) * 6})"><rect x="${-w / 2}" y="-34" width="${w}" height="68" rx="18" fill="${last ? '#ffdfe3' : '#f3f4f7'}" stroke="${last ? RED : OL}" stroke-width="5"/>${avatar(-w / 2 + 34, 0, 20, F.col || '#f59e0b', F.letter || 'К')}<text x="${-w / 2 + 64}" y="8" font-size="22" font-weight="700" fill="#141821">${esc(m)}</text></g>`;
      });
      if (F.counter) {
        const cnt = Math.min(F.items.length, Math.max(0, Math.floor((lt - F.at) / F.step) + 1));
        if (cnt > 0) s += `<g transform="translate(570,205) scale(${pop(lt, F.at)}) rotate(6)"><rect x="-95" y="-28" width="190" height="56" rx="16" fill="${RED}" stroke="${OL}" stroke-width="5"/><text y="10" font-size="26" font-weight="900" fill="#fff" text-anchor="middle">${esc(F.counter)}: ${cnt}</text></g>`;
      }
    }
    if (P.say) for (const b of P.say) if (lt >= b.at && lt < (b.until ?? 99)) s += speech(b.x ?? 470, b.y ?? 330, b.text, seg(lt, b.at, b.at + .35), b.tail ?? -60);
    return s;
  },
  sfx(P, d) {
    const ev = [];
    if (P.buzz) ev.push([P.buzz[0], 'buzz', { d: P.buzz[1] - P.buzz[0] }]);
    (P.notifs || []).forEach(n => ev.push([n.at, 'ping']));
    if (P.flood) P.flood.items.forEach((m, i) => ev.push([P.flood.at + i * P.flood.step, 'pop']));
    if (P.door) { ev.push([P.door.at, 'creak']); }
    if (P.slamAt !== undefined) ev.push([P.slamAt, 'slam']);
    (P.cansAt || []).forEach(a => ev.push([a, 'can']));
    if (P.broken) ev.push([P.broken, 'error']);
    let typing = false;
    for (let x = 0; x < d; x += .09) { const st = kf(P.k, x); if (st.typing) ev.push([x + Math.random() * .04, 'key']); }
    (P.say || []).forEach(b => ev.push([b.at, 'talk', { who: 'kid', n: b.text.length }]));
    if (P.door && P.door.line) ev.push([P.door.lineAt, 'talk', { who: P.door.who || 'mom', n: P.door.line.length }]);
    return ev;
  },
};

T.chat = {
  draw(lt, P) {
    let s = `<rect width="${W}" height="${H}" fill="${P.bg || '#151b2b'}"/>`;
    for (let i = 0; i < 20; i++) s += `<circle cx="${rnd(i) * W}" cy="${rnd(i + 50) * H}" r="${2 + rnd(i + 9) * 3}" fill="#2a3450"/>`;
    let inner = `<rect x="-152" y="-270" width="304" height="70" fill="#fff"/>${avatar(-110, -235, 22, P.col || '#f59e0b', P.letter || P.name[0])}<text x="-78" y="-240" font-size="${P.name.length > 18 ? 15 : 18}" font-weight="800" fill="#141821">${esc(P.name)}</text><text x="-78" y="-218" font-size="14" fill="${P.status === 'был недавно' ? '#8a92a6' : '#22a35a'}" font-weight="600">${esc(P.status || 'в сети')}</text>`;
    const vis = P.msgs.filter(m => lt >= m.at);
    // считаем высоты, держим последние на экране
    const items = vis.map(m => { const lines = wrap(m.text, 19); return { m, lines, h: 26 + lines.length * 25 }; });
    let total = items.reduce((a, b) => a + b.h + 12, 0);
    let y = -186 - Math.max(0, total - 470);
    let msgs = '';
    for (const it of items) {
      const { m, lines, h } = it;
      const p = seg(lt, m.at, m.at + .35);
      if (m.sys) {
        msgs += `<g opacity="${clamp(p * 3)}"><rect x="-140" y="${y}" width="280" height="${h}" rx="14" fill="#ffe3e3"/>${lines.map((l, i) => `<text x="0" y="${y + 30 + i * 25}" font-size="16" font-weight="700" fill="${RED}" text-anchor="middle">${esc(l)}</text>`).join('')}</g>`;
      } else {
        const w = Math.max(...lines.map(l => l.length)) * 10.6 + 34;
        const x = m.me ? 140 - w : -140;
        const sc = back(p);
        msgs += `<g transform="translate(${x + (m.me ? w : 0)},${y + h / 2}) scale(${sc}) translate(${-(m.me ? w : 0)},${-h / 2})" opacity="${clamp(p * 3)}"><rect width="${w}" height="${h}" rx="18" fill="${m.me ? '#3b82f6' : '#e2e5ec'}"/>${lines.map((l, i) => `<text x="17" y="${31 + i * 25}" font-size="19" font-weight="600" fill="${m.me ? '#fff' : '#141821'}">${esc(l)}</text>`).join('')}</g>`;
      }
      y += h + 12;
    }
    inner += `<g clip-path="url(#chatclip)">${msgs}</g>`;
    const nxt = P.msgs.find(m => m.me && lt < m.at && lt > m.at - .8);
    if (nxt) for (let k = 0; k < 3; k++) inner += `<circle cx="${90 + k * 18}" cy="290" r="6" fill="#9aa3b5" opacity="${.4 + .6 * Math.abs(Math.sin(lt * 8 + k))}"/>`;
    const pz = lerp(1.05, 1.12, eio(seg(lt, 0, P.d || 5)));
    s += `<defs><clipPath id="chatclip"><rect x="-152" y="-200" width="304" height="500"/></clipPath></defs>`;
    s += phoneFrame(W / 2, 600, pz, inner, -2);
    const kp = eo(seg(lt, P.kidIn ?? 1.2, (P.kidIn ?? 1.2) + .5));
    const st = kf(P.k, lt);
    s += `<g transform="translate(${-40 + kp * 170},${1400 - kp * 90}) rotate(${12 - kp * 6})"><g transform="scale(.9)">${person(Object.assign({ who: P.peek || 'kid', look: [.6, -.6], armL: 5, armR: 20 }, st))}</g></g>`;
    return s;
  },
  sfx(P) { return P.msgs.map(m => [m.at, m.sys ? 'error' : m.me ? 'send' : 'pop']); },
};

T.browser = {
  draw(lt, P, t) {
    let s = `<rect width="${W}" height="${H}" fill="${P.bg || '#101624'}"/>`;
    for (let i = 0; i < 30; i++) s += `<circle cx="${rnd(i + 3) * W}" cy="${rnd(i + 90) * H}" r="${1.5 + rnd(i) * 2.5}" fill="#2a3a5c" opacity="${.5 + .5 * Math.sin(t * 2 + i)}"/>`;
    const p = eo(seg(lt, 0, .5));
    const md = kf(P.modes || [[0, { m: 'live' }]], lt);
    const mode = md.m;
    const S = SITES[P.site] || {};
    let br = `<rect x="-300" y="-260" width="600" height="520" rx="22" fill="#f3f4f7" stroke="${OL}" stroke-width="8"/><rect x="-300" y="-260" width="600" height="56" rx="22" fill="#d9dde6"/><rect x="-300" y="-226" width="600" height="22" fill="#d9dde6"/>
      <circle cx="-266" cy="-232" r="9" fill="#ff5f57"/><circle cx="-238" cy="-232" r="9" fill="#febc2e"/><circle cx="-210" cy="-232" r="9" fill="#28c840"/>
      <rect x="-170" y="-248" width="420" height="32" rx="16" fill="#fff"/><text x="-150" y="-225" font-size="18" font-weight="600" fill="#4b5263">${esc(S.url || '')}</text>`;
    br += `<g transform="translate(-300,-204)"><clipPath id="brc"><rect width="600" height="464"/></clipPath><g clip-path="url(#brc)">`;
    if (mode === 'loading') {
      const prog = eio(seg(lt, md.from ?? .6, md.to ?? 2));
      br += `<rect width="600" height="464" fill="#f3f4f7"/><text x="300" y="180" font-size="30" font-weight="800" fill="#141821" text-anchor="middle">Публикация…</text><rect x="80" y="220" width="440" height="30" rx="15" fill="#d9dde6"/><rect x="80" y="220" width="${440 * prog}" height="30" rx="15" fill="#3b82f6"/><text x="300" y="300" font-size="26" font-weight="800" fill="#4b5263" text-anchor="middle">${Math.round(prog * 100)}%</text>`;
    } else if (mode === 'error') {
      br += `<rect width="600" height="464" fill="#fff"/><text x="300" y="200" font-size="120" font-weight="900" fill="${RED}" text-anchor="middle">502</text><text x="300" y="260" font-size="28" font-weight="700" fill="#4b5263" text-anchor="middle">Сервер не отвечает</text>`;
    } else {
      const q = eo(seg(lt, md.since ?? 0, (md.since ?? 0) + .5));
      br += `<g opacity="${md.since !== undefined ? q : 1}">${siteMock(P.site, t, { bought: md.bought })}</g>`;
    }
    br += `</g></g>`;
    if (md.traffic) {
      const tp = seg(lt, md.traffic, md.traffic + 2.5);
      const n = Math.round(lerp(40, md.peak || 8400, eio(tp)));
      let path = 'M0,90'; for (let i = 0; i <= 20; i++) { const x = i * 12, y = 90 - Math.pow(i / 20, 2.2) * 80 * clamp(tp * 1.2) - rnd(i) * 6; path += ` L${x},${y.toFixed(1)}`; }
      br += `<g transform="translate(-10,120)"><rect x="-20" y="-50" width="300" height="160" rx="16" fill="#141821" stroke="${OL}" stroke-width="5"/><text x="0" y="-18" font-size="18" font-weight="700" fill="#8a92a6">онлайн сейчас</text><text x="260" y="-18" font-size="24" font-weight="900" fill="${md.traffic && md.hot ? '#ff8787' : '#45e08a'}" text-anchor="end">${n.toLocaleString('ru-RU').replace(/ /g, ' ')}</text><g transform="translate(10,0)"><path d="${path}" fill="none" stroke="${md.hot ? '#ff8787' : '#45e08a'}" stroke-width="5" stroke-linejoin="round"/></g></g>`;
    }
    const shk = mode === 'error' && md.since !== undefined && lt - md.since < .4 ? Math.sin(lt * 90) * 10 * (1 - (lt - md.since) / .4) : 0;
    s += `<g transform="translate(${W / 2 + shk},560) scale(${.8 + .2 * p})" opacity="${p}">${br}</g>`;
    if (P.k !== null) {
      const st = kf(P.k, lt);
      const kp = eo(seg(lt, .2, .7));
      s += `<g transform="translate(160,${1340 - kp * 120}) scale(.8)">${person(Object.assign({ who: 'kid', look: [.7, -.8], armR: 20, armL: 10 }, st))}</g>`;
    }
    return s;
  },
  sfx(P) {
    const ev = [];
    for (const [at, st] of (P.modes || [])) {
      if (st.m === 'loading') ev.push([at + (st.from ?? .6), 'blips']);
      if (st.m === 'live' && at > 0) ev.push([at, 'success']);
      if (st.m === 'error') ev.push([at, 'crash']);
      if (st.bought) ev.push([at, 'success']);
      if (st.traffic) ev.push([st.traffic, 'rise']);
    }
    return ev;
  },
};

T.pay = {
  draw(lt, P) {
    const pos = P.amount > 0;
    const hit = P.at + 1.2;
    const joy = P.react === 'joy' && lt > hit;
    let s = `<rect width="${W}" height="${H}" fill="${lt > hit ? (joy ? '#11261c' : (P.react || pos) ? '#16202a' : '#2a1216') : '#151b2b'}"/>`;
    if (joy) { const q = eo(seg(lt, hit, hit + .6)); s += `<g transform="translate(${W / 2},560) rotate(${lt * 12})" opacity="${.35 * q}">`; for (let k = 0; k < 12; k++) s += `<path d="M0,0 L${Math.cos(k / 12 * Math.PI * 2) * 1200},${Math.sin(k / 12 * Math.PI * 2) * 1200} L${Math.cos((k + .45) / 12 * Math.PI * 2) * 1200},${Math.sin((k + .45) / 12 * Math.PI * 2) * 1200}Z" fill="#45e08a"/>`; s += `</g>`; }
    const pp = eo(seg(lt, 0, .5));
    let inner = `<text y="-170" font-size="64" font-weight="300" fill="#fff" text-anchor="middle">${esc(P.clock || '22:41')}</text><text y="-130" font-size="18" fill="#c9d1e6" text-anchor="middle">${esc(P.wd || 'четверг')}</text>`;
    const np = seg(lt, P.at, P.at + .4);
    if (np > 0) {
      inner += `<g transform="translate(0,-30) scale(${back(np)})"><rect x="-138" y="-50" width="276" height="100" rx="20" fill="#f3f4f7"/><rect x="-122" y="-30" width="44" height="44" rx="12" fill="${pos ? GREEN : RED}"/><text x="-100" y="1" font-size="22" font-weight="900" fill="#fff" text-anchor="middle">₽</text>`;
      wrap(P.title, 22).slice(0, 2).forEach((l, i) => inner += `<text x="-66" y="${-14 + i * 19}" font-size="15" font-weight="800" fill="#141821">${esc(l)}</text>`);
      inner += `<text x="-66" y="34" font-size="24" font-weight="900" fill="${pos ? GREEN : RED}">${(pos ? '+' : '') + money(P.amount)}</text></g>`;
    }
    s += phoneFrame(W / 2, 600, .95 * pp + .05, inner, joy ? Math.sin(lt * 10) * 2 * (1 - seg(lt, hit, hit + .8)) : 0, true);
    const st = kf(P.k, lt);
    const jump = joy ? Math.abs(Math.sin((lt - hit) * 5)) * -70 : 0;
    const def = lt > hit ? (joy ? { eyes: 'happy', mouth: 'grin', armL: -155, armR: -155, blush: true } : pos ? { eyes: 'happy', mouth: 'smile' } : { eyes: 'sad', mouth: 'sad' }) : { eyes: 'wide', mouth: 'o' };
    s += `<g transform="translate(${W / 2},${1330 + jump}) scale(.85)">${person(Object.assign({ who: 'kid', look: [0, -.9], armL: 20, armR: 20 }, def, st))}</g>`;
    if (joy) s += confetti(lt, hit);
    return s;
  },
  sfx(P) { return [[P.at, 'ping'], [P.at + 1.2, P.amount > 0 ? 'coins' : 'loss']]; },
};

T.school = {
  draw(lt, P) {
    let s = `<rect width="${W}" height="${H}" fill="#cfd8c8"/><rect y="900" width="${W}" height="380" fill="#a9b39d"/>`;
    s += `<rect x="540" y="180" width="160" height="400" fill="#f4f8ff" stroke="${OL}" stroke-width="8"/><line x1="620" y1="180" x2="620" y2="580" stroke="${OL}" stroke-width="6"/>`;
    s += `<rect x="40" y="200" width="470" height="300" rx="8" fill="#2f4a3a" stroke="#6b4b2f" stroke-width="16"/>`;
    (P.board || []).forEach((l, i) => s += `<text x="70" y="${270 + i * 66}" font-size="${i ? 34 : 30}" font-weight="600" fill="#e9efe6" font-family="DejaVu Serif" font-style="italic">${esc(l)}</text>`);
    s += `<g transform="translate(620,110)"><circle r="48" fill="#fff" stroke="${OL}" stroke-width="7"/><line y2="-30" stroke="${OL}" stroke-width="6" stroke-linecap="round" transform="rotate(${240 + lt * 40})"/><line y2="-20" stroke="${OL}" stroke-width="7" stroke-linecap="round" transform="rotate(255)"/></g>`;
    const st = kf(P.k, lt);
    const drop = st.sleep ? eio(seg(lt, st.sleep, st.sleep + 1.2)) : 0;
    s += `<g transform="translate(360,1060)"><g transform="rotate(${drop * -14})">${person(Object.assign({ who: 'kid', armL: -50, armR: -50, legs: false, look: [0, -.3] }, st))}</g></g>`;
    s += `<rect x="80" y="950" width="560" height="34" rx="6" fill="#b88a5a" stroke="${OL}" stroke-width="8"/><rect x="110" y="980" width="500" height="320" fill="#9b7046" stroke="${OL}" stroke-width="8"/>`;
    s += `<g transform="translate(250,945) rotate(-6)"><rect x="-70" y="-12" width="140" height="18" rx="3" fill="#fff" stroke="${OL}" stroke-width="5"/></g>`;
    if (st.sleep && lt > st.sleep + .8) for (let k = 0; k < 3; k++) { const p = ((lt - st.sleep - .8 + k * .5) % 1.5) / 1.5; s += `<text x="${480 + p * 60 + k * 10}" y="${560 - p * 120 - k * 10}" font-size="${36 + k * 10}" font-weight="900" fill="#3b4a5e" opacity="${1 - p}">z</text>`; }
    if (P.teacher && lt >= P.teacher.at) s += speech(P.teacher.x ?? 300, P.teacher.y ?? 620, P.teacher.text, seg(lt, P.teacher.at, P.teacher.at + .35), 80, true);
    if (P.grade && lt >= P.grade.at) {
      const g = P.grade, p = pop(lt, g.at, .4);
      s += `<g transform="translate(585,640) scale(${p}) rotate(8)"><rect x="-110" y="-140" width="220" height="280" rx="10" fill="#fffdf6" stroke="${OL}" stroke-width="7"/><text y="-80" font-size="22" font-weight="700" fill="#6b7385" text-anchor="middle">${esc(g.label || 'Контрольная')}</text><text y="70" font-size="170" font-weight="900" fill="${g.col}" text-anchor="middle" font-family="DejaVu Serif">${esc(g.grade)}</text></g>`;
    }
    return s;
  },
  sfx(P) {
    const ev = [];
    if (P.bell) ev.push([.1, 'bell']);
    if (P.grade) ev.push([P.grade.at, 'stamp'], [P.grade.at + .1, P.grade.good ? 'success' : 'loss']);
    const st = kf(P.k, 99); if (st.sleep) ev.push([st.sleep + .8, 'snore']);
    if (P.teacher) ev.push([P.teacher.at, 'talk', { who: 'teacher', n: P.teacher.text.length }]);
    return ev;
  },
};

T.talk = {
  draw(lt, P) {
    let s = placeBg(P.place);
    const lines = P.lines || [];
    const cur = [...lines].reverse().find(l => lt >= l.at);
    const side = (who, x, kfl, faceDir) => {
      const st = kf(kfl, lt);
      const o = Object.assign({ who, look: [faceDir * .7, -.1] }, st);
      const speaking = lines.some(l => l.who === (x < 360 ? 'A' : 'B') && talking(lt, l.at, l.text));
      if (speaking) { o.mouth = Math.floor(lt * 8) % 2 ? (st.mouthTalk || 'open') : (st.mouth || 'smile'); o.armR = (st.armR ?? 10) + Math.sin(lt * 6) * 14; }
      return `<g transform="translate(${x},1250) scale(.95)">${person(o)}</g>`;
    };
    s += side(P.A, 185, P.ak, 1) + side(P.B, 535, P.bk, -1);
    if (cur && (cur.until === undefined || lt < cur.until)) {
      const left = cur.who === 'A';
      s += speech(left ? 280 : 440, cur.y ?? 590, cur.text, seg(lt, cur.at, cur.at + .35), left ? -80 : 80);
    }
    return s;
  },
  sfx(P) { return (P.lines || []).map(l => [l.at, 'talk', { who: l.who === 'A' ? P.A : P.B, n: l.text.length }]); },
};

T.board = {
  draw(lt, P) {
    let s = `<rect width="${W}" height="${H}" fill="#2a3042"/><rect y="1000" width="${W}" height="280" fill="#1f2433"/>`;
    s += `<rect x="30" y="170" width="660" height="760" rx="18" fill="#f5f6f8" stroke="${OL}" stroke-width="10"/>`;
    s += `<text x="${W / 2}" y="240" font-size="38" font-weight="900" fill="#141821" text-anchor="middle">${esc(P.title || '')}</text>`;
    if (P.rules) {
      P.rules.forEach((r, i) => { if (lt >= r.at) s += sticky(W / 2, 380 + i * 170, r.text, r.col || '#ffe066', (i % 2 ? 3 : -3), pop(lt, r.at) * 1.6, 330); });
    } else {
      const cols = P.cols || ['надо', 'делаю', 'готово'];
      cols.forEach((c, i) => s += `<text x="${140 + i * 220}" y="310" font-size="26" font-weight="800" fill="#6b7385" text-anchor="middle">${esc(c)}</text><line x1="${250 + i * 220}" y1="280" x2="${250 + i * 220}" y2="900" stroke="#d9dde6" stroke-width="4"/>`);
      (P.cards || []).forEach((c, i) => {
        if (lt < (c.at || 0)) return;
        let col = c.col || 0, from = col, mvAt = -9;
        for (const [at, cc] of (c.moves || [])) if (lt >= at) { from = col; col = cc; mvAt = at; }
        const p = eio(seg(lt, mvAt, mvAt + .45));
        const x = lerp(140 + from * 220, 140 + col * 220, p), y = 400 + i * 110 - Math.sin(p * Math.PI) * 30;
        s += sticky(x, y, c.text, col === 2 ? '#b2f2bb' : c.c || '#ffe066', (rnd(i) - .5) * 6, pop(lt, c.at || -1) * (col === 2 && lt - mvAt < .5 ? 1 + .1 * Math.sin(seg(lt, mvAt, mvAt + .5) * Math.PI) : 1), 180);
      });
    }
    if (P.k) { const st = kf(P.k, lt); s += `<g transform="translate(600,1330) scale(.7)">${person(Object.assign({ who: 'kid', look: [-.6, -.7], armL: 10, armR: 10 }, st))}</g>`; }
    return s;
  },
  sfx(P) {
    const ev = [];
    (P.rules || []).forEach(r => ev.push([r.at, 'stamp']));
    (P.cards || []).forEach(c => { ev.push([c.at || 0, 'pop']); (c.moves || []).forEach(m => ev.push([m[0], 'swish'])); });
    return ev;
  },
};

T.calendar = {
  draw(lt, P) {
    let s = `<rect width="${W}" height="${H}" fill="${P.bg || '#1f2638'}"/>`;
    const pages = P.pages, n = pages.length;
    const a = P.flip?.[0] ?? .3, b = P.flip?.[1] ?? 3;
    const f = clamp((lt - a) / (b - a)) * (n - 1);
    const idx = Math.min(n - 1, Math.floor(f)), frac = f - idx;
    const cal = (pg, extra = '') => `<g ${extra}><rect x="-230" y="-260" width="460" height="520" rx="22" fill="#fffdf6" stroke="${OL}" stroke-width="9"/><rect x="-230" y="-260" width="460" height="120" rx="22" fill="${RED}" stroke="${OL}" stroke-width="9"/><rect x="-226" y="-180" width="452" height="36" fill="${RED}"/><text y="-178" font-size="46" font-weight="900" fill="#fff" text-anchor="middle">${esc(pg[0])}</text><text y="110" font-size="220" font-weight="900" fill="#141821" text-anchor="middle">${esc(pg[1])}</text><text y="200" font-size="36" font-weight="700" fill="#6b7385" text-anchor="middle">${esc(pg[2] || '')}</text></g>`;
    s += `<g transform="translate(${W / 2},560)">`;
    if (idx + 1 < n && frac > 0) s += cal(pages[idx + 1]);
    const fl = idx + 1 < n ? eio(clamp(frac * 1.4)) : 0;
    s += cal(pages[idx], `transform="translate(0,${-fl * 500}) rotate(${-fl * 25})" opacity="${1 - fl}"`);
    s += `</g>`;
    (P.notes || []).forEach((nt, i) => { if (lt >= nt.at) s += sticky(nt.x ?? (i % 2 ? 560 : 160), nt.y ?? (300 + i * 150), nt.text, nt.col || '#ffe066', i % 2 ? 6 : -6, pop(lt, nt.at), nt.w || 200); });
    if (P.k) { const st = kf(P.k, lt); s += `<g transform="translate(150,1340) scale(.75)">${person(Object.assign({ who: 'kid', look: [.7, -.8], armL: 10, armR: 10 }, st))}</g>`; }
    return s;
  },
  sfx(P) {
    const ev = []; const n = P.pages.length, a = P.flip?.[0] ?? .3, b = P.flip?.[1] ?? 3;
    for (let i = 1; i < n; i++) ev.push([a + (b - a) * (i - 1) / (n - 1), 'flip']);
    (P.notes || []).forEach(nt => ev.push([nt.at, 'stamp']));
    return ev;
  },
};

// ---------------- HUD ----------------
function hm(str) { const [h, m] = str.split(':').map(Number); return h * 60 + m; }
function fmtTime(m) { m = Math.round(m) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
function hud(sh, lt, bal, flash) {
  if (!sh.day) return '';
  let tm = sh.time || '';
  if (Array.isArray(tm)) { let a = hm(tm[0]), b = hm(tm[1]); if (b < a) b += 1440; tm = fmtTime(lerp(a, b, seg(lt, .3, sh.d - .3))); }
  const fl = flash && lt >= flash.at && lt < flash.at + 1.5;
  const fp = fl ? seg(lt, flash.at, flash.at + 1.5) : 0;
  const pos = flash && flash.v > 0;
  const bcol = fl ? (pos ? '#45e08a' : '#ff8787') : '#e6e8ee';
  const sc = fl ? 1 + .08 * Math.sin(fp * Math.PI) : 1;
  let s = `<g transform="translate(20,34)">
   <g transform="translate(130,40) scale(${sc}) translate(-130,-40)"><rect width="260" height="80" rx="16" fill="#0c0f16" opacity=".88" stroke="${fl ? bcol : '#2b3140'}" stroke-width="3"/>
   <text x="20" y="28" font-size="13" font-weight="700" fill="#8a92a6" letter-spacing="1">на счету</text>
   <text x="20" y="64" font-size="32" font-weight="800" fill="${bcol}">${money(bal)}</text></g>
   <rect x="276" y="0" width="100" height="80" rx="16" fill="#0c0f16" opacity=".88" stroke="#2b3140" stroke-width="3"/>
   <text x="326" y="28" font-size="13" font-weight="700" fill="#8a92a6" text-anchor="middle">день</text>
   <text x="326" y="64" font-size="32" font-weight="800" fill="#e6e8ee" text-anchor="middle">${sh.day}</text>
   <rect x="392" y="0" width="160" height="80" rx="16" fill="#0c0f16" opacity=".88" stroke="#2b3140" stroke-width="3"/>
   <circle cx="420" cy="52" r="10" fill="none" stroke="#8a92a6" stroke-width="3"/><line x1="420" y1="52" x2="420" y2="45" stroke="#8a92a6" stroke-width="3"/>
   <text x="438" y="28" font-size="13" font-weight="700" fill="#8a92a6">время</text>
   <text x="438" y="64" font-size="30" font-weight="800" fill="#e6e8ee">${tm}</text></g>`;
  if (fl) s += `<g opacity="${1 - fp}" transform="translate(40,${150 - fp * 40})"><rect width="${money(Math.abs(flash.v)).length * 15 + 40}" height="40" rx="12" fill="${pos ? GREEN : RED}"/><text x="20" y="28" font-size="22" font-weight="800" fill="#fff">${(pos ? '+' : '−') + money(Math.abs(flash.v))}</text></g>`;
  return s;
}

// ---------------- СУБТИТРЫ ----------------
function parseSub(text) {
  const out = []; let hl = false;
  for (let w of text.split(' ')) {
    let on = hl;
    if (w.startsWith('*')) { on = true; w = w.slice(1); hl = true; }
    if (w.endsWith('*')) { w = w.slice(0, -1); hl = false; }
    else if (w.includes('*')) { w = w.replace('*', ''); hl = false; }
    out.push([w, on]);
  }
  return out;
}
function subsLayer(sh, lt) {
  const list = sh.s || []; if (!list.length) return '';
  const pad = .15, span = (sh.d - pad * 2) / list.length;
  const i = Math.min(list.length - 1, Math.floor((lt - pad) / span));
  if (lt < pad || lt > sh.d - .08) return '';
  const st = pad + i * span, words = parseSub(list[i]), dur = span * .65;
  const lines = [[]]; let len = 0;
  words.forEach((w, k) => { if (len + w[0].length > 22 && lines[lines.length - 1].length) { lines.push([]); len = 0; } lines[lines.length - 1].push(k); len += w[0].length + 1; });
  const y0 = (sh.subY || 1110) - (lines.length - 1) * 26;
  let out = '';
  lines.forEach((ln, li) => {
    let spans = '';
    ln.forEach(k => { const ap = st + dur * k / words.length; const p = seg(lt, ap, ap + .12); spans += `<tspan fill="${words[k][1] ? YEL : '#fff'}" fill-opacity="${p}" stroke-opacity="${p}">${esc(words[k][0])} </tspan>`; });
    out += `<text x="${W / 2}" y="${y0 + li * 54}" font-size="42" font-weight="800" text-anchor="middle" stroke="#0b0d12" stroke-width="10" stroke-linejoin="round" paint-order="stroke" xml:space="preserve">${spans}</text>`;
  });
  return out;
}

// ---------------- СБОРКА СЕРИИ ----------------
function buildEpisode(ep) {
  let t = 0, bal = ep.startBal || 0;
  const shots = ep.shots.map(sh => {
    const o = Object.assign({}, sh, { start: t, balStart: bal });
    if (sh.bal) { o.flash = { at: sh.balAt ?? (sh.type === 'pay' ? sh.at + 1.2 : 1), v: sh.bal }; bal += sh.bal; }
    o.balEnd = bal;
    t += sh.d;
    return o;
  });
  return { ep, shots, dur: t, endBal: bal };
}
function camera(sh, lt) {
  let tr = '';
  for (const a of sh.shake || []) { const p = seg(lt, a, a + .4); if (p > 0 && p < 1) { const k = (1 - p) * 14; tr += `translate(${Math.sin(lt * 90) * k},${Math.cos(lt * 77) * k}) `; } }
  if (sh.zoom) { const [z0, z1, cx = 360, cy = 760] = sh.zoom; const z = lerp(z0, z1, eio(seg(lt, 0, sh.d))); tr += `translate(${cx},${cy}) scale(${z}) translate(${-cx},${-cy})`; }
  return tr;
}
function drawFrame(B, t) {
  const sh = B.shots.find(s => t >= s.start && t < s.start + s.d) || B.shots[B.shots.length - 1];
  const lt = t - sh.start;
  const body = T[sh.type].draw(lt, sh, t);
  let bal = sh.balStart;
  if (sh.flash && lt >= sh.flash.at) bal = lerp(sh.balStart, sh.balEnd, eo(seg(lt, sh.flash.at, sh.flash.at + 1.1)));
  let tr = '';
  if (sh.start > 0 && lt < .18) tr = `<rect width="${W}" height="${H}" fill="#000" opacity="${1 - lt / .18}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
   <defs><clipPath id="scr"><rect x="-172" y="-234" width="344" height="216"/></clipPath></defs>
   <g transform="${camera(sh, lt)}">${body}${stampsLayer(sh.stamps, lt)}</g>${hud(sh, lt, bal, sh.flash)}${subsLayer(sh, lt)}${tr}</svg>`;
}
function soundEvents(B) {
  const ev = [];
  for (const sh of B.shots) {
    if (sh.start > 0) ev.push([sh.start - .12, 'whoosh']);
    for (const [at, k, o] of (T[sh.type].sfx ? T[sh.type].sfx(sh, sh.d) : [])) if (at < sh.d) ev.push([sh.start + at, k, o || {}]);
    for (const st of sh.stamps || []) ev.push([sh.start + st.at, 'stamp']);
    for (const a of sh.shake || []) ev.push([sh.start + a, 'thud']);
    if (sh.flash && sh.type !== 'pay') ev.push([sh.start + sh.flash.at, sh.flash.v > 0 ? 'coins' : 'loss']);
  }
  const moods = B.shots.map(sh => [sh.start, sh.mood || B.ep.mood || 'chill']);
  return { dur: B.dur, events: ev.map(e => [+e[0].toFixed(3), e[1], e[2] || {}]), moods };
}
if (typeof module !== 'undefined') module.exports = { buildEpisode, drawFrame, soundEvents };
