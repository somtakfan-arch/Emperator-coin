let empPerRub = 0;

function fmt(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

const STATUS_LABELS = { pending: 'в обработке', succeeded: 'оплачено' };
const PROVIDER_LABELS = { yookassa: 'ЮKassa', donationalerts: 'DonationAlerts' };
const LAST_DONATION_KEY = 'emperator_last_donation';
const LAST_DA_CODE_KEY = 'emperator_last_da_code';

document.getElementById('logout-link').addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

async function loadHistory() {
  const donations = await api('/donate/history');
  const tbody = document.getElementById('donations-body');
  tbody.innerHTML = '';
  if (donations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Пока нет донатов</td></tr>';
    return;
  }
  donations.forEach((d) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(d.created_at).toLocaleString('ru-RU')}</td>
      <td>${PROVIDER_LABELS[d.provider] || d.provider}</td>
      <td>${d.amount_rub != null ? fmt(d.amount_rub) + ' ₽' : '—'}</td>
      <td>${d.emp_amount != null ? fmt(d.emp_amount) + ' EMP' : '—'}</td>
      <td>${STATUS_LABELS[d.status] || d.status}</td>
    `;
    tbody.appendChild(tr);
  });
}

// --- ЮKassa (card / SBP) -----------------------------------------------

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

// --- DonationAlerts -------------------------------------------------------

document.getElementById('da-get-code-btn').addEventListener('click', async () => {
  const errorEl = document.getElementById('da-error');
  errorEl.style.display = 'none';
  try {
    const result = await api('/donate/da/create', { method: 'POST' });
    localStorage.setItem(LAST_DA_CODE_KEY, result.code);
    showDaCode(result.code, result.donationAlertsUrl);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

function showDaCode(code, donationAlertsUrl) {
  document.getElementById('da-code-panel').style.display = 'block';
  document.getElementById('da-code').textContent = code;
  document.getElementById('da-link').href = donationAlertsUrl;
  document.getElementById('da-status').textContent = '';
}

document.getElementById('da-check-btn').addEventListener('click', async () => {
  const code = localStorage.getItem(LAST_DA_CODE_KEY);
  if (!code) return;
  const statusEl = document.getElementById('da-status');
  statusEl.textContent = 'Проверяем...';
  try {
    const donation = await api(`/donate/da/${code}/check`, { method: 'POST' });
    if (donation.status === 'succeeded') {
      statusEl.textContent = `Готово: зачислено ${fmt(donation.emp_amount)} EMP.`;
      await loadHistory();
    } else {
      statusEl.textContent = 'Пока не найдено. Подождите немного и попробуйте снова.';
    }
  } catch (err) {
    statusEl.textContent = 'Ошибка проверки: ' + err.message;
  }
});

// --- Init -------------------------------------------------------------

(async function init() {
  if (!requireLoginOrRedirect()) return;
  try {
    const config = await api('/bank/config');
    empPerRub = config.empPerRub;
    const rateText = `1 ₽ = ${fmt(empPerRub)} EMP (мин. сумма ${fmt(config.minDonationRub)} ₽)`;
    document.getElementById('rate-display').textContent = rateText;
    document.getElementById('rate-display-da').textContent = rateText;
    await loadHistory();

    const params = new URLSearchParams(window.location.search);
    const donationId = localStorage.getItem(LAST_DONATION_KEY);
    if (params.get('status') === 'return' && donationId) {
      document.getElementById('return-panel').style.display = 'block';
      pollReturnStatus(donationId);
    }

    const lastDaCode = localStorage.getItem(LAST_DA_CODE_KEY);
    if (lastDaCode && config.donationAlertsPageUrl) {
      showDaCode(lastDaCode, config.donationAlertsPageUrl);
    }
  } catch (err) {
    logout();
  }
})();
