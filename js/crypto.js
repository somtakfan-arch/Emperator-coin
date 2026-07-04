/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Вкладка "Крипта" — активная торговля отдельно от истории.
   Требует свою электронику (телефон/ноутбук/ПК). Вход в позицию
   решает мини-игра "Поймай момент" (без удачи), а держать и продать
   позицию можно в любой момент — индекс цены детерминированно
   меняется от хода к ходу.
   ========================================================= */

window.CryptoUI = (function () {
  const COINS = ['БитКоин', 'Эфириум', 'Догги-Коин', 'Соляно', 'Риплон', 'Кардано-Клон'];
  let activeCoin = 0;

  function render() {
    const state = window.Game.getState();
    const hintEl = document.getElementById('crypto-hint');
    const bodyEl = document.getElementById('crypto-body');
    if (!hasElectronicsItem(state)) {
      hintEl.textContent = 'Нужен свой компьютер, ноутбук или телефон, чтобы работать с криптой — загляни в Магазин → Электроника.';
      hintEl.classList.remove('hidden');
      bodyEl.classList.add('hidden');
      return;
    }
    hintEl.classList.add('hidden');
    bodyEl.classList.remove('hidden');
    renderCoins(state);
    renderHoldings(state);
  }

  function renderCoins(state) {
    const host = document.getElementById('crypto-coins');
    host.innerHTML = '';
    COINS.forEach((name, idx) => {
      const price = cryptoPriceIndex(state, idx);
      const chip = document.createElement('button');
      chip.className = 'chip' + (idx === activeCoin ? ' active' : '');
      chip.textContent = `${name} · ${price}`;
      chip.addEventListener('click', () => {
        activeCoin = idx;
        render();
      });
      host.appendChild(chip);
    });
    document.getElementById('crypto-active-price').textContent = `Текущий индекс ${COINS[activeCoin]}: ${cryptoPriceIndex(state, activeCoin)}`;
  }

  function renderHoldings(state) {
    const host = document.getElementById('crypto-holdings');
    host.innerHTML = '';
    const holdings = state.cryptoHoldings || {};
    const keys = Object.keys(holdings);
    if (!keys.length) {
      host.innerHTML = '<p class="tab-hint">Пока нет открытых позиций.</p>';
      return;
    }
    keys.forEach((key) => {
      const idx = Number(key);
      const h = holdings[key];
      const price = cryptoPriceIndex(state, idx);
      const value = Math.round(h.invested * (price / h.entryPrice));
      const profit = value - h.invested;
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-icon">🪙</div>
        <div class="item-name">${COINS[idx] || 'Монета'}</div>
        <div class="item-meta">Вложено: ${formatMoney(h.invested)} · Сейчас: ${formatMoney(value)} (${profit >= 0 ? '+' : ''}${formatMoney(profit)})</div>
        <div class="item-actions"></div>
      `;
      const sellBtn = document.createElement('button');
      sellBtn.className = 'btn btn-secondary btn-sm';
      sellBtn.textContent = 'Продать';
      sellBtn.addEventListener('click', () => {
        const r = sellCrypto(state, idx);
        window.Game.afterSideAction(r.ok ? r.barrier : null, r.message);
        render();
      });
      card.querySelector('.item-actions').appendChild(sellBtn);
      host.appendChild(card);
    });
  }

  function buy() {
    const state = window.Game.getState();
    const input = document.getElementById('crypto-invest-input');
    const stake = Math.round(Number(input.value));
    const msgEl = document.getElementById('crypto-message');
    if (!stake || stake <= 0) { msgEl.textContent = 'Укажи сумму инвестиции.'; return; }
    if (stake > state.money) { msgEl.textContent = 'Не хватает денег на такую сумму.'; return; }

    const modal = document.getElementById('minigame-modal');
    document.getElementById('minigame-title').textContent = 'Поймай момент для сделки';
    document.getElementById('minigame-instructions').textContent = 'Цена ходит туда-сюда по шкале. Останови её точно в зелёной зоне, чтобы войти по выгодному курсу.';
    modal.classList.add('active');
    const host = document.getElementById('minigame-host');
    const zoneWidth = Math.max(0.12, Math.min(0.3, 0.12 + 0.18 * (state.reputation / 100)));

    window.MiniGames.timing.mount(host, { period: 1200, zoneCenter: 0.5, zoneWidth, timeLimit: 6000 }, (success) => {
      const r = buyCrypto(state, activeCoin, stake, success);
      const resultEl = document.createElement('div');
      resultEl.className = 'minigame-result ' + (success ? 'win' : 'lose');
      resultEl.textContent = r.message;
      host.innerHTML = '';
      host.appendChild(resultEl);
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = 'Продолжить';
      btn.addEventListener('click', () => {
        modal.classList.remove('active');
        window.Game.afterSideAction(r.ok ? r.barrier : null, '');
        msgEl.textContent = '';
        render();
      }, { once: true });
      host.appendChild(btn);
    });
  }

  document.getElementById('crypto-buy-btn').addEventListener('click', buy);

  return { render };
})();
