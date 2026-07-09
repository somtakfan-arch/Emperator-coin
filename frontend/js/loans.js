let myUsername = null;

function fmt(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

const STATUS_LABELS = { offered: 'предложен', active: 'активен', paid: 'погашен', defaulted: 'просрочен' };

document.getElementById('logout-link').addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

async function loadLoans() {
  const loans = await api('/bank/loans');
  const tbody = document.getElementById('loans-body');
  tbody.innerHTML = '';
  if (loans.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Пока нет кредитов</td></tr>';
    return;
  }
  loans.forEach((loan) => {
    let action = '<span class="muted">—</span>';
    if (loan.status === 'offered' && loan.borrower_username === myUsername) {
      action = `<button data-accept="${loan.id}">Принять</button>`;
    } else if (loan.status === 'active' && loan.borrower_username === myUsername) {
      action = `<button data-repay="${loan.id}" data-remaining="${loan.remaining_balance}">Погасить</button>`;
    }
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${loan.lender_username}</td>
      <td>${loan.borrower_username}</td>
      <td>${fmt(loan.principal)} EMP</td>
      <td>${fmt(loan.remaining_balance)} EMP</td>
      <td>${STATUS_LABELS[loan.status] || loan.status}</td>
      <td>${action}</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-accept]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/bank/loans/${btn.getAttribute('data-accept')}/accept`, { method: 'POST' });
        await loadLoans();
      } catch (err) {
        alert(err.message);
      }
    });
  });
  tbody.querySelectorAll('[data-repay]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const remaining = btn.getAttribute('data-remaining');
      const amount = prompt(`Сколько погасить (остаток ${remaining} EMP)?`, remaining);
      if (!amount) return;
      try {
        await api(`/bank/loans/${btn.getAttribute('data-repay')}/repay`, { method: 'POST', body: { amount: parseInt(amount, 10) } });
        await loadLoans();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

document.getElementById('offer-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('offer-error');
  errorEl.style.display = 'none';
  try {
    await api('/bank/loans', {
      method: 'POST',
      body: {
        toUsername: document.getElementById('loan-username').value.trim(),
        principal: parseInt(document.getElementById('loan-principal').value, 10),
        interestRateBps: parseInt(document.getElementById('loan-rate').value, 10),
        termDays: parseInt(document.getElementById('loan-term').value, 10),
        collateralAmount: parseInt(document.getElementById('loan-collateral').value, 10) || 0,
      },
    });
    document.getElementById('offer-form').reset();
    await loadLoans();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

(async function init() {
  if (!requireLoginOrRedirect()) return;
  try {
    const me = await api('/bank/me');
    myUsername = me.username;
    document.getElementById('credit-score').textContent = me.creditScore;
    await loadLoans();
  } catch (err) {
    logout();
  }
})();
