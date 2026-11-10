// Генератор макета пазла «Карта медиарынка: маяк EMM»
// node puzzle-map/build.mjs  →  puzzle-map/map.svg (+ render.mjs делает PNG/PDF)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { geoPath, geoGraticule, geoContains } from 'd3-geo';
import { geoMiller } from 'd3-geo-projection';
import { feature } from 'topojson-client';
import opentype from 'opentype.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const W = 1500, H = 1000;

// ---------- palette ----------
const INK = '#2e1f12';
const INK_SOFT = 'rgba(46,31,18,.35)';
const RED = '#8a2a1b';
const GREEN = '#2c4a36';
const AMBER = '#7a5414';
const CREAM = '#f6ecd2';

// ---------- seeded random ----------
let seed = 20261013;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rr = (a, b) => a + rnd() * (b - a);
const f = n => Math.round(n * 10) / 10;

// ---------- fonts ----------
const font = (file) => fs.readFileSync(path.join(dir, 'fonts', file)).toString('base64');
const fontCss = `
@font-face{font-family:'OST';font-weight:400;font-style:normal;src:url(data:font/ttf;base64,${font('ost-r.ttf')}) format('truetype');}
@font-face{font-family:'OST';font-weight:700;font-style:normal;src:url(data:font/ttf;base64,${font('ost-b.ttf')}) format('truetype');}
@font-face{font-family:'OST';font-weight:400;font-style:italic;src:url(data:font/ttf;base64,${font('ost-i.ttf')}) format('truetype');}
text{font-family:'OST','Old Standard TT',Georgia,serif;}
`;

// ---------- world map (Miller, Pacific-centred) ----------
const topo = JSON.parse(fs.readFileSync(path.join(dir, 'node_modules/world-atlas/land-50m.json'), 'utf8'));
const LAND = feature(topo, topo.objects.land);
const proj = geoMiller().rotate([-150, 0]).scale(1416 / (2 * Math.PI)).translate([750, 500]).precision(0.2);
const geo = geoPath(proj);
// land mask rasterised once in headless Chromium (fast pixel lookups)
const MASK = await (async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const b = await chromium.launch();
  const pg = await b.newPage();
  const data = await pg.evaluate(([d, w, h]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.fill(new Path2D(d));
    const px = ctx.getImageData(0, 0, w, h).data, out = new Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = px[i * 4 + 3] > 200 ? 1 : 0;
    return out;
  }, [geo(LAND), W, H]);
  await b.close();
  return Uint8Array.from(data);
})();
const isLand = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < W && y < H && MASK[y * W + x] === 1; };

// ---------- key points ----------
// lighthouse island is drawn in local coords and placed with this transform
const LH = { s: 0.55, tx: 960 - 330 * 0.55, ty: 600 - 620 * 0.55 };
const LAMP = { x: 960, y: 282 * LH.s + LH.ty };

const shipsSafe = [
  { x: 1075, y: 305, s: 0.82, label: 'Оптимизация ROI' },
  { x: 790, y: 432, s: 0.8, label: 'Эффективный медиамикс' },
  { x: 1100, y: 520, s: 0.84, label: 'Прозрачные закупки' },
  { x: 1000, y: 760, s: 0.82, label: 'Защищённый бюджет' },
];
const shipsAudit = [
  { x: 880, y: 272, s: 0.72, rot: -5, flip: false, label: 'Аудит тендеров' },
  { x: 1205, y: 650, s: 0.72, rot: 6, flip: false, label: 'Поиск зон роста' },
  { x: 610, y: 785, s: 0.72, rot: -4, flip: false, label: 'Анализ контрактов' },
];

// keep-out boxes for wave texture
const keepOut = [];
const ko = (x0, y0, x1, y1) => keepOut.push([x0, y0, x1, y1]);
const free = (x, y) => !keepOut.some(([a, b, c, d]) => x > a && x < c && y > b && y < d);

// ---------- pieces ----------
function ribbon(cx, cy, text, { color = INK, fill = CREAM, size = 17, italic = false } = {}) {
  const w = text.length * size * 0.5 + 34;
  const h = size + 12;
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  ko(x0 - 20, y0 - 4, x1 + 20, y1 + 8);
  const tail = (x, dir) => `M${f(x)},${f(y0 + 7)} L${f(x - dir * 24)},${f(y0 + 7)} L${f(x - dir * 15)},${f(cy + 7)} L${f(x - dir * 24)},${f(y1 + 7)} L${f(x)},${f(y1 + 7)} Z`;
  return `<g class="ribbon">
  <path d="${tail(x0 + 10, 1)}" fill="#d9c49a" stroke="${INK}" stroke-width="1.1"/>
  <path d="${tail(x1 - 10, -1)}" fill="#d9c49a" stroke="${INK}" stroke-width="1.1"/>
  <path d="M${f(x0)},${f(y0)} Q${f(cx)},${f(y0 - 7)} ${f(x1)},${f(y0)} L${f(x1)},${f(y1)} Q${f(cx)},${f(y1 - 7)} ${f(x0)},${f(y1)} Z" fill="${fill}" stroke="${INK}" stroke-width="1.3"/>
  <text x="${f(cx)}" y="${f(cy + size * 0.33 - 2)}" text-anchor="middle" font-size="${size}" font-weight="700" ${italic ? 'font-style="italic"' : ''} fill="${color}">${text}</text>
</g>`;
}

function dangerLabel(cx, cy, lines, size = 17) {
  const w = Math.max(...lines.map(l => l.length)) * size * 0.48 + 30;
  const h = lines.length * (size + 4) + 14;
  ko(cx - w / 2 - 6, cy - h / 2 - 6, cx + w / 2 + 6, cy + h / 2 + 6);
  const t = lines.map((l, i) => `<tspan x="${f(cx)}" dy="${i ? size + 4 : 0}">${l}</tspan>`).join('');
  return `<g class="danger-label">
  <rect x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${f(w)}" height="${f(h)}" rx="6" fill="rgba(246,236,210,.88)" stroke="${RED}" stroke-width="1.3" stroke-dasharray="5 3"/>
  <text x="${f(cx)}" y="${f(cy - h / 2 + 7 + size * 0.85)}" text-anchor="middle" font-size="${size}" font-style="italic" fill="${RED}">${t}</text>
</g>`;
}

