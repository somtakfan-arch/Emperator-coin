/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Банк событий. Собирается из "шаблонных семей" (комбинации
   сценарий × вариант) и набора авторских событий, 400+.

   Принципы:
   - Игрок ВСЕГДА видит точную сумму сделки до выбора (текст и
     подписи кнопок считают её той же формулой, что и эффект —
     формула детерминирована от state.money, поэтому число не
     "врёт").
   - НИКАКОЙ удачи: исход любого выбора — детерминированная функция
     характеристик игрока (репутация, здоровье, энергия, накопленные
     черты характера). Одно и то же решение при одних и тех же
     характеристиках всегда даёт один и тот же результат — не
     подбрасывается ни одна монетка.
   - Игра помнит крупные покупки (телефон/куртка/мебель) и запас
     еды (state.pantry) — события учитывают это в тексте.

   Каждый выбор может нести:
   - trait: ключ черты характера, которая копится в state.traits
   - risk: 'safe' | 'risky' | 'balanced' — подсказка о характере риска
   ========================================================= */

(function () {
  const COST_BASE = [700, 3500, 18000, 85000];

  const always = () => true;
  const isHomelessOrPoor = (s) => s.tier === 'homeless' || s.tier === 'poor';
  const isRichPlus = (s) => s.tier === 'rich' || s.tier === 'millionaire';
  const luxuryGate = (s) => isRichPlus(s) && s.reputation >= 25;
  const isBusinessy = (s) => s.money > 80000 || /владел|основател|директор|риелтор|предпринимат|стартап/i.test(s.job);
  const businessGate = (s) => isBusinessy(s) && s.reputation >= 20;
  const hasFamilyFn = (s) => s.hasFamily;
  const hasJobFn = (s) => s.hasJob;
  const hasBossFn = (s) => s.hasJob && s.hasBoss;
  const selfEmployedFn = (s) => s.hasJob && !s.hasBoss;
  const noJobFn = (s) => !s.hasJob;
  const hasAllergyFn = (s) => !s.allergyNone;
  const traitCap = (state, key, max) => Math.min((state.traits && state.traits[key]) || 0, max);
  const ownsCategoryFn = (s, category) => Object.keys(s.inventory || {}).some((id) => { const it = window.ITEMS.byId[id]; return it && it.category === category && (s.inventory[id] || 0) > 0; });
  const hasCarFn = (s) => ownsCategoryFn(s, 'cars');
  const hasElectronicsFn = (s) => ownsCategoryFn(s, 'electronics');
  const GOOD_CLOTHES_THRESHOLD = 15000;
  const hasGoodClothesFn = (s) => Object.keys(s.inventory || {}).some((id) => { const it = window.ITEMS.byId[id]; return it && it.category === 'clothes' && it.price >= GOOD_CLOTHES_THRESHOLD && (s.inventory[id] || 0) > 0; });
  const richEventGate = (s) => hasGoodClothesFn(s) && s.reputation >= 20;

  /* ---------- детерминированные пороги вместо удачи ---------- */
  // Никакого Math.random() в исходах: результат каждого выбора зависит
  // только от текущих характеристик персонажа.
  const repOk = (state, threshold) => state.reputation >= threshold;
  const healthOk = (state, threshold) => state.health >= threshold;
  const energyOk = (state, threshold) => state.energy >= threshold;
  const traitOk = (state, key, threshold) => traitCap(state, key, 10) >= threshold;
  // масштаб награды/тяжести исхода — плавно зависит от характеристики, без броска кубика
  const scaleByStat = (statValue, statMax, min, max) => min + (max - min) * clampNum(statValue / statMax, 0, 1);
  // если событие несёт мини-игру, её реальный результат важнее статичного порога
  const miniSuccess = (state, fallback) => (state._miniGameSuccess !== undefined ? state._miniGameSuccess : fallback);

  /* ---------- строители семей событий ---------- */

  function resolveDynamic(value, state, a1, j) {
    return typeof value === 'function' ? value(state, a1, j) : value;
  }

  function buildCostTierFamily(id, axis1, textFn, choiceA, choiceB, conditionFn) {
    const events = [];
    axis1.forEach((a1, i) => {
      for (let j = 0; j < 4; j++) {
        events.push({
          id: `${id}_${i}_${j}`,
          text: (state) => textFn(a1, j, state),
          conditions: conditionFn || always,
          choices: [
            { label: (state) => resolveDynamic(choiceA.label, state, a1, j), trait: choiceA.trait, risk: choiceA.risk, minigame: choiceA.minigame ? (state) => resolveDynamic(choiceA.minigame, state, a1, j) : undefined, effect: (state) => choiceA.effect(state, a1, j) },
            { label: (state) => resolveDynamic(choiceB.label, state, a1, j), trait: choiceB.trait, risk: choiceB.risk, minigame: choiceB.minigame ? (state) => resolveDynamic(choiceB.minigame, state, a1, j) : undefined, effect: (state) => choiceB.effect(state, a1, j) },
          ],
        });
      }
    });
    return events;
  }

  function buildFlavorFamily(id, scenarios, flavors, conditionFn) {
    const events = [];
    scenarios.forEach((sc, i) => {
      flavors.forEach((fl, j) => {
        events.push({
          id: `${id}_${i}_${j}`,
          text: (state) => sc.text(fl, state),
          conditions: conditionFn || always,
          choices: sc.choices.map((c) => ({
            label: (state) => (typeof c.label === 'function' ? c.label(fl, state) : c.label),
            trait: c.trait,
            risk: c.risk,
            minigame: c.minigame ? (state) => (typeof c.minigame === 'function' ? c.minigame(fl, state) : c.minigame) : undefined,
            effect: (state) => c.effect(state, fl),
          })),
        });
      });
    });
    return events;
  }

  function costOrEndure(statKey, gainBase, energyThreshold, badBase, costLabelPrefix, endureLabelPrefix) {
    return {
      costLabel: (state, a1, j) => `${costLabelPrefix} (${formatMoney(scaleByWealth(state, COST_BASE[j]))})`,
      endureLabel: (state, a1, j) => `${endureLabelPrefix} (сэкономишь ~${formatMoney(scaleByWealth(state, COST_BASE[j] * 0.15))}, нужен запас энергии)`,
      cost: (state, a1, j) => {
        const cost = scaleByWealth(state, COST_BASE[j]);
        const r = { money: -cost, happiness: 3, message: `Потратил ${formatMoney(cost)} — вопрос закрыт.` };
        r[statKey] = (r[statKey] || 0) + gainBase + j * 2;
        return r;
      },
      endure: (state, a1, j) => {
        if (!energyOk(state, energyThreshold)) {
          const hit = badBase + j * 3;
          const r = { happiness: -6, message: 'Сил не хватило, чтобы разобраться своими руками — экономия вышла боком.' };
          r[statKey] = (r[statKey] || 0) - hit;
          return r;
        }
        const saved = scaleByWealth(state, COST_BASE[j] * 0.15);
        return { money: saved, happiness: -1, message: `Энергии хватило, чтобы обойтись своими силами — сэкономил ${formatMoney(saved)}.` };
      },
    };
  }

  /* ============ 1. COST-TIER СЕМЬИ (8 × 24 = 192) ============ */

  const invest = buildCostTierFamily(
    'invest',
    ['акции стартапа знакомого', 'новую нашумевшую криптовалюту', 'франшизу кофейни у метро', 'паевой инвестиционный фонд', 'форекс-счёт у знакомого трейдера', 'долю в бизнесе одноклассника'],
    (a1, j, state) => `Знакомый предлагает вложить ${formatMoney(scaleByWealth(state, COST_BASE[j]))} в ${a1}. Обещает быструю прибыль.`,
    {
      label: (state, a1, j) => `Вложить ${formatMoney(scaleByWealth(state, COST_BASE[j]))}`,
      trait: 'riskTaker',
      risk: 'risky',
      minigame: (state, a1, j) => ({
        type: 'timing',
        title: 'Поймай момент для сделки',
        instructions: 'Цена ходит туда-сюда по шкале. Останови её точно в зелёной зоне, чтобы зайти в сделку по выгодной цене.',
        winText: 'Вошёл в сделку в идеальный момент!',
        loseText: 'Промахнулся мимо нужного момента входа.',
        params: {
          period: 1600 - j * 150,
          zoneCenter: 0.5,
          zoneWidth: scaleByStat(state.reputation, 100, 0.14, 0.34),
          timeLimit: 6000,
        },
      }),
      effect: (state, a1, j) => {
        const cost = scaleByWealth(state, COST_BASE[j]);
        const skill = state.reputation + traitCap(state, 'riskTaker', 8) * 4;
        if (miniSuccess(state, skill >= 55 + j * 10)) {
          const mult = scaleByStat(skill, 130, 1.2, 2.6);
          const payout = Math.round(cost * mult);
          return { money: payout - cost, happiness: 8, reputation: 2, message: `Точный вход в сделку! Чистая прибыль — ${formatMoney(payout - cost)}.` };
        }
        return { money: -cost, happiness: -10, message: `Момент был выбран неверно. Инвестиция прогорела, потеряно ${formatMoney(cost)}.` };
      },
    },
    { label: 'Отказаться, слишком рискованно', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -1, message: 'Ты решил не рисковать и остался при своих.' }) }
  );

  const CHEAP_PLACE = ['рынке у дяди Бори', 'секонд-хенде', 'руках по объявлению', 'соседней лавке без вывески'];
  const RELIABLE_PLACE = ['сетевом супермаркете «Пятёрочка»', 'фирменном магазине', 'официальном интернет-магазине', 'крупном сетевом гипермаркете'];
  const SHOP_ITEMS = ['продукты на неделю', 'зимнюю куртку', 'подарок близкому человеку', 'новый телефон', 'лекарства из списка врача', 'мебель для дома'];
  const POSSESSION_KEY = { 'зимнюю куртку': 'coat', 'новый телефон': 'phone', 'мебель для дома': 'furniture' };
  const POSSESSION_NOUN = { coat: 'куртка', phone: 'телефон', furniture: 'мебель' };
  const POSSESSION_PRONOUN = { coat: 'её', phone: 'его', furniture: 'её' };
  const POSSESSION_ADJ = { coat: 'новую', phone: 'новый', furniture: 'новую' };

  function shopIntro(a1, state) {
    if (a1 === 'продукты на неделю') {
      if (state.pantry <= 20) return 'Холодильник абсолютно пуст — пора срочно закупиться продуктами.';
      if (state.pantry >= 80) return 'Запасы еды и так в порядке, но лишний повод закупиться не помешает.';
      return 'Нужно купить продукты на неделю.';
    }
    const key = POSSESSION_KEY[a1];
    if (key && state.possessions.has(key)) {
      return `У тебя уже есть ${POSSESSION_NOUN[key]}, но появилась мысль обновить ${POSSESSION_PRONOUN[key]} на ${POSSESSION_ADJ[key]}.`;
    }
    return `Нужно купить ${a1}.`;
  }

  const shopping = buildCostTierFamily(
    'shopping',
    SHOP_ITEMS,
    (a1, j, state) => {
      const cheap = scaleByWealth(state, COST_BASE[j] * 0.35);
      const reliable = scaleByWealth(state, COST_BASE[j] * 0.55);
      return `${shopIntro(a1, state)} Можно сэкономить и поехать на ${CHEAP_PLACE[j]} (по слухам, около ${formatMoney(cheap)}), а можно переплатить и взять в ${RELIABLE_PLACE[j]} за ${formatMoney(reliable)}.`;
    },
    {
      label: (state, a1, j) => `Сэкономить (~${formatMoney(scaleByWealth(state, COST_BASE[j] * 0.35))})`,
      risk: 'risky',
      effect: (state, a1, j) => {
        const saved = scaleByWealth(state, COST_BASE[j] * 0.35);
        const key = POSSESSION_KEY[a1];
        const base = key ? { addPossession: key } : a1 === 'продукты на неделю' ? { pantrySet: 70 } : {};
        if (!repOk(state, 45)) {
          const healthHit = a1.includes('лекар') ? -14 : -5;
          return Object.assign({}, base, { money: -Math.round(saved * 0.3), health: healthHit, happiness: -5, message: 'Без нужных знакомств нарвался на некачественный товар, пришлось доплачивать за нормальный.' });
        }
        return Object.assign({}, base, { money: saved, happiness: 3, message: `Знаешь, к кому обращаться — сэкономил ${formatMoney(saved)}, всё пригодилось.` });
      },
    },
    {
      label: (state, a1, j) => `Купить в ${RELIABLE_PLACE[j]} за ${formatMoney(scaleByWealth(state, COST_BASE[j] * 0.55))}`,
      trait: 'cautious',
      risk: 'safe',
      effect: (state, a1, j) => {
        const cost = scaleByWealth(state, COST_BASE[j] * 0.55);
        const key = POSSESSION_KEY[a1];
        const base = key ? { addPossession: key } : a1 === 'продукты на неделю' ? { pantrySet: 100 } : {};
        return Object.assign({}, base, { money: -cost, happiness: 4, reputation: 1, message: `Купил без забот за ${formatMoney(cost)}.` });
      },
    }
  );

  const healthFx = costOrEndure('health', 10, 55, 8, 'Заняться здоровьем', 'Перетерпеть');
  const health = buildCostTierFamily(
    'health',
    ['У тебя простуда, которая не проходит уже неделю.', 'Тебя замучила бессонница и хроническая усталость.', 'К тебе подступает эмоциональное выгорание на работе.', 'Ты потянул(а) спину, поднимая тяжёлое.', 'Уже давно пора сделать плановый осмотр у врача.', 'У тебя разболелся зуб — терпеть больше нет сил.'],
    (a1, j, state) => `${a1} Визит к врачу обойдётся примерно в ${formatMoney(scaleByWealth(state, COST_BASE[j]))}. Заняться этим сейчас или перетерпеть?`,
    { label: healthFx.costLabel, risk: 'safe', effect: healthFx.cost },
    { label: healthFx.endureLabel, trait: 'cautious', risk: 'risky', effect: healthFx.endure }
  );

  const housingFx = costOrEndure('happiness', 6, 45, 10, 'Вызвать мастера', 'Сделать на скорую руку');
  const housing = buildCostTierFamily(
    'housing',
    ['потекла крыша после сильного дождя', 'сосед сверху устроил потоп в квартире', 'хозяин жилья резко поднял плату', 'управляющая компания требует оплатить капремонт', 'сломались холодильник и стиральная машина разом', 'нужно срочно менять проводку, пока не случился пожар'],
    (a1, j, state) => `Дома беда: ${a1}. Нормальное решение вопроса обойдётся в ${formatMoney(scaleByWealth(state, COST_BASE[j]))}. Решать сейчас или тянуть время?`,
    { label: housingFx.costLabel, risk: 'safe', effect: housingFx.cost },
    { label: housingFx.endureLabel, trait: 'cautious', risk: 'risky', effect: housingFx.endure }
  );

  const transportFx = costOrEndure('energy', 6, 45, 10, 'Отдать в сервис', 'Перетерпеть неудобства');
  const transport = buildCostTierFamily(
    'transport',
    ['сломалась машина по дороге на работу', 'случилось небольшое ДТП не по твоей вине', 'эвакуатор увёз машину со штрафстоянки', 'пришёл штраф за нарушение ПДД', 'двигатель начал барахлить', 'лопнуло колесо прямо на трассе'],
    (a1, j, state) => `С транспортом беда: ${a1}. В сервисе называют цену ${formatMoney(scaleByWealth(state, COST_BASE[j]))}. Разобраться по-нормальному или потерпеть неудобства?`,
    { label: transportFx.costLabel, risk: 'safe', effect: transportFx.cost },
    { label: transportFx.endureLabel, trait: 'cautious', risk: 'risky', effect: transportFx.endure }
  );

  const selfdev = buildCostTierFamily(
    'selfdev',
    ['Тебе предложили курс английского языка.', 'У тебя появилась возможность поступить на MBA.', 'Абонемент в твой спортзал горит скидкой.', 'Психотерапевт посоветовал тебе пройти курс сессий.', 'Вышла книга-бестселлер о личных финансах, которая может пригодиться.', 'Знакомый коуч предлагает тебе менторство.'],
    (a1, j, state) => `${a1} Это будет стоить ${formatMoney(scaleByWealth(state, COST_BASE[j] * 0.7))}. Вложиться в себя?`,
    {
      label: (state, a1, j) => `Вложиться в себя (${formatMoney(scaleByWealth(state, COST_BASE[j] * 0.7))})`,
      trait: 'hardworker',
      risk: 'balanced',
      effect: (state, a1, j) => {
        const cost = scaleByWealth(state, COST_BASE[j] * 0.7);
        return { money: -cost, happiness: 6, reputation: 3, energy: -4, message: `Потратил ${formatMoney(cost)} на саморазвитие. Чувствуешь себя увереннее.` };
      },
    },
    { label: 'Не тратить время и деньги', trait: 'cautious', risk: 'safe', effect: () => ({ energy: 3, happiness: -2, message: 'Решил, что и так сойдёт.' }) }
  );

  const gambling = buildCostTierFamily(
    'gambling',
    ['Ты заглянул(а) в казино "всего на пять минут".', 'Друзья зовут поставить на футбольный матч.', 'Ты присел(а) за покерный стол с незнакомцами.', 'У метро продают лотерейные билеты, и один так и просится в руки.', 'На экране открыт сайт с онлайн-рулеткой.', 'На скачках объявили ставки, и азарт подначивает попробовать.'],
    (a1, j, state) => `${a1} На кону ${formatMoney(scaleByWealth(state, COST_BASE[j] * 0.5))}.`,
    {
      label: (state, a1, j) => `Рискнуть — ставка ${formatMoney(scaleByWealth(state, COST_BASE[j] * 0.5))}`,
      trait: 'riskTaker',
      risk: 'risky',
      minigame: (state, a1, j) => ({
        type: 'timing',
        title: 'Обыграй рулетку',
        instructions: 'Шарик крутится по кругу. Останови его точно на зелёном секторе, чтобы забрать банк.',
        winText: 'Точное попадание — банк твой!',
        loseText: 'Мимо — казино забирает ставку.',
        params: {
          period: 1000 - j * 80,
          zoneCenter: 0.5,
          zoneWidth: scaleByStat(traitCap(state, 'riskTaker', 10), 10, 0.08, 0.22),
          timeLimit: 5000,
        },
      }),
      effect: (state, a1, j) => {
        const stake = scaleByWealth(state, COST_BASE[j] * 0.5);
        // казино не обыграть удачей — только точное попадание в мини-игре (или многолетний опыт, если игра пропущена)
        if (miniSuccess(state, traitOk(state, 'riskTaker', 8))) {
          const mult = scaleByStat(traitCap(state, 'riskTaker', 10), 10, 2, 4.2);
          const payout = Math.round(stake * mult);
          return { money: payout - stake, happiness: 12, message: `Точный удар — чистый выигрыш ${formatMoney(payout - stake)}.` };
        }
        return { money: -stake, happiness: -8, message: `Казино своих не отпускает — потеряно ${formatMoney(stake)}.` };
      },
    },
    { label: 'Уйти, не рискуя', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -1, message: 'Ты решил не искушать судьбу.' }) }
  );

  const business = buildCostTierFamily(
    'business',
    ['нанять ещё одного сотрудника', 'открыть филиал в новом районе', 'конкурент начал демпинговать цены', 'поставщик подвёл с крупной поставкой', 'нагрянула налоговая проверка', 'инвестор предлагает деньги за долю в деле'],
    (a1, j, state) => `По бизнесу вопрос: ${a1}. Масштабное решение обойдётся в ${formatMoney(scaleByWealth(state, COST_BASE[j] * 1.4))}.`,
    {
      label: (state, a1, j) => `Вложиться (${formatMoney(scaleByWealth(state, COST_BASE[j] * 1.4))})`,
      trait: 'riskTaker',
      risk: 'risky',
      minigame: (state, a1, j) => {
        const cost = scaleByWealth(state, COST_BASE[j] * 1.4);
        const correct = Math.round(cost * 1.2);
        const pool = [correct, Math.round(cost * 1.1), Math.round(cost * 1.3), Math.round(cost * 0.8)];
        const order = [[0, 1, 2, 3], [1, 3, 0, 2], [2, 0, 3, 1], [3, 2, 1, 0]][j % 4];
        const answers = order.map((idx) => ({ label: formatMoney(pool[idx]), correct: idx === 0 }));
        return {
          type: 'math',
          title: 'Прикинь окупаемость',
          instructions: 'Чтобы решение точно окупилось, нужно верно посчитать вложение с учётом 20% издержек.',
          winText: 'Расчёт верный — можно действовать.',
          loseText: 'Ошибка в расчётах дорого обошлась.',
          params: { question: `${formatMoney(cost)} + 20% издержек = ?`, answers, timeLimit: 9000 },
        };
      },
      effect: (state, a1, j) => {
        const cost = scaleByWealth(state, COST_BASE[j] * 1.4);
        const skill = state.reputation + traitCap(state, 'riskTaker', 8) * 3 + traitCap(state, 'hardworker', 8) * 3;
        if (miniSuccess(state, skill >= 75 + j * 8)) {
          const mult = scaleByStat(skill, 150, 1.2, 2.5);
          const profit = Math.round(cost * mult);
          return { money: profit - cost, reputation: 4, message: `Расчёт оказался верным! Чистая прибыль — ${formatMoney(profit - cost)}.` };
        }
        return { money: -cost, happiness: -6, message: `Просчёт в цифрах — решение не сработало, потеряно ${formatMoney(cost)}.` };
      },
    },
    {
      label: 'Сыграть осторожно',
      trait: 'cautious',
      risk: 'safe',
      effect: (state, a1, j) => {
        const saved = scaleByWealth(state, COST_BASE[j] * 0.2);
        return { money: Math.round(saved * 0.2), happiness: -2, reputation: -1, message: 'Ты не стал рисковать, но и не вырос.' };
      },
    },
    businessGate
  );

  /* ============ 2. FLAVOR-СЕМЬИ (8 × 24 = 192) ============ */

  const survival = buildFlavorFamily(
    'survival',
    [
      { text: (fl) => `Ты нашёл у ${fl} почти нетронутую еду в мусорном баке. Есть или пройти мимо?`, choices: [
        { label: 'Съесть, голод не тётка', risk: 'risky', effect: (state) => (healthOk(state, 45) ? { health: 6, happiness: 4, message: 'Крепкий организм справился — обошлось, и даже сытно.' } : { health: -18, happiness: -6, message: 'Организм и так на пределе — отравление. Пришлось тяжело.' }) },
        { label: 'Пройти мимо', risk: 'safe', effect: () => ({ happiness: -3, message: 'Голод остался, зато безопасно.' }) },
      ]},
      { text: (fl) => `Мужчина у ${fl} предлагает разгрузить машину за пару часов и заплатить наличными.`, choices: [
        { label: (fl, state) => `Согласиться поработать (~${formatMoney(scaleByWealth(state, 1200))})`, trait: 'hardworker', risk: 'balanced', effect: (state) => { const pay = scaleByWealth(state, 1200); return { money: pay, energy: -20, health: -3, message: `Заработал ${formatMoney(pay)}, но вымотался.` }; } },
        { label: 'Отказаться, выглядит подозрительно', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -1, message: 'Решил не рисковать понапрасну.' }) },
      ]},
      { text: (fl) => `Охранник у ${fl} требует, чтобы ты ушёл, иначе вызовет полицию.`, choices: [
        { label: 'Уйти без споров', risk: 'safe', effect: () => ({ energy: -8, happiness: -2, message: 'Пришлось искать новое место.' }) },
        { label: 'Попытаться поспорить', risk: 'risky', effect: (state) => (repOk(state, 55) ? { happiness: 2, message: 'Держался уверенно — охранник махнул рукой и отстал.' } : { reputation: -6, happiness: -10, message: 'Вид был не самый убедительный — приехала полиция, разговор был неприятным.' }) },
      ]},
      { text: (fl) => `Волонтёры у ${fl} раздают горячий чай, еду и тёплые вещи.`, choices: [
        { label: 'Взять помощь', risk: 'safe', effect: () => ({ health: 10, happiness: 8, message: 'Стало немного легче.' }) },
        { label: 'Отказаться, гордость не позволяет', trait: 'cautious', risk: 'balanced', effect: () => ({ happiness: -4, reputation: 2, message: 'Тяжело, зато по-своему.' }) },
      ]},
      { text: (fl) => `Ночью у ${fl} резко похолодало, а укрыться нечем.`, choices: [
        { label: 'Искать любое укрытие', risk: 'risky', effect: (state) => (healthOk(state, 60) ? { health: -3, energy: -5, message: 'Запас здоровья позволил кое-как пережить холодную ночь.' } : { health: -15, message: 'Организм и так истощён — ночь выдалась тяжёлой, здоровье подкосило.' }) },
        { label: 'Не спать и двигаться всю ночь', risk: 'balanced', effect: () => ({ energy: -25, health: -2, message: 'Не замёрз, но вымотался в ноль.' }) },
      ]},
      { text: (fl) => `Пока ты отдыхал у ${fl}, кто-то рылся в твоих вещах.`, choices: [
        { label: 'Броситься проверять и разбираться', risk: 'balanced', effect: (state) => { if (energyOk(state, 50)) return { happiness: -2, message: 'Сил хватило среагировать быстро — успел, ничего не пропало.' }; const loss = scaleByWealth(state, 300); return { money: -loss, happiness: -8, message: `Слишком вымотан, чтобы среагировать вовремя — пропали последние ${formatMoney(loss)}.` }; } },
        { label: 'Смириться, что бы ни было', risk: 'safe', effect: () => ({ happiness: -5, message: 'Что случилось, то случилось.' }) },
      ]},
    ],
    ['вокзала', 'торгового центра', 'центрального рынка', 'заброшенной стройки'],
    isHomelessOrPoor
  );

  const luxury = buildFlavorFamily(
    'luxury',
    [
      { text: (fl, state) => `На аукционе ${fl} подначивает тебя сделать ставку ${formatMoney(scaleByWealth(state, 60000))} на редкую картину.`, choices: [
        { label: (fl, state) => `Сделать ставку ${formatMoney(scaleByWealth(state, 60000))}`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 60000); return repOk(state, 60) ? { money: -cost, happiness: 14, reputation: 6, message: `Знакомые оценщики подсказали верный момент — картина твоя за ${formatMoney(cost)}! Все восхищены.` } : { money: -Math.round(cost * 1.3), happiness: -6, message: 'Без нужных связей в этом мире ты явно переплатил в азарте торгов.' }; } },
        { label: 'Остаться зрителем', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -1, message: 'Может, и к лучшему.' }) },
      ]},
      { text: (fl, state) => `${cap(fl)} просит внести взнос ${formatMoney(scaleByWealth(state, 40000))} на благотворительном балу.`, choices: [
        { label: (fl, state) => `Внести ${formatMoney(scaleByWealth(state, 40000))}`, risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 40000); return { money: -cost, reputation: 8, happiness: 6, message: `Пожертвовал ${formatMoney(cost)}. Пресса это заметила.` }; } },
        { label: (fl, state) => `Отделаться символической суммой (${formatMoney(scaleByWealth(state, 3000))})`, trait: 'cautious', risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 3000); return { money: -cost, reputation: -2, message: 'Скромный взнос заметили — не в лучшую сторону.' }; } },
      ]},
      { text: (fl, state) => `Брокер яхт даёт тебе и ${fl} шанс купить яхту со скидкой прямо сейчас — за ${formatMoney(scaleByWealth(state, 300000))}.`, choices: [
        { label: (fl, state) => `Купить яхту (${formatMoney(scaleByWealth(state, 300000))})`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 300000); return { money: -cost, happiness: 20, reputation: 5, message: `Теперь у тебя есть яхта! Потрачено ${formatMoney(cost)}.` }; } },
        { label: 'Отказаться, слишком спонтанно', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -2, message: 'Скидка сгорела, зато деньги целы.' }) },
      ]},
      { text: (fl, state) => `${cap(fl)} зовёт инвестировать ${formatMoney(scaleByWealth(state, 120000))} в футбольный клуб.`, choices: [
        { label: (fl, state) => `Инвестировать ${formatMoney(scaleByWealth(state, 120000))}`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 120000); const skill = state.reputation + traitCap(state, 'riskTaker', 8) * 3; if (skill >= 65) { const mult = scaleByStat(skill, 130, 1.5, 3); return { money: Math.round(cost * mult) - cost, reputation: 5, message: 'Клуб взлетел в лиге, вложение окупилось с лихвой!' }; } return { money: -cost, happiness: -8, message: 'Клуб вылетел из лиги, деньги пропали.' }; } },
        { label: 'Отказаться', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -1, message: 'Футбол — это не про инвестиции.' }) },
      ]},
      { text: (fl, state) => `Тебя поймали папарацци в неловкой ситуации. ${cap(fl)} советует нанять пиарщика за ${formatMoney(scaleByWealth(state, 25000))}.`, choices: [
        { label: (fl, state) => `Нанять пиарщика (${formatMoney(scaleByWealth(state, 25000))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 25000); return { money: -cost, reputation: 10, message: 'Репутация спасена, скандал замят.' }; } },
        { label: 'Проигнорировать', risk: 'risky', effect: (state) => (repOk(state, 45) ? { happiness: 2, message: 'Прочная репутация выдержала — всё само собой утихло.' } : { reputation: -12, happiness: -8, message: 'Слабая репутация не спасла — скандал разросся в прессе.' }) },
      ]},
      { text: (fl, state) => `${cap(fl)} предлагает арендовать частный остров на сезон за ${formatMoney(scaleByWealth(state, 200000))}.`, choices: [
        { label: (fl, state) => `Арендовать остров (${formatMoney(scaleByWealth(state, 200000))})`, risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 200000); return { money: -cost, happiness: 22, energy: 15, message: `Незабываемый отдых обошёлся в ${formatMoney(cost)}.` }; } },
        { label: (fl, state) => `Отказаться, вложить ${formatMoney(scaleByWealth(state, 15000))} в дело`, trait: 'hardworker', risk: 'safe', effect: (state) => { const gain = scaleByWealth(state, 15000); return { money: gain, happiness: -3, message: 'Ты предпочёл выгоду отдыху.' }; } },
      ]},
    ],
    ['старый деловой партнёр', 'светская знакомая', 'настойчивый папарацци', 'конкурент по бизнесу'],
    luxuryGate
  );

  const family = buildFlavorFamily(
    'family',
    [
      { text: (fl, state) => `${cap(fl)} просит купить дорогую вещь, о которой давно мечтал(а) — это ${formatMoney(scaleByWealth(state, 5000))}.`, choices: [
        { label: (fl, state) => `Исполнить мечту (${formatMoney(scaleByWealth(state, 5000))})`, trait: 'familyFirst', risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 5000); return { money: -cost, happiness: 10, reputation: 2, message: `Потратил ${formatMoney(cost)}, зато сколько радости.` }; } },
        { label: 'Объяснить, что сейчас не время', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -6, message: 'Пришлось разочаровать близкого человека.' }) },
      ]},
      { text: (fl) => `${cap(fl)} предлагает переехать в другой город ради новой жизни.`, choices: [
        { label: (fl, state) => `Согласиться на переезд (~${formatMoney(scaleByWealth(state, 8000))})`, trait: 'familyFirst', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 8000); return traitOk(state, 'familyFirst', 2) ? { money: -cost, happiness: 12, energy: -10, message: 'Крепкая семья помогла пережить переезд легко — оказался лучшим решением!' } : { money: -Math.round(cost * 1.5), happiness: -6, energy: -15, message: 'Без сплочённости в семье переезд дался тяжело и дорого.' }; } },
        { label: 'Остаться на месте', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -4, message: 'Привычная жизнь продолжается.' }) },
      ]},
      { text: (fl, state) => `${cap(fl)} просит одолжить ${formatMoney(scaleByWealth(state, 10000))} без гарантии возврата.`, choices: [
        { label: (fl, state) => `Дать в долг ${formatMoney(scaleByWealth(state, 10000))}`, trait: 'familyFirst', risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 10000); return { money: -cost, happiness: 5, reputation: 2, message: `Дал ${formatMoney(cost)}. Семья это оценила.` }; } },
        { label: 'Отказать', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -7, reputation: -2, message: 'В семье повисло неловкое молчание.' }) },
      ]},
      { text: (fl, state) => `Внезапно нагрянул семейный праздник, и все ждут, что ты организуешь его за ${formatMoney(scaleByWealth(state, 4000))}.`, choices: [
        { label: (fl, state) => `Устроить настоящий праздник (${formatMoney(scaleByWealth(state, 4000))})`, trait: 'familyFirst', risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 4000); return { money: -cost, happiness: 14, message: `Праздник удался! Потрачено ${formatMoney(cost)}.` }; } },
        { label: 'Отметить скромно', risk: 'safe', effect: () => ({ happiness: 2, message: 'Скромно, но по-домашнему тепло.' }) },
      ]},
      { text: () => `Из-за денег в семье вспыхнула серьёзная ссора.`, choices: [
        { label: 'Пойти на компромисс', trait: 'familyFirst', risk: 'safe', effect: () => ({ happiness: 4, energy: -6, message: 'Удалось всех помирить.' }) },
        { label: 'Стоять на своём', risk: 'risky', effect: () => ({ happiness: -8, reputation: -2, message: 'Ссора надолго испортила настроение в доме.' }) },
      ]},
      { text: (fl, state) => `${cap(fl)} тяжело заболел(а). Лечение стоит ${formatMoney(scaleByWealth(state, 25000))}.`, choices: [
        { label: (fl, state) => `Оплатить лечение (${formatMoney(scaleByWealth(state, 25000))})`, trait: 'familyFirst', risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 25000); return { money: -cost, happiness: 8, health: -2, message: `Заплатил ${formatMoney(cost)} за лечение. Здоровье близкого важнее денег.` }; } },
        { label: 'Искать бесплатные варианты лечения', trait: 'cautious', risk: 'risky', effect: () => ({ happiness: -10, energy: -10, message: 'Пришлось потратить много нервов и времени.' }) },
      ]},
    ],
    ['супруг(а)', 'ребёнок', 'родитель', 'дальний родственник'],
    hasFamilyFn
  );

  const crime = buildFlavorFamily(
    'crime',
    [
      { text: (fl, state) => `${cap(fl)} предлагает перевезти "посылку" за ${formatMoney(scaleByWealth(state, 15000))}, не задавая вопросов.`, choices: [
        { label: (fl, state) => `Согласиться за ${formatMoney(scaleByWealth(state, 15000))}`, trait: 'shady', risk: 'risky', minigame: () => ({
            type: 'timing',
            title: 'Проезжай мимо поста незаметно',
            instructions: 'Останови маркер точно в зелёной зоне — не раньше и не позже.',
            winText: 'Проскочил идеально, никто не заметил.',
            loseText: 'Среагировал не вовремя — попался.',
            params: { period: 1100, zoneCenter: 0.5, zoneWidth: 0.22, timeLimit: 5000 },
          }), effect: (state) => { const pay = scaleByWealth(state, 15000); return miniSuccess(state, traitOk(state, 'shady', 2)) ? { money: pay, happiness: -4, message: `Провернул всё чисто — дело сделано, получено ${formatMoney(pay)}.` } : { jail: true, message: 'Не среагировал вовремя. Тебя задержали с поличным.' }; } },
        { label: 'Отказаться', trait: 'cautious', risk: 'safe', effect: () => ({ reputation: 2, message: 'Мало ли что там было в этой посылке.' }) },
      ]},
      { text: (fl) => `${cap(fl)} зовёт поучаствовать в схеме, похожей на финансовую пирамиду.`, choices: [
        { label: (fl, state) => `Войти в схему (${formatMoney(scaleByWealth(state, 10000))})`, trait: 'shady', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 10000); return traitOk(state, 'shady', 3) ? { money: Math.round(cost * 0.5), message: 'Опыт подсказал, когда пора выходить — успел вовремя, заработав немного.' } : { money: -cost, reputation: -4, happiness: -8, message: 'Пирамида рухнула раньше, чем ты сообразил выйти — деньги пропали.' }; } },
        { label: 'Отказаться', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 1, message: 'Обошёл стороной сомнительную схему.' }) },
      ]},
      { text: (fl, state) => `${cap(fl)} намекает, что взятка ${formatMoney(scaleByWealth(state, 8000))} решит все проблемы с проверкой.`, choices: [
        { label: (fl, state) => `Дать взятку ${formatMoney(scaleByWealth(state, 8000))}`, trait: 'shady', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 8000); return traitOk(state, 'shady', 1) ? { money: -cost, energy: 5, message: 'Знаешь, как такие вопросы решаются — проблема решена быстро и тихо.' } : { jail: true, message: 'Слишком неопытно подошёл к делу. Разговор записывали — взятка обернулась уголовным делом.' }; } },
        { label: 'Решить вопрос по правилам', trait: 'cautious', risk: 'safe', effect: () => ({ energy: -10, happiness: -2, message: 'Дольше, зато чисто.' }) },
      ]},
      { text: (fl) => `${cap(fl)} рассказывает способ вообще не платить налоги.`, choices: [
        { label: (fl, state) => `Воспользоваться схемой (экономия ${formatMoney(scaleByWealth(state, 20000))})`, trait: 'shady', risk: 'risky', effect: (state) => { const save = scaleByWealth(state, 20000); return traitOk(state, 'shady', 2) ? { money: save, message: `Схема отработана до мелочей — сэкономил на налогах ${formatMoney(save)}.` } : { jail: true, message: 'Схема была слишком грубой. Налоговая докопалась — дело дошло до суда.' }; } },
        { label: 'Платить честно', trait: 'cautious', risk: 'safe', effect: () => ({ reputation: 3, message: 'Спокойный сон дороже сомнительной экономии.' }) },
      ]},
      { text: (fl) => `${cap(fl)} предлагает заработать на продаже чужих личных данных.`, choices: [
        { label: (fl, state) => `Согласиться за ${formatMoney(scaleByWealth(state, 12000))}`, trait: 'shady', risk: 'risky', effect: (state) => { const pay = scaleByWealth(state, 12000); return traitOk(state, 'shady', 3) ? { money: pay, happiness: -6, message: `Замёл цифровые следы как надо — получил ${formatMoney(pay)}, но чувствуешь себя мерзко.` } : { jail: true, message: 'Цифровой след остался на видном месте. Тебя вычислили.' }; } },
        { label: 'Отказаться', trait: 'cautious', risk: 'safe', effect: () => ({ reputation: 3, message: 'Некоторые вещи не продаются.' }) },
      ]},
      { text: (fl, state) => `${cap(fl)} предлагает подделать документы ради кредита на ${formatMoney(scaleByWealth(state, 30000))}.`, choices: [
        { label: (fl, state) => `Подделать документы (${formatMoney(scaleByWealth(state, 30000))})`, trait: 'shady', risk: 'risky', effect: (state) => { const gain = scaleByWealth(state, 30000); return traitOk(state, 'shady', 2) ? { money: gain, message: `Подделка выполнена мастерски — кредит одобрен, получено ${formatMoney(gain)}.` } : { jail: true, message: 'Банк заметил нестыковки и передал дело в полицию.' }; } },
        { label: 'Отказаться и жить по средствам', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 1, message: 'Меньше денег, зато меньше рисков.' }) },
      ]},
    ],
    ['подозрительный тип в подворотне', 'старый знакомый с тёмным прошлым', 'аноним в мессенджере', 'деловой партнёр с сомнительной репутацией'],
    always
  );

  const weather = buildFlavorFamily(
    'weather',
    [
      { text: (fl, state) => `Ударил сильный мороз, и ${fl} начались перебои с отоплением. Обогреватель обойдётся в ${formatMoney(scaleByWealth(state, 2000))}.`, choices: [
        { label: (fl, state) => `Купить обогреватель (${formatMoney(scaleByWealth(state, 2000))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 2000); return { money: -cost, health: 2, message: `Потратился на обогреватель — ${formatMoney(cost)}.` }; } },
        { label: 'Терпеть холод', risk: 'risky', effect: () => ({ health: -8, happiness: -4, message: 'Пришлось померзнуть.' }) },
      ]},
      { text: (fl, state) => `Внезапное наводнение натворило бед ${fl}. Устранение последствий — ${formatMoney(scaleByWealth(state, 6000))}.`, choices: [
        { label: (fl, state) => `Устранить последствия (${formatMoney(scaleByWealth(state, 6000))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 6000); return { money: -cost, happiness: 2, message: `Устранил последствия за ${formatMoney(cost)}.` }; } },
        { label: 'Переждать и разобраться позже', risk: 'risky', effect: () => ({ happiness: -10, health: -4, message: 'Ущерб только увеличился.' }) },
      ]},
      { text: (fl, state) => `Стоит невыносимая жара и засуха ${fl}. Кондиционер и запас воды — ${formatMoney(scaleByWealth(state, 3000))}.`, choices: [
        { label: (fl, state) => `Купить кондиционер (${formatMoney(scaleByWealth(state, 3000))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 3000); return { money: -cost, health: 5, message: `Пережил жару с комфортом за ${formatMoney(cost)}.` }; } },
        { label: 'Терпеть жару', risk: 'risky', effect: () => ({ health: -6, energy: -10, message: 'Жара вымотала.' }) },
      ]},
      { text: (fl, state) => `Гроза повредила имущество ${fl}. Ремонт — ${formatMoney(scaleByWealth(state, 5000))}.`, choices: [
        { label: (fl, state) => `Починить (${formatMoney(scaleByWealth(state, 5000))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 5000); return { money: -cost, happiness: 3, message: `Ремонт обошёлся в ${formatMoney(cost)}.` }; } },
        { label: 'Оставить как есть', risk: 'risky', effect: () => ({ happiness: -6, message: 'Поломка так и осталась напоминанием о грозе.' }) },
      ]},
      { text: (fl, state) => `Из-за снегопада ${fl} на пару дней стало не выбраться из города. Закупиться заранее — ${formatMoney(scaleByWealth(state, 2500))}.`, choices: [
        { label: (fl, state) => `Закупиться заранее (${formatMoney(scaleByWealth(state, 2500))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 2500); return { money: -cost, happiness: 4, message: `Переждал с комфортом, потратив ${formatMoney(cost)}.` }; } },
        { label: 'Понадеяться, что пронесёт', risk: 'risky', effect: (state) => (state.pantry >= 30 ? { happiness: 1, message: 'Запасы дома выручили — обошлось, снег быстро убрали.' } : { health: -10, happiness: -8, message: 'Запасов дома не было — еда закончилась раньше, чем расчистили дороги.' }) },
      ]},
      { text: (fl, state) => `Прошёл ураган и наделал бед ${fl}. Восстановление сообща — ${formatMoney(scaleByWealth(state, 4000))} с твоей стороны.`, choices: [
        { label: (fl, state) => `Помочь и восстановить (${formatMoney(scaleByWealth(state, 4000))})`, risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 4000); return { money: -cost, reputation: 6, happiness: 6, message: `Все объединились, дело пошло быстрее. Потрачено ${formatMoney(cost)}.` }; } },
        { label: 'Разбираться в одиночку', risk: 'risky', effect: () => ({ energy: -15, happiness: -4, message: 'Пришлось тяжело, но справился сам.' }) },
      ]},
    ],
    ['в твоём районе', 'в центре города', 'в пригороде', 'там, где ты сейчас находишься'],
    always
  );

  const tech = buildFlavorFamily(
    'tech',
    [
      { text: (fl) => `О тебе неожиданно завирусился ролик ${fl}.`, choices: [
        { label: 'Использовать хайп с пользой', trait: 'riskTaker', risk: 'balanced', effect: (state) => { const gain = scaleByWealth(state, 4000); return { money: gain, reputation: 6, happiness: 8, message: `Известность принесла ${formatMoney(gain)}.` }; } },
        { label: 'Переждать в стороне', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -1, message: 'Хайп прошёл мимо, зато спокойно.' }) },
      ]},
      { text: (fl) => `Взломали твой аккаунт ${fl}.`, choices: [
        { label: (fl, state) => `Восстановить аккаунт (${formatMoney(scaleByWealth(state, 1000))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 1000); return { money: -cost, energy: -8, message: 'Аккаунт удалось спасти.' }; } },
        { label: 'Забить и завести новый', risk: 'risky', effect: () => ({ happiness: -6, reputation: -2, message: 'Часть контактов и репутации потеряна.' }) },
      ]},
      { text: (fl, state) => `Тебе предлагают дорогую подписку ${fl} за ${formatMoney(scaleByWealth(state, 5000))} с "гарантированным доходом".`, choices: [
        { label: (fl, state) => `Оформить за ${formatMoney(scaleByWealth(state, 5000))}`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 5000); return { money: -cost, happiness: -6, message: 'Классический развод на деньги — "гарантированный доход" не наступил.' }; } },
        { label: 'Не вестись', trait: 'cautious', risk: 'safe', effect: () => ({ reputation: 1, message: 'Бесплатный сыр бывает только в мышеловке.' }) },
      ]},
      { text: () => `Мошенники звонят и представляются службой безопасности банка.`, choices: [
        { label: 'Поверить и выполнить инструкции', risk: 'risky', effect: (state) => { const loss = scaleByWealth(state, 8000); return traitOk(state, 'cautious', 4) ? { happiness: -2, message: 'Прошлый опыт научил быть внимательнее — что-то насторожило, успел остановиться.' } : { money: -loss, happiness: -14, message: `Со счёта списали ${formatMoney(loss)}. Классическая схема мошенников.` }; } },
        { label: 'Положить трубку и перезвонить в банк напрямую', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 2, reputation: 1, message: 'Бдительность спасла деньги.' }) },
      ]},
      { text: () => `Криптокошелёк, который ты когда-то завёл ради интереса, внезапно подскочил в цене.`, choices: [
        { label: (fl, state) => `Продать всё сейчас (${formatMoney(scaleByWealth(state, 7000))})`, trait: 'cautious', risk: 'safe', effect: (state) => { const gain = scaleByWealth(state, 7000); return { money: gain, happiness: 9, message: `Зафиксировал прибыль — ${formatMoney(gain)}.` }; } },
        { label: 'Придержать, вдруг вырастет ещё', trait: 'riskTaker', risk: 'risky', effect: (state) => { if (traitOk(state, 'riskTaker', 5)) { const gain = scaleByWealth(state, 15000); return { money: gain, happiness: 12, message: 'Опытный взгляд на рынок не подвёл — цена выросла ещё больше!' }; } const loss = scaleByWealth(state, 6000); return { money: -loss, happiness: -8, message: 'Без нужного опыта на рынке цена рухнула обратно, часть прибыли потеряна.' }; } },
      ]},
      {
        text: (fl, state) => `Тебе предлагают купить рекламу на Wildberries за ${formatMoney(scaleByWealth(state, 25000))}, раз уж у тебя есть хоть какая-то аудитория и подработка на маркетплейсах.`,
        choices: [
          { label: (fl, state) => `Купить рекламу за ${formatMoney(scaleByWealth(state, 25000))} на Wildberries`, risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 25000); const mult = scaleByStat(state.reputation, 100, 0.7, 1.6); const gain = Math.round(cost * mult); return { money: gain - cost, reputation: -1, message: `Реклама на Wildberries обошлась в ${formatMoney(cost)} и принесла ${formatMoney(gain)} заказов.` }; } },
          { label: 'Отказаться, беречь бюджет и репутацию', risk: 'safe', effect: () => ({ reputation: 2, message: 'Аудитория оценила честность без рекламной накрутки.' }) },
        ],
      },
    ],
    ['в соцсети', 'на видеохостинге', 'в мессенджере', 'на маркетплейсе'],
    always
  );

  const general = buildFlavorFamily(
    'general',
    [
      { text: (fl) => `Ты встретил старого друга детства ${fl}.`, choices: [
        { label: (fl, state) => `Посидеть, вспомнить молодость (${formatMoney(scaleByWealth(state, 800))})`, risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 800); return { money: -cost, happiness: 10, message: 'Приятно провёл время, хоть и потратился.' }; } },
        { label: 'Коротко поздороваться и пойти дальше', risk: 'safe', effect: () => ({ happiness: 1, message: 'Дела не ждут.' }) },
      ]},
      { text: (fl) => `Ты нашёл забытый кем-то кошелёк ${fl}.`, choices: [
        { label: 'Вернуть владельцу', trait: 'familyFirst', risk: 'safe', effect: () => ({ reputation: 6, happiness: 6, message: 'Владелец был очень благодарен.' }) },
        { label: (fl, state) => `Оставить себе (~${formatMoney(scaleByWealth(state, 1500))})`, trait: 'shady', risk: 'risky', effect: (state) => { const gain = scaleByWealth(state, 1500); return { money: gain, happiness: -3, reputation: -2, message: `Забрал ${formatMoney(gain)}, но совесть немного гложет.` }; } },
      ]},
      { text: (fl) => `${cap(fl)} произошла авария — нужна помощь.`, choices: [
        { label: 'Остановиться и помочь', risk: 'safe', effect: () => ({ reputation: 5, energy: -10, happiness: 4, message: 'Ты сделал доброе дело.' }) },
        { label: 'Проехать мимо, не твоё дело', risk: 'safe', effect: () => ({ happiness: -3, message: 'Совесть немного покусывает.' }) },
      ]},
      { text: () => `Соседи устроили шумную вечеринку и мешают спать.`, choices: [
        { label: 'Пойти и попросить потише', risk: 'balanced', effect: (state) => (repOk(state, 45) ? { happiness: 3, message: 'С тобой разговаривают уважительно — соседи извинились и убавили звук.' } : { happiness: -6, reputation: -1, message: 'Разговор перешёл в ссору.' }) },
        { label: 'Терпеть в наушниках', risk: 'safe', effect: () => ({ energy: -10, message: 'Выспаться не удалось.' }) },
      ]},
      { text: () => `Сломалась важная техника дома.`, choices: [
        { label: (fl, state) => `Купить новую (${formatMoney(scaleByWealth(state, 6000))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 6000); return { money: -cost, happiness: 5, message: `Потратил ${formatMoney(cost)} на новую технику.` }; } },
        { label: 'Обходиться без неё', trait: 'cautious', risk: 'risky', effect: () => ({ happiness: -4, energy: -4, message: 'Неудобно, но пережить можно.' }) },
      ]},
      { text: () => `Тебя вызвали в суд в качестве присяжного заседателя.`, choices: [
        { label: 'Пойти и выполнить гражданский долг', risk: 'safe', effect: () => ({ reputation: 4, energy: -8, happiness: -2, message: 'Отнял день, зато поступил правильно.' }) },
        { label: 'Найти способ отказаться', trait: 'shady', risk: 'risky', effect: () => ({ happiness: 1, reputation: -2, message: 'Отвертелся, но осадок остался.' }) },
      ]},
    ],
    ['у вокзала', 'возле дома', 'в парке', 'в очереди в магазине'],
    always
  );

  const work = buildFlavorFamily(
    'work',
    [
      { text: (fl) => `Попросили остаться на сверхурочные без доплаты — а ты как раз работаешь ${fl}.`, choices: [
        { label: (fl, state) => `Согласиться (доплатят ~${formatMoney(scaleByWealth(state, 1000))})`, trait: 'hardworker', risk: 'balanced', effect: (state) => { const pay = scaleByWealth(state, 1000); return { energy: -15, money: pay, happiness: -4, message: 'Сделал, как просили. Вымотался, но кое-что заплатили.' }; } },
        { label: 'Отказаться и отстоять границы', risk: 'risky', effect: (state) => (repOk(state, 45) ? { reputation: 4, happiness: 5, message: 'Отстоял границы, начальство это оценило.' } : { reputation: -4, happiness: -5, message: 'Начальству это не понравилось.' }) },
      ]},
      { text: () => `Возник конфликт с коллегой из-за чужой ошибки в отчёте.`, choices: [
        { label: 'Доказать свою правоту', risk: 'risky', effect: (state) => (repOk(state, 50) ? { reputation: 5, happiness: 4, message: 'Справедливость восторжествовала — тебе поверили.' } : { reputation: -3, happiness: -6, message: 'Конфликт только усугубился.' }) },
        { label: 'Взять вину на себя ради мира', risk: 'safe', effect: () => ({ happiness: -5, reputation: -1, message: 'Тяжело, зато в коллективе спокойнее.' }) },
      ]},
      { text: () => `Зарплату задержали уже на две недели.`, choices: [
        { label: 'Требовать деньги немедленно', risk: 'balanced', effect: (state) => { if (repOk(state, 55)) { const pay = scaleByWealth(state, 3000); return { money: pay, reputation: 1, message: `Зарплату выбили — ${formatMoney(pay)}.` }; } return { reputation: -3, happiness: -6, message: 'Начальство пообещало "скоро", но пока тишина.' }; } },
        { label: 'Ждать молча', risk: 'safe', effect: () => ({ happiness: -8, message: 'Ожидание выматывает нервы.' }) },
      ]},
      { text: () => `Появилась возможность подработать в свой законный выходной.`, choices: [
        { label: (fl, state) => `Согласиться (${formatMoney(scaleByWealth(state, 2500))})`, trait: 'hardworker', risk: 'balanced', effect: (state) => { const pay = scaleByWealth(state, 2500); return { money: pay, energy: -18, message: `Заработал дополнительно ${formatMoney(pay)}.` }; } },
        { label: 'Отдохнуть', trait: 'cautious', risk: 'safe', effect: () => ({ energy: 15, happiness: 6, message: 'Отдых оказался важнее денег.' }) },
      ]},
      { text: () => `Начальство зовёт на корпоратив, где решаются важные вопросы.`, choices: [
        { label: (fl, state) => `Пойти и наладить связи (${formatMoney(scaleByWealth(state, 800))})`, risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 800); return { money: -cost, reputation: 5, happiness: 5, message: 'Вечер прошёл с пользой для карьеры.' }; } },
        { label: 'Пропустить, дела важнее', risk: 'safe', effect: () => ({ reputation: -2, energy: 5, message: 'Отдохнул дома, но карьерный момент упущен.' }) },
      ]},
      { text: (fl) => `Босс неожиданно вызывает тебя "на ковёр" и сообщает, что тебя увольняют. Работал ты ${fl}.`, choices: [
        { label: 'Устроить скандал', trait: 'riskTaker', risk: 'risky', effect: (state) => { if (repOk(state, 60)) { const pay = scaleByWealth(state, 4000); return { money: pay, reputation: -6, happiness: -6, jobLoss: true, message: `Твоё имя ещё имеет вес — скандал помог выбить компенсацию ${formatMoney(pay)}. Но работы больше нет.` }; } return { reputation: -8, happiness: -14, jobLoss: true, message: 'Скандал ничего не дал, только испортил репутацию.' }; } },
        { label: (fl, state) => `Молча уйти (расчёт ~${formatMoney(scaleByWealth(state, 1500))})`, trait: 'cautious', risk: 'safe', effect: (state) => { const pay = scaleByWealth(state, 1500); return { money: pay, happiness: -8, jobLoss: true, message: `Ушёл с достоинством, получив ${formatMoney(pay)} расчётных.` }; } },
        { label: 'Попросить дать второй шанс', trait: 'hardworker', risk: 'balanced', effect: (state) => (repOk(state, 60) ? { reputation: 3, happiness: 4, message: 'Твоя репутация сыграла в плюс — босс сжалился и дал ещё один шанс.' } : { happiness: -12, jobLoss: true, message: 'Босс был непреклонен — увольнение состоялось.' }) },
      ]},
    ],
    ['в офисе', 'на физически тяжёлой работе', 'в сфере обслуживания', 'в творческой профессии'],
    hasBossFn
  );

  const selfEmployed = buildFlavorFamily(
    'selfEmployed',
    [
      { text: (fl) => `Алгоритмы ${fl} внезапно поменялись, и охваты/поток клиентов резко просели.`, choices: [
        { label: (fl, state) => `Вложиться в продвижение (${formatMoney(scaleByWealth(state, 3500))})`, risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 3500); return repOk(state, 40) ? { money: -Math.round(cost * 0.3), reputation: 4, happiness: 4, message: 'Наработанные связи помогли быстро восстановить охваты.' } : { money: -cost, happiness: -4, message: 'Деньги потрачены, а эффект почти не заметен.' }; } },
        { label: 'Переждать без вложений', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -5, reputation: -1, message: 'Просело надолго, но бюджет цел.' }) },
      ]},
      { text: () => `Клиент задерживает оплату за уже сделанную работу.`, choices: [
        { label: 'Требовать оплату немедленно', risk: 'risky', effect: (state) => (repOk(state, 45) ? { money: scaleByWealth(state, 4000), message: 'Твоя репутация сыграла роль — клиент нашёл деньги и расплатился.' } : { reputation: -3, happiness: -6, message: 'Клиент обиделся и пропал вовсе без оплаты.' }) },
        { label: 'Договориться на отсрочку', risk: 'safe', effect: () => ({ happiness: -2, reputation: 1, message: 'Отношения сохранены, но касса подождёт.' }) },
      ]},
      { text: (fl) => `Конкурент ${fl} демпингует и переманивает твою аудиторию.`, choices: [
        { label: (fl, state) => `Снизить цены и побороться (−${formatMoney(scaleByWealth(state, 2500))} с дохода)`, risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 2500); return { money: -cost, reputation: 3, message: 'Клиентов удалось удержать, но маржа просела.' }; } },
        { label: 'Остаться при своих условиях', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -3, message: 'Часть аудитории всё же ушла к конкуренту.' }) },
      ]},
      { text: () => `Подвернулась возможность выступить на крупном мероприятии бесплатно, но с большой аудиторией.`, choices: [
        { label: 'Согласиться ради известности', trait: 'hardworker', risk: 'balanced', effect: () => ({ energy: -15, reputation: 7, happiness: 5, message: 'Известность выросла, хоть и без прямой оплаты.' }) },
        { label: 'Отказаться, время дороже', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 1, message: 'Занялся оплачиваемыми делами.' }) },
      ]},
      { text: (fl) => `${cap(fl)} на время заблокировали из-за жалобы недоброжелателей.`, choices: [
        { label: (fl, state) => `Оспорить и вернуть доступ (${formatMoney(scaleByWealth(state, 1500))})`, risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 1500); return repOk(state, 35) ? { money: -cost, happiness: 3, message: 'Репутация помогла — доступ восстановили быстрее, чем ожидал.' } : { money: -cost, happiness: -8, energy: -10, message: 'Разбирательство затянулось надолго.' }; } },
        { label: 'Переждать блокировку', risk: 'safe', effect: () => ({ happiness: -6, energy: -6, message: 'Доход встал на паузу, но нервы целее.' }) },
      ]},
      { text: () => `Партнёр по разовому проекту предлагает сотрудничество за процент от будущей прибыли вместо фиксированной оплаты.`, choices: [
        { label: 'Согласиться на процент', trait: 'riskTaker', risk: 'risky', effect: (state) => { const base = scaleByWealth(state, 6000); if (traitOk(state, 'riskTaker', 4)) { const mult = scaleByStat(traitCap(state, 'riskTaker', 10), 10, 1.5, 3); return { money: Math.round(base * mult), happiness: 8, message: 'Чутьё не подвело — проект выстрелил, процент оказался выгоднее ставки.' }; } return { money: 0, happiness: -4, message: 'Без должного опыта оценить проект не вышло — процент от нуля есть ноль.' }; } },
        { label: 'Настоять на фиксированной оплате', trait: 'cautious', risk: 'safe', effect: (state) => { const fixed = scaleByWealth(state, 4000); return { money: fixed, message: `Получил гарантированные ${formatMoney(fixed)}.` }; } },
      ]},
    ],
    ['в блоге', 'в твоём деле', 'в частной практике', 'в твоей нише'],
    selfEmployedFn
  );

  /* ============ 3. АВТОРСКИЕ СОБЫТИЯ (≈32) ============ */

  const HAND_EVENTS = [
    {
      id: 'hand_boris_shop',
      text: (state) => `Заканчиваются продукты${state.pantry <= 20 ? ' (холодильник почти пуст)' : ''}. У дяди Бори дешевле — примерно ${formatMoney(scaleByWealth(state, 500))}, но там вечно что-то с сроками годности. В "Пятёрочке" дороже — ${formatMoney(scaleByWealth(state, 900))}, зато надёжно.`,
      conditions: always,
      choices: [
        { label: (state) => `Идти к дяде Боре (~${formatMoney(scaleByWealth(state, 500))})`, risk: 'risky', effect: (state) => { const saved = scaleByWealth(state, 500); if (!traitOk(state, 'cautious', 2)) return { money: -Math.round(saved * 0.4), health: -8, pantrySet: 60, message: 'Не научился ещё разбираться в товаре — купил просрочку, потом было плохо.' }; return { money: saved, happiness: 2, pantrySet: 85, message: `Знаешь, что и как выбирать — сэкономил ${formatMoney(saved)}, дядя Боря сегодня в ударе.` }; } },
        { label: (state) => `Идти в "Пятёрочку" (${formatMoney(scaleByWealth(state, 900))})`, trait: 'cautious', risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 900); return { money: -cost, happiness: 1, pantrySet: 100, message: `Купил всё свежее за ${formatMoney(cost)}.` }; } },
      ],
    },
    {
      id: 'hand_pantry_empty',
      text: 'Холодильник абсолютно пуст уже несколько дней — есть толком нечего, и это чувствуется.',
      conditions: (s) => s.pantry <= 8,
      choices: [
        { label: (state) => `Закупиться сейчас же (${formatMoney(scaleByWealth(state, 700))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 700); return { money: -cost, health: 6, happiness: 4, pantrySet: 90, message: `Затарился едой за ${formatMoney(cost)} — сразу полегчало.` }; } },
        { label: 'Перетерпеть ещё немного', risk: 'risky', effect: () => ({ health: -6, happiness: -6, message: 'Голодный желудок явно недоволен таким решением.' }) },
      ],
    },
    {
      id: 'hand_bankruptcy_1',
      text: 'Банк звонит и требует немедленно погасить просроченный кредит, иначе подаст в суд.',
      conditions: (s) => s.money < 3000,
      choices: [
        { label: (state) => `Взять новый займ ${formatMoney(scaleByWealth(state, 4000))}`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const amount = scaleByWealth(state, 4000); return { money: amount, happiness: -10, debtRateUp: true, message: 'Проблема отложена, но долговая яма стала глубже — теперь проценты будут расти быстрее.' }; } },
        { label: 'Признать себя банкротом официально', risk: 'safe', effect: () => ({ bankrupt: true, message: 'Ты официально признан банкротом. Долги списаны — но начинать придётся с нуля.' }) },
      ],
    },
    {
      id: 'hand_bankruptcy_2',
      text: 'Коллекторы начали названивать даже родственникам, требуя вернуть долг.',
      conditions: (s) => s.money < 0,
      choices: [
        { label: (state) => `Занять у родни (${formatMoney(scaleByWealth(state, 3000))})`, risk: 'balanced', effect: (state) => { const amount = scaleByWealth(state, 3000); return { money: amount, reputation: -3, happiness: -4, message: 'Родня выручила, но отношения испортились.' }; } },
        { label: 'Не отвечать и сменить номер', risk: 'safe', effect: () => ({ happiness: -8, energy: -6, message: 'Звонки прекратились, но нервы уже ни к чёрту.' }) },
      ],
    },
    {
      id: 'hand_bankruptcy_3',
      text: 'Микрозайм под огромный процент — единственный способ достать денег прямо сегодня.',
      conditions: (s) => s.money < 2000,
      choices: [
        { label: (state) => `Взять микрозайм ${formatMoney(scaleByWealth(state, 2500))}`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const amount = scaleByWealth(state, 2500); return { money: amount, debtRateUp: true, happiness: -3, message: 'Деньги в кармане, но проценты по долгу теперь будут расти как снежный ком.' }; } },
        { label: 'Отказаться и поискать другой выход', trait: 'cautious', risk: 'safe', effect: () => ({ energy: -10, happiness: -2, message: 'Тяжело, зато не увяз в новых долгах.' }) },
      ],
    },
    {
      id: 'hand_bankruptcy_4',
      text: 'Ты не можешь оплатить съём жилья — хозяин грозит выселением уже на этой неделе.',
      conditions: (s) => s.money < 0,
      choices: [
        { label: (state) => `Занять у друзей (${formatMoney(scaleByWealth(state, 2000))})`, risk: 'balanced', effect: (state) => { const amount = scaleByWealth(state, 2000); return { money: amount, reputation: -2, message: 'Друзья выручили, но просить снова будет стыдно.' }; } },
        { label: 'Собрать вещи и уйти', risk: 'safe', effect: () => ({ happiness: -12, health: -6, message: 'Пришлось освободить квартиру. Начинается совсем другая жизнь.' }) },
      ],
    },
    {
      id: 'hand_bankruptcy_5',
      text: 'Сумма долгов превысила всё, что ты можешь заработать за год. Юрист предлагает оформить официальное банкротство.',
      conditions: (s) => s.money <= -20000,
      choices: [
        { label: 'Оформить банкротство официально', risk: 'safe', effect: () => ({ bankrupt: true, message: 'Ты официально признан банкротом. Долги списаны, но начинать придётся с нуля.' }) },
        { label: 'Тянуть и дальше, надеясь на чудо', risk: 'risky', effect: (state) => { const loss = scaleByWealth(state, 5000); return { money: -loss, happiness: -8, message: 'Чуда не случилось, долги продолжают расти.' }; } },
      ],
    },
    {
      id: 'hand_debt_restructure',
      text: (state) => `Банк предлагает программу реструктуризации за ${formatMoney(scaleByWealth(state, 2500))}: разовый платёж — и грабительские проценты по долгу снова станут божескими.`,
      conditions: (s) => s.debtRate > 0.03,
      choices: [
        { label: (state) => `Заплатить ${formatMoney(scaleByWealth(state, 2500))} и реструктурировать`, trait: 'cautious', risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 2500); return { money: -cost, debtRateReset: true, happiness: 3, message: `Заплатил ${formatMoney(cost)} — условия по долгу снова человеческие.` }; } },
        { label: 'Отказаться, и так сойдёт', risk: 'risky', effect: () => ({ happiness: -2, message: 'Грабительские проценты продолжат душить бюджет.' }) },
      ],
    },
    {
      id: 'hand_windfall_1',
      text: 'Ты выиграл в лотерею небольшую, но приятную сумму.',
      conditions: always,
      choices: [
        { label: 'Сохранить деньги', trait: 'cautious', risk: 'safe', effect: (state) => { const win = scaleByWealth(state, 4000 + scaleByStat(state.reputation, 100, 0, 16000)); return { money: win, happiness: 5, message: `Выигрыш ${formatMoney(win)} лёг на счёт.` }; } },
        { label: 'Потратить с размахом', risk: 'balanced', effect: (state) => { const win = scaleByWealth(state, 4000 + scaleByStat(state.reputation, 100, 0, 16000)); return { money: Math.round(win * 0.3), happiness: 18, message: 'Устроил себе праздник на весь выигрыш.' }; } },
      ],
    },
    {
      id: 'hand_windfall_2',
      text: 'Дальний родственник, о котором ты почти забыл, оставил тебе небольшое наследство.',
      conditions: (s) => s.age >= 25,
      choices: [
        { label: 'Принять наследство', risk: 'safe', effect: (state) => { const win = scaleByWealth(state, 8000 + scaleByStat(state.age, 85, 0, 32000)); return { money: win, happiness: 6, message: `Неожиданно получил ${formatMoney(win)}.` }; } },
        { label: 'Отказаться в пользу других родственников', trait: 'familyFirst', risk: 'safe', effect: () => ({ reputation: 4, happiness: 2, message: 'Благородный жест оценили в семье.' }) },
      ],
    },
    {
      id: 'hand_windfall_3',
      text: 'Работодатель неожиданно выплатил щедрую годовую премию.',
      conditions: hasBossFn,
      choices: [
        { label: 'Порадоваться и отложить премию', trait: 'cautious', risk: 'safe', effect: (state) => { const win = scaleByWealth(state, 3000 + scaleByStat(state.reputation, 100, 0, 12000)); return { money: win, happiness: 6, message: `Премия ${formatMoney(win)} — приятный бонус за труд.` }; } },
        { label: 'Сразу потратить на себя', risk: 'balanced', effect: (state) => { const win = scaleByWealth(state, 3000 + scaleByStat(state.reputation, 100, 0, 12000)); return { money: Math.round(win * 0.5), happiness: 12, message: 'Побаловал себя чем-то давно желанным.' }; } },
      ],
    },
    {
      id: 'hand_allergy_1',
      text: (state) => `На вечеринке у друзей ты внезапно оказался рядом с источником своей аллергии: ${state.allergy}. Симптомы уже начинают проявляться.`,
      conditions: hasAllergyFn,
      choices: [
        { label: 'Незаметно уйти', risk: 'safe', effect: () => ({ happiness: -3, health: 2, message: 'Ушёл вовремя, обошлось без приступа.' }) },
        { label: 'Перетерпеть, чтобы не показаться грубым', risk: 'risky', effect: (state) => { const hit = Math.round(scaleByStat(100 - state.health, 100, 10, 25)); const cost = state.health < 40 ? scaleByWealth(state, 3000) : 0; return { health: -hit, money: -cost, happiness: -6, message: cost ? `Здоровье было не в лучшей форме — реакция оказалась серьёзной, пришлось вызывать скорую за ${formatMoney(cost)}.` : 'Реакция была неприятной, но обошлось своими силами.' }; } },
      ],
    },
    {
      id: 'hand_allergy_2',
      text: (state) => `Ты наткнулся на возможную причину своей аллергии — ${state.allergy} — в самый неподходящий момент, на важной встрече.`,
      conditions: hasAllergyFn,
      choices: [
        { label: 'Извиниться и срочно выйти', risk: 'safe', effect: () => ({ reputation: -2, health: 3, message: 'Неловко, зато цел и невредим.' }) },
        { label: 'Досидеть до конца встречи', risk: 'risky', effect: (state) => { const hit = Math.round(scaleByStat(100 - state.health, 100, 8, 20)); return { health: -hit, reputation: 2, message: 'Встречу довёл до конца, но здоровью досталось.' }; } },
      ],
    },
    {
      id: 'hand_allergy_3',
      text: (state) => `В аптеке тебе чуть не продали средство, в составе которого — ${state.allergy}. Хорошо, что ты внимательно прочитал состав.`,
      conditions: hasAllergyFn,
      choices: [
        { label: (state) => `Потребовать компенсацию (~${formatMoney(scaleByWealth(state, 500))})`, risk: 'balanced', effect: (state) => { const comp = scaleByWealth(state, 500); return { money: comp, reputation: 1, message: `Аптека извинилась и выплатила компенсацию ${formatMoney(comp)}.` }; } },
        { label: 'Молча уйти', risk: 'safe', effect: () => ({ happiness: -1, message: 'Не было настроения на скандал.' }) },
      ],
    },
    {
      id: 'hand_allergy_4',
      text: (state) => `Ты давно не сталкивался с ${state.allergy} и решил на всякий случай проверить, не прошла ли аллергия.`,
      conditions: hasAllergyFn,
      choices: [
        { label: 'Рискнуть и проверить', trait: 'riskTaker', risk: 'risky', effect: (state) => (healthOk(state, 60) ? { happiness: 6, message: 'Крепкое здоровье помогло — на этот раз обошлось без реакции.' } : { health: -Math.round(scaleByStat(100 - state.health, 100, 15, 30)), happiness: -8, message: 'Организм ослаблен — аллергия оказалась на месте. Было очень плохо.' }) },
        { label: 'Не испытывать судьбу', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 1, message: 'Осторожность — тоже стратегия.' }) },
      ],
    },
    {
      id: 'hand_allergy_5',
      text: (state) => `Друзья зовут в поездку, но там почти наверняка будет ${state.allergy}, а аптечки с собой нет.`,
      conditions: hasAllergyFn,
      choices: [
        { label: 'Поехать несмотря ни на что', risk: 'risky', effect: (state) => (healthOk(state, 50) ? { happiness: 14, message: 'Здоровье позволило съездить отлично, и обошлось без последствий.' } : { health: -Math.round(scaleByStat(100 - state.health, 100, 10, 22)), happiness: 4, message: 'Поездка была отличной, но не без приступа.' }) },
        { label: 'Остаться дома', risk: 'safe', effect: () => ({ happiness: -6, health: 2, message: 'Скучно, зато безопасно.' }) },
      ],
    },
    {
      id: 'hand_job_search',
      text: 'Ты штудируешь объявления о работе. Попадается вакансия, но платят немного.',
      conditions: noJobFn,
      choices: [
        { label: (state) => `Согласиться на любую работу (${formatMoney(scaleByWealth(state, 1000))})`, trait: 'hardworker', risk: 'safe', effect: (state) => { const pay = scaleByWealth(state, 1000); return { money: pay, happiness: 3, jobGain: true, message: 'Начал работать заново — уже не так безнадёжно.' }; } },
        { label: 'Продолжать искать что-то получше', risk: 'risky', effect: () => ({ happiness: -2, energy: -4, message: 'Поиски продолжаются, а деньги заканчиваются.' }) },
      ],
    },
    {
      id: 'hand_epidemic',
      text: 'В городе объявили карантин из-за вспышки простудного вируса.',
      conditions: always,
      choices: [
        { label: (state) => `Закупиться масками и витаминами (${formatMoney(scaleByWealth(state, 1500))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 1500); return { money: -cost, health: 8, message: `Подготовился заранее за ${formatMoney(cost)}.` }; } },
        { label: 'Не придавать значения', risk: 'risky', effect: (state) => (healthOk(state, 55) ? { happiness: 1, message: 'Крепкий иммунитет справился, пронесло.' } : { health: -14, happiness: -4, message: 'Иммунитет не справился — всё-таки заболел.' }) },
      ],
    },
    {
      id: 'hand_charity_ask',
      text: 'Незнакомец на улице просит немного денег на еду.',
      conditions: always,
      choices: [
        { label: (state) => `Дать немного (${formatMoney(scaleByWealth(state, 150))})`, trait: 'familyFirst', risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 150); return { money: -cost, happiness: 4, reputation: 1, message: 'Небольшая помощь, но приятно на душе.' }; } },
        { label: 'Пройти мимо', risk: 'safe', effect: () => ({ happiness: -1, message: 'Своих забот хватает.' }) },
      ],
    },
    {
      id: 'hand_mentor',
      text: 'Успешный человек предлагает бесплатно стать твоим наставником, если ты будешь выполнять его задания.',
      conditions: always,
      choices: [
        { label: 'Согласиться', trait: 'hardworker', risk: 'balanced', effect: () => ({ energy: -6, happiness: 5, reputation: 3, message: 'Первые задания уже дают результат.' }) },
        { label: 'Отказаться, справлюсь сам', risk: 'safe', effect: () => ({ happiness: 1, message: 'Пойдёшь своим путём.' }) },
      ],
    },
    {
      id: 'hand_new_position',
      text: 'Другая компания предлагает тебе более высокую и денежную позицию.',
      conditions: hasBossFn,
      choices: [
        { label: (state) => `Принять предложение (+${formatMoney(scaleByWealth(state, 5000))})`, trait: 'hardworker', risk: 'balanced', effect: (state) => { const bonus = scaleByWealth(state, 5000); return { money: bonus, reputation: 3, happiness: 6, message: 'Новая должность — новые возможности!' }; } },
        { label: 'Остаться на нынешнем месте', risk: 'safe', effect: () => ({ reputation: 2, happiness: -1, message: 'Верность старому месту тоже чего-то стоит.' }) },
      ],
    },
    {
      id: 'hand_burnout',
      text: 'Ты понимаешь, что давно не отдыхал по-настоящему.',
      conditions: always,
      choices: [
        { label: (state) => `Взять отпуск (${formatMoney(scaleByWealth(state, 3500))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 3500); return { money: -cost, energy: 25, happiness: 12, health: 5, message: `Отпуск обошёлся в ${formatMoney(cost)}, но того стоил.` }; } },
        { label: 'Продолжать работать на износ', trait: 'hardworker', risk: 'risky', effect: () => ({ energy: -15, health: -8, happiness: -6, message: 'Организм всё чаще напоминает о себе усталостью.' }) },
      ],
    },
    {
      id: 'hand_slip_fall',
      text: 'Ты поскользнулся на льду и упал.',
      conditions: always,
      choices: [
        { label: (state) => `Обратиться к врачу (${formatMoney(scaleByWealth(state, 1200))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 1200); return { money: -cost, health: 10, message: `Обошлось без осложнений, потрачено ${formatMoney(cost)}.` }; } },
        { label: 'Отлежаться дома', risk: 'risky', effect: (state) => (healthOk(state, 50) ? { health: -4, message: 'Крепкий организм справился сам.' } : { health: -18, message: 'Организм ослаблен — стало хуже, надо было идти к врачу.' }) },
      ],
    },
    {
      id: 'hand_philanthropy',
      text: (state) => `Журналисты спрашивают, планируешь ли ты заняться благотворительностью — фонд обойдётся в ${formatMoney(scaleByWealth(state, 80000))}.`,
      conditions: isRichPlus,
      choices: [
        { label: (state) => `Основать фонд (${formatMoney(scaleByWealth(state, 80000))})`, trait: 'familyFirst', risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 80000); return { money: -cost, reputation: 15, happiness: 10, message: `Фонд основан, потрачено ${formatMoney(cost)}. Пресса в восторге.` }; } },
        { label: 'Уклониться от ответа', risk: 'safe', effect: () => ({ reputation: -4, message: 'Журналисты сделали свои выводы.' }) },
      ],
    },
    {
      id: 'hand_side_idea',
      text: 'У тебя внезапно появилась идея для небольшого побочного дела.',
      conditions: always,
      choices: [
        { label: (state) => `Попробовать запустить (${formatMoney(scaleByWealth(state, 2000))})`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 2000); return repOk(state, 50) ? { money: Math.round(cost * 2) - cost, happiness: 8, message: 'Репутация и связи сделали своё — идея выстрелила, дело приносит доход!' } : { money: -cost, happiness: -4, message: 'Идея не взлетела, деньги потрачены впустую.' }; } },
        { label: 'Оставить идею на потом', risk: 'safe', effect: () => ({ happiness: -1, message: 'Может, ещё вернёшься к этой мысли.' }) },
      ],
    },
    {
      id: 'hand_year_reflection',
      text: 'Заканчивается очередной год твоей жизни. Пора подвести итоги.',
      conditions: always,
      choices: [
        { label: 'Порадоваться достигнутому', risk: 'safe', effect: () => ({ happiness: 8, message: 'Оптимизм заряжает на новые свершения.' }) },
        { label: 'Расстроиться, что не всё получилось', risk: 'safe', effect: () => ({ happiness: -5, reputation: 1, message: 'Самокритика тоже помогает двигаться дальше.' }) },
      ],
    },
    {
      id: 'hand_retirement_thought',
      text: 'Ты задумался: не пора ли начать откладывать на старость побольше?',
      conditions: (s) => s.age >= 50,
      choices: [
        { label: (state) => `Начать откладывать (${formatMoney(scaleByWealth(state, 1000))})`, trait: 'cautious', risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 1000); return { money: -cost, happiness: 3, message: 'Небольшая финансовая подушка радует спокойствием.' }; } },
        { label: 'Жить сегодняшним днём', trait: 'riskTaker', risk: 'balanced', effect: () => ({ happiness: 4, message: 'Живёшь ярко, а там видно будет.' }) },
      ],
    },
    {
      id: 'hand_ipo_dream',
      text: 'Инвестбанкиры предлагают вывести твою компанию на биржу через IPO.',
      conditions: isBusinessy,
      choices: [
        { label: (state) => `Провести IPO (потенциал ${formatMoney(scaleByWealth(state, 400000))})`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const gain = scaleByWealth(state, 400000); return repOk(state, 60) ? { money: gain, reputation: 12, happiness: 15, message: `Репутация убедила рынок — IPO прошло блестяще! Капитал вырос на ${formatMoney(gain)}.` } : { money: -Math.round(gain * 0.2), reputation: -5, happiness: -8, message: 'Рынок встретил IPO прохладно, акции просели.' }; } },
        { label: 'Остаться частной компанией', trait: 'cautious', risk: 'safe', effect: () => ({ reputation: 2, message: 'Контроль важнее шумихи.' }) },
      ],
    },
    {
      id: 'hand_trait_gambler',
      text: 'Друзья с тревогой замечают: в последнее время ты слишком часто рискуешь деньгами.',
      conditions: (s) => s.traits.riskTaker === 5,
      choices: [
        { label: 'Согласиться, что пора быть осторожнее', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 2, message: 'Ты берёшь себя в руки.' }) },
        { label: 'Азарт того стоит', trait: 'riskTaker', risk: 'risky', effect: () => ({ happiness: 4, reputation: -2, message: 'Ты не намерен останавливаться.' }) },
      ],
    },
    {
      id: 'hand_trait_shady',
      text: 'Ты замечаешь, что в последнее время слишком часто ходишь по краю закона. Это не остаётся незамеченным.',
      conditions: (s) => s.traits.shady === 3,
      choices: [
        { label: 'Залечь на дно на время', trait: 'cautious', risk: 'safe', effect: () => ({ reputation: 3, energy: -5, message: 'Осторожность — лучшая защита.' }) },
        { label: 'Продолжать в том же духе', trait: 'shady', risk: 'risky', effect: () => ({ happiness: 2, reputation: -3, message: 'Путь назад с каждым разом всё сложнее.' }) },
      ],
    },
    {
      id: 'hand_trait_hardworker',
      text: 'Коллеги в шутку прозвали тебя трудоголиком — ты правда пашешь без остановки.',
      conditions: (s) => s.traits.hardworker === 5,
      choices: [
        { label: 'Гордиться репутацией работяги', trait: 'hardworker', risk: 'balanced', effect: () => ({ reputation: 4, energy: -6, message: 'Труд признан — приятно.' }) },
        { label: 'Задуматься о балансе жизни', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 6, energy: 10, message: 'Немного сбавил обороты.' }) },
      ],
    },
    {
      id: 'hand_trait_family',
      text: 'Семья не устаёт повторять, какой ты надёжный и заботливый человек.',
      conditions: (s) => s.traits.familyFirst === 5 && s.hasFamily,
      choices: [
        { label: 'Порадоваться этим словам', trait: 'familyFirst', risk: 'safe', effect: () => ({ happiness: 8, reputation: 2, message: 'Семья — это действительно важно.' }) },
        { label: 'Смутиться, но сместить фокус на карьеру', trait: 'hardworker', risk: 'balanced', effect: () => ({ happiness: -2, reputation: 1, message: 'Не всё коту масленица.' }) },
      ],
    },
    {
      id: 'hand_trait_cautious',
      text: 'Знакомые в шутку называют тебя занудой — ты слишком часто выбираешь надёжный путь вместо рискованного.',
      conditions: (s) => s.traits.cautious === 5,
      choices: [
        { label: 'Согласиться — осторожность себя оправдывает', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 3, reputation: 2, message: 'Медленно, зато без катастроф.' }) },
        { label: 'Решить, что пора рискнуть посильнее', trait: 'riskTaker', risk: 'risky', effect: () => ({ happiness: 4, message: 'Захотелось наконец сорвать банк, а не откладывать копейку к копейке.' }) },
      ],
    },
  ];

  /* ============ 4. НОВЫЕ COST-TIER СЕМЬИ (8 × 20 × 4 = 640) ============ */

  const neighborsFx = costOrEndure('happiness', 5, 45, 8, 'Решить вопрос', 'Отложить на потом');
  const neighborsHome = buildCostTierFamily(
    'neighborhome',
    [
      'соседи снизу пожаловались на шум', 'во дворе прорвало трубу и залило подвал', 'домофон сломался, а мастер берёт недёшево',
      'лифт встал, и жильцы скидываются на ремонт', 'во дворе нужно скинуться на новую детскую площадку', 'управляющая компания заявила о внеплановом сборе на ремонт фасада',
      'сосед по лестничной клетке просит одолжить денег до зарплаты', 'домовой чат бурлит из-за скандала с парковкой', 'нужно скинуться соседями на охрану двора',
      'почтовый ящик взломали, и нужно менять замок', 'в подъезде отключили свет из-за долгов за электричество', 'собрание жильцов требует взноса на систему видеонаблюдения',
      'у соседей потоп, и они просят помощи с ремонтом', 'во дворе завели ремонт теплотрассы, и нужно временное отопление', 'домофонная компания предлагает платное обновление системы',
      'консьерж просит скинуться на подарок к празднику', 'председатель ТСЖ настаивает на срочном взносе', 'во дворе украли велосипед, и нужна страховка получше',
      'соседский кот повадился портить вещи на балконе', 'жилищная инспекция выписала предписание за перепланировку',
    ],
    (a1, j, state) => `Дом преподносит сюрприз: ${a1}. Решить вопрос стоит ${formatMoney(scaleByWealth(state, COST_BASE[j]))}. Разобраться сейчас или отложить?`,
    { label: neighborsFx.costLabel, risk: 'safe', effect: neighborsFx.cost },
    { label: neighborsFx.endureLabel, trait: 'cautious', risk: 'risky', effect: neighborsFx.endure }
  );

  const gadgetsFx = costOrEndure('energy', 6, 45, 10, 'Починить сейчас', 'Обойтись подручными средствами');
  const gadgetsBreak = buildCostTierFamily(
    'gadgetbreak',
    [
      'сломался ноутбук в разгар важных дел', 'телефон разбился, экран весь в трещинах', 'наушники окончательно перестали работать',
      'роутер барахлит, и интернет постоянно рвётся', 'принтер отказывается печатать важные документы', 'аккумулятор в ноутбуке садится за считанные минуты',
      'игровая приставка перестала читать диски', 'камера на телефоне разбилась после падения', 'зарядное устройство сгорело вместе с розеткой',
      'смарт-часы перестали синхронизироваться', 'внешний жёсткий диск со всеми файлами не читается', 'клавиатура ноутбука залита кофе',
      'телевизор дома внезапно перестал включаться', 'колонки для музыки шипят и трещат', 'веб-камера для созвонов сломалась перед важной встречей',
      'планшет завис намертво и не реагирует ни на что', 'микрофон для подкастов барахлит', 'старый смартфон разрядился и не заряжается вовсе',
      'монитор пошёл цветными полосами', 'модем интернет-провайдера сгорел после грозы',
    ],
    (a1, j, state) => `Незадача с техникой: ${a1}. Ремонт или замена обойдётся в ${formatMoney(scaleByWealth(state, COST_BASE[j]))}. Чинить сейчас или обойтись подручными средствами?`,
    { label: gadgetsFx.costLabel, risk: 'safe', effect: gadgetsFx.cost },
    { label: gadgetsFx.endureLabel, trait: 'cautious', risk: 'risky', effect: gadgetsFx.endure }
  );

  const wardrobeFx = costOrEndure('reputation', 4, 45, 6, 'Обновить гардероб', 'Перетерпеть, как есть');
  const wardrobeWear = buildCostTierFamily(
    'wardrobewear',
    [
      'любимая куртка порвалась в самый неподходящий момент', 'туфли протёрлись прямо перед важной встречей', 'рубашка безнадёжно испачкалась пятном, которое не отстирывается',
      'молния на куртке сломалась на морозе', 'костюм сел после неудачной стирки', 'кроссовки вышли из строя посреди рабочей недели',
      'пуговицы на пиджаке одна за другой отрываются', 'любимый свитер побила моль', 'туфли на каблуках сломались посреди улицы',
      'куртка вышла из моды, и это стали замечать коллеги', 'рубашка полиняла в стирке вместе с цветными вещами', 'ремень порвался в неподходящий момент',
      'пальто протекает под дождём', 'джинсы порвались по шву', 'любимый шарф потерялся перед важным выходом',
      'перчатки истрепались в морозы', 'галстук залит соусом на деловом обеде', 'шапка растянулась и уже не держит форму',
      'носки все до одного протёрлись до дыр', 'ремешок на любимых часах истрепался',
    ],
    (a1, j, state) => `Проблема с внешним видом: ${a1}. Обновить обойдётся в ${formatMoney(scaleByWealth(state, COST_BASE[j]))}. Обновить гардероб или перетерпеть, как есть?`,
    { label: wardrobeFx.costLabel, risk: 'safe', effect: wardrobeFx.cost },
    { label: wardrobeFx.endureLabel, trait: 'cautious', risk: 'risky', effect: wardrobeFx.endure }
  );

  const petcareFx = costOrEndure('happiness', 5, 45, 7, 'Позаботиться о питомце', 'Перетерпеть без расходов');
  const petcare = buildCostTierFamily(
    'petcare',
    [
      'у питомца проблемы со здоровьем, срочно нужен ветеринар', 'закончился корм для питомца, а любимый бренд подорожал', 'питомцу нужна срочная прививка',
      'питомец погрыз важные вещи дома', 'питомцу нужна стрижка у грумера', 'питомец потерялся, и расклеены объявления по району',
      'ветклиника предлагает дорогую страховку для питомца', 'питомцу нужна новая переноска для поездок', 'питомец не в духе и требует дорогие игрушки',
      'питомцу нужна операция после неудачного падения', 'питомец разодрал новый диван', 'питомцу нужен курс витаминов от ветеринара',
      'питомца не с кем оставить на время поездки', 'питомцу нужна новая когтеточка вместо мебели', 'питомец подхватил блох после прогулки',
      'питомцу нужен новый поводок и намордник', 'питомец громко скулит по ночам, соседи жалуются', 'питомцу нужна кастрация или стерилизация',
      'питомец испортил ковёр во время грозы', 'питомцу нужен визит к специалисту по поведению',
    ],
    (a1, j, state) => `С питомцем беда: ${a1}. Решение вопроса обойдётся в ${formatMoney(scaleByWealth(state, COST_BASE[j]))}. Заняться этим сейчас или потерпеть?`,
    { label: petcareFx.costLabel, risk: 'safe', effect: petcareFx.cost },
    { label: petcareFx.endureLabel, trait: 'cautious', risk: 'risky', effect: petcareFx.endure }
  );

  const civicFx = costOrEndure('reputation', 4, 45, 6, 'Разобраться официально', 'Найти обходной путь');
  const civicDuty = buildCostTierFamily(
    'civicduty',
    [
      'пришла повестка на срочные военные сборы', 'вызывают в суд свидетелем по чужому делу', 'истёк срок действия паспорта, а очередь в МФЦ огромная',
      'пришёл штраф за неправильную парковку', 'налоговая требует пояснений по декларации', 'нужно оформить кучу документов на новое жильё',
      'коммунальщики требуют доступ для проверки счётчиков', 'участковый пришёл с проверкой по жалобе соседей', 'нужно продлить водительские права',
      'пришло письмо о просроченном техосмотре', 'вызывают на медкомиссию для военкомата', 'нужно зарегистрировать перепланировку в квартире',
      'нужно поставить машину на учёт в новом регионе', 'нужно оформить загранпаспорт перед поездкой', 'приставы прислали письмо по старому недоразумению',
      'нужно подтвердить льготу через портал госуслуг', 'требуют оплатить экологический сбор за старую машину', 'нужно пройти обязательную диспансеризацию',
      'миграционная служба просит донести документы', 'нужно оформить страховку по новым требованиям',
    ],
    (a1, j, state) => `Гражданский вопрос: ${a1}. Официальное решение стоит ${formatMoney(scaleByWealth(state, COST_BASE[j]))}. Разобраться по правилам или найти обходной путь?`,
    { label: civicFx.costLabel, risk: 'safe', effect: civicFx.cost },
    { label: civicFx.endureLabel, trait: 'shady', risk: 'risky', effect: civicFx.endure }
  );

  const hobbyFx = costOrEndure('happiness', 7, 45, 5, 'Побаловать себя', 'Отказаться от траты');
  const hobbyCost = buildCostTierFamily(
    'hobbycost',
    [
      'новый набор для рисования, о котором ты давно мечтал(а)', 'коллекционную фигурку выставили на распродаже', 'билеты на фестиваль любимой музыки',
      'новую удочку для рыбалки', 'абонемент на скалодром', 'редкую пластинку для коллекции',
      'новый объектив для фотоаппарата', 'мастер-класс по кулинарии от известного шефа', 'снаряжение для похода в горы',
      'новую гитару взамен старой', 'настольную игру, о которой все говорят', 'билет на турнир по любимой игре',
      'материалы для рукоделия', 'новый велосипед для покатушек по выходным', 'абонемент в шахматный клуб',
      'оборудование для домашней студии подкастов', 'коллекционное издание любимой книги', 'инвентарь для сноуборда перед сезоном',
      'билеты на выставку современного искусства', 'новый набор для домашнего пивоварения',
    ],
    (a1, j, state) => `По увлечению вопрос: подвернулась ${a1}. Это будет стоить ${formatMoney(scaleByWealth(state, COST_BASE[j] * 0.6))}. Побаловать себя или отказаться от траты?`,
    { label: hobbyFx.costLabel, risk: 'balanced', effect: hobbyFx.cost },
    { label: hobbyFx.endureLabel, trait: 'cautious', risk: 'safe', effect: hobbyFx.endure }
  );

  const socialFx = costOrEndure('happiness', 6, 45, 6, 'Пойти при полном параде', 'Отговориться и не ходить');
  const socialEvents = buildCostTierFamily(
    'socialevent',
    [
      'свадьба дальнего родственника', 'юбилей бывшего коллеги', 'выпускной вечер в старом университете',
      'корпоратив у друзей в другой компании', 'день рождения близкого друга', 'крестины у соседей',
      'встреча выпускников школы', 'помолвка знакомой пары', 'новоселье у друзей',
      'юбилей свадьбы родителей', 'торжественный банкет от партнёров по бизнесу', 'прощальная вечеринка коллеги перед переездом',
      'день рождения ребёнка друзей', 'почётное приглашение на местный праздник', 'встреча старых армейских товарищей',
      'торжество по случаю выхода на пенсию наставника', 'гала-вечер благотворительного фонда', 'юбилей компании, где ты когда-то работал(а)',
      'презентация книги знакомого автора', 'открытие нового заведения общего знакомого',
    ],
    (a1, j, state) => `Приглашение: ${a1}. Достойно поучаствовать обойдётся в ${formatMoney(scaleByWealth(state, COST_BASE[j] * 0.5))}. Пойти при полном параде или отговориться?`,
    { label: socialFx.costLabel, risk: 'balanced', effect: socialFx.cost },
    { label: socialFx.endureLabel, trait: 'cautious', risk: 'safe', effect: socialFx.endure }
  );

  const selfcareFx = costOrEndure('health', 8, 50, 8, 'Заняться собой', 'Перетерпеть без трат');
  const selfcare = buildCostTierFamily(
    'selfcare',
    [
      'давно пора сходить к стоматологу на профилактику', 'нужен новый рецепт на очки, зрение подводит', 'пора записаться на массаж после постоянного напряжения',
      'давно не был(а) на диспансеризации', 'нужно провериться у дерматолога из-за странной родинки', 'пора обновить рецепт на постоянные лекарства',
      'стоит записаться на приём к неврологу из-за головных болей', 'нужно пройти чекап у терапевта после долгого перерыва', 'пора сделать плановую вакцинацию',
      'давно откладываешь визит к окулисту', 'нужно провериться у кардиолога для профилактики', 'пора записаться на чистку зубов',
      'стоит сходить к диетологу за консультацией', 'нужно пройти анализы, которые давно откладывались', 'пора обратиться к психотерапевту, чтобы разгрузить голову',
      'давно пора показаться ЛОР-врачу из-за постоянного насморка', 'нужно провериться у эндокринолога', 'пора записаться к ортопеду из-за боли в спине',
      'стоит сходить на приём к косметологу', 'давно не проверял(а) слух у сурдолога',
    ],
    (a1, j, state) => `Забота о себе: ${a1}. Стоит это ${formatMoney(scaleByWealth(state, COST_BASE[j] * 0.6))}. Заняться собой сейчас или перетерпеть без трат?`,
    { label: selfcareFx.costLabel, risk: 'safe', effect: selfcareFx.cost },
    { label: selfcareFx.endureLabel, trait: 'cautious', risk: 'risky', effect: selfcareFx.endure }
  );

  /* ============ 5. НОВЫЕ FLAVOR-СЕМЬИ (6×64 + 2×36 = 456) ============ */

  const education = buildFlavorFamily(
    'education',
    [
      { text: (fl, state) => `Тебе предлагают записаться на ${fl} за ${formatMoney(scaleByWealth(state, 3500))}.`, choices: [
        { label: (fl, state) => `Записаться (${formatMoney(scaleByWealth(state, 3500))})`, trait: 'hardworker', risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 3500); return { money: -cost, reputation: 3, happiness: 4, message: 'Новые знания уже пригодились в деле.' }; } },
        { label: 'Отказаться, и так сойдёт', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -1, message: 'Может, в другой раз.' }) },
      ]},
      { text: () => `Экзамен по важному курсу назначен на завтра, а ты толком не готов(а).`, choices: [
        { label: 'Зубрить всю ночь', trait: 'hardworker', risk: 'risky', effect: (state) => (energyOk(state, 40) ? { reputation: 4, happiness: 3, message: 'Успел подготовиться — экзамен сдан на отлично.' } : { energy: -20, happiness: -6, message: 'Сил не хватило — экзамен сдан еле-еле.' }) },
        { label: 'Смириться с посредственным результатом', risk: 'safe', effect: () => ({ happiness: -3, message: 'Не блестяще, но и не провал.' }) },
      ]},
      { text: (fl) => `Преподаватель курса ${fl} предлагает тебе платные индивидуальные консультации.`, choices: [
        { label: (fl, state) => `Согласиться (${formatMoney(scaleByWealth(state, 1500))})`, risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 1500); return { money: -cost, reputation: 2, happiness: 2, message: 'Индивидуальные занятия того стоили.' }; } },
        { label: 'Разобраться самостоятельно', trait: 'cautious', risk: 'safe', effect: () => ({ energy: -4, message: 'Пришлось попотеть, но справился(ась) сам(а).' }) },
      ]},
      { text: () => `Тебе предложили выступить с докладом перед всей группой.`, choices: [
        { label: 'Согласиться выступить', trait: 'hardworker', risk: 'risky', effect: (state) => (repOk(state, 45) ? { reputation: 6, happiness: 6, message: 'Выступление прошло блестяще.' } : { happiness: -5, message: 'Выступление вышло неуверенным.' }) },
        { label: 'Отказаться от выступления', risk: 'safe', effect: () => ({ happiness: 1, message: 'Комфортная зона важнее.' }) },
      ]},
      { text: (fl) => `Тебе предлагают бесплатную стажировку вместо продолжения курса ${fl}.`, choices: [
        { label: 'Пойти на стажировку', trait: 'riskTaker', risk: 'risky', effect: (state) => { const gain = scaleByWealth(state, 2000); return traitOk(state, 'riskTaker', 3) ? { money: gain, reputation: 4, message: 'Стажировка обернулась неожиданным доходом.' } : { happiness: -3, message: 'Стажировка не задалась — опыта было маловато.' }; } },
        { label: 'Продолжить обучение', trait: 'cautious', risk: 'safe', effect: () => ({ reputation: 2, message: 'Базовые знания — тоже фундамент.' }) },
      ]},
      { text: () => `Однокурсник просит списать у тебя домашнее задание.`, choices: [
        { label: 'Дать списать', trait: 'familyFirst', risk: 'balanced', effect: () => ({ happiness: 2, reputation: -1, message: 'Помог, но совесть немного гложет.' }) },
        { label: 'Отказать', trait: 'cautious', risk: 'safe', effect: () => ({ reputation: 1, happiness: -1, message: 'Честность дороже.' }) },
      ]},
      { text: (fl, state) => `Стоимость (${fl}) внезапно выросла на ${formatMoney(scaleByWealth(state, 2000))} из-за "инфляции".`, choices: [
        { label: (fl, state) => `Доплатить (${formatMoney(scaleByWealth(state, 2000))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 2000); return { money: -cost, message: 'Доплатил, чтобы не бросать на середине.' }; } },
        { label: 'Бросить обучение', trait: 'shady', risk: 'risky', effect: () => ({ happiness: -4, message: 'Деньги за первую часть курса пропали зря.' }) },
      ]},
      { text: () => `Тебя пригласили в приёмную комиссию — помочь набирать новых студентов за вознаграждение.`, choices: [
        { label: (fl, state) => `Согласиться (${formatMoney(scaleByWealth(state, 2500))})`, trait: 'hardworker', risk: 'balanced', effect: (state) => { const pay = scaleByWealth(state, 2500); return { money: pay, energy: -10, message: 'Дополнительный доход не помешал.' }; } },
        { label: 'Отказаться, время дороже', risk: 'safe', effect: () => ({ energy: 4, message: 'Сэкономил силы для главного.' }) },
      ]},
    ],
    ['онлайн-курс по программированию', 'вечерние курсы иностранного языка', 'мастер-класс по ораторскому искусству', 'сертификационную программу по маркетингу', 'курс повышения квалификации', 'занятия с репетитором по финансам', 'программу MBA-интенсив', 'воскресные курсы кройки и шитья'],
    always
  );

  const travel = buildFlavorFamily(
    'travel',
    [
      { text: (fl, state) => `Горящий тур ${fl} продаётся за ${formatMoney(scaleByWealth(state, 12000))}.`, choices: [
        { label: (fl, state) => `Купить тур (${formatMoney(scaleByWealth(state, 12000))})`, risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 12000); return { money: -cost, happiness: 16, energy: 8, message: 'Поездка вышла отличной, зарядился впечатлениями.' }; } },
        { label: 'Остаться дома', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -3, message: 'Бюджет цел, но настроение так себе.' }) },
      ]},
      { text: () => `В аэропорту рейс задержали на много часов.`, choices: [
        { label: (fl, state) => `Взять номер в отеле у аэропорта (${formatMoney(scaleByWealth(state, 3000))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 3000); return { money: -cost, energy: 10, message: 'Отдохнул с комфортом, дождавшись рейса.' }; } },
        { label: 'Ждать в зале ожидания', trait: 'cautious', risk: 'risky', effect: () => ({ energy: -18, happiness: -6, message: 'Долгое ожидание вымотало окончательно.' }) },
      ]},
      { text: (fl) => `В поездке ${fl} багаж потерялся при пересадке.`, choices: [
        { label: (fl, state) => `Купить всё необходимое на месте (${formatMoney(scaleByWealth(state, 4000))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 4000); return { money: -cost, happiness: 2, message: 'Неприятно, но поездку удалось не испортить.' }; } },
        { label: 'Обходиться тем, что есть', trait: 'cautious', risk: 'risky', effect: () => ({ happiness: -8, message: 'Отдых подпорчен, но нервы целее.' }) },
      ]},
      { text: () => `Местный гид предлагает эксклюзивную экскурсию не по программе.`, choices: [
        { label: (fl, state) => `Согласиться (${formatMoney(scaleByWealth(state, 2500))})`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 2500); return repOk(state, 30) ? { money: -Math.round(cost * 0.6), happiness: 14, message: 'Экскурсия оказалась незабываемой и не такой уж дорогой.' } : { money: -cost, happiness: 4, message: 'Экскурсия была неплохой, но переплатил как турист.' }; } },
        { label: 'Придерживаться программы', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 2, message: 'Спокойный, предсказуемый отдых.' }) },
      ]},
      { text: (fl) => `В поездке ${fl} тебя пригласили на местный праздник с угощениями.`, choices: [
        { label: 'Пойти и попробовать всё', risk: 'risky', effect: (state) => (healthOk(state, 45) ? { happiness: 12, message: 'Праздник запомнится надолго.' } : { happiness: 6, health: -6, message: 'Праздник понравился, но желудок оказался не готов.' }) },
        { label: 'Вежливо отказаться', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 1, message: 'Осторожность в путешествии не помешает.' }) },
      ]},
      { text: () => `Таксист в чужом городе явно пытается обсчитать за поездку.`, choices: [
        { label: 'Поспорить о цене', risk: 'balanced', effect: (state) => (repOk(state, 35) ? { money: scaleByWealth(state, 300), happiness: 3, message: 'Удалось отстоять честную цену.' } : { happiness: -4, message: 'Пришлось заплатить по завышенному тарифу.' }) },
        { label: 'Молча заплатить и забыть', risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 600); return { money: -cost, message: 'Проще заплатить, чем спорить в чужой стране.' }; } },
      ]},
      { text: (fl) => `Друзья зовут присоединиться к поездке ${fl} в последний момент.`, choices: [
        { label: (fl, state) => `Сорваться и поехать (${formatMoney(scaleByWealth(state, 9000))})`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 9000); return { money: -cost, happiness: 18, energy: -6, message: 'Спонтанная поездка подарила море впечатлений.' }; } },
        { label: 'Остаться и не тратиться', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -4, message: 'Бюджет цел, но было немного завидно.' }) },
      ]},
      { text: () => `Страховая компания предлагает расширенную туристическую страховку.`, choices: [
        { label: (fl, state) => `Оформить (${formatMoney(scaleByWealth(state, 1200))})`, trait: 'cautious', risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 1200); return { money: -cost, happiness: 2, message: 'Спокойствие в поездке того стоило.' }; } },
        { label: 'Обойтись без неё', trait: 'riskTaker', risk: 'risky', effect: () => ({ happiness: 1, message: 'Сэкономил, понадеявшись на удачу... то есть на авось.' }) },
      ]},
    ],
    ['по горам', 'на побережье', 'в старинный город', 'в соседнюю страну', 'в тропики', 'на курорт с термальными источниками', 'в национальный парк', 'по маршруту дикого кемпинга'],
    always
  );

  const romance = buildFlavorFamily(
    'romance',
    [
      { text: (fl) => `Тебя пригласили на свидание ${fl}.`, choices: [
        { label: (fl, state) => `Пойти на свидание (${formatMoney(scaleByWealth(state, 1500))})`, risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 1500); return { money: -cost, happiness: 12, message: 'Свидание прошло тепло и приятно.' }; } },
        { label: 'Вежливо отказаться', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -2, message: 'Не время для отношений.' }) },
      ]},
      { text: () => `Отношения переживают непростой момент — нужен откровенный разговор.`, choices: [
        { label: 'Поговорить честно', trait: 'familyFirst', risk: 'balanced', effect: (state) => (repOk(state, 35) ? { happiness: 10, reputation: 2, message: 'Разговор всё расставил по местам.' } : { happiness: -6, message: 'Разговор дался тяжело и не решил всего.' }) },
        { label: 'Избежать разговора', risk: 'safe', effect: () => ({ happiness: -5, message: 'Проблема осталась нерешённой.' }) },
      ]},
      { text: (fl) => `Партнёр(ша) предлагает вместе съездить ${fl}.`, choices: [
        { label: (fl, state) => `Согласиться (${formatMoney(scaleByWealth(state, 6000))})`, risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 6000); return { money: -cost, happiness: 16, message: 'Поездка вдвоём укрепила отношения.' }; } },
        { label: 'Предложить что-то поскромнее', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 4, message: 'Скромно, но душевно.' }) },
      ]},
      { text: () => `Ты узнал(а), что вторая половина скрывала от тебя финансовые проблемы.`, choices: [
        { label: (fl, state) => `Помочь разобраться (${formatMoney(scaleByWealth(state, 5000))})`, trait: 'familyFirst', risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 5000); return { money: -cost, happiness: 6, message: 'Вместе решать проблемы оказалось проще.' }; } },
        { label: 'Потребовать больше прозрачности', trait: 'cautious', risk: 'risky', effect: () => ({ happiness: -6, reputation: 1, message: 'Доверие временно пошатнулось.' }) },
      ]},
      { text: (fl) => `На вечеринке ${fl} с тобой флиртует привлекательный незнакомец(ка).`, choices: [
        { label: 'Пофлиртовать в ответ', trait: 'riskTaker', risk: 'risky', effect: () => ({ happiness: 8, reputation: -2, message: 'Приятный вечер, но не без пересудов.' }) },
        { label: 'Вежливо перевести тему', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 1, message: 'Верность важнее мимолётного внимания.' }) },
      ]},
      { text: () => `Родители второй половины настойчиво зовут познакомиться поближе.`, choices: [
        { label: (fl, state) => `Прийти с хорошим подарком (${formatMoney(scaleByWealth(state, 2000))})`, trait: 'familyFirst', risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 2000); return { money: -cost, reputation: 3, happiness: 6, message: 'Знакомство прошло тепло.' }; } },
        { label: 'Прийти с пустыми руками', risk: 'risky', effect: () => ({ reputation: -2, happiness: -2, message: 'Впечатление получилось не лучшим.' }) },
      ]},
      { text: (fl) => `Ты давно думаешь о серьёзном шаге в отношениях ${fl}.`, choices: [
        { label: (fl, state) => `Сделать решительный шаг (${formatMoney(scaleByWealth(state, 15000))})`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 15000); return repOk(state, 40) ? { money: -cost, happiness: 22, reputation: 3, message: 'Решительный шаг встретил тёплый отклик.' } : { money: -cost, happiness: -4, message: 'Момент оказался не самым подходящим.' }; } },
        { label: 'Подождать ещё немного', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 1, message: 'Спешить с таким не стоит.' }) },
      ]},
      { text: () => `Бывший(ая) партнёр(ша) неожиданно вышел(ла) на связь после долгого молчания.`, choices: [
        { label: 'Ответить и поговорить', trait: 'riskTaker', risk: 'risky', effect: () => ({ happiness: 4, reputation: -1, message: 'Разговор всколыхнул старые чувства.' }) },
        { label: 'Не отвечать', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 1, message: 'Прошлое остаётся в прошлом.' }) },
      ]},
    ],
    ['в уютном кафе', 'на выставке современного искусства', 'на прогулке в парке', 'в новом ресторане', 'на общем празднике друзей', 'в кино', 'на набережной вечером', 'в туристической поездке'],
    always
  );

  const charity = buildFlavorFamily(
    'charity',
    [
      { text: (fl) => `Волонтёрская организация зовёт помочь ${fl}.`, choices: [
        { label: 'Пойти волонтёрить', trait: 'familyFirst', risk: 'balanced', effect: () => ({ energy: -12, happiness: 8, reputation: 4, message: 'Помощь другим приносит настоящее удовлетворение.' }) },
        { label: 'Отказаться, своих дел хватает', risk: 'safe', effect: () => ({ happiness: -1, message: 'Может, в другой раз найдётся время.' }) },
      ]},
      { text: (fl, state) => `Благотворительный фонд просит пожертвование ${fl} в размере ${formatMoney(scaleByWealth(state, 2000))}.`, choices: [
        { label: (fl, state) => `Пожертвовать (${formatMoney(scaleByWealth(state, 2000))})`, trait: 'familyFirst', risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 2000); return { money: -cost, happiness: 6, reputation: 3, message: 'Небольшая помощь, но приятно на душе.' }; } },
        { label: 'Отказаться в этот раз', risk: 'safe', effect: () => ({ happiness: -1, message: 'Не всегда есть возможность помочь.' }) },
      ]},
      { text: () => `Друзья устраивают сбор денег для знакомого, попавшего в беду.`, choices: [
        { label: (fl, state) => `Скинуться щедро (${formatMoney(scaleByWealth(state, 3000))})`, trait: 'familyFirst', risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 3000); return { money: -cost, reputation: 4, happiness: 5, message: 'Щедрость заметили и оценили.' }; } },
        { label: 'Скинуться символически', risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 300); return { money: -cost, happiness: 1, message: 'Символическое участие тоже участие.' }; } },
      ]},
      { text: (fl) => `Тебе предлагают стать наставником для новичка ${fl}.`, choices: [
        { label: 'Согласиться безвозмездно', trait: 'familyFirst', risk: 'safe', effect: () => ({ energy: -8, happiness: 6, reputation: 3, message: 'Наставничество оказалось благодарным делом.' }) },
        { label: 'Отказаться, нет времени', risk: 'safe', effect: () => ({ happiness: -1, message: 'Время — тоже ресурс.' }) },
      ]},
      { text: () => `Приют для животных просит помощи с ремонтом вольеров.`, choices: [
        { label: (fl, state) => `Оплатить материалы (${formatMoney(scaleByWealth(state, 2500))})`, trait: 'familyFirst', risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 2500); return { money: -cost, happiness: 7, reputation: 2, message: 'Приют выглядит гораздо уютнее.' }; } },
        { label: 'Помочь своими руками бесплатно', trait: 'hardworker', risk: 'safe', effect: () => ({ energy: -15, happiness: 6, message: 'Физический труд тоже ценный вклад.' }) },
      ]},
      { text: (fl) => `Местная школа ${fl} просит спонсорскую помощь на нужды учеников.`, choices: [
        { label: (fl, state) => `Помочь школе (${formatMoney(scaleByWealth(state, 4000))})`, trait: 'familyFirst', risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 4000); return { money: -cost, reputation: 5, happiness: 6, message: 'Дети получили нужную помощь.' }; } },
        { label: 'Отказать, ситуация не позволяет', risk: 'safe', effect: () => ({ happiness: -2, message: 'В другой раз получится помочь.' }) },
      ]},
      { text: () => `Экологическая инициатива зовёт на субботник по очистке района.`, choices: [
        { label: 'Прийти и поучаствовать', trait: 'familyFirst', risk: 'safe', effect: () => ({ energy: -10, happiness: 5, reputation: 2, message: 'Район стал заметно чище — приятно.' }) },
        { label: 'Пропустить субботник', risk: 'safe', effect: () => ({ happiness: -1, message: 'Не всё получается успеть.' }) },
      ]},
      { text: (fl) => `Тебя просят выступить лицом благотворительной кампании ${fl}.`, choices: [
        { label: 'Согласиться быть лицом кампании', trait: 'familyFirst', risk: 'balanced', effect: (state) => (repOk(state, 40) ? { reputation: 8, happiness: 6, message: 'Кампания получила заметный отклик.' } : { happiness: 2, message: 'Участие прошло скромно, без особого шума.' }) },
        { label: 'Остаться в стороне', risk: 'safe', effect: () => ({ happiness: -1, message: 'Публичность не для всех.' }) },
      ]},
    ],
    ['бездомным людям', 'детям из детдомов', 'пожилым людям', 'пострадавшим от наводнения', 'многодетным семьям', 'приюту для животных', 'ветеранам', 'людям с инвалидностью'],
    always
  );

  const vices = buildFlavorFamily(
    'vices',
    [
      { text: (fl) => `Ты снова тянешься за фастфудом вместо нормального обеда — ${fl}.`, choices: [
        { label: 'Съесть фастфуд', risk: 'risky', effect: (state) => (healthOk(state, 55) ? { happiness: 4, message: 'Разок можно, организм справится.' } : { health: -6, happiness: 3, message: 'Желудок явно недоволен таким выбором.' }) },
        { label: 'Приготовить нормальную еду', trait: 'cautious', risk: 'safe', effect: () => ({ health: 3, happiness: -1, message: 'Дольше, зато полезнее.' }) },
      ]},
      { text: (fl, state) => `На маркетплейсе очередная скидка на то, что тебе не особо нужно, за ${formatMoney(scaleByWealth(state, 2500))} — ${fl}.`, choices: [
        { label: (fl, state) => `Купить под настроение (${formatMoney(scaleByWealth(state, 2500))})`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 2500); return { money: -cost, happiness: 6, message: 'Импульсивная покупка порадовала, хоть и была не нужна.' }; } },
        { label: 'Закрыть вкладку', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -1, message: 'Кошелёк цел, соблазн побеждён.' }) },
      ]},
      { text: (fl) => `Вечер затянулся у экрана телефона — скроллинг соцсетей не отпускает, ${fl}.`, choices: [
        { label: 'Лечь спать вовремя', trait: 'cautious', risk: 'safe', effect: () => ({ energy: 8, message: 'Здоровый сон того стоил.' }) },
        { label: 'Продолжать скроллить до ночи', risk: 'risky', effect: () => ({ energy: -14, happiness: 2, message: 'Утром об этом решении явно пожалеешь.' }) },
      ]},
      { text: (fl) => `Друзья зовут "по одной" в бар в будний вечер — ${fl}.`, choices: [
        { label: (fl, state) => `Пойти (${formatMoney(scaleByWealth(state, 1500))})`, risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 1500); return healthOk(state, 50) ? { money: -cost, happiness: 10, message: 'Вечер удался, самочувствие в порядке.' } : { money: -cost, happiness: 6, health: -5, message: 'Вечер удался, но организм не оценил.' }; } },
        { label: 'Остаться дома', trait: 'cautious', risk: 'safe', effect: () => ({ energy: 5, happiness: -2, message: 'Скучновато, зато трезво и полезно.' }) },
      ]},
      { text: (fl) => `Тебе снова хочется оформить очередную подписку "всего за копейки в месяц" — ${fl}.`, choices: [
        { label: (fl, state) => `Оформить подписку (${formatMoney(scaleByWealth(state, 400))}/мес)`, risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 400); return { money: -cost, happiness: 3, message: 'Ещё одна мелкая подписка в копилку расходов.' }; } },
        { label: 'Пересмотреть уже имеющиеся подписки', trait: 'cautious', risk: 'safe', effect: (state) => { const saved = scaleByWealth(state, 500); return { money: saved, happiness: 1, message: `Отменил ненужное — сэкономил ${formatMoney(saved)}.` }; } },
      ]},
      { text: (fl) => `На кассе супермаркета глаза разбегаются от импульсивных мелочей у выхода, ${fl}.`, choices: [
        { label: (fl, state) => `Набрать мелочей (${formatMoney(scaleByWealth(state, 600))})`, risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 600); return { money: -cost, happiness: 3, message: 'Мелкие радости тоже важны.' }; } },
        { label: 'Пройти мимо', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -1, message: 'Сила воли на высоте.' }) },
      ]},
      { text: (fl) => `Знакомый предлагает "всего разок" попробовать сомнительное вещество на вечеринке — ${fl}.`, choices: [
        { label: 'Отказаться категорически', trait: 'cautious', risk: 'safe', effect: () => ({ reputation: 2, happiness: -1, message: 'Здоровье и голова важнее одного вечера.' }) },
        { label: 'Согласиться "всего один раз"', trait: 'riskTaker', risk: 'risky', effect: (state) => { const hit = Math.round(scaleByStat(100 - state.health, 100, 10, 26)); return { health: -hit, happiness: 6, message: 'Вечер запомнился, но здоровье этого не оценило.' }; } },
      ]},
      { text: (fl) => `Ты снова засиделся(ась) за игрой допоздна вместо важных дел, ${fl}.`, choices: [
        { label: 'Выключить и лечь спать', trait: 'cautious', risk: 'safe', effect: () => ({ energy: 6, message: 'Дисциплина себя окупает.' }) },
        { label: 'Доиграть ещё "одну партию"', risk: 'risky', effect: () => ({ energy: -12, happiness: 4, message: 'Одна партия незаметно превратилась в пять.' }) },
      ]},
    ],
    ['в последнее время', 'который раз подряд', 'опять', 'по привычке', 'несмотря на все обещания себе', 'в очередной раз', 'машинально', 'не в силах остановиться'],
    always
  );

  const sidehustle = buildFlavorFamily(
    'sidehustle',
    [
      { text: (fl, state) => `Подвернулась возможность подработать ${fl} за ${formatMoney(scaleByWealth(state, 2500))}.`, choices: [
        { label: (fl, state) => `Взяться за подработку (${formatMoney(scaleByWealth(state, 2500))})`, trait: 'hardworker', risk: 'balanced', effect: (state) => { const pay = scaleByWealth(state, 2500); return { money: pay, energy: -14, message: `Подработка принесла ${formatMoney(pay)}.` }; } },
        { label: 'Отказаться, и так дел хватает', risk: 'safe', effect: () => ({ energy: 4, message: 'Отдых важнее лишних денег.' }) },
      ]},
      { text: () => `Клиент по мелкой подработке остался недоволен результатом и требует переделать бесплатно.`, choices: [
        { label: 'Переделать бесплатно', trait: 'cautious', risk: 'safe', effect: () => ({ energy: -10, reputation: 2, message: 'Клиент остался доволен, репутация не пострадала.' }) },
        { label: 'Настоять на своей правоте', risk: 'risky', effect: (state) => (repOk(state, 45) ? { reputation: 3, message: 'Аргументы оказались убедительными.' } : { reputation: -4, happiness: -4, message: 'Спор испортил репутацию среди знакомых.' }) },
      ]},
      { text: (fl) => `Появился шанс наладить постоянный поток заказов ${fl}.`, choices: [
        { label: (fl, state) => `Вложиться в развитие (${formatMoney(scaleByWealth(state, 4000))})`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 4000); return repOk(state, 40) ? { money: Math.round(cost * 1.6) - cost, reputation: 3, message: 'Вложение окупилось — заказы пошли стабильным потоком.' } : { money: -cost, happiness: -4, message: 'Вложение не оправдало себя.' }; } },
        { label: 'Развиваться постепенно', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 2, message: 'Медленно, зато без рисков.' }) },
      ]},
      { text: () => `Подработка неожиданно потребовала гораздо больше времени, чем обещали.`, choices: [
        { label: 'Доделать всё как обещал(а)', trait: 'hardworker', risk: 'balanced', effect: () => ({ energy: -18, reputation: 3, happiness: -2, message: 'Слово сдержано, хоть и вымотался.' }) },
        { label: 'Прекратить на середине', risk: 'risky', effect: () => ({ reputation: -4, happiness: 1, message: 'Недоделанная работа аукнется репутацией.' }) },
      ]},
      { text: (fl, state) => `За подработку ${fl} предлагают оплату натурой вместо денег на сумму ${formatMoney(scaleByWealth(state, 3000))}.`, choices: [
        { label: 'Согласиться на бартер', trait: 'riskTaker', risk: 'risky', effect: (state) => { const val = scaleByWealth(state, 3000); return traitOk(state, 'riskTaker', 2) ? { money: Math.round(val * 0.7), happiness: 4, message: 'Бартер удалось выгодно перепродать.' } : { happiness: -3, message: 'Полученное оказалось трудно применить или продать.' }; } },
        { label: 'Настоять на деньгах', trait: 'cautious', risk: 'safe', effect: (state) => { const pay = scaleByWealth(state, 2000); return { money: pay, message: `Договорился на деньги — получил ${formatMoney(pay)}.` }; } },
      ]},
      { text: () => `Появилась возможность обучить новичка твоему подработочному ремеслу за деньги.`, choices: [
        { label: (fl, state) => `Обучить за плату (${formatMoney(scaleByWealth(state, 2000))})`, trait: 'hardworker', risk: 'safe', effect: (state) => { const pay = scaleByWealth(state, 2000); return { money: pay, energy: -8, reputation: 1, message: `Обучение принесло ${formatMoney(pay)}.` }; } },
        { label: 'Отказаться делиться секретами ремесла', trait: 'shady', risk: 'safe', effect: () => ({ happiness: 1, message: 'Конкурентов меньше — тоже стратегия.' }) },
      ]},
      { text: (fl) => `Подработка ${fl} внезапно попала в поле зрения налоговой.`, choices: [
        { label: (fl, state) => `Легализовать доход (${formatMoney(scaleByWealth(state, 1500))})`, trait: 'cautious', risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 1500); return { money: -cost, reputation: 3, message: 'Всё официально — спится спокойнее.' }; } },
        { label: 'Продолжать в тени', trait: 'shady', risk: 'risky', effect: (state) => { const fine = scaleByWealth(state, 5000); return traitOk(state, 'shady', 4) ? { happiness: 2, message: 'Пронесло — вопросов больше не возникло.' } : { money: -fine, reputation: -5, message: `Поймали — штраф ${formatMoney(fine)}.` }; } },
      ]},
      { text: () => `Появился шанс объединиться с другим фрилансером и брать более крупные заказы вместе.`, choices: [
        { label: 'Объединиться в команду', trait: 'hardworker', risk: 'balanced', effect: (state) => { const gain = scaleByWealth(state, 3500); return repOk(state, 35) ? { money: gain, reputation: 3, message: 'Совместные заказы пошли даже лучше, чем ожидалось.' } : { money: Math.round(gain * 0.3), message: 'Сотрудничество принесло скромный, но результат.' }; } },
        { label: 'Работать соло, как привык(ла)', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 2, message: 'Полный контроль над своим делом важнее.' }) },
      ]},
    ],
    ['репетитором', 'фотографом на мероприятиях', 'водителем по вечерам', 'мастером по мелкому ремонту', 'копирайтером на заказ', 'декоратором на праздники', 'сборщиком заказов на складе', 'ведущим на мероприятиях'],
    always
  );

  const carlife = buildFlavorFamily(
    'carlife',
    [
      { text: (fl) => `Компания знакомых зовёт в автопробег ${fl} на выходные.`, choices: [
        { label: (fl, state) => `Поехать (${formatMoney(scaleByWealth(state, 3000))} на бензин и еду)`, risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 3000); return { money: -cost, happiness: 14, message: 'Автопробег подарил массу впечатлений.' }; } },
        { label: 'Остаться дома', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -2, message: 'Машина простаивает в гараже ещё один день.' }) },
      ]},
      { text: () => `На парковке кто-то поцарапал твою машину и уехал, не оставив записки.`, choices: [
        { label: (fl, state) => `Отполировать за свой счёт (${formatMoney(scaleByWealth(state, 4000))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 4000); return { money: -cost, happiness: 3, message: 'Машина снова как новая.' }; } },
        { label: 'Оставить царапину как есть', trait: 'cautious', risk: 'risky', effect: () => ({ happiness: -5, message: 'Царапина будет напоминать о неприятном случае.' }) },
      ]},
      { text: (fl) => `Знакомые просят одолжить машину ${fl}.`, choices: [
        { label: 'Одолжить машину', trait: 'familyFirst', risk: 'risky', effect: (state) => (repOk(state, 40) ? { happiness: 4, reputation: 2, message: 'Машину вернули в целости, все довольны.' } : { happiness: -6, message: 'Машину вернули не в лучшем состоянии.' }) },
        { label: 'Вежливо отказать', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -1, message: 'Своя машина — под своим контролем.' }) },
      ]},
      { text: () => `Пришло время планового технического обслуживания машины.`, choices: [
        { label: (fl, state) => `Пройти ТО в срок (${formatMoney(scaleByWealth(state, 5000))})`, trait: 'cautious', risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 5000); return { money: -cost, happiness: 3, message: 'Машина в отличном состоянии, можно не переживать.' }; } },
        { label: 'Отложить ТО на потом', risk: 'risky', effect: () => ({ happiness: -4, message: 'Рискованно, но пока обходится без последствий.' }) },
      ]},
      { text: (fl) => `Автоклуб зовёт на встречу единомышленников ${fl}.`, choices: [
        { label: (fl, state) => `Сходить на встречу (${formatMoney(scaleByWealth(state, 1200))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 1200); return { money: -cost, happiness: 8, reputation: 2, message: 'Приятно провёл время среди своих.' }; } },
        { label: 'Пропустить встречу', risk: 'safe', effect: () => ({ happiness: -1, message: 'Дела не отпустили.' }) },
      ]},
      { text: () => `Машину пытались угнать ночью — сигнализация спасла, но осадок остался.`, choices: [
        { label: (fl, state) => `Установить систему получше (${formatMoney(scaleByWealth(state, 6000))})`, trait: 'cautious', risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 6000); return { money: -cost, happiness: 4, message: 'Теперь спится намного спокойнее.' }; } },
        { label: 'Оставить как есть', trait: 'riskTaker', risk: 'risky', effect: () => ({ happiness: -3, message: 'Тревога за машину никуда не делась.' }) },
      ]},
    ],
    ['по побережью', 'в соседний город', 'по горной дороге', 'на природу с ночёвкой', 'на автомобильный фестиваль', 'по историческим местам'],
    hasCarFn
  );

  const remoteWork = buildFlavorFamily(
    'remoteWork',
    [
      { text: (fl) => `Появилась возможность взять полностью удалённый проект ${fl} — но нужна стабильная техника.`, choices: [
        { label: (fl, state) => `Взяться за проект (${formatMoney(scaleByWealth(state, 3000))} доход)`, trait: 'hardworker', risk: 'balanced', effect: (state) => { const pay = scaleByWealth(state, 3000); return { money: pay, energy: -10, message: `Удалённый проект принёс ${formatMoney(pay)}.` }; } },
        { label: 'Отказаться, слишком много рисков', risk: 'safe', effect: () => ({ energy: 4, message: 'Спокойствие дороже.' }) },
      ]},
      { text: (fl) => `Интернет дома отключили на весь день посреди важного созвона ${fl}.`, choices: [
        { label: (fl, state) => `Поехать работать в коворкинг (${formatMoney(scaleByWealth(state, 800))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 800); return { money: -cost, reputation: 2, message: 'Успел на созвон вовремя, репутация не пострадала.' }; } },
        { label: 'Пропустить созвон', risk: 'risky', effect: () => ({ reputation: -4, happiness: -3, message: 'Пропущенный созвон не остался незамеченным.' }) },
      ]},
      { text: (fl) => `Заказчик ${fl} просит быть на связи в неудобное время.`, choices: [
        { label: 'Подстроиться под заказчика', trait: 'hardworker', risk: 'balanced', effect: () => ({ energy: -14, money: 0, reputation: 3, message: 'Гибкость оценили — отношения с заказчиком укрепились.' }) },
        { label: 'Настоять на удобном графике', trait: 'cautious', risk: 'risky', effect: (state) => (repOk(state, 45) ? { reputation: 1, message: 'Заказчик согласился пойти навстречу.' } : { reputation: -3, happiness: -3, message: 'Заказчик остался недоволен негибкостью.' }) },
      ]},
      { text: (fl) => `Появилась возможность вести цифровой кочевой образ жизни ${fl}, работая из разных городов.`, choices: [
        { label: (fl, state) => `Попробовать (${formatMoney(scaleByWealth(state, 4000))} на переезд)`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 4000); return { money: -cost, happiness: 14, message: 'Смена обстановки пошла на пользу продуктивности.' }; } },
        { label: 'Остаться на привычном месте', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 1, message: 'Стабильность тоже имеет ценность.' }) },
      ]},
      { text: (fl) => `Техника внезапно подвела прямо во время оплачиваемого удалённого созвона ${fl}.`, choices: [
        { label: (fl, state) => `Срочно взять резервное устройство (${formatMoney(scaleByWealth(state, 2000))})`, risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 2000); return { money: -cost, reputation: 2, message: 'Созвон спасён в последний момент.' }; } },
        { label: 'Извиниться и перенести созвон', risk: 'risky', effect: () => ({ reputation: -2, happiness: -3, message: 'Клиент отнёсся с пониманием, но осадок остался.' }) },
      ]},
      { text: (fl) => `Компания ${fl} предлагает полностью перейти на удалёнку с сохранением зарплаты.`, choices: [
        { label: 'Согласиться на удалёнку', trait: 'hardworker', risk: 'balanced', effect: () => ({ happiness: 10, energy: 6, message: 'Удалёнка освободила уйму времени и сил.' }) },
        { label: 'Остаться в офисе', trait: 'cautious', risk: 'safe', effect: () => ({ reputation: 1, message: 'Личное присутствие тоже даёт свои плюсы.' }) },
      ]},
    ],
    ['с зарубежным клиентом', 'с новым стартапом', 'с крупным агентством', 'с постоянным заказчиком', 'из другого часового пояса', 'на бирже фриланса'],
    hasElectronicsFn
  );

  const crypto = buildFlavorFamily(
    'crypto',
    [
      { text: (fl, state) => `С домашнего ПК открыт график ${fl}. Похоже, сейчас удачный момент для сделки на ${formatMoney(scaleByWealth(state, 6000))}.`, choices: [
        { label: (fl, state) => `Купить на ${formatMoney(scaleByWealth(state, 6000))}`, trait: 'riskTaker', risk: 'risky', minigame: (state) => ({
            type: 'timing',
            title: 'Поймай момент для сделки',
            instructions: 'Цена ходит туда-сюда по шкале. Останови её точно в зелёной зоне, чтобы войти по выгодному курсу.',
            winText: 'Вошёл в сделку точно вовремя!',
            loseText: 'Промахнулся с моментом входа.',
            params: { period: 1300, zoneCenter: 0.5, zoneWidth: scaleByStat(state.reputation, 100, 0.12, 0.3), timeLimit: 6000 },
          }), effect: (state) => { const cost = scaleByWealth(state, 6000); const skill = state.reputation + traitCap(state, 'riskTaker', 8) * 4; if (miniSuccess(state, skill >= 55)) { const mult = scaleByStat(skill, 130, 1.3, 2.8); const payout = Math.round(cost * mult); return { money: payout - cost, happiness: 8, message: `Точный вход — чистая прибыль ${formatMoney(payout - cost)}.` }; } return { money: -cost, happiness: -8, message: `Момент выбран неверно — потеряно ${formatMoney(cost)}.` }; } },
        { label: 'Не рисковать', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: -1, message: 'Решил не лезть в волатильный рынок.' }) },
      ]},
      { text: (fl, state) => `Собрать майнинг-ферму дома из связки видеокарт обойдётся в ${formatMoney(scaleByWealth(state, 40000))}.`, choices: [
        { label: (fl, state) => `Собрать ферму (${formatMoney(scaleByWealth(state, 40000))})`, trait: 'hardworker', risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 40000); return traitOk(state, 'hardworker', 3) ? { money: Math.round(cost * 0.4), happiness: 4, message: 'Ферма настроена грамотно — стабильно капает доход.' } : { money: -Math.round(cost * 0.3), happiness: -4, message: 'Ферма грелась и глючила чаще, чем зарабатывала.' }; } },
        { label: 'Не связываться с железом', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 1, message: 'Электричество и шум того не стоят.' }) },
      ]},
      { text: (fl) => `Знакомый предлагает вложиться в коллекцию NFT на основе ${fl}.`, choices: [
        { label: (fl, state) => `Вложиться (${formatMoney(scaleByWealth(state, 3000))})`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 3000); return traitOk(state, 'riskTaker', 4) ? { money: Math.round(cost * 1.8) - cost, happiness: 6, message: 'Коллекция неожиданно выстрелила в цене.' } : { money: -cost, happiness: -5, message: 'Коллекция обесценилась почти до нуля.' }; } },
        { label: 'Обойти стороной', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 1, message: 'Слишком похоже на пузырь.' }) },
      ]},
      { text: (fl, state) => `Биржа предлагает застейкать ${fl} под проценты — заблокировать на время ради дохода.`, choices: [
        { label: (fl, state) => `Застейкать на ${formatMoney(scaleByWealth(state, 8000))}`, trait: 'cautious', risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 8000); const income = Math.round(cost * scaleByStat(state.reputation, 100, 0.05, 0.22)); return { money: income, happiness: 3, message: `Пассивный доход от стейкинга — ${formatMoney(income)}.` }; } },
        { label: 'Оставить деньги свободными', risk: 'safe', effect: () => ({ happiness: 1, message: 'Гибкость важнее пассивного процента.' }) },
      ]},
      { text: () => `Пришло письмо якобы от службы поддержки биржи с просьбой "подтвердить" сид-фразу кошелька.`, choices: [
        { label: 'Проигнорировать и не отвечать', trait: 'cautious', risk: 'safe', effect: () => ({ reputation: 1, message: 'Классический фишинг — мимо.' }) },
        { label: 'Перейти по ссылке и ввести данные', trait: 'riskTaker', risk: 'risky', effect: (state) => { const loss = scaleByWealth(state, 20000); return traitOk(state, 'cautious', 3) ? { happiness: 1, message: 'Что-то насторожило в последний момент — успел остановиться.' } : { money: -loss, happiness: -14, message: `Кошелёк опустошён мошенниками — потеряно ${formatMoney(loss)}.` }; } },
      ]},
      { text: (fl, state) => `Брокер предлагает открыть плечо x10 на ${fl} — риск огромный, но и потенциал тоже.`, choices: [
        { label: (fl, state) => `Открыть позицию с плечом (${formatMoney(scaleByWealth(state, 10000))})`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 10000); const skill = traitCap(state, 'riskTaker', 10) * 6 + state.reputation; if (traitOk(state, 'riskTaker', 6) && skill >= 90) { const gain = Math.round(cost * 3.5); return { money: gain - cost, happiness: 14, message: `Плечо сыграло в плюс — прибыль ${formatMoney(gain - cost)}.` }; } return { money: -cost, happiness: -12, message: 'Позицию ликвидировало почти мгновенно — плечо не прощает ошибок.' }; } },
        { label: 'Торговать без плеча', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 1, message: 'Медленнее, зато депозит цел.' }) },
      ]},
      { text: () => `Налоговая прислала запрос о доходах с криптовалютных операций.`, choices: [
        { label: (fl, state) => `Задекларировать всё честно (${formatMoney(scaleByWealth(state, 4000))})`, trait: 'cautious', risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 4000); return { money: -cost, reputation: 3, message: 'Всё официально — спится спокойнее.' }; } },
        { label: 'Промолчать и понадеяться на анонимность', trait: 'shady', risk: 'risky', effect: (state) => { const fine = scaleByWealth(state, 15000); return traitOk(state, 'shady', 4) ? { happiness: 2, message: 'Обошлось без вопросов.' } : { money: -fine, reputation: -6, message: `Вычислили — штраф ${formatMoney(fine)}.` }; } },
      ]},
      { text: (fl) => `Рынок ${fl} рухнул на десятки процентов за одну ночь.`, choices: [
        { label: 'Держать и не паниковать', trait: 'cautious', risk: 'risky', effect: (state) => (traitOk(state, 'cautious', 4) ? { happiness: 2, message: 'Выдержка окупилась — рынок постепенно отыграл падение.' } : { happiness: -8, message: 'Нервы сдали, но продавать всё равно не стал(а) — вышло не лучшим образом.' }) },
        { label: (fl, state) => `Зафиксировать убыток и выйти (−${formatMoney(scaleByWealth(state, 12000))})`, risk: 'safe', effect: (state) => { const loss = scaleByWealth(state, 12000); return { money: -loss, happiness: -4, message: `Вышел из рынка с убытком ${formatMoney(loss)}, зато без риска потерять больше.` }; } },
      ]},
    ],
    ['БитКоин', 'Эфириум', 'Догги-Коин', 'Соляно', 'Риплон', 'Кардано-Клон', 'Полигоint', 'безымянный альткоин'],
    hasElectronicsFn
  );

  const richEvents = buildFlavorFamily(
    'richEvents',
    [
      { text: (fl, state) => `В хорошем костюме тебя пускают на ${fl}. Там можно завести знакомство, которое принесёт ${formatMoney(scaleByWealth(state, 30000))}.`, choices: [
        { label: 'Активно налаживать связи', trait: 'hardworker', risk: 'balanced', effect: (state) => { const gain = scaleByWealth(state, 30000); return repOk(state, 40) ? { money: gain, reputation: 6, happiness: 10, message: `Знакомство оказалось невероятно полезным — ${formatMoney(gain)} чистыми.` } : { happiness: 4, message: 'Вечер прошёл приятно, но серьёзных контактов завести не удалось.' }; } },
        { label: 'Держаться скромно в стороне', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 2, message: 'Приятный вечер без лишних рисков.' }) },
      ]},
      { text: (fl, state) => `На ${fl} выставлен лот, который перекупщики берут в разы дороже уже на следующий день.`, choices: [
        { label: (fl, state) => `Купить лот (${formatMoney(scaleByWealth(state, 50000))})`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 50000); return repOk(state, 45) ? { money: Math.round(cost * 1.6) - cost, happiness: 10, message: 'Чутьё на ценные вещи не подвело — перепродажа принесла хорошую прибыль.' } : { money: -Math.round(cost * 0.3), happiness: -4, message: 'Лот оказался переоценён — часть денег потеряна.' }; } },
        { label: 'Просто посмотреть', risk: 'safe', effect: () => ({ happiness: 2, message: 'Красивое зрелище без финансового риска.' }) },
      ]},
      { text: (fl, state) => `На ${fl} к тебе подходит инвестор с предложением подписать контракт на ${formatMoney(scaleByWealth(state, 80000))}.`, choices: [
        { label: 'Подписать контракт на месте', trait: 'riskTaker', risk: 'risky', effect: (state) => { const gain = scaleByWealth(state, 80000); return repOk(state, 50) ? { money: gain, reputation: 5, message: `Репутация сыграла роль — контракт подписан на ${formatMoney(gain)}.` } : { happiness: -4, message: 'Инвестор передумал в последний момент, увидев недостаток связей.' }; } },
        { label: 'Взять время подумать', trait: 'cautious', risk: 'safe', effect: () => ({ reputation: 1, message: 'Осторожность в бизнесе не помешает.' }) },
      ]},
      { text: (fl, state) => `${cap(fl)} — отличный повод сделать щедрое пожертвование на глазах у нужных людей, ${formatMoney(scaleByWealth(state, 25000))}.`, choices: [
        { label: (fl, state) => `Пожертвовать публично (${formatMoney(scaleByWealth(state, 25000))})`, trait: 'familyFirst', risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 25000); return { money: -cost, reputation: 8, happiness: 8, message: 'Жест оценили — репутация в нужных кругах выросла заметно.' }; } },
        { label: 'Пожертвовать анонимно и скромно', risk: 'safe', effect: (state) => { const cost = scaleByWealth(state, 3000); return { money: -cost, happiness: 4, message: 'Скромный вклад без лишнего внимания.' }; } },
      ]},
      { text: (fl) => `На ${fl} модный дом предлагает тебе стать лицом рекламной кампании.`, choices: [
        { label: (fl, state) => `Согласиться на съёмку (${formatMoney(scaleByWealth(state, 60000))})`, risk: 'balanced', effect: (state) => { const gain = scaleByWealth(state, 60000); return repOk(state, 45) ? { money: gain, reputation: 7, happiness: 10, message: `Кампания принесла ${formatMoney(gain)} и известность.` } : { money: Math.round(gain * 0.2), happiness: 2, message: 'Съёмка прошла без особого резонанса.' }; } },
        { label: 'Отказаться, публичность не нужна', risk: 'safe', effect: () => ({ happiness: 1, message: 'Приватность дороже известности.' }) },
      ]},
      { text: (fl) => `На ${fl} тебе предлагают вступить в закрытый инвестиционный клуб за высокий взнос.`, choices: [
        { label: (fl, state) => `Вступить (${formatMoney(scaleByWealth(state, 100000))})`, trait: 'riskTaker', risk: 'risky', effect: (state) => { const cost = scaleByWealth(state, 100000); return repOk(state, 55) ? { money: Math.round(cost * 1.4) - cost, reputation: 6, message: 'Клуб открыл доступ к действительно ценным сделкам.' } : { money: -cost, happiness: -6, message: 'Взнос внесён, а обещанной пользы почти не последовало.' }; } },
        { label: 'Вежливо отказаться', trait: 'cautious', risk: 'safe', effect: () => ({ happiness: 1, message: 'Не всё то золото, что дорого стоит.' }) },
      ]},
      { text: (fl, state) => `На ${fl} завязался разговор с человеком, который явно может дать инсайд по крупной сделке.`, choices: [
        { label: 'Аккуратно выведать детали', trait: 'shady', risk: 'risky', effect: (state) => { const gain = scaleByWealth(state, 45000); return traitOk(state, 'shady', 2) ? { money: gain, message: `Инсайд оказался точным — заработано ${formatMoney(gain)}.` } : { happiness: -3, message: 'Информация оказалась пустышкой.' }; } },
        { label: 'Не лезть в чужие дела', trait: 'cautious', risk: 'safe', effect: () => ({ reputation: 1, message: 'Репутация человека, которому можно доверять, тоже чего-то стоит.' }) },
      ]},
      { text: (fl, state) => `Организаторы ${fl} просят тебя выступить спонсором следующего мероприятия за ${formatMoney(scaleByWealth(state, 70000))}.`, choices: [
        { label: (fl, state) => `Стать спонсором (${formatMoney(scaleByWealth(state, 70000))})`, trait: 'hardworker', risk: 'balanced', effect: (state) => { const cost = scaleByWealth(state, 70000); return repOk(state, 45) ? { money: -Math.round(cost * 0.4), reputation: 10, happiness: 8, message: 'Спонсорство окупилось связями почти наполовину.' } : { money: -cost, reputation: 5, message: 'Спонсорство обошлось недёшево, зато на виду у нужных людей.' }; } },
        { label: 'Отказаться от спонсорства', risk: 'safe', effect: () => ({ happiness: 1, message: 'Не все вложения обязаны быть публичными.' }) },
      ]},
    ],
    ['гала-ужине Форбс Клуба', 'закрытом аукционе искусства', 'яхт-вечеринке инвесторов', 'благотворительном балу элиты', 'частном показе мод', 'саммите топ-предпринимателей', 'вечере в загородном гольф-клубе', 'приватной презентации нового фонда'],
    richEventGate
  );

  /* ============ Сборка общего пула ============ */

  window.EVENTS = [].concat(
    invest, shopping, health, housing, transport, selfdev, gambling, business,
    survival, luxury, family, crime, weather, tech, general, work, selfEmployed,
    HAND_EVENTS,
    neighborsHome, gadgetsBreak, wardrobeWear, petcare, civicDuty, hobbyCost, socialEvents, selfcare,
    education, travel, romance, charity, vices, sidehustle, carlife, remoteWork,
    crypto, richEvents
  );
})();
