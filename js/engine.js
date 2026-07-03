/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Игровой движок: состояние, ходы, черты характера, долги,
   условия победы/поражения.
   ========================================================= */

const AUTO_BANKRUPT_THRESHOLD = -300000;
const MAX_AGE = 85;
const MAX_TURNS = 70;
const BILLIONAIRE_GOAL = 1000000000;
const BASE_DEBT_RATE = 0.025;
const PREDATORY_DEBT_RATE = 0.075;
const LOW_ENERGY_THRESHOLD = 12;

const TIER_BASELINE = {
  homeless: { health: 55, happiness: 35, energy: 50, reputation: 30 },
  poor: { health: 65, happiness: 45, energy: 60, reputation: 40 },
  middle: { health: 75, happiness: 60, energy: 70, reputation: 55 },
  rich: { health: 80, happiness: 70, energy: 75, reputation: 65 },
  millionaire: { health: 85, happiness: 75, energy: 80, reputation: 75 },
};

const TRAIT_INFO = {
  riskTaker: { icon: '🎲', label: 'Азартный', threshold: 5 },
  cautious: { icon: '🛡️', label: 'Осторожный', threshold: 5 },
  hardworker: { icon: '💼', label: 'Трудоголик', threshold: 5 },
  shady: { icon: '🕶️', label: 'Тёмная лошадка', threshold: 3 },
  familyFirst: { icon: '👨‍👩‍👧', label: 'Семьянин', threshold: 5 },
};

function createGameState(name, character) {
  const tier = getTier(character.money);
  const baseline = TIER_BASELINE[tier.id] || TIER_BASELINE.middle;
  return {
    name,
    characterId: character.id,
    age: character.age,
    job: character.job,
    property: character.property,
    money: character.money,
    family: character.family,
    allergy: character.allergy,
    allergyNone: character.allergy === 'нет аллергий',
    hasFamily: character.family !== 'сирота, семьи никогда не было',
    hasJob: !/нет работы|безработ/i.test(character.job),
    health: baseline.health,
    happiness: baseline.happiness,
    energy: baseline.energy,
    reputation: baseline.reputation,
    turn: 0,
    usedEventIds: new Set(),
    traits: { riskTaker: 0, cautious: 0, hardworker: 0, shady: 0, familyFirst: 0 },
    pantry: 55,
    possessions: new Set(),
    debtRate: BASE_DEBT_RATE,
    ended: false,
    endingType: null,
    tier: tier.id,
    startTier: tier.id,
  };
}

const REST_EVENT = {
  id: '__forced_rest__',
  text: 'Ты вымотан до предела. Организм требует отдыха, иначе будут последствия.',
  conditions: () => true,
  choices: [
    { label: 'Отдохнуть весь день', risk: 'safe', effect: () => ({ energy: 35, happiness: 4, message: 'Отдых пошёл на пользу, силы восстановлены.' }) },
    { label: 'Продолжать через силу', trait: 'hardworker', risk: 'risky', effect: () => ({ health: -14, happiness: -8, message: 'Организм на пределе, здоровье пошатнулось.' }) },
  ],
};

function pickNextEvent(state) {
  if (state.energy <= LOW_ENERGY_THRESHOLD) return REST_EVENT;

  let pool = window.EVENTS.filter((ev) => !state.usedEventIds.has(ev.id) && ev.conditions(state));
  if (pool.length === 0) {
    state.usedEventIds.clear();
    pool = window.EVENTS.filter((ev) => ev.conditions(state));
  }
  if (pool.length === 0) return null;
  return pool[randInt(0, pool.length - 1)];
}

