// «Фото в 3:14», части 3–5 (финал). Номера 513–515. Озвучка Piper.
// Использует SC/T.hor (horror.js) и сцены horror2.js.

// Фотограф: высокий, худой, пальто, вместо лица — объектив
function photog(x, y, s, o = {}) {
  const lean = o.lean || 0, armUp = o.arm ?? 0;
  return `<g transform="translate(${x},${y}) scale(${s}) rotate(${lean})">
    <ellipse cx="0" cy="0" rx="90" ry="16" fill="#000" opacity=".5"/>
    <path d="M-70,-520 Q-90,-260 -80,0 L-20,0 L-10,-200 L10,-200 L20,0 L80,0 Q90,-260 70,-520 Q40,-560 0,-562 Q-40,-560 -70,-520Z" fill="#0b0c10" stroke="#3b4256" stroke-width="5" stroke-opacity=".7"/>
    <path d="M-70,-500 Q-110,-${300 + armUp * 120} -60,-${180 + armUp * 200}" fill="none" stroke="#0b0c10" stroke-width="26" stroke-linecap="round"/>
    <path d="M70,-500 Q110,-${300 + armUp * 120} 60,-${180 + armUp * 200}" fill="none" stroke="#0b0c10" stroke-width="26" stroke-linecap="round"/>
    <rect x="-22" y="-600" width="44" height="50" fill="#0b0c10"/>
    <g transform="translate(0,-650)"><circle r="64" fill="#1a1a1a" stroke="#3a3a3a" stroke-width="10"/><circle r="44" fill="#0a1220" stroke="#555" stroke-width="5"/><circle r="26" fill="#13233d"/><circle cx="-12" cy="-14" r="10" fill="#fff" opacity="${o.glint ?? .5}"/>${o.reflect ? `<g transform="scale(.06) translate(0,420)">${person({ who: 'kid', eyes: 'wide', mouth: 'o', legs: false })}</g>` : ''}</g>
  </g>`;
}

