(() => {
  'use strict';

  const RES = (typeof GetParentResourceName === 'function')
    ? GetParentResourceName()
    : 'ls_character';

  const $ = (id) => document.getElementById(id);
  const creator = $('creator');

  let limits = { maxParent: 45, maxEye: 31, maxHair: 20, overlayCounts: {} };
  let overlays = [];
  let features = {};
  let draft = null;
  let pushTimer = null;

  const post = (endpoint, body = {}) =>
    fetch(`https://${RES}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
    }).catch(() => {});

  // Sliders fire constantly; the preview only needs the latest value.
  function pushAppearance() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      post('appearance', { appearance: draft.appearance });
    }, 40);
  }

  // --- control builders ---------------------------------------------------

  function stepper(label, value, min, max, onChange, format) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="row-top"><span class="row-label"></span><span class="row-value"></span></div>
      <div class="pick">
        <button class="arrow" data-dir="-1">‹</button>
        <input type="range">
        <button class="arrow" data-dir="1">›</button>
      </div>`;

    row.querySelector('.row-label').textContent = label;

    const range = row.querySelector('input');
    const readout = row.querySelector('.row-value');
    range.min = String(min);
    range.max = String(max);
    range.step = '1';
    range.value = String(value);

    const show = (v) => {
      readout.textContent = format ? format(v) : `${v} / ${max}`;
    };
    show(value);

    const set = (v) => {
      const clamped = Math.max(min, Math.min(max, v));
      range.value = String(clamped);
      show(clamped);
      onChange(clamped);
      pushAppearance();
    };

    range.addEventListener('input', () => set(Number(range.value)));
    row.querySelectorAll('.arrow').forEach((btn) => {
      btn.addEventListener('click', () => set(Number(range.value) + Number(btn.dataset.dir)));
    });

    return row;
  }

  function slider(label, value, onChange) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="row-top"><span class="row-label"></span><span class="row-value"></span></div>
      <div class="pick"><input type="range" min="-100" max="100" step="5"></div>`;

    row.querySelector('.row-label').textContent = label;

    const range = row.querySelector('input');
    const readout = row.querySelector('.row-value');
    range.value = String(Math.round(value * 100));
    readout.textContent = range.value + '%';

    range.addEventListener('input', () => {
      readout.textContent = range.value + '%';
      onChange(Number(range.value) / 100);
      pushAppearance();
    });

    return row;
  }

  function title(text) {
    const el = document.createElement('div');
    el.className = 'group-title';
    el.textContent = text;
    return el;
  }

  // --- tab rendering ------------------------------------------------------

  function renderLook() {
    const box = $('tab-look');
    box.innerHTML = '';
    const a = draft.appearance;

    box.appendChild(title('Родители'));
    box.appendChild(stepper('Мать', a.mother, 0, limits.maxParent, (v) => { a.mother = v; }));
    box.appendChild(stepper('Отец', a.father, 0, limits.maxParent, (v) => { a.father = v; }));
    // The slider works in -1..1 but a mix is stored 0..1, so map both ways.
    const toSlider = (mix) => (Number(mix) || 0) * 2 - 1;
    box.appendChild(slider('Схожесть (мать ↔ отец)', toSlider(a.shapeMix), (v) => { a.shapeMix = (v + 1) / 2; }));
    box.appendChild(slider('Тон кожи (мать ↔ отец)', toSlider(a.skinMix), (v) => { a.skinMix = (v + 1) / 2; }));

    box.appendChild(title('Голова'));
    box.appendChild(stepper('Причёска', a.hair, 0, Math.max(limits.maxHair, 0), (v) => { a.hair = v; }));
    box.appendChild(stepper('Цвет волос', a.hairColour, 0, 63, (v) => { a.hairColour = v; }));
    box.appendChild(stepper('Мелирование', a.hairHighlight, 0, 63, (v) => { a.hairHighlight = v; }));
    box.appendChild(stepper('Цвет глаз', a.eyeColour, 0, limits.maxEye, (v) => { a.eyeColour = v; }));

    box.appendChild(title('Детали лица'));
    overlays.forEach((overlay) => {
      const key = String(overlay.id);
      const count = Number(limits.overlayCounts[key] || 0);
      const current = Number(a.overlays[key]);

      box.appendChild(stepper(
        overlay.label,
        Number.isFinite(current) ? current : -1,
        -1,
        Math.max(count - 1, -1),
        (v) => { a.overlays[key] = v; },
        (v) => (v < 0 ? 'нет' : `${v + 1} / ${count}`)
      ));

      if (overlay.colourType) {
        box.appendChild(stepper(
          `${overlay.label}: цвет`,
          Number(a.overlayColours[key]) || 0,
          0, 63,
          (v) => { a.overlayColours[key] = v; }
        ));
      }
    });
  }

  function renderFace() {
    const box = $('tab-face');
    box.innerHTML = '';
    const a = draft.appearance;

    Object.keys(features)
      .map(Number)
      .sort((x, y) => x - y)
      .forEach((index) => {
        const key = String(index);
        box.appendChild(slider(
          features[key] || features[index] || `Черта ${index}`,
          Number(a.features[key]) || 0,
          (v) => { a.features[key] = v; }
        ));
      });
  }

  // --- tabs ---------------------------------------------------------------

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === tab));
      ['gender', 'look', 'face', 'name'].forEach((name) => {
        $(`tab-${name}`).classList.toggle('hidden', name !== tab.dataset.tab);
      });
    });
  });

  document.querySelectorAll('.gender').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gender').forEach((b) => b.classList.toggle('on', b === btn));
      draft.gender = btn.dataset.gender;
      post('gender', { gender: draft.gender });
    });
  });

  document.querySelectorAll('[data-rotate]').forEach((btn) => {
    btn.addEventListener('click', () => post('rotate', { dir: Number(btn.dataset.rotate) }));
  });

  // --- name ---------------------------------------------------------------

  function tidy(value) {
    const trimmed = (value || '').trim();
    if (!trimmed) return '';
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }

  function refreshName() {
    const first = tidy($('first').value);
    const last = tidy($('last').value);
    const ok = first.length >= limits.nameMin && last.length >= limits.nameMin;

    $('name-preview').textContent = ok ? `${first} ${last}` : '—';
    $('submit').disabled = !ok;
  }

  ['first', 'last'].forEach((id) => {
    const field = $(id);
    field.addEventListener('input', refreshName);
    field.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter' && !$('submit').disabled) $('submit').click();
    });
  });

  $('submit').addEventListener('click', () => {
    $('error').classList.add('hidden');
    post('submit', { first: tidy($('first').value), last: tidy($('last').value) });
  });

  // --- messages -----------------------------------------------------------

  window.addEventListener('message', (ev) => {
    const data = ev.data || {};

    if (data.action === 'open') {
      const orElse = (value, fallback) =>
        (value === undefined || value === null) ? fallback : value;

      limits = {
        maxParent: orElse(data.maxParent, 45),
        maxEye: orElse(data.maxEye, 31),
        maxHair: orElse(data.maxHair, 20),
        nameMin: orElse(data.nameMin, 2),
        overlayCounts: data.overlayCounts || {},
      };
      overlays = data.overlays || [];
      features = data.features || {};
      draft = data.draft;

      $('name-rule').textContent =
        `Только буквы, от ${data.nameMin} до ${data.nameMax} символов.`;

      renderLook();
      renderFace();
      refreshName();
      creator.classList.remove('hidden');
    } else if (data.action === 'limits') {
      if (data.maxHair !== undefined && data.maxHair !== null) limits.maxHair = data.maxHair;
      limits.overlayCounts = data.overlayCounts || limits.overlayCounts;
      renderLook();
    } else if (data.action === 'rejected') {
      const error = $('error');
      error.textContent = data.reason || 'Не удалось создать персонажа';
      error.classList.remove('hidden');
    } else if (data.action === 'close') {
      creator.classList.add('hidden');
    }
  });
})();
