/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Логика экранов и рендеринг UI.
   ========================================================= */

(function () {
  const TIER_ORDER = ['homeless', 'poor', 'middle', 'rich', 'millionaire', 'billionaire'];
  const TIER_ICON = { homeless: '🏚️', poor: '🥫', middle: '🏠', rich: '🏙️', millionaire: '💎', billionaire: '👑' };
  const RISK_BADGE = { safe: '✅ надёжно', risky: '⚠️ риск', balanced: '⚖️ неоднозначно' };

  let state = null;
  let currentCharacter = null;
  let currentEvent = null;
  let currentSlotIndex = null;

  const screens = {
    auth: document.getElementById('screen-auth'),
    admin: document.getElementById('screen-admin'),
    slots: document.getElementById('screen-slots'),
    intro: document.getElementById('screen-intro'),
    reveal: document.getElementById('screen-reveal'),
    game: document.getElementById('screen-game'),
    end: document.getElementById('screen-end'),
  };

  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.remove('active'));
    screens[name].classList.add('active');
  }

  /* ---------------- Общий интерфейс для вкладок ---------------- */

  const globalToast = document.createElement('div');
  globalToast.id = 'global-toast';
  globalToast.className = 'global-toast hidden';
  document.body.appendChild(globalToast);
  let toastTimer = null;

  function showToast(message) {
    if (!message) return;
    globalToast.textContent = message;
    globalToast.classList.remove('hidden');
    globalToast.classList.add('active');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => globalToast.classList.remove('active'), 3200);
  }

  window.Game = {
    getState: () => state,
    afterSideAction: (barrierResult, message) => {
      renderStats();
      if (barrierResult && barrierResult.barrierMessage) showToast(barrierResult.barrierMessage);
      else if (message) showToast(message);
      if (window.Cloud.enabled) window.Cloud.saveState(state);
      saveCurrentSlot();
    },
  };

  function saveCurrentSlot() {
    if (state && currentSlotIndex !== null) window.Slots.saveSlot(currentSlotIndex, state);
  }

  /* ---------------- Экран 0: аккаунт ---------------- */

  const authCloudForm = document.getElementById('auth-cloud-form');
  const authCloudHint = document.getElementById('auth-cloud-hint');
  const authMessage = document.getElementById('auth-message');

  function renderAuthScreen() {
    if (window.Cloud.enabled) {
      authCloudHint.textContent = 'Зарегистрируйся или войди, чтобы твой капитал и вещи сохранялись между партиями, а также был доступен аукцион и таблица лидеров.';
      authCloudForm.classList.remove('hidden');
    } else {
      authCloudHint.textContent = 'Облако не настроено (см. README после сборки — js/firebase-config.js). Можно играть локально: всё, кроме аккаунта, лидеров и аукциона, работает как обычно.';
      authCloudForm.classList.add('hidden');
    }
  }
  renderAuthScreen();

  document.getElementById('auth-register-btn').addEventListener('click', () => {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!email || !password) { authMessage.textContent = 'Укажи email и пароль.'; return; }
    window.Cloud.register(email, password).then(() => enterSlotsScreen()).catch((e) => { authMessage.textContent = e.message; });
  });

  document.getElementById('auth-login-btn').addEventListener('click', () => {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!email || !password) { authMessage.textContent = 'Укажи email и пароль.'; return; }
    window.Cloud.login(email, password).then(() => enterSlotsScreen()).catch((e) => { authMessage.textContent = e.message; });
  });

  document.getElementById('auth-guest-btn').addEventListener('click', () => enterSlotsScreen());
  document.getElementById('auth-admin-btn').addEventListener('click', () => showScreen('admin'));
  document.getElementById('admin-back-btn').addEventListener('click', () => showScreen('auth'));

  function enterSlotsScreen() {
    if (window.Cloud.enabled && window.Cloud.currentUser) {
      window.Slots.syncFromCloud().then(renderSlotsScreen).catch(renderSlotsScreen);
    } else {
      renderSlotsScreen();
    }
  }

  /* ---------------- Экран слотов персонажей ---------------- */

  const slotsListEl = document.getElementById('slots-list');

  function renderSlotsScreen() {
    const summaries = window.Slots.getSummaries();
    slotsListEl.innerHTML = '';
    summaries.forEach((summary, index) => {
      const card = document.createElement('div');
      card.className = 'slot-card';
      if (!summary) {
        card.innerHTML = `
          <div class="slot-empty">Пустой слот</div>
          <button class="btn btn-primary btn-sm slot-create-btn">Создать персонажа</button>
        `;
        card.querySelector('.slot-create-btn').addEventListener('click', () => {
          currentSlotIndex = index;
          showScreen('intro');
        });
      } else {
        card.innerHTML = `
          <div class="slot-name">${summary.name}</div>
          <div class="slot-tier">${TIER_ICON[summary.tierId] || ''} ${summary.tierLabel}${summary.ended ? ' · история окончена' : ''}</div>
          <div class="slot-row">Возраст: <b>${summary.age}</b></div>
          <div class="slot-row">Капитал: <b>${formatMoney(summary.money)}</b></div>
          <div class="slot-actions">
            <button class="btn btn-primary btn-sm slot-play-btn">Играть</button>
            <button class="btn btn-secondary btn-sm slot-delete-btn">Удалить</button>
          </div>
        `;
        card.querySelector('.slot-play-btn').addEventListener('click', () => {
          currentSlotIndex = index;
          loadSlotIntoGame(index);
        });
        card.querySelector('.slot-delete-btn').addEventListener('click', () => {
          if (!confirm(`Удалить персонажа «${summary.name}»? Это действие необратимо.`)) return;
          window.Slots.deleteSlot(index);
          renderSlotsScreen();
        });
      }
      slotsListEl.appendChild(card);
    });
    showScreen('slots');
  }

  function loadSlotIntoGame(index) {
    const loaded = window.Slots.loadSlot(index);
    if (!loaded) return;
    state = loaded;
    currentCharacter = window.CHARACTERS.find((c) => c.id === state.characterId) || null;
    showScreen('game');
    if (state.ended) {
      finishGame();
    } else {
      switchTab('story');
      renderNextEvent();
    }
  }

  document.getElementById('slots-back-btn').addEventListener('click', () => {
    if (window.Cloud.enabled && window.Cloud.currentUser) window.Cloud.logout();
    showScreen('auth');
  });

  document.getElementById('intro-back-btn').addEventListener('click', () => {
    currentSlotIndex = null;
    renderSlotsScreen();
  });

  /* ---------------- Экран 1: имя ---------------- */

  const nameInput = document.getElementById('name-input');
  const startBtn = document.getElementById('start-btn');
  const showRosterBtn = document.getElementById('show-roster-btn');
  const rosterModal = document.getElementById('roster-modal');
  const rosterCloseBtn = document.getElementById('roster-close-btn');
  const rosterList = document.getElementById('roster-list');

  startBtn.addEventListener('click', () => {
    const name = nameInput.value.trim() || pick(['Игрок', 'Неизвестный', 'Герой']);
    beginNewLife(name);
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startBtn.click();
  });

  showRosterBtn.addEventListener('click', () => {
    renderRoster();
    rosterModal.classList.add('active');
  });
  rosterCloseBtn.addEventListener('click', () => rosterModal.classList.remove('active'));
  rosterModal.addEventListener('click', (e) => {
    if (e.target === rosterModal) rosterModal.classList.remove('active');
  });

  function renderRoster() {
    rosterList.innerHTML = '';
    window.CHARACTERS.forEach((c) => {
      const tier = window.TIERS.find((t) => t.id === c.tier);
      const card = document.createElement('div');
      card.className = 'roster-card';
      card.innerHTML = `
        <div class="roster-tier">${TIER_ICON[c.tier] || ''} ${tier ? tier.label : ''}</div>
        <div class="roster-row"><b>Возраст:</b> ${c.age}</div>
        <div class="roster-row"><b>Работа:</b> ${c.job}</div>
        <div class="roster-row"><b>Имущество:</b> ${c.property}</div>
        <div class="roster-row"><b>Деньги:</b> ${formatMoney(c.money)}</div>
        <div class="roster-row"><b>Семья:</b> ${c.family}</div>
        <div class="roster-row"><b>Аллергия:</b> ${c.allergy}</div>
      `;
      rosterList.appendChild(card);
    });
  }

  /* ---------------- Экран 2: карточка персонажа ---------------- */

  function beginNewLife(name) {
    // Судьбу нельзя перекрутить: персонаж выбирается один раз и
    // закрепляется за этим слотом навсегда.
    currentCharacter = pick(window.CHARACTERS);
    state = createGameState(name, currentCharacter);

    const tier = getTier(computeEffectiveWealth(state));
    document.getElementById('reveal-name').textContent = name;
    document.getElementById('reveal-tier').textContent = `${TIER_ICON[tier.id] || ''} ${tier.label}`;
    document.getElementById('reveal-age').textContent = currentCharacter.age;
    document.getElementById('reveal-job').textContent = currentCharacter.job;
    document.getElementById('reveal-property').textContent = currentCharacter.property;
    document.getElementById('reveal-money').textContent = formatMoney(state.money);
    document.getElementById('reveal-family').textContent = currentCharacter.family;
    document.getElementById('reveal-allergy').textContent = currentCharacter.allergy;
    showScreen('reveal');
  }

  document.getElementById('reveal-continue-btn').addEventListener('click', () => {
    showScreen('game');
    switchTab('story');
    renderNextEvent();
    if (window.Cloud.enabled) window.Cloud.saveState(state);
    saveCurrentSlot();
  });

  /* ---------------- Вкладки внутри игрового экрана ---------------- */

  const TAB_RENDERERS = {
    inventory: () => window.InventoryUI.renderAll(),
    shop: () => window.InventoryUI.renderAll(),
    doctor: () => window.DoctorUI.render(),
    casino: () => window.CasinoUI.render(),
    crypto: () => window.CryptoUI.render(),
    bank: () => window.BankUI.render(),
    skills: () => window.SkillsUI.render(),
    auction: () => window.AuctionUI.render(),
    leaderboard: () => window.LeaderboardUI.render(),
  };

  function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
    document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === 'tab-' + tabName));
    if (TAB_RENDERERS[tabName]) TAB_RENDERERS[tabName]();
  }

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  /* ---------------- Экран 3: игра (вкладка "История") ---------------- */

  const eventTextEl = document.getElementById('event-text');
  const choicesEl = document.getElementById('choices');
  const outcomeEl = document.getElementById('outcome');
  const outcomeMsgEl = document.getElementById('outcome-message');
  const outcomeInterestEl = document.getElementById('outcome-interest');
  const nextBtn = document.getElementById('next-btn');
  const tierBannerEl = document.getElementById('banner-stack');

  function renderStats() {
    document.getElementById('stat-name').textContent = state.name;
    document.getElementById('stat-age').textContent = state.age;
    document.getElementById('stat-job').textContent = state.job;
    document.getElementById('stat-money').textContent = formatMoney(state.money);

    const tier = getTier(computeEffectiveWealth(state));
    document.getElementById('stat-tier-label').textContent = `${TIER_ICON[tier.id] || ''} ${tier.label}`;

    setBar('bar-pantry', state.pantry);
    setBar('bar-health', state.health);
    setBar('bar-happiness', state.happiness);
    setBar('bar-energy', state.energy);
    setBar('bar-reputation', state.reputation);
    setBar('bar-stress', state.stress || 0);
    document.getElementById('stat-season').textContent = getSeason(state);

    renderTierTrack(tier.id);
    renderTraitBadges();
  }

  function renderTraitBadges() {
    const el = document.getElementById('trait-badges');
    const traits = getActiveTraits(state);
    if (!traits.length) {
      el.innerHTML = '';
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = traits.map((t) => `<span class="trait-badge" title="${t.label}">${t.icon} ${t.label}</span>`).join('');
  }

  function setBar(id, value) {
    const el = document.getElementById(id);
    el.style.width = clampNum(value, 0, 100) + '%';
    el.parentElement.setAttribute('aria-valuenow', String(Math.round(value)));
  }

  function renderTierTrack(currentTierId) {
    const track = document.getElementById('tier-track');
    track.innerHTML = '';
    const currentIndex = TIER_ORDER.indexOf(currentTierId);
    TIER_ORDER.forEach((tid, i) => {
      const node = document.createElement('div');
      node.className = 'tier-node';
      if (i < currentIndex) node.classList.add('done');
      if (i === currentIndex) node.classList.add('current');
      node.title = window.TIERS.find((t) => t.id === tid) ? window.TIERS.find((t) => t.id === tid).label : 'Миллиардер';
      node.textContent = TIER_ICON[tid];
      track.appendChild(node);
    });
  }

  function renderNextEvent() {
    outcomeEl.classList.remove('active');
    currentEvent = pickNextEvent(state);
    renderStats();

    if (!currentEvent) {
      finishGame();
      return;
    }

    const text = typeof currentEvent.text === 'function' ? currentEvent.text(state) : currentEvent.text;
    eventTextEl.textContent = text;

    choicesEl.innerHTML = '';
    currentEvent.choices.forEach((choice, idx) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      const label = typeof choice.label === 'function' ? choice.label(state) : choice.label;
      const badge = choice.risk && RISK_BADGE[choice.risk] ? `<span class="risk-badge risk-${choice.risk}">${RISK_BADGE[choice.risk]}</span>` : '';
      const miniBadge = choice.minigame ? '<span class="risk-badge risk-mini">🎮 мини-игра</span>' : '';
      const shopBadge = choice.shopCategory ? '<span class="risk-badge risk-shop">🛍️ выбор в магазине</span>' : '';
      btn.innerHTML = `<span class="choice-label">${label}</span><span class="choice-badges">${miniBadge}${shopBadge}${badge}</span>`;
      btn.addEventListener('click', () => {
        if (choice.minigame) {
          startMiniGame(choice, idx);
        } else if (choice.shopCategory) {
          openQuickShopForChoice(choice, idx);
        } else {
          handleChoice(idx);
        }
      });
      choicesEl.appendChild(btn);
    });

    document.getElementById('event-card').classList.remove('hidden');
    outcomeEl.classList.remove('active');
  }

  document.getElementById('sleep-btn').addEventListener('click', () => {
    if (document.getElementById('event-card').classList.contains('hidden')) return;
    handleChoice(0, REST_EVENT);
  });

  const minigameModal = document.getElementById('minigame-modal');
  const minigameTitleEl = document.getElementById('minigame-title');
  const minigameInstructionsEl = document.getElementById('minigame-instructions');
  const minigameHostEl = document.getElementById('minigame-host');

  function openQuickShopForChoice(choice, idx) {
    window.InventoryUI.openQuickShop(choice.shopCategory, state, (item) => {
      state._quickShopItem = item;
      handleChoice(idx);
      delete state._quickShopItem;
    });
  }

  function startMiniGame(choice, idx) {
    const desc = choice.minigame(state);
    minigameTitleEl.textContent = desc.title || 'Мини-игра';
    minigameInstructionsEl.textContent = desc.instructions || '';
    minigameModal.classList.add('active');

    const gameApi = window.MiniGames[desc.type];
    gameApi.mount(minigameHostEl, desc.params || {}, (success) => {
      showMiniGameResult(success, desc, () => {
        minigameModal.classList.remove('active');
        state._miniGameSuccess = success;
        handleChoice(idx);
        delete state._miniGameSuccess;
      });
    });
  }

  function showMiniGameResult(success, desc, onContinue) {
    minigameHostEl.innerHTML = '';
    const resultEl = document.createElement('div');
    resultEl.className = 'minigame-result ' + (success ? 'win' : 'lose');
    resultEl.textContent = success ? (desc.winText || 'Получилось!') : (desc.loseText || 'Не вышло.');
    minigameHostEl.appendChild(resultEl);

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = 'Продолжить';
    btn.addEventListener('click', onContinue, { once: true });
    minigameHostEl.appendChild(btn);
  }

  function handleChoice(idx, eventOverride) {
    const event = eventOverride || currentEvent;
    const prevTierId = getTier(computeEffectiveWealth(state)).id;
    const result = applyChoice(state, event, idx);

    document.getElementById('event-card').classList.add('hidden');
    outcomeMsgEl.textContent = result.message || 'Ход сделан.';
    outcomeInterestEl.textContent = result.interestMessage || '';
    outcomeInterestEl.classList.toggle('hidden', !result.interestMessage);
    outcomeEl.classList.add('active');
    renderStats();

    const banners = [];
    if (result.tierChanged) {
      const tier = getTier(computeEffectiveWealth(state));
      const wentUp = TIER_ORDER.indexOf(tier.id) > TIER_ORDER.indexOf(prevTierId);
      banners.push({
        text: wentUp ? `${TIER_ICON[tier.id] || ''} Новый статус: ${tier.label}!` : `${TIER_ICON[tier.id] || ''} Статус понижен: ${tier.label}...`,
        cls: wentUp ? 'up' : 'down',
      });
    }
    if (result.newTrait) {
      banners.push({ text: `${result.newTrait.icon} Новая черта характера: «${result.newTrait.label}»`, cls: 'up' });
    }

    if (banners.length) {
      tierBannerEl.innerHTML = banners.map((b) => `<div class="tier-banner ${b.cls}">${b.text}</div>`).join('');
      tierBannerEl.classList.remove('hidden');
    } else {
      tierBannerEl.classList.add('hidden');
      tierBannerEl.innerHTML = '';
    }

    if (state.ended) {
      nextBtn.textContent = 'Посмотреть итог';
    } else {
      nextBtn.textContent = 'Далее →';
    }

    if (window.Cloud.enabled) window.Cloud.saveState(state);
    saveCurrentSlot();
  }

  document.getElementById('switch-slot-btn').addEventListener('click', () => {
    saveCurrentSlot();
    currentSlotIndex = null;
    renderSlotsScreen();
  });

  nextBtn.addEventListener('click', () => {
    if (state.ended) {
      finishGame();
    } else {
      renderNextEvent();
    }
  });

  /* ---------------- Экран 4: итог ---------------- */

  function finishGame() {
    const summary = getEndingSummary(state);
    document.getElementById('end-title').textContent = summary.title;
    document.getElementById('end-text').textContent = summary.text;
    document.getElementById('end-tier').textContent = summary.tierLabel;
    document.getElementById('end-money').textContent = formatMoney(summary.finalMoney);
    document.getElementById('end-age').textContent = summary.age;
    document.getElementById('end-turns').textContent = summary.turns;
    document.getElementById('end-name').textContent = state.name;

    const epilogueEl = document.getElementById('end-epilogue');
    epilogueEl.textContent = summary.epilogue || '';
    epilogueEl.classList.toggle('hidden', !summary.epilogue);

    const traitsEl = document.getElementById('end-traits');
    if (summary.traits.length) {
      traitsEl.innerHTML = summary.traits.map((t) => `<span class="trait-badge" title="${t.label}">${t.icon} ${t.label}</span>`).join('');
      traitsEl.classList.remove('hidden');
    } else {
      traitsEl.innerHTML = '';
      traitsEl.classList.add('hidden');
    }

    saveCurrentSlot();
    showScreen('end');
  }

  document.getElementById('restart-btn').addEventListener('click', () => {
    if (currentSlotIndex !== null) window.Slots.deleteSlot(currentSlotIndex);
    showScreen('intro');
    nameInput.value = '';
    nameInput.focus();
  });

  document.getElementById('end-slots-btn').addEventListener('click', () => {
    currentSlotIndex = null;
    renderSlotsScreen();
  });

  showScreen('auth');
})();
