(() => {
  'use strict';

  const RES = (typeof GetParentResourceName === 'function')
    ? GetParentResourceName()
    : 'ls_rp';

  const $ = (id) => document.getElementById(id);
  const menu = $('menu');
  const viewer = $('viewer');

  let hasTarget = false;

  const post = (endpoint, body = {}) =>
    fetch(`https://${RES}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
    }).catch(() => {});

  // --- tabs ---------------------------------------------------------------

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === tab));
      ['docs', 'give', 'emotes'].forEach((name) => {
        $(`tab-${name}`).classList.toggle('hidden', name !== tab.dataset.tab);
      });
    });
  });

  function selectTab(name) {
    const tab = document.querySelector(`.tab[data-tab="${name}"]`);
    if (tab) tab.click();
  }

  // --- documents ----------------------------------------------------------

  function renderDocs(documents) {
    const box = $('tab-docs');
    box.innerHTML = '';

    if (!documents.length) {
      box.innerHTML = '<p class="empty">Документов нет.<br>Паспорт выдаётся вместе с персонажем.</p>';
      return;
    }

    documents.forEach((doc) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-title"></div>
        ${doc.subtitle ? '<div class="card-sub"></div>' : ''}
        <div class="card-actions">
          <button class="btn primary" data-act="show">Показать</button>
          <button class="btn danger" data-act="give">Передать</button>
        </div>`;

      card.querySelector('.card-title').textContent = doc.label;
      if (doc.subtitle) card.querySelector('.card-sub').textContent = doc.subtitle;

      const show = card.querySelector('[data-act="show"]');
      const give = card.querySelector('[data-act="give"]');

      show.disabled = !hasTarget;
      give.disabled = !hasTarget;
      show.addEventListener('click', () => post('showDoc', { id: doc.id }));

      // Handing over a registration hands over the car, so make that explicit.
      const label = doc.kind === 'vehicle' ? 'Вместе с машиной?' : 'Точно?';
      let armed = false;
      let timer = null;

      give.addEventListener('click', () => {
        if (armed) {
          clearTimeout(timer);
          post('giveDoc', { id: doc.id });
          return;
        }
        armed = true;
        give.textContent = label;
        timer = setTimeout(() => {
          armed = false;
          give.textContent = 'Передать';
        }, 3500);
      });

      box.appendChild(card);
    });
  }

  // --- give ---------------------------------------------------------------

  function renderItems(items) {
    const box = $('items');
    box.innerHTML = '';

    if (!items.length) {
      box.innerHTML = '<p class="empty">Инвентарь пуст.</p>';
      return;
    }

    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = '<span class="item-name"></span><button>Передать</button>';
      row.querySelector('.item-name').textContent =
        item.count > 1 ? `${item.label} · ${item.count}` : item.label;
      row.querySelector('button').addEventListener('click', () => {
        post('giveItem', { slot: item.slot });
      });
      box.appendChild(row);
    });
  }

  $('give-money').addEventListener('click', () => {
    const amount = Math.floor(Number($('amount').value) || 0);
    if (amount > 0) post('giveMoney', { amount });
  });

  $('amount').addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') $('give-money').click();
  });

  // --- emotes -------------------------------------------------------------

  function renderEmotes(emotes) {
    const box = $('tab-emotes');
    box.innerHTML = '';

    emotes.forEach((emote) => {
      const btn = document.createElement('button');
      btn.className = 'emote';
      btn.textContent = emote.label;
      btn.addEventListener('click', () => post('emote', { id: emote.id }));
      box.appendChild(btn);
    });
  }

  // --- document viewer ----------------------------------------------------

  const LINES = {
    passport: [
      ['Фамилия', (d) => d.last],
      ['Имя', (d) => d.first],
      ['Пол', (d) => d.gender],
      ['Дата рождения', (d) => d.birth],
      ['Идентификатор', (d) => '#' + d.static],
      ['Дата выдачи', (d) => d.issued],
    ],
    medcard: [
      ['Фамилия', (d) => d.last],
      ['Имя', (d) => d.first],
      ['Группа крови', (d) => d.blood],
      ['Идентификатор', (d) => '#' + d.static],
      ['Дата выдачи', (d) => d.issued],
    ],
    vehicle: [
      ['Транспорт', (d) => d.label],
      ['Модель', (d) => d.model],
      ['Гос. номер', (d) => d.plate],
      ['Владелец', (d) => d.owner],
      ['Идентификатор', (d) => '#' + d.static],
      ['Дата выдачи', (d) => d.issued],
    ],
  };

  function renderDoc(doc, title, from) {
    $('doc-kind').textContent = title;
    $('doc-from').textContent = from ? `предъявил: ${from}` : '';

    const body = $('doc-body');
    body.innerHTML = '';

    (LINES[doc.kind] || []).forEach(([label, read]) => {
      const line = document.createElement('div');
      line.className = 'doc-line';
      line.innerHTML = '<span></span><b></b>';
      line.querySelector('span').textContent = label;
      let value = '';
      try { value = read(doc.data || {}); } catch (err) { value = ''; }
      line.querySelector('b').textContent = (value === undefined || value === null) ? '—' : value;
      body.appendChild(line);
    });
  }

  $('doc-close').addEventListener('click', () => {
    viewer.classList.add('hidden');
    post('closeDoc');
  });

  $('close').addEventListener('click', () => post('close'));

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!viewer.classList.contains('hidden')) $('doc-close').click();
    else if (!menu.classList.contains('hidden')) post('close');
  });

  // --- messages -----------------------------------------------------------

  window.addEventListener('message', (ev) => {
    const data = ev.data || {};

    if (data.action === 'open') {
      hasTarget = Boolean(data.target);
      $('menu-title').textContent = hasTarget ? 'Взаимодействие' : 'Мои документы';
      $('menu-sub').textContent = hasTarget
        ? `Рядом: ${data.targetName || 'игрок'}`
        : 'Рядом никого — показать и передать нельзя';

      $('tabs').classList.toggle('hidden', !hasTarget);
      $('tab-give').classList.add('hidden');
      $('tab-emotes').classList.add('hidden');
      $('tab-docs').classList.remove('hidden');
      selectTab('docs');

      renderDocs(data.documents || []);
      renderItems(data.items || []);
      renderEmotes(data.emotes || []);
      menu.classList.remove('hidden');
    } else if (data.action === 'documents') {
      renderDocs(data.documents || []);
    } else if (data.action === 'close') {
      menu.classList.add('hidden');
    } else if (data.action === 'viewDoc') {
      renderDoc(data.doc, data.title, data.from);
      viewer.classList.remove('hidden');
    } else if (data.action === 'closeDoc') {
      viewer.classList.add('hidden');
    }
  });
})();
