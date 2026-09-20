// Меню биндов. Ничего не решает сам: собирает нажатие и отдаёт коду клиента.
(function () {
  'use strict';

  const RES = (typeof GetParentResourceName === 'function')
    ? GetParentResourceName() : 'ls_binds';

  const $ = (id) => document.getElementById(id);
  const panel = $('panel');

  const post = (endpoint, body = {}) =>
    fetch(`https://${RES}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body)
    }).catch(() => {});

  let rows = [];
  let forbidden = {};
  let waitingFor = null;    // id действия, для которого ловим клавишу
  let filter = '';

  // Названия клавиш по кодам. Всё, чего нет в списке, показывается как
  // "Клавиша 123": лучше непонятное имя, чем пустое место.
  const NAMES = {
    8: 'Backspace', 9: 'Tab', 13: 'Enter', 16: 'Shift', 17: 'Ctrl', 18: 'Alt',
    19: 'Pause', 20: 'CapsLock', 27: 'Esc', 32: 'Пробел',
    33: 'PgUp', 34: 'PgDn', 35: 'End', 36: 'Home',
    37: '←', 38: '↑', 39: '→', 40: '↓',
    45: 'Insert', 46: 'Delete',
    106: 'Num *', 107: 'Num +', 109: 'Num -', 110: 'Num .', 111: 'Num /',
    186: ';', 187: '=', 188: ',', 189: '-', 190: '.', 191: '/',
    192: 'Ё', 219: '[', 220: '\\', 221: ']', 222: "'"
  };

  function keyName(code) {
    if (code == null) return null;
    if (NAMES[code]) return NAMES[code];
    if (code >= 48 && code <= 57) return String(code - 48);              // 0-9
    if (code >= 65 && code <= 90) return String.fromCharCode(code);      // A-Z
    if (code >= 96 && code <= 105) return 'Num ' + (code - 96);
    if (code >= 112 && code <= 123) return 'F' + (code - 111);
    return 'Клавиша ' + code;
  }

  function render() {
    const list = $('list');
    list.innerHTML = '';

    const needle = filter.trim().toLowerCase();
    const shown = rows.filter((r) => !needle || r.label.toLowerCase().includes(needle));

    if (!shown.length) {
      const empty = document.createElement('div');
      empty.className = 'foot';
      empty.textContent = needle
        ? 'Ничего не нашлось.'
        : 'Список пуст. Действия появляются здесь, как только встретятся в игре.';
      list.appendChild(empty);
      return;
    }

    shown.forEach((row) => {
      const el = document.createElement('div');
      el.className = 'row';

      const waiting = waitingFor === row.id;
      const name = keyName(row.key);

      el.innerHTML = `
        <div class="name"></div>
        <div class="key ${waiting ? 'waiting' : (name ? '' : 'empty')}">${
          waiting ? 'жду…' : (name || 'не задана')
        }</div>
        <button class="btn assign">${waiting ? 'Отмена' : 'Назначить'}</button>
        ${name ? '<button class="btn clear">Убрать</button>' : ''}`;

      // Через textContent, а не в шаблон: подпись приходит от другого
      // ресурса, и вставлять её как разметку незачем.
      el.querySelector('.name').textContent = row.label;

      el.querySelector('.assign').onclick = () => {
        waitingFor = waiting ? null : row.id;
        render();
      };
      const clear = el.querySelector('.clear');
      if (clear) clear.onclick = () => post('bind', { id: row.id, key: null });

      list.appendChild(el);
    });

    const bound = rows.filter((r) => r.key != null).length;
    $('foot').textContent = `Назначено: ${bound}. Нажатие работает, только когда действие доступно рядом.`;
  }

  document.addEventListener('keydown', (ev) => {
    if (panel.classList.contains('hidden')) return;

    // Поиск набирают буквами, поэтому ловим клавишу только когда её ждут.
    if (waitingFor) {
      ev.preventDefault();
      if (ev.keyCode === 27) { waitingFor = null; render(); return; }
      if (ev.keyCode === 46 || ev.keyCode === 8) {
        post('bind', { id: waitingFor, key: null });
        waitingFor = null;
        return;
      }
      if (forbidden[ev.keyCode]) {
        $('hint').textContent = `${forbidden[ev.keyCode]} занята игрой — выбери другую.`;
        return;
      }
      post('bind', { id: waitingFor, key: ev.keyCode });
      waitingFor = null;
      return;
    }

    if (ev.keyCode === 27) post('close');
  });

  $('close').onclick = () => post('close');
  $('search').oninput = (ev) => { filter = ev.target.value; render(); };

  window.addEventListener('message', (ev) => {
    const data = ev.data || {};

    if (data.action === 'open') {
      panel.classList.remove('hidden');
      waitingFor = null;
      filter = '';
      $('search').value = '';
      $('hint').textContent = 'Нажми «Назначить» и затем клавишу. Delete — убрать.';
      return;
    }

    if (data.action === 'close') {
      panel.classList.add('hidden');
      waitingFor = null;
      return;
    }

    if (data.action === 'binds') {
      rows = data.rows || [];
      forbidden = data.forbidden || {};
      render();
    }
  });
})();
