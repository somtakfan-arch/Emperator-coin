let me = null;

document.getElementById('logout-link').addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

document.getElementById('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const errorEl = document.getElementById('password-error');
  const successEl = document.getElementById('password-success');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';
  try {
    await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
    successEl.textContent = 'Пароль изменён';
    successEl.style.display = 'block';
    document.getElementById('password-form').reset();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('pin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('pin-password').value;
  const pin = document.getElementById('pin-value').value;
  const errorEl = document.getElementById('pin-error');
  const successEl = document.getElementById('pin-success');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';
  try {
    await api('/auth/pin', { method: 'POST', body: { password, pin } });
    successEl.textContent = 'PIN установлен';
    successEl.style.display = 'block';
    document.getElementById('pin-form').reset();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('twofa-enable-btn').addEventListener('click', async () => {
  try {
    const data = await api('/auth/2fa/setup', { method: 'POST' });
    document.getElementById('twofa-secret').textContent = data.secret;
    document.getElementById('twofa-setup').style.display = 'block';
    document.getElementById('twofa-enable-btn').style.display = 'none';
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('twofa-confirm-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('twofa-code').value.trim();
  const errorEl = document.getElementById('twofa-confirm-error');
  errorEl.style.display = 'none';
  try {
    await api('/auth/2fa/confirm', { method: 'POST', body: { code } });
    await loadStatus();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('twofa-disable-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('twofa-disable-password').value;
  const errorEl = document.getElementById('twofa-disable-error');
  errorEl.style.display = 'none';
  try {
    await api('/auth/2fa/disable', { method: 'POST', body: { password } });
    await loadStatus();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

async function loadStatus() {
  me = await api('/bank/me');
  document.getElementById('twofa-status').textContent = me.twoFactorEnabled
    ? '2FA включена.'
    : '2FA выключена.';
  document.getElementById('twofa-enable-btn').style.display = me.twoFactorEnabled ? 'none' : 'inline-block';
  document.getElementById('twofa-setup').style.display = 'none';
  document.getElementById('twofa-disable-form').style.display = me.twoFactorEnabled ? 'block' : 'none';
}

async function loadHistory() {
  const rows = await api('/auth/login-history');
  const tbody = document.getElementById('history-body');
  tbody.innerHTML = '';
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Нет данных</td></tr>';
    return;
  }
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(r.created_at).toLocaleString('ru-RU')}</td>
      <td>${r.ip || '—'}</td>
      <td class="muted">${(r.user_agent || '').slice(0, 60)}</td>
      <td>${r.is_new_device ? '<span class="badge frozen">новое устройство</span>' : ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

(async function init() {
  if (!requireLoginOrRedirect()) return;
  try {
    await loadStatus();
    await loadHistory();
  } catch (err) {
    logout();
  }
})();
