/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Игровой движок: состояние, ходы, черты характера, долги,
   инвентарь, доктор, условия победы/поражения.
   ========================================================= */

const AUTO_BANKRUPT_THRESHOLD = -300000;
const MAX_AGE = 85;
const MAX_TURNS = 70;
const BASE_DEBT_RATE = 0.025;
const PREDATORY_DEBT_RATE = 0.075;
const LOW_ENERGY_THRESHOLD = 12;
const NET_WORTH_FACTOR = 0.5; // вещи в инвентаре считаются в "чистой стоимости" не по полной цене
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
    inventory: {},
    cryptoHoldings: {},
    doctorCharges: 0,
    doctorVisits: 0,
    debtRate: BASE_DEBT_RATE,
    jailed: false,
    jailTurns: 0,
    ended: false,
    endingType: null,
    tier: tier.id,
    startTier: tier.id,
  };
}

/* ---------- экипировка: одежда обязательна, сумка увеличивает инвентарь ---------- */

// Часы/электроника/ювелирка носятся с собой и упираются в вместимость;
// одежда (на теле) и машины (в гараже) места не занимают, а сумки сами
// эту вместимость увеличивают — иначе некуда было бы класть новую сумку.
const CARRIED_CATEGORIES = ['watches', 'electronics', 'jewelry'];
const BAG_CAPACITY = {
  bag_totebag: 5, bag_market: 6, bag_zarra: 8, bag_backpack: 8, bag_bruno: 12, bag_maikl_kors: 14,
  bag_duval: 18, bag_guccho2: 20, bag_balensiaga: 20, bag_luiviton: 21, bag_prada_travel: 22,
  bag_shanella_micro: 24, bag_golden: 30, bag_hermec: 29, bag_vault: 45,
};
const NO_BAG_CAPACITY = 3;
// "хорошая одежда" — от куртки и выше; открывает доступ к дорогим/статусным мероприятиям
const GOOD_CLOTHES_THRESHOLD = 15000;

function ownsCategory(state, category) {
  return Object.keys(state.inventory || {}).some((id) => {
    const it = window.ITEMS.byId[id];
    return it && it.category === category && (state.inventory[id] || 0) > 0;
  });
}

function hasClothes(state) {
  return ownsCategory(state, 'clothes');
}

/** Хорошая одежда (не просто любая) — пропуск на богатые мероприятия. */
function hasGoodClothes(state) {
  return Object.keys(state.inventory || {}).some((id) => {
    const it = window.ITEMS.byId[id];
    return it && it.category === 'clothes' && it.price >= GOOD_CLOTHES_THRESHOLD && (state.inventory[id] || 0) > 0;
  });
}

function hasCarItem(state) {
  return ownsCategory(state, 'cars');
}

const RENT_YIELD_PER_TURN = 0.0004; // ~0.04% от стоимости "лишней" недвижимости за ход

/** Аренда: первая (самая дорогая) объект недвижимости — это дом, где
 *  живёшь, остальные можно сдавать. Доход капает каждый ход. */
function computeRentalIncome(state) {
  const housingIds = Object.keys(state.inventory || {}).filter((id) => {
    const it = window.ITEMS.byId[id];
    return it && it.category === 'housing' && (state.inventory[id] || 0) > 0;
  });
  if (housingIds.length === 0) return 0;
  let totalValue = 0;
  let maxPrice = 0;
  housingIds.forEach((id) => {
    const it = window.ITEMS.byId[id];
    const qty = state.inventory[id];
    totalValue += it.price * qty;
    if (it.price > maxPrice) maxPrice = it.price;
  });
  const rentableValue = Math.max(0, totalValue - maxPrice);
  return Math.round(rentableValue * RENT_YIELD_PER_TURN);
}

function getInventoryCapacity(state) {
  let cap = NO_BAG_CAPACITY;
  Object.keys(state.inventory || {}).forEach((id) => {
    if (BAG_CAPACITY[id] !== undefined && (state.inventory[id] || 0) > 0) cap = Math.max(cap, BAG_CAPACITY[id]);
  });
  return cap;
}

