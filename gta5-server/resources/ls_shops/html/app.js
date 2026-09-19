(() => {
  'use strict';

  const RES = (typeof GetParentResourceName === 'function')
    ? GetParentResourceName()
    : 'ls_shops';

  const $ = (id) => document.getElementById(id);
  const stylePanel = $('style');
  const listPanel = $('list');

  let listKind = 'store';
  let listMoney = 0;

  const post = (endpoint, body = {}) =>
    fetch(`https://${RES}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
    }).catch(() => {});

  const money = (n) => '$' + Number(n || 0).toLocaleString('ru-RU');

  function hideAll() {
    stylePanel.classList.add('hidden');
    listPanel.classList.add('hidden');
  }

  // --- style editor -------------------------------------------------------

  function renderStyle(data) {
    $('style-title').textContent = data.title || 'Магазин';
    $('style-money').textContent = money(data.money);

    const box = $('style-rows');
    box.innerHTML = '';

    (data.rows || []).forEach((row) => {
      const el = document.createElement('div');
      el.className = 'row';
      el.innerHTML = `
        <div class="row-label"><span class="name"></span></div>
        <div class="pick" data-axis="model">
          <span class="pick-name">Модель</span>
          <button class="arrow" data-dir="-1">‹</button>
          <span class="pick-value">${row.value} / ${row.count}</span>
          <button class="arrow" data-dir="1">›</button>
        </div>`;

      el.querySelector('.name').textContent = row.label;

      if (row.hasTexture && row.textures > 1) {
        const tex = document.createElement('div');
        tex.className = 'pick';
        tex.dataset.axis = 'texture';
        tex.innerHTML = `
          <span class="pick-name">Цвет</span>
          <button class="arrow" data-dir="-1">‹</button>
          <span class="pick-value">${row.texture} / ${row.textures}</span>
          <button class="arrow" data-dir="1">›</button>`;
        el.appendChild(tex);
      }

      el.querySelectorAll('.pick').forEach((pick) => {
        pick.querySelectorAll('.arrow').forEach((btn) => {
          btn.addEventListener('click', () => {
            post('styleChange', {
              index: row.index,
              axis: pick.dataset.axis,
              dir: Number(btn.dataset.dir),
            });
          });
        });
      });

      box.appendChild(el);
    });

    const totalBox = $('style-total').parentElement;
    totalBox.classList.remove('denied');
    $('style-changed').textContent = data.changed
      ? `Изменено слотов: ${data.changed}`
      : 'Ничего не изменено';
    $('style-total').textContent = money(data.total);

    const confirm = $('style-confirm');
    confirm.disabled = data.total > data.money;
    confirm.textContent = data.total > data.money ? 'Не хватает денег' : 'Купить';
  }

  $('style-cancel').addEventListener('click', () => post('styleCancel'));
  $('style-confirm').addEventListener('click', () => post('styleConfirm'));

  document.querySelectorAll('[data-rotate]').forEach((btn) => {
    btn.addEventListener('click', () =>
      post('styleRotate', { dir: Number(btn.dataset.rotate) })
    );
  });

  // --- buy list -----------------------------------------------------------

  function renderList(data) {
    listKind = data.kind || 'store';
    listMoney = data.money || 0;

    $('list-title').textContent = data.title || 'Магазин';
    $('list-money').textContent = money(listMoney);

    const box = $('list-rows');
    box.innerHTML = '';

    (data.items || []).forEach((item) => {
      const affordable = listMoney >= item.price;
      const el = document.createElement('div');
      el.className = 'item';
      const art = window.ItemIcons
        ? window.ItemIcons.iconFor(item.item, item.kind) : '';
      el.innerHTML = `
        <div class="item-left">
          <span class="item-art kind-${item.kind || 'misc'}">${art}</span>
          <span>
            <span class="item-name"></span>
            ${item.note ? `<span class="item-note">${item.note}</span>` : ''}
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="item-price">${money(item.price)}</span>
          <button ${affordable ? '' : 'disabled'}>Купить</button>
        </div>`;

      el.querySelector('.item-name').textContent = item.label;
      el.querySelector('button').addEventListener('click', () => {
        post('listBuy', { item: item.item, kind: listKind });
      });

      box.appendChild(el);
    });
  }

  $('list-close').addEventListener('click', () => post('listClose'));

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!stylePanel.classList.contains('hidden')) post('styleCancel');
    else if (!listPanel.classList.contains('hidden')) post('listClose');
  });

  // --- messages from the client script -------------------------------------

  window.addEventListener('message', (ev) => {
    const data = ev.data || {};

    if (data.action === 'open') {
      hideAll();
      if (data.view === 'style') {
        stylePanel.classList.remove('hidden');
      } else {
        listPanel.classList.remove('hidden');
        renderList(data);
      }
    } else if (data.action === 'close') {
      hideAll();
    } else if (data.action === 'style') {
      stylePanel.classList.remove('hidden');
      renderStyle(data);
    } else if (data.action === 'styleDenied') {
      const totalBox = $('style-total').parentElement;
      totalBox.classList.add('denied');
      $('style-changed').textContent = 'Не хватает денег';
    }
  });
})();
