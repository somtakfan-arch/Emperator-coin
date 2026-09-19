(() => {
  'use strict';

  const RES = (typeof GetParentResourceName === 'function')
    ? GetParentResourceName()
    : 'ls_police';

  const $ = (id) => document.getElementById(id);
  const panel = $('panel');
  const overlay = $('overlay');

  let state = { onDuty: false, rank: null, perms: {} };
  let target = null;
  let searchTarget = null;

  const post = (endpoint, body = {}) =>
    fetch(`https://${RES}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
    }).catch(() => {});

  const money = (n) => '$' + Number(n || 0).toLocaleString('ru-RU');
  const text = (el, value) => { el.textContent = value; return el; };

  // --- tabs ---------------------------------------------------------------

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === tab));
      ['act', 'law', 'fine', 'props', 'mdt'].forEach((name) => {
        $(`view-${name}`).classList.toggle('hidden', name !== tab.dataset.tab);
      });
    });
  });

  // --- actions tab --------------------------------------------------------

  // Each entry says which permission the server will demand, so the button is
  // greyed out rather than failing on the far side.
  const ACTIONS = [
    { label: 'Надеть стяжки',        perm: 'cuff',  needTarget: true, run: () => post('cuff', { target, kind: 'soft' }) },
    { label: 'Надеть наручники',     perm: 'cuff',  needTarget: true, run: () => post('cuff', { target, kind: 'hard' }) },
    { label: 'Снять наручники',      perm: 'cuff',  needTarget: true, run: () => post('uncuff', { target }) },
    { label: 'Снять ключом',         perm: null,    needTarget: true, run: () => post('uncuffKey', { target }) },
    { label: 'Вести / отпустить',    perm: 'cuff',  needTarget: true, run: () => post('escort', { target }) },
    { label: 'Посадить в транспорт', perm: 'cuff',  needTarget: true, run: () => post('vehicleMove', { target, move: 'in' }) },
    { label: 'Вытащить из транспорта',perm: 'cuff', needTarget: true, run: () => post('vehicleMove', { target, move: 'out' }) },
    { label: 'На колени',            perm: 'cuff',  needTarget: true, run: () => post('kneel', { target, down: true }) },
    { label: 'Поднять',              perm: 'cuff',  needTarget: true, run: () => post('kneel', { target, down: false }) },
    { label: 'Обыскать',             perm: 'search',needTarget: true, run: () => post('search', { target }) },
    { label: 'Проверить документы',  perm: 'search',needTarget: true, run: () => post('checkDocs', { target }) },
    { label: 'Тазер',                perm: 'cuff',  needTarget: true, run: () => post('taser', { target }) },
    { label: 'Вырваться',            perm: null,    needTarget: false, run: () => post('escape'), onlyCuffed: true },
  ];

  function renderActions() {
    const box = $('view-act');
    box.innerHTML = '';

    ACTIONS.forEach((action) => {
      if (action.onlyCuffed && state.onDuty) return;
      if (!action.onlyCuffed && !state.onDuty) return;

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = action.label;

      const missingTarget = action.needTarget && !target;
      const missingPerm = action.perm && !state.perms[action.perm];
      btn.disabled = missingTarget || missingPerm;
      if (missingPerm) btn.textContent = `${action.label} — нет прав`;

      btn.addEventListener('click', action.run);
      box.appendChild(btn);
    });

    if (!box.children.length) {
      box.innerHTML = '<p class="empty">Нет доступных действий.<br>Заступи на службу в отделении.</p>';
    }
  }

  // --- law ----------------------------------------------------------------

  $('do-wanted').addEventListener('click', () => post('wanted', {
    target,
    level: Number($('wanted-level').value) || 1,
    reason: $('wanted-reason').value,
  }));

  $('do-arrest').addEventListener('click', () => post('arrest', {
    target,
    minutes: Number($('jail-minutes').value) || 5,
    reason: $('jail-reason').value,
  }));

  $('load-wanted').addEventListener('click', () => post('wantedList'));

  function renderWanted(rows) {
    const box = $('wanted-list');
    box.innerHTML = '';

    if (!rows || !rows.length) {
      box.innerHTML = '<p class="empty">Разыскиваемых нет.</p>';
      return;
    }

    rows.forEach((row) => {
      const el = document.createElement('div');
      el.className = 'row';
      el.innerHTML = '<div class="name"></div><div class="row-sub"></div>'
        + '<div class="row-actions"><button class="btn danger">Снять розыск</button></div>';

      const who = (row.first_name && row.last_name)
        ? `${row.first_name} ${row.last_name} · #${row.static}`
        : row.identifier;
      text(el.querySelector('.name'), who);
      text(el.querySelector('.row-sub'),
        `Уровень ${row.level} · ${row.reason || '—'} · ${row.by_name || '—'}`);

      const clear = el.querySelector('button');
      clear.disabled = !state.perms.clearWanted;
      clear.addEventListener('click', () => {
        post('clearWanted', { identifier: row.identifier });
        setTimeout(() => post('wantedList'), 400);
      });

      box.appendChild(el);
    });
  }

  // --- fines --------------------------------------------------------------

  function renderPresets(presets) {
    const box = $('fine-presets');
    box.innerHTML = '';

    (presets || []).forEach((preset) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `${preset.label} — ${money(preset.amount)}`;
      btn.disabled = !target || !state.perms.fine;
      btn.addEventListener('click', () => post('fine', {
        target, amount: preset.amount, reason: preset.label,
      }));
      box.appendChild(btn);
    });
  }

  $('do-fine').addEventListener('click', () => post('fine', {
    target,
    amount: Number($('fine-amount').value) || 0,
    reason: $('fine-reason').value,
  }));

  // --- props --------------------------------------------------------------

  function renderProps(props) {
    const box = $('prop-list');
    box.innerHTML = '';

    (props || []).forEach((prop) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `Поставить: ${prop.label}`;
      btn.addEventListener('click', () => post('prop', { id: prop.id }));
      box.appendChild(btn);
    });
  }

  $('prop-remove').addEventListener('click', () => post('prop', { id: 'remove' }));

  $('do-impound').addEventListener('click', () => post('impound', {
    reason: $('impound-reason').value,
  }));

  // --- MDT ----------------------------------------------------------------

  $('mdt-go').addEventListener('click', () => post('mdtSearch', { query: $('mdt-query').value }));
  $('mdt-query').addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') $('mdt-go').click();
  });

  function renderMdt(result) {
    const box = $('mdt-results');
    box.innerHTML = '';

    const people = (result && result.people) || [];
    if (!people.length) {
      box.innerHTML = '<p class="empty">Ничего не найдено.</p>';
      return;
    }

    people.forEach((person) => {
      const el = document.createElement('div');
      el.className = 'row';

      const head = document.createElement('div');
      text(head, `${person.first_name} ${person.last_name} · #${person.static}`);
      if (person.wanted > 0) {
        const tag = document.createElement('span');
        tag.className = 'tag wanted';
        tag.textContent = `розыск ${person.wanted}`;
        head.appendChild(tag);
      }
      el.appendChild(head);

      const add = (label) => {
        const line = document.createElement('div');
        line.className = 'row-sub';
        line.textContent = label;
        el.appendChild(line);
        return line;
      };

      (person.wantedReasons || []).forEach((w) =>
        add(`Розыск: ур. ${w.level} — ${w.reason || '—'}`));

      const fines = person.fines || [];
      add(fines.length ? `Штрафов: ${fines.length}` : 'Штрафов нет');
      fines.slice(0, 5).forEach((fine) => {
        const line = add(`${money(fine.amount)} — ${fine.reason || '—'}`);
        const tag = document.createElement('span');
        tag.className = 'tag ' + (fine.paid ? 'paid' : 'debt');
        tag.textContent = fine.paid ? 'оплачен' : 'долг';
        line.appendChild(tag);
      });

      const record = person.record || [];
      add(record.length ? `Приводов: ${record.length}` : 'Приводов нет');
      record.slice(0, 5).forEach((entry) =>
        add(`${entry.action} — ${entry.detail || '—'} (${entry.actor || '—'})`));

      (person.licenses || []).forEach((license) => {
        const line = add(license.kind === 'driver' ? 'Водительское удостоверение' : 'Лицензия на оружие');
        if (license.revoked) {
          const tag = document.createElement('span');
          tag.className = 'tag revoked';
          tag.textContent = 'аннулирована';
          line.appendChild(tag);
        } else if (state.perms.revokeLicense) {
          const actions = document.createElement('div');
          actions.className = 'row-actions';
          const btn = document.createElement('button');
          btn.className = 'btn danger';
          btn.textContent = 'Аннулировать';
          btn.addEventListener('click', () => {
            post('revokeLicense', { id: license.id });
            setTimeout(() => post('mdtSearch', { query: $('mdt-query').value }), 400);
          });
          actions.appendChild(btn);
          el.appendChild(actions);
        }
      });

      box.appendChild(el);
    });
  }

  // --- overlay ------------------------------------------------------------

  function openSheet(title) {
    $('sheet-title').textContent = title;
    overlay.classList.remove('hidden');
  }

  function closeSheet() {
    overlay.classList.add('hidden');
    searchTarget = null;
    // With the main panel gone too there is nothing left to click, so hand the
    // cursor back rather than leaving the player stuck.
    if (panel.classList.contains('hidden')) post('close');
  }

  $('sheet-close').addEventListener('click', closeSheet);

  function renderSearch(result) {
    searchTarget = result.target;
    openSheet(`Обыск: ${result.name || ''}`);

    const box = $('sheet-body');
    box.innerHTML = '';

    const slots = result.slots || [];
    if (!slots.length) {
      box.innerHTML = '<p class="empty">Инвентарь пуст.</p>';
      return;
    }

    slots.sort((a, b) => a.slot - b.slot).forEach((slot) => {
      const row = document.createElement('div');
      row.className = 'slot-row';
      row.innerHTML = '<div><div class="label"></div><div class="kind"></div></div><button>Изъять</button>';
      text(row.querySelector('.label'),
        slot.count > 1 ? `${slot.label} · ${slot.count}` : slot.label);
      text(row.querySelector('.kind'), `слот ${slot.slot} · ${slot.kind}`);

      const btn = row.querySelector('button');
      btn.disabled = !state.perms.seize;
      btn.addEventListener('click', () => post('seize', { target: searchTarget, slot: slot.slot }));
      box.appendChild(row);
    });
  }

  const DOC_LABEL = {
    passport: 'Паспорт',
    medcard: 'Медсправка',
    vehicle: 'СТС',
    driver: 'Водительское удостоверение',
    weapon: 'Лицензия на оружие',
  };

  function renderDocs(result) {
    openSheet(`Документы: ${result.name || ''} · #${result.static || 0}`);

    const box = $('sheet-body');
    box.innerHTML = '';

    const documents = result.documents || [];
    if (!documents.length) {
      box.innerHTML = '<p class="empty">Документов нет.</p>';
      return;
    }

    documents.forEach((doc) => {
      const row = document.createElement('div');
      row.className = 'row';

      const head = document.createElement('div');
      text(head, DOC_LABEL[doc.kind] || doc.kind);
      if (doc.revoked) {
        const tag = document.createElement('span');
        tag.className = 'tag revoked';
        tag.textContent = 'аннулирован';
        head.appendChild(tag);
      }
      row.appendChild(head);

      let parsed = doc.data;
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch (err) { parsed = {}; }
      }
      Object.keys(parsed || {}).forEach((key) => {
        const line = document.createElement('div');
        line.className = 'row-sub';
        line.textContent = `${key}: ${parsed[key]}`;
        row.appendChild(line);
      });

      box.appendChild(row);
    });
  }

  function renderDuty(list) {
    openSheet('На службе');
    const box = $('sheet-body');
    box.innerHTML = '';

    if (!list || !list.length) {
      box.innerHTML = '<p class="empty">На службе никого нет.</p>';
      return;
    }

    list.forEach((officer) => {
      const row = document.createElement('div');
      row.className = 'row';
      text(row, `${officer.rank} ${officer.name}${officer.callsign ? ' [' + officer.callsign + ']' : ''}`);
      box.appendChild(row);
    });
  }

  $('btn-duty').addEventListener('click', () => post('duty'));
  $('btn-close').addEventListener('click', () => post('close'));

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!overlay.classList.contains('hidden')) closeSheet();
    else post('close');
  });

  // --- messages -----------------------------------------------------------

  window.addEventListener('message', (ev) => {
    const data = ev.data || {};

    if (data.action === 'open') {
      state = data.state || state;
      target = data.target || null;

      $('head-sub').textContent = state.onDuty
        ? `На службе · ${state.rank || ''}`
        : 'Не на службе';
      $('target-badge').textContent = data.targetName ? `Цель: ${data.targetName}` : 'Цели рядом нет';

      renderActions();
      renderPresets(data.finePresets);
      renderProps(data.props);

      if (data.jail) {
        $('jail-minutes').min = String(data.jail.min);
        $('jail-minutes').max = String(data.jail.max);
      }

      panel.classList.remove('hidden');
    } else if (data.action === 'close') {
      panel.classList.add('hidden');
      overlay.classList.add('hidden');
    } else if (data.action === 'search') {
      renderSearch(data.result || {});
    } else if (data.action === 'docs') {
      renderDocs(data.result || {});
    } else if (data.action === 'mdt') {
      renderMdt(data.result);
    } else if (data.action === 'wantedList') {
      renderWanted(data.rows);
    } else if (data.action === 'dutyList') {
      renderDuty(data.list);
    }
  });
})();
