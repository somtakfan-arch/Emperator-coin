// NFT-коллекции: генеративные картинки (SVG), черты, редкость и цены.
// Всё детерминировано: у всех игроков одни и те же токены и одни и те же цены.
import { getPrice } from "./market.js";

// ───────── детерминированный рандом ─────────
function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// options: [[value, weight], ...]
function pick(r, options) {
  const sum = options.reduce((s, o) => s + o[1], 0);
  let x = r() * sum;
  for (const o of options) { x -= o[1]; if (x <= 0) return o[0]; }
  return options.at(-1)[0];
}
const rand = (r, a, b) => a + r() * (b - a);
const f1 = (n) => Math.round(n * 10) / 10;

function mix(c1, c2, t) {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

// ═════════ 1. Короны ═════════
function genCrown(r, uid) {
  const bgName = pick(r, [["Обсидиан", 40], ["Полночь", 25], ["Вино", 15], ["Изумрудная ночь", 12], ["Золотой час", 5], ["Белый мрамор", 3]]);
  const BG = { "Обсидиан": ["#26282d", "#0b0b0d"], "Полночь": ["#22305a", "#0a0d18"], "Вино": ["#4a1a28", "#12070a"],
    "Изумрудная ночь": ["#17402f", "#06100c"], "Золотой час": ["#5a4216", "#140d04"], "Белый мрамор": ["#f1eee8", "#a9a59c"] }[bgName];
  const metal = pick(r, [["Серебро", 45], ["Золото", 25], ["Розовое золото", 15], ["Чёрный металл", 10], ["Платина", 5]]);
  const M = { "Серебро": ["#f4f6f8", "#a9afb8", "#5d626a"], "Золото": ["#fff0b8", "#d9a634", "#7a500e"],
    "Розовое золото": ["#ffe1d6", "#d28c78", "#6d3a2c"], "Чёрный металл": ["#7b7f86", "#2b2d31", "#0d0e10"],
    "Платина": ["#ffffff", "#cfe3ff", "#6f8db8"] }[metal];
  const spikes = pick(r, [[3, 30], [5, 45], [7, 20], [9, 5]]);
  const gem = pick(r, [["Рубин", 30], ["Сапфир", 25], ["Изумруд", 20], ["Аметист", 15], ["Бриллиант", 7], ["Без камней", 3]]);
  const G = { "Рубин": "#e0405a", "Сапфир": "#3d6fe0", "Изумруд": "#2fb57a", "Аметист": "#9b59d9", "Бриллиант": "#eaf6ff" }[gem];
  const aura = pick(r, [["Нет", 60], ["Ореол", 25], ["Звёзды", 12], ["Пламя", 3]]);

  let s = `<defs><radialGradient id="b${uid}" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="${BG[0]}"/><stop offset="1" stop-color="${BG[1]}"/></radialGradient>
    <linearGradient id="m${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${M[0]}"/><stop offset=".55" stop-color="${M[1]}"/><stop offset="1" stop-color="${M[2]}"/></linearGradient>
    <radialGradient id="h${uid}"><stop offset="0" stop-color="${aura === "Пламя" ? "#ff8a3c" : M[0]}" stop-opacity=".55"/><stop offset="1" stop-color="${M[0]}" stop-opacity="0"/></radialGradient></defs>
    <rect width="100" height="100" fill="url(#b${uid})"/>`;
  if (aura === "Ореол" || aura === "Пламя") s += `<circle cx="50" cy="50" r="40" fill="url(#h${uid})"/>`;
  if (aura === "Звёзды") for (let i = 0; i < 14; i++) {
    const x = rand(r, 6, 94), y = rand(r, 6, 40), k = rand(r, .6, 1.6);
    s += `<path d="M${f1(x)} ${f1(y - 2 * k)}L${f1(x + .5 * k)} ${f1(y - .5 * k)}L${f1(x + 2 * k)} ${f1(y)}L${f1(x + .5 * k)} ${f1(y + .5 * k)}L${f1(x)} ${f1(y + 2 * k)}L${f1(x - .5 * k)} ${f1(y + .5 * k)}L${f1(x - 2 * k)} ${f1(y)}L${f1(x - .5 * k)} ${f1(y - .5 * k)}Z" fill="${M[0]}" opacity=".8"/>`;
  }
  // зубцы
  const L = 22, R = 78, w = (R - L) / (spikes - 1);
  let pts = `${L},70 ${L},52`;
  const tips = [];
  for (let i = 0; i < spikes; i++) {
    const x = L + i * w;
    const mid = Math.abs(i - (spikes - 1) / 2) / ((spikes - 1) / 2);
    const y = 26 + mid * 10;
    tips.push([x, y]);
    pts += ` ${f1(x)},${f1(y)}`;
    if (i < spikes - 1) pts += ` ${f1(x + w / 2)},${f1(50 - mid * 2)}`;
  }
  pts += ` ${R},52 ${R},70`;
  s += `<ellipse cx="50" cy="76" rx="30" ry="3" fill="#000" opacity=".35"/>`;
  s += `<polygon points="${pts}" fill="url(#m${uid})" stroke="${M[2]}" stroke-width=".6" stroke-linejoin="round"/>`;
  s += `<rect x="${L - 1}" y="60" width="${R - L + 2}" height="11" rx="1.5" fill="url(#m${uid})" stroke="${M[2]}" stroke-width=".6"/>`;
  s += `<rect x="${L - 1}" y="60.5" width="${R - L + 2}" height="1.4" fill="#fff" opacity=".35"/>`;
  tips.forEach(([x, y]) => (s += `<circle cx="${f1(x)}" cy="${f1(y - 1.5)}" r="2.6" fill="url(#m${uid})" stroke="${M[2]}" stroke-width=".5"/>`));
  if (G) {
    const n = spikes >= 7 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const x = L + 5 + i * ((R - L - 10) / (n - 1));
      const big = i === (n - 1) / 2;
      s += `<circle cx="${f1(x)}" cy="65.5" r="${big ? 3.4 : 2.2}" fill="${G}" stroke="#000" stroke-opacity=".3" stroke-width=".4"/><circle cx="${f1(x - .8)}" cy="64.6" r="${big ? 1 : .7}" fill="#fff" opacity=".8"/>`;
    }
    s += `<path d="M50 42 l3.5 5 l-3.5 5 l-3.5 -5z" fill="${G}" stroke="#000" stroke-opacity=".3" stroke-width=".4"/><path d="M49 44 l1.3 -1.5 l.8 1.3z" fill="#fff" opacity=".8"/>`;
  }
  return { svg: s, traits: { "Фон": bgName, "Металл": metal, "Зубцы": String(spikes), "Камни": gem, "Аура": aura } };
}