function countCarriedItems(state) {
  let total = 0;
  Object.keys(state.inventory || {}).forEach((id) => {
    const it = window.ITEMS.byId[id];
    if (it && CARRIED_CATEGORIES.indexOf(it.category) !== -1) total += state.inventory[id] || 0;
  });
  return total;
}

/* ---------- сохранение/загрузка слота персонажа ---------- */

function serializeState(state) {
  const copy = Object.assign({}, state);
  copy.usedEventIds = Array.from(state.usedEventIds || []);
  copy.possessions = Array.from(state.possessions || []);
  return copy;
}

function deserializeState(obj) {
  const state = Object.assign({}, obj);
  state.usedEventIds = new Set(obj.usedEventIds || []);
  state.possessions = new Set(obj.possessions || []);
  return state;
}

/* ---------- чистая стоимость и "стеклянный потолок" ---------- */

function computeEffectiveWealth(state) {
  const netWorth = window.ITEMS ? window.ITEMS.computeInventoryNetWorth(state) : 0;
  return state.money + netWorth * NET_WORTH_FACTOR;
}

/** Пересчитывает уровень с учётом барьера перехода наверх.
 *  Вызывается после ЛЮБОГО действия, которое могло изменить деньги
 *  или имущество: хода по сюжету, покупки/продажи вещи, визита к
 *  врачу, ставки в казино, сделки на аукционе. */
function applyTierBarrier(state) {
  const prevTier = state.tier;
  let rawNewTier = getTier(computeEffectiveWealth(state));
  let barrierMessage = '';
  const prevIdx = window.TIERS.findIndex((t) => t.id === prevTier);
  const rawIdx = window.TIERS.findIndex((t) => t.id === rawNewTier.id);
  if (rawIdx > prevIdx) {
    const jump = rawIdx - prevIdx;
    const requiredReputation = clampNum(55 + (jump - 1) * 13, 55, 90);
    if (state.reputation < requiredReputation) {
      const ceiling = window.TIERS[prevIdx].max;
      const netWorth = window.ITEMS ? window.ITEMS.computeInventoryNetWorth(state) : 0;
      const buffer = Math.max(Math.round(Math.abs(ceiling || 1000) * 0.03), 200);
      const targetEffective = ceiling - buffer;
      state.money = Math.round(targetEffective - netWorth * NET_WORTH_FACTOR);
      rawNewTier = getTier(computeEffectiveWealth(state));
      barrierMessage = BARRIER_MESSAGES[jump % BARRIER_MESSAGES.length];
    }
  }
  state.tier = rawNewTier.id;
  return { tierChanged: prevTier !== state.tier, barrierMessage };
}

/* ---------- инвентарь: покупка, еда, кейсы ---------- */

function buyItem(state, itemId) {
  const item = window.ITEMS.byId[itemId];
  if (!item) return { ok: false, message: 'Такого товара нет.' };
  if (state.money < item.price) return { ok: false, message: 'Не хватает денег.' };
  if (CARRIED_CATEGORIES.indexOf(item.category) !== -1 && countCarriedItems(state) >= getInventoryCapacity(state)) {
    return { ok: false, message: `Инвентарь переполнен (вмещает ${getInventoryCapacity(state)}) — купи сумку побольше или продай что-нибудь лишнее.` };
  }
  state.money -= item.price;
  state.inventory[itemId] = (state.inventory[itemId] || 0) + 1;
  const fx = item.effects || {};
  if (fx.happiness) state.happiness = clampNum(state.happiness + fx.happiness, 0, 100);
  if (fx.reputation) state.reputation = clampNum(state.reputation + fx.reputation, 0, 100);
  if (fx.health) state.health = clampNum(state.health + fx.health, 0, 100);
  const barrier = applyTierBarrier(state);
  return { ok: true, message: `Куплено: ${item.name} за ${formatMoney(item.price)}.`, barrier };
}

function eatFoodItem(state, itemId) {
  const item = window.ITEMS.byId[itemId];
  if (!item || item.category !== 'food') return { ok: false, message: 'Это нельзя съесть.' };
  if (!state.inventory[itemId]) return { ok: false, message: 'У тебя этого нет в инвентаре.' };
  state.inventory[itemId] -= 1;
  if (state.inventory[itemId] <= 0) delete state.inventory[itemId];
  const fx = item.effects || {};
  state.pantry = clampNum(state.pantry + (fx.pantry || 0), 0, 100);
  if (fx.happiness) state.happiness = clampNum(state.happiness + fx.happiness, 0, 100);
  if (fx.health) state.health = clampNum(state.health + fx.health, 0, 100);
  if (fx.reputation) state.reputation = clampNum(state.reputation + fx.reputation, 0, 100);
  return { ok: true, message: `Съедено: ${item.name}.` };
}

