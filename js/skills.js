/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Вкладка "Обучение" — прокачка навыков за деньги и энергию.
   Даёт постоянные бонусы к проверкам (см. repOk/healthOk в events.js
   и вход в крипто-сделки), а не разовый эффект.
   ========================================================= */

window.SkillsUI = (function () {
  function render() {
    const state = window.Game.getState();
    const host = document.getElementById('skills-list');
    host.innerHTML = '';
    const skills = state.skills || { negotiation: 0, finance: 0, it: 0, fitness: 0 };
    Object.keys(SKILL_LABELS).forEach((key) => {
      const level = skills[key] || 0;
      const cost = scaleByWealth(state, 2000 * (level + 1));
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-icon">📈</div>
        <div class="item-name">${SKILL_LABELS[key]}</div>
        <div class="item-meta">Уровень ${level}/${SKILL_MAX}</div>
        <div class="item-actions"></div>
      `;
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary btn-sm';
      const maxed = level >= SKILL_MAX;
      btn.textContent = maxed ? 'Максимум' : `Тренировать (${formatMoney(cost)}, −15 энергии)`;
      btn.disabled = maxed || state.money < cost || state.energy < 15;
      btn.addEventListener('click', () => {
        const r = trainSkill(state, key);
        window.Game.afterSideAction(r.ok ? r.barrier : null, r.message);
        render();
      });
      card.querySelector('.item-actions').appendChild(btn);
      host.appendChild(card);
    });
  }

  return { render };
})();