// ═════════ 2. Ночные пики ═════════
function genPeaks(r, uid) {
  const sky = pick(r, [["Ночь", 35], ["Сумерки", 25], ["Рассвет", 15], ["Северное сияние", 10], ["Кровавая ночь", 8], ["Лёд", 7]]);
  const SK = { "Ночь": ["#070a14", "#1d2438"], "Сумерки": ["#120c20", "#4f2d4d"], "Рассвет": ["#1f1528", "#c9805c"],
    "Северное сияние": ["#04080d", "#14262a"], "Кровавая ночь": ["#0d0507", "#3c1417"], "Лёд": ["#0b1620", "#64879a"] }[sky];
  const moon = pick(r, [["Полная", 40], ["Полумесяц", 30], ["Без луны", 20], ["Затмение", 5], ["Две луны", 5]]);
  const ridges = pick(r, [[2, 30], [3, 45], [4, 25]]);
  const stars = pick(r, [["Мало", 40], ["Много", 45], ["Млечный путь", 15]]);
  const lake = pick(r, [["Нет", 80], ["Озеро", 20]]);
  const mc = sky === "Кровавая ночь" ? "#e0675a" : "#e9edf2";

  let s = `<defs><linearGradient id="s${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SK[0]}"/><stop offset="1" stop-color="${SK[1]}"/></linearGradient>
    <radialGradient id="g${uid}"><stop offset="0" stop-color="${mc}" stop-opacity=".5"/><stop offset="1" stop-color="${mc}" stop-opacity="0"/></radialGradient></defs>
    <rect width="100" height="100" fill="url(#s${uid})"/>`;
  const nStars = stars === "Мало" ? 18 : 45;
  for (let i = 0; i < nStars; i++) s += `<circle cx="${f1(rand(r, 0, 100))}" cy="${f1(rand(r, 0, 55))}" r="${f1(rand(r, .15, .5))}" fill="#fff" opacity="${f1(rand(r, .3, .9))}"/>`;
  if (stars === "Млечный путь") for (let i = 0; i < 90; i++) {
    const t = r(); const x = t * 100, y = 8 + t * 34 + rand(r, -6, 6);
    s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rand(r, .1, .35))}" fill="#dfe6ff" opacity="${f1(rand(r, .2, .7))}"/>`;
  }
  if (sky === "Северное сияние") for (let i = 0; i < 3; i++) {
    const y = 18 + i * 7;
    s += `<path d="M-5 ${y} C 25 ${y - 10}, 55 ${y + 12}, 105 ${y - 4}" stroke="${["#4ff3a6", "#5fd6c4", "#8a7bff"][i]}" stroke-width="${5 - i}" fill="none" opacity=".35"/>`;
  }
  const mx = f1(rand(r, 22, 78)), my = f1(rand(r, 16, 30)), mr = f1(rand(r, 6, 10));
  if (moon !== "Без луны") {
    s += `<circle cx="${mx}" cy="${my}" r="${mr * 3}" fill="url(#g${uid})"/>`;
    if (moon === "Полная") s += `<circle cx="${mx}" cy="${my}" r="${mr}" fill="${mc}"/>`;
    if (moon === "Полумесяц") s += `<circle cx="${mx}" cy="${my}" r="${mr}" fill="${mc}"/><circle cx="${f1(+mx + mr * .45)}" cy="${f1(+my - mr * .2)}" r="${mr}" fill="${SK[0]}"/>`;
    if (moon === "Затмение") s += `<circle cx="${mx}" cy="${my}" r="${f1(mr * 1.08)}" fill="#ffd28a" opacity=".8"/><circle cx="${mx}" cy="${my}" r="${mr}" fill="#050506"/>`;
    if (moon === "Две луны") s += `<circle cx="${mx}" cy="${my}" r="${mr}" fill="${mc}"/><circle cx="${f1(+mx + mr * 2.2)}" cy="${f1(+my + 4)}" r="${f1(mr * .45)}" fill="#c9b8ff"/>`;
  }
  const horizon = lake === "Озеро" ? 72 : 100;
  let layers = "";
  for (let i = 0; i < ridges; i++) {
    const base = 52 + i * (lake === "Озеро" ? 5 : 9);
    const amp = 18 - i * 3;
    const fr = [rand(r, .03, .07), rand(r, .08, .16), rand(r, .2, .35)], ph = [r() * 6, r() * 6, r() * 6];
    let d = `M0 ${horizon}`;
    for (let x = 0; x <= 100; x += 2) {
      const y = base - amp * Math.abs(Math.sin(x * fr[0] + ph[0]) * .65 + Math.sin(x * fr[1] + ph[1]) * .25 + Math.sin(x * fr[2] + ph[2]) * .1);
      d += ` L${x} ${f1(Math.min(y, horizon))}`;
    }
    d += ` L100 ${horizon} Z`;
    const col = mix("#2a2f3a", "#07080b", ridges === 1 ? 1 : i / (ridges - 1));
    layers += `<path d="${d}" fill="${col}" stroke="#cfd6e0" stroke-opacity="${f1(.35 - i * .07)}" stroke-width=".5"/>`;
  }
  s += layers;
  if (lake === "Озеро") {
    s += `<rect y="72" width="100" height="28" fill="${SK[1]}" opacity=".9"/>`;
    s += `<g transform="translate(0 144) scale(1 -1)" opacity=".35">${layers}</g>`;
    for (let i = 0; i < 6; i++) s += `<rect x="${f1(rand(r, 10, 80))}" y="${f1(rand(r, 75, 96))}" width="${f1(rand(r, 6, 18))}" height=".4" fill="#fff" opacity=".25"/>`;
  }
  return { svg: s, traits: { "Небо": sky, "Луна": moon, "Хребты": String(ridges), "Звёзды": stars, "Озеро": lake } };
}