function reef(cx, cy, n = 7, spread = 70) {
  let out = '';
  // danger ring
  out += `<ellipse cx="${cx}" cy="${cy}" rx="${spread + 22}" ry="${spread * 0.55 + 16}" fill="none" stroke="${RED}" stroke-width="1.4" stroke-dasharray="2 5" opacity=".75"/>`;
  for (let i = 0; i < n; i++) {
    const x = cx + rr(-spread, spread), y = cy + rr(-spread * 0.45, spread * 0.45);
    const s = rr(spread * 0.18, spread * 0.3) + 3;
    const pts = [];
    const k = 6 + Math.floor(rnd() * 3);
    for (let j = 0; j < k; j++) {
      const a = Math.PI + (j / (k - 1)) * Math.PI;
      const r = s * rr(0.6, 1.15);
      pts.push(`${f(x + Math.cos(a) * r * 1.2)},${f(y + Math.sin(a) * r * 1.3)}`);
    }
    out += `<polygon points="${pts.join(' ')}" fill="#6f5a43" stroke="${INK}" stroke-width="1.2"/>`;
    out += `<path d="M${f(x - s)},${f(y)} q${f(s / 2)},-3 ${f(s)},0 t${f(s)},0" fill="none" stroke="${INK}" stroke-width="1" opacity=".7"/>`;
    out += `<path d="M${f(x - s * 0.3)},${f(y - s * 0.9)} l${f(s * 0.25)},${f(s * 0.7)}" stroke="#a89072" stroke-width="1.4"/>`;
  }
  // submerged-rock crosses (old chart notation)
  for (let i = 0; i < 7; i++) {
    const x = cx + rr(-spread - 10, spread + 10), y = cy + rr(-spread * 0.5, spread * 0.5);
    out += `<path d="M${f(x - 4)},${f(y)} h8 M${f(x)},${f(y - 4)} v8" stroke="${INK}" stroke-width="1.3"/>`;
  }
  ko(cx - spread - 25, cy - spread * 0.6 - 18, cx + spread + 25, cy + spread * 0.6 + 18);
  return `<g class="reef">${out}</g>`;
}

function whirlpool(cx, cy, R = 70) {
  let out = `<circle cx="${cx}" cy="${cy}" r="${R + 8}" fill="url(#whirlFill)"/>`;
  for (let arm = 0; arm < 3; arm++) {
    const off = (arm * 2 * Math.PI) / 3;
    let d = '';
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const a = off + t * Math.PI * 3.2;
      const r = 4 + t * R;
      d += `${t ? 'L' : 'M'}${f(cx + Math.cos(a) * r)},${f(cy + Math.sin(a) * r * 0.62)} `;
    }
    out += `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${2.2 - arm * 0.4}" opacity=".8"/>`;
  }
  out += `<ellipse cx="${cx}" cy="${cy}" rx="7" ry="4.5" fill="${INK}"/>`;
  ko(cx - R - 12, cy - R * 0.7 - 10, cx + R + 12, cy + R * 0.7 + 10);
  return `<g class="whirlpool">${out}</g>`;
}

function stormCloud(cx, cy, k = 1) {
  const blobs = [[-70, 10, 34], [-38, -12, 40], [5, -26, 48], [50, -8, 40], [82, 12, 30], [-20, 18, 34], [30, 20, 34]];
  const outline = blobs.map(([x, y, r]) => `<circle cx="${cx + x}" cy="${cy + y}" r="${r + 2.2}" fill="${INK}"/>`).join('');
  const body = blobs.map(([x, y, r]) => `<circle cx="${cx + x}" cy="${cy + y}" r="${r}" fill="url(#cloudFill)"/>`).join('');
  let rain = '';
  for (let i = 0; i < 26; i++) {
    const x = cx + rr(-90, 90), y = cy + rr(42, 60);
    rain += `<path d="M${f(x)},${f(y)} l-10,${f(rr(26, 50))}" stroke="#4b4236" stroke-width="1.2" opacity=".55"/>`;
  }
  const bolt = `<path d="M${cx + 12},${cy + 36} l-22,46 h18 l-16,48 l40,-62 h-19 l17,-32 Z" fill="#e3b442" stroke="${INK}" stroke-width="1.4"/>`;
  ko(cx - 115 * k, cy - 80 * k, cx + 120 * k, cy + 140 * k);
  return `<g class="storm" transform="translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})">${rain}${outline}${body}${bolt}</g>`;
}

function fogBank(cx, cy, w = 300) {
  let out = '';
  for (let i = 0; i < 7; i++) {
    out += `<ellipse cx="${f(cx + rr(-w * 0.35, w * 0.35))}" cy="${f(cy + rr(-28, 28))}" rx="${f(rr(w * 0.25, w * 0.45))}" ry="${f(rr(18, 34))}" fill="#d9d2c2" opacity=".9" filter="url(#blur8)"/>`;
  }
  for (let i = 0; i < 5; i++) {
    const y = cy - 30 + i * 15, x0 = cx - w * 0.45 + rr(-10, 30), x1 = cx + w * 0.45 - rr(-10, 30);
    out += `<path d="M${f(x0)},${f(y)} Q${f((x0 + x1) / 2)},${f(y - 8)} ${f(x1)},${f(y)}" fill="none" stroke="#8d8270" stroke-width="1.3" stroke-dasharray="14 6 3 6" opacity=".6"/>`;
  }
  ko(cx - w / 2, cy - 45, cx + w / 2, cy + 45);
  return `<g class="fog">${out}</g>`;
}

// ---------- ship symbols ----------
const sail = (x, yt, yb, w) =>
  `<path d="M${x - w},${yt} Q${x},${yt + 5} ${x + w},${yt} L${x + w + 3},${yb} Q${x + 2},${yb + 9} ${x - w - 3},${yb} Z" fill="url(#sailFill)" stroke="${INK}" stroke-width="1.3"/>
   <path d="M${x - w / 2},${yt + 3} L${x - w / 2 - 1},${yb + 4} M${x + w / 2},${yt + 3} L${x + w / 2 + 1},${yb + 4}" stroke="${INK}" stroke-width=".5" opacity=".45"/>`;

