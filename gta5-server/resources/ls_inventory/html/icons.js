// Иконки предметов. Рисуются инлайновым SVG, а не картинками: картинки
// пришлось бы стримить клиенту отдельным ресурсом, а иконка должна быть
// готова в тот момент, когда сервер прислал название предмета.
//
// Файл общий для инвентаря и магазина - правишь в одном месте.
(function (global) {
  'use strict';

  // Все иконки рисуются в квадрате 24x24 одной обводкой, чтобы в сетке
  // они выглядели как один набор, а не как надёрганные откуда попало.
  function svg(body) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      body + '</svg>';
  }

  var SHAPES = {
    pistol: '<path d="M3 8h12l3 3h3v2h-4l-2 3h-3l-1-3H7l-2 4H3z"/><path d="M8 8V6h5v2"/>',
    smg: '<path d="M2 9h14v3H9l-1 4H5l1-4H2z"/><path d="M11 9V6h4v3"/><path d="M16 10h5"/>',
    rifle: '<path d="M2 9h18v2h-4l-1 3h-3l1-3H8l-2 5H3l1-5H2z"/><path d="M10 9V6h3v3"/><path d="M20 8v4"/>',
    shotgun: '<path d="M2 9h20v2H2z"/><path d="M6 11l-2 5H1l2-5"/><path d="M9 9V7h4v2"/><circle cx="20" cy="10" r="1.2"/>',
    sniper: '<path d="M2 11h19v2H2z"/><path d="M6 13l-2 4H1l2-4"/><path d="M9 11V9h3v2"/><path d="M13 7h5"/><path d="M15 7v4"/>',
    mg: '<path d="M2 9h17v3H8l-1 4H4l1-4H2z"/><path d="M11 9V6h4v3"/><path d="M6 16l-2 3"/><path d="M9 16l2 3"/>',
    melee: '<path d="M5 19l6-6"/><path d="M11 13l7-8 2 2-8 7z"/><path d="M4 18l2 2"/>',
    bat: '<path d="M4 20l5-5"/><path d="M9 15c3-3 5-6 9-10l2 2c-4 4-7 6-10 9z"/>',
    grenade: '<circle cx="12" cy="14" r="6"/><path d="M10 8h4v2h-4z"/><path d="M14 8l3-2"/>',
    taser: '<path d="M4 10h9l3 2h4v2h-5l-2 3H7l-1-3H4z"/><path d="M17 7l-2 3h3l-2 3"/>',
    baton: '<path d="M5 19l12-12"/><path d="M15 5l4 4"/><path d="M5 17l2 2"/>',

    armour: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M12 3v18"/>',
    vest: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M8 9h8"/><path d="M8 13h8"/>',

    food: '<path d="M6 3v7a3 3 0 006 0V3"/><path d="M9 10v11"/><path d="M17 3c-1 3-1 6 0 8v10"/>',
    drink: '<path d="M6 4h12l-1.5 16h-9z"/><path d="M7 10h10"/>',
    snack: '<path d="M7 4h10l-1 16H8z"/><path d="M9 8h6"/><path d="M9 12h6"/>',
    medkit: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M12 10v6"/><path d="M9 13h6"/><path d="M9 7V5h6v2"/>',
    pill: '<rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-30 12 12)"/><path d="M9 15l6-6"/>',
    defib: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 12h2l1.5-3 2 6 1.5-3h2"/>',

    mask: '<path d="M4 8c3-2 13-2 16 0 0 6-3 11-8 11S4 14 4 8z"/><circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/>',
    gasmask: '<path d="M5 7c3-2 11-2 14 0 0 5-2 8-4 9l-1 4h-4l-1-4c-2-1-4-4-4-9z"/><circle cx="9.5" cy="11" r="1.4"/><circle cx="14.5" cy="11" r="1.4"/>',
    bandana: '<path d="M4 9c4-3 12-3 16 0l-2 6H6z"/><path d="M18 15l3 4h-5z"/>',

    cuffs: '<circle cx="8" cy="12" r="4"/><circle cx="16" cy="12" r="4"/><path d="M12 12h0"/>',
    key: '<circle cx="7" cy="12" r="4"/><path d="M11 12h10"/><path d="M17 12v4"/><path d="M20 12v3"/>',
    backpack: '<path d="M6 8a6 6 0 0112 0v11H6z"/><path d="M9 8V6a3 3 0 016 0v2"/><path d="M9 13h6"/>',
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6"/><path d="M9 16h6"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',

    drug: '<path d="M12 3c3 4 5 7 5 10a5 5 0 01-10 0c0-3 2-6 5-10z"/>',
    seed: '<path d="M12 21c-5 0-8-4-8-9 5 0 8 4 8 9z"/><path d="M12 21c5 0 8-4 8-9-5 0-8 4-8 9z"/>',
    tool: '<path d="M14 4a4 4 0 00-5 5L4 14v6h6l5-5a4 4 0 005-5l-3 3-3-3z"/>',
    part: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/>',

    jerrycan: '<path d="M5 7h11v13H5z"/><path d="M16 10h3v7h-3"/><path d="M8 4h5v3H8z"/><path d="M7 11h7"/>',
    ore: '<path d="M4 13l5-7 7 2 4 6-6 6H8z"/><path d="M9 6l2 7 5-4"/><path d="M11 13l-3 7"/>',
    log: '<path d="M3 8h13v9H3z"/><ellipse cx="16" cy="12.5" rx="3" ry="4.5"/><ellipse cx="16" cy="12.5" rx="1.2" ry="1.8"/>',
    pelt: '<path d="M7 3c-3 3-4 7-2 10l3 8h8l3-8c2-3 1-7-2-10-2 2-3 3-6 3s-4-1-6-3z"/>',
    meat: '<path d="M8 5c5-3 11 1 10 6-1 4-5 6-8 5"/><path d="M10 16l-4 4-3-1 1-3 4-4z"/><circle cx="14" cy="9" r="1.5"/>',
    fish: '<path d="M3 12c4-5 10-5 14 0-4 5-10 5-14 0z"/><path d="M17 12l4-3v6z"/><circle cx="8" cy="12" r="1"/>',
    crate: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4"/><path d="M12 12v8"/>',
    misc: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M4 11h16"/><path d="M12 7V4"/>'
  };

  // Ключ по id предмета — точное совпадение важнее типа.
  var BY_ID = {
    ARMOUR_50: 'armour', ARMOUR_100: 'vest',
    SNACK: 'snack', BURGER: 'food', WATER: 'drink', ENERGY: 'drink', MEDKIT: 'medkit',
    DEFIBRILLATOR: 'defib',
    HANDCUFFS: 'cuffs', CUFF_KEY: 'key',
    BACKPACK: 'backpack', JERRYCAN: 'jerrycan',
    ORE_RAW: 'ore', LOG_WOOD: 'log', PELT: 'pelt', MEAT_RAW: 'meat', FISH: 'fish',
    CONTRABAND: 'crate',
    MASK_GASMASK: 'gasmask', MASK_BANDANA: 'bandana',
    WEAPON_STUNGUN: 'taser', WEAPON_NIGHTSTICK: 'baton', WEAPON_BAT: 'bat',
    WEAPON_CROWBAR: 'tool', WEAPON_KNIFE: 'melee', WEAPON_MACHETE: 'melee'
  };

  // Оружие различается по куску имени: WEAPON_PUMPSHOTGUN -> дробовик.
  var WEAPON_HINTS = [
    ['SHOTGUN', 'shotgun'],
    ['SNIPER', 'sniper'], ['MARKSMAN', 'sniper'],
    ['SMG', 'smg'], ['MACHINEPISTOL', 'smg'],
    ['MG', 'mg'], ['MINIGUN', 'mg'],
    ['RIFLE', 'rifle'], ['CARBINE', 'rifle'],
    ['GRENADE', 'grenade'], ['MOLOTOV', 'grenade'], ['STICKY', 'grenade'],
    ['PISTOL', 'pistol'], ['REVOLVER', 'pistol']
  ];

  var BY_TYPE = {
    weapon: 'pistol', armour: 'armour', food: 'food', painkiller: 'pill',
    defib: 'defib', mask: 'mask', drug: 'drug', part: 'part', tool: 'tool',
    doc: 'doc', misc: 'misc'
  };

  function shapeKey(id, type) {
    id = String(id || '').toUpperCase();
    if (BY_ID[id]) return BY_ID[id];

    if (type === 'weapon' || id.indexOf('WEAPON_') === 0) {
      for (var i = 0; i < WEAPON_HINTS.length; i += 1) {
        if (id.indexOf(WEAPON_HINTS[i][0]) !== -1) return WEAPON_HINTS[i][1];
      }
      return 'pistol';
    }
    if (id.indexOf('MASK_') === 0) return 'mask';
    if (id.indexOf('PAINKILLER') === 0) return 'pill';
    return BY_TYPE[type] || 'misc';
  }

  // Возвращает готовый <svg>. Никогда не падает: неизвестный предмет
  // получает коробку, а не пустое место в сетке.
  function iconFor(id, type) {
    return svg(SHAPES[shapeKey(id, type)] || SHAPES.misc);
  }

  global.ItemIcons = { iconFor: iconFor, shapeKey: shapeKey };
}(window));
