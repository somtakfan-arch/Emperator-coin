let empPerRub = 0;

function fmt(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

const STATUS_LABELS = { pending: 'в обработке', succeeded: 'оплачено' };
const LAST_DONATION_KEY = 'emperator_last_donation';

document.getElementById('logout-link').addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

async function loadHistory() {
  const donations = await api('/donate/history');
  const tbody = document.getElementById('donations-body');
  tbody.innerHTML = '';
  if (donations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Пока нет донатов</td></tr>';
    return;
  }
  donations.forEach((d) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(d.created_at).toLocaleString('ru-RU')}</td>
      <td>${fmt(d.amount_rub)} ₽</td>
      <td>${fmt(d.emp_amount)} EMP</td>
      <td>${STATUS_LABELS[d.status] || d.status}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('donate-amount').addEventListener('input', (e) => {
  const amount = Number(e.target.value) || 0;
  document.getElementById('emp-preview').textContent = fmt(Math.round(amount * empPerRub));
});

document.getElementById('donate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('donate-error');
  errorEl.style.display = 'none';
  const amountRub = Number(document.getElementById('donate-amount').value);
  try {
    const result = await api('/donate/create', { method: 'POST', body: { amountRub } });
    localStorage.setItem(LAST_DONATION_KEY, result.donationId);
    window.location.href = result.confirmationUrl;
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

let pollAttempts = 0;
async function pollReturnStatus(donationId) {
  const statusEl = document.getElementById('return-status');
  try {
    const donation = await api(`/donate/${donationId}/status`);
    if (donation.status === 'succeeded') {
      statusEl.textContent = `Готово: зачислено ${fmt(donation.emp_amount)} EMP.`;
      await loadHistory();
      return;
    }
  } catch (err) {
    statusEl.textContent = 'Не удалось проверить платёж: ' + err.message;
    return;
  }
  pollAttempts += 1;
  if (pollAttempts >= 8) {
    statusEl.textContent = 'Ещё не подтверждено. Если вы точно оплатили — нажмите "Проверить сейчас".';
    return;
  }
  setTimeout(() => pollReturnStatus(donationId), 3000);
}

document.getElementById('check-payment-btn').addEventListener('click', async () => {
  const donationId = localStorage.getItem(LAST_DONATION_KEY);
  if (!donationId) return;
  const statusEl = document.getElementById('return-status');
  statusEl.textContent = 'Проверяем...';
  try {
    const donation = await api(`/donate/${donationId}/check`, { method: 'POST' });
    if (donation.status === 'succeeded') {
      statusEl.textContent = `Готово: зачислено ${fmt(donation.emp_amount)} EMP.`;
      await loadHistory();
    } else {
      statusEl.textContent = 'Платёж пока не подтверждён ЮKassa.';
    }
  } catch (err) {
    statusEl.textContent = 'Ошибка проверки: ' + err.message;
  }
});

(async function init() {
  if (!requireLoginOrRedirect()) return;
  try {
    const config = await api('/bank/config');
    empPerRub = config.empPerRub;
    document.getElementById('rate-display').textContent = `1 ₽ = ${fmt(empPerRub)} EMP (мин. сумма ${fmt(config.minDonationRub)} ₽)`;
    await loadHistory();

    const params = new URLSearchParams(window.location.search);
    const donationId = localStorage.getItem(LAST_DONATION_KEY);
    if (params.get('status') === 'return' && donationId) {
      document.getElementById('return-panel').style.display = 'block';
      pollReturnStatus(donationId);
    }
  } catch (err) {
    logout();
  }
})();
