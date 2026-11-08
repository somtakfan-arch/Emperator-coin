// Хоррор «Фото в 3:14»: 2 серии, история продолжается. Номера 511–512.
// Использует SC, T.hor, shade, rt, kfr из horror.js. Страшно атмосферой, без крови.

const grain = (lt, k = .1) => `<defs><filter id="grn"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="1" seed="${Math.floor(lt * 24) % 50}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${k * 6} 0"/></filter></defs><rect width="${W}" height="${H}" filter="url(#grn)" opacity="${k * 3}"/>`;

// спящий в кровати (вид сбоку): голова на подушке, одеяло
function sleeper(x, y, s, o = {}) {
  return `<g transform="translate(${x},${y}) scale(${s})"><rect x="-260" y="-40" width="520" height="150" rx="20" fill="${o.bed || '#2a3042'}"/><rect x="-250" y="-90" width="150" height="80" rx="30" fill="#cfd6e4"/><g transform="translate(-170,-60) rotate(-90) scale(.42)"><g transform="translate(0,420)">${person({ who: o.who || 'kid', eyes: o.eyes || 'closed', mouth: o.mouth || 'flat', legs: false, armL: 10, armR: 10, ...(o.p || {}) })}</g></g><path d="M-130,-70 Q60,-120 260,-60 L260,30 L-130,30Z" fill="${o.blanket || '#4a5a86'}"/></g>`;
}
// спальня: wall, окно, шкаф, дверь
function bedroomBase(lit, o = {}) {
  const wall = lit ? '#5e6478' : '#141823';
  return `<rect width="${W}" height="${H}" fill="${wall}"/><rect y="1000" width="${W}" height="280" fill="${lit ? '#3e3a40' : '#0c0e14'}"/>
    <rect x="${o.winX ?? 260}" y="220" width="200" height="260" fill="${lit ? '#9fb7d9' : '#1d2a44'}" stroke="#05070c" stroke-width="10"/><circle cx="${(o.winX ?? 260) + 140}" cy="290" r="26" fill="#dfe6f2" opacity="${lit ? 0 : .9}"/>
    <rect x="560" y="300" width="170" height="720" fill="${lit ? '#6b5442' : '#1c1612'}" stroke="#05070c" stroke-width="8"/><line x1="645" y1="300" x2="645" y2="1020" stroke="#05070c" stroke-width="6"/>
    <rect x="-10" y="330" width="150" height="690" fill="${lit ? '#4a3a2c' : '#120e0b'}" stroke="#05070c" stroke-width="8"/>`;
}

