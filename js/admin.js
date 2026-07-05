/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Админ-панель: вкладка внутри игры, доступна только тому аккаунту,
   чей email совпадает с ADMIN_EMAIL. Поиск игрока, выдача/списание
   денег.

   Это проверка на клиенте, а не настоящая серверная авторизация —
   см. предупреждение в js/cloud.js про Firestore-правила.
   ========================================================= */

window.AdminUI = (function () {
  const ADMIN_EMAIL = 'bedsmp.pro@gmail.com';

  function isAdmin() {
    return !!(window.Cloud.enabled && window.Cloud.currentUser && window.Cloud.currentUser.email === ADMIN_EMAIL);
  }

  function render() {
    const hint = document.getElementById('admin-hint');
    const body = document.getElementById('admin-body');
    if (!isAdmin()) {
      hint.textContent = window.Cloud.enabled
        ? 'Админ-панель доступна только определённому аккаунту.'
        : 'Облако не настроено (js/firebase-config.js) — админ-панель недоступна.';
      body.classList.add('hidden');
      return;
    }
    hint.textContent = '';
    body.classList.remove('hidden');
  }

  function search() {
    if (!isAdmin()) return;
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
          <p class="admin-error tab-hint"></p>
        `;
        const amountInput = card.querySelector('.admin-amount-input');
        const balanceEl = card.querySelector('.admin-balance');
        const errorEl = card.querySelector('.admin-error');
        card.querySelector('.admin-give-btn').addEventListener('click', () => {
          const amount = Math.round(Number(amountInput.value));
          if (!amount || amount <= 0) return;
          errorEl.textContent = '';
          window.Cloud.adminAdjustMoney(row.uid, amount)
            .then((newMoney) => { balanceEl.textContent = formatMoney(newMoney); })
            .catch((e) => { errorEl.textContent = e.message; });
        });
        card.querySelector('.admin-take-btn').addEventListener('click', () => {
          const amount = Math.round(Number(amountInput.value));
          if (!amount || amount <= 0) return;
          errorEl.textContent = '';
          window.Cloud.adminAdjustMoney(row.uid, -amount)
            .then((newMoney) => { balanceEl.textContent = formatMoney(newMoney); })
            .catch((e) => { errorEl.textContent = e.message; });
        });
        host.appendChild(card);
      });
    });
  }

  document.getElementById('admin-search-btn').addEventListener('click', search);
  document.getElementById('admin-search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });

  return { render, isAdmin };
})();
