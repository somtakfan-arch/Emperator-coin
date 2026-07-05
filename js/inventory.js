/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Вкладки "Инвентарь" и "Магазин".
   ========================================================= */

window.InventoryUI = (function () {
  let activeShopCategory = 'food';
  let activeShopSort = 'default';

  function effectScore(item) {
    const fx = item.effects || {};
    return Object.keys(fx).reduce((sum, key) => sum + (key === 'pantry' ? fx[key] * 0.1 : fx[key]), 0);
  }

  function sortShopItems(items) {
    const list = items.slice();
    if (activeShopSort === 'price_asc') return list.sort((a, b) => a.price - b.price);
    if (activeShopSort === 'price_desc') return list.sort((a, b) => b.price - a.price);
    if (activeShopSort === 'effect_desc') return list.sort((a, b) => effectScore(b) - effectScore(a));
    return list;
  }

  function renderInventoryTab() {
    const state = window.Game.getState();
    const host = document.getElementById('inventory-list');
    host.innerHTML = '';

    const capHint = document.getElementById('inventory-capacity-hint');
    const cap = getInventoryCapacity(state);
    const used = countCarriedItems(state);
    capHint.textContent = `🎒 Часы/электроника/ювелирка занимают место: ${used}/${cap}. Без сумки вмещается только ${NO_BAG_CAPACITY} — купи сумку, чтобы носить больше.`;

    const ownedIds = Object.keys(state.inventory || {}).filter((id) => state.inventory[id] > 0);
    if (!ownedIds.length) {
      host.innerHTML = '<p class="tab-hint">Инвентарь пуст. Загляни в магазин.</p>';
      return;
    }
    ownedIds.forEach((id) => {
      const item = window.ITEMS.byId[id];
      if (!item) return;
      const qty = state.inventory[id];
      const card = document.createElement('div');
      card.className = 'item-card';
      const isFood = item.category === 'food';
      card.innerHTML = `
        <div class="item-icon">${item.icon}</div>
        <div class="item-name">${item.name}${item.brand ? ` <span class="item-brand">${item.brand}</span>` : ''}</div>
        <div class="item-meta">${window.ITEMS.CATEGORY_LABEL[item.category] || item.category} · ×${qty}</div>
        <div class="item-actions"></div>
      `;
      const actions = card.querySelector('.item-actions');
      if (isFood) {
        const eatBtn = document.createElement('button');
        eatBtn.className = 'btn btn-primary btn-sm';
        eatBtn.textContent = 'Съесть';
        eatBtn.addEventListener('click', () => {
          const r = eatFoodItem(state, id);
          window.Game.afterSideAction(null, r.message);
          renderInventoryTab();
        });
        actions.appendChild(eatBtn);
      } else {
        const sellBtn = document.createElement('button');
        sellBtn.className = 'btn btn-secondary btn-sm';
        sellBtn.textContent = `Продать за ${formatMoney(Math.round(item.price * 0.6))}`;
        sellBtn.addEventListener('click', () => {
          const r = sellItem(state, id);
          window.Game.afterSideAction(r.barrier, r.message);
          renderInventoryTab();
        });
        actions.appendChild(sellBtn);
      }
      if (item.category === 'housing') {
        const upgradeRow = document.createElement('div');
        upgradeRow.className = 'home-upgrade-row';
        const installed = (state.homeUpgrades && state.homeUpgrades[id]) || {};
        HOME_UPGRADES.forEach((upg) => {
          const done = !!installed[upg.id];
          const cost = scaleByWealth(state, upg.baseCost);
          const btn = document.createElement('button');
          btn.className = 'chip home-upgrade-chip' + (done ? ' active' : '');
          btn.textContent = done ? `${upg.icon} ${upg.label} ✓` : `${upg.icon} ${upg.label} (${formatMoney(cost)})`;
          btn.disabled = done || state.money < cost;
          btn.addEventListener('click', () => {
            if (!window.Game.confirmBigSpend(cost)) return;
            const r = buyHomeUpgrade(state, id, upg.id);
            window.Game.afterSideAction(r.ok ? r.barrier : null, r.message);
            renderInventoryTab();
          });
          upgradeRow.appendChild(btn);
        });
        card.appendChild(upgradeRow);
      }
      host.appendChild(card);
    });
  }

  function renderShopCategoryTabs() {
    const host = document.getElementById('shop-category-tabs');
    host.innerHTML = '';
    const cats = ['food', 'clothes', 'cars', 'bags', 'watches', 'electronics', 'jewelry', 'housing', 'pets'];
    cats.forEach((cat) => {
      const chip = document.createElement('button');
      chip.className = 'chip' + (cat === activeShopCategory ? ' active' : '');
      chip.textContent = window.ITEMS.CATEGORY_LABEL[cat] || cat;
      chip.addEventListener('click', () => {
        activeShopCategory = cat;
        renderShopCategoryTabs();
        renderShopList();
      });
      host.appendChild(chip);
    });
  }

  function renderShopList() {
    const state = window.Game.getState();
    const host = document.getElementById('shop-list');
    host.innerHTML = '';
    const sortSelect = document.getElementById('shop-sort-select');
    if (sortSelect) sortSelect.value = activeShopSort;
    sortShopItems(window.ITEMS.byCategory(activeShopCategory)).forEach((item) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-icon">${item.icon}</div>
        <div class="item-name">${item.name}${item.brand ? ` <span class="item-brand">${item.brand}</span>` : ''}</div>
        <div class="item-meta">${formatMoney(item.price)}</div>
        <div class="item-actions"></div>
      `;
      const actions = card.querySelector('.item-actions');
      const buyBtn = document.createElement('button');
      buyBtn.className = 'btn btn-primary btn-sm';
      const isFull = CARRIED_CATEGORIES.indexOf(item.category) !== -1 && countCarriedItems(state) >= getInventoryCapacity(state);
      buyBtn.textContent = isFull ? 'Инвентарь полон' : 'Купить';
      buyBtn.disabled = state.money < item.price || isFull;
      buyBtn.addEventListener('click', () => {
        if (!window.Game.confirmBigSpend(item.price)) return;
        const r = buyItem(state, item.id);
        window.Game.afterSideAction(r.ok ? r.barrier : null, r.message);
        renderShopList();
        renderInventoryTab();
      });
      actions.appendChild(buyBtn);

      if (item.category === 'cars' || item.category === 'housing') {
        const downPayment = Math.round(item.price * 0.2);
        const loanBtn = document.createElement('button');
        loanBtn.className = 'btn btn-secondary btn-sm';
        loanBtn.textContent = `В рассрочку (взнос ${formatMoney(downPayment)})`;
        loanBtn.disabled = state.money < downPayment;
        loanBtn.addEventListener('click', () => {
          if (!window.Game.confirmBigSpend(downPayment)) return;
          const r = takeLoan(state, item.id);
          window.Game.afterSideAction(r.ok ? r.barrier : null, r.message);
          renderShopList();
          renderInventoryTab();
        });
        actions.appendChild(loanBtn);
      }

      host.appendChild(card);
    });
  }

  function renderCaseList() {
    const state = window.Game.getState();
    const host = document.getElementById('case-list');
    host.innerHTML = '';
    window.CASES.forEach((caseDef) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      const poolPreview = caseDef.pool
        .filter((id, i, arr) => arr.indexOf(id) === i)
        .map((id) => window.ITEMS.byId[id].icon)
        .join(' ');
      card.innerHTML = `
        <div class="item-icon">📦</div>
        <div class="item-name">${caseDef.name}</div>
        <div class="item-meta">${formatMoney(caseDef.price)} · возможно: ${poolPreview}</div>
        <div class="item-actions"></div>
      `;
      const actions = card.querySelector('.item-actions');
      const openBtn = document.createElement('button');
      openBtn.className = 'btn btn-primary btn-sm';
      const isFull = CARRIED_CATEGORIES.indexOf(caseDef.category) !== -1 && countCarriedItems(state) >= getInventoryCapacity(state);
      openBtn.textContent = isFull ? 'Инвентарь полон' : 'Открыть';
      openBtn.disabled = state.money < caseDef.price || isFull;
      openBtn.addEventListener('click', () => openCaseFlow(caseDef));
      actions.appendChild(openBtn);
      host.appendChild(card);
    });
  }

  function openCaseFlow(caseDef) {
    const state = window.Game.getState();
    if (state.money < caseDef.price) return;
    if (CARRIED_CATEGORIES.indexOf(caseDef.category) !== -1 && countCarriedItems(state) >= getInventoryCapacity(state)) return;

    const modal = document.getElementById('minigame-modal');
    document.getElementById('minigame-title').textContent = `Открытие: ${caseDef.name}`;
    document.getElementById('minigame-instructions').textContent = 'Останови маркер как можно ближе к центру шкалы — точность решает, какая вещь выпадет.';
    modal.classList.add('active');
    const host = document.getElementById('minigame-host');

    window.MiniGames.timing.mount(
      host,
      { period: 1300, zoneCenter: 0.5, zoneWidth: 0.5, timeLimit: 7000 },
      (success, meta) => {
        const position = typeof meta.position === 'number' ? meta.position : 0;
        const r = openCase(state, caseDef.id, position);
        const resultEl = document.createElement('div');
        resultEl.className = 'minigame-result ' + (r.ok ? 'win' : 'lose');
        resultEl.textContent = r.ok ? `${r.item.icon} ${r.message}` : r.message;
        host.innerHTML = '';
        host.appendChild(resultEl);
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.textContent = 'Продолжить';
        btn.addEventListener('click', () => {
          modal.classList.remove('active');
          window.Game.afterSideAction(r.ok ? r.barrier : null, '');
          renderShopList();
          renderCaseList();
          renderInventoryTab();
        }, { once: true });
        host.appendChild(btn);
      }
    );
  }

  document.getElementById('shop-sort-select').addEventListener('change', (e) => {
    activeShopSort = e.target.value;
    renderShopList();
  });

  function renderAll() {
    renderInventoryTab();
    renderShopCategoryTabs();
    renderShopList();
    renderCaseList();
  }

  /** Мини-магазин, встроенный прямо в сюжетное событие: вместо
   *  абстрактной суммы игрок выбирает конкретную вещь из категории.
   *  onPick вызывается только если что-то реально выбрано и куплено —
   *  закрытие без выбора не резолвит событие. */
  function openQuickShop(category, state, onPick) {
    const modal = document.getElementById('quickshop-modal');
    const host = document.getElementById('quickshop-list');
    document.getElementById('quickshop-title').textContent = `Выбери: ${window.ITEMS.CATEGORY_LABEL[category] || category}`;
    host.innerHTML = '';
    window.ITEMS.byCategory(category).forEach((item) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      const isFull = CARRIED_CATEGORIES.indexOf(item.category) !== -1 && countCarriedItems(state) >= getInventoryCapacity(state);
      card.innerHTML = `
        <div class="item-icon">${item.icon}</div>
        <div class="item-name">${item.name}${item.brand ? ` <span class="item-brand">${item.brand}</span>` : ''}</div>
        <div class="item-meta">${formatMoney(item.price)}</div>
        <div class="item-actions"></div>
      `;
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary btn-sm';
      btn.textContent = isFull ? 'Инвентарь полон' : 'Выбрать';
      btn.disabled = state.money < item.price || isFull;
      btn.addEventListener('click', () => {
        modal.classList.remove('active');
        onPick(item);
      });
      card.querySelector('.item-actions').appendChild(btn);
      host.appendChild(card);
    });
    modal.classList.add('active');
  }

  document.getElementById('quickshop-close-btn').addEventListener('click', () => {
    document.getElementById('quickshop-modal').classList.remove('active');
  });

  return { renderAll, renderInventoryTab, renderShopList, openQuickShop };
})();
