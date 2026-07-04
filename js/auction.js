/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Вкладка "Аукцион" — торговля предметами между игроками.
   Требует аккаунт (Firebase), т.к. это межигровая функция.
   ========================================================= */

window.AuctionUI = (function () {
  function render() {
    const hint = document.getElementById('auction-auth-hint');
    const authed = document.getElementById('auction-authed');
    if (!window.Cloud.enabled) {
      hint.textContent = 'Аукцион работает только с облаком Firestore. Настрой js/firebase-config.js (см. README), чтобы включить торговлю между игроками.';
      authed.classList.add('hidden');
      return;
    }
    if (!window.Cloud.currentUser) {
      hint.textContent = 'Войди в аккаунт на первом экране, чтобы выставлять и покупать вещи у других игроков.';
      authed.classList.add('hidden');
      return;
    }
    hint.textContent = '';
    authed.classList.remove('hidden');
    renderSellForm();
    renderListings();
  }

  function renderSellForm() {
    const state = window.Game.getState();
    const select = document.getElementById('auction-item-select');
    select.innerHTML = '';
    const ownedIds = Object.keys(state.inventory || {}).filter((id) => state.inventory[id] > 0 && window.ITEMS.byId[id] && window.ITEMS.byId[id].category !== 'food');
    if (!ownedIds.length) {
      select.innerHTML = '<option value="">Нечего продавать</option>';
      return;
    }
    ownedIds.forEach((id) => {
      const item = window.ITEMS.byId[id];
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = `${item.icon} ${item.name} (рекомендуемая цена ${formatMoney(item.price)})`;
      select.appendChild(opt);
    });
  }

  function renderListings() {
    const host = document.getElementById('auction-list');
    host.innerHTML = '<p class="tab-hint">Загрузка лотов...</p>';
    window.Cloud.listAuctionListings().then((rows) => {
      host.innerHTML = '';
      if (!rows.length) {
        host.innerHTML = '<p class="tab-hint">Пока никто ничего не продаёт.</p>';
        return;
      }
      const myUid = window.Cloud.currentUser.uid;
      rows.forEach((listing) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
          <div class="item-icon">${listing.icon || '📦'}</div>
          <div class="item-name">${listing.itemName}</div>
          <div class="item-meta">${formatMoney(listing.price)} · продавец: ${listing.sellerName}</div>
          <div class="item-actions"></div>
        `;
        const actions = card.querySelector('.item-actions');
        if (listing.sellerUid === myUid) {
          const cancelBtn = document.createElement('button');
          cancelBtn.className = 'btn btn-secondary btn-sm';
          cancelBtn.textContent = 'Снять с продажи';
          cancelBtn.addEventListener('click', () => {
            window.Cloud.cancelAuctionListing(listing.id).then(() => {
              const state = window.Game.getState();
              state.inventory[listing.itemId] = (state.inventory[listing.itemId] || 0) + 1;
              window.Game.afterSideAction(null, 'Лот снят с продажи, вещь вернулась в инвентарь.');
              render();
            });
          });
          actions.appendChild(cancelBtn);
        } else {
          const buyBtn = document.createElement('button');
          buyBtn.className = 'btn btn-primary btn-sm';
          buyBtn.textContent = 'Купить';
          buyBtn.addEventListener('click', () => {
            window.Cloud.buyAuctionListing(listing.id).then(() => {
              const state = window.Game.getState();
              state.money -= listing.price;
              state.inventory[listing.itemId] = (state.inventory[listing.itemId] || 0) + 1;
              const barrier = applyTierBarrier(state);
              window.Game.afterSideAction(barrier, `Куплено: ${listing.itemName}.`);
              render();
            }).catch((e) => {
              document.getElementById('auction-auth-hint').textContent = e.message;
            });
          });
          actions.appendChild(buyBtn);
        }
        host.appendChild(card);
      });
    });
  }

  document.getElementById('auction-list-btn').addEventListener('click', () => {
    const state = window.Game.getState();
    const select = document.getElementById('auction-item-select');
    const priceInput = document.getElementById('auction-price-input');
    const itemId = select.value;
    const price = Math.round(Number(priceInput.value));
    if (!itemId) return;
    if (!price || price <= 0) { document.getElementById('auction-auth-hint').textContent = 'Укажи цену.'; return; }
    const item = window.ITEMS.byId[itemId];
    window.Cloud.createAuctionListing(item, price).then(() => {
      state.inventory[itemId] -= 1;
      if (state.inventory[itemId] <= 0) delete state.inventory[itemId];
      window.Game.afterSideAction(null, `Выставлено на продажу: ${item.name}.`);
      priceInput.value = '';
      render();
    });
  });

  return { render };
})();