const frigate = `<symbol id="frigate" overflow="visible">
  <path d="M-75,12 q12,-7 24,0 t24,0 t24,0 t24,0 t24,0 t24,0" fill="none" stroke="${INK}" stroke-width="1.3" opacity=".6"/>
  <path d="M-34,-108 L-30,-24 M-30,-88 L-62,-22 M0,-112 L-58,-24 M0,-112 L60,-22 M30,-94 L82,-32 M-30,-88 L0,-112 L30,-94" stroke="${INK}" stroke-width=".6" opacity=".55" fill="none"/>
  <line x1="-30" y1="-14" x2="-30" y2="-90" stroke="${INK}" stroke-width="2.6"/>
  <line x1="0" y1="-14" x2="0" y2="-112" stroke="${INK}" stroke-width="3"/>
  <line x1="30" y1="-14" x2="30" y2="-96" stroke="${INK}" stroke-width="2.6"/>
  <line x1="56" y1="-16" x2="86" y2="-34" stroke="${INK}" stroke-width="2.2"/>
  <path d="M32,-88 L84,-33 L42,-30 Z" fill="url(#sailFill)" stroke="${INK}" stroke-width="1.2"/>
  ${sail(-30, -84, -64, 14)}${sail(-30, -60, -36, 17)}
  ${sail(0, -104, -82, 18)}${sail(0, -78, -52, 22)}${sail(0, -48, -28, 24)}
  ${sail(30, -88, -68, 14)}${sail(30, -64, -40, 18)}
  <path d="M0,-112 L20,-107 L0,-102 Z" fill="${RED}" stroke="${INK}" stroke-width=".8"/>
  <path d="M-30,-90 L-18,-87 L-30,-84 Z" fill="${RED}" stroke="${INK}" stroke-width=".8"/>
  <path d="M-62,-26 L-40,-26 L-40,-14 L-62,-14 Z" fill="#6b4529" stroke="${INK}" stroke-width="1.3"/>
  <path d="M-62,-14 L62,-14 L57,-5 Q48,10 30,13 L-42,13 Q-58,6 -62,-14 Z" fill="#6b4529" stroke="${INK}" stroke-width="1.6"/>
  <path d="M-60,-6 L58,-6" stroke="#d6b77a" stroke-width="2.2"/>
  ${[-42, -26, -10, 6, 22, 38].map(x => `<rect x="${x}" y="-12" width="6" height="4.5" fill="${INK}"/>`).join('')}
</symbol>`;

const brig = `<symbol id="brig" overflow="visible">
  <path d="M-62,10 q12,-7 24,0 t24,0 t24,0 t24,0 t24,0" fill="none" stroke="${INK}" stroke-width="1.3" opacity=".6"/>
  <path d="M-18,-94 L-52,-20 M-18,-94 L20,-82 L62,-28 M20,-82 L-4,-18" stroke="${INK}" stroke-width=".6" opacity=".55" fill="none"/>
  <line x1="-18" y1="-12" x2="-18" y2="-96" stroke="${INK}" stroke-width="2.6"/>
  <line x1="20" y1="-12" x2="20" y2="-84" stroke="${INK}" stroke-width="2.4"/>
  <line x1="44" y1="-14" x2="68" y2="-28" stroke="${INK}" stroke-width="2"/>
  <path d="M22,-78 L66,-28 L30,-26 Z" fill="url(#sailFill)" stroke="${INK}" stroke-width="1.2"/>
  ${sail(-18, -88, -70, 13)}${sail(-18, -64, -40, 17)}
  <path d="M8,-72 Q20,-70 32,-72 L33,-64 Q20,-60 7,-64 Z" fill="url(#sailFill)" stroke="${INK}" stroke-width="1.2"/>
  ${sail(20, -56, -34, 15)}
  <path d="M-18,-96 L-2,-92 L-18,-88 Z" fill="${AMBER}" stroke="${INK}" stroke-width=".8"/>
  <path d="M-48,-12 L48,-12 L44,-4 Q36,9 22,11 L-34,11 Q-46,5 -48,-12 Z" fill="#7a5233" stroke="${INK}" stroke-width="1.5"/>
  <path d="M-46,-5 L45,-5" stroke="#d6b77a" stroke-width="2"/>
</symbol>`;

// ---------- compass rose ----------
function compass(cx, cy, R) {
  let out = `<circle cx="${cx}" cy="${cy}" r="${R + 10}" fill="rgba(246,236,210,.85)" stroke="${INK}" stroke-width="1.6"/>
  <circle cx="${cx}" cy="${cy}" r="${R + 4}" fill="none" stroke="${INK}" stroke-width=".8"/>`;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2, r1 = R + 4, r2 = R + (i % 4 ? 8 : 10);
    out += `<line x1="${f(cx + Math.cos(a) * r1)}" y1="${f(cy + Math.sin(a) * r1)}" x2="${f(cx + Math.cos(a) * r2)}" y2="${f(cy + Math.sin(a) * r2)}" stroke="${INK}" stroke-width=".8"/>`;
  }
  const point = (deg, len, wd, c1, c2) => {
    const a = (deg - 90) * Math.PI / 180, p = a + Math.PI / 2;
    const tx = cx + Math.cos(a) * len, ty = cy + Math.sin(a) * len;
    const lx = cx + Math.cos(p) * wd, ly = cy + Math.sin(p) * wd;
    const qx = cx - Math.cos(p) * wd, qy = cy - Math.sin(p) * wd;
    return `<path d="M${f(cx)},${f(cy)} L${f(tx)},${f(ty)} L${f(lx)},${f(ly)} Z" fill="${c1}" stroke="${INK}" stroke-width=".8"/>
            <path d="M${f(cx)},${f(cy)} L${f(tx)},${f(ty)} L${f(qx)},${f(qy)} Z" fill="${c2}" stroke="${INK}" stroke-width=".8"/>`;
  };
  for (let d = 22.5; d < 360; d += 45) out += point(d, R * 0.55, R * 0.09, '#e9d9b0', '#b58f58');
  for (let d = 45; d < 360; d += 90) out += point(d, R * 0.75, R * 0.13, '#e9d9b0', '#8a6a3c');
  for (let d = 0; d < 360; d += 90) out += point(d, R * 0.98, R * 0.16, d === 0 ? '#c9473a' : '#f3e6c6', d === 0 ? RED : INK);
  out += `<circle cx="${cx}" cy="${cy}" r="5" fill="${CREAM}" stroke="${INK}" stroke-width="1.2"/>`;
  const lbl = [['С', 0, -R - 20], ['Ю', 0, R + 32], ['В', R + 25, 6], ['З', -R - 25, 6]];
  out += lbl.map(([t, x, y]) => `<text x="${cx + x}" y="${cy + y}" text-anchor="middle" font-size="16" font-weight="700" fill="${t === 'С' ? RED : INK}">${t}</text>`).join('');
  ko(cx - R - 40, cy - R - 45, cx + R + 40, cy + R + 45);
  return `<g class="compass">${out}</g>`;
}

