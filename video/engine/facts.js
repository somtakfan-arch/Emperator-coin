// Отдельные ролики «факт / полезное». Ведущий — герой сериала.
// Подключается после engine.js и episodes.js. Номера роликов: 101–115.

// ---------------- РИСУНКИ (центр в 0,0, размер ~300) ----------------
const ART = {
  door: () => `<rect x="-110" y="-190" width="220" height="380" rx="8" fill="#6b4a33" stroke="${OL}" stroke-width="9"/><rect x="-86" y="-160" width="172" height="140" rx="6" fill="#7d5a40" stroke="${OL}" stroke-width="5"/><rect x="-86" y="10" width="172" height="150" rx="6" fill="#7d5a40" stroke="${OL}" stroke-width="5"/><circle cx="70" cy="0" r="14" fill="#e6c36a" stroke="${OL}" stroke-width="5"/>`,
  doorBack: () => ART.door() + `<path d="M150,-40 L250,-40 L250,-80 L320,0 L250,80 L250,40 L150,40Z" transform="scale(-1,1) translate(-20,0)" fill="${YEL}" stroke="${OL}" stroke-width="7" stroke-linejoin="round"/>`,
  brain: () => `<path d="M-150,10 Q-170,-90 -90,-130 Q-50,-180 10,-150 Q80,-185 120,-120 Q185,-90 160,0 Q185,80 110,120 Q60,170 0,140 Q-60,170 -110,120 Q-180,90 -150,10Z" fill="#f4a6b8" stroke="${OL}" stroke-width="9"/><path d="M0,-150 Q-20,-60 10,0 Q-20,70 0,140 M-90,-90 Q-40,-60 -70,-10 Q-100,40 -60,80 M90,-90 Q50,-50 80,0 Q110,50 70,90" fill="none" stroke="#c96a84" stroke-width="7" stroke-linecap="round"/>`,
  eye: () => `<path d="M-180,0 Q0,-150 180,0 Q0,150 -180,0Z" fill="#fff" stroke="${OL}" stroke-width="9"/><circle r="70" fill="#4a9fd8" stroke="${OL}" stroke-width="7"/><circle r="32" fill="${OL}"/><circle cx="-22" cy="-24" r="14" fill="#fff"/>`,
  phone: () => `<rect x="-95" y="-180" width="190" height="360" rx="30" fill="#0b0d12" stroke="${OL}" stroke-width="8"/><rect x="-80" y="-160" width="160" height="320" rx="20" fill="#5aa9ff"/><rect x="-30" y="-172" width="60" height="12" rx="6" fill="#0b0d12"/>${[0, 1, 2, 3].map(i => `<rect x="-60" y="${-120 + i * 60}" width="${120 - i * 18}" height="22" rx="11" fill="#fff" opacity=".85"/>`).join('')}`,
  honey: () => `<path d="M-120,-90 L120,-90 L130,150 Q130,180 100,180 L-100,180 Q-130,180 -130,150Z" fill="#f2a516" stroke="${OL}" stroke-width="9"/><rect x="-135" y="-150" width="270" height="70" rx="14" fill="#c97f2b" stroke="${OL}" stroke-width="9"/><rect x="-80" y="0" width="160" height="90" rx="12" fill="#fff4d6" stroke="${OL}" stroke-width="6"/><text y="60" font-size="44" font-weight="900" fill="#8a5a12" text-anchor="middle">МЁД</text><path d="M-120,-80 Q-110,-30 -95,-80 Q-80,-20 -60,-80" fill="#f2a516" stroke="${OL}" stroke-width="6"/>`,
  pyramid: () => `<rect x="-260" y="140" width="520" height="40" fill="#d9b26b"/><path d="M-220,150 L0,-170 L220,150Z" fill="#e8c27a" stroke="${OL}" stroke-width="9" stroke-linejoin="round"/><path d="M0,-170 L60,150 L220,150Z" fill="#c9a05a" stroke="${OL}" stroke-width="6" stroke-linejoin="round"/><circle cx="170" cy="-150" r="40" fill="#ffd36b"/>`,
  octopus: () => { let s = ''; for (let i = 0; i < 8; i++) { const x = -140 + i * 40; s += `<path d="M${x},40 Q${x - 20 + (i % 2) * 40},140 ${x + (i % 2 ? 30 : -30)},190" fill="none" stroke="${OL}" stroke-width="40" stroke-linecap="round"/><path d="M${x},40 Q${x - 20 + (i % 2) * 40},140 ${x + (i % 2 ? 30 : -30)},190" fill="none" stroke="#e06c9f" stroke-width="28" stroke-linecap="round"/>`; } return s + `<ellipse cy="-40" rx="150" ry="140" fill="#e06c9f" stroke="${OL}" stroke-width="9"/><circle cx="-50" cy="-20" r="26" fill="#fff" stroke="${OL}" stroke-width="6"/><circle cx="50" cy="-20" r="26" fill="#fff" stroke="${OL}" stroke-width="6"/><circle cx="-46" cy="-16" r="11" fill="${OL}"/><circle cx="54" cy="-16" r="11" fill="${OL}"/>`; },
  hearts: () => { const h = (x, y, s, c) => `<path transform="translate(${x},${y}) scale(${s})" d="M0,40 C-70,-10 -60,-80 -10,-70 Q0,-66 0,-50 Q0,-66 10,-70 C60,-80 70,-10 0,40Z" fill="${c}" stroke="${OL}" stroke-width="6"/>`; return h(-130, 0, 1.3, '#4a9fd8') + h(130, 0, 1.3, '#4a9fd8') + h(0, -40, 1.8, '#3c7fd0'); },
  drop: () => `<path d="M0,-180 Q120,0 110,70 Q100,170 0,170 Q-100,170 -110,70 Q-120,0 0,-180Z" fill="#4aa3ff" stroke="${OL}" stroke-width="9"/><path d="M-50,40 Q-55,100 -10,120" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" opacity=".8"/><text y="90" font-size="60" font-weight="900" fill="#fff" text-anchor="middle">Cu</text>`,
  curve: () => `<rect x="-220" y="-170" width="440" height="340" rx="20" fill="#fff" stroke="${OL}" stroke-width="8"/><line x1="-180" y1="130" x2="190" y2="130" stroke="${OL}" stroke-width="6"/><line x1="-180" y1="130" x2="-180" y2="-140" stroke="${OL}" stroke-width="6"/><path d="M-180,-120 Q-140,40 -40,80 Q60,105 190,110" fill="none" stroke="${RED}" stroke-width="10" stroke-linecap="round"/><text x="-160" y="-130" font-size="24" font-weight="800" fill="#6b7385">память</text><text x="120" y="160" font-size="24" font-weight="800" fill="#6b7385">дни</text>`,
  battery: (lvl = .8, col = '#45e08a') => `<rect x="-100" y="-180" width="200" height="360" rx="26" fill="#1c1f27" stroke="${OL}" stroke-width="9"/><rect x="-40" y="-205" width="80" height="30" rx="8" fill="#1c1f27" stroke="${OL}" stroke-width="7"/><rect x="-78" y="${158 - 316 * lvl}" width="156" height="${316 * lvl}" rx="14" fill="${col}"/>`,
  banana: () => `<path d="M-170,-60 Q-120,150 120,110 Q170,100 180,60 Q60,90 -40,20 Q-110,-30 -130,-110Z" fill="#ffd43b" stroke="${OL}" stroke-width="9" stroke-linejoin="round"/><path d="M-135,-110 L-150,-150" stroke="#6b4a33" stroke-width="16" stroke-linecap="round"/><path d="M-100,0 Q-20,90 120,85" fill="none" stroke="#e0b100" stroke-width="7" stroke-linecap="round"/>`,
  atom: () => `<circle r="30" fill="#ffd43b" stroke="${OL}" stroke-width="7"/>${[0, 60, 120].map(a => `<ellipse rx="170" ry="60" fill="none" stroke="#7dd3fc" stroke-width="9" transform="rotate(${a})"/>`).join('')}${[0, 60, 120].map((a, i) => `<circle cx="170" r="16" fill="#f783ac" stroke="${OL}" stroke-width="5" transform="rotate(${a + i * 40})"/>`).join('')}`,
  shield: () => `<path d="M0,-180 L150,-120 Q150,90 0,180 Q-150,90 -150,-120Z" fill="#45e08a" stroke="${OL}" stroke-width="9" stroke-linejoin="round"/><path d="M-60,0 L-15,50 L70,-50" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>`,
  sun: () => { let s = ''; for (let i = 0; i < 12; i++) s += `<line x1="0" y1="-130" x2="0" y2="-175" stroke="#ffb703" stroke-width="14" stroke-linecap="round" transform="rotate(${i * 30})"/>`; return s + `<circle r="110" fill="#ffd36b" stroke="${OL}" stroke-width="8"/>`; },
  venus: () => `<circle r="150" fill="#e9b872" stroke="${OL}" stroke-width="9"/><path d="M-140,-50 Q-20,-80 140,-30 M-148,30 Q0,0 146,50 M-110,100 Q0,80 110,110" fill="none" stroke="#c98f4a" stroke-width="14" stroke-linecap="round"/>`,
  orbit: () => `<ellipse rx="200" ry="90" fill="none" stroke="#8b93a7" stroke-width="5" stroke-dasharray="14 10"/><g transform="scale(.45)">${ART.sun()}</g><g transform="translate(190,30) scale(.25)">${ART.venus()}</g>`,
  spin: () => `<g transform="scale(.8)">${ART.venus()}</g><path d="M-160,-60 A170,170 0 0 1 120,-120" fill="none" stroke="${YEL}" stroke-width="12" stroke-linecap="round"/><path d="M120,-120 l-40,-6 l26,34Z" fill="${YEL}" stroke="${OL}" stroke-width="4"/>`,
  stopwatch: () => `<rect x="-26" y="-215" width="52" height="40" rx="8" fill="#8b93a7" stroke="${OL}" stroke-width="7"/><circle r="170" fill="#fff" stroke="${OL}" stroke-width="10"/><path d="M0,0 L0,-170 A170,170 0 0 1 147,-85Z" fill="#ffc83d" opacity=".7"/><line y2="-130" stroke="${OL}" stroke-width="10" stroke-linecap="round" transform="rotate(60)"/><circle r="12" fill="${OL}"/>`,
  checklist: () => `<rect x="-150" y="-190" width="300" height="380" rx="18" fill="#fff" stroke="${OL}" stroke-width="9"/>${[0, 1, 2].map(i => `<rect x="-110" y="${-130 + i * 110}" width="50" height="50" rx="10" fill="#e9fbe9" stroke="${OL}" stroke-width="6"/><path d="M-100,${-105 + i * 110} l14,14 l26,-28" fill="none" stroke="${GREEN}" stroke-width="9" stroke-linecap="round"/><rect x="-40" y="${-115 + i * 110}" width="${150 - i * 20}" height="20" rx="10" fill="#d9dde6"/>`).join('')}`,
  tomato: () => `<circle cy="20" r="160" fill="#e5484d" stroke="${OL}" stroke-width="9"/><path d="M0,-140 l30,-40 l10,40 l40,-10 l-30,30 l-50,10 l-50,-10 l-30,-30 l40,10 l10,-40Z" fill="#2f9e44" stroke="${OL}" stroke-width="6" stroke-linejoin="round"/><ellipse cx="-70" cy="-30" rx="30" ry="50" fill="#fff" opacity=".35"/>`,
  timer: () => ART.tomato() + `<circle cy="30" r="90" fill="#fff" stroke="${OL}" stroke-width="7"/><line y1="30" y2="-40" stroke="${OL}" stroke-width="9" stroke-linecap="round"/><line y1="30" x2="45" y2="55" stroke="${OL}" stroke-width="9" stroke-linecap="round"/>`,
  plane: () => `<path d="M-220,0 Q-200,-40 -120,-40 L160,-40 Q230,-40 240,0 Q230,40 160,40 L-120,40 Q-200,40 -220,0Z" fill="#f3f4f7" stroke="${OL}" stroke-width="9"/><path d="M-20,-30 L-90,-160 L-40,-160 L70,-30Z M-20,30 L-90,160 L-40,160 L70,30Z" fill="#cfd8e3" stroke="${OL}" stroke-width="8" stroke-linejoin="round"/><path d="M-200,-20 L-240,-110 L-200,-110 L-150,-35Z" fill="#cfd8e3" stroke="${OL}" stroke-width="7" stroke-linejoin="round"/>${[0, 1, 2, 3, 4].map(i => `<circle cx="${100 - i * 50}" cy="-6" r="12" fill="#5aa9ff" stroke="${OL}" stroke-width="4"/>`).join('')}`,
  glass: () => `<path d="M-100,-170 L100,-170 L80,170 L-80,170Z" fill="#fff" fill-opacity=".3" stroke="${OL}" stroke-width="9" stroke-linejoin="round"/><path d="M-93,-90 L93,-90 L80,165 L-80,165Z" fill="#d6363c"/><rect x="40" y="-230" width="18" height="200" rx="9" fill="#f9a8d4" stroke="${OL}" stroke-width="5" transform="rotate(14)"/>`,
  salt: () => `<path d="M-80,-120 L80,-120 L100,170 L-100,170Z" fill="#f3f4f7" stroke="${OL}" stroke-width="9" stroke-linejoin="round"/><path d="M-80,-120 Q0,-210 80,-120Z" fill="#cfd3dc" stroke="${OL}" stroke-width="8"/>${[-30, 0, 30].map(x => `<circle cx="${x}" cy="-150" r="7" fill="${OL}"/>`).join('')}<text y="60" font-size="70" font-weight="900" fill="#6b7385" text-anchor="middle">S</text>`,
  shark: () => `<path d="M-230,20 Q-100,-110 120,-40 L200,-120 L180,-20 Q230,10 240,40 Q120,90 -80,70 Q-180,60 -230,20Z" fill="#7c93ad" stroke="${OL}" stroke-width="9" stroke-linejoin="round"/><path d="M-20,-75 L20,-170 L60,-55Z" fill="#7c93ad" stroke="${OL}" stroke-width="8" stroke-linejoin="round"/><path d="M-200,40 Q-80,70 60,60" fill="none" stroke="#e8eef5" stroke-width="22" stroke-linecap="round"/><circle cx="-150" cy="-5" r="10" fill="${OL}"/><path d="M-200,35 l14,12 l12,-12 l12,12 l12,-12" fill="#fff" stroke="${OL}" stroke-width="4"/>`,
  tree: () => `<rect x="-30" y="20" width="60" height="170" rx="10" fill="#8a5a3a" stroke="${OL}" stroke-width="8"/><circle cx="0" cy="-70" r="120" fill="#40c057" stroke="${OL}" stroke-width="9"/><circle cx="-90" cy="0" r="70" fill="#37b24d" stroke="${OL}" stroke-width="8"/><circle cx="90" cy="0" r="70" fill="#37b24d" stroke="${OL}" stroke-width="8"/>`,
  teeth: () => `<path d="M-200,-60 Q0,-160 200,-60 Q0,40 -200,-60Z" fill="#7a2b33" stroke="${OL}" stroke-width="8"/>${[...Array(9)].map((_, i) => `<path d="M${-170 + i * 40},${-80 + Math.abs(i - 4) * 6} l18,46 l18,-46Z" fill="#fff" stroke="${OL}" stroke-width="5" stroke-linejoin="round"/>`).join('')}${[...Array(7)].map((_, i) => `<path d="M${-130 + i * 40},${-20 - Math.abs(i - 3) * 4} l18,-40 l18,40Z" fill="#f3f0e6" stroke="${OL}" stroke-width="5" stroke-linejoin="round"/>`).join('')}`,
  cat: () => `<path d="M-130,-60 L-120,-190 L-40,-110Z M130,-60 L120,-190 L40,-110Z" fill="#f08c00" stroke="${OL}" stroke-width="8" stroke-linejoin="round"/><ellipse cy="-10" rx="160" ry="140" fill="#f08c00" stroke="${OL}" stroke-width="9"/><ellipse cx="-55" cy="-20" rx="22" ry="30" fill="#fff" stroke="${OL}" stroke-width="5"/><ellipse cx="55" cy="-20" rx="22" ry="30" fill="#fff" stroke="${OL}" stroke-width="5"/><ellipse cx="-55" cy="-16" rx="8" ry="20" fill="${OL}"/><ellipse cx="55" cy="-16" rx="8" ry="20" fill="${OL}"/><path d="M-14,30 L14,30 L0,46Z" fill="#ff8c9a" stroke="${OL}" stroke-width="4"/><path d="M0,46 Q-20,66 -36,56 M0,46 Q20,66 36,56" fill="none" stroke="${OL}" stroke-width="5" stroke-linecap="round"/><path d="M-60,40 L-170,20 M-60,52 L-170,60 M60,40 L170,20 M60,52 L170,60" stroke="${OL}" stroke-width="4"/>`,
  candy: () => `<path d="M-180,-60 L-90,0 L-180,60Z M180,-60 L90,0 L180,60Z" fill="#f783ac" stroke="${OL}" stroke-width="7" stroke-linejoin="round"/><circle r="95" fill="#f783ac" stroke="${OL}" stroke-width="8"/><path d="M-60,-60 L60,60 M-20,-90 L90,20 M-90,-20 L20,90" stroke="#fff" stroke-width="16" opacity=".7"/>`,
  meat: () => `<path d="M-160,-40 Q-160,-150 -40,-150 Q120,-160 160,-40 Q190,80 60,120 Q-120,160 -160,-40Z" fill="#e8590c" stroke="${OL}" stroke-width="9"/><path d="M-100,-60 Q-20,-100 80,-60 Q120,10 40,50 Q-60,70 -100,-60Z" fill="#ff8787" stroke="${OL}" stroke-width="6"/><rect x="120" y="60" width="120" height="36" rx="18" fill="#f3f0e6" stroke="${OL}" stroke-width="7" transform="rotate(30 120 60)"/>`,
  milk: () => `<path d="M-90,-110 L0,-190 L90,-110 L90,180 L-90,180Z" fill="#f3f4f7" stroke="${OL}" stroke-width="9" stroke-linejoin="round"/><path d="M-90,-110 L90,-110" stroke="${OL}" stroke-width="7"/><rect x="-90" y="-20" width="180" height="110" fill="#74c0fc"/><text y="58" font-size="48" font-weight="900" fill="#fff" text-anchor="middle">МОЛОКО</text>`,
  paw: () => `<g transform="scale(2.6)">${icon('paw', 70)}</g>`,
  bowl: () => `<g transform="scale(2.6)">${icon('bowl', 70)}</g>`,
  kidYawn: () => `<g transform="translate(0,300) scale(.9)">${person({ who: 'kid', eyes: 'closed', mouth: 'o', armL: -150, armR: 10 })}</g><ellipse cx="0" cy="-60" rx="40" ry="56" fill="#5a1f26" stroke="${OL}" stroke-width="7"/>`,
  kidThink: () => `<g transform="translate(0,300) scale(.9)">${person({ who: 'kid', eyes: 'normal', mouth: 'flat', look: [.6, -.8], armR: -160 })}</g><text x="140" y="-200" font-size="110" font-weight="900" fill="${YEL}" stroke="${OL}" stroke-width="8" paint-order="stroke">?</text>`,
  kidGlow: () => `<g transform="translate(0,300) scale(.9)">${person({ who: 'kid', eyes: 'happy', mouth: 'grin', armL: -150, armR: -150 })}</g>${[...Array(8)].map((_, i) => `<circle cx="${Math.cos(i * .8) * 200}" cy="${-80 + Math.sin(i * .8) * 200}" r="10" fill="#bef264" opacity=".8"/>`).join('')}`,
  phoneAway: () => `<g transform="rotate(-15) scale(.8)">${ART.phone()}</g><circle r="200" fill="none" stroke="${RED}" stroke-width="20"/><line x1="-140" y1="-140" x2="140" y2="140" stroke="${RED}" stroke-width="20" stroke-linecap="round"/>`,
};

