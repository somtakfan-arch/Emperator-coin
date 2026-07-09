function fmt(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

document.getElementById('logout-link').addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

async function loadAuctions() {
  const auctions = await api('/bank/auctions');
  const tbody = document.getElementById('auctions-body');
  tbody.innerHTML = '';
  if (auctions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Пока нет лотов</td></tr>';
    return;
  }
  auctions.forEach((a) => {
    const isActive = a.status === 'active' && new Date(a.ends_at) > new Date();
    const action = isActive
      ? `<button data-bid="${a.id}" data-current="${a.current_bid}">Сделать ставку</button>`
      : `<span class="muted">${a.status === 'ended' ? 'завершён' : ''}</span>`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${a.item_name}${a.description ? `<div class="muted">${a.description}</div>` : ''}</td>
      <td>${a.seller_username}</td>
      <td>${fmt(a.current_bid)} EMP</td>
      <td>${a.current_bidder_username || '—'}</td>
      <td>${new Date(a.ends_at).toLocaleString('ru-RU')}</td>
      <td>${action}</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-bid]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const current = btn.getAttribute('data-current');
      const amount = prompt(`Ваша ставка (текущая ${current} EMP):`, String(Number(current) + 1));
      if (!amount) return;
      try {
        await api(`/bank/auctions/${btn.getAttribute('data-bid')}/bid`, { method: 'POST', body: { amount: parseInt(amount, 10) } });
        await loadAuctions();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

document.getElementById('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('create-error');
  errorEl.style.display = 'none';
  try {
    await api('/bank/auctions', {
      method: 'POST',
      body: {
        itemName: document.getElementById('item-name').value.trim(),
        description: document.getElementById('item-desc').value.trim(),
        startingBid: parseInt(document.getElementById('starting-bid').value, 10),
        durationHours: parseInt(document.getElementById('duration').value, 10),
      },
    });
    document.getElementById('create-form').reset();
    await loadAuctions();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

(async function init() {
  if (!requireLoginOrRedirect()) return;
  try {
    await loadAuctions();
  } catch (err) {
    logout();
  }
})();
