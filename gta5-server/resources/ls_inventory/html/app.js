(() => {
  'use strict';

  const RES = (typeof GetParentResourceName === 'function')
    ? GetParentResourceName()
    : 'ls_inventory';

  const $ = (id) => document.getElementById(id);
  const wrap = $('wrap');

  let state = {
    slots: [], capacity: 54, base: 54,
    backpack: false, backpackSlots: 18, backpackPrice: 0, money: 0,
  };
  let picked = null;
  let dragFrom = null;

  const post = (endpoint, body = {}) =>
    fetch(`https://${RES}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
    }).catch(() => {});

  const money = (n) => '$' + Number(n || 0).toLocaleString('ru-RU');

  const KIND_LABEL = {
    weapon: 'Оружие',
    armour: 'Броня',
    food: 'Расходник',
    misc: 'Разное',
  };

  function bySlot() {
    const map = new Map();
    (state.slots || []).forEach((entry) => map.set(entry.slot, entry));
    return map;
  }

  function render() {
    const map = bySlot();
    const grid = $('grid');
    grid.innerHTML = '';

    $('money').textContent = money(state.money);
    $('capacity').textContent = `${map.size} / ${state.capacity} занято`;

    for (let slot = 1; slot <= state.capacity; slot += 1) {
      if (slot === state.base + 1) {
        const divider = document.createElement('div');
        divider.className = 'divider';
        divider.textContent = 'Рюкзак';
        grid.appendChild(divider);
      }

      const entry = map.get(slot);
      const el = document.createElement('div');
      el.className = 'slot' + (entry ? '' : ' empty') + (slot > state.base ? ' extra' : '');
      el.dataset.slot = String(slot);

      if (entry) {
        el.classList.remove('empty');
        el.innerHTML = `
          <span class="slot-kind kind-${entry.kind || 'misc'}"></span>
          <span class="slot-name"></span>
          ${entry.count > 1 ? `<span class="slot-count">${entry.count}</span>` : ''}`;
        el.querySelector('.slot-name').textContent = entry.label || entry.item;
        el.draggable = true;

        if (picked === slot) el.classList.add('picked');

        el.addEventListener('click', () => {
          picked = slot;
          render();
        });

        el.addEventListener('dragstart', () => { dragFrom = slot; });
      }

      el.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        el.classList.add('dragover');
      });
      el.addEventListener('dragleave', () => el.classList.remove('dragover'));
      el.addEventListener('drop', (ev) => {
        ev.preventDefault();
        el.classList.remove('dragover');
        if (dragFrom && dragFrom !== slot) {
          post('move', { from: dragFrom, to: slot });
          picked = slot;
        }
        dragFrom = null;
      });

      grid.appendChild(el);
    }

    renderDetail(map);
    renderBackpack();
  }

  function renderDetail(map) {
    const entry = picked ? map.get(picked) : null;
    const detail = $('detail');
    const use = $('use');
    const drop = $('drop');

    if (!entry) {
      detail.textContent = 'Выбери слот';
      use.disabled = true;
      drop.disabled = true;
      picked = null;
      return;
    }

    detail.innerHTML = '<b></b> — ' + (KIND_LABEL[entry.kind] || 'Разное')
      + (entry.count > 1 ? ` · ${entry.count} шт.` : '');
    detail.querySelector('b').textContent = entry.label || entry.item;

    use.disabled = entry.kind === 'misc';
    drop.disabled = false;
  }

  function renderBackpack() {
    const card = $('backpack-card');
    if (state.backpack) {
      card.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
    $('backpack-note').textContent =
      `+${state.backpackSlots} слотов · ${money(state.backpackPrice)}`;
    const buy = $('backpack-buy');
    buy.disabled = state.money < state.backpackPrice;
    buy.textContent = state.money < state.backpackPrice ? 'Не хватает' : 'Купить';
  }

  // --- actions ------------------------------------------------------------

  $('use').addEventListener('click', () => {
    if (picked) post('use', { slot: picked });
  });

  // A blocking confirm() is unreliable in the game's browser, so the button
  // arms itself for a few seconds instead.
  (() => {
    const drop = $('drop');
    let armed = false;
    let timer = null;

    drop.addEventListener('click', () => {
      if (!picked) return;
      if (armed) {
        clearTimeout(timer);
        armed = false;
        drop.textContent = 'Выбросить';
        post('drop', { slot: picked });
        picked = null;
        return;
      }
      armed = true;
      drop.textContent = 'Точно?';
      timer = setTimeout(() => {
        armed = false;
        drop.textContent = 'Выбросить';
      }, 3000);
    });
  })();

  $('backpack-buy').addEventListener('click', () => post('buyBackpack'));
  $('close').addEventListener('click', () => post('close'));

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') post('close');
  });

  // --- messages -----------------------------------------------------------

  window.addEventListener('message', (ev) => {
    const data = ev.data || {};

    if (data.action === 'open') {
      wrap.classList.remove('hidden');
    } else if (data.action === 'close') {
      wrap.classList.add('hidden');
      picked = null;
    } else if (data.action === 'state') {
      state = Object.assign(state, data.state || {});
      render();
    }
  });
})();