// ---------------- ШАБЛОНЫ ----------------
function richText(x, y, text, size, max, col = '#fff') {
  const words = parseSub(text);
  const lines = [[]]; let len = 0;
  words.forEach((w, k) => { if (len + w[0].length > max && lines[lines.length - 1].length) { lines.push([]); len = 0; } lines[lines.length - 1].push(k); len += w[0].length + 1; });
  let s = '';
  lines.forEach((ln, li) => s += `<text x="${x}" y="${y + li * size * 1.15}" font-size="${size}" font-weight="900" text-anchor="middle" stroke="${OL}" stroke-width="${size / 6}" stroke-linejoin="round" paint-order="stroke" xml:space="preserve">${ln.map(k => `<tspan fill="${words[k][1] ? YEL : col}">${esc(words[k][0])} </tspan>`).join('')}</text>`);
  return { s, h: lines.length * size * 1.15 };
}
function bgFact(P, lt) {
  const c = P.bg || '#22324f';
  let s = `<rect width="${W}" height="${H}" fill="${c}"/>`;
  for (let i = 0; i < 14; i++) { const r = 40 + rnd(i + 3) * 90; s += `<circle cx="${rnd(i) * W}" cy="${(rnd(i + 20) * H + lt * 8 * (1 + rnd(i))) % H}" r="${r}" fill="#fff" opacity=".035"/>`; }
  return s;
}
function host(lt, P, x = 615, y = 1490, sc = .6) {
  const st = kf(P.k || [[0, { eyes: 'normal', mouth: 'smile' }]], lt);
  const kp = eo(seg(lt, .1, .5));
  return `<g transform="translate(${x},${y + (1 - kp) * 200}) scale(${sc})">${person(Object.assign({ who: 'kid', look: [.6, -.7], armL: 10, armR: 10 }, st))}</g>`;
}
const voAt = (P, i, def) => (P.voT && P.voT[i]) ? P.voT[i][0] : def;

