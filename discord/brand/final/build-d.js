// Финальный комплект по варианту D: иконка, прозрачные версии, светлая, баннеры.
import { writeFileSync } from 'node:fs';
const OUT = new URL('./', import.meta.url).pathname;

const grad = (id, a, b, c, d) => `
  <linearGradient id="${id}" x1="0" y1="0" x2="0.15" y2="1">
    <stop offset="0%" stop-color="${a}"/><stop offset="32%" stop-color="${b}"/>
    <stop offset="58%" stop-color="${c}"/><stop offset="80%" stop-color="${b}"/>
    <stop offset="100%" stop-color="${d}"/>
  </linearGradient>`;

const defs = `
  ${grad('gold', '#F7E9C0', '#E3CB93', '#A8873F', '#F2E3B6')}
  ${grad('goldDark', '#C9A961', '#B08D45', '#7A5F28', '#C9A961')}
  <radialGradient id="bg" cx="50%" cy="30%" r="82%">
    <stop offset="0%" stop-color="#1B1B1F"/><stop offset="55%" stop-color="#101012"/>
    <stop offset="100%" stop-color="#070709"/>
  </radialGradient>
  <radialGradient id="bgLight" cx="50%" cy="34%" r="80%">
    <stop offset="0%" stop-color="#FBF9F4"/><stop offset="100%" stop-color="#EDE8DE"/>
  </radialGradient>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="9" result="b"/>
    <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .2 0"/>
    <feBlend in="SourceGraphic"/>
  </filter>`;

function letterE(h, fill) {
  const stem = h * 0.205;
  const A = { top: h * 0.098, mid: h * 0.078, bot: h * 0.108 };
  const W = { top: h * 0.53, mid: h * 0.41, bot: h * 0.57 };
  const flare = h * 0.019, over = h * 0.012;
  const r = (x, y, w, hh) => `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${hh.toFixed(2)}" fill="${fill}"/>`;
  const arm = (y, w, hh) => r(0, y, w, hh) + r(w - flare, y - over, flare, hh + over * 2);
  return `<g>${r(0, 0, stem, h)}${arm(0, W.top, A.top)}${arm((h - A.mid) / 2, W.mid, A.mid)}${arm(h - A.bot, W.bot, A.bot)}</g>`;
}
const eW = (h) => h * 0.57;

function crown(w, fill) {
  const band = w * 0.075, gap = w * 0.03, baseY = w * 0.46;
  const spire = (cx, ph, hw) => `<path d="M${cx - hw} ${baseY} Q${cx - hw * 0.3} ${baseY - ph * 0.5} ${cx} ${baseY - ph}
      Q${cx + hw * 0.3} ${baseY - ph * 0.5} ${cx + hw} ${baseY}Z" fill="${fill}"/>`;
  const pearl = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="${w * 0.028}" fill="${fill}"/>`;
  return `<g>
    ${spire(w * 0.5, baseY * 0.86, w * 0.15)}${spire(w * 0.16, baseY * 0.58, w * 0.115)}${spire(w * 0.84, baseY * 0.58, w * 0.115)}
    ${pearl(w * 0.5, baseY - baseY * 0.86 - w * 0.022)}${pearl(w * 0.16, baseY - baseY * 0.58 - w * 0.02)}${pearl(w * 0.84, baseY - baseY * 0.58 - w * 0.02)}
    <rect x="0" y="${baseY}" width="${w}" height="${band}" fill="${fill}"/>
    <rect x="${w * 0.06}" y="${baseY + band + gap}" width="${w * 0.88}" height="${w * 0.018}" fill="${fill}" opacity="0.75"/>
  </g>`;
}

// Венок: две ветви, открытые сверху под корону
function wreath(cx, cy, R, fill, count = 10) {
  const branch = (dir) => Array.from({ length: count }, (_, i) => {
    const a = 118 - i * 12.5;
    const rad = (a * Math.PI) / 180;
    const x = cx + dir * Math.sin(rad) * R * 0.86;
    const y = cy + Math.cos(rad) * R;
    const rot = dir > 0 ? 90 - a : a - 90;
    const s = (1 - i * 0.045) * (R / 355);
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(44 * s).toFixed(1)}" ry="${(15 * s).toFixed(1)}"
      transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${fill}"/>`;
  }).join('');
  return branch(1) + branch(-1);
}

const SERIF = "Charter,'Bitstream Charter','Liberation Serif','DejaVu Serif',serif";
const text = (x, y, t, size, sp, fill) =>
  `<text x="${x}" y="${y}" text-anchor="middle" fill="${fill}" font-family="${SERIF}" font-size="${size}" letter-spacing="${sp}">${t}</text>`;

// Знак целиком: венок + корона + буква, вписанный в квадрат side
function emblem(cx, cy, scale, gold) {
  const R = 355 * scale, cw = 190 * scale, eh = 350 * scale;
  return `<g filter="url(#soft)">
    ${wreath(cx, cy, R, gold)}
    <g transform="translate(${cx - cw / 2},${cy - 276 * scale})">${crown(cw, gold)}</g>
    <g transform="translate(${cx - eW(eh) / 2},${cy - 102 * scale})">${letterE(eh, gold)}</g>
  </g>`;
}

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${body}</svg>`;

const files = {
  // иконка на тёмном
  'D-icon': svg(1024, 1024, `<rect width="1024" height="1024" fill="url(#bg)"/>${emblem(512, 512, 1, 'url(#gold)')}`),
  // прозрачный фон — накладывать куда угодно
  'D-icon-transparent': svg(1024, 1024, emblem(512, 512, 1, 'url(#gold)')),
  // светлая версия для форума и документов
  'D-light': svg(1024, 1024, `<rect width="1024" height="1024" fill="url(#bgLight)"/>${emblem(512, 512, 1, 'url(#goldDark)')}`),
  // горизонтальная связка: знак + название
  'D-lockup': svg(1600, 600, `
    ${emblem(380, 300, 0.62, 'url(#gold)')}
    ${text(1050, 290, 'E M P E R I U M', 92, 14, '#E3CB93')}
    <rect x="770" y="336" width="560" height="2" fill="#7A6636"/>
    ${text(1050, 402, 'RMRP', 40, 18, '#9A8category')}`.replace('#9A8category', '#9A8656')),
  // баннер сервера
  'D-banner': svg(1920, 1080, `
    <rect width="1920" height="1080" fill="url(#bg)"/>
    ${emblem(960, 452, 0.86, 'url(#gold)')}
    ${text(960, 852, 'E M P E R I U M', 104, 16, '#E3CB93')}
    <rect x="660" y="900" width="600" height="2" fill="#7A6636"/>
    ${text(960, 966, '\u0421 \u0415 \u041c \u042c \u042f  \u00b7  R M R P', 40, 10, '#9A8656')}`),
};

for (const [name, s] of Object.entries(files)) {
  writeFileSync(`${OUT}emperium-${name}.svg`, s);
  const m = s.match(/viewBox="0 0 (\d+) (\d+)"/);
  const [w, h] = [Number(m[1]), Number(m[2])];
  const transparent = name.includes('transparent');
  writeFileSync(`${OUT}emperium-${name}.html`,
    `<html><head><style>html,body{margin:0;padding:0;overflow:hidden;background:${transparent ? 'transparent' : '#070709'}}
      svg{display:block;width:${w}px;height:${h}px}</style></head><body>${s}</body></html>`);
}
console.log('файлов:', Object.keys(files).length);
