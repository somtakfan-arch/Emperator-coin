/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Вкладка "Президент" — появляется, пока state.isPresident. Срок
   ограничен по реальному времени (12 часов = "пол дня"), после чего
   полномочия слагаются автоматически, а изданные законы остаются в
   силе до следующего президента (см. PRESIDENCY_TERM_MS в engine.js).

   Законы (налоговые ставки и т.п.) хранятся в общем для всех игроков
   документе Firestore state_global/presidency, если облако настроено;
   без облака — только локально для этой партии (state.localLaws).
   ========================================================= */

window.PresidentUI = (function () {
  const LAW_BOUNDS = {
    bankruptcyTaxRate: { min: 0, max: 0.5 },
    millionaireTaxBonus: { min: 0, max: 0.2 },
    auctionCommissionBonus: { min: 0, max: 0.2 },
    loanRateBonus: { min: 0, max: 0.1 },
    poorSubsidyRate: { min: 0, max: 0.2 },
    duelPayoutBonus: { min: 0, max: 0.3 },
  };

  function clampLaw(field, value) {
    const b = LAW_BOUNDS[field];
    if (!b) return value;
    return Math.max(b.min, Math.min(b.max, value));
  }

  /* ---------- каталог из 50 президентских указов ---------- */

  const ACTIONS = [
    // A. Экономические законы (изменяют общие налоговые ставки, действуют до следующего указа)
    { id: 'law_millionaire_tax_up', icon: '📈', scope: 'law', label: 'Повысить налог для миллионеров (+2%)', desc: 'Увеличивает периодический налог на богатство.', field: 'millionaireTaxBonus', delta: 0.02 },
    { id: 'law_millionaire_tax_down', icon: '📉', scope: 'law', label: 'Снизить налог для миллионеров (−2%)', desc: 'Уменьшает периодический налог на богатство.', field: 'millionaireTaxBonus', delta: -0.02 },
    { id: 'law_auction_fee_up', icon: '🏛️', scope: 'law', label: 'Повысить комиссию аукциона (+2%)', desc: 'Больше уходит в казну с каждой сделки.', field: 'auctionCommissionBonus', delta: 0.02 },
    { id: 'law_auction_fee_down', icon: '🏛️', scope: 'law', label: 'Снизить комиссию аукциона (−2%)', desc: 'Продавцам достаётся больше с продажи.', field: 'auctionCommissionBonus', delta: -0.02 },
    { id: 'law_loan_rate_up', icon: '🏦', scope: 'law', label: 'Повысить ставку по кредитам (+1%)', desc: 'Кредиты становятся дороже для всех.', field: 'loanRateBonus', delta: 0.01 },
    { id: 'law_loan_rate_down', icon: '🏦', scope: 'law', label: 'Снизить ставку по кредитам (−1%)', desc: 'Кредиты становятся доступнее.', field: 'loanRateBonus', delta: -0.01 },
    { id: 'law_poor_subsidy_up', icon: '🤲', scope: 'law', label: 'Увеличить субсидии бедным (+2%)', desc: 'Поддержка малоимущих слоёв населения.', field: 'poorSubsidyRate', delta: 0.02 },
    { id: 'law_poor_subsidy_down', icon: '🤲', scope: 'law', label: 'Сократить субсидии бедным (−2%)', desc: 'Экономия бюджета за счёт социальных программ.', field: 'poorSubsidyRate', delta: -0.02 },
    { id: 'law_duel_bonus_up', icon: '⚔️', scope: 'law', label: 'Ввести бонус к призовому фонду дуэлей (+3%)', desc: 'Государство поощряет честные состязания.', field: 'duelPayoutBonus', delta: 0.03 },
    { id: 'law_reset_all', icon: '🧹', scope: 'law', label: 'Отменить все указы предшественников', desc: 'Обнуляет все действующие экономические законы разом.', field: null, resetAll: true },

    // B. Личные президентские привилегии (по разу за срок)
    { id: 'self_salary', icon: '💰', scope: 'self', label: 'Получить президентскую зарплату', desc: 'Официальное денежное довольствие главы государства.', effect: (state) => ({ money: scaleByWealth(state, 500000000) }) },
    { id: 'self_pardon', icon: '🕊️', scope: 'self', label: 'Указ о самопомиловании', desc: 'Списывает собственную судимость подчистую.', effect: (state) => { state.criminalRecord = 0; return {}; } },
    { id: 'self_bodyguards', icon: '💂', scope: 'self', label: 'Личная охрана', desc: 'Круглосуточная охрана укрепляет здоровье и спокойствие.', effect: () => ({ health: 15 }) },
    { id: 'self_motorcade', icon: '🚗', scope: 'self', label: 'Президентский кортеж', desc: 'Экономит силы на переездах.', effect: () => ({ energy: 20 }) },
    { id: 'self_statue', icon: '🗿', scope: 'self', label: 'Памятник самому себе', desc: 'Дорогостоящий, но статусный монумент.', effect: (state) => ({ money: -scaleByWealth(state, 2000000000), reputation: 5 }) },
    { id: 'self_press_conference', icon: '🎤', scope: 'self', label: 'Пресс-конференция', desc: 'Публичное выступление снимает напряжение и укрепляет имидж.', effect: () => ({ reputation: 3, stress: -10 }) },
    { id: 'self_state_dinner', icon: '🍽️', scope: 'self', label: 'Государственный приём', desc: 'Пышный приём в честь избрания.', effect: (state) => ({ money: -scaleByWealth(state, 800000000), happiness: 10 }) },
    { id: 'self_foreign_visit', icon: '✈️', scope: 'self', label: 'Визит к иностранным лидерам', desc: 'Дипломатия приносит и репутацию, и выгодные контракты.', effect: (state) => ({ reputation: 4, money: scaleByWealth(state, 400000000) }) },
    { id: 'self_national_holiday', icon: '🎉', scope: 'self', label: 'Национальный праздник в свою честь', desc: 'Страна отдыхает — и ты тоже.', effect: () => ({ happiness: 8 }) },
    { id: 'self_memoir_deal', icon: '📖', scope: 'self', label: 'Контракт на мемуары', desc: 'Издательство щедро платит за будущую книгу.', effect: (state) => ({ money: scaleByWealth(state, 300000000) }) },
    { id: 'self_security_detail', icon: '🛡️', scope: 'self', label: 'Усиленный протокол безопасности', desc: 'Меньше поводов для тревоги.', effect: () => ({ stress: -15 }) },
    { id: 'self_inaugural_ball', icon: '💃', scope: 'self', label: 'Инаугурационный бал', desc: 'Торжество по случаю вступления в должность.', effect: (state) => ({ money: -scaleByWealth(state, 600000000), happiness: 6, reputation: 2 }) },
    { id: 'self_diplomatic_immunity', icon: '🔓', scope: 'self', label: 'Дипломатическая неприкосновенность', desc: 'Немедленно освобождает из-под стражи, если ты сейчас задержан(а).', effect: (state) => { state.jailed = false; state.jailTurns = 0; return {}; } },
    { id: 'self_book_deal', icon: '📚', scope: 'self', label: 'Гонорар за автобиографию', desc: 'Ещё один издательский контракт.', effect: (state) => ({ money: scaleByWealth(state, 250000000) }) },

    // D. Национальные программы (по разу за срок, эффект и на себя как на гражданина)
    { id: 'program_infrastructure', icon: '🏗️', scope: 'self', label: 'Программа модернизации инфраструктуры', desc: 'Дороги и мосты — это репутация надолго.', effect: (state) => ({ money: -scaleByWealth(state, 1500000000), reputation: 3 }) },
    { id: 'program_education', icon: '🎓', scope: 'self', label: 'Национальная программа образования', desc: 'Все твои навыки подрастают на уровень.', effect: (state) => { Object.keys(state.skills || {}).forEach((k) => { state.skills[k] = Math.min(10, (state.skills[k] || 0) + 1); }); return {}; } },
    { id: 'program_healthcare', icon: '🏥', scope: 'self', label: 'Реформа здравоохранения', desc: 'Бесплатные циклы лечения для главы государства.', effect: (state) => { state.doctorCharges = (state.doctorCharges || 0) + 3; return { health: 10 }; } },
    { id: 'program_housing', icon: '🏘️', scope: 'self', label: 'Программа доступного жилья', desc: 'Общественная поддержка растёт.', effect: () => ({ happiness: 5 }) },
    { id: 'program_anti_crime', icon: '👮', scope: 'self', label: 'Программа профилактики преступности', desc: 'Частично снимает судимость как с примерного гражданина.', effect: (state) => { state.criminalRecord = Math.max(0, (state.criminalRecord || 0) - 2); return {}; } },
    { id: 'program_startups', icon: '🚀', scope: 'self', label: 'Гранты для стартапов', desc: 'Часть средств возвращается в виде дивидендов.', effect: (state) => ({ money: scaleByWealth(state, 200000000) }) },
    { id: 'program_culture', icon: '🎭', scope: 'self', label: 'Финансирование культуры', desc: 'Меценатство поднимает и настроение, и имидж.', effect: () => ({ happiness: 4, reputation: 2 }) },
    { id: 'program_sports', icon: '🏅', scope: 'self', label: 'Национальная спортивная программа', desc: 'Здоровье нации начинается с главы государства.', effect: () => ({ health: 5, energy: 10 }) },
    { id: 'program_green_energy', icon: '🌱', scope: 'self', label: 'Программа зелёной энергетики', desc: 'Прогрессивный имидж на международной арене.', effect: () => ({ reputation: 3 }) },
    { id: 'program_digital', icon: '💻', scope: 'self', label: 'Цифровизация страны', desc: 'Развивает и твои собственные навыки в IT.', effect: (state) => { state.skills.it = Math.min(10, (state.skills.it || 0) + 2); return {}; } },

    // E. Церемониальные указы (по разу за срок)
    { id: 'ceremony_anthem', icon: '🎵', scope: 'self', label: 'Обновить государственный гимн', desc: 'Символический жест новой эпохи.', effect: () => ({ reputation: 2 }) },
    { id: 'ceremony_new_holiday', icon: '📅', scope: 'self', label: 'Учредить новый государственный праздник', desc: 'Стране радостно, и тебе тоже.', effect: () => ({ happiness: 5 }) },
    { id: 'ceremony_self_medal', icon: '🏆', scope: 'self', label: 'Наградить себя государственной медалью', desc: 'Скромность — не главная добродетель политика.', effect: () => ({ reputation: 3 }) },
    { id: 'ceremony_rename_street', icon: '🪧', scope: 'self', label: 'Переименовать улицу в свою честь', desc: 'Небольшой, но приятный жест.', effect: () => ({ reputation: 1, happiness: 1 }) },
    { id: 'ceremony_state_visit', icon: '🤝', scope: 'self', label: 'Пригласить лидера соседней страны с визитом', desc: 'Международное признание.', effect: () => ({ reputation: 4 }) },
    { id: 'ceremony_time_capsule', icon: '📦', scope: 'self', label: 'Заложить капсулу времени', desc: 'Небольшая, но душевная традиция.', effect: () => ({ happiness: 2 }) },
    { id: 'ceremony_museum', icon: '🏛️', scope: 'self', label: 'Открыть национальный музей', desc: 'Дорогостоящий, но престижный проект.', effect: (state) => ({ money: -scaleByWealth(state, 1000000000), reputation: 3 }) },
    { id: 'ceremony_tv_address', icon: '📺', scope: 'self', label: 'Телеобращение к нации', desc: 'Публичность имеет свою цену — нервную.', effect: () => ({ reputation: 5, stress: 5 }) },
    { id: 'ceremony_gala', icon: '🥂', scope: 'self', label: 'Дипломатический приём-гала', desc: 'Изысканный вечер для укрепления связей.', effect: (state) => ({ money: -scaleByWealth(state, 700000000), reputation: 3, happiness: 3 }) },
    { id: 'ceremony_founding_day', icon: '🎆', scope: 'self', label: 'Отпраздновать День основания', desc: 'Народные гуляния по случаю памятной даты.', effect: () => ({ happiness: 6 }) },
  ];

  const TARGET_ACTIONS = [
    { id: 'target_fine', icon: '💸', label: 'Оштрафовать игрока', desc: 'Списывает указанную сумму с игрока в пользу бюджета.', needsAmount: true, sign: -1, costsMe: false },
    { id: 'target_subsidy', icon: '🎁', label: 'Выдать субсидию из своих средств', desc: 'Помощь игроку лично от президента.', needsAmount: true, sign: 1, costsMe: true },
    { id: 'target_grant', icon: '🏅', label: 'Государственный грант', desc: 'Поддержка из бюджета страны, без личных затрат.', needsAmount: true, sign: 1, costsMe: false },
    { id: 'target_audit', icon: '🔍', label: 'Налоговая проверка (штраф 5%)', desc: 'Забирает 5% текущего капитала игрока.', needsAmount: false, sign: -1, costsMe: false, fixedPercent: 0.05 },
    { id: 'target_praise', icon: '📣', label: 'Публичная похвала', desc: 'Официальная благодарность без денежных последствий.', needsAmount: false, sign: 0 },
    { id: 'target_reprimand', icon: '⚠️', label: 'Публичный выговор', desc: 'Официальное порицание без денежных последствий.', needsAmount: false, sign: 0 },
  ];

  function getLawsSource(state) {
    if (window.Cloud.enabled) return window.Cloud.getPresidency();
    return Promise.resolve({ presidentUid: state.isPresident ? 'local' : null, laws: state.localLaws || {}, bankruptcyTaxRate: (state.localLaws && state.localLaws.bankruptcyTaxRate) || 0 });
  }

  function render() {
    const state = window.Game.getState();
    const hint = document.getElementById('president-hint');
    const body = document.getElementById('president-body');
    if (!state.isPresident) {
      hint.textContent = state.everPresident
        ? 'Твой президентский срок закончился. Наберись репутации и денег заново, чтобы снова побороться за пост.'
        : 'Стать президентом можно только при репутации 100 и достаточном капитале на кампанию — шанс на выборах будет 25%.';
      body.classList.add('hidden');
      return;
    }
    hint.textContent = '';
    body.classList.remove('hidden');

    const remainMs = Math.max(0, (state.presidentTermEndsAtMs || 0) - Date.now());
    const remainH = Math.floor(remainMs / 3600000);
    const remainM = Math.floor((remainMs % 3600000) / 60000);
    document.getElementById('president-term').textContent = `Осталось у власти: ${remainH} ч ${remainM} мин`;

    renderTaxControl(state);
    renderActionCatalog(state);
    renderTargetActions(state);
  }

  function renderTaxControl(state) {
    const host = document.getElementById('president-tax-control');
    host.innerHTML = '<p class="tab-hint">Загрузка текущей ставки...</p>';
    getLawsSource(state).then((data) => {
      const current = typeof data.bankruptcyTaxRate === 'number' ? data.bankruptcyTaxRate : 0;
      host.innerHTML = `
        <div class="casino-bet-row">
          <label for="president-tax-input">Налог на банкротство, %:</label>
          <input id="president-tax-input" type="number" min="0" max="50" step="1" value="${Math.round(current * 100)}" />
          <button id="president-tax-set-btn" class="btn btn-primary">Установить</button>
        </div>
      `;
      document.getElementById('president-tax-set-btn').addEventListener('click', () => {
        const pct = Math.max(0, Math.min(50, Math.round(Number(document.getElementById('president-tax-input').value))));
        const rate = pct / 100;
        applyLawChange(state, { bankruptcyTaxRate: rate }, `Ставка налога на банкротство установлена на ${pct}%.`).then(() => render());
      });
    });
  }

  function applyLawChange(state, lawsPatch, logLine) {
    if (window.Cloud.enabled) {
      return window.Cloud.issuePresidentialDecree({ bankruptcyTaxRate: lawsPatch.bankruptcyTaxRate, laws: lawsPatch }, logLine)
        .then(() => window.Game.afterSideAction(null, logLine))
        .catch((e) => window.Game.afterSideAction(null, e.message));
    }
    state.localLaws = state.localLaws || {};
    Object.keys(lawsPatch).forEach((k) => { state.localLaws[k] = lawsPatch[k]; });
    window.Game.afterSideAction(null, logLine);
    return Promise.resolve();
  }

  function renderActionCatalog(state) {
    const host = document.getElementById('president-actions');
    host.innerHTML = '';
    const used = state.presidencyActionsUsed || [];
    ACTIONS.forEach((action) => {
      const isSelf = action.scope === 'self';
      const alreadyUsed = isSelf && used.indexOf(action.id) !== -1;
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-icon">${action.icon}</div>
        <div class="item-name">${action.label}</div>
        <div class="item-meta">${action.desc}</div>
        <div class="item-actions"></div>
      `;
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary btn-sm';
      btn.textContent = alreadyUsed ? 'Уже использовано в этот срок' : 'Издать указ';
      btn.disabled = alreadyUsed;
      btn.addEventListener('click', () => {
        if (action.scope === 'law') {
          if (action.resetAll) {
            applyLawChange(state, { bankruptcyTaxRate: 0, millionaireTaxBonus: 0, auctionCommissionBonus: 0, loanRateBonus: 0, poorSubsidyRate: 0, duelPayoutBonus: 0 }, 'Все указы предшественников отменены.').then(() => render());
            return;
          }
          getLawsSource(state).then((data) => {
            const currentVal = (data.laws && data.laws[action.field]) || 0;
            const nextVal = clampLaw(action.field, currentVal + action.delta);
            applyLawChange(state, { [action.field]: nextVal }, `${action.label} — новое значение поля «${action.field}»: ${(nextVal * 100).toFixed(1)}%.`).then(() => render());
          });
          return;
        }
        const result = action.effect(state) || {};
        if (typeof result.money === 'number') state.money += Math.round(result.money);
        if (typeof result.health === 'number') state.health = clampNum(state.health + result.health, 0, 100);
        if (typeof result.happiness === 'number') state.happiness = clampNum(state.happiness + result.happiness, 0, 100);
        if (typeof result.energy === 'number') state.energy = clampNum(state.energy + result.energy, 0, 100);
        if (typeof result.reputation === 'number') state.reputation = clampNum(state.reputation + result.reputation, 0, 100);
        if (typeof result.stress === 'number') state.stress = clampNum((state.stress || 0) + result.stress, 0, 100);
        state.presidencyActionsUsed = state.presidencyActionsUsed || [];
        state.presidencyActionsUsed.push(action.id);
        window.Game.afterSideAction(null, `Указ подписан: «${action.label}».`);
        render();
      });
      card.querySelector('.item-actions').appendChild(btn);
      host.appendChild(card);
    });
  }

  function renderTargetActions(state) {
    const host = document.getElementById('president-target-section');
    if (!window.Cloud.enabled || !window.Cloud.currentUser) {
      host.innerHTML = '<p class="tab-hint">Указы в отношении конкретных игроков требуют аккаунт и облако Firestore.</p>';
      return;
    }
    host.innerHTML = `
      <div class="casino-bet-row">
        <input id="president-target-search" type="text" placeholder="Имя или email игрока" />
        <button id="president-target-search-btn" class="btn btn-secondary">Найти</button>
      </div>
      <div id="president-target-results" class="item-grid"></div>
    `;
    document.getElementById('president-target-search-btn').addEventListener('click', () => {
      const q = document.getElementById('president-target-search').value;
      const resultsHost = document.getElementById('president-target-results');
      resultsHost.innerHTML = '<p class="tab-hint">Поиск...</p>';
      window.Cloud.adminFindPlayers(q).then((rows) => {
        resultsHost.innerHTML = '';
        if (!rows.length) { resultsHost.innerHTML = '<p class="tab-hint">Никого не нашли.</p>'; return; }
        rows.filter((r) => r.uid !== window.Cloud.currentUser.uid).forEach((row) => {
          const card = document.createElement('div');
          card.className = 'item-card';
          card.innerHTML = `
            <div class="item-name">${row.name || row.email}</div>
            <div class="item-meta">Баланс: ${formatMoney(row.money || 0)}</div>
            <div class="president-target-actions"></div>
          `;
          const actionsHost = card.querySelector('.president-target-actions');
          TARGET_ACTIONS.forEach((ta) => {
            const btn = document.createElement('button');
            btn.className = 'chip home-upgrade-chip';
            btn.textContent = `${ta.icon} ${ta.label}`;
            btn.addEventListener('click', () => applyTargetAction(state, ta, row));
            actionsHost.appendChild(btn);
          });
          resultsHost.appendChild(card);
        });
      });
    });
  }

  function applyTargetAction(state, ta, row) {
    let amount = 0;
    if (ta.fixedPercent) {
      amount = Math.round((row.money || 0) * ta.fixedPercent);
    } else if (ta.needsAmount) {
      const input = window.prompt(`Сумма для «${ta.label}» (₽):`, '1000000');
      amount = Math.round(Number(input));
      if (!amount || amount <= 0) return;
    }
    if (ta.costsMe && amount > state.money) {
      window.Game.afterSideAction(null, 'Не хватает личных средств.');
      return;
    }
    const applyMoney = ta.sign === 0 ? Promise.resolve() : window.Cloud.adminAdjustMoney(row.uid, amount * ta.sign);
    applyMoney.then(() => {
      if (ta.costsMe) state.money -= amount;
      const logText = ta.sign > 0
        ? `Президент оказал(а) поддержку игроку ${row.name || row.email}: +${formatMoney(amount)} (${ta.label}).`
        : ta.sign < 0
          ? `Президент применил(а) «${ta.label}» к игроку ${row.name || row.email}: −${formatMoney(amount)}.`
          : `Президент издал(а) указ «${ta.label}» в отношении игрока ${row.name || row.email}.`;
      window.Cloud.postActivity(logText);
      window.Game.afterSideAction(null, logText);
      render();
    }).catch((e) => window.Game.afterSideAction(null, e.message));
  }

  return { render };
})();
