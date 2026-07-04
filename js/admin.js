/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Админ-панель: пароль "empc", поиск игрока, выдача/списание денег.

   Это клиентский пароль-заглушка для защиты от случайных заходов,
   а не настоящая авторизация — см. предупреждение в js/cloud.js.
   ========================================================= */

window.AdminUI = (function () {
  const PASSWORD = 'empc';
  let unlocked = false;

  function tryUnlock() {
    const input = document.getElementById('admin-password');
    const msg = document.getElementById('admin-gate-message');
    if (input.value === PASSWORD) {
      unlocked = true;
      document.getElementById('admin-gate').classList.add('hidden');
      document.getElementById('admin-panel').classList.remove('hidden');
      msg.textContent = '';
      const hint = document.getElementById('admin-cloud-hint');
      hint.textContent = window.Cloud.enabled ? '' : 'Облако не настроено (js/firebase-config.js) — искать и менять игроков нельзя, пока не подключишь Firestore.';
    } else {
      msg.textContent = 'Неверный пароль.';
    }
  }

  function search() {
    if (!window.Cloud.enabled) return;
    const query = document.getElementById('admin-search-input').value;
    const host = document.getElementById('admin-results');
    host.innerHTML = '<p class="tab-hint">Поиск...</p>';
    window.Cloud.adminFindPlayers(query).then((rows) => {
      host.innerHTML = '';
      if (!rows.length) {
        host.innerHTML = '<p class="tab-hint">Никого не нашли.</p>';
        return;
      }
      rows.forEach((row) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
          <div class="item-name">${row.name || row.email}</div>
          <div class="item-meta">${row.email} · баланс: <b class="admin-balance">${formatMoney(row.money || 0)}</b></div>
          <div class="admin-adjust-row">
            <input type="number" class="admin-amount-input" placeholder="Сумма, ₽" />
            <button class="btn btn-primary btn-sm admin-give-btn">Выдать</button>
            <button class="btn btn-secondary btn-sm admin-take-btn">Забрать</button>
          </div>
        `;
        const amountInput = card.querySelector('.admin-amount-input');
        const balanceEl = card.querySelector('.admin-balance');
        card.querySelector('.admin-give-btn').addEventListener('click', () => {
          const amount = Math.round(Number(amountInput.value));
          if (!amount || amount <= 0) return;
          window.Cloud.adminAdjustMoney(row.uid, amount).then((newMoney) => { balanceEl.textContent = formatMoney(newMoney); });
        });
        card.querySelector('.admin-take-btn').addEventListener('click', () => {
          const amount = Math.round(Number(amountInput.value));
          if (!amount || amount <= 0) return;
          window.Cloud.adminAdjustMoney(row.uid, -amount).then((newMoney) => { balanceEl.textContent = formatMoney(newMoney); });
        });
        host.appendChild(card);
      });
    });
  }

  document.getElementById('admin-unlock-btn').addEventListener('click', tryUnlock);
  document.getElementById('admin-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
  document.getElementById('admin-search-btn').addEventListener('click', search);

  return {};
})();