// ---------- lighthouse & island ----------
function island() {
  const pts = [];
  const cx = 335, cy = 620;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 1 + 0.12 * Math.sin(a * 3 + 1) + 0.07 * Math.sin(a * 7) + rr(-0.03, 0.03);
    pts.push([cx + Math.cos(a) * 150 * r, cy + Math.sin(a) * 62 * r]);
  }
  const d = 'M' + pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' L') + ' Z';
  const water = [1.12, 1.24, 1.38, 1.54].map((s, i) =>
    `<path d="${d}" transform="translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})" fill="none" stroke="${INK}" stroke-width="${1 / s}" opacity="${0.5 - i * 0.1}"/>`).join('');
  let rocks = '';
  const boulders = [[220, 610, 34], [262, 588, 40], [420, 600, 38], [455, 628, 28], [205, 640, 24], [380, 650, 30], [290, 655, 26], [470, 650, 20]];
  for (const [x, y, s] of boulders) {
    const p = [];
    for (let j = 0; j < 7; j++) {
      const a = Math.PI + (j / 6) * Math.PI;
      p.push(`${f(x + Math.cos(a) * s * rr(0.8, 1.1))},${f(y + Math.sin(a) * s * rr(0.6, 0.95))}`);
    }
    p.push(`${f(x + s)},${f(y + 6)}`, `${f(x - s)},${f(y + 6)}`);
    rocks += `<polygon points="${p.join(' ')}" fill="url(#rockFill)" stroke="${INK}" stroke-width="1.4"/>`;
    rocks += `<path d="M${f(x - s * 0.2)},${f(y - s * 0.5)} l${f(s * 0.3)},${f(s * 0.45)} M${f(x + s * 0.3)},${f(y - s * 0.3)} l${f(s * 0.2)},${f(s * 0.3)}" stroke="${INK}" stroke-width=".8" opacity=".6"/>`;
  }
  // surf
  let surf = '';
  for (let i = 0; i < 16; i++) {
    const a = rr(0, Math.PI * 2);
    const x = cx + Math.cos(a) * 160, y = cy + Math.sin(a) * 70;
    surf += `<path d="M${f(x - 8)},${f(y)} q4,-4 8,0 t8,0" fill="none" stroke="${INK}" stroke-width="1" opacity=".55"/>`;
  }
  ko(875, 560, 1050, 700);
  return `<g class="island">${water}<path d="${d}" fill="url(#landFill)" stroke="${INK}" stroke-width="1.8"/>
  <path d="${d}" fill="url(#hatch)" opacity=".5"/>${surf}${rocks}</g>`;
}

function lighthouse() {
  const x = 330; // local coords, placed via LH transform
  const baseY = 600, topY = 312, bw = 44, tw = 27;
  const tower = `M${x - bw},${baseY} L${x - tw},${topY} L${x + tw},${topY} L${x + bw},${baseY} Z`;
  let stripes = '';
  const bands = 6, hb = (baseY - topY) / bands;
  for (let i = 0; i < bands; i += 2) stripes += `<rect x="${x - 60}" y="${f(topY + i * hb)}" width="120" height="${f(hb)}" fill="#a3402c"/>`;
  // stones of the foundation
  let blocks = '';
  for (let r = 0; r < 3; r++) {
    const y = 598 + r * 17;
    for (let c = 0; c < 8; c++) {
      const bx = x - 82 + c * 21 + (r % 2 ? 10 : 0);
      if (bx > x + 70) continue;
      blocks += `<rect x="${bx}" y="${y}" width="20" height="16" rx="2" fill="#b9a78a" stroke="${INK}" stroke-width=".9"/>`;
    }
  }
  return `<g class="lighthouse">
  <ellipse cx="${x}" cy="660" rx="110" ry="14" fill="${INK}" opacity=".18"/>
  <clipPath id="foundClip"><path d="M${x - 82},${598} L${x + 82},${598} L${x + 92},${650} L${x - 92},${650} Z"/></clipPath>
  <path d="M${x - 82},${598} L${x + 82},${598} L${x + 92},${650} L${x - 92},${650} Z" fill="#c8b697"/>
  <g clip-path="url(#foundClip)">${blocks}</g>
  <path d="M${x - 82},${598} L${x + 82},${598} L${x + 92},${650} L${x - 92},${650} Z" fill="none" stroke="${INK}" stroke-width="1.8"/>
  <rect x="${x - 46}" y="608" width="92" height="34" rx="4" fill="#3a2b1d" stroke="#d6b77a" stroke-width="2"/>
  <text x="${x}" y="634.5" text-anchor="middle" font-size="27" font-weight="700" fill="#f1d68b" letter-spacing="3">EMM</text>
  <clipPath id="towerClip"><path d="${tower}"/></clipPath>
  <path d="${tower}" fill="#f1e5c8"/>
  <g clip-path="url(#towerClip)">${stripes}
    <rect x="${x + 4}" y="${topY}" width="60" height="${baseY - topY}" fill="${INK}" opacity=".16"/>
  </g>
  <path d="${tower}" fill="none" stroke="${INK}" stroke-width="2"/>
  <path d="M${x - 9},${baseY} v-30 a9,9 0 0 1 18,0 v30 Z" fill="#4a3220" stroke="${INK}" stroke-width="1.3"/>
  ${[380, 450, 520].map(y => `<rect x="${x - 5}" y="${y}" width="10" height="16" rx="5" fill="#3a2b1d" stroke="#d6b77a" stroke-width="1"/>`).join('')}
  <rect x="${x - 40}" y="${topY - 9}" width="80" height="10" fill="#3a2b1d" stroke="${INK}" stroke-width="1.3"/>
  ${Array.from({ length: 9 }, (_, i) => `<line x1="${x - 38 + i * 9.5}" y1="${topY - 9}" x2="${x - 38 + i * 9.5}" y2="${topY - 22}" stroke="${INK}" stroke-width="1.4"/>`).join('')}
  <line x1="${x - 40}" y1="${topY - 22}" x2="${x + 40}" y2="${topY - 22}" stroke="${INK}" stroke-width="1.6"/>
  <rect x="${x - 22}" y="${topY - 52}" width="44" height="44" fill="url(#lampFill)" stroke="${INK}" stroke-width="1.8"/>
  <line x1="${x - 7}" y1="${topY - 52}" x2="${x - 7}" y2="${topY - 8}" stroke="${INK}" stroke-width="1.4"/>
  <line x1="${x + 7}" y1="${topY - 52}" x2="${x + 7}" y2="${topY - 8}" stroke="${INK}" stroke-width="1.4"/>
  <path d="M${x - 28},${topY - 52} L${x + 28},${topY - 52} Q${x + 22},${topY - 82} ${x},${topY - 86} Q${x - 22},${topY - 82} ${x - 28},${topY - 52} Z" fill="#a3402c" stroke="${INK}" stroke-width="1.8"/>
  <line x1="${x}" y1="${topY - 86}" x2="${x}" y2="${topY - 104}" stroke="${INK}" stroke-width="2"/>
  <circle cx="${x}" cy="${topY - 106}" r="4" fill="#d6b77a" stroke="${INK}" stroke-width="1.2"/>
</g>`;
}

