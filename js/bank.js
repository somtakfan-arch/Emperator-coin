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
    renderVentures();
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

  function renderVentures() {
    const hint = document.getElementById('venture-auth-hint');
    const body = document.getElementById('venture-body');
    if (!hint || !body) return;
    if (!window.Cloud.enabled) {
      hint.textContent = 'Совместный бизнес работает только с облаком Firestore. Настрой js/firebase-config.js (см. README).';
      body.classList.add('hidden');
      return;
    }
    if (!window.Cloud.currentUser) {
      hint.textContent = 'Войди в аккаунт, чтобы вести совместный бизнес с другим игроком.';
      body.classList.add('hidden');
      return;
    }
    hint.textContent = '';
    body.classList.remove('hidden');
    renderMyVentures();
    renderOpenVentures();
  }

  function renderMyVentures() {
    const host = document.getElementById('venture-my-list');
    host.innerHTML = '<p class="tab-hint">Загрузка...</p>';
    window.Cloud.listMyVentures().then((rows) => {
      host.innerHTML = '';
      if (!rows.length) {
        host.innerHTML = '<p class="tab-hint">У тебя пока нет совместных предприятий.</p>';
        return;
      }
      const myUid = window.Cloud.currentUser.uid;
      rows.forEach((venture) => {
        const isFounder = venture.founderUid === myUid;
        const partnerLabel = venture.status === 'open' ? 'ждём партнёра' : (isFounder ? venture.partnerName : venture.founderName);
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
          <div class="item-icon">🤝</div>
          <div class="item-name">${venture.name}</div>
          <div class="item-meta">Пул: ${formatMoney(venture.pool)} · партнёр: ${partnerLabel}</div>
          <div class="item-actions"></div>
        `;
        const actions = card.querySelector('.item-actions');
        if (venture.status === 'active') {
          const collectBtn = document.createElement('button');
          collectBtn.className = 'btn btn-primary btn-sm';
          collectBtn.textContent = 'Собрать доход';
          collectBtn.addEventListener('click', () => {
            window.Cloud.collectVentureIncome(venture.id).then((r) => {
              const state = window.Game.getState();
              state.money += r.myShare;
              window.Game.afterSideAction(null, `Собрано ${formatMoney(r.myShare)} с предприятия «${venture.name}».`);
              render();
            }).catch((e) => { document.getElementById('venture-auth-hint').textContent = e.message; });
          });
          actions.appendChild(collectBtn);
        } else if (isFounder) {
          const dissolveBtn = document.createElement('button');
          dissolveBtn.className = 'btn btn-secondary btn-sm';
          dissolveBtn.textContent = 'Закрыть и вернуть вклад';
          dissolveBtn.addEventListener('click', () => {
            window.Cloud.dissolveVenture(venture.id).then(() => {
              const state = window.Game.getState();
              state.money += venture.founderStake;
              window.Game.afterSideAction(null, 'Предприятие закрыто, вклад возвращён.');
              render();
            }).catch((e) => { document.getElementById('venture-auth-hint').textContent = e.message; });
          });
          actions.appendChild(dissolveBtn);
        }
        host.appendChild(card);
      });
    }).catch((e) => { host.innerHTML = `<p class="tab-hint">Не удалось загрузить: ${e.message}</p>`; });
  }

  function renderOpenVentures() {
    const host = document.getElementById('venture-open-list');
    host.innerHTML = '<p class="tab-hint">Загрузка...</p>';
    window.Cloud.listOpenVentures().then((rows) => {
      host.innerHTML = '';
      const myUid = window.Cloud.currentUser.uid;
      const joinable = rows.filter((v) => v.founderUid !== myUid);
      if (!joinable.length) {
        host.innerHTML = '<p class="tab-hint">Открытых предложений от других игроков пока нет.</p>';
        return;
      }
      joinable.forEach((venture) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
          <div class="item-icon">🏢</div>
          <div class="item-name">${venture.name}</div>
          <div class="item-meta">${venture.founderName} вложил(а) ${formatMoney(venture.founderStake)}</div>
          <div class="item-actions"></div>
        `;
        const joinBtn = document.createElement('button');
        joinBtn.className = 'btn btn-primary btn-sm';
        joinBtn.textContent = `Присоединиться (вклад ${formatMoney(venture.founderStake)})`;
        joinBtn.addEventListener('click', () => {
          const state = window.Game.getState();
          const stake = venture.founderStake;
          if (state.money < stake) { document.getElementById('venture-auth-hint').textContent = 'Не хватает денег на вклад.'; return; }
          if (!window.Game.confirmBigSpend(stake)) return;
          window.Cloud.joinVenture(venture.id, stake).then(() => {
            state.money -= stake;
            let msg = `Присоединился(лась) к «${venture.name}» с вкладом ${formatMoney(stake)}.`;
            if (stake >= VENTURE_REPUTATION_MIN_STAKE) {
              state.reputation = clampNum(state.reputation + VENTURE_REPUTATION_GAIN, 0, 100);
              msg += ` Крупный вклад поднял репутацию на ${VENTURE_REPUTATION_GAIN}.`;
            }
            window.Game.afterSideAction(null, msg);
            render();
          }).catch((e) => { document.getElementById('venture-auth-hint').textContent = e.message; render(); });
        });
        card.querySelector('.item-actions').appendChild(joinBtn);
        host.appendChild(card);
      });
    }).catch((e) => { host.innerHTML = `<p class="tab-hint">Не удалось загрузить: ${e.message}</p>`; });
  }

  document.getElementById('venture-create-btn').addEventListener('click', () => {
    const state = window.Game.getState();
    const nameInput = document.getElementById('venture-name-input');
    const stakeInput = document.getElementById('venture-stake-input');
    const name = nameInput.value.trim() || 'Совместное дело';
    const stake = Math.round(Number(stakeInput.value));
    const hint = document.getElementById('venture-auth-hint');
    if (!stake || stake <= 0) { hint.textContent = 'Укажи размер вклада.'; return; }
    if (stake > state.money) { hint.textContent = 'Не хватает денег на такой вклад.'; return; }
    if (!window.Game.confirmBigSpend(stake)) return;
    window.Cloud.createVenture(name, stake).then(() => {
      state.money -= stake;
      let msg = `Предприятие «${name}» создано, вклад ${formatMoney(stake)}. Ждём партнёра.`;
      if (stake >= VENTURE_REPUTATION_MIN_STAKE) {
        state.reputation = clampNum(state.reputation + VENTURE_REPUTATION_GAIN, 0, 100);
        msg += ` Крупный вклад поднял репутацию на ${VENTURE_REPUTATION_GAIN}.`;
      }
      window.Game.afterSideAction(null, msg);
      nameInput.value = '';
      stakeInput.value = '';
      render();
    }).catch((e) => { hint.textContent = e.message; });
  });

  document.getElementById('donation-btn').addEventListener('click', () => {
    const state = window.Game.getState();
    const input = document.getElementById('donation-amount-input');
    const msgEl = document.getElementById('donation-message');
    const amount = Math.round(Number(input.value));
    if (!amount || amount <= 0) { msgEl.textContent = 'Укажи сумму пожертвования.'; return; }
    if (!window.Game.confirmBigSpend(amount)) return;
    const r = makeDonation(state, amount);
    window.Game.afterSideAction(r.ok ? r.barrier : null, r.message);
    msgEl.textContent = r.message;
    if (r.ok) input.value = '';
    render();
  });

  return { render };
})();
