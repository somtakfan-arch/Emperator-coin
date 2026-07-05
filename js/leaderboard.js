/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Вкладка "Лидеры".
   ========================================================= */

window.LeaderboardUI = (function () {
  const TIER_ICON = { homeless: '🏚️', poor: '🥫', middle: '🏠', rich: '🏙️', millionaire: '💎', billionaire: '👑' };

  function render() {
    const hint = document.getElementById('leaderboard-auth-hint');
    const list = document.getElementById('leaderboard-list');
    const feed = document.getElementById('activity-feed');
    if (!window.Cloud.enabled) {
      hint.textContent = 'Таблица лидеров работает только с облаком Firestore. Настрой js/firebase-config.js (см. README).';
      list.innerHTML = '';
      if (feed) feed.innerHTML = '';
      return;
    }
    hint.textContent = '';
    list.innerHTML = '<p class="tab-hint">Загрузка...</p>';
    window.Cloud.getLeaderboard(20).then((rows) => {
      list.innerHTML = '';
      if (!rows.length) {
        list.innerHTML = '<p class="tab-hint">Пока никто не зарегистрирован.</p>';
        return;
      }
      const myUid = window.Cloud.currentUser ? window.Cloud.currentUser.uid : null;
      rows.forEach((row, i) => {
        const el = document.createElement('div');
        el.className = 'leaderboard-row' + (row.uid === myUid ? ' me' : '');
        el.innerHTML = `
          <span class="lb-rank">#${i + 1}</span>
          <span class="lb-name">${row.name || row.email || 'Игрок'}</span>
          <span class="lb-tier">${TIER_ICON[row.tier] || ''}</span>
          <span class="lb-money">${formatMoney(row.effectiveWealth || row.money || 0)}</span>
        `;
        list.appendChild(el);
      });
    });
    renderActivityFeed();
  }

  function renderActivityFeed() {
    const feed = document.getElementById('activity-feed');
    if (!feed) return;
    feed.innerHTML = '<p class="tab-hint">Загрузка ленты...</p>';
    window.Cloud.listActivity(30).then((rows) => {
      feed.innerHTML = '';
      if (!rows.length) {
        feed.innerHTML = '<p class="tab-hint">Пока никаких заметных событий у игроков не было.</p>';
        return;
      }
      rows.forEach((row) => {
        const el = document.createElement('div');
        el.className = 'activity-entry';
        el.textContent = row.text || '';
        feed.appendChild(el);
      });
    });
  }

  return { render };
})();
