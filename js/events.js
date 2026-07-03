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

  /* ---------- детерминированные пороги вместо удачи ---------- */
  // Никакого Math.random() в исходах: результат каждого выбора зависит
  // только от текущих характеристик персонажа.
  const repOk = (state, threshold) => state.reputation >= threshold;
  const healthOk = (state, threshold) => state.health >= threshold;
  const energyOk = (state, threshold) => state.energy >= threshold;
  const traitOk = (state, key, threshold) => traitCap(state, key, 10) >= threshold;
  // масштаб награды/тяжести исхода — плавно зависит от характеристики, без броска кубика
  const scaleByStat = (statValue, statMax, min, max) => min + (max - min) * clampNum(statValue / statMax, 0, 1);

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
            { label: (state) => resolveDynamic(choiceA.label, state, a1, j), trait: choiceA.trait, risk: choiceA.risk, effect: (state) => choiceA.effect(state, a1, j) },
            { label: (state) => resolveDynamic(choiceB.label, state, a1, j), trait: choiceB.trait, risk: choiceB.risk, effect: (state) => choiceB.effect(state, a1, j) },
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
      effect: (state, a1, j) => {
        const cost = scaleByWealth(state, COST_BASE[j]);
        const skill = state.reputation + traitCap(state, 'riskTaker', 8) * 4;
        if (skill >= 55 + j * 10) {
          const mult = scaleByStat(skill, 130, 1.2, 2.6);
          const payout = Math.round(cost * mult);
          return { money: payout - cost, happiness: 8, reputation: 2, message: `Разбираешься в теме — вложение выстрелило! Чистая прибыль — ${formatMoney(payout - cost)}.` };
        }
        return { money: -cost, happiness: -10, message: `Не хватило ни репутации, ни опыта, чтобы разглядеть подвох. Инвестиция прогорела, потеряно ${formatMoney(cost)}.` };
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
      effect: (state, a1, j) => {
        const stake = scaleByWealth(state, COST_BASE[j] * 0.5);
        // казино не обыграть удачей — только многолетний опыт (черта "азартный" на максимуме) даёт системное преимущество
        if (traitOk(state, 'riskTaker', 8)) {
          const mult = scaleByStat(traitCap(state, 'riskTaker', 10), 10, 2, 4.2);
          const payout = Math.round(stake * mult);
          return { money: payout - stake, happiness: 12, message: `Годы за игровым столом наконец окупились! Чистый выигрыш — ${formatMoney(payout - stake)}.` };
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
      effect: (state, a1, j) => {
        const cost = scaleByWealth(state, COST_BASE[j] * 1.4);
        const skill = state.reputation + traitCap(state, 'riskTaker', 8) * 3 + traitCap(state, 'hardworker', 8) * 3;
        if (skill >= 75 + j * 8) {
          const mult = scaleByStat(skill, 150, 1.2, 2.5);
          const profit = Math.round(cost * mult);
          return { money: profit - cost, reputation: 4, message: `Опыт и репутация сделали своё дело! Чистая прибыль — ${formatMoney(profit - cost)}.` };
        }
        return { money: -cost, happiness: -6, message: `Не хватило деловой хватки — решение не сработало, потеряно ${formatMoney(cost)}.` };
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
        { label: (fl, state) => `Согласиться за ${formatMoney(scaleByWealth(state, 15000))}`, trait: 'shady', risk: 'risky', effect: (state) => { const pay = scaleByWealth(state, 15000); return traitOk(state, 'shady', 2) ? { money: pay, happiness: -4, message: `Опыт подсказал, как всё провернуть чисто — дело сделано, получено ${formatMoney(pay)}.` } : { jail: true, message: 'Не хватило опыта распознать ловушку. Тебя задержали с поличным.' }; } },
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

  /* ============ Сборка общего пула ============ */

  window.EVENTS = [].concat(
    invest, shopping, health, housing, transport, selfdev, gambling, business,
    survival, luxury, family, crime, weather, tech, general, work, selfEmployed,
    HAND_EVENTS
  );
})();
