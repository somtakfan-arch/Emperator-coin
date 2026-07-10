const ADMIN_TYPE_LABELS = {
  transfer: 'Перевод',
  mint: 'Эмиссия',
  burn: 'Списание',
  mc_deposit: 'Депозит из игры',
  mc_withdraw: 'Вывод в игру',
  daily_bonus: 'Ежедневный бонус',
  lottery: 'Лотерея',
  savings_lock: 'Вклад открыт',
  savings_claim: 'Вклад закрыт',
  savings_early_withdraw: 'Досрочное снятие',
  group_deposit: 'Взнос в группу',
  group_withdraw: 'Вывод из группы',
  loan_disbursement: 'Выдача кредита',
  loan_repayment: 'Погашение кредита',
  auction_sale: 'Продажа на аукционе',
  achievement_reward: 'Награда за достижение',
  referral_bonus: 'Реферальный бонус',
  quest_reward: 'Награда за задание',
  scheduled_transfer: 'Отложенный перевод',
  donation: 'Донат',
};

const ADMIN_ACTION_LABELS = {
  mint: 'Эмиссия',
  burn: 'Списание',
  freeze: 'Заморозка',
  unfreeze: 'Разморозка',
  config_update: 'Изменение настроек',
  airdrop: 'Раздача',
};

