// Аватарки семьи Emperium. Чистый SVG: буква и корона нарисованы путями,
// шрифт нужен только для мелкой подписи.
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('./', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const defs = `
  <linearGradient id="matte" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#FFFFFF"/>
    <stop offset="100%" stop-color="#E4E4E6"/>
  </linearGradient>
  <linearGradient id="matteGold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#E8D2A0"/>
    <stop offset="100%" stop-color="#C4A662"/>
  </linearGradient>
  <linearGradient id="silver" x1="0" y1="0" x2="0.15" y2="1">
    <stop offset="0%" stop-color="#FFFFFF"/>
    <stop offset="30%" stop-color="#F0F0F0"/>
    <stop offset="55%" stop-color="#B9B9B9"/>
    <stop offset="78%" stop-color="#DEDEDE"/>
    <stop offset="100%" stop-color="#FFFFFF"/>
  </linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0.15" y2="1">
    <stop offset="0%" stop-color="#F7E9C0"/>
    <stop offset="32%" stop-color="#E3CB93"/>
    <stop offset="58%" stop-color="#A8873F"/>
    <stop offset="80%" stop-color="#D9C08A"/>
    <stop offset="100%" stop-color="#F2E3B6"/>
  </linearGradient>
  <radialGradient id="bg" cx="50%" cy="30%" r="82%">
    <stop offset="0%" stop-color="#1B1B1F"/>
    <stop offset="55%" stop-color="#101012"/>
    <stop offset="100%" stop-color="#070709"/>
  </radialGradient>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="10" result="b"/>
    <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .22 0"/>
    <feBlend in="SourceGraphic"/>
  </filter>`;

// Высококонтрастная антиква в духе Didot: массивная вертикаль,
// тонкие горизонтали, аккуратные волосяные окончания без «болтов».
function letterE({ h = 300, fill = 'url(#silver)' } = {}) {
  const stem = h * 0.205;
  const arms = { top: h * 0.098, mid: h * 0.078, bot: h * 0.108 };
  const w = { top: h * 0.53, mid: h * 0.41, bot: h * 0.57 };
  const flare = h * 0.019;      // ширина волосяного окончания
  const over = h * 0.012;       // насколько окончание выступает за арм
  const r = (x, y, ww, hh) => `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${ww.toFixed(2)}" height="${hh.toFixed(2)}" fill="${fill}"/>`;
  const arm = (y, ww, hh) => r(0, y, ww, hh) + r(ww - flare, y - over, flare, hh + over * 2);
  return `<g>
      ${r(0, 0, stem, h)}
      ${arm(0, w.top, arms.top)}
      ${arm((h - arms.mid) / 2, w.mid, arms.mid)}
      ${arm(h - arms.bot, w.bot, arms.bot)}
    </g>`;
}
const eWidth = (h) => h * 0.57;

// Корона: три шпиля с вогнутыми гранями, жемчужины на остриях, узкая лента.
function crown({ w = 240, fill = 'url(#silver)' } = {}) {
  const band = w * 0.075, gap = w * 0.03;
  const baseY = w * 0.46;
  const spire = (cx, ph, hw) =>
    `<path d="M${cx - hw} ${baseY} Q${cx - hw * 0.3} ${baseY - ph * 0.5} ${cx} ${baseY - ph}
       Q${cx + hw * 0.3} ${baseY - ph * 0.5} ${cx + hw} ${baseY}Z" fill="${fill}"/>`;
  const pearl = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="${w * 0.028}" fill="${fill}"/>`;
  return `<g>
      ${spire(w * 0.5, baseY * 0.86, w * 0.15)}
      ${spire(w * 0.16, baseY * 0.58, w * 0.115)}
      ${spire(w * 0.84, baseY * 0.58, w * 0.115)}
      ${pearl(w * 0.5, baseY - baseY * 0.86 - w * 0.022)}
      ${pearl(w * 0.16, baseY - baseY * 0.58 - w * 0.02)}
      ${pearl(w * 0.84, baseY - baseY * 0.58 - w * 0.02)}
      <rect x="0" y="${baseY}" width="${w}" height="${band}" fill="${fill}"/>
      <rect x="${w * 0.06}" y="${baseY + band + gap}" width="${w * 0.88}" height="${w * 0.018}" fill="${fill}" opacity="0.75"/>
    </g>`;
}

const SERIF = "Charter,'Bitstream Charter','Liberation Serif','DejaVu Serif',serif";
const word = (y, text, size, spacing, fill) =>
  `<text x="512" y="${y}" text-anchor="middle" fill="${fill}" font-family="${SERIF}"
     font-size="${size}" letter-spacing="${spacing}">${text}</text>`;

const frame = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>${defs}</defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  ${inner}
</svg>`;

// Композиция «корона + E», выровненная по центру
const crownedE = ({ cw, eh, crownY, eY, fill }) => `
  <g transform="translate(${512 - cw / 2},${crownY})">${crown({ w: cw, fill })}</g>
  <g transform="translate(${512 - eWidth(eh) / 2},${eY})">${letterE({ h: eh, fill })}</g>`;

// A — монограмма с короной, без подписи: читается даже в 32 пикселя
const A = frame(`<g filter="url(#soft)">
    ${crownedE({ cw: 250, eh: 470, crownY: 168, eY: 372, fill: 'url(#matte)' })}
  </g>`);

// A3 — то же в металле, для тех, кому нужен блеск
const A3 = frame(`<g filter="url(#soft)">
    ${crownedE({ cw: 250, eh: 470, crownY: 168, eY: 372, fill: 'url(#silver)' })}
  </g>`);

// E1 — предельный минимализм: геометрическая E без засечек и корона
const E1 = frame(`<g>
    <g transform="translate(${512 - 230 / 2},214)">${crown({ w: 230, fill: '#FFFFFF' })}</g>
    <g transform="translate(360,404)">
      <rect x="0" y="0" width="72" height="420" fill="#FFFFFF"/>
      <rect x="0" y="0" width="304" height="66" fill="#FFFFFF"/>
      <rect x="0" y="177" width="238" height="66" fill="#FFFFFF"/>
      <rect x="0" y="354" width="304" height="66" fill="#FFFFFF"/>
    </g>
  </g>`);

// A2 — то же, но с подписью под линией
const A2 = frame(`<g filter="url(#soft)">
    ${crownedE({ cw: 215, eh: 400, crownY: 214, eY: 396, fill: 'url(#matte)' })}
  </g>
  <rect x="392" y="830" width="240" height="1.5" fill="#4E4E52"/>
  ${word(882, 'E M P E R I U M', 30, 6, '#C6C6C6')}`);

// B — сигнет: кольцо, разорванное короной
const B = frame(`
  <mask id="ringMask">
    <rect width="1024" height="1024" fill="white"/>
    <rect x="392" y="120" width="240" height="140" fill="black"/>
  </mask>
  <g filter="url(#soft)">
    <g mask="url(#ringMask)">
      <circle cx="512" cy="512" r="336" fill="none" stroke="url(#matte)" stroke-width="6"/>
      <circle cx="512" cy="512" r="312" fill="none" stroke="#45454A" stroke-width="1.5"/>
    </g>
    <g transform="translate(407,150)">${crown({ w: 210, fill: 'url(#matte)' })}</g>
    <g transform="translate(${512 - eWidth(350) / 2},352)">${letterE({ h: 350, fill: 'url(#matte)' })}</g>
  </g>
  <path id="arc" d="M262 512 A250 250 0 0 0 762 512" fill="none"/>
  <text fill="#C4C4C4" font-family="${SERIF}" font-size="34" letter-spacing="16">
    <textPath href="#arc" startOffset="50%" text-anchor="middle">EMPERIUM</textPath>
  </text>`);

// C — герб: щит под короной, монограмма внутри
const C = frame(`<g filter="url(#soft)">
    <g transform="translate(422,168)">${crown({ w: 180, fill: 'url(#matte)' })}</g>
    <path d="M512 302 L768 378 V596 C768 712 660 786 512 836 C364 786 256 712 256 596 V378 Z"
      fill="none" stroke="url(#silver)" stroke-width="5"/>
    <path d="M512 330 L740 398 V592 C740 694 644 760 512 806 C380 760 284 694 284 592 V398 Z"
      fill="none" stroke="#3E3E43" stroke-width="1.5"/>
    <g transform="translate(${512 - eWidth(300) / 2},420)">${letterE({ h: 300, fill: 'url(#matte)' })}</g>
  </g>
  ${word(778, 'E M P E R I U M', 24, 5, '#9E9E9E')}`);

// D — лавровый венок, золото
const D = (() => {
  const branch = (dir) => {
    const R = 355;
    return Array.from({ length: 10 }, (_, i) => {
      const a = 118 - i * 12.5;                 // от низа к верху
      const rad = (a * Math.PI) / 180;
      const x = 512 + dir * Math.sin(rad) * R * 0.86;
      const y = 512 + Math.cos(rad) * R;
      const rot = dir > 0 ? 90 - a : a - 90;
      const size = 1 - i * 0.045;
      return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(44 * size).toFixed(1)}" ry="${(15 * size).toFixed(1)}"
        transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="url(#gold)"/>`;
    }).join('');
  };
  return frame(`<g filter="url(#soft)">
      ${branch(1)}${branch(-1)}
      ${crownedE({ cw: 190, eh: 350, crownY: 236, eY: 410, fill: 'url(#matteGold)' })}
    </g>
`);
})();

const variants = { 'A-mark': A, 'A2-mark-text': A2, 'A3-metal': A3, 'B-signet': B, 'C-crest': C, 'D-laurel': D, 'E-geometric': E1 };
for (const [name, svg] of Object.entries(variants)) {
  writeFileSync(`${OUT}emperium-${name}.svg`, svg);
  // Рендерим в половинном размере при двойном масштабе — так сглаживание чище.
  writeFileSync(`${OUT}emperium-${name}.html`,
    `<html><head><style>html,body{margin:0;padding:0;background:#070709;overflow:hidden}
      svg{display:block;width:1024px;height:1024px}</style></head><body>${svg.replace('width="1024" height="1024"', '')}</body></html>`);
}
console.log('вариантов:', Object.keys(variants).length);
