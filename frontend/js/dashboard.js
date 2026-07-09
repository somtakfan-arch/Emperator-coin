const TYPE_LABELS = {
  transfer: 'Перевод',
  mint: 'Эмиссия',
  burn: 'Списание',
  mc_deposit: 'Депозит из игры',
  mc_withdraw: 'Вывод в игру',
};

let currentUser = null;

async function loadMe() {
  currentUser = await api('/bank/me');
  document.getElementById('balance').textContent = currentUser.balance;
  document.getElementById('nav-username').textContent = currentUser.username;
  if (currentUser.role === 'admin') {
    const adminLink = document.getElementById('admin-link');
    adminLink.style.display = 'inline';
    adminLink.href = '/admin.html';
  }
}

function renderTxRow(tx) {
  const isOutgoing = tx.from_user_id === currentUser.id;
  const isIncoming = tx.to_user_id === currentUser.id;
  let detail = '';
  if (tx.type === 'transfer') {
    detail = isOutgoing ? `Кому: ${tx.to_username}` : `От: ${tx.from_username}`;
  } else if (tx.type === 'mc_deposit' || tx.type === 'mc_withdraw') {
    detail = tx.note || '';
  } else {
    detail = tx.note || '';
  }
  const amountClass = isIncoming ? 'amount-in' : 'amount-out';
  const sign = isIncoming ? '+' : '-';
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${new Date(tx.created_at).toLocaleString('ru-RU')}</td>
    <td>${TYPE_LABELS[tx.type] || tx.type}</td>
    <td class="${amountClass}">${sign}${tx.amount} EMP</td>
    <td class="muted">${detail}</td>
  `;
  return tr;
}

async function loadTransactions() {
  const txs = await api('/bank/transactions?limit=100');
  const tbody = document.getElementById('tx-body');
  tbody.innerHTML = '';
  if (txs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Пока нет операций</td></tr>';
    return;
  }
  txs.forEach((tx) => tbody.appendChild(renderTxRow(tx)));
}

document.getElementById('logout-link').addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

document.getElementById('transfer-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const toUsername = document.getElementById('to-username').value.trim();
  const amount = parseInt(document.getElementById('amount').value, 10);
  const note = document.getElementById('note').value.trim();
  const errorEl = document.getElementById('transfer-error');
  const successEl = document.getElementById('transfer-success');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';

  try {
    await api('/bank/transfer', { method: 'POST', body: { toUsername, amount, note } });
    successEl.textContent = `Переведено ${amount} EMP пользователю ${toUsername}`;
    successEl.style.display = 'block';
    document.getElementById('transfer-form').reset();
    await loadMe();
    await loadTransactions();
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

(async function init() {
  if (!requireLoginOrRedirect()) return;
  try {
    await loadMe();
    await loadTransactions();
  } catch (err) {
    logout();
  }
})();