function sellItem(state, itemId) {
  const item = window.ITEMS.byId[itemId];
  if (!item || !state.inventory[itemId]) return { ok: false, message: 'Нечего продавать.' };
  const price = Math.round(item.price * 0.6);
  state.inventory[itemId] -= 1;
  if (state.inventory[itemId] <= 0) delete state.inventory[itemId];
  state.money += price;
  const barrier = applyTierBarrier(state);
  return { ok: true, message: `Продано: ${item.name} за ${formatMoney(price)} (60% от цены).`, barrier, price };
}

/** Открытие кейса через мини-игру "Поймай момент": позиция маркера
 *  (0..1) детерминированно определяет, какой предмет из пула
 *  достанется — чем точнее в центр, тем реже и ценнее вещь. */
function resolveCaseItem(caseDef, position) {
  const d = Math.abs(position - 0.5);
  const pool = caseDef.pool;
  const n = pool.length;
  let idx;
  if (d <= 0.05) idx = n - 1;
  else if (d <= 0.14) idx = Math.min(n - 1, n - 2);
  else if (d <= 0.26) idx = Math.min(n - 1, Math.floor(n / 2));
  else idx = 0;
  return pool[clampNum(idx, 0, n - 1)];
}

function openCase(state, caseId, position) {
  const caseDef = window.CASES.find((c) => c.id === caseId);
  if (!caseDef) return { ok: false, message: 'Такого кейса нет.' };
  if (state.money < caseDef.price) return { ok: false, message: 'Не хватает денег на кейс.' };
  if (CARRIED_CATEGORIES.indexOf(caseDef.category) !== -1 && countCarriedItems(state) >= getInventoryCapacity(state)) {
    return { ok: false, message: `Инвентарь переполнен (вмещает ${getInventoryCapacity(state)}) — сначала освободи место или купи сумку побольше.` };
  }
  state.money -= caseDef.price;
  const itemId = resolveCaseItem(caseDef, position);
  const item = window.ITEMS.byId[itemId];
  state.inventory[itemId] = (state.inventory[itemId] || 0) + 1;
  const barrier = applyTierBarrier(state);
  return { ok: true, item, message: `Из кейса выпало: ${item.name}!`, barrier };
}

/* ---------- доктор: платное лечение продлевает жизнь ---------- */

const DOCTOR_BASE_COST = 4000;
const DOCTOR_CHARGES_PER_VISIT = 6;

function visitDoctor(state) {
  const cost = scaleByWealth(state, DOCTOR_BASE_COST);
  if (state.money < cost) return { ok: false, message: 'Не хватает денег на приём.' };
  state.money -= cost;
  state.health = clampNum(state.health + 15, 0, 100);
  state.happiness = clampNum(state.happiness + 5, 0, 100);
  state.doctorCharges = (state.doctorCharges || 0) + DOCTOR_CHARGES_PER_VISIT;
  state.doctorVisits = (state.doctorVisits || 0) + 1;
  const barrier = applyTierBarrier(state);
  return { ok: true, cost, message: `Приём оплачен (${formatMoney(cost)}). Врач продлил жизнь ещё на ${DOCTOR_CHARGES_PER_VISIT} циклов старения.`, barrier };
}

/* ---------- казино отдельной вкладкой: ставка + мини-игра ---------- */

function placeCasinoBet(state, stake, success, payoutMultiplier) {
  if (state.money < stake) return { ok: false, message: 'Не хватает денег на такую ставку.' };
  state.money -= stake;
  let winnings = 0;
  if (success) {
    winnings = Math.round(stake * payoutMultiplier);
    state.money += winnings;
    state.happiness = clampNum(state.happiness + 6, 0, 100);
  } else {
    state.happiness = clampNum(state.happiness - 4, 0, 100);
  }
  const barrier = applyTierBarrier(state);
  return { ok: true, success, winnings, barrier };
}

