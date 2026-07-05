/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Вкладка "Дуэли" — вызов другого игрока на мини-игру за ставку.
   Требует аккаунт (Firebase), т.к. это межигровая функция.
   ========================================================= */

window.DuelsUI = (function () {
  const DUEL_TIMING_PARAMS = { period: 1200, zoneCenter: 0.5, zoneWidth: 0.22, timeLimit: 6000 };

  function precisionFromMeta(meta) {
    const pos = typeof meta.position === 'number' ? meta.position : 0;
    return Math.max(0, 1 - Math.abs(pos - DUEL_TIMING_PARAMS.zoneCenter) / DUEL_TIMING_PARAMS.zoneCenter);
  }

  function render() {
    const hint = document.getElementById('duels-auth-hint');
    const body = document.getElementById('duels-body');
    if (!window.Cloud.enabled) {
      hint.textContent = 'Дуэли работают только с облаком Firestore. Настрой js/firebase-config.js (см. README), чтобы бросать вызовы другим игрокам.';
      body.classList.add('hidden');
      return;
    }
    if (!window.Cloud.currentUser) {
      hint.textContent = 'Войди в аккаунт на первом экране, чтобы вызывать других игроков на дуэль.';
      body.classList.add('hidden');
      return;
    }
    hint.textContent = '';
    body.classList.remove('hidden');
    renderOpenDuels();
  }

  function renderOpenDuels() {
    const host = document.getElementById('duels-list');
    host.innerHTML = '<p class="tab-hint">Загрузка...</p>';
    window.Cloud.listOpenDuels().then((rows) => {
      host.innerHTML = '';
      if (!rows.length) {
        host.innerHTML = '<p class="tab-hint">Открытых вызовов пока нет.</p>';
        return;
      }
      const myUid = window.Cloud.currentUser.uid;
      rows.forEach((duel) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
          <div class="item-icon">⚔️</div>
          <div class="item-name">${duel.challengerName || 'Игрок'}</div>
          <div class="item-meta">Ставка: ${formatMoney(duel.stake)}</div>
          <div class="item-actions"></div>
        `;
        const actions = card.querySelector('.item-actions');
        if (duel.challengerUid === myUid) {
          const cancelBtn = document.createElement('button');
          cancelBtn.className = 'btn btn-secondary btn-sm';
          cancelBtn.textContent = 'Отменить вызов';
          cancelBtn.addEventListener('click', () => {
            window.Cloud.cancelDuel(duel.id).then(() => {
              const state = window.Game.getState();
              state.money += duel.stake;
              window.Game.afterSideAction(null, 'Вызов отменён, ставка возвращена.');
              render();
            }).catch((e) => { document.getElementById('duels-auth-hint').textContent = e.message; });
          });
          actions.appendChild(cancelBtn);
        } else {
          const acceptBtn = document.createElement('button');
          acceptBtn.className = 'btn btn-primary btn-sm';
          acceptBtn.textContent = `Принять вызов (${formatMoney(duel.stake)})`;
          acceptBtn.addEventListener('click', () => {
            const state = window.Game.getState();
            if (state.money < duel.stake) { document.getElementById('duels-auth-hint').textContent = 'Не хватает денег на ставку.'; return; }
            if (!window.Game.confirmBigSpend(duel.stake)) return;
            playDuelMinigame((success, meta) => {
              const precision = precisionFromMeta(meta);
              window.Cloud.acceptDuel(duel.id, { success, precision }).then((outcome) => {
                const iWon = !outcome.challengerWins;
                const netDelta = iWon ? duel.stake : -duel.stake;
                state.money += netDelta;
                window.Game.afterSideAction(null, iWon ? `Победа! Забрал(а) ${formatMoney(outcome.pot)}.` : `Поражение — ставка ${formatMoney(duel.stake)} потеряна.`);
                render();
              }).catch((e) => { document.getElementById('duels-auth-hint').textContent = e.message; render(); });
            });
          });
          actions.appendChild(acceptBtn);
        }
        host.appendChild(card);
      });
    }).catch((e) => { host.innerHTML = `<p class="tab-hint">Не удалось загрузить: ${e.message}</p>`; });
  }

  function playDuelMinigame(onDone) {
    const modal = document.getElementById('minigame-modal');
    document.getElementById('minigame-title').textContent = 'Дуэль: поймай момент';
    document.getElementById('minigame-instructions').textContent = 'Останови маркер как можно точнее в центре зелёной зоны — точность решает исход дуэли.';
    modal.classList.add('active');
    const host = document.getElementById('minigame-host');
    window.MiniGames.timing.mount(host, DUEL_TIMING_PARAMS, (success, meta) => {
      const resultEl = document.createElement('div');
      resultEl.className = 'minigame-result ' + (success ? 'win' : 'lose');
      resultEl.textContent = success ? 'Точный удар!' : 'Мимо зоны...';
      host.innerHTML = '';
      host.appendChild(resultEl);
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = 'Продолжить';
      btn.addEventListener('click', () => {
        modal.classList.remove('active');
        onDone(success, meta);
      }, { once: true });
      host.appendChild(btn);
    });
  }

  document.getElementById('duel-create-btn').addEventListener('click', () => {
    const state = window.Game.getState();
    const input = document.getElementById('duel-stake-input');
    const stake = Math.round(Number(input.value));
    const msgEl = document.getElementById('duels-auth-hint');
    if (!stake || stake <= 0) { msgEl.textContent = 'Укажи размер ставки.'; return; }
    if (stake > state.money) { msgEl.textContent = 'Не хватает денег на такую ставку.'; return; }
    if (!window.Game.confirmBigSpend(stake)) return;
    playDuelMinigame((success, meta) => {
      const precision = precisionFromMeta(meta);
      window.Cloud.createDuel(stake, 'timing', { success, precision }).then(() => {
        state.money -= stake;
        window.Game.afterSideAction(null, `Вызов создан со ставкой ${formatMoney(stake)}. Ждём соперника.`);
        input.value = '';
        render();
      }).catch((e) => { msgEl.textContent = e.message; });
    });
  });

  return { render };
})();