function fmt(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

async function loadStats() {
  const [stats, treasury] = await Promise.all([api('/admin/stats'), api('/admin/treasury')]);
  const tbody = document.getElementById('stats-body');
  tbody.innerHTML = `
    <tr><td>Всего счетов</td><td>${stats.accountCount}</td></tr>
    <tr><td>Общая денежная масса</td><td>${fmt(stats.totalSupply)} EMP</td></tr>
    <tr><td>Средний баланс</td><td>${fmt(stats.averageBalance)} EMP</td></tr>
    <tr><td>Казна (комиссии)</td><td>${fmt(treasury.balance)} EMP</td></tr>
    <tr><td>Топ-3 держателя</td><td>${stats.topHolders.slice(0, 3).map((h) => `${h.username}: ${fmt(h.balance)}`).join(', ') || '—'}</td></tr>
  `;
}

async function loadUsers() {
  const users = await api('/admin/users');
  const tbody = document.getElementById('users-body');
  tbody.innerHTML = '';
  users.forEach((u) => {
    const tr = document.createElement('tr');
    const statusBadge = u.frozen
      ? '<span class="badge frozen">заморожен</span>'
      : '<span class="badge">активен</span>';
    const roleBadge = u.role === 'admin' ? '<span class="badge admin">admin</span>' : u.role;
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.username}</td>
      <td>${roleBadge}</td>
      <td>${fmt(u.balance)} EMP</td>
      <td>${statusBadge}</td>
      <td><button class="secondary" data-toggle-freeze="${u.id}" data-frozen="${u.frozen}">
        ${u.frozen ? 'Разморозить' : 'Заморозить'}
      </button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-toggle-freeze]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const userId = btn.getAttribute('data-toggle-freeze');
      const frozen = btn.getAttribute('data-frozen') === '1' || btn.getAttribute('data-frozen') === 'true';
      try {
        await api(`/admin/${frozen ? 'unfreeze' : 'freeze'}/${userId}`, { method: 'POST' });
        await loadUsers();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function loadAuditLog() {
  const rows = await api('/admin/audit-log?limit=100');
  const tbody = document.getElementById('audit-body');
  tbody.innerHTML = '';
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Пока нет записей</td></tr>';
    return;
  }
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(r.created_at).toLocaleString('ru-RU')}</td>
      <td>${r.admin_username}</td>
      <td>${ADMIN_ACTION_LABELS[r.action] || r.action}</td>
      <td>${r.target_username || '—'}</td>
      <td>${r.amount != null ? fmt(r.amount) : '—'}</td>
      <td class="muted">${r.note || ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function searchTransactions() {
  const username = document.getElementById('tx-search-username').value.trim();
  const type = document.getElementById('tx-search-type').value;
  const params = new URLSearchParams();
  if (username) params.set('username', username);
  if (type) params.set('type', type);
  const rows = await api(`/admin/transactions?${params.toString()}`);
  const tbody = document.getElementById('tx-search-body');
  tbody.innerHTML = '';
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Ничего не найдено</td></tr>';
    return;
  }
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(r.created_at).toLocaleString('ru-RU')}</td>
      <td>${ADMIN_TYPE_LABELS[r.type] || r.type}</td>
      <td>${r.from_username || '—'}</td>
      <td>${r.to_username || '—'}</td>
      <td>${fmt(r.amount)} EMP</td>
      <td class="muted">${r.note || ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadConfigForm() {
  const config = await api('/admin/config');
  document.getElementById('cfg-fee').value = config.transferFeeBps;
  document.getElementById('cfg-min').value = config.minTransfer;
  document.getElementById('cfg-max').value = config.maxTransfer;
  document.getElementById('cfg-daily-limit').value = config.dailyTransferLimit;
  document.getElementById('cfg-large-threshold').value = config.largeTransferThreshold;
  document.getElementById('cfg-daily-bonus').value = config.dailyBonusAmount;
  document.getElementById('cfg-savings-rate').value = config.savingsInterestRateBps;
  document.getElementById('cfg-savings-days').value = config.savingsLockDays;
  document.getElementById('cfg-pin-threshold').value = config.pinRequiredAbove;
  document.getElementById('cfg-early-penalty').value = config.earlyWithdrawalPenaltyBps;
  document.getElementById('cfg-referral-bonus').value = config.referralBonusAmount;
  document.getElementById('cfg-daily-mint-limit').value = config.dailyMintLimit;
  document.getElementById('cfg-auction-fee').value = config.auctionFeeBps;
  document.getElementById('cfg-emp-per-rub').value = config.empPerRub;
  document.getElementById('cfg-min-donation').value = config.minDonationRub;
  document.getElementById('cfg-savings-tiers').value = JSON.stringify(config.savingsTiers);
  document.getElementById('cfg-tier-thresholds').value = JSON.stringify(config.tierThresholds);
  document.getElementById('cfg-lottery-prizes').value = JSON.stringify(config.lotteryPrizes);
  document.getElementById('cfg-ip-whitelist').value = JSON.stringify(config.adminIpWhitelist || []);
}

document.getElementById('logout-link').addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

document.getElementById('mint-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const action = e.submitter ? e.submitter.getAttribute('data-action') : 'mint';
  const username = document.getElementById('mint-username').value.trim();
  const amount = parseInt(document.getElementById('mint-amount').value, 10);
  const errorEl = document.getElementById('mint-error');
  const successEl = document.getElementById('mint-success');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';

  try {
    await api(`/admin/${action}`, { method: 'POST', body: { username, amount } });
    successEl.textContent = `Готово: ${action === 'mint' ? 'начислено' : 'списано'} ${fmt(amount)} EMP пользователю ${username}`;
    successEl.style.display = 'block';
    document.getElementById('mint-form').reset();
    await Promise.all([loadUsers(), loadStats(), loadAuditLog()]);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('airdrop-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const amount = parseInt(document.getElementById('airdrop-amount').value, 10);
  const note = document.getElementById('airdrop-note').value.trim();
  const errorEl = document.getElementById('airdrop-error');
  const successEl = document.getElementById('airdrop-success');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';
  if (!confirm(`Начислить ${fmt(amount)} EMP всем пользователям?`)) return;

  try {
    const data = await api('/admin/airdrop', { method: 'POST', body: { amount, note } });
    successEl.textContent = `Раздано ${fmt(amount)} EMP каждому из ${data.recipients} пользователей`;
    successEl.style.display = 'block';
    document.getElementById('airdrop-form').reset();
    await Promise.all([loadUsers(), loadStats(), loadAuditLog()]);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('config-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('config-error');
  const successEl = document.getElementById('config-success');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';
  const body = {
    transferFeeBps: document.getElementById('cfg-fee').value,
    minTransfer: document.getElementById('cfg-min').value,
    maxTransfer: document.getElementById('cfg-max').value,
    dailyTransferLimit: document.getElementById('cfg-daily-limit').value,
    largeTransferThreshold: document.getElementById('cfg-large-threshold').value,
    dailyBonusAmount: document.getElementById('cfg-daily-bonus').value,
    savingsInterestRateBps: document.getElementById('cfg-savings-rate').value,
    savingsLockDays: document.getElementById('cfg-savings-days').value,
    pinRequiredAbove: document.getElementById('cfg-pin-threshold').value,
    earlyWithdrawalPenaltyBps: document.getElementById('cfg-early-penalty').value,
    referralBonusAmount: document.getElementById('cfg-referral-bonus').value,
    dailyMintLimit: document.getElementById('cfg-daily-mint-limit').value,
    auctionFeeBps: document.getElementById('cfg-auction-fee').value,
    empPerRub: document.getElementById('cfg-emp-per-rub').value,
    minDonationRub: document.getElementById('cfg-min-donation').value,
  };
  try {
    body.savingsTiers = JSON.parse(document.getElementById('cfg-savings-tiers').value || '[]');
    body.tierThresholds = JSON.parse(document.getElementById('cfg-tier-thresholds').value || '[]');
    body.lotteryPrizes = JSON.parse(document.getElementById('cfg-lottery-prizes').value || '[]');
    body.adminIpWhitelist = JSON.parse(document.getElementById('cfg-ip-whitelist').value || '[]');
  } catch (err) {
    errorEl.textContent = 'Ошибка в JSON-полях: ' + err.message;
    errorEl.style.display = 'block';
    return;
  }
  try {
    await api('/admin/config', { method: 'POST', body });
    successEl.textContent = 'Настройки сохранены';
    successEl.style.display = 'block';
    await loadAuditLog();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('bulk-freeze-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const frozen = e.submitter ? e.submitter.getAttribute('data-frozen') === 'true' : true;
  const usernames = document.getElementById('bulk-usernames').value.split(',').map((s) => s.trim()).filter(Boolean);
  const errorEl = document.getElementById('bulk-freeze-error');
  const successEl = document.getElementById('bulk-freeze-success');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';
  try {
    const result = await api('/admin/freeze-bulk', { method: 'POST', body: { usernames, frozen } });
    successEl.textContent = `Обновлено: ${result.updated.join(', ') || 'никого'}` +
      (result.notFound.length ? `; не найдены: ${result.notFound.join(', ')}` : '');
    successEl.style.display = 'block';
    document.getElementById('bulk-freeze-form').reset();
    await Promise.all([loadUsers(), loadAuditLog()]);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('export-btn').addEventListener('click', async () => {
  try {
    const data = await api('/admin/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emperator-bank-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('tx-search-btn').addEventListener('click', searchTransactions);

(async function init() {
  if (!requireLoginOrRedirect()) return;
  try {
    const me = await api('/bank/me');
    if (me.role !== 'admin') {
      window.location.href = '/dashboard.html';
      return;
    }
    await Promise.all([loadStats(), loadUsers(), loadConfigForm(), loadAuditLog(), searchTransactions()]);
  } catch (err) {
    logout();
  }
})();
