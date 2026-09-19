(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const panel = $('market');

  function post(action, data) {
    fetch(`https://${GetParentResourceName()}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(data || {})
    }).catch(() => {});
  }

  function money(value) {
    return '$' + Number(value || 0).toLocaleString('ru-RU');
  }

  // Иконки приходят из ls_inventory через nui://. Если файл не подгрузился,
  // окно всё равно работает - просто без картинок.
  function art(item, kind) {
    return window.ItemIcons ? window.ItemIcons.iconFor(item, kind) : '';
  }

  function row(entry, affordable, buttonText, onClick) {
    const el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = `
      <span class="row-left">
        <span class="row-art kind-${entry.kind || 'misc'}">${art(entry.item, entry.kind)}</span>
        <span>
          <span class="row-name"></span>
          ${entry.sub ? `<div class="row-sub">${entry.sub}</div>` : ''}
        </span>
      </span>
      <span class="row-price">${money(entry.price)}</span>
      <button ${affordable ? '' : 'disabled'}>${buttonText}</button>`;

    el.querySelector('.row-name').textContent = entry.label || entry.item;
    el.querySelector('button').addEventListener('click', onClick);
    return el;
  }

  function render(data) {
    $('money').textContent = money(data.money);

    const sells = $('sells');
    sells.innerHTML = '';
    (data.sells || []).forEach((entry) => {
      sells.appendChild(row(entry, data.money >= entry.price, 'Купить',
        () => post('buy', { item: entry.item })));
    });

    const buys = $('buys');
    buys.innerHTML = '';
    (data.buys || []).forEach((entry) => {
      const have = entry.have || 0;
      const line = Object.assign({}, entry, {
        sub: have > 0 ? `у тебя ${have} шт.` : 'нет в инвентаре',
        price: entry.price * (have || 1)
      });
      buys.appendChild(row(line, have > 0, 'Продать',
        () => post('sell', { item: entry.item })));
    });

    const sum = Number(data.turf || 0);
    $('turf-sum').textContent = sum > 0
      ? `Накопилось ${money(sum)}`
      : 'Пока ничего не накапало';
    $('collect').disabled = sum <= 0;

    panel.classList.remove('hidden');
  }

  function close() {
    panel.classList.add('hidden');
    post('close');
  }

  $('close').addEventListener('click', close);
  $('collect').addEventListener('click', () => post('collect'));

  document.addEventListener('keyup', (event) => {
    if (event.key === 'Escape') close();
  });

  window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.action === 'open') render(data);
    else if (data.action === 'close') panel.classList.add('hidden');
  });
}());
