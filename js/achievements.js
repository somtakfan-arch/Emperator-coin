/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Вкладка "Достижения" — список ачивок и статус их получения.
   ========================================================= */

window.AchievementsUI = (function () {
  function render() {
    const state = window.Game.getState();
    const host = document.getElementById('achievements-list');
    host.innerHTML = '';
    const unlocked = state.achievements || {};
    const unlockedCount = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;
    document.getElementById('achievements-progress').textContent = `Открыто: ${unlockedCount}/${ACHIEVEMENTS.length}`;
    ACHIEVEMENTS.forEach((a) => {
      const isUnlocked = !!unlocked[a.id];
      const card = document.createElement('div');
      card.className = 'item-card' + (isUnlocked ? '' : ' achievement-locked');
      card.innerHTML = `
        <div class="item-icon">${isUnlocked ? a.icon : '🔒'}</div>
        <div class="item-name">${a.label}</div>
        <div class="item-meta">${a.desc}</div>
      `;
      host.appendChild(card);
    });
  }

  return { render };
})();
