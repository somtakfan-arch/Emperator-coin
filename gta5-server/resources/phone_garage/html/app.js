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
    ['home', 'garage', 'shop', 'wardrobe', 'family', 'estate', 'auction', 'forum']
      .forEach((name) => {
      $(`view-${name}`).classList.toggle('hidden', name !== view);
    });
  }

  document.addEventListener('click', (ev) => {
    const target = ev.target.closest('[data-open]');
    if (!target) return;
    show(target.dataset.open);

    // Семья, недвижимость и аукцион живут в ls_property и приходят
    // отдельным сообщением. Раньше его просили только в момент открытия
    // телефона: если оно терялось или опаздывало, экран оставался пустым
    // навсегда и никак об этом не говорил.
    if (['family', 'estate', 'auction'].indexOf(target.dataset.open) !== -1) {
      post('estateRefresh');
    }
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
          <button class="btn" data-act="auction">На аукцион</button>
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
        } else if (act === 'auction') {
          btn.addEventListener('click', () => {
            const price = prompt('Стартовая цена');
            if (price) {
              post('auctionList', {
                kind: 'car', ref: car.plate, price: Number(price), minutes: 60
              });
            }
          });
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

  // --- семья, недвижимость, аукцион ---------------------------------------
  // Данные приходят из ls_property одним куском; телефон только рисует.

  let estate = { family: {}, properties: [], auctions: [], slots: 2, money: 0 };
  let estateFilter = 'sale';
  let auctionFilter = 'all';

  function cash(value) {
    return '$' + Number(value || 0).toLocaleString('ru-RU');
  }

  function card(html) {
    const el = document.createElement('div');
    el.className = 'p-card';
    el.innerHTML = html;
    return el;
  }

  function renderFamily() {
    const box = $('family-body');
    box.innerHTML = '';
    const f = estate.family || {};

    if (f.invite) {
      const el = card(`
        <div class="p-title">Приглашение</div>
        <div class="p-sub">${f.invite.by} зовёт в «${f.invite.family}»</div>
        <div class="p-actions" style="margin-top:10px">
          <button class="btn primary" data-act="accept">Вступить</button>
          <button class="btn" data-act="decline">Отказаться</button>
        </div>`);
      el.querySelector('[data-act="accept"]').onclick = () => post('familyAnswer', { accept: true });
      el.querySelector('[data-act="decline"]').onclick = () => post('familyAnswer', { accept: false });
      box.appendChild(el);
    }

    if (!f.name) {
      const el = card(`
        <div class="p-title">Своя семья</div>
        <div class="p-sub">Создание стоит ${cash(estate.createPrice || 150000)}</div>
        <div style="margin-top:10px">
          <input class="p-field" id="fam-name" maxlength="24" placeholder="Название">
          <input class="p-field" id="fam-tag" maxlength="5" placeholder="Тег, до 5 символов">
          <button class="btn primary" style="width:100%" data-act="create">Создать</button>
        </div>`);
      el.querySelector('[data-act="create"]').onclick = () => post('familyCreate', {
        name: $('fam-name').value, tag: $('fam-tag').value
      });
      box.appendChild(el);
      $('family-badge').classList.toggle('hidden', !f.invite);
      return;
    }

    $('family-badge').classList.add('hidden');

    const head = card(`
      <div class="p-title">${f.name} ${f.tag ? `<span class="p-tag">${f.tag}</span>` : ''}</div>
      <div class="p-sub">Участников: ${(f.members || []).length}</div>`);
    box.appendChild(head);

    const list = card('<div class="p-title">Состав</div>');
    (f.members || []).forEach((member) => {
      const row = document.createElement('div');
      row.className = 'p-row';
      row.innerHTML = `
        <span class="p-dot ${member.online ? 'on' : ''}"></span>
        <span class="grow">${member.name}</span>
        ${member.rank === 'leader' ? '<span class="p-tag fam">глава</span>' : ''}
        ${f.leader && member.rank !== 'leader' ? '<button class="btn">Выгнать</button>' : ''}`;
      const kick = row.querySelector('button');
      if (kick) kick.onclick = () => post('familyKick', { name: member.name });
      list.appendChild(row);
    });
    box.appendChild(list);

    const actions = card(`
      <div class="p-actions">
        ${f.leader
          ? '<button class="btn" data-act="disband">Распустить</button>'
          : '<button class="btn" data-act="leave">Выйти</button>'}
      </div>
      <div class="p-sub" style="margin-top:8px">
        Приглашать — подойди к игроку и нажми E.
      </div>`);
    const disband = actions.querySelector('[data-act="disband"]');
    if (disband) disband.onclick = () => post('familyDisband');
    const leave = actions.querySelector('[data-act="leave"]');
    if (leave) leave.onclick = () => post('familyLeave');
    box.appendChild(actions);
  }

  function renderEstate() {
    const chips = $('estate-chips');
    chips.innerHTML = '';
    [['sale', 'Продаётся'], ['mine', 'Моё']].forEach(([key, label]) => {
      const chip = document.createElement('button');
      chip.className = 'chip' + (estateFilter === key ? ' active' : '');
      chip.textContent = label;
      chip.onclick = () => { estateFilter = key; renderEstate(); };
      chips.appendChild(chip);
    });

    const box = $('estate-list');
    box.innerHTML = '';

    if (!(estate.properties || []).length) {
      box.appendChild(card(
        '<div class="p-sub">Список пока не пришёл с сервера. Закрой и открой телефон.</div>'
      ));
      return;
    }

    box.appendChild(card(`
      <div class="p-title">Мест в гараже: ${estate.slots}</div>
      <div class="p-sub">База 2, офис +5, дом +1…2</div>`));

    (estate.properties || [])
      .filter((row) => (estateFilter === 'mine' ? row.mine : !row.owner))
      .forEach((row) => {
        const el = card(`
          <div class="p-row" style="border:0;padding:0">
            <span class="grow">
              <div class="p-title">${row.label}</div>
              <div class="p-sub">
                ${row.kind === 'office' ? 'Офис' : 'Дом'} ·
                +${row.slots} мест · склад ${row.storage}
                ${row.family ? ' · <span class="p-tag fam">семейный</span>' : ''}
              </div>
            </span>
            <span class="p-price">${row.mine ? '' : cash(row.price)}</span>
          </div>
          <div class="p-actions" style="margin-top:10px"></div>`);

        const actions = el.querySelector('.p-actions');
        const add = (label, primary, fn) => {
          const btn = document.createElement('button');
          btn.className = 'btn' + (primary ? ' primary' : '');
          btn.textContent = label;
          btn.onclick = fn;
          actions.appendChild(btn);
        };

        if (row.mine) {
          add('Продать государству', false, () => post('estateSell', { key: row.key }));
          if (row.kind === 'office') {
            add(row.family ? 'Убрать из семьи' : 'Сделать семейным', false,
              () => post('estateFamily', { key: row.key, on: !row.family }));
          }
          add('На аукцион', true, () => {
            const price = prompt('Стартовая цена');
            if (price) post('auctionList', { kind: 'property', ref: row.key, price: Number(price), minutes: 60 });
          });
        } else {
          add('Купить', true, () => post('estateBuy', { key: row.key }));
        }
        box.appendChild(el);
      });
  }

  function renderAuction() {
    const chips = $('auction-chips');
    chips.innerHTML = '';
    [['all', 'Все лоты'], ['mine', 'Мои']].forEach(([key, label]) => {
      const chip = document.createElement('button');
      chip.className = 'chip' + (auctionFilter === key ? ' active' : '');
      chip.textContent = label;
      chip.onclick = () => { auctionFilter = key; renderAuction(); };
      chips.appendChild(chip);
    });

    const box = $('auction-list');
    box.innerHTML = '';

    const rows = (estate.auctions || []).filter((lot) => auctionFilter !== 'mine' || lot.mine);
    if (!rows.length) {
      box.appendChild(card('<div class="p-sub">Пока пусто. Выставить лот можно из Гаража или Недвижимости.</div>'));
      return;
    }

    rows.forEach((lot) => {
      const mins = Math.ceil(lot.left / 60);
      const el = card(`
        <div class="p-row" style="border:0;padding:0">
          <span class="grow">
            <div class="p-title">${lot.label}</div>
            <div class="p-sub">
              ${lot.kind === 'car' ? 'Машина' : 'Недвижимость'} ·
              ${mins > 0 ? `осталось ${mins} мин` : 'закрывается'}
              ${lot.bidder ? ` · ставка: ${lot.bidder}` : ' · ставок нет'}
              ${lot.leading ? ' · <span class="p-tag mine">ты ведёшь</span>' : ''}
            </div>
          </span>
          <span class="p-price">${cash(lot.price)}</span>
        </div>
        <div class="p-actions" style="margin-top:10px"></div>`);

      const actions = el.querySelector('.p-actions');
      if (!lot.mine) {
        const btn = document.createElement('button');
        btn.className = 'btn primary';
        btn.textContent = 'Перебить';
        btn.onclick = () => post('auctionBid', { id: lot.id });
        actions.appendChild(btn);
      } else {
        actions.innerHTML = '<div class="p-sub">Твой лот</div>';
      }
      box.appendChild(el);
    });
  }

  function renderEstateAll() {
    // Исключение здесь раньше означало навсегда пустой экран без единого
    // следа: ошибки интерфейса не попадают ни в серверный лог, ни куда-либо
    // ещё, кроме клиентской консоли, куда надо догадаться заглянуть. Теперь
    // они уезжают на сервер и видны в обычном логе.
    try {
      $('auction-count').textContent = String((estate.auctions || []).length);
      renderFamily();
      renderEstate();
      renderAuction();
    } catch (e) {
      post('uiError', { where: 'estate', message: String((e && e.stack) || e) });
    }
  }

  window.addEventListener('message', (ev) => {
    const data = ev.data || {};
    if (data.action === 'property') {
      estate = Object.assign(estate, data.data || {});
      renderEstateAll();
    }
  });

  // Первая отрисовка по значениям по умолчанию. Без неё экран до прихода
  // данных был не "пустым списком", а полностью пустым - без заголовков,
  // фильтров и формы создания семьи, - и отличить "ещё не пришло" от
  // "сломалось" было невозможно.
  renderEstateAll();

  // --- форум ---------------------------------------------------------------

  let forum = { boards: [], topics: [], staff: false, limits: {} };
  let forumBoard = null;      // null = все разделы
  let forumOpenId = null;     // открытая тема
  let forumWriting = false;

  function when(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return d.toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  }

  function boardLabel(key) {
    const board = (forum.boards || []).find((b) => b.key === key);
    return board ? board.label : key;
  }

  function renderForum() {
    const chips = $('forum-chips');
    chips.innerHTML = '';

    const chip = (key, label) => {
      const el = document.createElement('button');
      el.className = 'chip' + (forumBoard === key ? ' active' : '');
      el.textContent = label;
      el.onclick = () => {
        forumBoard = key;
        forumOpenId = null;
        forumWriting = false;
        renderForum();
      };
      chips.appendChild(el);
    };

    chip(null, 'Все');
    (forum.boards || []).forEach((b) => chip(b.key, b.label));

    const box = $('forum-body');
    box.innerHTML = '';

    // --- открытая тема ----------------------------------------------------
    if (forumOpenId) {
      const topic = (forum.topics || []).find((t) => t.id === forumOpenId);
      if (!topic) { forumOpenId = null; renderForum(); return; }

      const head = card(`
        <div class="p-title">${topic.title}</div>
        <div class="f-meta">${boardLabel(topic.board)} · ${topic.author} · ${when(topic.at)}
          ${topic.open ? '' : ' · <span class="p-tag">закрыта</span>'}</div>
        <div class="f-body"></div>`);
      head.querySelector('.f-body').textContent = topic.body;
      box.appendChild(head);

      (topic.replies || []).forEach((r) => {
        const el = document.createElement('div');
        el.className = 'p-card f-reply' + (r.staff ? ' staff' : '');
        el.innerHTML = `
          <div class="f-who"><span class="who-name"></span>
            ${r.staff ? '<span class="p-tag fam">официально</span>' : ''}
            <span class="f-meta" style="margin-left:6px">${when(r.at)}</span></div>
          <div class="f-body"></div>`;
        el.querySelector('.who-name').textContent = r.name;
        el.querySelector('.f-body').textContent = r.body;
        box.appendChild(el);
      });

      if (topic.open) {
        const form = card(`
          <textarea class="p-field" id="f-reply" maxlength="${forum.limits.reply || 500}"
            placeholder="Ответить"></textarea>
          <div class="p-actions">
            <button class="btn primary" data-act="reply">Ответить</button>
            ${(topic.mine || forum.staff)
              ? '<button class="btn" data-act="close">Закрыть тему</button>' : ''}
            <button class="btn" data-act="back">Назад</button>
          </div>`);
        form.querySelector('[data-act="reply"]').onclick = () => {
          const body = $('f-reply').value;
          if (body.trim()) post('forumReply', { id: topic.id, body });
        };
        const closeBtn = form.querySelector('[data-act="close"]');
        if (closeBtn) closeBtn.onclick = () => post('forumClose', { id: topic.id });
        form.querySelector('[data-act="back"]').onclick = () => {
          forumOpenId = null;
          renderForum();
        };
        box.appendChild(form);
      } else {
        const back = card('<button class="btn" style="width:100%">Назад</button>');
        back.querySelector('button').onclick = () => { forumOpenId = null; renderForum(); };
        box.appendChild(back);
      }
      return;
    }

    // --- новая тема -------------------------------------------------------
    if (forumWriting) {
      const board = (forum.boards || []).find((b) => b.key === forumBoard)
        || (forum.boards || [])[0];
      const el = card(`
        <div class="p-title">Новая тема — ${board ? board.label : ''}</div>
        <div class="p-sub">${board ? board.hint : ''}</div>
        <div style="margin-top:10px">
          <input class="p-field" id="f-title" maxlength="${forum.limits.title || 60}"
            placeholder="Заголовок">
          <textarea class="p-field" id="f-body" maxlength="${forum.limits.body || 900}"
            placeholder="Текст"></textarea>
          <div class="p-actions">
            <button class="btn primary" data-act="send">Отправить</button>
            <button class="btn" data-act="cancel">Отмена</button>
          </div>
        </div>`);
      el.querySelector('[data-act="send"]').onclick = () => {
        const title = $('f-title').value;
        const body = $('f-body').value;
        if (title.trim() && body.trim()) {
          post('forumPost', { board: board ? board.key : '', title, body });
          forumWriting = false;
        }
      };
      el.querySelector('[data-act="cancel"]').onclick = () => { forumWriting = false; renderForum(); };
      box.appendChild(el);
      return;
    }

    // --- список -----------------------------------------------------------
    const write = card('<button class="btn primary" style="width:100%">Написать</button>');
    write.querySelector('button').onclick = () => {
      if (!forumBoard) forumBoard = (forum.boards[0] || {}).key;
      forumWriting = true;
      renderForum();
    };
    box.appendChild(write);

    const rows = (forum.topics || [])
      .filter((t) => !forumBoard || t.board === forumBoard);

    if (!rows.length) {
      box.appendChild(card('<div class="p-sub">Пока пусто.</div>'));
      return;
    }

    rows.forEach((topic) => {
      const el = card(`
        <div class="p-title"></div>
        <div class="f-meta">${boardLabel(topic.board)} · ${topic.author} · ${when(topic.at)}
          · ответов: ${(topic.replies || []).length}
          ${topic.open ? '' : ' · <span class="p-tag">закрыта</span>'}</div>`);
      el.classList.add('f-topic');
      if (!topic.open) el.classList.add('f-closed');
      el.querySelector('.p-title').textContent = topic.title;
      el.onclick = () => { forumOpenId = topic.id; renderForum(); };
      box.appendChild(el);
    });
  }

  window.addEventListener('message', (ev) => {
    const data = ev.data || {};
    if (data.action === 'forum') {
      forum = data.data || forum;
      // Незакрытые темы, где ты нужен, — повод подсветить приложение.
      const mine = (forum.topics || []).filter((t) => t.open && (t.mine || forum.staff));
      $('forum-badge').classList.toggle('hidden', mine.length === 0);
      renderForum();
    }
  });
