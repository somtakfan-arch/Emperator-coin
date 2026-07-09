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
      <td>${u.balance} EMP</td>
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
      const frozen = btn.getAttribute('data-frozen') === '1';
      try {
        await api(`/admin/${frozen ? 'unfreeze' : 'freeze'}/${userId}`, { method: 'POST' });
        await loadUsers();
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
    successEl.textContent = `Готово: ${action === 'mint' ? 'начислено' : 'списано'} ${amount} EMP пользователю ${username}`;
    successEl.style.display = 'block';
    document.getElementById('mint-form').reset();
    await loadUsers();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

(async function init() {
  if (!requireLoginOrRedirect()) return;
  try {
    const me = await api('/bank/me');
    if (me.role !== 'admin') {
      window.location.href = '/dashboard.html';
      return;
    }
    await loadUsers();
  } catch (err) {
    logout();
  }
})();
