let myUserId = null;

function fmt(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

document.getElementById('logout-link').addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

async function render() {
  const group = await api('/bank/groups/me');
  if (!group) {
    document.getElementById('no-group-panel').style.display = 'block';
    document.getElementById('group-panel').style.display = 'none';
    return;
  }
  document.getElementById('no-group-panel').style.display = 'none';
  document.getElementById('group-panel').style.display = 'block';
  document.getElementById('group-name-display').textContent = group.name;
  document.getElementById('group-balance').textContent = fmt(group.balance);
  document.getElementById('tax-bps').value = group.tax_bps;

  const myRole = group.members.find((m) => m.userId === myUserId)?.role;
  document.getElementById('withdraw-form').style.display = myRole === 'leader' || myRole === 'treasurer' ? 'block' : 'none';
  document.getElementById('invite-form').style.display = myRole === 'leader' ? 'block' : 'none';
  document.getElementById('tax-form').style.display = myRole === 'leader' ? 'block' : 'none';

  const tbody = document.getElementById('members-body');
  tbody.innerHTML = '';
  group.members.forEach((m) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.username}</td><td>${m.role}</td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById('create-group-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('group-name').value.trim();
  const errorEl = document.getElementById('create-group-error');
  errorEl.style.display = 'none';
  try {
    await api('/bank/groups', { method: 'POST', body: { name } });
    await render();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('invite-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const group = await api('/bank/groups/me');
  const username = document.getElementById('invite-username').value.trim();
  const errorEl = document.getElementById('invite-error');
  errorEl.style.display = 'none';
  try {
    await api(`/bank/groups/${group.id}/invite`, { method: 'POST', body: { username } });
    document.getElementById('invite-form').reset();
    await render();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('deposit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const group = await api('/bank/groups/me');
  const amount = parseInt(document.getElementById('deposit-amount').value, 10);
  const errorEl = document.getElementById('deposit-error');
  errorEl.style.display = 'none';
  try {
    await api(`/bank/groups/${group.id}/deposit`, { method: 'POST', body: { amount } });
    document.getElementById('deposit-form').reset();
    await render();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('withdraw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const group = await api('/bank/groups/me');
  const amount = parseInt(document.getElementById('withdraw-amount').value, 10);
  const errorEl = document.getElementById('withdraw-error');
  errorEl.style.display = 'none';
  try {
    await api(`/bank/groups/${group.id}/withdraw`, { method: 'POST', body: { amount } });
    document.getElementById('withdraw-form').reset();
    await render();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('tax-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const group = await api('/bank/groups/me');
  const taxBps = parseInt(document.getElementById('tax-bps').value, 10);
  const errorEl = document.getElementById('tax-error');
  errorEl.style.display = 'none';
  try {
    await api(`/bank/groups/${group.id}/tax`, { method: 'POST', body: { taxBps } });
    await render();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('leave-group-btn').addEventListener('click', async () => {
  if (!confirm('Точно покинуть группу?')) return;
  try {
    await api('/bank/groups/leave', { method: 'POST' });
    await render();
  } catch (err) {
    alert(err.message);
  }
});

(async function init() {
  if (!requireLoginOrRedirect()) return;
  try {
    const me = await api('/bank/me');
    myUserId = me.id;
    await render();
  } catch (err) {
    logout();
  }
})();
