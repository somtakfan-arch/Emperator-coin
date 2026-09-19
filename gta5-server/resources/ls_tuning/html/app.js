(() => {
  'use strict';

  const RES = (typeof GetParentResourceName === 'function')
    ? GetParentResourceName()
    : 'ls_tuning';

  const $ = (id) => document.getElementById(id);
  const shop = $('shop');

  let catalog = [];
  let draft = {};      // id -> chosen value, only what changed
  let original = {};   // id -> value the car arrived with
  let perfStep = 1.0;

  const post = (endpoint, body = {}) =>
    fetch(`https://${RES}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
    }).catch(() => {});

  const money = (n) => '$' + Number(n || 0).toLocaleString('ru-RU');

  const NEON = ['#ffffff', '#ff0000', '#ff8000', '#ffff00', '#00ff00', '#00ffff',
                '#0080ff', '#0000ff', '#8000ff', '#ff00ff', '#ff0080'];
  const SMOKE = ['#ffffff', '#ff0000', '#ff8c00', '#ffff00', '#00c800', '#00c8ff',
                 '#0000ff', '#a000ff', '#ff00a0', '#141414'];

  // Mirrors the server's pricing exactly: a performance step costs more, but
  // every step is selectable from the start.
  function priceOf(entry, value) {
    const stock = value === -1 || value === false;
    if (stock) return 0;
    if (entry.perf) {
      const step = Math.max(0, Number(value) || 0);
      return Math.floor(entry.price * (1 + step * perfStep));
    }
    return entry.price;
  }

  function changed(entry) {
    if (!(entry.id in draft)) return false;
    return JSON.stringify(draft[entry.id]) !== JSON.stringify(original[entry.id]);
  }

  function total() {
    return catalog.reduce((sum, entry) =>
      changed(entry) ? sum + priceOf(entry, draft[entry.id]) : sum, 0);
  }

  function refreshTotals() {
    const sum = total();
    $('total').textContent = money(sum);
    $('apply').disabled = sum === 0 && !catalog.some(changed);

    catalog.forEach((entry) => {
      const row = document.querySelector(`[data-row="${entry.id}"]`);
      if (!row) return;
      row.classList.toggle('changed', changed(entry));

      const price = row.querySelector('.row-price');
      if (price) {
        const value = entry.id in draft ? draft[entry.id] : original[entry.id];
        const cost = changed(entry) ? priceOf(entry, value) : 0;
        price.textContent = cost > 0 ? money(cost) : (changed(entry) ? 'снять' : money(entry.price));
        price.classList.toggle('free', cost === 0);
      }
    });
  }

  function set(entry, value) {
    draft[entry.id] = value;
    post('preview', { id: entry.id, value });
    refreshTotals();
  }

  // --- control builders ---------------------------------------------------

  function stepper(row, label, current, min, max, onPick, format) {
    const pick = document.createElement('div');
    pick.className = 'pick';
    pick.innerHTML = '<span class="pick-name"></span>'
      + '<button class="arrow" data-dir="-1">‹</button>'
      + '<span class="pick-value"></span>'
      + '<button class="arrow" data-dir="1">›</button>';

    pick.querySelector('.pick-name').textContent = label;
    const readout = pick.querySelector('.pick-value');

    let value = current;
    const show = () => { readout.textContent = format(value); };
    show();

    pick.querySelectorAll('.arrow').forEach((btn) => {
      btn.addEventListener('click', () => {
        value += Number(btn.dataset.dir);
        if (value < min) value = max;
        if (value > max) value = min;
        show();
        onPick(value);
      });
    });

    row.appendChild(pick);
    return { get: () => value, show: (v) => { value = v; show(); } };
  }

  function swatch(row, colours, index) {
    const dot = document.createElement('span');
    dot.className = 'swatch';
    dot.style.background = colours[index % colours.length];
    row.querySelector('.row-top').appendChild(dot);
    return dot;
  }

  // --- rendering ----------------------------------------------------------

  const GROUPS = [
    { title: 'Ходовая', ids: ['engine', 'brakes', 'gearbox', 'suspension', 'armour', 'turbo'] },
    { title: 'Кузов', ids: ['spoiler', 'fbumper', 'rbumper', 'skirt', 'exhaust', 'cage',
                            'grille', 'hood', 'fender', 'rfender', 'roof', 'livery',
                            'plateh', 'horn'] },
    { title: 'Салон', ids: ['trim', 'dial', 'wheelint', 'shifter', 'plaque', 'ornament'] },
    { title: 'Внешность', ids: ['wheels', 'colour1', 'colour2', 'pearl', 'wheelcol',
                                'tint', 'neon', 'neoncol', 'smoke', 'xenon'] },
  ];

  function renderRow(entry, box) {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.row = entry.id;
    row.innerHTML = '<div class="row-top"><span class="row-label"></span>'
      + '<span class="row-price"></span></div>';
    row.querySelector('.row-label').textContent = entry.label;

    const value = entry.value;
    original[entry.id] = value;

    if (entry.kind === 'toggle') {
      stepper(row, 'Статус', value ? 1 : 0, 0, 1,
        (v) => set(entry, v === 1),
        (v) => (v === 1 ? 'установлено' : 'нет'));

    } else if (entry.kind === 'neon') {
      stepper(row, 'Подсветка', value ? 1 : 0, 0, 1,
        (v) => set(entry, v === 1),
        (v) => (v === 1 ? 'включён' : 'выключен'));

    } else if (entry.kind === 'wheels') {
      const state = { type: value.type, index: value.index };
      stepper(row, 'Тип', state.type, 0, (entry.types || []).length - 1,
        (v) => { state.type = v; set(entry, { type: state.type, index: state.index }); },
        (v) => ((entry.types[v] && entry.types[v].label) || v));
      stepper(row, 'Диск', state.index, -1, Math.max(entry.count - 1, -1),
        (v) => { state.index = v; set(entry, { type: state.type, index: state.index }); },
        (v) => (v < 0 ? 'сток' : `${v + 1} / ${entry.count}`));

    } else if (entry.kind === 'colour') {
      stepper(row, 'Цвет', value, 0, entry.max,
        (v) => set(entry, v),
        (v) => `${v} / ${entry.max}`);

    } else if (entry.kind === 'tint') {
      const names = ['нет', 'чёрная', 'тёмная', 'светлая', 'зеркальная', 'лёгкая'];
      stepper(row, 'Степень', value, 0, entry.max,
        (v) => set(entry, v),
        (v) => names[v] || v);

    } else if (entry.kind === 'neoncol' || entry.kind === 'smoke') {
      const colours = entry.kind === 'neoncol' ? NEON : SMOKE;
      const dot = swatch(row, colours, value);
      stepper(row, 'Цвет', value, 0, colours.length - 1,
        (v) => { dot.style.background = colours[v]; set(entry, v); },
        (v) => `${v + 1} / ${colours.length}`);

    } else {
      stepper(row, 'Деталь', value, -1, Math.max(entry.count - 1, -1),
        (v) => set(entry, v),
        (v) => {
          if (v < 0) return 'сток';
          const name = entry.names && entry.names[v + 1];
          return name && name !== 'NULL' ? name : `вариант ${v + 1} / ${entry.count}`;
        });
    }

    box.appendChild(row);
  }

  function render() {
    const box = $('rows');
    box.innerHTML = '';
    draft = {};
    original = {};

    const byId = {};
    catalog.forEach((entry) => { byId[entry.id] = entry; });

    GROUPS.forEach((group) => {
      const present = group.ids.map((id) => byId[id]).filter(Boolean);
      if (!present.length) return;

      const title = document.createElement('div');
      title.className = 'group';
      title.textContent = group.title;
      box.appendChild(title);

      present.forEach((entry) => renderRow(entry, box));
    });

    refreshTotals();
  }

  $('apply').addEventListener('click', () => post('apply'));
  $('cancel').addEventListener('click', () => post('cancel'));

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') post('cancel');
  });

  window.addEventListener('message', (ev) => {
    const data = ev.data || {};

    if (data.action === 'open') {
      catalog = data.catalog || [];
      perfStep = typeof data.perfStep === 'number' ? data.perfStep : 1.0;
      $('plate').textContent = data.plate || '';
      render();
      shop.classList.remove('hidden');
    } else if (data.action === 'close') {
      shop.classList.add('hidden');
    }
  });
})();