/* ---------- крипта отдельной вкладкой: вход по мини-игре, позиция держится сколько угодно ---------- */

function hasElectronicsItem(state) {
  return ownsCategory(state, 'electronics');
}

/** Индекс цены монеты — детерминированная "волна" от номера хода и
 *  индекса монеты. Один и тот же ход всегда даёт один и тот же индекс,
 *  никакого Math.random(). */
function cryptoPriceIndex(state, coinIdx) {
  const phase = coinIdx * 1.7;
  const wave = 35 * Math.sin(state.turn * 0.35 + phase) + 10 * Math.sin(state.turn * 0.9 + phase * 2);
  return Math.max(20, Math.round(100 + wave));
}

/** Открыть/докупить позицию. Успех мини-игры даёт вход по более
 *  выгодной цене, провал — по менее выгодной; деньги не начисляются
 *  и не сгорают сразу — итог решится при продаже позиции. */
function buyCrypto(state, coinIdx, stake, success) {
  if (stake <= 0) return { ok: false, message: 'Укажи сумму инвестиции.' };
  if (state.money < stake) return { ok: false, message: 'Не хватает денег на такую сумму.' };
  state.money -= stake;
  const price = cryptoPriceIndex(state, coinIdx);
  const entryPrice = success ? Math.round(price * 0.85) : Math.round(price * 1.15);
  state.cryptoHoldings = state.cryptoHoldings || {};
  const key = String(coinIdx);
  const existing = state.cryptoHoldings[key];
  if (existing) {
    const totalInvested = existing.invested + stake;
    const blendedEntry = Math.round((existing.invested * existing.entryPrice + stake * entryPrice) / totalInvested);
    state.cryptoHoldings[key] = { invested: totalInvested, entryPrice: blendedEntry };
  } else {
    state.cryptoHoldings[key] = { invested: stake, entryPrice };
  }
  const barrier = applyTierBarrier(state);
  return {
    ok: true,
    success,
    barrier,
    message: success
      ? `Вошёл в позицию по выгодной цене (индекс ${entryPrice}).`
      : `Момент был не лучшим — вход по индексу ${entryPrice}.`,
  };
}