// ---------- light ----------
function light() {
  const L = 720;
  const beam = (deg, half, op) => {
    const a1 = (deg - half) * Math.PI / 180, a2 = (deg + half) * Math.PI / 180;
    return `<path d="M${f(LAMP.x)},${f(LAMP.y)} L${f(LAMP.x + Math.cos(a1) * L)},${f(LAMP.y + Math.sin(a1) * L)} L${f(LAMP.x + Math.cos(a2) * L)},${f(LAMP.y + Math.sin(a2) * L)} Z" fill="url(#beamFill)" opacity="${op}"/>`;
  };
  const ray = (deg, len, op) => {
    const a = deg * Math.PI / 180;
    return `<line x1="${f(LAMP.x)}" y1="${f(LAMP.y)}" x2="${f(LAMP.x + Math.cos(a) * len)}" y2="${f(LAMP.y + Math.sin(a) * len)}" stroke="#b8862e" stroke-width="1" opacity="${op}"/>`;
  };
  let rays = '';
  for (let d = 0; d < 360; d += 5) rays += ray(d, rr(300, 470), 0.26);
  return `<g class="light">
  <ellipse cx="985" cy="520" rx="390" ry="350" fill="url(#glow)"/>
  ${[-160, -105, -35, 15, 55, 95, 140, 200].map((d, i) => beam(d, 6, i % 2 ? 0.8 : 0.95)).join('')}
  <g filter="url(#blur3)">${rays}</g>
  <circle cx="${f(LAMP.x)}" cy="${f(LAMP.y)}" r="60" fill="url(#lampHalo)"/>
</g>`;
}

// ---------- fairway ----------
const FAIRWAY = 'M165,700 C190,700 200,748 252,748 S330,712 390,700 S470,688 530,700 S610,712 690,705 S775,698 805,678 S838,640 858,614';

function fairway() {
  return `<g class="fairway">
  <path d="${FAIRWAY}" fill="none" stroke="${CREAM}" stroke-width="9" opacity=".7"/>
  <path id="fairwayPath" d="${FAIRWAY}" fill="none" stroke="${RED}" stroke-width="3.2" stroke-dasharray="13 9" stroke-linecap="round"/>
  <text font-size="14" font-style="italic" font-weight="700" fill="${RED}" letter-spacing=".3" dy="-7">
    <textPath href="#fairwayPath" startOffset="27%">Стратегия оптимизации медиазакупок</textPath>
  </text>
  <path d="M841,618 L860,610 L857,630" fill="none" stroke="${RED}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
</g>`;
}

// ---------- cartouche ----------
function cartouche() {
  const cx = 750, y0 = 846, w = 640, h = 98;
  const x0 = cx - w / 2, x1 = cx + w / 2;
  ko(x0 - 30, y0 - 10, x1 + 30, y0 + h + 10);
  const scroll = (x, dir) => `<path d="M${x},${y0 + 8} c${dir * -26},-6 ${dir * -34},18 ${dir * -18},26 c${dir * 12},6 ${dir * 18},-6 ${dir * 10},-12" fill="none" stroke="${INK}" stroke-width="1.6"/>
    <path d="M${x},${y0 + h - 8} c${dir * -26},6 ${dir * -34},-18 ${dir * -18},-26 c${dir * 12},-6 ${dir * 18},6 ${dir * 10},12" fill="none" stroke="${INK}" stroke-width="1.6"/>`;
  return `<g class="cartouche">
  <path d="M${x0},${y0} H${x1} Q${x1 + 18},${y0 + h / 2} ${x1},${y0 + h} H${x0} Q${x0 - 18},${y0 + h / 2} ${x0},${y0} Z" fill="url(#cartFill)" stroke="${INK}" stroke-width="2.2"/>
  <path d="M${x0 + 10},${y0 + 8} H${x1 - 10} Q${x1 + 4},${y0 + h / 2} ${x1 - 10},${y0 + h - 8} H${x0 + 10} Q${x0 - 4},${y0 + h / 2} ${x0 + 10},${y0 + 8} Z" fill="none" stroke="${INK}" stroke-width=".9"/>
  ${scroll(x0, 1)}${scroll(x1, -1)}
  <text x="${cx}" y="${y0 + 50}" text-anchor="middle" font-size="33" font-weight="700" fill="${INK}">Прозрачность, которая спасает бюджеты</text>
  <path d="M${cx - 150},${y0 + 66} H${cx - 18} M${cx + 18},${y0 + 66} H${cx + 150}" stroke="${INK}" stroke-width="1"/>
  <path d="M${cx},${y0 + 60} l6,6 l-6,6 l-6,-6 Z" fill="${RED}"/>
  <text x="${cx}" y="${y0 + 90}" text-anchor="middle" font-size="20" font-style="italic" fill="${INK}">Надёжный ориентир в шторме медиарынка</text>
</g>`;
}