// ═════════ 3. Стеклянные сферы ═════════
function genOrb(r, uid) {
  const color = pick(r, [["Серебро", 30], ["Лазурь", 18], ["Аметист", 15], ["Изумруд", 12], ["Янтарь", 12], ["Роза", 8], ["Радуга", 5]]);
  const H = { "Серебро": null, "Лазурь": 205, "Аметист": 275, "Изумруд": 155, "Янтарь": 35, "Роза": 335 }[color];
  const c = (l, a = 1) => (H == null ? `hsla(220,8%,${l}%,${a})` : `hsla(${H},65%,${l}%,${a})`);
  const core = pick(r, [["Пусто", 35], ["Вихрь", 30], ["Звезда", 15], ["Галактика", 12], ["Глаз", 8]]);
  const ring = pick(r, [["Нет", 70], ["Кольцо", 22], ["Двойное кольцо", 8]]);
  const bg = pick(r, [["Тьма", 50], ["Туман", 30], ["Сетка", 20]]);
  const tilt = f1(rand(r, -25, 25));

  let s = `<defs><radialGradient id="o${uid}" cx="38%" cy="32%" r="75%">` +
    (color === "Радуга"
      ? `<stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#ff9ad5"/><stop offset=".55" stop-color="#8ab4ff"/><stop offset=".8" stop-color="#5ef0c0"/><stop offset="1" stop-color="#101418"/>`
      : `<stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="${c(78)}"/><stop offset=".7" stop-color="${c(38)}"/><stop offset="1" stop-color="${c(10)}"/>`) +
    `</radialGradient><radialGradient id="f${uid}" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="${H == null ? "#3a3d44" : c(22)}"/><stop offset="1" stop-color="#08090b"/></radialGradient></defs>
    <rect width="100" height="100" fill="${bg === "Туман" ? `url(#f${uid})` : "#0b0c0f"}"/>`;
  if (bg === "Сетка") for (let i = 10; i < 100; i += 10) s += `<path d="M${i} 0V100M0 ${i}H100" stroke="#fff" stroke-opacity=".05" stroke-width=".4"/>`;
  s += `<ellipse cx="50" cy="88" rx="24" ry="3.5" fill="#000" opacity=".5"/>`;
  const ringEl = (rx, op) => `<ellipse cx="50" cy="52" rx="${rx}" ry="${f1(rx * .22)}" fill="none" stroke="${c(80)}" stroke-width="1.6" opacity="${op}" transform="rotate(${tilt} 50 52)"/>`;
  if (ring !== "Нет") s += ringEl(44, .35);
  if (ring === "Двойное кольцо") s += ringEl(49, .25);
  s += `<circle cx="50" cy="52" r="30" fill="url(#o${uid})" stroke="#fff" stroke-opacity=".25" stroke-width=".6"/>`;
  if (core === "Вихрь") for (let i = 0; i < 5; i++) s += `<ellipse cx="50" cy="54" rx="${16 - i * 2.5}" ry="${5 + i}" fill="none" stroke="#fff" stroke-opacity="${f1(.22 + i * .05)}" stroke-width=".7" transform="rotate(${i * 36 + +tilt} 50 54)"/>`;
  if (core === "Звезда") s += `<path d="M50 40 L53 51 L64 54 L53 57 L50 68 L47 57 L36 54 L47 51Z" fill="#fff" opacity=".85"/>`;
  if (core === "Галактика") for (let i = 0; i < 70; i++) {
    const a = i * .38, d = i * .28;
    s += `<circle cx="${f1(50 + Math.cos(a) * d)}" cy="${f1(54 + Math.sin(a) * d * .55)}" r="${f1(.3 + r() * .5)}" fill="#fff" opacity="${f1(.4 + r() * .5)}"/>`;
  }
  if (core === "Глаз") s += `<ellipse cx="50" cy="54" rx="11" ry="7" fill="#f5f7fa" opacity=".9"/><circle cx="50" cy="54" r="4.6" fill="${c(30)}"/><circle cx="50" cy="54" r="2" fill="#050506"/><circle cx="51.5" cy="52.6" r=".9" fill="#fff"/>`;
  s += `<ellipse cx="40" cy="38" rx="9" ry="5" fill="#fff" opacity=".45" transform="rotate(-30 40 38)"/><circle cx="62" cy="68" r="1.6" fill="#fff" opacity=".35"/>`;
  if (ring !== "Нет") s += `<path d="M${f1(50 - 44)} 52 A44 ${f1(44 * .22)} 0 0 0 ${f1(50 + 44)} 52" fill="none" stroke="${c(85)}" stroke-width="1.6" opacity=".75" transform="rotate(${tilt} 50 52)"/>`;
  return { svg: s, traits: { "Цвет": color, "Ядро": core, "Кольцо": ring, "Фон": bg } };
}

// ═════════ 4. Бит-лица (пиксель-арт 12×12) ═════════
function genFace(r) {
  const skin = pick(r, [["Светлая", 25], ["Смуглая", 25], ["Тёмная", 20], ["Зомби", 10], ["Робот", 10], ["Пришелец", 7], ["Золото", 3]]);
  const SK = { "Светлая": "#f1c9a5", "Смуглая": "#c68a5c", "Тёмная": "#7d5236", "Зомби": "#8fb08a", "Робот": "#b8bec7", "Пришелец": "#9fe0d0", "Золото": "#e2b04a" }[skin];
  const bg = pick(r, [["Графит", 25], ["Слива", 20], ["Хвоя", 20], ["Какао", 15], ["Ночь", 15], ["Голограмма", 5]]);
  const BG = { "Графит": "#23262c", "Слива": "#2e2238", "Хвоя": "#1f2f2a", "Какао": "#35271f", "Ночь": "#1b263a" }[bg];
  const eyes = pick(r, [["Обычные", 40], ["Сонные", 20], ["Злые", 15], ["Очки", 12], ["VR-очки", 8], ["Лазер", 5]]);
  const mouth = pick(r, [["Улыбка", 35], ["Ровный", 30], ["Удивление", 15], ["Жвачка", 12], ["Борода", 8]]);
  const hat = pick(r, [["Нет", 35], ["Кепка", 20], ["Шапка", 15], ["Капюшон", 12], ["Наушники", 10], ["Корона", 5], ["Нимб", 3]]);

  const px = [];
  const P = (x, y, c, w = 1, h = 1) => px.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`);
  let s = bg === "Голограмма"
    ? `<defs><linearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3d2b5a"/><stop offset=".5" stop-color="#1f4b57"/><stop offset="1" stop-color="#57452b"/></linearGradient></defs><rect width="12" height="12" fill="url(#hg)"/>`
    : `<rect width="12" height="12" fill="${BG}"/>`;
  const dark = mix(SK, "#000000", .35);
  if (hat === "Капюшон") P(2, 2, "#3a3f47", 8, 10);
  P(3, 3, SK, 6, 8); P(4, 11, SK, 4, 1); P(3, 3, dark, 1, 8); // голова + тень
  if (skin === "Робот") { P(5, 1, "#8d939c", 1, 2); P(4, 1, "#e0405a"); }
  // глаза
  const E = { "Обычные": () => { P(4, 5, "#fff"); P(7, 5, "#fff"); P(5, 5, "#111"); P(8, 5, "#111"); },
    "Сонные": () => { P(4, 5, dark, 2, 1); P(7, 5, dark, 2, 1); },
    "Злые": () => { P(4, 4, "#111", 2, 1); P(7, 4, "#111", 2, 1); P(5, 5, "#111"); P(7, 5, "#111"); },
    "Очки": () => { P(3, 5, "#0d0d0f", 6, 1); P(4, 5, "#2b2f36", 2, 1); P(7, 5, "#2b2f36", 2, 1); },
    "VR-очки": () => { P(3, 4, "#c9ced6", 6, 2); P(4, 5, "#4ff3ff", 4, 1); },
    "Лазер": () => { P(4, 5, "#ff3b3b"); P(7, 5, "#ff3b3b"); P(8, 5, "#ff3b3b", 4, 1); } };
  E[eyes]();
  // рот
  const MO = { "Улыбка": () => { P(5, 8, "#5a2a22", 2, 1); P(4, 7, "#5a2a22"); P(7, 7, "#5a2a22"); },
    "Ровный": () => P(5, 8, "#5a2a22", 2, 1),
    "Удивление": () => P(5, 8, "#2a1410", 2, 2),
    "Жвачка": () => { P(5, 8, "#5a2a22", 2, 1); P(7, 7, "#ff8fc8", 2, 2); },
    "Борода": () => { P(3, 8, "#3b2a1f", 6, 3); P(5, 8, "#5a2a22", 2, 1); } };
  MO[mouth]();
  // шапка
  const HA = { "Нет": () => {},
    "Кепка": () => { P(3, 2, "#e0405a", 6, 2); P(8, 3, "#b02e44", 3, 1); },
    "Шапка": () => { P(3, 1, "#3d6fe0", 6, 3); P(5, 0, "#f4f6f8", 2, 1); },
    "Капюшон": () => P(2, 1, "#4a5059", 8, 2),
    "Наушники": () => { P(3, 2, "#2b2d31", 6, 1); P(2, 4, "#c9ced6", 1, 3); P(9, 4, "#c9ced6", 1, 3); },
    "Корона": () => { P(3, 2, "#e2b04a", 6, 1); P(3, 1, "#e2b04a"); P(5, 1, "#e2b04a", 2, 1); P(8, 1, "#e2b04a"); P(5, 0, "#e0405a", 2, 1); },
    "Нимб": () => P(3, 0, "#fff3b0", 6, 1) };
  HA[hat]();
  s += `<g shape-rendering="crispEdges">${px.join("")}</g>`;
  return { svg: s, traits: { "Кожа": skin, "Фон": bg, "Глаза": eyes, "Рот": mouth, "Голова": hat }, viewBox: "0 0 12 12" };
}

// ═════════ 5. Волны ═════════
function genWaves(r, uid) {
  const pal = pick(r, [["Серебро", 35], ["Океан", 20], ["Закат", 15], ["Мята", 15], ["Неон", 10], ["Золото", 5]]);
  const PL = { "Серебро": ["#f2f4f7", "#6d737c"], "Океан": ["#8fdcff", "#2b5f9e"], "Закат": ["#ffc07a", "#c2456b"],
    "Мята": ["#c2ffe2", "#2e8c6a"], "Неон": ["#ff4fd8", "#4ff3ff"], "Золото": ["#fff0b8", "#a8741c"] }[pal];
  const lines = pick(r, [[6, 20], [10, 35], [16, 30], [24, 15]]);
  const mood = pick(r, [["Штиль", 40], ["Ветер", 40], ["Шторм", 20]]);
  const style = pick(r, [["Линии", 60], ["Точки", 25], ["Ленты", 15]]);
  const amp = { "Штиль": 3, "Ветер": 6, "Шторм": 11 }[mood];
  const fr = rand(r, .05, .12), ph = r() * 6, shift = rand(r, .15, .6), fr2 = rand(r, .15, .3);

  let s = `<rect width="100" height="100" fill="#0a0b0e"/>`;
  for (let i = 0; i < lines; i++) {
    const y0 = 14 + i * (72 / (lines - 1));
    const col = mix(PL[0], PL[1], i / (lines - 1));
    const ys = [];
    for (let x = 0; x <= 100; x += 2) ys.push([x, y0 + amp * Math.sin(x * fr + ph + i * shift) + amp * .35 * Math.sin(x * fr2 + i)]);
    if (style === "Точки") {
      ys.filter((_, k) => k % 2 === 0).forEach(([x, y]) => (s += `<circle cx="${x}" cy="${f1(y)}" r="${f1(.5 + (i / lines) * .5)}" fill="${col}"/>`));
    } else {
      const d = ys.map(([x, y], k) => `${k ? "L" : "M"}${x} ${f1(y)}`).join(" ");
      s += style === "Ленты"
        ? `<path d="${d} L100 100 L0 100Z" fill="${col}" opacity="${f1(.12 + .5 / lines)}"/><path d="${d}" stroke="${col}" stroke-width=".6" fill="none"/>`
        : `<path d="${d}" stroke="${col}" stroke-width="${lines > 16 ? .5 : .9}" fill="none" stroke-linecap="round"/>`;
    }
  }
  return { svg: s, traits: { "Палитра": pal, "Линий": String(lines), "Настроение": mood, "Стиль": style } };
}

// ═════════ 6. Серебряная колода ═════════
const RANKS = ["Туз", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Валет", "Дама", "Король"];
const RANK_SHORT = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = [["Пики", "♠", false], ["Червы", "♥", true], ["Бубны", "♦", true], ["Трефы", "♣", false]];
function genCard(r, uid, n) {
  const foil = pick(r, [["Серебро", 70], ["Чёрная", 20], ["Золото", 8], ["Голограмма", 2]]);
  const F = { "Серебро": ["#f6f7f9", "#b9bec6"], "Чёрная": ["#3a3d43", "#0f1012"], "Золото": ["#fff3c4", "#c99a3c"], "Голограмма": ["#e8d9ff", "#a8e6ff"] }[foil];
  const ink = foil === "Чёрная" ? "#e8eaee" : "#1a1c20";
  const joker = n > 52;
  const rank = joker ? "Джокер" : RANKS[(n - 1) % 13];
  const suit = joker ? null : SUITS[Math.floor((n - 1) / 13)];
  const red = suit?.[2];
  const sc = red ? (foil === "Чёрная" ? "#e57373" : "#b03a3a") : ink;

  let s = `<defs><linearGradient id="c${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${F[0]}"/><stop offset=".5" stop-color="${F[1]}"/><stop offset="1" stop-color="${F[0]}"/></linearGradient></defs>
    <rect width="100" height="100" fill="#0c0d10"/><rect x="20" y="6" width="60" height="88" rx="5" fill="#000" opacity=".4" transform="translate(1.5 2)"/>
    <rect x="20" y="6" width="60" height="88" rx="5" fill="url(#c${uid})" stroke="#fff" stroke-opacity=".5" stroke-width=".5"/>
    <rect x="23" y="9" width="54" height="82" rx="3.5" fill="none" stroke="${ink}" stroke-opacity=".18" stroke-width=".5"/>`;
  if (joker) {
    s += `<text x="50" y="58" text-anchor="middle" font-size="30" fill="${n === 53 ? "#b03a3a" : ink}" font-family="serif">♛</text>
      <text x="25" y="20" font-size="6" fill="${ink}" font-family="Inter, sans-serif" font-weight="700">JKR</text>
      <text x="50" y="78" text-anchor="middle" font-size="6" letter-spacing="2" fill="${ink}" font-family="serif">JOKER</text>`;
  } else {
    const short = RANK_SHORT[(n - 1) % 13];
    s += `<text x="25" y="19" font-size="8" fill="${sc}" font-family="Inter, sans-serif" font-weight="700">${short}</text>
      <text x="25" y="27" font-size="7" fill="${sc}" font-family="serif">${suit[1]}</text>
      <g transform="rotate(180 50 50)"><text x="25" y="19" font-size="8" fill="${sc}" font-family="Inter, sans-serif" font-weight="700">${short}</text><text x="25" y="27" font-size="7" fill="${sc}" font-family="serif">${suit[1]}</text></g>`;
    s += "JQK".includes(short)
      ? `<text x="50" y="58" text-anchor="middle" font-size="26" fill="${sc}" font-family="serif" font-weight="600">${short}</text><text x="50" y="72" text-anchor="middle" font-size="10" fill="${sc}" font-family="serif">${suit[1]}</text>`
      : `<text x="50" y="${short === "A" ? 62 : 60}" text-anchor="middle" font-size="${short === "A" ? 34 : 26}" fill="${sc}" font-family="serif">${suit[1]}</text>`;
  }
  if (foil === "Голограмма") s += `<rect x="20" y="6" width="60" height="88" rx="5" fill="url(#c${uid})" opacity=".25" style="mix-blend-mode:screen"/>`;
  const name = joker ? (n === 53 ? "Красный джокер" : "Чёрный джокер") : `${rank} ${suit[1]}`;
  return { svg: s, name, traits: { "Масть": joker ? "Джокер" : suit[0], "Ранг": rank, "Фольга": foil } };
}

// ═════════ коллекции ═════════
export const COLLECTIONS = [
  { id: "crowns", name: "Bed Crowns", desc: "Короны для тех, кто правит рынком. Металл, камни и аура — у каждой свои.", chain: "ETH", base: 0.11, size: 100, gen: genCrown },
  { id: "peaks", name: "Night Peaks", desc: "Ночные горы под луной. Северное сияние и две луны — большая редкость.", chain: "SOL", base: 1.4, size: 100, gen: genPeaks },
  { id: "orbs", name: "Glass Orbs", desc: "Стеклянные сферы с ядром внутри. Радужные — самые редкие.", chain: "TON", base: 38, size: 120, gen: genOrb },
  { id: "faces", name: "Bit Faces", desc: "Пиксельные лица 12×12. Корона, нимб и лазерные глаза ценятся выше всего.", chain: "ETH", base: 0.028, size: 150, gen: genFace },
  { id: "waves", name: "Silver Waves", desc: "Генеративные волны: от штиля до шторма.", chain: "BNB", base: 0.14, size: 100, gen: genWaves },
  { id: "deck", name: "Silver Deck", desc: "Колода из 54 карт. Джокеров всего два, голографическая фольга — почти легенда.", chain: "TON", base: 22, size: 54, gen: genCard },
];
export const collectionById = (id) => COLLECTIONS.find((c) => c.id === id);

const TIERS = [
  { name: "Легендарный", top: 0.01, mult: 12, cls: "t-leg" },
  { name: "Эпический", top: 0.05, mult: 5, cls: "t-epic" },
  { name: "Редкий", top: 0.15, mult: 2.2, cls: "t-rare" },
  { name: "Необычный", top: 0.4, mult: 1.4, cls: "t-unc" },
  { name: "Обычный", top: 1, mult: 1, cls: "t-com" },
];

const cache = new Map();
// Все токены коллекции с чертами, редкостью и множителем цены.
export function getItems(colId) {
  if (cache.has(colId)) return cache.get(colId);
  const col = collectionById(colId);
  const items = [];
  for (let n = 1; n <= col.size; n++) {
    const r = rng(hash(`${col.id}#${n}`));
    const g = col.gen(r, `${col.id}${n}`, n);
    items.push({ id: `${col.id}-${n}`, n, col, name: g.name || `${col.name} #${n}`, svg: g.svg, viewBox: g.viewBox || "0 0 100 100", traits: g.traits });
  }
  // частоты черт → редкость
  const freq = {};
  items.forEach((it) => Object.entries(it.traits).forEach(([k, v]) => { const key = `${k}:${v}`; freq[key] = (freq[key] || 0) + 1; }));
  items.forEach((it) => {
    it.traitFreq = Object.fromEntries(Object.entries(it.traits).map(([k, v]) => [k, freq[`${k}:${v}`] / items.length]));
    it.score = Object.values(it.traitFreq).reduce((s, f) => s - Math.log(f), 0);
  });
  [...items].sort((a, b) => b.score - a.score || a.n - b.n).forEach((it, i) => {
    it.rank = i + 1;
    it.tier = TIERS.find((t) => (i + 1) / items.length <= t.top + 1e-9) || TIERS.at(-1);
  });
  cache.set(colId, items);
  return items;
}
export function getItem(tokenId) {
  const [colId, n] = tokenId.split("-");
  return collectionById(colId) ? getItems(colId)[+n - 1] || null : null;
}

export const nftSvg = (it, cls = "") =>
  `<svg class="${cls}" viewBox="${it.viewBox}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${it.name}">${it.svg}</svg>`;

// ───────── цены ─────────
// Флор коллекции в монете сети плавно «дышит» — одинаково для всех игроков.
const DAY = 86400e3;
export function floorCoin(col, t = Date.now()) {
  const h = hash(col.id);
  const p = [h % 628 / 100, (h >> 8) % 628 / 100, (h >> 16) % 628 / 100];
  const d = t / DAY;
  const w = 0.28 * Math.sin((2 * Math.PI * d) / 23 + p[0]) + 0.08 * Math.sin((2 * Math.PI * d) / 5.7 + p[1])
    + 0.03 * Math.sin((2 * Math.PI * d) / 1.3 + p[2]) + 0.008 * Math.sin((2 * Math.PI * d) / 0.17 + p[0] * 2);
  return col.base * Math.exp(w);
}
export function floorUsd(col, t) {
  const cp = getPrice(`${col.chain}USDT`);
  return cp == null ? null : floorCoin(col, t) * cp;
}
export function itemUsd(it, t) {
  const f = floorUsd(it.col, t);
  return f == null ? null : f * it.tier.mult;
}
export const floorChange24h = (col) => (floorCoin(col) / floorCoin(col, Date.now() - DAY) - 1) * 100;

// ───────── мистери-бокс ─────────
// Бокс покупается за BOX.price, открывается за BOX.reveal и превращается
// в случайный свободный токен из любой коллекции. Шанс токена ∝ 1 / его цена:
// дешёвые выпадают часто, легендарные — редко.
export const BOX = { price: 99, reveal: 10 };

export function boxOdds(items) {
  const w = items.map((it) => { const p = itemUsd(it); return p ? 1 / p : 0; });
  const W = w.reduce((a, b) => a + b, 0);
  return { weights: w, total: W };
}

export function pickWeighted(items) {
  const { weights, total } = boxOdds(items);
  if (!total) return null;
  let x = Math.random() * total;
  for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x <= 0) return items[i]; }
  return items.at(-1);
}

