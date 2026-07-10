const TYPE_LABELS = {
  transfer: 'Перевод',
  mint: 'Эмиссия',
  burn: 'Списание',
  mc_deposit: 'Депозит из игры',
  mc_withdraw: 'Вывод в игру',
  daily_bonus: 'Ежедневный бонус',
  lottery: 'Лотерея',
  savings_lock: 'Вклад открыт',
  savings_claim: 'Вклад закрыт',
  savings_early_withdraw: 'Досрочное снятие вклада',
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

let currentUser = null;
let bankConfig = null;
let txLimit = 20;

function fmt(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

async function loadMe() {
  currentUser = await api('/bank/me');
  document.getElementById('balance').textContent = fmt(currentUser.balance);
  document.getElementById('nav-username').textContent = currentUser.username;
  if (currentUser.role === 'admin') {
    const adminLink = document.getElementById('admin-link');
    adminLink.style.display = 'inline';
    adminLink.href = '/admin.html';
  }

  const syncEl = document.getElementById('sync-status');
  const gap = (currentUser.balance || 0) - (currentUser.syncedBalance || 0);
  if (gap === 0) {
    syncEl.textContent = 'Это ваши реальные игровые деньги — синхронизировано.';
  } else {
    syncEl.textContent = `Ждёт применения в игре: ${gap > 0 ? '+' : ''}${fmt(gap)} EMP ` +
      '(зайдите на сервер, применится автоматически в течение нескольких секунд).';
  }
}

async function loadConfig() {
  bankConfig = await api('/bank/config');
  const parts = [];
  parts.push(`Мин. сумма: ${fmt(bankConfig.minTransfer)} EMP`);
  if (bankConfig.maxTransfer > 0) parts.push(`макс.: ${fmt(bankConfig.maxTransfer)} EMP`);
  if (bankConfig.transferFeeBps > 0) parts.push(`комиссия: ${(bankConfig.transferFeeBps / 100).toFixed(2)}%`);
  if (bankConfig.dailyTransferLimit > 0) parts.push(`дневной лимит: ${fmt(bankConfig.dailyTransferLimit)} EMP`);
  document.getElementById('transfer-rules').textContent = parts.join(' · ');

  const tierSelect = document.getElementById('savings-tier');
  tierSelect.innerHTML = '';
  (bankConfig.savingsTiers || []).forEach((tier, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${tier.days} дн. — ${(tier.rateBps / 100).toFixed(2)}%`;
    tierSelect.appendChild(opt);
  });

  document.getElementById('claim-daily').style.display = bankConfig.dailyBonusAmount > 0 ? 'inline-block' : 'none';
}

async function loadTier() {
  const tier = await api('/bank/tier');
  document.getElementById('tier-display').textContent =
    `Уровень: ${tier.name}` + (tier.feeDiscountBps > 0 ? ` (скидка на комиссию ${(tier.feeDiscountBps / 100).toFixed(2)}%)` : '');
}

async function loadAchievements() {
  const list = await api('/bank/achievements');
  const el = document.getElementById('achievements-list');
  el.innerHTML = '';
  list.forEach((a) => {
    const span = document.createElement('span');
    span.className = 'badge' + (a.unlocked_at ? ' admin' : '');
    span.title = a.description;
    span.textContent = (a.unlocked_at ? '✓ ' : '') + a.description;
    el.appendChild(span);
  });
}

async function loadQuests() {
  const quests = await api('/bank/quests');
  const tbody = document.getElementById('quests-body');
  tbody.innerHTML = '';
  quests.forEach((q) => {
    const complete = q.progress >= q.target;
    let action = '<span class="muted">—</span>';
    if (q.claimed) action = '<span class="muted">получено</span>';
    else if (complete) action = `<button data-claim-quest="${q.code}">Забрать</button>`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${q.description}</td>
      <td>${q.progress}/${q.target}</td>
      <td>${fmt(q.reward)} EMP</td>
      <td>${action}</td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-claim-quest]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/bank/quests/${btn.getAttribute('data-claim-quest')}/claim`, { method: 'POST' });
        await Promise.all([loadMe(), loadQuests()]);
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function renderTxRow(tx) {
  const isOutgoing = tx.from_user_id === currentUser.id;
  const isIncoming = tx.to_user_id === currentUser.id;
  let detail = '';
  if (tx.type === 'transfer' || tx.type === 'scheduled_transfer') {
    detail = isOutgoing ? `Кому: ${tx.to_username}` : `От: ${tx.from_username}`;
    if (tx.fee) detail += ` (комиссия ${fmt(tx.fee)})`;
    if (tx.groupTax) detail += ` (налог группы ${fmt(tx.groupTax)})`;
  } else {
    detail = tx.note || '';
  }
  const amountClass = isIncoming ? 'amount-in' : 'amount-out';
  const sign = isIncoming ? '+' : '-';
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${new Date(tx.created_at).toLocaleString('ru-RU')}</td>
    <td>${TYPE_LABELS[tx.type] || tx.type}</td>
    <td class="${amountClass}">${sign}${fmt(tx.amount)} EMP</td>
    <td class="muted">${detail}</td>
  `;
  return tr;
}

let lastLoadedTxs = [];

async function loadTransactions() {
  const type = document.getElementById('tx-filter').value;
  const query = `?limit=${txLimit}${type ? `&type=${encodeURIComponent(type)}` : ''}`;
  const txs = await api(`/bank/transactions${query}`);
  lastLoadedTxs = txs;
  const tbody = document.getElementById('tx-body');
  tbody.innerHTML = '';
  if (txs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Пока нет операций</td></tr>';
  } else {
    txs.forEach((tx) => tbody.appendChild(renderTxRow(tx)));
  }
  document.getElementById('tx-load-more').style.display = txs.length >= txLimit ? 'inline-block' : 'none';
}

function exportCsv() {
  const header = 'Дата,Тип,Сумма,Комиссия,От,Кому,Комментарий\n';
  const rows = lastLoadedTxs.map((tx) =>
    [
      tx.created_at,
      TYPE_LABELS[tx.type] || tx.type,
      tx.amount,
      tx.fee || 0,
      tx.from_username || '',
      tx.to_username || '',
      (tx.note || '').replace(/,/g, ';'),
    ].join(',')
  );
  const csv = header + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `emperator-bank-history-${currentUser.username}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadLeaderboard() {
  const board = await api('/bank/leaderboard?limit=10');
  const tbody = document.getElementById('leaderboard-body');
  tbody.innerHTML = '';
  board.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i + 1}</td><td>${row.username}</td><td>${fmt(row.balance)} EMP</td>`;
    tbody.appendChild(tr);
  });
}

async function loadFavorites() {
  const favorites = await api('/bank/favorites');
  const el = document.getElementById('favorites-list');
  if (favorites.length === 0) {
    el.textContent = '';
    return;
  }
  el.innerHTML = 'Избранное: ' + favorites
    .map((f) => `<a href="#" data-favorite="${f}" style="margin-right:0.5rem">${f}</a> <a href="#" data-remove-favorite="${f}" title="убрать">✕</a>`)
    .join(' ');
  el.querySelectorAll('[data-favorite]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('to-username').value = link.getAttribute('data-favorite');
    });
  });
  el.querySelectorAll('[data-remove-favorite]').forEach((link) => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      await api(`/bank/favorites/${link.getAttribute('data-remove-favorite')}`, { method: 'DELETE' });
      await loadFavorites();
    });
  });
}

async function loadSavings() {
  const deposits = await api('/bank/savings');
  const tbody = document.getElementById('savings-body');
  tbody.innerHTML = '';
  if (deposits.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Нет открытых вкладов</td></tr>';
    return;
  }
  deposits.forEach((d) => {
    const matured = new Date(d.matures_at) <= new Date();
    const tr = document.createElement('tr');
    let action = '';
    if (d.claimed) {
      action = `<span class="muted">${d.early_withdrawal ? 'снят досрочно' : 'закрыт'}</span>`;
    } else if (matured) {
      action = `<button class="secondary" data-claim-savings="${d.id}">Забрать</button>`;
    } else {
      action = `<span class="muted">до ${new Date(d.matures_at).toLocaleDateString('ru-RU')}</span> <button class="secondary" data-early-savings="${d.id}">Снять досрочно</button>`;
    }
    tr.innerHTML = `
      <td>${fmt(d.amount)} EMP</td>
      <td>${(d.interest_rate_bps / 100).toFixed(2)}%</td>
      <td>${new Date(d.matures_at).toLocaleString('ru-RU')}</td>
      <td>${d.auto_renew ? 'да' : 'нет'}</td>
      <td>${action}</td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-claim-savings]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/bank/savings/${btn.getAttribute('data-claim-savings')}/claim`, { method: 'POST' });
        await Promise.all([loadMe(), loadSavings()]);
      } catch (err) {
        alert(err.message);
      }
    });
  });
  tbody.querySelectorAll('[data-early-savings]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Досрочное снятие теряет проценты и часть суммы штрафом. Продолжить?')) return;
      try {
        await api(`/bank/savings/${btn.getAttribute('data-early-savings')}/withdraw-early`, { method: 'POST' });
        await Promise.all([loadMe(), loadSavings()]);
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function loadRequests() {
  const requests = await api('/bank/requests');
  const tbody = document.getElementById('requests-body');
  tbody.innerHTML = '';
  if (requests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Нет запросов</td></tr>';
    return;
  }
  requests.forEach((r) => {
    const isIncoming = r.payer_id === currentUser.id && r.status === 'pending';
    const who = r.requester_id === currentUser.id ? `Кому: ${r.payer_username}` : `От: ${r.requester_username}`;
    const statusLabel = { pending: 'ожидает', approved: 'выполнен', declined: 'отклонён' }[r.status];
    let action = '<span class="muted">—</span>';
    if (isIncoming) {
      action = `
        <button data-approve="${r.id}">Оплатить</button>
        <button class="secondary" data-decline="${r.id}">Отклонить</button>
      `;
    }
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${who}</td><td>${fmt(r.amount)} EMP</td><td>${statusLabel}</td><td>${action}</td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-approve]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/bank/requests/${btn.getAttribute('data-approve')}/approve`, { method: 'POST' });
        await Promise.all([loadMe(), loadRequests(), loadTransactions()]);
      } catch (err) {
        alert(err.message);
      }
    });
  });
  tbody.querySelectorAll('[data-decline]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/bank/requests/${btn.getAttribute('data-decline')}/decline`, { method: 'POST' });
        await loadRequests();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function loadScheduled() {
  const [scheduled, recurring] = await Promise.all([api('/bank/scheduled'), api('/bank/recurring')]);
  const tbody = document.getElementById('scheduled-body');
  tbody.innerHTML = '';
  const STATUS_LABELS = { pending: 'ожидает', executed: 'выполнен', cancelled: 'отменён' };
  if (scheduled.length === 0 && recurring.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Нет отложенных или регулярных переводов</td></tr>';
    return;
  }
  scheduled.forEach((s) => {
    const tr = document.createElement('tr');
    const action = s.status === 'pending' ? `<button class="secondary" data-cancel-scheduled="${s.id}">Отменить</button>` : '';
    tr.innerHTML = `
      <td>${s.to_username}</td>
      <td>${fmt(s.amount)} EMP</td>
      <td>${new Date(s.execute_at).toLocaleString('ru-RU')}</td>
      <td>${STATUS_LABELS[s.status] || s.status}</td>
      <td>${action}</td>
    `;
    tbody.appendChild(tr);
  });
  recurring.forEach((r) => {
    const tr = document.createElement('tr');
    const action = r.active ? `<button class="secondary" data-cancel-recurring="${r.id}">Остановить</button>` : '<span class="muted">остановлен</span>';
    tr.innerHTML = `
      <td>${r.to_username} (регулярно, раз в ${r.interval_days} дн.)</td>
      <td>${fmt(r.amount)} EMP</td>
      <td>${new Date(r.next_run_at).toLocaleString('ru-RU')}</td>
      <td>${r.active ? 'активен' : 'остановлен'}</td>
      <td>${action}</td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-cancel-scheduled]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/bank/scheduled/${btn.getAttribute('data-cancel-scheduled')}/cancel`, { method: 'POST' });
        await Promise.all([loadMe(), loadScheduled()]);
      } catch (err) {
        alert(err.message);
      }
    });
  });
  tbody.querySelectorAll('[data-cancel-recurring]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/bank/recurring/${btn.getAttribute('data-cancel-recurring')}/cancel`, { method: 'POST' });
        await loadScheduled();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function loadPayLinks() {
  const links = await api('/bank/pay-links');
  const tbody = document.getElementById('paylinks-body');
  tbody.innerHTML = '';
  if (links.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="muted">Нет созданных ссылок</td></tr>';
    return;
  }
  links.forEach((l) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${l.code}</td><td>${fmt(l.amount)} EMP</td><td>${l.used ? `оплачено (${l.used_by})` : 'ожидает'}</td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById('logout-link').addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

document.getElementById('claim-daily').addEventListener('click', async () => {
  const msg = document.getElementById('daily-msg');
  try {
    const data = await api('/bank/daily', { method: 'POST' });
    msg.textContent = `Получено ${fmt(data.amount)} EMP`;
    msg.style.display = 'block';
    await loadMe();
  } catch (err) {
    msg.textContent = err.message;
    msg.style.display = 'block';
  }
});

document.getElementById('spin-lottery').addEventListener('click', async () => {
  const msg = document.getElementById('lottery-msg');
  try {
    const data = await api('/bank/lottery/spin', { method: 'POST' });
    msg.textContent = `Выигрыш: ${fmt(data.amount)} EMP!`;
    msg.style.display = 'block';
    await loadMe();
  } catch (err) {
    msg.textContent = err.message;
    msg.style.display = 'block';
  }
});

async function doTransfer(confirm, pin) {
  const toUsername = document.getElementById('to-username').value.trim();
  const amount = parseInt(document.getElementById('amount').value, 10);
  const note = document.getElementById('note').value.trim();
  const delaySeconds = parseInt(document.getElementById('delay-seconds').value, 10) || 0;
  const errorEl = document.getElementById('transfer-error');
  const successEl = document.getElementById('transfer-success');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';

  const data = await api('/bank/transfer', { method: 'POST', body: { toUsername, amount, note, confirm, pin, delaySeconds } });
  if (data.confirmRequired) {
    document.getElementById('confirm-text').textContent = data.message;
    document.getElementById('pin-box').style.display = data.pinRequired ? 'block' : 'none';
    document.getElementById('confirm-box').style.display = 'block';
    document.getElementById('transfer-submit').style.display = 'none';
    return;
  }

  if (document.getElementById('add-favorite').checked) {
    await api('/bank/favorites', { method: 'POST', body: { username: toUsername } });
  }

  if (data.pending) {
    successEl.textContent = `Перевод запланирован на ${new Date(data.executeAt).toLocaleString('ru-RU')}, его можно отменить ниже.`;
  } else {
    successEl.textContent = `Переведено ${fmt(amount)} EMP пользователю ${toUsername}` + (data.fee ? ` (комиссия ${fmt(data.fee)} EMP)` : '');
  }
  successEl.style.display = 'block';
  document.getElementById('transfer-form').reset();
  document.getElementById('confirm-box').style.display = 'none';
  document.getElementById('transfer-submit').style.display = 'inline-block';
  await Promise.all([loadMe(), loadTransactions(), loadFavorites(), loadScheduled()]);
}

document.getElementById('transfer-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await doTransfer(false);
  } catch (err) {
    document.getElementById('transfer-error').textContent = err.message;
    document.getElementById('transfer-error').style.display = 'block';
  }
});

document.getElementById('confirm-transfer').addEventListener('click', async () => {
  try {
    const pin = document.getElementById('confirm-pin').value.trim();
    await doTransfer(true, pin || undefined);
  } catch (err) {
    document.getElementById('transfer-error').textContent = err.message;
    document.getElementById('transfer-error').style.display = 'block';
  }
});

document.getElementById('split-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usernames = document.getElementById('split-usernames').value.split(',').map((s) => s.trim()).filter(Boolean);
  const amount = parseInt(document.getElementById('split-amount').value, 10);
  const errorEl = document.getElementById('split-error');
  const successEl = document.getElementById('split-success');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';
  try {
    await api('/bank/split-transfer', { method: 'POST', body: { usernames, amount } });
    successEl.textContent = `Разделено между ${usernames.length} игроками`;
    successEl.style.display = 'block';
    document.getElementById('split-form').reset();
    await Promise.all([loadMe(), loadTransactions()]);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('recurring-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const toUsername = document.getElementById('rec-username').value.trim();
  const amount = parseInt(document.getElementById('rec-amount').value, 10);
  const intervalDays = parseInt(document.getElementById('rec-interval').value, 10);
  const errorEl = document.getElementById('recurring-error');
  errorEl.style.display = 'none';
  try {
    await api('/bank/recurring', { method: 'POST', body: { toUsername, amount, intervalDays } });
    document.getElementById('recurring-form').reset();
    await loadScheduled();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('paylink-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const amount = parseInt(document.getElementById('paylink-amount').value, 10);
  const note = document.getElementById('paylink-note').value.trim();
  const errorEl = document.getElementById('paylink-error');
  errorEl.style.display = 'none';
  try {
    await api('/bank/pay-links', { method: 'POST', body: { amount, note } });
    document.getElementById('paylink-form').reset();
    await loadPayLinks();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('redeem-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('redeem-code').value.trim();
  const errorEl = document.getElementById('redeem-error');
  errorEl.style.display = 'none';
  try {
    const data = await api(`/bank/pay-links/${code}/redeem`, { method: 'POST' });
    document.getElementById('redeem-form').reset();
    await Promise.all([loadMe(), loadTransactions()]);
    alert(`Оплачено ${fmt(data.netAmount)} EMP пользователю ${data.creatorUsername}`);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('request-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fromUsername = document.getElementById('req-username').value.trim();
  const amount = parseInt(document.getElementById('req-amount').value, 10);
  const note = document.getElementById('req-note').value.trim();
  const errorEl = document.getElementById('request-error');
  errorEl.style.display = 'none';
  try {
    await api('/bank/requests', { method: 'POST', body: { fromUsername, amount, note } });
    document.getElementById('request-form').reset();
    await loadRequests();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('savings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const amount = parseInt(document.getElementById('savings-amount').value, 10);
  const tierIndex = parseInt(document.getElementById('savings-tier').value, 10) || 0;
  const autoRenew = document.getElementById('savings-autorenew').checked;
  const errorEl = document.getElementById('savings-error');
  errorEl.style.display = 'none';
  try {
    await api('/bank/savings', { method: 'POST', body: { amount, tierIndex, autoRenew } });
    document.getElementById('savings-form').reset();
    await Promise.all([loadMe(), loadSavings()]);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('get-link-code').addEventListener('click', async () => {
  try {
    const data = await api('/bank/link-code', { method: 'POST' });
    const display = document.getElementById('link-code-display');
    display.textContent = data.code;
    display.style.display = 'block';
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('tx-filter').addEventListener('change', () => {
  txLimit = 20;
  loadTransactions();
});

document.getElementById('tx-load-more').addEventListener('click', () => {
  txLimit += 20;
  loadTransactions();
});

document.getElementById('export-csv').addEventListener('click', exportCsv);

(async function init() {
  if (!requireLoginOrRedirect()) return;
  try {
    await loadMe();
    await Promise.all([
      loadConfig(),
      loadTransactions(),
      loadLeaderboard(),
      loadSavings(),
      loadRequests(),
      loadTier(),
      loadAchievements(),
      loadQuests(),
      loadFavorites(),
      loadScheduled(),
      loadPayLinks(),
    ]);
  } catch (err) {
    logout();
  }
})();
