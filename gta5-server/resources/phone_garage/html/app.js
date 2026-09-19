(() => {
  'use strict';

  const RES = (typeof GetParentResourceName === 'function')
    ? GetParentResourceName()
    : 'phone_garage';

  const state = {
    money: 0, cars: [], catalog: [], active: null, filter: 'Все',
    outfits: [], wardrobe: false,
    backpack: { owned: false, slots: 18, price: 0, available: false },
  };

  const $ = (id) => document.getElementById(id);
  const phone = $('phone');

  const post = (endpoint, body = {}) =>
    fetch(`https://${RES}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
    }).catch(() => {});

  const money = (n) => '$' + Number(n || 0).toLocaleString('ru-RU');

  // Номер хранится восемью символами, как требует игра (A123BC77).
  // Показываем регион отдельно: A123BC 77.
  const plate = (value) => {
    const raw = String(value || '');
    return /^[A-Z]\d{3}[A-Z]{2}\d{2}$/.test(raw)
      ? `${raw.slice(0, 6)} ${raw.slice(6)}`
      : raw;
  };


  // A blocking confirm() is unreliable inside the game's browser, so the button
  // arms itself instead and disarms again after a few seconds.
  function armConfirm(btn, label, action) {
    let armed = false;
    let timer = null;

    btn.addEventListener('click', () => {
      if (armed) {
        clearTimeout(timer);
        action();
        return;
      }
      armed = true;
      btn.textContent = 'Точно?';
      timer = setTimeout(() => {
        armed = false;
        btn.textContent = label;
      }, 3000);
    });
  }

  // --- navigation ---------------------------------------------------------

  function show(view) {
    ['home', 'garage', 'shop', 'wardrobe'].forEach((name) => {
      $(`view-${name}`).classList.toggle('hidden', name !== view);
    });
  }

  document.addEventListener('click', (ev) => {
    const target = ev.target.closest('[data-open]');
    if (target) show(target.dataset.open);
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') close();
  });

  function close() {
    phone.classList.add('hidden');
    post('close');
  }

  // --- rendering ----------------------------------------------------------

  function renderGarage() {
    const list = $('garage-list');
    list.innerHTML = '';

    if (!state.cars.length) {
      list.innerHTML =
        '<p class="empty">В гараже пусто.<br>Загляни в Автосалон.</p>';
      return;
    }

    state.cars.forEach((car) => {
      const isActive = state.active === car.plate;
      const card = document.createElement('div');
      card.className = 'card' + (isActive ? ' active' : '');
      card.innerHTML = `
        <div class="card-top">
          <span class="card-title"></span>
          <span class="card-price">${money(Math.floor((car.price || 0) * 0.6))}</span>
        </div>
        <div class="card-sub">${isActive ? 'вызвана · ' : ''}номер <b></b></div>
        <div class="card-actions">
          <button class="btn primary" data-act="${isActive ? 'store' : 'call'}">
            ${isActive ? 'Убрать в гараж' : 'Вызвать'}
          </button>
          <button class="btn danger" data-act="sell">Продать</button>
        </div>`;

      // Labels and plates come from the server, so set them as text, not HTML.
      card.querySelector('.card-title').textContent = car.label || car.model;
      card.querySelector('.card-sub b').textContent = plate(car.plate);

      card.querySelectorAll('button[data-act]').forEach((btn) => {
        const act = btn.dataset.act;
        if (act === 'sell') {
          armConfirm(btn, 'Продать', () => post('sell', { plate: car.plate }));
        } else if (act === 'call') {
          btn.addEventListener('click', () => post('call', { plate: car.plate }));
        } else {
          btn.addEventListener('click', () => post('store'));
        }
      });

      list.appendChild(card);
    });
  }

  function renderBackpack() {
    const card = $('pack-card');
    const pack = state.backpack || {};

    if (!pack.available || pack.owned) {
      card.classList.add('hidden');
      return;
    }

    card.classList.remove('hidden');
    $('pack-note').textContent =
      `+${pack.slots} слотов в инвентаре · ${money(pack.price)}`;

    const buy = $('pack-buy');
    buy.disabled = state.money < pack.price;
    buy.textContent = state.money < pack.price ? 'Не хватает' : 'Купить';
  }

  function renderWardrobe() {
    renderBackpack();

    const list = $('wardrobe-list');
    list.innerHTML = '';

    if (!state.wardrobe) {
      list.innerHTML =
        '<p class="empty">Гардероб недоступен.<br>Ресурс ls_shops не запущен.</p>';
      return;
    }

    if (!state.outfits.length) {
      list.innerHTML =
        '<p class="empty">Сохранённых образов нет.<br>' +
        'Переоденься и нажми «Сохранить текущий».</p>';
      return;
    }

    state.outfits.forEach((outfit) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-top"><span class="card-title"></span></div>
        <div class="card-actions">
          <button class="btn primary" data-act="wear">Надеть</button>
          <button class="btn danger" data-act="drop">Удалить</button>
        </div>`;

      card.querySelector('.card-title').textContent = outfit.name;
      card.querySelector('[data-act="wear"]').addEventListener('click', () => {
        post('wardrobeWear', { id: outfit.id });
      });
      armConfirm(card.querySelector('[data-act="drop"]'), 'Удалить', () => {
        post('wardrobeDelete', { id: outfit.id });
      });

      list.appendChild(card);
    });
  }

  $('pack-buy').addEventListener('click', () => post('buyBackpack'));

  $('outfit-save').addEventListener('click', () => {
    const field = $('outfit-name');
    post('wardrobeSave', { name: field.value });
    field.value = '';
  });

  $('outfit-name').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') $('outfit-save').click();
    ev.stopPropagation();
  });

  function renderChips() {
    const classes = ['Все', ...new Set(state.catalog.map((c) => c.class))];
    const box = $('shop-chips');
    box.innerHTML = '';

    classes.forEach((name) => {
      const chip = document.createElement('button');
      chip.className = 'chip' + (state.filter === name ? ' on' : '');
      chip.textContent = name;
      chip.addEventListener('click', () => {
        state.filter = name;
        renderChips();
        renderShop();
      });
      box.appendChild(chip);
    });
  }

  function renderShop() {
    const list = $('shop-list');
    list.innerHTML = '';

    const owned = new Set(state.cars.map((c) => c.model));
    const items = state.catalog.filter(
      (c) => state.filter === 'Все' || c.class === state.filter
    );

    if (!items.length) {
      list.innerHTML = '<p class="empty">Ничего не найдено.</p>';
      return;
    }

    items.forEach((car) => {
      const affordable = state.money >= car.price;
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-top">
          <span class="card-title"></span>
          <span class="card-price">${money(car.price)}</span>
        </div>
        <div class="card-sub">${car.class}${owned.has(car.model) ? ' · уже есть' : ''}</div>
        <div class="card-actions">
          <button class="btn primary" ${affordable ? '' : 'disabled'}>
            ${affordable ? 'Купить' : 'Не хватает денег'}
          </button>
        </div>`;

      card.querySelector('.card-title').textContent = car.label;
      card.querySelector('button').addEventListener('click', () => {
        post('buy', { model: car.model });
      });

      list.appendChild(card);
    });
  }

  function render() {
    $('balance').textContent = money(state.money);
    $('home-balance').textContent = money(state.money);
    $('garage-count').textContent = state.cars.length;
    $('wardrobe-count').textContent = state.outfits.length;
    renderGarage();
    renderWardrobe();
    renderChips();
    renderShop();
  }

  // --- clock --------------------------------------------------------------

  setInterval(() => {
    const now = new Date();
    $('clock').textContent =
      String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0');
  }, 1000);

  // --- messages from the client script ------------------------------------

  window.addEventListener('message', (ev) => {
    const data = ev.data || {};

    if (data.action === 'open') {
      phone.classList.remove('hidden');
      show('home');
    } else if (data.action === 'close') {
      phone.classList.add('hidden');
    } else if (data.action === 'state') {
      state.money = data.money || 0;
      state.cars = data.cars || [];
      state.catalog = data.catalog || [];
      state.active = data.active || null;
      state.outfits = data.outfits || [];
      state.wardrobe = data.wardrobe === true;
      state.backpack = data.backpack || state.backpack;
      render();
    }
  });
})();