T.hook = {
  draw(lt, P) {
    let s = bgFact(P, lt);
    if (P.tag) { const p = pop(lt, .05); s += `<g transform="translate(${W / 2},170) scale(${p})"><rect x="${-(P.tag.length * 11 + 40)}" y="-34" width="${P.tag.length * 22 + 80}" height="68" rx="34" fill="${P.tagCol || YEL}" stroke="${OL}" stroke-width="6"/><text y="13" font-size="34" font-weight="900" fill="${OL}" text-anchor="middle">${esc(P.tag)}</text></g>`; }
    const p = pop(lt, .15, .45);
    const r = richText(W / 2, 0, P.text, 76, 13);
    s += `<g transform="translate(0,${470 - r.h / 2}) translate(${W / 2},0) scale(${p}) translate(${-W / 2},0)">${r.s}</g>`;
    if (P.art) { const a = pop(lt, .5, .5); s += `<g transform="translate(${W / 2},${790 + Math.sin(lt * 2) * 8}) scale(${.7 * a})">${ART[P.art]()}</g>`; }
    s += host(lt, P, 360, P.art ? 1520 : 1420, .85);
    return s;
  },
  sfx: () => [[.05, 'hit'], [.15, 'stamp']],
};
T.card = {
  draw(lt, P) {
    let s = bgFact(P, lt);
    const a = pop(lt, .1, .5);
    const fl = Math.sin(lt * 2) * 10;
    s += `<g transform="translate(${W / 2},${490 + fl}) scale(${(P.artScale || 1) * a}) rotate(${Math.sin(lt * 1.3) * 2})">${ART[P.art](...(P.artArgs || []))}</g>`;
    if (P.cap) { const c = pop(lt, .35, .4); const r = richText(W / 2, 0, P.cap, 52, 18); s += `<g transform="translate(${W / 2},${830}) scale(${c}) translate(${-W / 2},0)">${r.s}</g>`; }
    s += host(lt, P);
    return s;
  },
  sfx: () => [[.1, 'pop']],
};
T.list = {
  draw(lt, P) {
    let s = bgFact(P, lt);
    const r = richText(W / 2, 260, P.title, 58, 16);
    s += `<g opacity="${clamp(lt * 4)}">${r.s}</g>`;
    P.items.forEach((it, i) => {
      const at = voAt(P, i + (P.offset ?? 1), .6 + i * .9);
      if (lt < at) return;
      const p = pop(lt, at, .35), y = 420 + i * 150;
      s += `<g transform="translate(${W / 2},${y}) scale(${p})"><rect x="-300" y="-56" width="600" height="112" rx="24" fill="#fff" stroke="${OL}" stroke-width="7"/><circle cx="-240" r="38" fill="${P.acc || YEL}" stroke="${OL}" stroke-width="6"/><text x="-240" y="14" font-size="40" font-weight="900" fill="${OL}" text-anchor="middle">${i + 1}</text><text x="-180" y="13" font-size="${it.length > 22 ? 30 : 36}" font-weight="800" fill="${OL}">${esc(it)}</text></g>`;
    });
    s += host(lt, P);
    return s;
  },
  sfx(P) { return P.items.map((_, i) => [voAt(P, i + (P.offset ?? 1), .6 + i * .9), 'pop']); },
};
T.vs = {
  draw(lt, P) {
    let s = bgFact(P, lt);
    const side = (o, x, at, win) => {
      if (lt < at) return '';
      const p = pop(lt, at, .4);
      const glow = win ? `<rect x="-160" y="-300" width="320" height="560" rx="28" fill="none" stroke="${YEL}" stroke-width="12"/>` : '';
      return `<g transform="translate(${x},620) scale(${p})"><rect x="-160" y="-300" width="320" height="560" rx="28" fill="#fff" fill-opacity=".1" stroke="#fff" stroke-opacity=".3" stroke-width="4"/>${glow}<text y="-230" font-size="42" font-weight="900" fill="#fff" text-anchor="middle">${esc(o.label)}</text>${o.art ? `<g transform="translate(0,-40) scale(.5)">${ART[o.art]()}</g>` : ''}${wrap(o.val, 12).map((l, i) => `<text y="${150 + i * 50}" font-size="44" font-weight="900" fill="${YEL}" text-anchor="middle">${esc(l)}</text>`).join('')}</g>`;
    };
    const winAt = P.winAt ?? voAt(P, 2, 3);
    s += side(P.left, 190, voAt(P, P.lAt ?? 0, .3), P.win === 'left' && lt > winAt);
    s += side(P.right, 530, voAt(P, P.rAt ?? 1, 1.6), P.win === 'right' && lt > winAt);
    if (lt > voAt(P, P.rAt ?? 1, 1.6)) s += `<g transform="translate(360,620) scale(${pop(lt, voAt(P, P.rAt ?? 1, 1.6))})"><circle r="44" fill="${RED}" stroke="${OL}" stroke-width="6"/><text y="14" font-size="36" font-weight="900" fill="#fff" text-anchor="middle">vs</text></g>`;
    return s;
  },
  sfx(P) { return [[voAt(P, P.lAt ?? 0, .3), 'pop'], [voAt(P, P.rAt ?? 1, 1.6), 'pop']]; },
};
T.outro = {
  draw(lt, P) {
    let s = bgFact(P, lt);
    const r = richText(W / 2, 330, P.ask, 62, 15);
    s += `<g transform="translate(${W / 2},0) scale(${pop(lt, .1)}) translate(${-W / 2},0)">${r.s}</g>`;
    s += `<g transform="translate(${W / 2},${360 + r.h + 60})"><rect x="-200" y="-50" width="400" height="100" rx="28" fill="${RED}" stroke="${OL}" stroke-width="7"/><text y="16" font-size="40" font-weight="900" fill="#fff" text-anchor="middle">Подписаться</text></g>`;
    const st = kf(P.k || [[0, { eyes: 'happy', mouth: 'grin' }]], lt);
    const wave = Math.sin(lt * 7) * 25;
    s += `<g transform="translate(${W / 2},1330) scale(.9)">${person(Object.assign({ who: 'kid', armR: -140 + wave, armL: 10 }, st))}</g>`;
    return s;
  },
  sfx: () => [[.1, 'tick']],
};