export const allItems = () => COLLECTIONS.flatMap((c) => getItems(c.id));

export const boxSvg = (cls = "") => `<svg class="${cls}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Мистери-бокс">
  <defs>
    <radialGradient id="bxg" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#2c3038"/><stop offset="1" stop-color="#08090b"/></radialGradient>
    <linearGradient id="bxt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b9bfc8"/></linearGradient>
    <linearGradient id="bxl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9ced6"/><stop offset="1" stop-color="#6d737c"/></linearGradient>
    <linearGradient id="bxr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa0a9"/><stop offset="1" stop-color="#3d4148"/></linearGradient>
    <radialGradient id="bxh"><stop offset="0" stop-color="#e9edf2" stop-opacity=".45"/><stop offset="1" stop-color="#e9edf2" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="100" height="100" fill="url(#bxg)"/>
  <circle cx="50" cy="48" r="40" fill="url(#bxh)"/>
  <ellipse cx="50" cy="86" rx="26" ry="4" fill="#000" opacity=".5"/>
  <path d="M50 22 L78 36 L50 50 L22 36Z" fill="url(#bxt)"/>
  <path d="M22 36 L50 50 L50 82 L22 68Z" fill="url(#bxl)"/>
  <path d="M78 36 L50 50 L50 82 L78 68Z" fill="url(#bxr)"/>
  <path d="M36 29 L64 43 L64 75" stroke="#3a3d43" stroke-opacity=".55" stroke-width="3" fill="none"/>
  <path d="M64 29 L36 43 L36 75" stroke="#ffffff" stroke-opacity=".35" stroke-width="3" fill="none"/>
  <text x="36" y="66" text-anchor="middle" font-size="16" font-weight="700" fill="#1a1c20" opacity=".7" font-family="Inter, sans-serif" transform="skewY(27) translate(0 -18)">?</text>
  <path d="M50 22 L78 36 L50 50 L22 36Z" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".6"/>
  <circle cx="20" cy="22" r=".9" fill="#fff"/><circle cx="82" cy="18" r=".7" fill="#fff" opacity=".8"/><circle cx="86" cy="58" r=".6" fill="#fff" opacity=".6"/><circle cx="14" cy="60" r=".7" fill="#fff" opacity=".7"/>
</svg>`;
