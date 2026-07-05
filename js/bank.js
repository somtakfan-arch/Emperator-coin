/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Вкладка "Банк" — обзор активных кредитов и оформление страховки.
   Сама покупка в рассрочку происходит в Магазине (кнопка "В рассрочку"
   у машин и недвижимости) — здесь только табло и страхование.
   ========================================================= */

window.BankUI = (function () {
  const INSURANCE_KINDS = [
    { key: 'health', icon: '❤️', label: 'Медицинская страховка', desc: 'Снижает урон здоровью от несчастных случаев и болезней.' },
    { key: 'property', icon: '🏠', label: 'Страхование имущества', desc: 'Смягчает потери от поломок и бытовых происшествий.' },
  ];

  function render() {
    renderLoans();
    renderInsurance();
  }

  function renderLoans() {
    const state = window.Game.getState();
    const host = document.getElementById('bank-loans');
    host.innerHTML = '';
    const loans = state.loans || [];
    if (!loans.length) {
      host.innerHTML = '<p class="tab-hint">Активных кредитов нет.</p>';
      return;
    }
    loans.forEach((loan) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-icon">🏦</div>
        <div class="item-name">${loan.itemName}</div>
        <div class="item-meta">Осталось: ${formatMoney(Math.max(0, loan.remaining))} · ${formatMoney(loan.perTurn)}/ход · ${loan.turnsLeft} ход(ов)</div>
      `;
      host.appendChild(card);
    });
  }

  function renderInsurance() {
    const state = window.Game.getState();
    const host = document.getElementById('bank-insurance');
    host.innerHTML = '';
    const insurance = state.insurance || { health: false, property: false };
    INSURANCE_KINDS.forEach((kind) => {
      const cost = scaleByWealth(state, INSURANCE_BASE_COST);
      const owned = !!insurance[kind.key];
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-icon">${kind.icon}</div>
        <div class="item-name">${kind.label}</div>
        <div class="item-meta">${kind.desc}</div>
        <div class="item-actions"></div>
      `;
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary btn-sm';
      btn.textContent = owned ? 'Оформлено' : `Оформить (${formatMoney(cost)})`;
      btn.disabled = owned || state.money < cost;
      btn.addEventListener('click', () => {
        const r = buyInsurance(state, kind.key);
        window.Game.afterSideAction(r.ok ? r.barrier : null, r.message);
        render();
      });
      card.querySelector('.item-actions').appendChild(btn);
      host.appendChild(card);
    });
  }

  return { render };
})();
