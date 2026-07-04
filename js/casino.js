/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Вкладка "Казино" — отдельные ставки на мини-игры.
   Итог решает точность/расчёт/реакция игрока, без единого
   броска кубика.
   ========================================================= */

window.CasinoUI = (function () {
  const GAMES = {
    timing: { label: '🎯 Тайминг', payout: 2.5, instructions: 'Останови маркер точно в зелёной зоне.' },
    math: { label: '🧮 Быстрый счёт', payout: 1.8, instructions: 'Реши арифметику до истечения времени.' },
    reaction: { label: '⚡ Реакция', payout: 3, instructions: 'Жми точно в открывшееся окно — не раньше и не позже.' },
  };
  let activeGame = 'timing';

  function render() {
    const host = document.getElementById('casino-games');
    host.innerHTML = '';
    Object.keys(GAMES).forEach((key) => {
      const chip = document.createElement('button');
      chip.className = 'chip' + (key === activeGame ? ' active' : '');
      chip.textContent = `${GAMES[key].label} · ×${GAMES[key].payout}`;
      chip.addEventListener('click', () => { activeGame = key; render(); });
      host.appendChild(chip);
    });
    document.getElementById('casino-bet-row').classList.remove('hidden');
    document.getElementById('casino-message').textContent = GAMES[activeGame].instructions;
  }

  function mathQuestion(stake) {
    const a = Math.round(stake * 1.2);
    const pool = [a, Math.round(stake * 1.1), Math.round(stake * 1.3), Math.round(stake * 0.8)];
    const order = [[0, 1, 2, 3], [1, 3, 0, 2], [2, 0, 3, 1], [3, 2, 1, 0]][Math.floor(stake) % 4];
    return { question: `${formatMoney(stake)} + 20% = ?`, answers: order.map((i) => ({ label: formatMoney(pool[i]), correct: i === 0 })) };
  }

  function play() {
    const state = window.Game.getState();
    const input = document.getElementById('casino-bet-input');
    const stake = Math.round(Number(input.value));
    const msgEl = document.getElementById('casino-message');
    if (!stake || stake <= 0) { msgEl.textContent = 'Укажи размер ставки.'; return; }
    if (stake > state.money) { msgEl.textContent = 'Не хватает денег на такую ставку.'; return; }

    const modal = document.getElementById('minigame-modal');
    document.getElementById('minigame-title').textContent = GAMES[activeGame].label;
    document.getElementById('minigame-instructions').textContent = GAMES[activeGame].instructions;
    modal.classList.add('active');
    const host = document.getElementById('minigame-host');

    function resolve(success) {
      const r = placeCasinoBet(state, stake, success, GAMES[activeGame].payout);
      const resultEl = document.createElement('div');
      resultEl.className = 'minigame-result ' + (success ? 'win' : 'lose');
      resultEl.textContent = success ? `Выигрыш: ${formatMoney(r.winnings)}!` : `Ставка проиграна: −${formatMoney(stake)}.`;
      host.innerHTML = '';
      host.appendChild(resultEl);
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = 'Продолжить';
      btn.addEventListener('click', () => {
        modal.classList.remove('active');
        window.Game.afterSideAction(r.barrier, '');
        msgEl.textContent = GAMES[activeGame].instructions;
      }, { once: true });
      host.appendChild(btn);
    }

    if (activeGame === 'timing') {
      window.MiniGames.timing.mount(host, { period: 900, zoneCenter: 0.5, zoneWidth: 0.18, timeLimit: 5000 }, (success) => resolve(success));
    } else if (activeGame === 'math') {
      const q = mathQuestion(stake);
      window.MiniGames.math.mount(host, { question: q.question, answers: q.answers, timeLimit: 8000 }, (success) => resolve(success));
    } else {
      window.MiniGames.reaction.mount(host, { delay: 1300, windowMs: 700, waitLabel: 'Жди...', promptLabel: 'ЖМИ!' }, (success) => resolve(success));
    }
  }

  document.getElementById('casino-play-btn').addEventListener('click', play);

  return { render };
})();