// ---------- frame ----------
function frame() {
  const m = 30, b = 12;
  let ticks = '';
  const seg = 50;
  for (let x = m + b; x < W - m - b; x += seg) {
    const on = Math.round((x - m - b) / seg) % 2 === 0;
    if (on) {
      const w = Math.min(seg, W - m - b - x);
      ticks += `<rect x="${x}" y="${m}" width="${w}" height="${b}" fill="${INK}"/><rect x="${x}" y="${H - m - b}" width="${w}" height="${b}" fill="${INK}"/>`;
    }
  }
  for (let y = m + b; y < H - m - b; y += seg) {
    const on = Math.round((y - m - b) / seg) % 2 === 0;
    if (on) {
      const h = Math.min(seg, H - m - b - y);
      ticks += `<rect x="${m}" y="${y}" width="${b}" height="${h}" fill="${INK}"/><rect x="${W - m - b}" y="${y}" width="${b}" height="${h}" fill="${INK}"/>`;
    }
  }
  return `<g class="frame">
  <path d="M0,0 H${W} V${H} H0 Z M${m},${m} V${H - m} H${W - m} V${m} Z" fill="#c4a06a" fill-rule="evenodd"/>
  <path d="M0,0 H${W} V${H} H0 Z M${m},${m} V${H - m} H${W - m} V${m} Z" fill="url(#paperNoise)" fill-rule="evenodd" opacity=".6"/>
  ${ticks}
  <rect x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" fill="none" stroke="${INK}" stroke-width="2"/>
  <rect x="${m + b}" y="${m + b}" width="${W - 2 * (m + b)}" height="${H - 2 * (m + b)}" fill="none" stroke="${INK}" stroke-width="1.4"/>
  <rect x="${m - 8}" y="${m - 8}" width="${W - 2 * (m - 8)}" height="${H - 2 * (m - 8)}" fill="none" stroke="${INK}" stroke-width=".8"/>
</g>`;
}

// ---------- rivers of traffic (stylised, across the Digital continent) ----------
function rivers() {
  const R = '#4f6e7d';
  const main = [
    'M757,585 C744,602 728,618 712,632 S690,648 684,656',
    'M748,566 C735,580 726,598 716,622',
    'M700,566 C690,582 672,590 655,606',
  ];
  const trib = ['M728,618 C740,628 748,638 752,648', 'M672,590 C664,578 652,574 640,576'];
  return `<g class="rivers" fill="none" stroke-linecap="round">
    ${main.map(d => `<path d="${d}" stroke="${R}" stroke-width="2.4" opacity=".8"/>`).join('')}
    ${trib.map(d => `<path d="${d}" stroke="${R}" stroke-width="1.3" opacity=".7"/>`).join('')}
  </g>`;
}

// ---------- current of ineffective budgets ----------
const CURRENT = 'M600,602 C545,612 495,640 440,628 S360,612 318,648';
const CURRENT_TXT = 'M318,672 C360,640 400,650 440,656 S545,640 600,630';
function current() {
  let lines = '';
  for (const o of [-9, 0, 9]) lines += `<path d="${CURRENT}" transform="translate(0 ${o})" fill="none" stroke="#2f4f5a" stroke-width="1.4" stroke-dasharray="${o ? '18 7' : '26 6'}" opacity=".75"/>`;
  return `<g class="current">
  <path d="${CURRENT}" fill="none" stroke="#2f4f5a" stroke-width="26" opacity=".1" stroke-linecap="round"/>
  ${lines}
  <path d="M332,628 L314,650 L340,652" fill="none" stroke="#2f4f5a" stroke-width="2.2" stroke-linejoin="round"/>
  <path id="currentPath" d="${CURRENT_TXT}" fill="none"/>
  <text font-size="12.5" font-style="italic" font-weight="700" fill="#2f4f5a" stroke="#f3e6c4" stroke-width="3" paint-order="stroke"><textPath href="#currentPath" startOffset="8%">Течение Неэффективных Бюджетов</textPath></text>
</g>`;
}

// ---------- world ----------
const name = (x, y, t, size, { rot = 0, sp = 3, op = .75, it = false } = {}) =>
    `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" letter-spacing="${sp}" fill="${INK}" stroke="#f3e6c4" stroke-width="3.2" stroke-linejoin="round" paint-order="stroke" opacity="${Math.min(1, op + .2)}" ${it ? 'font-style="italic"' : ''} ${rot ? `transform="rotate(${rot} ${x} ${y})"` : ''}>${t}</text>`;
// ---------- continent labels: auto-fit so the whole text sits on land ----------
const FONT_R = opentype.parse(fs.readFileSync(path.join(dir, 'fonts', 'ost-r.ttf')).buffer);
const FONT_B = opentype.parse(fs.readFileSync(path.join(dir, 'fonts', 'ost-b.ttf')).buffer);
const textW = (t, size, sp, bold) => (bold ? FONT_B : FONT_R).getAdvanceWidth(t, size) + sp * (t.length - 1);

function landBoxOk(x0, y0, x1, y1) {
  if (x0 < 56 || y0 < 56 || x1 > W - 56 || y1 > H - 56) return false;
  for (let x = x0; x <= x1; x += 4) for (let y = y0; y <= y1; y += 4) {
    if (!isLand(x, y) || !free(x, y)) return false;
  }
  return isLand(x1, y1) && free(x1, y1);
}