function applyChoice(state, event, choiceIndex) {
  const choice = event.choices[choiceIndex];
  const result = choice.effect(state) || {};

  // низкое здоровье бьёт по способности зарабатывать
  let moneyDelta = result.money || 0;
  if (state.health < 25 && moneyDelta > 0) moneyDelta = Math.round(moneyDelta * 0.7);

  state.money += Math.round(moneyDelta);
  state.health = clampNum(state.health + (result.health || 0), 0, 100);
  state.happiness = clampNum(state.happiness + (result.happiness || 0), 0, 100);
  state.energy = clampNum(state.energy + (result.energy || 0), 0, 100);
  state.reputation = clampNum(state.reputation + (result.reputation || 0), 0, 100);

  if (result.jobLoss) {
    state.hasJob = false;
    state.job = 'безработный(ая)';
  }
  if (result.jobGain) {
    state.hasJob = true;
    state.job = 'подработка';
  }
  if (result.debtRateUp) state.debtRate = PREDATORY_DEBT_RATE;
  if (result.debtRateReset) state.debtRate = BASE_DEBT_RATE;
  if (typeof result.pantrySet === 'number') state.pantry = clampNum(result.pantrySet, 0, 100);
  if (result.addPossession) state.possessions.add(result.addPossession);

  if (choice.trait && state.traits[choice.trait] !== undefined) {
    state.traits[choice.trait] += 1;
  }

  if (event.id !== '__forced_rest__') state.usedEventIds.add(event.id);
  state.turn += 1;

  // пассивная регенерация энергии/здоровья между событиями
  state.energy = clampNum(state.energy + 4, 0, 100);
  if (state.happiness > 60) state.health = clampNum(state.health + 1, 0, 100);
  if (state.turn % 2 === 0) state.age += 1;

  // запасы еды понемногу расходуются; на нуле бьют по здоровью и настроению
  state.pantry = clampNum(state.pantry - 5, 0, 100);
  let pantryMessage = '';
  if (state.pantry <= 8) {
    state.health = clampNum(state.health - 3, 0, 100);
    state.happiness = clampNum(state.happiness - 2, 0, 100);
    pantryMessage = '🍽️ Еда почти закончилась — это сказывается на самочувствии.';
  }

  // проценты по долгу — чем глубже яма, тем быстрее она растёт
  let interestMessage = '';
  if (state.money < 0) {
    const interest = Math.ceil(Math.abs(state.money) * state.debtRate);
    state.money -= interest;
    interestMessage = `📉 Долг вырос на ${formatMoney(interest)} из-за процентов${state.debtRate > BASE_DEBT_RATE ? ' (грабительская ставка микрозайма!)' : ''}.`;
  }

  const prevTier = state.tier;
  state.tier = getTier(state.money).id;
  const tierChanged = prevTier !== state.tier;

  if (result.jail) {
    state.ended = true;
    state.endingType = 'jail';
  } else if (result.bankrupt) {
    state.ended = true;
    state.endingType = 'bankrupt';
  } else if (state.health <= 0) {
    state.ended = true;
    state.endingType = 'death';
  } else if (state.money <= AUTO_BANKRUPT_THRESHOLD) {
    state.ended = true;
    state.endingType = 'bankrupt';
  } else if (state.money >= BILLIONAIRE_GOAL) {
    state.ended = true;
    state.endingType = 'billionaire';
  } else if (state.age >= MAX_AGE) {
    state.ended = true;
    state.endingType = 'lifeEnd';
  } else if (state.turn >= MAX_TURNS) {
    state.ended = true;
    state.endingType = 'timeUp';
  }

  return {
    message: result.message || '',
    interestMessage: [interestMessage, pantryMessage].filter(Boolean).join(' '),
    tierChanged,
    newTier: state.tier,
    newTrait: getFreshlyUnlockedTrait(state, choice.trait),
  };
}

function getFreshlyUnlockedTrait(state, traitKey) {
  if (!traitKey) return null;
  const info = TRAIT_INFO[traitKey];
  if (!info) return null;
  if (state.traits[traitKey] === info.threshold) return { key: traitKey, ...info };
  return null;
}

function getActiveTraits(state) {
  return Object.keys(TRAIT_INFO)
    .filter((key) => state.traits[key] >= TRAIT_INFO[key].threshold)
    .map((key) => ({ key, ...TRAIT_INFO[key], count: state.traits[key] }))
    .sort((a, b) => b.count - a.count);
}

const ENDING_TEXT = {
  bankrupt: {
    title: '💸 Банкротство',
    text: 'Долги оказались сильнее тебя. Имущество арестовано, счета обнулены — жизнь придётся собирать заново с чистого листа.',
  },
  death: {
    title: '⚰️ Конец истории',
    text: 'Здоровье не выдержало напряжённой жизни. История подошла к концу раньше, чем хотелось бы.',
  },
  jail: {
    title: '⛓️ Тюрьма',
    text: 'Погоня за лёгкими деньгами закончилась приговором суда. Все амбиции придётся отложить на очень долгий срок.',
  },
  billionaire: {
    title: '👑 Миллиардер!',
    text: 'Ты прошёл путь до самой вершины и вошёл в клуб миллиардеров. Это настоящая история триумфа.',
  },
  lifeEnd: {
    title: '🕯️ Конец жизненного пути',
    text: 'Годы взяли своё. Жизнь подошла к естественному завершению — самое время подвести итоги.',
  },
  timeUp: {
    title: '🏁 Итоги пути',
    text: 'Прошло достаточно лет, чтобы подвести черту под этим этапом истории.',
  },
};

const EPILOGUE_TEXT = {
  riskTaker: 'Тебя запомнили как человека, который никогда не боялся ставить всё на кон — иногда это окупалось с лихвой, иногда било по больному.',
  cautious: 'Ты шёл по жизни размеренно и обдуманно, избегая лишних рисков — не самый быстрый путь, зато самый устойчивый.',
  hardworker: 'Трудоголик до мозга костей — ты выгрызал каждый рубль упорным трудом, не жалея ни сил, ни выходных.',
  shady: 'Твоё имя навсегда связано с сомнительными делами на грани закона — часть пути ты прошёл по самому краю.',
  familyFirst: 'Что бы ни происходило, семья всегда была на первом месте — и это чувствовалось в каждом твоём решении.',
};

function getEndingSummary(state) {
  const info = ENDING_TEXT[state.endingType] || ENDING_TEXT.timeUp;
  const tier = getTier(state.money);
  const traits = getActiveTraits(state);
  const epilogue = traits.length ? EPILOGUE_TEXT[traits[0].key] : '';
  return {
    title: info.title,
    text: info.text,
    epilogue,
    traits,
    tierLabel: tier.label,
    finalMoney: state.money,
    turns: state.turn,
    age: state.age,
  };
}
