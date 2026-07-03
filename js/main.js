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

  const screens = {
    intro: document.getElementById('screen-intro'),
    reveal: document.getElementById('screen-reveal'),
    game: document.getElementById('screen-game'),
    end: document.getElementById('screen-end'),
  };

  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.remove('active'));
    screens[name].classList.add('active');
  }

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
    currentCharacter = pick(window.CHARACTERS);
    state = createGameState(name, currentCharacter);

    const tier = getTier(currentCharacter.money);
    document.getElementById('reveal-name').textContent = name;
    document.getElementById('reveal-tier').textContent = `${TIER_ICON[tier.id] || ''} ${tier.label}`;
    document.getElementById('reveal-age').textContent = currentCharacter.age;
    document.getElementById('reveal-job').textContent = currentCharacter.job;
    document.getElementById('reveal-property').textContent = currentCharacter.property;
    document.getElementById('reveal-money').textContent = formatMoney(currentCharacter.money);
    document.getElementById('reveal-family').textContent = currentCharacter.family;
    document.getElementById('reveal-allergy').textContent = currentCharacter.allergy;

    showScreen('reveal');
  }

  document.getElementById('reveal-continue-btn').addEventListener('click', () => {
    showScreen('game');
    renderNextEvent();
  });

  document.getElementById('reveal-reroll-btn').addEventListener('click', () => {
    beginNewLife(state.name);
  });

  /* ---------------- Экран 3: игра ---------------- */

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

    const tier = getTier(state.money);
    document.getElementById('stat-tier-label').textContent = `${TIER_ICON[tier.id] || ''} ${tier.label}`;

    setBar('bar-pantry', state.pantry);
    setBar('bar-health', state.health);
    setBar('bar-happiness', state.happiness);
    setBar('bar-energy', state.energy);
    setBar('bar-reputation', state.reputation);

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
      btn.innerHTML = `<span class="choice-label">${label}</span>${badge}`;
      btn.addEventListener('click', () => handleChoice(idx));
      choicesEl.appendChild(btn);
    });

    document.getElementById('event-card').classList.remove('hidden');
    outcomeEl.classList.remove('active');
  }

  function handleChoice(idx) {
    const prevTierId = getTier(state.money).id;
    const result = applyChoice(state, currentEvent, idx);

    document.getElementById('event-card').classList.add('hidden');
    outcomeMsgEl.textContent = result.message || 'Ход сделан.';
    outcomeInterestEl.textContent = result.interestMessage || '';
    outcomeInterestEl.classList.toggle('hidden', !result.interestMessage);
    outcomeEl.classList.add('active');
    renderStats();

    const banners = [];
    if (result.tierChanged) {
      const tier = getTier(state.money);
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
  }

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

    showScreen('end');
  }

  document.getElementById('restart-btn').addEventListener('click', () => {
    showScreen('intro');
    nameInput.value = '';
    nameInput.focus();
  });

  showScreen('intro');
})();