SC.bedroom = (lt, P) => {
  const lit = clamp(kfr(P.lit, lt, P).v ?? 0);
  let s = bedroomBase(lit > .5);
  const K = kfr(P.kid, lt, P);
  if (K.sleep !== false) s += sleeper(330, 960, 1, { eyes: K.eyes || 'closed' });
  if (!lit) s += `<path d="M400,480 L520,480 L620,1000 L240,1000Z" fill="#a8b8d8" opacity=".07"/>`;
  return { bg: s, dark: lit ? 0 : .2 };
};
// «фото» из галереи: вспышка, зерно, дата. dist: 0 — от двери, 1 — середина, 2 — со спины, 3 — ухо, 4 — двое из шкафа
SC.photo = (lt, P) => {
  const d = P.dist ?? 0;
  let inner = '';
  if (d === 0 || d === 1) {
    const sc = d === 0 ? .7 : 1.25;
    const steps = d === 1 ? [0, 1, 2, 3].map(i => `<ellipse cx="${300 + i * 40 + (i % 2) * 30}" cy="${1180 - i * 50}" rx="20" ry="34" fill="#3a5a7a" opacity=".6" transform="rotate(-15 ${300 + i * 40} ${1180 - i * 50})"/>`).join('') : '';
    inner = `<g transform="translate(360,700) scale(${sc}) translate(-360,-700)">${bedroomBase(false)}${sleeper(330, 960, 1, {})}${steps}</g>`;
  } else if (d === 2) {
    inner = `${bedroomBase(false, { winX: 120 })}<g transform="translate(330,1260) scale(1.2)">${person({ who: 'kid', eyes: 'normal', mouth: 'flat', look: [0, -1], armL: -40, armR: -40, legs: false })}</g><ellipse cx="330" cy="760" rx="120" ry="140" fill="#1a1d26"/><path d="M230,700 Q330,600 430,700" fill="#1a1d26"/><rect x="290" y="860" width="80" height="40" rx="8" fill="#6ea8ff" opacity=".8"/>`;
  } else if (d === 3) {
    inner = `<rect width="${W}" height="${H}" fill="#0c0e14"/><g transform="translate(330,1500) scale(3.2)">${person({ who: 'kid', eyes: 'closed', mouth: 'flat', legs: false })}</g><rect x="0" y="0" width="${W}" height="${H}" fill="#cfd6e4" opacity=".05"/>`;
  } else if (d === 4) {
    inner = `<rect width="${W}" height="${H}" fill="#0c0e14"/><rect y="760" width="${W}" height="520" fill="#14110e"/>${sleeper(330, 860, .9, { blanket: '#4a5a86' })}${sleeper(380, 1100, .9, { who: 'den', blanket: '#7a5a3a' })}<path d="M0,0 L170,0 L130,${H} L0,${H}Z M720,0 L560,0 L600,${H} L720,${H}Z" fill="#050403"/>`;
  }
  const fl = 1 - seg(lt, 0, .35);
  let s = `<rect width="${W}" height="${H}" fill="#000"/><g>${inner}</g>`;
  s += `<defs><radialGradient id="fls" cx=".5" cy=".55" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#fls)"/>`;
  s += grain(lt, .14);
  s += `<rect width="${W}" height="110" fill="#000" opacity=".75"/><text x="40" y="70" font-size="26" font-weight="700" fill="#e9ecef">‹ Галерея</text><text x="680" y="70" font-size="26" font-weight="700" fill="#e9ecef" text-anchor="end">${esc(P.stamp || 'Сегодня, 03:14')}</text>`;
  s += `<text x="680" y="1180" font-size="34" font-weight="800" fill="#ffb347" text-anchor="end" font-family="JetBrains Mono" opacity=".85">${esc(P.date || '03:14')}</text>`;
  if (fl > 0) s += `<rect width="${W}" height="${H}" fill="#fff" opacity="${fl}"/>`;
  return { bg: s, dark: 0 };
};
SC.gallery = (lt, P) => {
  let s = `<rect width="${W}" height="${H}" fill="#0b0c10"/><text x="40" y="150" font-size="44" font-weight="900" fill="#fff">Галерея</text><text x="40" y="196" font-size="24" fill="#8a92a6">${esc(P.sub || 'Недавние')}</text>`;
  const cols = ['#f4a261', '#2a9d8f', '#e9c46a', '#8ab17d', '#e76f51', '#74c0fc', '#f783ac', '#b197fc', '#ffd43b'];
  const nNew = P.nNew ?? 1;
  for (let i = 0; i < 15; i++) {
    const x = 20 + (i % 3) * 230, y = 240 + Math.floor(i / 3) * 230, isNew = i < nNew;
    s += `<rect x="${x}" y="${y}" width="220" height="220" fill="${isNew ? '#1a1d26' : cols[i % 9]}" opacity="${isNew ? 1 : .55}"/>`;
    if (isNew) { const p = pop(lt, rt(P, P.at ?? .4) + i * .3, .3); s += `<g transform="translate(${x + 110},${y + 110}) scale(${p})"><rect x="-110" y="-110" width="220" height="220" fill="#1a1d26" stroke="${HRED}" stroke-width="5"/><rect x="-60" y="10" width="120" height="40" rx="8" fill="#2a3042"/><circle cx="-40" cy="10" r="16" fill="#cfd6e4" opacity=".7"/><text x="0" y="-60" font-size="22" font-weight="800" fill="${HRED}" text-anchor="middle" font-family="JetBrains Mono">03:14</text></g>`; }
  }
  return { bg: s + grain(lt, .05), dark: 0 };
};
SC.nightcam = (lt, P) => {
  const G = kfr(P.glitch, lt, P), Hd = clamp(kfr(P.hand, lt, P).v ?? 0), blk = kfr(P.black, lt, P).v;
  let inner = `${bedroomBase(true)}${sleeper(330, 960, 1, {})}`;
  if (Hd > 0) inner += `<g transform="translate(${720 - Hd * 360},${520 - Hd * 120}) rotate(${-30 + Hd * 20}) scale(${.6 + Hd * 1.6})"><path d="M0,0 L120,-10 L130,20 L0,40Z" fill="#e8e6dc"/>${[-26, -12, 2, 16].map((y, i) => `<rect x="110" y="${y - 6}" width="${90 + i * 8}" height="14" rx="7" fill="#e8e6dc" transform="rotate(${-8 + i * 5} 110 ${y})"/>`).join('')}<rect x="-200" y="2" width="210" height="34" fill="#e8e6dc"/></g>`;
  let s = `<rect width="${W}" height="${H}" fill="#000"/><g opacity=".95">${inner}</g><rect width="${W}" height="${H}" fill="#1fbf4a" style="mix-blend-mode:multiply" opacity=".9"/><rect width="${W}" height="${H}" fill="#0a3a12" opacity=".35"/>`;
  s += grain(lt, .18);
  for (let i = 0; i < 40; i++) s += `<rect x="0" y="${i * 32 + (lt * 40) % 32}" width="${W}" height="2" fill="#000" opacity=".18"/>`;
  if (G.on) for (let i = 0; i < 14; i++) { const y = rnd(i + Math.floor(lt * 30)) * H; s += `<rect x="${(rnd(i * 3 + Math.floor(lt * 30)) - .5) * 80}" y="${y}" width="${W}" height="${10 + rnd(i) * 40}" fill="${['#fff', '#0f0', '#000'][i % 3]}" opacity=".35"/>`; }
  let a = hm(P.clock?.[0] || '03:13'), b = hm(P.clock?.[1] || '03:14'); if (b < a) b += 1440;
  const secs = lerp(a * 60 + (P.sec0 ?? 50), b * 60 + (P.sec1 ?? 5), seg(lt, 0, P.d)); const hh = Math.floor(secs / 3600) % 24, mm = Math.floor(secs / 60) % 60, ss = Math.floor(secs) % 60;
  s += `<circle cx="60" cy="150" r="14" fill="#ff3b3b" opacity="${Math.sin(lt * 6) > 0 ? 1 : .2}"/><text x="88" y="162" font-size="32" font-weight="800" fill="#e9ffe9" font-family="JetBrains Mono">REC</text><text x="680" y="1180" font-size="34" font-weight="800" fill="#e9ffe9" text-anchor="end" font-family="JetBrains Mono">${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}</text>`;
  if (blk) s += `<rect width="${W}" height="${H}" fill="#000"/>`;
  return { bg: s, dark: 0 };
};
SC.scare = (lt, P) => {
  const z = 1 + eo(seg(lt, 0, .22)) * 1.5, jx = (rnd(Math.floor(lt * 40)) - .5) * 18, jy = (rnd(Math.floor(lt * 40) + 7) - .5) * 18;
  let s = `<rect width="${W}" height="${H}" fill="#000"/><defs><radialGradient id="fc" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#e9e6dc"/><stop offset=".7" stop-color="#a8a497"/><stop offset="1" stop-color="#3a3832"/></radialGradient><radialGradient id="sock"><stop offset=".6" stop-color="#000"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>`;
  s += `<g transform="translate(${360 + jx},${640 + jy}) scale(${z})">
    <path d="M0,-260 Q150,-250 160,-60 Q165,120 90,230 Q40,290 0,292 Q-40,290 -90,230 Q-165,120 -160,-60 Q-150,-250 0,-260Z" fill="url(#fc)"/>
    <path d="M-150,40 Q-110,120 -60,150 M150,40 Q110,120 60,150" fill="none" stroke="#6b675c" stroke-width="10" opacity=".6"/>
    <ellipse cx="-62" cy="-50" rx="58" ry="72" fill="url(#sock)"/><ellipse cx="62" cy="-50" rx="58" ry="72" fill="url(#sock)"/>
    <ellipse cx="-62" cy="-48" rx="40" ry="54" fill="#000"/><ellipse cx="62" cy="-48" rx="40" ry="54" fill="#000"/>
    <circle cx="-58" cy="-44" r="6" fill="#f1f1e8"/><circle cx="58" cy="-44" r="6" fill="#f1f1e8"/>
    <path d="M-70,10 Q-74,70 -66,120 M70,10 Q74,70 66,120" stroke="#000" stroke-width="6" opacity=".5"/>
    <path d="M-120,140 Q0,230 120,140 Q0,200 -120,140Z" fill="#000"/>
    ${[-90, -60, -30, 0, 30, 60, 90].map(x => `<line x1="${x}" y1="${150 + Math.abs(x) * .05}" x2="${x}" y2="${185 - Math.abs(x) * .35}" stroke="#d8d4c8" stroke-width="5"/>`).join('')}
  </g><rect width="${W}" height="${H}" fill="#7a0000" opacity="${.12 + .1 * Math.sin(lt * 30)}"/>`;
  return { bg: s + grain(lt, .05), dark: 0 };
};
SC.denRoom = (lt, P) => {
  const aj = clamp(kfr(P.ajar, lt, P).v ?? .12), eye = kfr(P.eye, lt, P).on, flash = kfr(P.flashAt, lt, P).on, torch = kfr(P.torch, lt, P).on;
  let s = `<rect width="${W}" height="${H}" fill="${torch ? '#1a1712' : '#0d0f15'}"/><rect y="980" width="${W}" height="300" fill="#0a0b0f"/>`;
  // шкаф справа
  const wx = 330, ww = 360, wy = 260, wh = 760;
  const gap = aj * ww * .9;
  s += `<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" fill="#2a2018" stroke="#05070c" stroke-width="8"/>`;
  s += `<rect x="${wx + 10}" y="${wy + 10}" width="${gap}" height="${wh - 20}" fill="${torch ? '#3a3226' : '#020203'}"/>`;
  if (torch) { s += [0, 1, 2].map(i => `<path d="M${wx + 40 + i * 90},${wy + 60} L${wx + 20 + i * 90},${wy + 420} L${wx + 110 + i * 90},${wy + 420} L${wx + 90 + i * 90},${wy + 60}Z" fill="${['#4a5a86', '#7a5a3a', '#3a5a4a'][i]}" opacity="${gap > (i + 1) * 90 ? 1 : 0}"/>`).join(''); if (gap > 150) s += `<g transform="translate(${wx + 170},${wy + 500})"><line x1="0" y1="-80" x2="0" y2="-20" stroke="#888" stroke-width="4"/><rect x="-60" y="-20" width="120" height="80" rx="10" fill="#2a2a2a" stroke="#000" stroke-width="5"/><circle cx="0" cy="20" r="28" fill="#111" stroke="#666" stroke-width="5"/><rect x="30" y="-36" width="30" height="16" fill="#555"/></g>`; }
  if (eye && !torch) s += `<ellipse cx="${wx + 10 + gap / 2}" cy="${wy + 300}" rx="${Math.max(6, gap * .35)}" ry="11" fill="#e8e6dc"/><circle cx="${wx + 10 + gap / 2}" cy="${wy + 300}" r="6" fill="#050505"/>`;
  s += `<rect x="${wx + 10 + gap}" y="${wy + 10}" width="${ww - 20 - gap * .3}" height="${wh - 20}" fill="#3a2c20" stroke="#05070c" stroke-width="6"/><circle cx="${wx + 40 + gap}" cy="${wy + 380}" r="10" fill="#c9b48a"/>`;
  if (flash) s += `<rect x="${wx + 10}" y="${wy + 10}" width="${gap}" height="${wh - 20}" fill="#fff"/><rect width="${W}" height="${H}" fill="#fff" opacity=".35"/>`;
  // матрасы и спящие
  s += sleeper(240, 1100, .75, { eyes: kfr(P.kidEyes, lt, P).e || 'closed', p: kfr(P.kidP, lt, P) })+ (P.denGone ? `<g transform="translate(260,1230) scale(.75)"><rect x="-260" y="-40" width="520" height="150" rx="20" fill="#2a3042"/><path d="M-130,-10 Q60,-40 260,10 L260,30 L-130,30Z" fill="#7a5a3a"/></g><g transform="translate(300,1180) rotate(30)"><rect x="-6" y="-60" width="12" height="90" fill="#8a5a3a"/><rect x="-30" y="-80" width="60" height="30" rx="6" fill="#6b7280"/></g>` : sleeper(260, 1230, .75, { who: 'den', blanket: '#7a5a3a', eyes: kfr(P.denEyes, lt, P).e || 'closed' }));
  if (torch) s += `<path d="M120,1100 L${wx + 20},${wy} L${wx + ww},${wy + wh} Z" fill="#fff5c8" opacity=".14"/>`;
  return { bg: s, dark: torch ? 0 : .25 };
};
SC.oldcam = (lt, P) => {
  let s = `<rect width="${W}" height="${H}" fill="#0a0907"/><circle cx="360" cy="640" r="380" fill="#fff5c8" opacity=".06"/>`;
  s += `<g transform="translate(360,640) scale(2.2)"><rect x="-120" y="-70" width="240" height="140" rx="16" fill="#2a2a2a" stroke="#000" stroke-width="5"/><rect x="-120" y="-70" width="240" height="30" rx="10" fill="#444"/><circle cx="0" cy="15" r="52" fill="#111" stroke="#777" stroke-width="7"/><circle cx="0" cy="15" r="28" fill="#1d2a44"/><circle cx="-10" cy="5" r="8" fill="#fff" opacity=".4"/><rect x="60" y="-95" width="50" height="28" rx="4" fill="#555" stroke="#000" stroke-width="3"/><rect x="-100" y="-62" width="56" height="20" rx="4" fill="#0b0b0b"/><text x="-72" y="-46" font-size="16" font-weight="800" fill="${HRED}" text-anchor="middle" font-family="JetBrains Mono">${esc(P.count ?? '1')}</text></g>`;
  if (P.ring) s += `<circle cx="${360 - 72 * 2.2}" cy="${640 - 52 * 2.2}" r="${60 + Math.sin(lt * 5) * 6}" fill="none" stroke="${HRED}" stroke-width="6"/>`;
  return { bg: s + grain(lt, .1), dark: 0 };
};
SC.phoneFrom = (lt, P) => {
  const r = SC.phone(lt, P);
  r.bg = r.bg.replace('Неизвестный номер', esc(P.from || 'Неизвестный номер'));
  return r;
};