function sellCrypto(state, coinIdx) {
  const key = String(coinIdx);
  const holding = state.cryptoHoldings && state.cryptoHoldings[key];
  if (!holding) return { ok: false, message: 'Нечего продавать.' };
  const price = cryptoPriceIndex(state, coinIdx);
  const value = Math.round(holding.invested * (price / holding.entryPrice));
  state.money += value;
  delete state.cryptoHoldings[key];
  const barrier = applyTierBarrier(state);
  const profit = value - holding.invested;
  return {
    ok: true,
    value,
    profit,
    barrier,
    message: profit >= 0 ? `Продано с прибылью ${formatMoney(profit)}.` : `Продано в убыток ${formatMoney(Math.abs(profit))}.`,
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

/* ---------- тюрьма: залог вместо мгновенного конца игры ---------- */

function computeBailCost(state) {
  return scaleByWealth(state, 20000);
}

const JAIL_EVENT = {
  id: '__jailed__',
  text: (state) => `Ты за решёткой. Залог для освобождения — ${formatMoney(computeBailCost(state))}.`,
  conditions: () => true,
  choices: [
    {
      label: (state) => `Заплатить залог (${formatMoney(computeBailCost(state))})`,
      risk: 'balanced',
      effect: (state) => {
        const bail = computeBailCost(state);
        if (state.money < bail) return { happiness: -3, message: 'Денег на залог не хватает — придётся отбывать срок.' };
        state.jailed = false;
        state.jailTurns = 0;
        return { money: -bail, reputation: -8, happiness: -4, message: `Залог оплачен (${formatMoney(bail)}). Ты вышел на свободу, но репутация подпорчена.` };
      },
    },
    {
      label: 'Отбывать срок дальше',
      risk: 'safe',
      effect: (state) => {
        state.jailTurns = (state.jailTurns || 0) + 1;
        if (state.jailTurns >= 3) {
          state.jailed = false;
          state.jailTurns = 0;
          return { happiness: -10, energy: -15, reputation: -3, message: 'Срок отбыт полностью. Вышел на свободу — потрёпанный, но при своём.' };
        }
        return { happiness: -6, energy: -8, message: `Ещё один день за решёткой... (${state.jailTurns}/3)` };
      },
    },
  ],
};

/* ---------- одежда: без неё на люди не выйти ---------- */

const CLOTHES_EVENT = {
  id: '__no_clothes__',
  text: 'У тебя нет приличной одежды, чтобы показаться на людях — без неё многие дела на улице подождут.',
  conditions: () => true,
  choices: [
    {
      label: () => `Купить одежду на рынке (${formatMoney(300)})`,
      risk: 'safe',
      effect: (state) => {
        if (state.money < 300) return { happiness: -2, message: 'Даже на рынке не хватает денег на одежду...' };
        return { money: -300, happiness: 2, addItem: 'clothes_market', message: 'Взял футболку с вещевого рынка — теперь можно показаться на людях.' };
      },
    },
    {
      label: 'Взять обноски бесплатно',
      trait: 'cautious',
      risk: 'safe',
      effect: () => ({ reputation: -3, happiness: -3, addItem: 'clothes_market', message: 'Донашиваешь чужие обноски — стыдно, зато не с голым торсом.' }),
    },
  ],
};

function pickNextEvent(state) {
  if (state.jailed) return JAIL_EVENT;
  if (!hasClothes(state)) return CLOTHES_EVENT;
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
  if (result.addItem) state.inventory[result.addItem] = (state.inventory[result.addItem] || 0) + 1;
  if (result.jail) { state.jailed = true; state.jailTurns = 0; }

  if (choice.trait && state.traits[choice.trait] !== undefined) {
    state.traits[choice.trait] += 1;
  }

  const EXEMPT_FROM_HISTORY = ['__forced_rest__', 'hand_pantry_empty', '__jailed__', '__no_clothes__'];
  if (EXEMPT_FROM_HISTORY.indexOf(event.id) === -1) state.usedEventIds.add(event.id);
  state.turn += 1;

  // энергия сама почти не восстанавливается — без нормального сна и отдыха
  // силы будут заканчиваться по-настоящему, а не бесконечно тлеть на автопилоте
  state.energy = clampNum(state.energy + 1, 0, 100);
  if (hasCarItem(state)) state.energy = clampNum(state.energy + 1, 0, 100); // своя машина экономит силы и время
  if (state.happiness > 60) state.health = clampNum(state.health + 1, 0, 100);
  if (state.turn % 2 === 0) {
    // регулярные визиты к врачу останавливают старение — можно жить бесконечно
    if (state.doctorCharges > 0) {
      state.doctorCharges -= 1;
    } else {
      state.age += 1;
    }
  }

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

  // аренда со "лишней" недвижимости капает каждый ход
  let rentMessage = '';
  const rent = computeRentalIncome(state);
  if (rent > 0) {
    state.money += rent;
    rentMessage = `🏠 Доход от аренды: +${formatMoney(rent)}.`;
  }

  // репутация не копится вечно сама по себе — её нужно поддерживать
  let reputationDecayMessage = '';
  if (state.turn % 3 === 0 && state.reputation > 0) {
    state.reputation = clampNum(state.reputation - 1, 0, 100);
    reputationDecayMessage = '⭐ Репутация слегка поблёкла без новых поводов её подтверждать.';
  }

  const { tierChanged, barrierMessage } = applyTierBarrier(state);

  if (result.bankrupt) {
    state.ended = true;
    state.endingType = 'bankrupt';
  } else if (state.health <= 0) {
    state.ended = true;
    state.endingType = 'death';
  } else if (state.money <= AUTO_BANKRUPT_THRESHOLD) {
    state.ended = true;
    state.endingType = 'bankrupt';
  } else if (state.age >= MAX_AGE) {
    state.ended = true;
    state.endingType = 'lifeEnd';
  } else if (state.turn >= MAX_TURNS) {
    state.ended = true;
    state.endingType = 'timeUp';
  }

  return {
    message: result.message || '',
    interestMessage: [barrierMessage, interestMessage, pantryMessage, rentMessage, reputationDecayMessage].filter(Boolean).join(' '),
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
  const tier = getTier(computeEffectiveWealth(state));
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