SC.photos = (lt, P) => {
  let s = `<rect width="${W}" height="${H}" fill="#2a1f17"/>`;
  for (let i = 0; i < 12; i++) s += `<line x1="0" y1="${i * 110}" x2="${W}" y2="${i * 110 + 20}" stroke="#000" stroke-opacity=".15" stroke-width="3"/>`;
  const n = P.n ?? 9, emptyFrom = P.emptyAt !== undefined ? rt(P, P.emptyAt) : 99;
  for (let i = 0; i < n; i++) {
    const x = 120 + (i % 3) * 240, y = 330 + Math.floor(i / 3) * 300, r = (rnd(i) - .5) * 12;
    const last = i % 3 === 2, empty = last && lt > emptyFrom, p = pop(lt, .2 + i * .18, .3);
    const sc = [0.55, 0.85, 1.3][i % 3];
    s += `<g transform="translate(${x},${y}) rotate(${r}) scale(${p})"><rect x="-100" y="-120" width="200" height="240" fill="#efe9dc"/><rect x="-86" y="-106" width="172" height="172" fill="#0f1218"/>`;
    s += `<g transform="translate(0,-20) scale(${sc * .3})">${empty ? `<rect x="-260" y="-40" width="520" height="150" rx="20" fill="#2a3042"/><rect x="-250" y="-90" width="150" height="80" rx="30" fill="#cfd6e4"/>` : sleeper(0, 0, 1, { blanket: ['#4a5a86', '#7a5a3a', '#5a7a4a'][Math.floor(i / 3) % 3] })}</g>`;
    s += `<text x="0" y="98" font-size="20" fill="#5c5040" text-anchor="middle" font-family="DejaVu Serif" font-style="italic">${['1998', '2004', '2011'][Math.floor(i / 3) % 3]} · 3:14</text>`;
    if (empty) s += `<rect x="-100" y="-120" width="200" height="240" fill="none" stroke="${HRED}" stroke-width="6"/>`;
    s += `</g>`;
  }
  return { bg: s + grain(lt, .05), dark: .1 };
};
SC.clips = (lt, P) => {
  let s = `<rect width="${W}" height="${H}" fill="#14161c"/>`;
  [['1998', 'Пропал 12-летний мальчик', 130], ['2004', 'Девочка исчезла из своей комнаты', 440], ['2011', 'Ночью пропал подросток', 750]].forEach(([y, t, top], i) => {
    const at = rt(P, P.at?.[i] ?? i * 1.2); if (lt < at) return;
    const p = pop(lt, at, .35);
    s += `<g transform="translate(360,${top + 130}) rotate(${[-3, 2, -1][i]}) scale(${p})"><rect x="-300" y="-130" width="600" height="260" fill="#e9e2cf"/><rect x="-300" y="-130" width="600" height="56" fill="#cfc6ae"/><text x="-280" y="-90" font-size="28" font-weight="900" fill="#2a2016" font-family="DejaVu Serif">Новости · ${y}</text><text x="-280" y="-30" font-size="30" font-weight="800" fill="#2a2016" font-family="DejaVu Serif">${esc(t)}</text>${[0, 1, 2].map(k => `<rect x="-280" y="${0 + k * 30}" width="${380 - k * 60}" height="12" fill="#8a7d6a" opacity=".6"/>`).join('')}<rect x="140" y="-10" width="130" height="120" fill="#3a3a3a"/><circle cx="205" cy="35" r="30" fill="#6b6b6b"/></g>`;
  });
  return { bg: s + grain(lt, .06), dark: 0 };
};
SC.darkroom = (lt, P) => {
  const fl = flick(lt, P);
  let s = `<rect width="${W}" height="${H}" fill="#140405"/><rect y="900" width="${W}" height="380" fill="#0d0203"/>`;
  s += `<line x1="0" y1="260" x2="${W}" y2="250" stroke="#2a0a0c" stroke-width="4"/>`;
  for (let i = 0; i < 5; i++) s += `<g transform="translate(${90 + i * 135},258)"><rect x="-6" y="-8" width="12" height="16" fill="#555"/><rect x="-40" y="8" width="80" height="240" fill="#2a1a12" opacity=".9"/>${[0, 1, 2].map(k => `<rect x="-32" y="${18 + k * 76}" width="64" height="66" fill="${P.neg ? '#d8cfc0' : '#3a2a20'}" opacity=".7"/>`).join('')}</g>`;
  s += `<rect x="60" y="860" width="600" height="60" fill="#2a2a2a"/><rect x="100" y="820" width="200" height="50" rx="6" fill="#3a3f4a" stroke="#000" stroke-width="4"/><rect x="400" y="820" width="200" height="50" rx="6" fill="#3a3f4a" stroke="#000" stroke-width="4"/>`;
  s += `<circle cx="360" cy="120" r="34" fill="#ff2020" opacity="${.8 * fl}"/><circle cx="360" cy="120" r="${220 * fl}" fill="#ff0000" opacity=".1"/>`;
  if (P.wet && lt > rt(P, P.wet)) s += `<g transform="translate(500,830) rotate(-8) scale(${pop(lt, rt(P, P.wet))})"><rect x="-80" y="-60" width="160" height="110" fill="#e9e2cf"/><rect x="-70" y="-50" width="140" height="80" fill="#1a0a0a"/></g>`;
  return { bg: s, dark: (1 - fl) * .6, tint: '#ff0000' };
};
SC.negative = (lt, P) => {
  const reveal = clamp(seg(lt, rt(P, P.revealAt ?? 1), rt(P, P.revealAt ?? 1) + 2));
  let s = `<rect width="${W}" height="${H}" fill="#120303"/><g transform="translate(360,640) rotate(-2)"><rect x="-300" y="-420" width="600" height="840" fill="#2a1a12"/>${[...Array(14)].map((_, i) => `<rect x="-290" y="${-410 + i * 60}" width="20" height="30" fill="#120303"/><rect x="270" y="${-410 + i * 60}" width="20" height="30" fill="#120303"/>`).join('')}<rect x="-250" y="-360" width="500" height="720" fill="#cfc8b8"/>`;
  s += `<rect x="-200" y="-300" width="300" height="420" fill="#8a8478" stroke="#3a3530" stroke-width="10"/><g opacity="${reveal}"><g transform="translate(-50,110) scale(.6)">${photog(0, 0, 1, { glint: 1 }).replace(/#0b0c10/g, '#e8e2d4').replace(/#1a1a1a/g, '#d0c8b8').replace(/#0a1220/g, '#efe9dc').replace(/#13233d/g, '#f6f2ea')}</g></g>`;
  s += `<g transform="translate(0,280) scale(.5)"><rect x="-260" y="-40" width="520" height="150" rx="20" fill="#9a9488"/></g></g><rect width="${W}" height="${H}" fill="#ff0000" opacity=".1"/>`;
  return { bg: s + grain(lt, .08), dark: 0 };
};
SC.trapped = (lt, P) => {
  const knock = (P.knocks || []).some(k => { const d = lt - rt(P, k); return d > 0 && d < .15; });
  let s = `<rect width="${W}" height="${H}" fill="#07080b"/><g transform="translate(${knock ? (rnd(Math.floor(lt * 60)) - .5) * 14 : 0},0)"><rect x="70" y="180" width="580" height="860" fill="#efe9dc"/><rect x="100" y="210" width="520" height="700" fill="#050608"/>`;
  s += `<defs><clipPath id="trc"><rect x="100" y="210" width="520" height="700"/></clipPath></defs><g clip-path="url(#trc)">` + (P.ph ? `<g transform="translate(360,1180) scale(.95)">${photog(0, 0, 1, { arm: 1, glint: .8 }).replace(/#0b0c10/g, '#16181f')}</g>` : `<g transform="translate(360,1060) scale(1.15)">${person({ who: P.who || 'den', eyes: 'wide', mouth: 'open', armL: -150, armR: -150, sweat: true })}</g>`) + `</g>`;
  s += `<path d="M100,210 L620,210 L620,910 L100,910Z" fill="none" stroke="#9aa3b5" stroke-width="2" opacity=".5"/><path d="M140,240 L260,240 L120,520Z" fill="#fff" opacity=".07"/>`;
  s += `<rect x="70" y="910" width="580" height="130" fill="#efe9dc"/><text x="360" y="990" font-size="34" fill="#5c5040" text-anchor="middle" font-family="DejaVu Serif" font-style="italic">${esc(P.caption || '03:14')}</text></g>`;
  if (knock) s += `<rect width="${W}" height="${H}" fill="#fff" opacity=".05"/>`;
  return { bg: s + grain(lt, .1), dark: .05 };
};
SC.bedFinal = (lt, P) => {
  const lit = 0, aj = clamp(kfr(P.ajar, lt, P).v ?? .1), F = kfr(P.ph, lt, P), flashOn = kfr(P.flashOn, lt, P).on;
  let s = bedroomBase(false);
  if (aj > .1) s += `<rect x="565" y="305" width="${aj * 160}" height="710" fill="#020203"/>`;
  s += sleeper(330, 960, 1, { eyes: kfr(P.kidEyes, lt, P).e || 'closed' });
  if (P.phoneGlow && lt > rt(P, P.phoneGlow)) s += `<ellipse cx="420" cy="930" rx="60" ry="22" fill="#6ea8ff" opacity=".25"/>`;
  if (F.show) s += photog(F.x ?? 600, F.y ?? 1060, F.s ?? .9, { lean: F.lean || 0, arm: F.arm || 0, glint: .4 });
  if (flashOn) s += `<rect width="${W}" height="${H}" fill="#fff" opacity=".92"/>`;
  return { bg: s, dark: flashOn ? 0 : .25 };
};
SC.lensClose = (lt, P) => {
  const z = 1 + seg(lt, 0, P.d) * .25;
  let s = `<rect width="${W}" height="${H}" fill="#050507"/><g transform="translate(360,620) scale(${4.2 * z})">${photog(0, 650, 1, { reflect: true, glint: .7 }).replace('translate(0,650)', 'translate(0,650)')}</g>`;
  return { bg: s + grain(lt, .08), dark: 0 };
};
SC.whiteout = (lt, P) => ({ bg: `<rect width="${W}" height="${H}" fill="#fff"/>${P.scream ? `<g opacity="${1 - seg(lt, 0, P.d)}" transform="translate(360,640) scale(${1 + lt * .4})">${photog(0, 300, .9, { arm: 1 }).replace(/#0b0c10/g, '#2a2a2a')}</g>` : ''}${grain(lt, .04)}`, dark: 0 });
SC.falling = (lt, P) => {
  const y = lerp(160, 960, eio(seg(lt, .3, P.d - .5))), r = Math.sin(lt * 2.4) * 25;
  let s = `${bedroomBase(true)}<rect width="${W}" height="${H}" fill="#000" opacity=".25"/><g transform="translate(${360 + Math.sin(lt * 1.7) * 90},${y}) rotate(${r})"><rect x="-90" y="-110" width="180" height="220" fill="#efe9dc"/><rect x="-78" y="-98" width="156" height="160" fill="#050608"/><g transform="translate(0,40) scale(.18)">${photog(0, 0, 1, {})}</g></g>`;
  return { bg: s, dark: 0 };
};
SC.deleted = (lt, P) => {
  let s = `<rect width="${W}" height="${H}" fill="#0b0c10"/><text x="40" y="150" font-size="40" font-weight="900" fill="#fff">${esc(P.head || 'Недавно удалённые')}</text><text x="40" y="196" font-size="24" fill="#8a92a6">${esc(P.sub || '1 фото · удалится через 30 дней')}</text>`;
  const p = pop(lt, .4, .35);
  s += `<g transform="translate(130,360) scale(${p})"><rect x="-110" y="-110" width="220" height="220" fill="#1a1d26" stroke="${HRED}" stroke-width="5"/><g transform="translate(0,70) scale(.22)">${photog(0, 0, 1, { lean: P.closer ? 6 : 0 })}</g><text x="0" y="-74" font-size="22" font-weight="800" fill="${HRED}" text-anchor="middle" font-family="JetBrains Mono">03:14</text></g>`;
  if (P.dialog && lt > rt(P, P.dialog)) s += `<g transform="translate(360,760) scale(${pop(lt, rt(P, P.dialog))})"><rect x="-260" y="-130" width="520" height="260" rx="28" fill="#2a2f3e"/><text y="-50" font-size="30" font-weight="800" fill="#fff" text-anchor="middle">Удалить фото?</text><text y="0" font-size="22" fill="#c9ced8" text-anchor="middle">Это действие нельзя отменить.</text><rect x="-230" y="40" width="210" height="64" rx="16" fill="#3a3f4e"/><text x="-125" y="82" font-size="26" fill="#fff" text-anchor="middle">Отмена</text><rect x="20" y="40" width="210" height="64" rx="16" fill="${HRED}"/><text x="125" y="82" font-size="26" font-weight="800" fill="#fff" text-anchor="middle">Удалить</text></g>`;
  return { bg: s + grain(lt, .04), dark: 0 };
};

// ---------------- СЕРИИ ----------------
const N3 = t => ['h_pn', t];
const h3 = (scene, seq, o = {}) => Object.assign({ type: 'hor', scene, seq }, o);
const TALK = (lines, o = {}) => h3('hall', lines, Object.assign({ A: 'h_pkid', B: 'h_pden', lit: [[0, { v: 1 }]], bubbleY: 330, chars: [{ who: 'kid', x: 170, y: 1320, s: .9, k: [[0, { eyes: 'tired', mouth: 'flat', look: [.8, 0] }]] }, { who: 'den', x: 560, y: 1320, s: .9, k: [[0, { eyes: 'wide', mouth: 'flat', look: [-.8, 0] }]] }] }, o));

const HORROR3 = [
{ n: 513, title: 'Последний кадр', mood: 'horror', shots: [
  h3('oldcam', [N3('У этого фотоаппарата остался *один кадр*.'), N3('И ты уже догадываешься, *кого* он снимет.')], { count: '1', ring: true, sfx: [[0, 'drone', { d: 8 }]] }),
  h3('title', [N3('Фото в три четырнадцать. Часть третья. *Последний кадр*.')], { series: 'ФОТО В 3:14', kicker: 'Часть 3', name: 'Последний кадр', noSubs: true, sfx: [[.1, 'stinger']] }),
  TALK([N3('Утром вы с Дэном почти не разговариваете.'), ['B', 'Откуда у нас вообще этот *шкаф*?'], ['A', 'Спроси у мамы.'], N3('Мама Дэна купила его месяц назад. На барахолке. *За копейки*.'), N3('Продавщица сказала только одно: «Шкаф хороший. Только не ставьте его *в детскую*».')], { time: '09:10' }),
  h3('oldcam', [N3('Вы открываете кожаный *чехол* фотоаппарата.'), N3('Внутри — пачка *старых фотографий*.')], { count: '1', sfx: [[.5, 'slide']] }),
  h3('photos', [N3('На каждой — спящий ребёнок. Разные комнаты, разные годы.'), N3('И везде в углу одно и то же время. *Три четырнадцать*.'), N3('Ты берёшь одно фото в руки. Бумага *холодная*, будто её достали из морозилки.')], { n: 9, sfx: [[.4, 'pop'], [1, 'pop'], [1.6, 'pop']] }),
  h3('photos', [N3('Вы раскладываете их по порядку. От двери. Ближе. *Ещё ближе*.'), N3('А на последнем снимке каждой серии — *пустая кровать*.')], { n: 9, emptyAt: 'v1+1', sfx: [['v1+1', 'stinger']], mood: 'tense' }),
  h3('clips', [N3('Дэн гуглит даты с обратной стороны фото.'), N3('Девяносто восьмой. Две тысячи четвёртый. Две тысячи одиннадцатый.'), N3('Все эти дети *пропали*. Ночью. Из своих комнат.'), N3('Ни одного из них *так и не нашли*.')], { at: ['v1', 'v1+1.6', 'v1+3.2'], sfx: [['v1', 'pop'], ['v1+1.6', 'pop'], ['v1+3.2', 'pop'], ['v2', 'drone', { d: 5 }]] }),
  TALK([['B', 'Его надо *уничтожить*. Прямо сейчас.'], ['A', 'А если станет только хуже?'], ['B', 'Хуже, чем *последний кадр*?']], { time: '18:40' }),
  h3('denRoom', [N3('В три ночи вы кладёте фотоаппарат на пол. Дэн берёт *молоток*.'), N3('Дэн шепчет: «На счёт три». Раз. *Два*.'), N3('На часах — три *тринадцать*.')], { time: '03:13', ajar: [[0, { v: .12 }]], kidEyes: [[0, { e: 'wide' }]], denEyes: [[0, { e: 'wide' }]], sfx: [[0, 'heart', { d: 8 }]] }),
  h3('oldcam', [N3('Дэн *бьёт*. Стекло объектива трескается.'), N3('И фотоаппарат *щёлкает*. Сам.')], { count: '1', shake: [.8, 'v1+.9'], sfx: [[.8, 'slam'], ['v1+.9', 'shutter'], ['v1+.95', 'stinger']] }),
  h3('whiteout', [N3('Вспышка такая яркая, что ты *слепнешь*.')], { d: 3 }),
  h3('denRoom', [N3('Когда зрение возвращается, в комнате *тихо*.'), N3('Молоток лежит на полу. Матрас Дэна — *пустой*.'), N3('Дэна *нет*.')], { time: '03:14', ajar: [[0, { v: .3 }]], kidEyes: [[0, { e: 'wide' }]], denGone: true, sfx: [['v2', 'stinger'], [0, 'drone', { d: 8 }]], mood: 'tense' }),
  h3('oldcam', [N3('На счётчике кадров — *ноль*.')], { count: '0', ring: true }),
  h3('phoneFrom', [N3('Твой телефон *вибрирует*.'), N3('Новое фото. Три четырнадцать.')], { time: '03:15', from: 'Галерея', msgs: [{ text: 'Новое фото · 03:14', at: 'v1' }], sfx: [[.2, 'buzz', { d: 1 }], ['v1', 'pop']] }),
  h3('trapped', [N3('На нём — *Дэн*. В какой-то темноте.'), N3('Он смотрит прямо в камеру. И *кричит*.'), N3('Ты подносишь телефон к уху. И слышишь глухой *стук*. Изнутри экрана.')], { caption: '03:14', knocks: ['v1+1', 'v1+1.5', 'v1+2'], sfx: [['v1+1', 'knock'], ['v1+1.5', 'knock'], ['v1+2', 'knock'], [0, 'drone', { d: 8 }]] }),
  h3('end', [N3('Продолжение *следует*.')], { name: 'Продолжение следует', sub: 'Часть 4 — «Негатив»', noSubs: true }),
]},
{ n: 514, title: 'Негатив', mood: 'horror', shots: [
  h3('trapped', [N3('Это не фотошоп.'), N3('Это твой лучший друг. Он *внутри* фотографии.'), N3('И он стучит в неё *изнутри*.')], { caption: '03:14', knocks: ['v2+1', 'v2+1.5', 'v2+2'], sfx: [['v2+1', 'knock'], ['v2+1.5', 'knock'], ['v2+2', 'knock'], [0, 'drone', { d: 12 }]] }),
  h3('title', [N3('Часть четвёртая. *Негатив*.')], { series: 'ФОТО В 3:14', kicker: 'Часть 4', name: 'Негатив', noSubs: true, sfx: [[.1, 'stinger']] }),
  h3('hall', [N3('Мама Дэна думает, что он ночует у тебя. Ты *врёшь*, что он спит.'), N3('Ты не спишь вторую ночь. Глаза *горят*, руки дрожат.'), N3('У тебя есть один день, чтобы его *вернуть*.')], { time: '08:30', lit: [[0, { v: 1 }]], chars: [KID([[0, { eyes: 'tired', mouth: 'flat', look: [.6, 0], sweat: true }]], 160, .95)] }),
  h3('oldcam', [N3('В разбитом фотоаппарате осталась *плёнка*.'), N3('Если её проявить, может, ты увидишь, *кто снимал*.'), N3('Объектив треснул. Но счётчик всё ещё показывает *ноль*.')], { count: '0' }),
  h3('darkroom', [N3('В школе есть старый фотокружок. Ты прогуливаешь урок и закрываешься в *тёмной комнате*.'), N3('Красный свет. Запах химии. Ты опускаешь плёнку в проявитель.'), N3('Руководитель кружка в отпуске. Ключ ты взял *без спроса*.')], { time: '12:05', chars: [{ who: 'kid', x: 360, y: 1340, s: 1, k: [[0, { eyes: 'normal', mouth: 'flat', look: [0, .6], armL: -40, armR: -40 }]] }], sfx: [[0, 'hum', { d: 8 }]] }),
  h3('darkroom', [N3('Кадры проступают медленно. Спальни. Спящие дети. *Твоя* комната.'), N3('Ты узнаёшь свою подушку. Свою пижаму. Своё *лицо*.')], { time: '12:20', neg: true }),
  h3('negative', [N3('А на одном кадре в зеркале отразился тот, *кто снимал*.'), N3('Высокий. Слишком худой. В длинном пальто.'), N3('А вместо лица — *объектив*.'), N3('Он стоит прямо у твоей кровати. И держит фотоаппарат *у груди*.')], { revealAt: 'v1', sfx: [['v2+.6', 'stinger'], [0, 'heart', { d: 8 }]], mood: 'tense' }),
  h3('note', [N3('На обороте последнего фото кто-то написал правила. *Дрожащей рукой*.'), N3('Он снимает только в три четырнадцать.'), N3('Он снимает только *спящих*.'), N3('Если сфотографировать его *первым* — он сам станет фотографией.'), N3('Внизу подпись. Имя мальчика из *девяносто восьмого* года.')], { head: 'Его правила', sub: '', rules: [{ text: '1. Он снимает только в 3:14.', at: 'v1' }, { text: '2. Он снимает только спящих.', at: 'v2' }, { text: '3. Сними его первым — и он сам станет фотографией.', at: 'v3', red: true }] }),
  h3('darkroom', [N3('Снять его *первым*.'), N3('Значит, этой ночью нельзя спать. Нужно только *притвориться*.'), N3('Ты собираешь плёнку и снимки в рюкзак.')], { time: '12:31', chars: [{ who: 'kid', x: 360, y: 1340, s: 1, k: [[0, { eyes: 'normal', mouth: 'smirk', look: [0, -.4] }]] }] }),
  h3('darkroom', [N3('Красная лампа *мигает*.'), N3('И в темноте за твоей спиной *щёлкает* затвор.')], { time: '12:32', flicker: [[.2, 'v1+1.5']], chars: [{ who: 'kid', x: 360, y: 1340, s: 1, k: [[0, { eyes: 'wide', mouth: 'o', sweat: true }]] }], shake: ['v1+1'], sfx: [['v1+1', 'shutter'], ['v1+1.05', 'stinger']] }),
  h3('darkroom', [N3('Ты оборачиваешься. *Никого*.'), N3('Только на столе лежит свежий, ещё *мокрый* снимок.')], { time: '12:32', wet: 'v1', chars: [{ who: 'kid', x: 220, y: 1340, s: 1, k: [[0, { eyes: 'wide', mouth: 'flat', look: [.8, .3] }]] }] }),
  h3('photo', [N3('На нём — ты. *Здесь*. В тёмной комнате. Со спины.'), N3('Он больше *не ждёт* ночи.'), N3('Ты вылетаешь в коридор. Звенит звонок, вокруг сотни людей.'), N3('Но ты всё равно чувствуешь на себе *взгляд*. Сквозь объектив.')], { dist: 2, stamp: 'Только что', date: '12:32', sfx: [[0, 'shutter'], ['v1', 'stinger']], mood: 'tense' }),
  h3('scare', [], { d: 1.2, sfx: [[0, 'stinger']] }),
  h3('end', [N3('Продолжение *следует*.')], { name: 'Продолжение следует', sub: 'Финал — «Кто снимает»', noSubs: true }),
]},
{ n: 515, title: 'Кто снимает', mood: 'horror', shots: [
  h3('lensClose', [N3('Сегодня в три четырнадцать он придёт *за тобой*.'), N3('И у тебя будет только *одна* вспышка.')], { d: 4, sfx: [[0, 'drone', { d: 10 }]] }),
  h3('title', [N3('Фото в три четырнадцать. *Финал*.')], { series: 'ФОТО В 3:14', kicker: 'Финал', name: 'Кто снимает', noSubs: true, sfx: [[.1, 'stinger']] }),
  h3('bedFinal', [N3('Ты ложишься в своей комнате. Свет выключен. Дверца шкафа приоткрыта.'), N3('Под одеялом — телефон. Камера включена. Вспышка — *на максимум*.'), N3('Ты проверил всё десять раз. Батарея — сто процентов. Звук затвора — *выключен*.')], { time: '01:40', phoneGlow: 'v1', kidEyes: [[0, { e: 'normal' }]] }),
  h3('bedFinal', [N3('Ты дышишь медленно. Как спящий. Глаза *закрыты*.'), N3('Под одеялом жарко. Пот течёт по виску. Но шевелиться *нельзя*.'), N3('Два пятьдесят. Три ноль пять. Три *тринадцать*.')], { time: ['02:50', '03:13'], kidEyes: [[0, { e: 'closed' }]], sfx: [[0, 'heart', { d: 10 }]] }),
  h3('bedFinal', [N3('*Скрип*. Дверца шкафа открывается.')], { time: '03:14', ajar: [[0, { v: .1 }], [.5, { v: .9 }]], kidEyes: [[0, { e: 'closed' }]], sfx: [[.5, 'creak'], [.5, 'drone', { d: 8 }]], mood: 'tense' }),
  h3('bedFinal', [N3('Шаги. Медленные. *Тяжёлые*. Пол скрипит у самой кровати.'), N3('Дыхания нет. Только тихое *жужжание*. Как будто фокусируется объектив.'), N3('По комнате ползёт холод. Он *наклоняется* над тобой.')], { time: '03:14', ajar: [[0, { v: .9 }]], ph: [[0, { show: true, x: 640, y: 1040, s: .8 }], [1.5, { show: true, x: 560, y: 1060, s: .9 }], ['v2', { show: true, x: 470, y: 1080, s: 1, lean: -18 }]], kidEyes: [[0, { e: 'closed' }]], sfx: [[.2, 'steps', { n: 4 }], ['v1', 'whisper']] }),
  h3('lensClose', [N3('Ты чуть приоткрываешь глаза. Прямо над тобой — *объектив*.'), N3('В нём — твоё *отражение*.'), N3('Внутри что-то медленно *взводится*.')], { d: 4, sfx: [['v2', 'click'], [0, 'heart', { d: 8 }]] }),
  h3('bedFinal', [N3('*Сейчас*.')], { time: '03:14', ph: [[0, { show: true, x: 470, y: 1080, s: 1, lean: -18 }]], kidEyes: [[0, { e: 'wide' }]], shake: [.4], sfx: [[.3, 'stinger']] }),
  h3('bedFinal', [N3('Ты выдёргиваешь телефон из-под одеяла и жмёшь на кнопку.'), N3('Две вспышки — *одновременно*.')], { time: '03:14', ph: [[0, { show: true, x: 470, y: 1080, s: 1, lean: -18, arm: .6 }]], kidEyes: [[0, { e: 'angry' }]], flashOn: [['v1+.6', { on: true }]], sfx: [['v1+.5', 'shutter'], ['v1+.55', 'shutter']] }),
  h3('whiteout', [N3('Комната становится *белой*.'), N3('Он кричит. Звук такой, будто кто-то рвёт *плёнку*.')], { scream: true, d: 4, sfx: [[.3, 'static', { d: 2.5 }], [.3, 'stinger']] }),
  h3('falling', [N3('А потом на пол медленно падает *фотография*.')], { d: 5, sfx: [[4.2, 'switch']] }),
  h3('hall', [N3('А у шкафа, кашляя и хватая воздух, лежит *Дэн*.'), N3('Ты обнимаешь его так крепко, что он *хрипит*.'), ['B', 'Сколько… сколько меня не было?'], ['A', 'Один день.'], ['B', 'Там была *вечность*.']], { time: '03:16', A: 'h_pkid', B: 'h_pden', lit: [[0, { v: 1 }]], bubbleY: 330, chars: [{ who: 'kid', x: 170, y: 1320, s: .9, k: [[0, { eyes: 'wide', mouth: 'flat', look: [.8, 0] }]] }, { who: 'den', x: 560, y: 1320, s: .9, k: [[0, { eyes: 'tired', mouth: 'open', look: [-.8, 0], sweat: true }]] }], mood: 'sad' }),
  h3('trapped', [N3('Утром ты рассматриваешь ту фотографию.'), N3('На ней — *он*. Объектив прижат к стеклу изнутри.'), N3('Он больше не двигается. Просто *смотрит*.')], { ph: true, caption: '03:14', d: 3 }),
  h3('deleted', [N3('Снимок вы сжигаете во дворе. Фото из галереи ты *удаляешь*.')], { head: 'Галерея', sub: '1 фото', dialog: .8, sfx: [[.8, 'pop']] }),
  h3('deleted', [N3('Всё *закончилось*.'), N3('Только в папке «Недавно удалённые» лежит одно фото.'), N3('Время съёмки — три четырнадцать. *Сегодня*.')], { closer: true, sfx: [['v2+1.2', 'stinger']], mood: 'tense' }),
  h3('scare', [], { d: 1.2, sfx: [[0, 'stinger']] }),
  h3('end', [N3('*Конец?*')], { name: 'Конец?', sub: 'Фото в 3:14', noSubs: true }),
]},
];
HORROR3.forEach(f => { f.voiced = true; f.shots.forEach(s => { s.d = s.d || 3; s.lead = s.lead ?? .7; s.gap = s.gap ?? .8; s.tail = s.tail ?? 1.4; s.hlCol = HRED; }); });
if (typeof module !== 'undefined') module.exports = { HORROR3 };