// ---------------- СЕРИИ ----------------
const N2 = t => ['h_n', t];
const h2 = (scene, seq, o = {}) => Object.assign({ type: 'hor', scene, seq }, o);

const HORROR2 = [
{ n: 511, title: 'Фото в 3:14', mood: 'horror', shots: [
  h2('photo', [N2('Это фото появилось в твоей галерее *сегодня ночью*.'), N2('Время съёмки — *три часа четырнадцать минут*.'), N2('В это время ты *спал*. Один. Дома.')], { dist: 0, sfx: [[0, 'shutter'], [0, 'drone', { d: 12 }]] }),
  h2('bedroom', [N2('Если ты смотришь это один — *обернись*.')], { lit: [[0, { v: 0 }]], d: 6, tail: 3.2, vig: .97, sfx: [[0, 'heart', { d: 6 }]] }),
  h2('scare', [], { d: 1.1, sfx: [[0, 'stinger']] }),
  h2('title', [N2('…Ладно. *Слушай*.')], { series: 'ХОРРОР-ИСТОРИЯ', kicker: 'Часть 1', name: 'Фото в 3:14', noSubs: false, sfx: [[.1, 'drone', { d: 4 }]] }),
  h2('bedroom', [N2('Утро. Ты листаешь галерею и находишь фото, которого *не делал*.'), N2('Твоя комната. Темнота. И ты — *спишь* в кровати.')], { lit: [[0, { v: 1 }]], time: '07:40', kid: [[0, { sleep: false }]], chars: [{ who: 'kid', x: 330, y: 1300, s: 1, k: [[0, { eyes: 'normal', mouth: 'flat', look: [0, .8], armL: -40, armR: -40 }], ['v1', { eyes: 'wide', mouth: 'o' }]] }] }),
  h2('photo', [N2('Снято от *двери*. Со вспышкой.'), N2('Но вспышка тебя *не разбудила*.'), N2('Ты пересматриваешь его десять раз. Это *точно* твоя комната.')], { dist: 0, sfx: [[0, 'shutter']] }),
  h2('bedroom', [N2('Ты решаешь, что это глюк. Может, телефон сам сделал снимок.'), N2('Но телефон всю ночь *заряжался* на столе. Экраном вниз.'), N2('Ты удаляешь фото. Через минуту оно *снова* в галерее.')], { lit: [[0, { v: 1 }]], time: '07:42', kid: [[0, { sleep: false }]], chars: [{ who: 'kid', x: 330, y: 1300, s: 1, k: [[0, { eyes: 'normal', mouth: 'smirk', look: [.6, -.3] }], ['v1', { eyes: 'wide', mouth: 'flat', sweat: true }]] }] }),
  h2('gallery', [N2('Следующей ночью — *ещё одно* фото. Снова три четырнадцать.')], { nNew: 2, at: 1, sub: 'Сегодня', sfx: [[1.3, 'pop']] }),
  h2('photo', [N2('В этот раз снято из *середины* комнаты.'), N2('Кто-то стоял в *шаге* от твоей кровати.'), N2('А на полу у кровати — *мокрые следы*. Босые.')], { dist: 1, stamp: 'Вчера, 03:14', sfx: [[0, 'shutter'], [0, 'heart', { d: 5 }]], mood: 'tense' }),
  h2('bedroom', [N2('Ты решаешь *поймать* его.'), N2('Ставишь телефон на шкаф, включаешь запись видео и ложишься.'), N2('Свет не выключаешь. *Не можешь*.')], { lit: [[0, { v: 1 }]], time: '00:30', kid: [[0, { eyes: 'normal' }], ['v2', { eyes: 'closed' }]] }),
  h2('bedroom', [N2('Час ночи. Два. Ты *почти* засыпаешь.'), N2('Три *тринадцать*.')], { lit: [[0, { v: 1 }]], time: ['01:00', '03:13'], sfx: [[0, 'hum', { d: 6 }]] }),
  h2('bedroom', [N2('Свет в комнате *гаснет* сам.')], { lit: [[0, { v: 1 }], [.6, { v: 0 }]], time: '03:13', flicker: [[.1, .6]], sfx: [[.6, 'switch'], [.7, 'drone', { d: 4 }]] }),
  h2('nightcam', [N2('Утром ты смотришь *запись*.'), N2('Смотреть на себя спящего — *странно*. Будто смотришь чужими глазами.'), N2('Вот ты спишь. Таймер бежит. Три тринадцать, пятьдесят восемь…')], { clock: ['03:13', '03:13'], sec0: 40, sec1: 58, sfx: [[0, 'hum', { d: 8 }]] }),
  h2('nightcam', [N2('Запись начинает *шипеть*.'), ['h_whis', 'Я знаю, что ты *смотришь*.']], { clock: ['03:14', '03:14'], sec0: 0, sec1: 6, glitch: [[.3, { on: true }], [1.4, { on: false }], ['v1', { on: true }], ['v1+1.6', { on: false }]], sfx: [[.3, 'static', { d: 1.1 }], ['v1', 'static', { d: 1.6 }], ['v1', 'whisper']], mood: 'tense' }),
  h2('nightcam', [N2('Из темноты к камере тянется рука. *Бледная*. С длинными пальцами.'), N2('Экран *чернеет*.')], { clock: ['03:14', '03:14'], sec0: 6, sec1: 12, hand: [[0, { v: 0 }], [.6, { v: .3 }], ['v1', { v: 1 }]], black: [['v1+.4', { v: 1 }]], sfx: [[0, 'heart', { d: 5 }], ['v1+.4', 'stinger']] }),
  h2('bedroom', [N2('Ты сидишь на кровати с телефоном в руках.'), N2('И телефон *щёлкает* затвором. Сам.')], { lit: [[0, { v: 1 }]], time: '07:51', kid: [[0, { sleep: false }]], chars: [{ who: 'kid', x: 330, y: 1300, s: 1, k: [[0, { eyes: 'tired', mouth: 'flat', look: [0, .8], armL: -40, armR: -40 }], ['v1', { eyes: 'wide', mouth: 'o' }]] }], sfx: [['v1+1.2', 'shutter']] }),
  h2('gallery', [N2('В галерее — новое фото. Снято *только что*.')], { nNew: 1, at: .8, sub: 'Только что', sfx: [[.8, 'pop']] }),
  h2('photo', [N2('На нём ты. *Со спины*. Сидишь на кровати и смотришь в телефон.'), N2('Снято из угла комнаты. Из того угла, где *никого нет*.'), N2('Ты медленно поворачиваешь голову к углу.'), N2('Угол *пустой*.')], { dist: 2, stamp: 'Только что', date: '07:52', sfx: [[0, 'shutter'], [0, 'drone', { d: 10 }]], mood: 'tense' }),
  h2('scare', [], { d: 1.2, sfx: [[0, 'stinger']] }),
  h2('end', [N2('Продолжение *следует*.')], { name: 'Продолжение следует', sub: 'Часть 2 — «Шкаф»', noSubs: true }),
]},
{ n: 512, title: 'Шкаф', mood: 'horror', shots: [
  h2('photo', [N2('На этом фото спите *вы с Дэном*.'), N2('И снято оно *изнутри шкафа*.'), N2('Шкафа, который стоит в метре от твоей *подушки*.')], { dist: 4, stamp: 'Сегодня, 03:14', sfx: [[0, 'shutter'], [0, 'drone', { d: 12 }]] }),
  h2('title', [N2('Фото в три четырнадцать. Часть вторая. *Шкаф*.')], { series: 'ФОТО В 3:14', kicker: 'Часть 2', name: 'Шкаф', noSubs: true, sfx: [[.1, 'stinger']] }),
  h2('gallery', [N2('После той ночи ты не можешь спать дома.'), N2('Ты менял пароль, удалял облако, на ночь *прятал* телефон в ящик.'), N2('Каждую ночь в три четырнадцать — новое фото. *Всё ближе*.')], { nNew: 6, at: 'v2', sub: 'Эта неделя', sfx: [['v2', 'pop'], ['v2+.3', 'pop'], ['v2+.6', 'pop']] }),
  h2('photo', [N2('На последнем — *твоё лицо*. Крупно.'), N2('Будто снимали в *сантиметре* от тебя. Наклонившись.')], { dist: 3, stamp: 'Вчера, 03:14', sfx: [[0, 'shutter'], [0, 'heart', { d: 5 }]], mood: 'tense' }),
  h2('hall', [N2('Ты показываешь всё *Дэну*.'), ['B', 'Да тебе кто-то облако взломал. Ночуй у меня, *проверим*.'], ['A', 'Только телефон я *выключу*.']], { time: '18:20', A: 'h_kid', B: 'h_den', lit: [[0, { v: 1 }]], bubbleY: 330, chars: [{ who: 'kid', x: 170, y: 1320, s: .9, k: [[0, { eyes: 'tired', mouth: 'flat', look: [.8, 0] }]] }, { who: 'den', x: 560, y: 1320, s: .9, k: [[0, { eyes: 'normal', mouth: 'smirk', look: [-.8, 0] }]] }] }),
  h2('denRoom', [N2('Ночью вы ложитесь на полу у Дэна. Телефон *выключен* и лежит в рюкзаке.'), N2('Дэн засыпает через пять минут. А ты смотришь на шкаф.'), N2('Дверца приоткрыта на *ладонь*.'), N2('Где-то в квартире *тикают* часы.')], { time: '23:50', ajar: [[0, { v: .12 }]], kidEyes: [[0, { e: 'normal' }]] }),
  h2('denRoom', [N2('Три *тринадцать*.'), N2('Ты закрываешь глаза и считаешь до шестидесяти.')], { time: '03:13', ajar: [[0, { v: .12 }]], kidEyes: [[0, { e: 'normal' }], ['v1', { e: 'closed' }]], sfx: [[0, 'heart', { d: 7 }]] }),
  h2('denRoom', [N2('*Щелчок*. И вспышка — из щели шкафа.')], { time: '03:14', ajar: [[0, { v: .12 }]], flashAt: [[.6, { on: true }], [.75, { on: false }]], shake: [.6], kidEyes: [[0, { e: 'closed' }], [.8, { e: 'wide' }]], sfx: [[.6, 'shutter'], [.65, 'stinger']] }),
  h2('phoneFrom', [N2('Твой выключенный телефон в рюкзаке *загорается*.'), N2('Ты *точно* помнишь, что выключал его.'), N2('Новое фото. Вы с Дэном. Снято *из шкафа*.')], { time: '03:14', from: 'Галерея', msgs: [{ text: 'Новое фото · 03:14', at: 'v2' }], sfx: [[.3, 'buzz', { d: 1 }], ['v2', 'pop']] }),
  h2('denRoom', [N2('Ты медленно поворачиваешь голову к шкафу.'), N2('В щели — темнота. А потом в темноте *открывается глаз*.'), N2('Он смотрит прямо на тебя. И *не моргает*.')], { time: '03:15', ajar: [[0, { v: .14 }]], eye: [['v1+1.2', { on: true }]], kidEyes: [[0, { e: 'wide' }]], zoom: [1, 1.25, 520, 560], sfx: [['v1+1.2', 'stinger'], [0, 'heart', { d: 8 }]], mood: 'tense' }),
  h2('denRoom', [['A', 'Дэн. Дэн, проснись. *Не шевелись*.'], ['B', 'Ты чего?..']], { time: '03:15', A: 'h_kid', B: 'h_den', ajar: [[0, { v: .14 }]], eye: [[0, { on: true }]], kidEyes: [[0, { e: 'wide' }]], denEyes: [['v1', { e: 'normal' }]], bubbleY: 300 }),
  h2('denRoom', [N2('Дверца шкафа начинает *открываться*. Сама. Очень медленно.'), N2('Скрип такой тихий, что слышно, как у Дэна *стучат зубы*.')], { time: '03:15', ajar: [[0, { v: .14 }], [1, { v: .2 }], ['v1+2', { v: .45 }]], kidEyes: [[0, { e: 'wide' }]], denEyes: [[0, { e: 'wide' }]], sfx: [[1, 'creak'], ['v1', 'creak']] }),
  h2('denRoom', [N2('Ты хватаешь телефон Дэна, включаешь фонарик и светишь *прямо в шкаф*.')], { time: '03:16', ajar: [[0, { v: .45 }], [1.4, { v: .9 }]], torch: [[1.2, { on: true }]], kidEyes: [[0, { e: 'wide' }]], denEyes: [[0, { e: 'wide' }]], sfx: [[1.2, 'click']] }),
  h2('denRoom', [N2('Внутри — только *куртки*.'), N2('И старый плёночный фотоаппарат. Он висит на вешалке, как *одежда*.')], { time: '03:16', ajar: [[0, { v: .9 }]], torch: [[0, { on: true }]], kidEyes: [[0, { e: 'wide' }]], denEyes: [[0, { e: 'wide' }]] }),
  h2('oldcam', [N2('Значит, все эти ночи тебя снимали *на него*.'), N2('На счётчике кадров — *единица*.'), N2('Остался *один* кадр.')], { count: '1', ring: true, sfx: [['v2', 'tick'], ['v2', 'drone', { d: 5 }]] }),
  h2('phoneFrom', [N2('Телефон вибрирует. Сообщение. *С твоего же номера*.'), N2('«Следующее фото будет *последним*».'), N2('А из шкафа, из-за курток, кто-то *тихо смеётся*.')], { time: '03:17', from: 'Мой номер', msgs: [{ text: 'Следующее фото будет последним.', at: 'v1' }], sfx: [[.2, 'buzz', { d: 1.2 }], ['v1', 'stinger'], ['v2', 'whisper']], mood: 'tense' }),
  h2('scare', [], { d: 1.2, sfx: [[0, 'stinger']] }),
  h2('end', [N2('Продолжение *следует*.')], { name: 'Продолжение следует', sub: 'Часть 3 — скоро', noSubs: true }),
]},
];
HORROR2.forEach(f => { f.voiced = true; f.shots.forEach(s => { s.d = s.d || 3; s.lead = s.lead ?? .6; s.gap = s.gap ?? .6; s.tail = s.tail ?? 1.1; s.hlCol = HRED; if (s.scene === 'title' && s.noSubs === undefined) s.noSubs = true; }); });
if (typeof module !== 'undefined') module.exports = { HORROR2 };