// lines: [[text, relSize]], tries biggest size first, nearest to target
function fitLabel(lines, tx, ty, { max = 30, min = 11, sp = 0.15, bold = true, pad = 7, radius = 160 } = {}) {
  for (let size = max; size >= min; size -= 1) {
    const ls = lines.map(([t, k]) => ({ t, size: size * k }));
    const lh = ls.map(l => l.size * 1.12);
    const H = lh.reduce((a, b) => a + b, 0);
    const Wd = Math.max(...ls.map(l => textW(l.t, l.size, l.size * sp, bold)));
    let best = null;
    for (let dy = -radius; dy <= radius; dy += 4) for (let dx = -radius; dx <= radius; dx += 4) {
      const d = dx * dx + dy * dy;
      if (d > radius * radius || (best && d >= best.d)) continue;
      const cx = tx + dx, cy = ty + dy;
      if (landBoxOk(cx - Wd / 2 - pad, cy - H / 2 - pad, cx + Wd / 2 + pad, cy + H / 2 + pad)) best = { d, cx, cy };
    }
    if (best) {
      ko(best.cx - Wd / 2 - pad, best.cy - H / 2 - pad, best.cx + Wd / 2 + pad, best.cy + H / 2 + pad);
      let y = best.cy - H / 2;
      return ls.map((l, i) => { y += lh[i]; const out = `<text x="${f(best.cx)}" y="${f(y - l.size * 0.22)}" text-anchor="middle" font-size="${f(l.size)}" ${bold ? 'font-weight="700"' : ''} letter-spacing="${f(l.size * sp)}" fill="${INK}" stroke="#ead7a8" stroke-width="3" stroke-linejoin="round" paint-order="stroke">${l.t}</text>`; return out; }).join('');
    }
  }
  throw new Error('no fit for ' + lines.map(l => l[0]).join(' '));
}

const continentLabels = () => [
  fitLabel([['Материк Традиционных СМИ', 1]], 470, 290, { max: 30 }),
  fitLabel([['Земля Наружной', 1], ['Рекламы', 1]], 240, 480, { max: 24 }),
  fitLabel([['Земля', 1], ['Performance', 1]], 1200, 330, { max: 24 }),
  fitLabel([['Земля', 1], ['Инфлюенсеров', 1]], 1370, 580, { max: 20 }),
  fitLabel([['Материк', 1], ['Digital', 1.25]], 680, 600, { max: 17, min: 9, radius: 60, pad: 3 }),
  fitLabel([['Неизведанные Каналы', 1]], 300, 895, { max: 26, radius: 260 }),
].join('\n');

const placeNames = () => `<g class="names">
  ${continentLabels()}
  ${name(668, 678, 'Залив Соцсетей', 11, { sp: .5, it: true, op: .85 })}
  ${name(650, 540, 'Залив Соцсетей', 11, { sp: .5, it: true, op: .85 })}<path d="M688,543 L704,553" stroke="${INK}" stroke-width=".9" opacity=".7"/>
  ${name(735, 505, 'мыс Видеохостингов', 11, { sp: .5, it: true, op: .9 })}<path d="M732,509 L728,535" stroke="${INK}" stroke-width=".9" opacity=".7"/>
  ${name(612, 646, 'Реки Трафика', 10, { sp: .5, it: true, op: .9 })}
  ${name(765, 352, 'о. Телевидения', 12, { sp: 1, op: .9 })}
  ${name(96, 305, 'о. Прессы', 12, { sp: 1, op: .9 })}
  ${name(615, 458, 'о. Радио', 12, { sp: 1, op: .9 })}
  ${name(1140, 400, 'Океан Больших Данных', 21, { sp: 3, it: true, op: .7 })}
  ${name(1140, 424, '(Big Data)', 16, { sp: 4, it: true, op: .7 })}
</g>`;

function world() {
  const d = geo(LAND);
  const grat = geo(geoGraticule().step([15, 15])());
  const outline = geo({ type: 'Sphere' });
  return `<g class="world">
  <clipPath id="sphereClip"><path d="${outline}"/></clipPath>
  <g clip-path="url(#sphereClip)">
  <path d="${grat}" fill="none" stroke="#7d5f3a" stroke-width=".6" opacity=".35"/>
  <path d="${d}" fill="none" stroke="${INK}" stroke-width="16" stroke-linejoin="round" opacity=".05"/>
  <path d="${d}" fill="none" stroke="${INK}" stroke-width="9" stroke-linejoin="round" opacity=".07"/>
  <path d="${d}" fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round" opacity=".12"/>
  <path d="${d}" fill="url(#landFill2)" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
  <path d="${d}" fill="url(#hatch)" opacity=".18"/>
  </g>
  ${rivers()}
</g>`;
}

// ---------- rhumb lines ----------
function rhumbs(cx, cy) {
  let out = '';
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    out += `<line x1="${cx}" y1="${cy}" x2="${f(cx + Math.cos(a) * 1800)}" y2="${f(cy + Math.sin(a) * 1800)}" stroke="${i % 4 ? '#7d5f3a' : RED}" stroke-width="${i % 4 ? .5 : .8}" opacity="${i % 4 ? .28 : .3}"/>`;
  }
  return `<g class="rhumbs">${out}</g>`;
}

// ---------- assemble: elements that register keep-out first ----------
const COMPASS = { x: 108, y: 640, r: 36 };

const layerThreats = [
  fogBank(985, 112, 260),
  dangerLabel(985, 112, ['Неэффективный инвентарь'], 14),
  fogBank(1400, 282, 150),
  dangerLabel(1395, 282, ['Отсутствие', 'отчётности'], 14),
  stormCloud(1395, 705, 0.55),
  dangerLabel(1385, 798, ['Низкий Viewability', '(невидимая реклама)'], 13),
  whirlpool(1352, 382, 34),
  dangerLabel(1352, 438, ['Фрод: боты и', 'плохой трафик'], 13),
  whirlpool(150, 195, 34),
  dangerLabel(150, 250, ['Репутационные риски', '(Brand Safety)'], 13),
  reef(800, 605, 6, 26),
  dangerLabel(812, 548, ['Скрытые комиссии'], 13),
  reef(300, 650, 6, 30),
  dangerLabel(300, 604, ['Наценка посредников'], 13),
  reef(480, 555, 6, 30),
  dangerLabel(480, 510, ['Непрозрачные скидки (rebates)'], 13),
].join('\n');

const layerShips = [
  ...shipsSafe.map(s => {
    ko(s.x - 75 * s.s, s.y - 115 * s.s, s.x + 90 * s.s, s.y + 18);
    return `<use href="#frigate" transform="translate(${s.x} ${s.y}) scale(${s.s})"/>`;
  }),
  ...shipsAudit.map(s => {
    ko(s.x - 70 * s.s, s.y - 105 * s.s, s.x + 75 * s.s, s.y + 18);
    return `<use href="#brig" transform="translate(${s.x} ${s.y}) rotate(${s.rot}) scale(${s.flip ? -s.s : s.s} ${s.s})"/>`;
  }),
].join('\n');

