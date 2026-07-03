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
const TIER_BARRIER_CHANCE = 0.6;
const BARRIER_MESSAGES = [
  '🚧 Почти получилось — но тут подоспели налоги, комиссии и внезапные счета, откатив всё почти к прежнему уровню.',
  '🚧 Система не пускает наверх с первой попытки: банк отказал в нужных условиях, а часть прибыли съели непредвиденные траты.',
  '🚧 Один шаг до нового уровня жизни — и тут же нашлись желающие откусить от прироста: юристы, посредники, "форс-мажоры".',
  '🚧 Пробиться наверх с наскока не вышло: связи и стартовый капитал решают больше, чем кажется.',
];

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
    hasBoss: !!character.hasBoss && !/нет работы|безработ/i.test(character.job),
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

  if (state.pantry <= 15) {
    const groceryPool = window.EVENTS.filter(
      (ev) => !state.usedEventIds.has(ev.id) && ev.conditions(state) && (ev.id.startsWith('shopping_0_') || ev.id === 'hand_boris_shop' || ev.id === 'hand_pantry_empty')
    );
    if (groceryPool.length) return groceryPool[randInt(0, groceryPool.length - 1)];
  }

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
    state.hasBoss = false;
    state.job = 'безработный(ая)';
  }
  if (result.jobGain) {
    state.hasJob = true;
    state.hasBoss = true;
    state.job = 'подработка';
  }
  if (result.debtRateUp) state.debtRate = PREDATORY_DEBT_RATE;
  if (result.debtRateReset) state.debtRate = BASE_DEBT_RATE;
  if (typeof result.pantrySet === 'number') state.pantry = clampNum(result.pantrySet, 0, 100);
  if (result.addPossession) state.possessions.add(result.addPossession);

  if (choice.trait && state.traits[choice.trait] !== undefined) {
    state.traits[choice.trait] += 1;
  }

  if (event.id !== '__forced_rest__' && event.id !== 'hand_pantry_empty') state.usedEventIds.add(event.id);
  state.turn += 1;

  // пассивная регенерация энергии/здоровья между событиями
  state.energy = clampNum(state.energy + 4, 0, 100);
  if (state.happiness > 60) state.health = clampNum(state.health + 1, 0, 100);
  if (state.turn % 2 === 0) state.age += 1;

  // запасы еды понемногу расходуются; на нуле мягко бьют по здоровью и настроению
  state.pantry = clampNum(state.pantry - 4, 0, 100);
  let pantryMessage = '';
  if (state.pantry <= 8) {
    state.health = clampNum(state.health - 1, 0, 100);
    state.happiness = clampNum(state.happiness - 1, 0, 100);
    pantryMessage = '🍽️ Еда почти закончилась — самое время закупиться.';
  }

  // проценты по долгу — чем глубже яма, тем быстрее она растёт
  let interestMessage = '';
  if (state.money < 0) {
    const interest = Math.ceil(Math.abs(state.money) * state.debtRate);
    state.money -= interest;
    interestMessage = `📉 Долг вырос на ${formatMoney(interest)} из-за процентов${state.debtRate > BASE_DEBT_RATE ? ' (грабительская ставка микрозайма!)' : ''}.`;
  }

  // "стеклянный потолок": вырваться в следующий социальный слой почти
  // невозможно — система (налоги, внезапные траты, кредитные истории,
  // закрытые двери) чаще всего откатывает игрока обратно к границе.
  const prevTier = state.tier;
  let rawNewTier = getTier(state.money);
  let barrierMessage = '';
  if (moneyDelta > 0) {
    const prevIdx = window.TIERS.findIndex((t) => t.id === prevTier);
    const rawIdx = window.TIERS.findIndex((t) => t.id === rawNewTier.id);
    if (rawIdx > prevIdx) {
      const jump = rawIdx - prevIdx;
      const barrierChance = clampNum(TIER_BARRIER_CHANCE + (jump - 1) * 0.12, TIER_BARRIER_CHANCE, 0.93);
      if (chance(barrierChance)) {
        const ceiling = window.TIERS[prevIdx].max;
        const buffer = Math.max(Math.round(Math.abs(ceiling || 1000) * rand(0.01, 0.05)), randInt(50, 400));
        state.money = ceiling - buffer;
        rawNewTier = getTier(state.money);
        barrierMessage = pick(BARRIER_MESSAGES);
      }
    }
  }
  state.tier = rawNewTier.id;
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
    interestMessage: [barrierMessage, interestMessage, pantryMessage].filter(Boolean).join(' '),
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