// ---------------- РОЛИКИ ----------------
const BYE = ['n', 'Подписывайся — завтра будет *ещё*.'];
const FACTS = [
{ n: 101, title: 'Зачем я сюда зашёл', bg: '#2d3a5c', shots: [
  { type: 'hook', tag: 'Факт', text: 'Зашёл в комнату и *забыл* зачем?', k: [[0, { eyes: 'wide', mouth: 'o' }]], seq: [['n', 'Зашёл в комнату и *забыл*, зачем пришёл?']] },
  { type: 'card', art: 'door', cap: '*Эффект* двери', k: [[0, { eyes: 'normal', mouth: 'flat' }]], seq: [['n', 'Это не склероз. Это *эффект дверного проёма*.']] },
  { type: 'card', art: 'brain', cap: 'Мозг начинает *новую сцену*', seq: [['n', 'Когда ты проходишь через дверь, мозг решает, что началась *новая сцена*.'], ['n', 'И убирает старые мысли *в архив*.']] },
  { type: 'card', art: 'checklist', cap: 'Это проверяли *в опытах*', seq: [['n', 'Учёные проверяли это в опытах: после двери люди *хуже вспоминали*, что собирались сделать.']] },
  { type: 'card', art: 'doorBack', cap: '*Вернись* назад', k: [[0, { eyes: 'happy', mouth: 'grin' }]], seq: [['n', 'Что делать? *Вернись* туда, где появилась мысль.'], ['n', 'Обстановка сама *подскажет* мозгу.']] },
  { type: 'outro', ask: 'С тобой *такое* было?', seq: [['n', 'Пиши в комментах, с тобой *такое* было?'], BYE] },
]},
{ n: 102, title: 'Правило 20-20-20', bg: '#1f4d4a', shots: [
  { type: 'hook', tag: 'Полезно', tagCol: '#45e08a', text: 'Глаза *устают* от телефона?', art: 'eye', k: [[0, { eyes: 'tired', mouth: 'flat' }]], seq: [['n', 'Глаза *устают* от телефона? Держи правило, которое советуют врачи.']] },
  { type: 'list', title: 'Правило 20-20-20', items: ['Каждые 20 минут', 'смотри на 6 метров вдаль', '20 секунд'], acc: '#45e08a', k: [[0, { eyes: 'normal', mouth: 'smile' }]],
    seq: [['n', 'Правило двадцать — двадцать — двадцать.'], ['n', 'Каждые *двадцать минут*'], ['n', 'смотри на что-нибудь в *шести метрах*'], ['n', 'в течение *двадцати секунд*.']] },
  { type: 'card', art: 'eye', cap: 'Мышцам глаза нужен *отдых*', seq: [['n', 'Когда ты смотришь близко, мышцы глаза *напряжены*.'], ['n', 'Взгляд вдаль даёт им *отдохнуть*.']] },
  { type: 'card', art: 'phone', cap: 'И моргай *чаще*', k: [[0, { eyes: 'closed', mouth: 'smile' }]], seq: [['n', 'И ещё: в телефоне мы моргаем *реже*, поэтому глаза сохнут. Моргай *чаще*.']] },
  { type: 'outro', ask: 'Сколько у тебя *экранного времени*?', seq: [['n', 'Пиши в комментах, сколько у тебя *экранного времени*.'], BYE] },
]},
{ n: 103, title: 'Мёд не портится', bg: '#5c3d12', shots: [
  { type: 'hook', tag: 'Факт', text: 'Еда, которая *не портится*', art: 'honey', k: [[0, { eyes: 'wide', mouth: 'o' }]], seq: [['n', 'Есть еда, которая почти *никогда не портится*.']] },
  { type: 'card', art: 'honey', cap: 'Это *мёд*', seq: [['n', 'Это *мёд*.']] },
  { type: 'card', art: 'pyramid', cap: 'Возраст: *тысячи лет*', k: [[0, { eyes: 'wide', mouth: 'o' }]], seq: [['n', 'В древних египетских гробницах находили мёд, которому *тысячи лет*.'], ['n', 'И он был *съедобным*.']] },
  { type: 'list', title: 'Почему так', items: ['Мало воды', 'Он кислый', 'Сахар сушит микробов'], acc: '#f2a516',
    seq: [['n', 'Секрет в трёх вещах.'], ['n', 'В мёде *мало воды*.'], ['n', 'Он *кислый*.'], ['n', 'А сахар *вытягивает воду* из микробов, и они погибают.']] },
  { type: 'card', art: 'honey', cap: 'Засахарился — *не испортился*', k: [[0, { eyes: 'happy', mouth: 'smile' }]], seq: [['n', 'Если мёд засахарился, он *не испортился*.'], ['n', 'Подогрей банку в тёплой воде, и он снова станет *жидким*.']] },
  { type: 'outro', ask: 'Знал *об этом*?', seq: [['n', 'Знал об этом? Пиши в *комментах*.'], BYE] },
]},
{ n: 104, title: 'Три сердца', bg: '#3b1f4a', shots: [
  { type: 'hook', tag: 'Факт', text: 'У кого *три сердца*?', k: [[0, { eyes: 'normal', mouth: 'flat', look: [.6, -.8] }]], seq: [['n', 'У какого животного *три сердца* и *голубая* кровь?']] },
  { type: 'card', art: 'octopus', cap: '*Осьминог*', k: [[0, { eyes: 'wide', mouth: 'o' }]], seq: [['n', 'У *осьминога*.']] },
  { type: 'card', art: 'hearts', cap: '2 для жабр + *1 для тела*', seq: [['n', 'Два сердца качают кровь через *жабры*.'], ['n', 'А третье — по всему *телу*.']] },
  { type: 'card', art: 'drop', cap: 'В крови *медь*, а не железо', seq: [['n', 'Кровь у него голубая, потому что в ней *медь*. А у нас — *железо*.']] },
  { type: 'card', art: 'octopus', cap: 'Щупальца *почти думают сами*', k: [[0, { eyes: 'happy', mouth: 'grin' }]], seq: [['n', 'А ещё большая часть его нейронов — *в щупальцах*.'], ['n', 'Каждое щупальце почти *думает само*.']] },
  { type: 'outro', ask: 'Какое животное *разобрать* дальше?', seq: [['n', 'Какое животное разобрать дальше? Пиши в *комментах*.'], BYE] },
]},
{ n: 105, title: 'Как выучить и не забыть', bg: '#22324f', shots: [
  { type: 'hook', tag: 'Полезно', tagCol: '#45e08a', text: 'Выучил вечером, забыл *утром*?', k: [[0, { eyes: 'sad', mouth: 'sad' }]], seq: [['n', 'Выучил вечером, а утром *всё забыл*? Это нормально.']] },
  { type: 'card', art: 'curve', cap: 'Кривая *забывания*', seq: [['n', 'Ещё в девятнадцатом веке учёный Эббингауз выяснил:'], ['n', 'без повторения мы забываем большую часть *за пару дней*.']] },
  { type: 'list', title: 'Повторяй так', items: ['Через день', 'Через 3 дня', 'Через неделю'], acc: '#45e08a', k: [[0, { eyes: 'normal', mouth: 'smile' }]],
    seq: [['n', 'Решение — *интервальные повторения*.'], ['n', 'Повтори *через день*.'], ['n', 'Потом *через три дня*.'], ['n', 'Потом *через неделю*.']] },
  { type: 'card', art: 'kidGlow', cap: 'Каждый раз помнишь *дольше*', seq: [['n', 'С каждым повтором память держит информацию *дольше*.'], ['n', 'А сам повтор занимает *пару минут*.']] },
  { type: 'outro', ask: 'Какой предмет даётся *тяжелее всего*?', seq: [['n', 'Какой предмет даётся тебе *тяжелее всего*? Пиши в комментах.'], BYE] },
]},
{ n: 106, title: 'Батарея', bg: '#163d2b', shots: [
  { type: 'hook', tag: 'Полезно', tagCol: '#45e08a', text: 'Батарея *сдохла* за год?', art: 'battery', k: [[0, { eyes: 'angry', mouth: 'flat' }]], seq: [['n', 'Телефон через год *держит хуже*? Вот почему.']] },
  { type: 'card', art: 'battery', artArgs: [.15, '#e5484d'], cap: 'Батарею убивают *жара* и *крайности*', seq: [['n', 'В телефонах *литий-ионные* батареи.'], ['n', 'Их изнашивают *жара* и *крайние* уровни заряда.']] },
  { type: 'card', art: 'battery', artArgs: [.6], cap: 'Держи *20–80%*', k: [[0, { eyes: 'normal', mouth: 'smile' }]], seq: [['n', 'Батарея меньше изнашивается, если держать заряд примерно *от двадцати до восьмидесяти* процентов.']] },
  { type: 'list', title: 'Что ещё', items: ['Не оставляй на солнце', 'Не играй на зарядке', 'Оптимизированная зарядка'], acc: '#45e08a',
    seq: [['n', 'Ещё три совета.'], ['n', 'Не оставляй телефон *на солнце*.'], ['n', 'Не играй в тяжёлые игры *на зарядке* — он греется.'], ['n', 'И включи в настройках *оптимизированную зарядку*.']] },
  { type: 'outro', ask: 'Сколько *процентов* здоровье твоей батареи?', seq: [['n', 'Глянь в настройках здоровье батареи и пиши в *комментах*.'], BYE] },
]},
{ n: 107, title: 'Радиоактивные бананы', bg: '#4a4512', shots: [
  { type: 'hook', tag: 'Факт', text: 'Бананы *радиоактивные*', art: 'banana', k: [[0, { eyes: 'wide', mouth: 'o', sweat: true }]], seq: [['n', 'Бананы — *радиоактивные*. Серьёзно.']] },
  { type: 'card', art: 'banana', cap: 'Внутри *калий-40*', seq: [['n', 'В них много *калия*.'], ['n', 'А небольшая часть природного калия — *радиоактивный* калий-сорок.']] },
  { type: 'card', art: 'atom', cap: '*Банановый* эквивалент дозы', k: [[0, { eyes: 'happy', mouth: 'grin' }]], seq: [['n', 'Учёные даже придумали шуточную единицу — *банановый эквивалент дозы*.']] },
  { type: 'card', art: 'shield', cap: 'Это *безопасно*', seq: [['n', 'Но бояться не надо.'], ['n', 'Чтобы получить опасную дозу, нужно съесть *миллионы* бананов сразу.']] },
  { type: 'card', art: 'kidGlow', cap: 'Ты тоже *немного* радиоактивный', seq: [['n', 'Кстати, в твоём теле тоже есть калий-сорок.'], ['n', 'Так что ты тоже *немного радиоактивный*.']] },
  { type: 'outro', ask: 'Сколько бананов *в день* ешь?', seq: [['n', 'Сколько бананов в день ешь? Пиши в *комментах*.'], BYE] },
]},
{ n: 108, title: 'Венера', bg: '#3d2a14', shots: [
  { type: 'hook', tag: 'Космос', tagCol: '#ffa94d', text: 'День длиннее *года*?', art: 'venus', k: [[0, { eyes: 'wide', mouth: 'o' }]], seq: [['n', 'Есть планета, где день *длиннее года*.']] },
  { type: 'card', art: 'venus', cap: '*Венера*', seq: [['n', 'Это *Венера*.']] },
  { type: 'vs', left: { label: 'Год', art: 'orbit', val: '225 земных дней' }, right: { label: 'Оборот', art: 'spin', val: '243 земных дня' }, win: 'right',
    seq: [['n', 'Вокруг Солнца она облетает за *двести двадцать пять* земных дней.'], ['n', 'А вокруг своей оси поворачивается за *двести сорок три*.'], ['n', 'Один оборот — *дольше*, чем целый год.']] },
  { type: 'card', art: 'sun', cap: 'Солнце встаёт *на западе*', k: [[0, { eyes: 'wide', mouth: 'o' }]], seq: [['n', 'И крутится она *в обратную сторону*.'], ['n', 'Так что Солнце там встаёт *на западе*.']] },
  { type: 'outro', ask: 'На какую планету *полетел бы*?', seq: [['n', 'На какую планету полетел бы ты? Пиши в *комментах*.'], BYE] },
]},
{ n: 109, title: 'Правило двух минут', bg: '#2c2f45', shots: [
  { type: 'hook', tag: 'Полезно', tagCol: '#45e08a', text: 'Куча дел и *лень* начинать?', k: [[0, { eyes: 'tired', mouth: 'wave' }]], seq: [['n', 'Куча мелких дел, и *лень* начинать?']] },
  { type: 'card', art: 'stopwatch', cap: 'Правило *двух минут*', seq: [['n', 'Есть *правило двух минут*.'], ['n', 'Если дело занимает меньше двух минут — *сделай его сразу*.']] },
  { type: 'list', title: 'Например', items: ['Ответить на сообщение', 'Убрать кружку', 'Собрать рюкзак'], acc: '#45e08a',
    seq: [['n', 'Например.'], ['n', 'Ответить на *сообщение*.'], ['n', 'Убрать *кружку*.'], ['n', 'Собрать *рюкзак* на завтра.']] },
  { type: 'card', art: 'kidGlow', cap: 'В голове *меньше хвостов*', seq: [['n', 'Мелкие дела перестают *висеть в голове*.'], ['n', 'И за большое браться *проще*.']] },
  { type: 'outro', ask: 'Какое дело ты *откладываешь*?', seq: [['n', 'Какое дело ты сейчас откладываешь? Пиши в *комментах*.'], BYE] },
]},
{ n: 110, title: 'Метод помидора', bg: '#4a1d1d', shots: [
  { type: 'hook', tag: 'Полезно', tagCol: '#45e08a', text: 'Не можешь *сосредоточиться*?', art: 'phone', k: [[0, { eyes: 'tired', mouth: 'flat' }]], seq: [['n', 'Садишься за уроки, а через минуту уже *в телефоне*?']] },
  { type: 'card', art: 'timer', cap: 'Метод *помидора*', seq: [['n', 'Попробуй *метод помидора*.'], ['n', 'Его придумал итальянский студент с кухонным таймером *в форме помидора*.']] },
  { type: 'list', title: 'Как работает', items: ['25 минут — работа', '5 минут — отдых', '4 круга — большой перерыв'], acc: '#ff8787',
    seq: [['n', 'Всё просто.'], ['n', '*Двадцать пять минут* работаешь без телефона.'], ['n', '*Пять минут* отдыхаешь.'], ['n', 'После четырёх кругов — *большой перерыв*.']] },
  { type: 'card', art: 'phoneAway', cap: 'Телефон — *подальше*', k: [[0, { eyes: 'normal', mouth: 'smirk' }]], seq: [['n', 'Главное — убери телефон *в другую комнату*.'], ['n', 'Так ты правда сделаешь *больше*.']] },
  { type: 'outro', ask: 'Сколько помидоров *выдержишь*?', seq: [['n', 'Сколько помидоров выдержишь? Пиши в *комментах*.'], BYE] },
]},
{ n: 111, title: 'Акулы старше деревьев', bg: '#123a4a', shots: [
  { type: 'hook', tag: 'Факт', text: 'Кто *старше*: акулы или деревья?', k: [[0, { eyes: 'normal', mouth: 'flat', look: [.6, -.8] }]], seq: [['n', 'Кто появился раньше: *акулы* или *деревья*?']] },
  { type: 'vs', left: { label: 'Акулы', art: 'shark', val: '≈ 450 млн лет' }, right: { label: 'Деревья', art: 'tree', val: '≈ 385 млн лет' }, win: 'left',
    seq: [['n', 'Первые акулы — около *четырёхсот пятидесяти* миллионов лет назад.'], ['n', 'Первые деревья — около *трёхсот восьмидесяти пяти*.'], ['n', 'Акулы *старше* деревьев.']] },
  { type: 'card', art: 'shark', cap: 'Пережили *динозавров*', k: [[0, { eyes: 'wide', mouth: 'o' }]], seq: [['n', 'Акулы пережили несколько *массовых вымираний*. И динозавров тоже.']] },
  { type: 'card', art: 'teeth', cap: '*Тысячи* зубов за жизнь', seq: [['n', 'А зубы у акулы растут *рядами* и меняются всю жизнь.'], ['n', 'За жизнь — *тысячи* зубов.']] },
  { type: 'outro', ask: 'Какой факт про акул *знаешь* ты?', seq: [['n', 'Какой факт про акул знаешь ты? Пиши в *комментах*.'], BYE] },
]},
{ n: 112, title: 'Томатный сок в самолёте', bg: '#2a3f5f', shots: [
  { type: 'hook', tag: 'Факт', text: 'Почему в самолёте берут *томатный сок*?', art: 'glass', k: [[0, { eyes: 'normal', mouth: 'flat', look: [.6, -.8] }]], seq: [['n', 'Замечал, что в самолёте многие берут *томатный сок*?']] },
  { type: 'card', art: 'plane', cap: 'Шум и *сухой* воздух', seq: [['n', 'В полёте шумно, а воздух *сухой*.'], ['n', 'Из-за этого вкус сладкого и солёного *слабеет*.']] },
  { type: 'card', art: 'tomato', cap: 'Вкус *умами* остаётся', seq: [['n', 'А вкус *умами* — тот, что есть у томатов — почти не теряется.']] },
  { type: 'card', art: 'glass', cap: 'В воздухе он *вкуснее*', k: [[0, { eyes: 'happy', mouth: 'smile' }]], seq: [['n', 'Исследование для авиакомпании показало: в условиях полёта томатный сок кажется людям *вкуснее*, чем на земле.']] },
  { type: 'card', art: 'salt', cap: 'Поэтому еда *пресная*', seq: [['n', 'Поэтому еду для самолётов солят *сильнее*. А она всё равно кажется пресной.']] },
  { type: 'outro', ask: 'Что *ты* берёшь в самолёте?', seq: [['n', 'А что берёшь ты? Пиши в *комментах*.'], BYE] },
]},
{ n: 113, title: 'Кошки и сладкое', bg: '#3a2f4a', shots: [
  { type: 'hook', tag: 'Факт', text: 'Кот *не знает*, что такое сладкое', art: 'cat', k: [[0, { eyes: 'wide', mouth: 'o' }]], seq: [['n', 'Твой кот *не чувствует* сладкое. Вообще.']] },
  { type: 'card', art: 'candy', cap: 'Ген сладкого *сломан*', seq: [['n', 'У кошек *сломан ген*, который отвечает за рецептор сладкого вкуса.']] },
  { type: 'card', art: 'meat', cap: 'Хищнику сладкое *не нужно*', seq: [['n', 'Они хищники, и сладкое им *не нужно*.'], ['n', 'Природа его просто *отключила*.']] },
  { type: 'card', art: 'milk', cap: 'Молоко — *не лучшая* идея', k: [[0, { eyes: 'normal', mouth: 'flat' }]], seq: [['n', 'И ещё: многие взрослые кошки плохо переваривают *молоко*.'], ['n', 'Лучше давать *воду*.']] },
  { type: 'outro', ask: 'Как зовут *твоего кота*?', seq: [['n', 'Как зовут твоего кота? Пиши в *комментах*.'], BYE] },
]},
{ n: 114, title: 'Прожорливый мозг', bg: '#1e2c4a', shots: [
  { type: 'hook', tag: 'Факт', text: 'Самый *прожорливый* орган', art: 'brain', k: [[0, { eyes: 'wide', mouth: 'o' }]], seq: [['n', 'Самый *прожорливый* орган в твоём теле — это мозг.']] },
  { type: 'vs', left: { label: 'Вес', art: 'brain', val: '≈ 2% тела' }, right: { label: 'Энергия', art: 'battery', val: '≈ 20% всей' }, win: 'right',
    seq: [['n', 'Он весит всего около *двух процентов* от тела.'], ['n', 'А тратит около *двадцати процентов* всей энергии.'], ['n', 'В *десять раз* больше своей доли.']] },
  { type: 'card', art: 'brain', cap: 'Работает даже *во сне*', seq: [['n', 'И работает он даже *во сне*.']] },
  { type: 'card', art: 'bowl', cap: '*Завтракай* перед контрольной', k: [[0, { eyes: 'happy', mouth: 'grin' }]], seq: [['n', 'Поэтому голодный мозг соображает *хуже*.'], ['n', 'Не пропускай *завтрак* перед контрольной.']] },
  { type: 'outro', ask: 'Ты *завтракаешь*?', seq: [['n', 'А ты завтракаешь? Пиши в *комментах*.'], BYE] },
]},
{ n: 115, title: 'Заразная зевота', bg: '#2b2b45', shots: [
  { type: 'hook', tag: 'Факт', text: 'Спорим, ты сейчас *зевнёшь*', k: [[0, { eyes: 'normal', mouth: 'smirk' }]], seq: [['n', 'Спорим, ты сейчас *зевнёшь*?']] },
  { type: 'card', art: 'kidYawn', cap: 'Зевота *заразна*', seq: [['n', 'Зевота *заразна*.'], ['n', 'Иногда хватает просто увидеть или даже *прочитать* про неё.']] },
  { type: 'card', art: 'brain', cap: 'Учёные *спорят*', seq: [['n', 'Учёные до конца *не знают*, почему так.'], ['n', 'Одна из версий — это связано с *сопереживанием*.']] },
  { type: 'card', art: 'paw', cap: 'Собаки *тоже*', k: [[0, { eyes: 'happy', mouth: 'smile' }]], seq: [['n', 'Есть исследования, что собаки тоже могут зевнуть, увидев, как зевает *хозяин*.']] },
  { type: 'outro', ask: 'Ну что, *зевнул*?', k: [[0, { eyes: 'closed', mouth: 'o' }]], seq: [['n', 'Ну что, *зевнул*? Пиши честно в комментах.'], BYE] },
]},
];
FACTS.forEach(f => { f.voiced = true; f.mood = f.mood || 'chill'; f.shots.forEach(s => { s.bg = s.bg || f.bg; if (s.type === 'hook') s.noSubs = true; s.d = s.d || 2.5; s.lead = s.lead ?? .25; s.gap = s.gap ?? .25; s.tail = s.tail ?? .35; }); });
if (typeof module !== 'undefined') module.exports = { FACTS };