// подписи под кораблями убраны по просьбе заказчика; под маяком — «Надёжный ориентир»
const layerLabels = ribbon(960, 662, 'Надёжный ориентир в шторме медиарынка', { color: INK, size: 15 });

// course-correction arcs for audit ships (they check the lighthouse signal)
const layerCourse = shipsAudit.map(s => {
  const dx = LAMP.x - s.x, dy = LAMP.y - s.y, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const sx = s.x - 75 * s.s, sy = s.y - 40;
  return `<path d="M${f(sx)},${f(sy)} l${f(ux * 60)},${f(uy * 60)}" stroke="${AMBER}" stroke-width="1.6" stroke-dasharray="2 4" opacity=".9"/>`;
}).join('');

const layerIsland = island();
const layerLighthouse = lighthouse();
const layerCompass = compass(COMPASS.x, COMPASS.y, COMPASS.r);
const layerCart = cartouche();
ko(935, 370, 985, 590); // lighthouse tower

// sea wave texture
let waves = '';
for (let i = 0; i < 900 && waves.split('<path').length < 240; i++) {
  const x = rr(60, W - 80), y = rr(60, H - 60);
  if (!free(x, y) || !free(x + 26, y) || isLand(x, y) || isLand(x + 26, y)) continue;
  const s = rr(5, 9);
  waves += `<path d="M${f(x)},${f(y)} q${f(s)},${f(-s * 0.7)} ${f(s * 2)},0 q${f(s)},${f(-s * 0.7)} ${f(s * 2)},0" fill="none" stroke="${INK}" stroke-width="1" opacity="${f(rr(0.22, 0.42))}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<title>Карта медиарынка — маяк EMM</title>
<defs>
<style>${fontCss}</style>
<radialGradient id="parch" cx="45%" cy="48%" r="75%">
  <stop offset="0" stop-color="#f3e5c2"/><stop offset=".6" stop-color="#e8d3a4"/><stop offset="1" stop-color="#c9a66d"/>
</radialGradient>
<radialGradient id="vignette" cx="40%" cy="45%" r="78%">
  <stop offset=".55" stop-color="#3a2410" stop-opacity="0"/><stop offset=".85" stop-color="#3a2410" stop-opacity=".22"/><stop offset="1" stop-color="#2a1808" stop-opacity=".5"/>
</radialGradient>
<radialGradient id="glow" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#fff6cf" stop-opacity=".85"/><stop offset=".6" stop-color="#fbe9a8" stop-opacity=".45"/><stop offset="1" stop-color="#f6dd8e" stop-opacity="0"/>
</radialGradient>
<radialGradient id="beamFill" cx="${LAMP.x}" cy="${LAMP.y}" r="720" gradientUnits="userSpaceOnUse">
  <stop offset="0" stop-color="#fffbe6" stop-opacity=".95"/><stop offset=".45" stop-color="#fff2bf" stop-opacity=".55"/><stop offset=".8" stop-color="#fbe7a2" stop-opacity="0"/>
</radialGradient>
<radialGradient id="lampHalo"><stop offset="0" stop-color="#fffef2"/><stop offset=".4" stop-color="#fff3b8" stop-opacity=".9"/><stop offset="1" stop-color="#ffe9a0" stop-opacity="0"/></radialGradient>
<linearGradient id="lampFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe2"/><stop offset="1" stop-color="#f5c94e"/></linearGradient>
<linearGradient id="sailFill" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fbf4df"/><stop offset=".7" stop-color="#efe0bb"/><stop offset="1" stop-color="#d9c294"/></linearGradient>
<linearGradient id="landFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfb27a"/><stop offset="1" stop-color="#a98552"/></linearGradient>
<linearGradient id="landFill2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3cd98"/><stop offset="1" stop-color="#d4b67c"/></linearGradient>
<linearGradient id="rockFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9c8668"/><stop offset="1" stop-color="#5f4b35"/></linearGradient>
<linearGradient id="cloudFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a8070"/><stop offset="1" stop-color="#4a4236"/></linearGradient>
<linearGradient id="cartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8efd6"/><stop offset="1" stop-color="#ead8ad"/></linearGradient>
<radialGradient id="whirlFill"><stop offset="0" stop-color="#3b2a1a" stop-opacity=".45"/><stop offset="1" stop-color="#3b2a1a" stop-opacity="0"/></radialGradient>
<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="6" stroke="${INK}" stroke-width=".7"/></pattern>
<filter id="blur8" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="blur3"><feGaussianBlur stdDeviation="1.4"/></filter>
<filter id="noise" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" result="n"/>
  <feColorMatrix type="matrix" values="0 0 0 0 .23  0 0 0 0 .15  0 0 0 0 .07  0 0 0 -1.6 1.05"/>
</filter>
<filter id="stains" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency=".006" numOctaves="3" seed="3"/>
  <feColorMatrix type="matrix" values="0 0 0 0 .45  0 0 0 0 .3  0 0 0 0 .12  0 0 0 2.2 -1.15"/>
</filter>
<pattern id="paperNoise" width="${W}" height="${H}" patternUnits="userSpaceOnUse"><rect width="${W}" height="${H}" filter="url(#noise)" opacity=".5"/></pattern>
${frigate}
${brig}
</defs>

<rect width="${W}" height="${H}" fill="url(#parch)"/>
<rect width="${W}" height="${H}" filter="url(#stains)" opacity=".55"/>
${rhumbs(COMPASS.x, COMPASS.y)}
${world()}
<g class="waves">${waves}</g>
${light()}
${layerThreats}
${current()}
${fairway()}
<g transform="translate(${f(LH.tx)} ${f(LH.ty)}) scale(${LH.s})">${layerIsland}${layerLighthouse}</g>
${layerShips}
${layerLabels}
${placeNames()}
${layerCompass}
<rect width="${W}" height="${H}" filter="url(#noise)" opacity=".18" style="mix-blend-mode:multiply"/>
<rect width="${W}" height="${H}" fill="url(#vignette)"/>
${frame()}
</svg>`;

fs.writeFileSync(path.join(dir, 'map.svg'), svg);
console.log('map.svg', (svg.length / 1024).toFixed(0) + ' KB');
