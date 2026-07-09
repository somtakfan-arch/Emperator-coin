const TYPE_LABELS = {
  transfer: 'Перевод',
  mint: 'Эмиссия',
  burn: 'Списание',
  mc_deposit: 'Депозит из игры',
  mc_withdraw: 'Вывод в игру',
  daily_bonus: 'Ежедневный бонус',
  savings_lock: 'Вклад открыт',
  savings_claim: 'Вклад закрыт',
};

let currentUser = null;
let bankConfig = null;
let txLimit = 20;
let lastTransfer = null;

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
}

async function loadConfig() {
  bankConfig = await api('/bank/config');
  const parts = [];
  parts.push(`Мин. сумма: ${fmt(bankConfig.minTransfer)} EMP`);
  if (bankConfig.maxTransfer > 0) parts.push(`макс.: ${fmt(bankConfig.maxTransfer)} EMP`);
  if (bankConfig.transferFeeBps > 0) parts.push(`комиссия: ${(bankConfig.transferFeeBps / 100).toFixed(2)}%`);
  if (bankConfig.dailyTransferLimit > 0) parts.push(`дневной лимит: ${fmt(bankConfig.dailyTransferLimit)} EMP`);
  document.getElementById('transfer-rules').textContent = parts.join(' · ');

  const savingsParts = [
    `Ставка: ${(bankConfig.savingsInterestRateBps / 100).toFixed(2)}%`,
    `срок: ${bankConfig.savingsLockDays} дн.`,
  ];
  document.getElementById('savings-rules').textContent = savingsParts.join(' · ');

  const dailyBtn = document.getElementById('claim-daily');
  dailyBtn.style.display = bankConfig.dailyBonusAmount > 0 ? 'inline-block' : 'none';
}

function renderTxRow(tx) {
  const isOutgoing = tx.from_user_id === currentUser.id;
  const isIncoming = tx.to_user_id === currentUser.id;
  let detail = '';
  if (tx.type === 'transfer') {
    detail = isOutgoing ? `Кому: ${tx.to_username}` : `От: ${tx.from_username}`;
    if (tx.fee) detail += ` (комиссия ${fmt(tx.fee)})`;
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

async function loadSavings() {
  const deposits = await api('/bank/savings');
  const tbody = document.getElementById('savings-body');
  tbody.innerHTML = '';
  if (deposits.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Нет открытых вкладов</td></tr>';
    return;
  }
  deposits.forEach((d) => {
    const matured = new Date(d.matures_at) <= new Date();
    const tr = document.createElement('tr');
    let action = '';
    if (d.claimed) {
      action = '<span class="muted">закрыт</span>';
    } else if (matured) {
      action = `<button class="secondary" data-claim-savings="${d.id}">Забрать</button>`;
    } else {
      action = `<span class="muted">до ${new Date(d.matures_at).toLocaleDateString('ru-RU')}</span>`;
    }
    tr.innerHTML = `
      <td>${fmt(d.amount)} EMP</td>
      <td>${(d.interest_rate_bps / 100).toFixed(2)}%</td>
      <td>${new Date(d.matures_at).toLocaleString('ru-RU')}</td>
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

async function doTransfer(confirm) {
  const toUsername = document.getElementById('to-username').value.trim();
  const amount = parseInt(document.getElementById('amount').value, 10);
  const note = document.getElementById('note').value.trim();
  const errorEl = document.getElementById('transfer-error');
  const successEl = document.getElementById('transfer-success');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';

  const data = await api('/bank/transfer', { method: 'POST', body: { toUsername, amount, note, confirm } });
  if (data.confirmRequired) {
    lastTransfer = { toUsername, amount, note };
    document.getElementById('confirm-text').textContent = data.message;
    document.getElementById('confirm-box').style.display = 'block';
    document.getElementById('transfer-submit').style.display = 'none';
    return;
  }
  successEl.textContent = `Переведено ${fmt(amount)} EMP пользователю ${toUsername}` + (data.fee ? ` (комиссия ${fmt(data.fee)} EMP)` : '');
  successEl.style.display = 'block';
  document.getElementById('transfer-form').reset();
  document.getElementById('confirm-box').style.display = 'none';
  document.getElementById('transfer-submit').style.display = 'inline-block';
  await Promise.all([loadMe(), loadTransactions()]);
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
    await doTransfer(true);
  } catch (err) {
    document.getElementById('transfer-error').textContent = err.message;
    document.getElementById('transfer-error').style.display = 'block';
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
  const errorEl = document.getElementById('savings-error');
  errorEl.style.display = 'none';
  try {
    await api('/bank/savings', { method: 'POST', body: { amount } });
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
    await Promise.all([loadConfig(), loadTransactions(), loadLeaderboard(), loadSavings(), loadRequests()]);
  } catch (err) {
    logout();
  }
})();
