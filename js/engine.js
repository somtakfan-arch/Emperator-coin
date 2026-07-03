/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Игровой движок: состояние, ходы, условия победы/поражения.
   ========================================================= */

const AUTO_BANKRUPT_THRESHOLD = -300000;
const MAX_AGE = 85;
const MAX_TURNS = 70;
const BILLIONAIRE_GOAL = 1000000000;

const TIER_BASELINE = {
  homeless: { health: 55, happiness: 35, energy: 50, reputation: 30 },
  poor: { health: 65, happiness: 45, energy: 60, reputation: 40 },
  middle: { health: 75, happiness: 60, energy: 70, reputation: 55 },
  rich: { health: 80, happiness: 70, energy: 75, reputation: 65 },
  millionaire: { health: 85, happiness: 75, energy: 80, reputation: 75 },
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
    debtTrap: false,
    ended: false,
    endingType: null,
    tier: tier.id,
    startTier: tier.id,
    log: [],
  };
}

function pickNextEvent(state) {
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

  state.money += Math.round(result.money || 0);
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
  if (result.debtTrap) state.debtTrap = true;

  state.usedEventIds.add(event.id);
  state.turn += 1;

  // пассивная регенерация энергии/здоровья между событиями
  state.energy = clampNum(state.energy + 4, 0, 100);
  if (state.happiness > 60) state.health = clampNum(state.health + 1, 0, 100);
  if (state.turn % 2 === 0) state.age += 1;

  const prevTier = state.tier;
  state.tier = getTier(state.money).id;
  const tierChanged = prevTier !== state.tier;

  let ending = null;
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
    tierChanged,
    newTier: state.tier,
  };
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

function getEndingSummary(state) {
  const info = ENDING_TEXT[state.endingType] || ENDING_TEXT.timeUp;
  const tier = getTier(state.money);
  return {
    title: info.title,
    text: info.text,
    tierLabel: tier.label,
    finalMoney: state.money,
    turns: state.turn,
    age: state.age,
  };
}
