/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Банк событий. Собирается из "шаблонных семей" (комбинации
   сценарий × вариант) и набора авторских событий, всего 400+.
   ========================================================= */

(function () {
  const COST_BASE = [700, 3500, 18000, 85000];
  const COST_TIER_NOTE = ['по минимуму', 'средний вариант', 'дорогой, но надёжный вариант', 'самый дорогой премиум-вариант'];

  const always = () => true;
  const isHomelessOrPoor = (s) => s.tier === 'homeless' || s.tier === 'poor';
  const isRichPlus = (s) => s.tier === 'rich' || s.tier === 'millionaire';
  const isBusinessy = (s) => s.money > 80000 || /владел|основател|директор|риелтор|предпринимат|стартап/i.test(s.job);
  const hasFamilyFn = (s) => s.hasFamily;
  const hasJobFn = (s) => s.hasJob;
  const noJobFn = (s) => !s.hasJob;
  const hasAllergyFn = (s) => !s.allergyNone;

  /* ---------- строители семей событий ---------- */

  function buildCostTierFamily(id, axis1, textFn, choiceA, choiceB, conditionFn) {
    const events = [];
    axis1.forEach((a1, i) => {
      for (let j = 0; j < 4; j++) {
        events.push({
          id: `${id}_${i}_${j}`,
          text: textFn(a1, j),
          conditions: conditionFn || always,
          choices: [
            { label: choiceA.label, effect: (state) => choiceA.effect(state, a1, j) },
            { label: choiceB.label, effect: (state) => choiceB.effect(state, a1, j) },
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
          text: sc.text(fl),
          conditions: conditionFn || always,
          choices: sc.choices.map((c) => ({
            label: typeof c.label === 'function' ? c.label(fl) : c.label,
            effect: (state) => c.effect(state, fl),
          })),
        });
      });
    });
    return events;
  }

  function costOrEndure(statKey, gainBase, badChance, badBase) {
    return {
      cost: (state, a1, j) => {
        const cost = scaleByWealth(state, COST_BASE[j]);
        const r = { money: -cost, happiness: 3, message: `Потратил ${formatMoney(cost)} — вопрос закрыт.` };
        r[statKey] = (r[statKey] || 0) + gainBase + j * 2;
        return r;
      },
      endure: (state, a1, j) => {
        if (chance(badChance)) {
          const hit = badBase + j * 3;
          const r = { happiness: -6, message: 'Стало хуже — экономия вышла боком.' };
          r[statKey] = (r[statKey] || 0) - hit;
          return r;
        }
        const saved = scaleByWealth(state, COST_BASE[j] * 0.15);
        return { money: saved, happiness: -1, message: `Кое-как обошёлся и сэкономил ${formatMoney(saved)}.` };
      },
    };
  }

  /* ============ 1. COST-TIER СЕМЬИ (8 × 24 = 192) ============ */

  const invest = buildCostTierFamily(
    'invest',
    ['акции стартапа знакомого', 'новую нашумевшую криптовалюту', 'франшизу кофейни у метро', 'паевой инвестиционный фонд', 'форекс-счёт у знакомого трейдера', 'долю в бизнесе одноклассника'],
    (a1, j) => `Знакомый предлагает вложить ${['небольшую сумму', 'заметную часть сбережений', 'половину всех денег', 'вообще всё, что есть'][j]} в ${a1}. Обещает быструю прибыль.`,
    {
      label: 'Рискнуть и вложиться',
      effect: (state, a1, j) => {
        const cost = scaleByWealth(state, COST_BASE[j]);
        if (chance(0.42 - j * 0.04)) {
          const profit = Math.round(cost * rand(1.3, 3));
          return { money: profit, happiness: 8, reputation: 2, message: `Вложение выстрелило! Прибыль — ${formatMoney(profit)}.` };
        }
        return { money: -cost, happiness: -10, message: `Инвестиция прогорела. Потеряно ${formatMoney(cost)}.` };
      },
    },
    { label: 'Отказаться, слишком рискованно', effect: () => ({ happiness: -1, message: 'Ты решил не рисковать и остался при своих.' }) }
  );

  const CHEAP_PLACE = ['рынке у дяди Бори', 'секонд-хенде', 'руках по объявлению', 'соседней лавке без вывески'];
  const RELIABLE_PLACE = ['сетевом супермаркете «Пятёрочка»', 'фирменном магазине', 'официальном интернет-магазине', 'крупном сетевом гипермаркете'];
  const shopping = buildCostTierFamily(
    'shopping',
    ['продукты на неделю', 'зимнюю куртку', 'подарок близкому человеку', 'новый телефон', 'лекарства из списка врача', 'мебель для дома'],
    (a1, j) => `Нужно купить ${a1}: можно сэкономить и поехать на ${CHEAP_PLACE[j]}, а можно переплатить и взять в ${RELIABLE_PLACE[j]}.`,
    {
      label: 'Сэкономить и рискнуть',
      effect: (state, a1, j) => {
        const saved = scaleByWealth(state, COST_BASE[j] * 0.35);
        if (chance(0.3)) {
          const healthHit = a1.includes('лекар') ? -14 : -5;
          return { money: -Math.round(saved * 0.3), health: healthHit, happiness: -5, message: 'Товар оказался некачественным, пришлось доплачивать за нормальный.' };
        }
        return { money: saved, happiness: 3, message: `Сэкономил ${formatMoney(saved)}, всё пригодилось.` };
      },
    },
    {
      label: 'Переплатить, но надёжно',
      effect: (state, a1, j) => {
        const cost = scaleByWealth(state, COST_BASE[j] * 0.55);
        return { money: -cost, happiness: 4, reputation: 1, message: `Купил без забот за ${formatMoney(cost)}.` };
      },
    }
  );

  const healthFx = costOrEndure('health', 10, 0.4, 8);
  const health = buildCostTierFamily(
    'health',
    ['подхватил простуду, которая не проходит уже неделю', 'замучила бессонница и хроническая усталость', 'подступает эмоциональное выгорание на работе', 'потянул спину, поднимая тяжёлое', 'пора сделать плановый осмотр у врача', 'разболелся зуб, терпеть больше нет сил'],
    (a1, j) => `Ты ${a1}. Пойти лечиться (${COST_TIER_NOTE[j]}) или перетерпеть?`,
    { label: 'Заняться здоровьем', effect: healthFx.cost },
    { label: 'Перетерпеть, само пройдёт', effect: healthFx.endure }
  );

  const housingFx = costOrEndure('happiness', 6, 0.35, 10);
  const housing = buildCostTierFamily(
    'housing',
    ['потекла крыша после сильного дождя', 'сосед сверху устроил потоп в квартире', 'хозяин жилья резко поднял плату', 'управляющая компания требует оплатить капремонт', 'сломались холодильник и стиральная машина разом', 'нужно срочно менять проводку, пока не случился пожар'],
    (a1, j) => `Дома беда: ${a1}. Решить вопрос (${COST_TIER_NOTE[j]}) или потянуть время?`,
    { label: 'Решить вопрос нормально', effect: housingFx.cost },
    { label: 'Сделать на скорую руку', effect: housingFx.endure }
  );

  const transportFx = costOrEndure('energy', 6, 0.35, 10);
  const transport = buildCostTierFamily(
    'transport',
    ['сломалась машина по дороге на работу', 'попал в небольшое ДТП не по своей вине', 'эвакуатор увёз машину со штрафстоянки', 'пришёл штраф за нарушение ПДД', 'двигатель начал барахлить', 'лопнуло колесо прямо на трассе'],
    (a1, j) => `С транспортом беда: ${a1}. Разобраться (${COST_TIER_NOTE[j]}) или потерпеть неудобства?`,
    { label: 'Разобраться по-нормальному', effect: transportFx.cost },
    { label: 'Перетерпеть неудобства', effect: transportFx.endure }
  );

  const selfdev = buildCostTierFamily(
    'selfdev',
    ['предложили курс английского языка', 'появилась возможность поступить на MBA', 'абонемент в спортзал горит скидкой', 'психотерапевт посоветовал пройти курс сессий', 'вышла книга-бестселлер о личных финансах', 'знакомый коуч предлагает менторство'],
    (a1, j) => `Тебе ${a1} — вариант ${COST_TIER_NOTE[j]}. Вложиться в себя?`,
    {
      label: 'Вложиться в себя',
      effect: (state, a1, j) => {
        const cost = scaleByWealth(state, COST_BASE[j] * 0.7);
        return { money: -cost, happiness: 6, reputation: 3, energy: -4, message: `Потратил ${formatMoney(cost)} на саморазвитие. Чувствуешь себя увереннее.` };
      },
    },
    { label: 'Не тратить время и деньги', effect: () => ({ energy: 3, happiness: -2, message: 'Решил, что и так сойдёт.' }) }
  );

  const gambling = buildCostTierFamily(
    'gambling',
    ['зашёл в казино на пять минут', 'друзья зовут поставить на футбольный матч', 'сел за покерный стол с незнакомцами', 'купил лотерейный билет у метро', 'открыл сайт с онлайн-рулеткой', 'поставил на скачках на удачу'],
    (a1, j) => `Ты ${a1}. Ставка ${['символическая', 'ощутимая', 'крупная', 'вообще все деньги'][j]}.`,
    {
      label: 'Рискнуть',
      effect: (state, a1, j) => {
        const stake = scaleByWealth(state, COST_BASE[j] * 0.5);
        if (chance(0.32)) {
          const win = Math.round(stake * rand(2, 5));
          return { money: win, happiness: 12, message: `Невероятно! Выигрыш — ${formatMoney(win)}.` };
        }
        return { money: -stake, happiness: -8, message: `Азарт подвёл — потеряно ${formatMoney(stake)}.` };
      },
    },
    { label: 'Уйти, не рискуя', effect: () => ({ happiness: -1, message: 'Ты решил не искушать судьбу.' }) }
  );

  const business = buildCostTierFamily(
    'business',
    ['нанять ещё одного сотрудника', 'открыть филиал в новом районе', 'конкурент начал демпинговать цены', 'поставщик подвёл с крупной поставкой', 'нагрянула налоговая проверка', 'инвестор предлагает деньги за долю в деле'],
    (a1, j) => `По бизнесу вопрос: ${a1}. Решение по масштабу — ${COST_TIER_NOTE[j]}.`,
    {
      label: 'Вложиться и рискнуть ради роста',
      effect: (state, a1, j) => {
        const cost = scaleByWealth(state, COST_BASE[j] * 1.4);
        if (chance(0.5)) {
          const profit = Math.round(cost * rand(1.2, 2.5));
          return { money: profit - cost, reputation: 4, message: `Ход окупился! Чистая прибыль — ${formatMoney(profit - cost)}.` };
        }
        return { money: -cost, happiness: -6, message: `Решение не сработало, потеряно ${formatMoney(cost)}.` };
      },
    },
    {
      label: 'Сыграть осторожно',
      effect: (state, a1, j) => {
        const saved = scaleByWealth(state, COST_BASE[j] * 0.2);
        return { money: Math.round(saved * 0.2), happiness: -2, reputation: -1, message: 'Ты не стал рисковать, но и не вырос.' };
      },
    },
    isBusinessy
  );

  /* ============ 2. FLAVOR-СЕМЬИ (8 × 24 = 192) ============ */

  const survival = buildFlavorFamily(
    'survival',
    [
      { text: (fl) => `Ты нашёл у ${fl} почти нетронутую еду в мусорном баке. Есть или пройти мимо?`, choices: [
        { label: 'Съесть, голод не тётка', effect: (state) => (chance(0.35) ? { health: -18, happiness: -6, message: 'Отравление. Пришлось тяжело.' } : { health: 6, happiness: 4, message: 'Обошлось, и даже сытно.' }) },
        { label: 'Пройти мимо', effect: () => ({ happiness: -3, message: 'Голод остался, зато безопасно.' }) },
      ]},
      { text: (fl) => `Мужчина у ${fl} предлагает разгрузить машину за пару часов и заплатить наличными.`, choices: [
        { label: 'Согласиться поработать', effect: (state) => { const pay = scaleByWealth(state, 1200); return { money: pay, energy: -20, health: -3, message: `Заработал ${formatMoney(pay)}, но вымотался.` }; } },
        { label: 'Отказаться, выглядит подозрительно', effect: () => ({ happiness: -1, message: 'Решил не рисковать понапрасну.' }) },
      ]},
      { text: (fl) => `Охранник у ${fl} требует, чтобы ты ушёл, иначе вызовет полицию.`, choices: [
        { label: 'Уйти без споров', effect: () => ({ energy: -8, happiness: -2, message: 'Пришлось искать новое место.' }) },
        { label: 'Попытаться поспорить', effect: () => (chance(0.4) ? { reputation: -6, happiness: -10, message: 'Приехала полиция, разговор был неприятным.' } : { happiness: 2, message: 'Охранник махнул рукой и отстал.' }) },
      ]},
      { text: (fl) => `Волонтёры у ${fl} раздают горячий чай, еду и тёплые вещи.`, choices: [
        { label: 'Взять помощь', effect: () => ({ health: 10, happiness: 8, message: 'Стало немного легче.' }) },
        { label: 'Отказаться, гордость не позволяет', effect: () => ({ happiness: -4, reputation: 2, message: 'Тяжело, зато по-своему.' }) },
      ]},
      { text: (fl) => `Ночью у ${fl} резко похолодало, а укрыться нечем.`, choices: [
        { label: 'Искать любое укрытие', effect: () => (chance(0.3) ? { health: -15, message: 'Ночь выдалась тяжёлой, здоровье подкосило.' } : { health: -3, energy: -5, message: 'Кое-как пережил холодную ночь.' }) },
        { label: 'Не спать и двигаться всю ночь', effect: () => ({ energy: -25, health: -2, message: 'Не замёрз, но вымотался в ноль.' }) },
      ]},
      { text: (fl) => `Пока ты отдыхал у ${fl}, кто-то рылся в твоих вещах.`, choices: [
        { label: 'Броситься проверять и разбираться', effect: (state) => { if (chance(0.5)) return { happiness: -2, message: 'Успел, ничего не пропало.' }; const loss = scaleByWealth(state, 300); return { money: -loss, happiness: -8, message: `Пропали последние ${formatMoney(loss)}.` }; } },
        { label: 'Смириться, что бы ни было', effect: () => ({ happiness: -5, message: 'Что случилось, то случилось.' }) },
      ]},
    ],
    ['вокзала', 'торгового центра', 'центрального рынка', 'заброшенной стройки'],
    isHomelessOrPoor
  );

  const luxury = buildFlavorFamily(
    'luxury',
    [
      { text: (fl) => `На аукционе ${fl} подначивает тебя сделать ставку на редкую картину.`, choices: [
        { label: 'Сделать крупную ставку', effect: (state) => { const cost = scaleByWealth(state, 60000); return chance(0.4) ? { money: -cost, happiness: 14, reputation: 6, message: `Картина твоя за ${formatMoney(cost)}! Все восхищены.` } : { money: -Math.round(cost * 1.3), happiness: -6, message: 'Ты явно переплатил в азарте торгов.' }; } },
        { label: 'Остаться зрителем', effect: () => ({ happiness: -1, message: 'Может, и к лучшему.' }) },
      ]},
      { text: (fl) => `${cap(fl)} просит внести крупный взнос на благотворительном балу.`, choices: [
        { label: 'Внести щедрый взнос', effect: (state) => { const cost = scaleByWealth(state, 40000); return { money: -cost, reputation: 8, happiness: 6, message: `Пожертвовал ${formatMoney(cost)}. Пресса это заметила.` }; } },
        { label: 'Отделаться символической суммой', effect: (state) => { const cost = scaleByWealth(state, 3000); return { money: -cost, reputation: -2, message: 'Скромный взнос заметили — не в лучшую сторону.' }; } },
      ]},
      { text: (fl) => `Брокер яхт даёт тебе и ${fl} шанс купить яхту с большой скидкой прямо сейчас.`, choices: [
        { label: 'Купить яхту', effect: (state) => { const cost = scaleByWealth(state, 300000); return { money: -cost, happiness: 20, reputation: 5, message: `Теперь у тебя есть яхта! Потрачено ${formatMoney(cost)}.` }; } },
        { label: 'Отказаться, слишком спонтанно', effect: () => ({ happiness: -2, message: 'Скидка сгорела, зато деньги целы.' }) },
      ]},
      { text: (fl) => `${cap(fl)} зовёт инвестировать в футбольный клуб.`, choices: [
        { label: 'Инвестировать', effect: (state) => { const cost = scaleByWealth(state, 120000); return chance(0.45) ? { money: Math.round(cost * rand(1.5, 3)) - cost, reputation: 5, message: 'Клуб взлетел в лиге, вложение окупилось с лихвой!' } : { money: -cost, happiness: -8, message: 'Клуб вылетел из лиги, деньги пропали.' }; } },
        { label: 'Отказаться', effect: () => ({ happiness: -1, message: 'Футбол — это не про инвестиции.' }) },
      ]},
      { text: (fl) => `Тебя поймали папарацци в неловкой ситуации. ${cap(fl)} советует нанять пиарщика.`, choices: [
        { label: 'Нанять пиарщика', effect: (state) => { const cost = scaleByWealth(state, 25000); return { money: -cost, reputation: 10, message: 'Репутация спасена, скандал замят.' }; } },
        { label: 'Проигнорировать', effect: () => (chance(0.5) ? { reputation: -12, happiness: -8, message: 'Скандал разросся в прессе.' } : { happiness: 2, message: 'Всё само собой утихло.' }) },
      ]},
      { text: (fl) => `${cap(fl)} предлагает арендовать частный остров на сезон.`, choices: [
        { label: 'Арендовать остров', effect: (state) => { const cost = scaleByWealth(state, 200000); return { money: -cost, happiness: 22, energy: 15, message: `Незабываемый отдых обошёлся в ${formatMoney(cost)}.` }; } },
        { label: 'Отказаться, лучше вложить деньги', effect: (state) => { const gain = scaleByWealth(state, 15000); return { money: gain, happiness: -3, message: 'Ты предпочёл выгоду отдыху.' }; } },
      ]},
    ],
    ['старый деловой партнёр', 'светская знакомая', 'настойчивый папарацци', 'конкурент по бизнесу'],
    isRichPlus
  );

  const family = buildFlavorFamily(
    'family',
    [
      { text: (fl) => `${cap(fl)} просит купить дорогую вещь, о которой давно мечтал(а).`, choices: [
        { label: 'Исполнить мечту', effect: (state) => { const cost = scaleByWealth(state, 5000); return { money: -cost, happiness: 10, reputation: 2, message: `Потратил ${formatMoney(cost)}, зато сколько радости.` }; } },
        { label: 'Объяснить, что сейчас не время', effect: () => ({ happiness: -6, message: 'Пришлось разочаровать близкого человека.' }) },
      ]},
      { text: (fl) => `${cap(fl)} предлагает переехать в другой город ради новой жизни.`, choices: [
        { label: 'Согласиться на переезд', effect: (state) => { const cost = scaleByWealth(state, 8000); return chance(0.5) ? { money: -cost, happiness: 12, energy: -10, message: 'Переезд оказался лучшим решением!' } : { money: -Math.round(cost * 1.5), happiness: -6, energy: -15, message: 'Переезд дался тяжело и дорого.' }; } },
        { label: 'Остаться на месте', effect: () => ({ happiness: -4, message: 'Привычная жизнь продолжается.' }) },
      ]},
      { text: (fl) => `${cap(fl)} просит одолжить крупную сумму денег без гарантии возврата.`, choices: [
        { label: 'Дать в долг', effect: (state) => { const cost = scaleByWealth(state, 10000); return { money: -cost, happiness: 5, reputation: 2, message: `Дал ${formatMoney(cost)}. Семья это оценила.` }; } },
        { label: 'Отказать', effect: () => ({ happiness: -7, reputation: -2, message: 'В семье повисло неловкое молчание.' }) },
      ]},
      { text: () => `Внезапно нагрянул семейный праздник, и все ждут, что именно ты его организуешь.`, choices: [
        { label: 'Устроить настоящий праздник', effect: (state) => { const cost = scaleByWealth(state, 4000); return { money: -cost, happiness: 14, message: `Праздник удался! Потрачено ${formatMoney(cost)}.` }; } },
        { label: 'Отметить скромно', effect: () => ({ happiness: 2, message: 'Скромно, но по-домашнему тепло.' }) },
      ]},
      { text: () => `Из-за денег в семье вспыхнула серьёзная ссора.`, choices: [
        { label: 'Пойти на компромисс', effect: () => ({ happiness: 4, energy: -6, message: 'Удалось всех помирить.' }) },
        { label: 'Стоять на своём', effect: () => ({ happiness: -8, reputation: -2, message: 'Ссора надолго испортила настроение в доме.' }) },
      ]},
      { text: (fl) => `${cap(fl)} тяжело заболел(а), и врачи говорят, что лечение недешёвое.`, choices: [
        { label: 'Оплатить лечение любой ценой', effect: (state) => { const cost = scaleByWealth(state, 25000); return { money: -cost, happiness: 8, health: -2, message: `Заплатил ${formatMoney(cost)} за лечение. Здоровье близкого важнее денег.` }; } },
        { label: 'Искать бесплатные варианты лечения', effect: () => ({ happiness: -10, energy: -10, message: 'Пришлось потратить много нервов и времени.' }) },
      ]},
    ],
    ['супруг(а)', 'ребёнок', 'родитель', 'дальний родственник'],
    hasFamilyFn
  );

  const crime = buildFlavorFamily(
    'crime',
    [
      { text: (fl) => `${cap(fl)} предлагает перевезти "посылку" за хорошие деньги, не задавая вопросов.`, choices: [
        { label: 'Согласиться ради денег', effect: (state) => { const pay = scaleByWealth(state, 15000); return chance(0.25) ? { jail: true, message: 'Это была ловушка. Тебя задержали с поличным.' } : { money: pay, happiness: -4, message: `Дело сделано, получено ${formatMoney(pay)}. Но неспокойно на душе.` }; } },
        { label: 'Отказаться', effect: () => ({ reputation: 2, message: 'Мало ли что там было в этой посылке.' }) },
      ]},
      { text: (fl) => `${cap(fl)} зовёт поучаствовать в схеме, похожей на финансовую пирамиду.`, choices: [
        { label: 'Войти в схему', effect: (state) => { const cost = scaleByWealth(state, 10000); return chance(0.3) ? { money: Math.round(cost * 1.5), message: 'Успел выйти вовремя, заработав неплохо.' } : { money: -cost, reputation: -4, happiness: -8, message: 'Пирамида рухнула, деньги пропали.' }; } },
        { label: 'Отказаться', effect: () => ({ happiness: 1, message: 'Обошёл стороной сомнительную схему.' }) },
      ]},
      { text: (fl) => `${cap(fl)} намекает, что маленькая взятка решит все проблемы с проверкой.`, choices: [
        { label: 'Дать взятку', effect: (state) => { const cost = scaleByWealth(state, 8000); return chance(0.2) ? { jail: true, message: 'Разговор записывали. Взятка обернулась уголовным делом.' } : { money: -cost, energy: 5, message: 'Проблема решена быстро и тихо.' }; } },
        { label: 'Решить вопрос по правилам', effect: () => ({ energy: -10, happiness: -2, message: 'Дольше, зато чисто.' }) },
      ]},
      { text: (fl) => `${cap(fl)} рассказывает способ вообще не платить налоги.`, choices: [
        { label: 'Воспользоваться схемой', effect: (state) => { const save = scaleByWealth(state, 20000); return chance(0.25) ? { jail: true, message: 'Налоговая всё же докопалась. Дело дошло до суда.' } : { money: save, message: `Сэкономил на налогах ${formatMoney(save)}.` }; } },
        { label: 'Платить честно', effect: () => ({ reputation: 3, message: 'Спокойный сон дороже сомнительной экономии.' }) },
      ]},
      { text: (fl) => `${cap(fl)} предлагает заработать на продаже чужих личных данных.`, choices: [
        { label: 'Согласиться', effect: (state) => { const pay = scaleByWealth(state, 12000); return chance(0.3) ? { jail: true, message: 'Тебя вычислили по цифровому следу.' } : { money: pay, happiness: -6, message: `Получил ${formatMoney(pay)}, но чувствуешь себя мерзко.` }; } },
        { label: 'Отказаться', effect: () => ({ reputation: 3, message: 'Некоторые вещи не продаются.' }) },
      ]},
      { text: (fl) => `${cap(fl)} предлагает подделать документы ради выгодного кредита.`, choices: [
        { label: 'Подделать документы', effect: (state) => { const gain = scaleByWealth(state, 30000); return chance(0.28) ? { jail: true, message: 'Банк передал дело в полицию.' } : { money: gain, message: `Кредит одобрен, получено ${formatMoney(gain)}.` }; } },
        { label: 'Отказаться и жить по средствам', effect: () => ({ happiness: 1, message: 'Меньше денег, зато меньше рисков.' }) },
      ]},
    ],
    ['подозрительный тип в подворотне', 'старый знакомый с тёмным прошлым', 'аноним в мессенджере', 'деловой партнёр с сомнительной репутацией'],
    always
  );

  const weather = buildFlavorFamily(
    'weather',
    [
      { text: (fl) => `Ударил сильный мороз, и в ${fl} начались перебои с отоплением.`, choices: [
        { label: 'Утеплиться и переждать', effect: (state) => { const cost = scaleByWealth(state, 2000); return { money: -cost, health: 2, message: `Потратился на обогреватель — ${formatMoney(cost)}.` }; } },
        { label: 'Терпеть холод', effect: () => ({ health: -8, happiness: -4, message: 'Пришлось померзнуть.' }) },
      ]},
      { text: (fl) => `Внезапное наводнение подтопило ${fl}.`, choices: [
        { label: 'Организовать откачку воды и ремонт', effect: (state) => { const cost = scaleByWealth(state, 6000); return { money: -cost, happiness: 2, message: `Устранил последствия за ${formatMoney(cost)}.` }; } },
        { label: 'Переждать и разобраться позже', effect: () => ({ happiness: -10, health: -4, message: 'Ущерб только увеличился.' }) },
      ]},
      { text: (fl) => `Стоит невыносимая жара и засуха в ${fl}.`, choices: [
        { label: 'Купить кондиционер и воду про запас', effect: (state) => { const cost = scaleByWealth(state, 3000); return { money: -cost, health: 5, message: `Пережил жару с комфортом за ${formatMoney(cost)}.` }; } },
        { label: 'Терпеть жару', effect: () => ({ health: -6, energy: -10, message: 'Жара вымотала.' }) },
      ]},
      { text: (fl) => `Гроза повредила имущество в ${fl}.`, choices: [
        { label: 'Быстро всё починить', effect: (state) => { const cost = scaleByWealth(state, 5000); return { money: -cost, happiness: 3, message: `Ремонт обошёлся в ${formatMoney(cost)}.` }; } },
        { label: 'Оставить как есть', effect: () => ({ happiness: -6, message: 'Поломка так и осталась напоминанием о грозе.' }) },
      ]},
      { text: (fl) => `Снегопад отрезал ${fl} от остального города на пару дней.`, choices: [
        { label: 'Закупиться заранее всем необходимым', effect: (state) => { const cost = scaleByWealth(state, 2500); return { money: -cost, happiness: 4, message: `Переждал с комфортом, потратив ${formatMoney(cost)}.` }; } },
        { label: 'Понадеяться, что пронесёт', effect: () => (chance(0.4) ? { health: -10, happiness: -8, message: 'Еда закончилась раньше, чем расчистили дороги.' } : { happiness: 1, message: 'Обошлось, снег быстро убрали.' }) },
      ]},
      { text: (fl) => `Прошёл ураган и наделал бед в ${fl}.`, choices: [
        { label: 'Помочь соседям и восстановить всё сообща', effect: (state) => { const cost = scaleByWealth(state, 4000); return { money: -cost, reputation: 6, happiness: 6, message: `Все объединились, дело пошло быстрее. Потрачено ${formatMoney(cost)}.` }; } },
        { label: 'Разбираться в одиночку', effect: () => ({ energy: -15, happiness: -4, message: 'Пришлось тяжело, но справился сам.' }) },
      ]},
    ],
    ['твоего района', 'центра города', 'пригорода', 'места, где ты сейчас находишься'],
    always
  );

  const tech = buildFlavorFamily(
    'tech',
    [
      { text: (fl) => `О тебе неожиданно завирусился ролик ${fl}.`, choices: [
        { label: 'Использовать хайп с пользой', effect: (state) => { const gain = scaleByWealth(state, 4000); return { money: gain, reputation: 6, happiness: 8, message: `Известность принесла ${formatMoney(gain)}.` }; } },
        { label: 'Переждать в стороне', effect: () => ({ happiness: -1, message: 'Хайп прошёл мимо, зато спокойно.' }) },
      ]},
      { text: (fl) => `Взломали твой аккаунт ${fl}.`, choices: [
        { label: 'Срочно восстанавливать и менять пароли', effect: (state) => { const cost = scaleByWealth(state, 1000); return { money: -cost, energy: -8, message: 'Аккаунт удалось спасти.' }; } },
        { label: 'Забить и завести новый', effect: () => ({ happiness: -6, reputation: -2, message: 'Часть контактов и репутации потеряна.' }) },
      ]},
      { text: (fl) => `Тебе предлагают дорогую подписку ${fl} с "гарантированным доходом".`, choices: [
        { label: 'Оформить подписку', effect: (state) => { const cost = scaleByWealth(state, 5000); return chance(0.25) ? { money: Math.round(cost * 2) - cost, message: 'На удивление, сервис реально сработал!' } : { money: -cost, happiness: -6, message: 'Классический развод на деньги.' }; } },
        { label: 'Не вестись', effect: () => ({ reputation: 1, message: 'Бесплатный сыр бывает только в мышеловке.' }) },
      ]},
      { text: () => `Мошенники звонят и представляются службой безопасности банка.`, choices: [
        { label: 'Поверить и выполнить инструкции', effect: (state) => { const loss = scaleByWealth(state, 8000); return chance(0.6) ? { money: -loss, happiness: -14, message: `Со счёта списали ${formatMoney(loss)}. Классическая схема мошенников.` } : { happiness: -2, message: 'В последний момент что-то насторожило, успел остановиться.' }; } },
        { label: 'Положить трубку и перезвонить в банк напрямую', effect: () => ({ happiness: 2, reputation: 1, message: 'Бдительность спасла деньги.' }) },
      ]},
      { text: () => `Криптокошелёк, который ты когда-то завёл ради интереса, внезапно подскочил в цене.`, choices: [
        { label: 'Продать всё немедленно', effect: (state) => { const gain = scaleByWealth(state, 7000); return { money: gain, happiness: 9, message: `Зафиксировал прибыль — ${formatMoney(gain)}.` }; } },
        { label: 'Придержать, вдруг вырастет ещё', effect: (state) => { if (chance(0.4)) { const gain = scaleByWealth(state, 15000); return { money: gain, happiness: 12, message: 'Ставка сыграла, цена выросла ещё больше!' }; } const loss = scaleByWealth(state, 6000); return { money: -loss, happiness: -8, message: 'Цена рухнула обратно, часть прибыли потеряна.' }; } },
      ]},
      { text: (fl) => `Тебе предлагают платную рекламу ${fl}, раз уж у тебя есть хоть какая-то аудитория.`, choices: [
        { label: 'Согласиться на рекламу', effect: (state) => { const gain = scaleByWealth(state, 3500); return { money: gain, reputation: -1, message: `Заработал ${formatMoney(gain)}, но часть подписчиков поворчала.` }; } },
        { label: 'Отказаться, беречь репутацию', effect: () => ({ reputation: 2, message: 'Аудитория оценила честность.' }) },
      ]},
    ],
    ['в соцсети', 'на видеохостинге', 'в мессенджере', 'на маркетплейсе'],
    always
  );

  const general = buildFlavorFamily(
    'general',
    [
      { text: (fl) => `Ты встретил старого друга детства ${fl}.`, choices: [
        { label: 'Посидеть, вспомнить молодость', effect: (state) => { const cost = scaleByWealth(state, 800); return { money: -cost, happiness: 10, message: 'Приятно провёл время, хоть и потратился.' }; } },
        { label: 'Коротко поздороваться и пойти дальше', effect: () => ({ happiness: 1, message: 'Дела не ждут.' }) },
      ]},
      { text: (fl) => `Ты нашёл забытый кем-то кошелёк ${fl}.`, choices: [
        { label: 'Вернуть владельцу', effect: () => ({ reputation: 6, happiness: 6, message: 'Владелец был очень благодарен.' }) },
        { label: 'Оставить себе', effect: (state) => { const gain = scaleByWealth(state, 1500); return { money: gain, happiness: -3, reputation: -2, message: `Забрал ${formatMoney(gain)}, но совесть немного гложет.` }; } },
      ]},
      { text: (fl) => `${cap(fl)} произошла авария — нужна помощь.`, choices: [
        { label: 'Остановиться и помочь', effect: () => ({ reputation: 5, energy: -10, happiness: 4, message: 'Ты сделал доброе дело.' }) },
        { label: 'Проехать мимо, не твоё дело', effect: () => ({ happiness: -3, message: 'Совесть немного покусывает.' }) },
      ]},
      { text: () => `Соседи устроили шумную вечеринку и мешают спать.`, choices: [
        { label: 'Пойти и попросить потише', effect: () => (chance(0.6) ? { happiness: 3, message: 'Соседи извинились и убавили звук.' } : { happiness: -6, reputation: -1, message: 'Разговор перешёл в ссору.' }) },
        { label: 'Терпеть в наушниках', effect: () => ({ energy: -10, message: 'Выспаться не удалось.' }) },
      ]},
      { text: () => `Сломалась важная техника дома.`, choices: [
        { label: 'Купить новую', effect: (state) => { const cost = scaleByWealth(state, 6000); return { money: -cost, happiness: 5, message: `Потратил ${formatMoney(cost)} на новую технику.` }; } },
        { label: 'Обходиться без неё', effect: () => ({ happiness: -4, energy: -4, message: 'Неудобно, но пережить можно.' }) },
      ]},
      { text: () => `Тебя вызвали в суд в качестве присяжного заседателя.`, choices: [
        { label: 'Пойти и выполнить гражданский долг', effect: () => ({ reputation: 4, energy: -8, happiness: -2, message: 'Отнял день, зато поступил правильно.' }) },
        { label: 'Найти способ отказаться', effect: () => ({ happiness: 1, reputation: -2, message: 'Отвертелся, но осадок остался.' }) },
      ]},
    ],
    ['у вокзала', 'возле дома', 'в парке', 'в очереди в магазине'],
    always
  );

  const work = buildFlavorFamily(
    'work',
    [
      { text: (fl) => `Попросили остаться на сверхурочные без доплаты — а ты как раз работаешь ${fl}.`, choices: [
        { label: 'Согласиться и потерпеть', effect: (state) => { const pay = scaleByWealth(state, 1000); return { energy: -15, money: pay, happiness: -4, message: 'Сделал, как просили. Вымотался, но кое-что заплатили.' }; } },
        { label: 'Отказаться', effect: () => (chance(0.6) ? { reputation: 4, happiness: 5, message: 'Отстоял границы, начальство это оценило.' } : { reputation: -4, happiness: -5, message: 'Начальству это не понравилось.' }) },
      ]},
      { text: () => `Возник конфликт с коллегой из-за чужой ошибки в отчёте.`, choices: [
        { label: 'Доказать свою правоту', effect: () => (chance(0.55) ? { reputation: 5, happiness: 4, message: 'Справедливость восторжествовала.' } : { reputation: -3, happiness: -6, message: 'Конфликт только усугубился.' }) },
        { label: 'Взять вину на себя ради мира', effect: () => ({ happiness: -5, reputation: -1, message: 'Тяжело, зато в коллективе спокойнее.' }) },
      ]},
      { text: () => `Зарплату задержали уже на две недели.`, choices: [
        { label: 'Требовать деньги немедленно', effect: (state) => { if (chance(0.5)) { const pay = scaleByWealth(state, 3000); return { money: pay, reputation: 1, message: `Зарплату выбили — ${formatMoney(pay)}.` }; } return { reputation: -3, happiness: -6, message: 'Начальство пообещало "скоро", но пока тишина.' }; } },
        { label: 'Ждать молча', effect: () => ({ happiness: -8, message: 'Ожидание выматывает нервы.' }) },
      ]},
      { text: () => `Появилась возможность подработать в свой законный выходной.`, choices: [
        { label: 'Согласиться', effect: (state) => { const pay = scaleByWealth(state, 2500); return { money: pay, energy: -18, message: `Заработал дополнительно ${formatMoney(pay)}.` }; } },
        { label: 'Отдохнуть', effect: () => ({ energy: 15, happiness: 6, message: 'Отдых оказался важнее денег.' }) },
      ]},
      { text: () => `Начальство зовёт на корпоратив, где решаются важные вопросы.`, choices: [
        { label: 'Пойти и наладить связи', effect: (state) => { const cost = scaleByWealth(state, 800); return { money: -cost, reputation: 5, happiness: 5, message: 'Вечер прошёл с пользой для карьеры.' }; } },
        { label: 'Пропустить, дела важнее', effect: () => ({ reputation: -2, energy: 5, message: 'Отдохнул дома, но карьерный момент упущен.' }) },
      ]},
      { text: (fl) => `Босс неожиданно вызывает тебя "на ковёр" и сообщает, что тебя увольняют. Работал ты ${fl}.`, choices: [
        { label: 'Устроить скандал', effect: (state) => { if (chance(0.3)) { const pay = scaleByWealth(state, 4000); return { money: pay, reputation: -6, happiness: -6, jobLoss: true, message: `Скандал помог выбить компенсацию — ${formatMoney(pay)}. Но работы больше нет.` }; } return { reputation: -8, happiness: -14, jobLoss: true, message: 'Скандал ничего не дал, только испортил репутацию.' }; } },
        { label: 'Молча собрать вещи и уйти', effect: (state) => { const pay = scaleByWealth(state, 1500); return { money: pay, happiness: -8, jobLoss: true, message: `Ушёл с достоинством, получив ${formatMoney(pay)} расчётных.` }; } },
        { label: 'Попросить дать второй шанс', effect: () => (chance(0.35) ? { reputation: 3, happiness: 4, message: 'Босс сжалился и дал ещё один шанс.' } : { happiness: -12, jobLoss: true, message: 'Босс был непреклонен — увольнение состоялось.' }) },
      ]},
    ],
    ['в офисе', 'на физически тяжёлой работе', 'в сфере обслуживания', 'в творческой профессии'],
    hasJobFn
  );

  /* ============ 3. АВТОРСКИЕ СОБЫТИЯ (≈26) ============ */

  const HAND_EVENTS = [
    {
      id: 'hand_boris_shop',
      text: 'Заканчиваются продукты. У соседнего магазина дяди Бори дешевле, но там вечно что-то с сроками годности. В "Пятёрочке" дороже, зато надёжно.',
      conditions: always,
      choices: [
        { label: 'Идти к дяде Боре', effect: (state) => { const saved = scaleByWealth(state, 500); if (chance(0.25)) return { money: -Math.round(saved * 0.4), health: -8, message: 'Купил просрочку, потом было плохо.' }; return { money: saved, happiness: 2, message: `Сэкономил ${formatMoney(saved)}, дядя Боря сегодня в ударе.` }; } },
        { label: 'Идти в "Пятёрочку"', effect: (state) => { const cost = scaleByWealth(state, 900); return { money: -cost, happiness: 1, message: `Купил всё свежее за ${formatMoney(cost)}.` }; } },
      ],
    },
    {
      id: 'hand_bankruptcy_1',
      text: 'Банк звонит и требует немедленно погасить просроченный кредит, иначе подаст в суд.',
      conditions: (s) => s.money < 3000,
      choices: [
        { label: 'Взять новый займ, чтобы закрыть старый', effect: (state) => { const amount = scaleByWealth(state, 4000); return { money: amount, happiness: -10, debtTrap: true, message: 'Проблема отложена, но долговая яма стала глубже.' }; } },
        { label: 'Признать себя банкротом официально', effect: () => ({ bankrupt: true, message: 'Ты официально признан банкротом. Долги списаны — но начинать придётся с нуля.' }) },
      ],
    },
    {
      id: 'hand_bankruptcy_2',
      text: 'Коллекторы начали названивать даже родственникам, требуя вернуть долг.',
      conditions: (s) => s.money < 0,
      choices: [
        { label: 'Занять денег у родни, лишь бы отстали', effect: (state) => { const amount = scaleByWealth(state, 3000); return { money: amount, reputation: -3, happiness: -4, message: 'Родня выручила, но отношения испортились.' }; } },
        { label: 'Не отвечать и сменить номер', effect: () => ({ happiness: -8, energy: -6, message: 'Звонки прекратились, но нервы уже ни к чёрту.' }) },
      ],
    },
    {
      id: 'hand_bankruptcy_3',
      text: 'Микрозайм под огромный процент — единственный способ достать денег прямо сегодня.',
      conditions: (s) => s.money < 2000,
      choices: [
        { label: 'Взять микрозайм', effect: (state) => { const amount = scaleByWealth(state, 2500); return { money: amount, debtTrap: true, happiness: -3, message: 'Деньги в кармане, но проценты будут расти как снежный ком.' }; } },
        { label: 'Отказаться и поискать другой выход', effect: () => ({ energy: -10, happiness: -2, message: 'Тяжело, зато не увяз в новых долгах.' }) },
      ],
    },
    {
      id: 'hand_bankruptcy_4',
      text: 'Ты не можешь оплатить съём жилья — хозяин грозит выселением уже на этой неделе.',
      conditions: (s) => s.money < 0,
      choices: [
        { label: 'Занять у друзей последнее', effect: (state) => { const amount = scaleByWealth(state, 2000); return { money: amount, reputation: -2, message: 'Друзья выручили, но просить снова будет стыдно.' }; } },
        { label: 'Собрать вещи и уйти', effect: () => ({ happiness: -12, health: -6, message: 'Пришлось освободить квартиру. Начинается совсем другая жизнь.' }) },
      ],
    },
    {
      id: 'hand_bankruptcy_5',
      text: 'Сумма долгов превысила всё, что ты можешь заработать за год. Юрист предлагает оформить официальное банкротство.',
      conditions: (s) => s.money <= -20000,
      choices: [
        { label: 'Оформить банкротство официально', effect: () => ({ bankrupt: true, message: 'Ты официально признан банкротом. Долги списаны, но начинать придётся с нуля.' }) },
        { label: 'Тянуть и дальше, надеясь на чудо', effect: (state) => { const loss = scaleByWealth(state, 5000); return { money: -loss, happiness: -8, message: 'Чуда не случилось, долги продолжают расти.' }; } },
      ],
    },
    {
      id: 'hand_windfall_1',
      text: 'Ты выиграл в лотерею небольшую, но приятную сумму.',
      conditions: always,
      choices: [
        { label: 'Сохранить деньги', effect: (state) => { const win = scaleByWealth(state, rand(4000, 20000)); return { money: win, happiness: 5, message: `Выигрыш ${formatMoney(win)} лёг на счёт.` }; } },
        { label: 'Потратить с размахом', effect: (state) => { const win = scaleByWealth(state, rand(4000, 20000)); return { money: Math.round(win * 0.3), happiness: 18, message: 'Устроил себе праздник на весь выигрыш.' }; } },
      ],
    },
    {
      id: 'hand_windfall_2',
      text: 'Дальний родственник, о котором ты почти забыл, оставил тебе небольшое наследство.',
      conditions: (s) => s.age >= 25,
      choices: [
        { label: 'Принять наследство', effect: (state) => { const win = scaleByWealth(state, rand(8000, 40000)); return { money: win, happiness: 6, message: `Неожиданно получил ${formatMoney(win)}.` }; } },
        { label: 'Отказаться в пользу других родственников', effect: () => ({ reputation: 4, happiness: 2, message: 'Благородный жест оценили в семье.' }) },
      ],
    },
    {
      id: 'hand_windfall_3',
      text: 'Работодатель неожиданно выплатил щедрую годовую премию.',
      conditions: hasJobFn,
      choices: [
        { label: 'Порадоваться и отложить премию', effect: (state) => { const win = scaleByWealth(state, rand(3000, 15000)); return { money: win, happiness: 6, message: `Премия ${formatMoney(win)} — приятный бонус за труд.` }; } },
        { label: 'Сразу потратить на себя', effect: (state) => { const win = scaleByWealth(state, rand(3000, 15000)); return { money: Math.round(win * 0.5), happiness: 12, message: 'Побаловал себя чем-то давно желанным.' }; } },
      ],
    },
    {
      id: 'hand_allergy_1',
      text: (state) => `На вечеринке у друзей ты внезапно оказался рядом с источником своей аллергии: ${state.allergy}. Симптомы уже начинают проявляться.`,
      conditions: hasAllergyFn,
      choices: [
        { label: 'Незаметно уйти', effect: () => ({ happiness: -3, health: 2, message: 'Ушёл вовремя, обошлось без приступа.' }) },
        { label: 'Перетерпеть, чтобы не показаться грубым', effect: (state) => { const hit = randInt(10, 25); const cost = chance(0.4) ? scaleByWealth(state, 3000) : 0; return { health: -hit, money: -cost, happiness: -6, message: cost ? `Реакция оказалась серьёзной, пришлось вызывать скорую за ${formatMoney(cost)}.` : 'Реакция была неприятной, но обошлось своими силами.' }; } },
      ],
    },
    {
      id: 'hand_allergy_2',
      text: (state) => `Ты наткнулся на возможную причину своей аллергии — ${state.allergy} — в самый неподходящий момент, на важной встрече.`,
      conditions: hasAllergyFn,
      choices: [
        { label: 'Извиниться и срочно выйти', effect: () => ({ reputation: -2, health: 3, message: 'Неловко, зато цел и невредим.' }) },
        { label: 'Досидеть до конца встречи', effect: () => { const hit = randInt(8, 20); return { health: -hit, reputation: 2, message: 'Встречу довёл до конца, но здоровью досталось.' }; } },
      ],
    },
    {
      id: 'hand_allergy_3',
      text: (state) => `В аптеке тебе чуть не продали средство, в составе которого — ${state.allergy}. Хорошо, что ты внимательно прочитал состав.`,
      conditions: hasAllergyFn,
      choices: [
        { label: 'Потребовать разбирательства', effect: (state) => { const comp = scaleByWealth(state, 500); return { money: comp, reputation: 1, message: `Аптека извинилась и выплатила компенсацию ${formatMoney(comp)}.` }; } },
        { label: 'Молча уйти', effect: () => ({ happiness: -1, message: 'Не было настроения на скандал.' }) },
      ],
    },
    {
      id: 'hand_allergy_4',
      text: (state) => `Ты давно не сталкивался с ${state.allergy} и решил на всякий случай проверить, не прошла ли аллергия.`,
      conditions: hasAllergyFn,
      choices: [
        { label: 'Рискнуть и проверить', effect: () => (chance(0.55) ? { health: -randInt(15, 30), happiness: -8, message: 'Аллергия оказалась на месте. Было очень плохо.' } : { happiness: 6, message: 'На этот раз обошлось без реакции.' }) },
        { label: 'Не испытывать судьбу', effect: () => ({ happiness: 1, message: 'Осторожность — тоже стратегия.' }) },
      ],
    },
    {
      id: 'hand_allergy_5',
      text: (state) => `Друзья зовут в поездку, но там почти наверняка будет ${state.allergy}, а аптечки с собой нет.`,
      conditions: hasAllergyFn,
      choices: [
        { label: 'Поехать несмотря ни на что', effect: () => (chance(0.4) ? { health: -randInt(10, 22), happiness: 4, message: 'Поездка была отличной, но не без приступа.' } : { happiness: 14, message: 'Съездил отлично, и обошлось без последствий.' }) },
        { label: 'Остаться дома', effect: () => ({ happiness: -6, health: 2, message: 'Скучно, зато безопасно.' }) },
      ],
    },
    {
      id: 'hand_job_search',
      text: 'Ты штудируешь объявления о работе. Попадается вакансия, но платят немного.',
      conditions: noJobFn,
      choices: [
        { label: 'Согласиться на любую работу', effect: (state) => { const pay = scaleByWealth(state, 1000); return { money: pay, happiness: 3, jobGain: true, message: 'Начал работать заново — уже не так безнадёжно.' }; } },
        { label: 'Продолжать искать что-то получше', effect: () => ({ happiness: -2, energy: -4, message: 'Поиски продолжаются, а деньги заканчиваются.' }) },
      ],
    },
    {
      id: 'hand_epidemic',
      text: 'В городе объявили карантин из-за вспышки простудного вируса.',
      conditions: always,
      choices: [
        { label: 'Закупиться масками и витаминами', effect: (state) => { const cost = scaleByWealth(state, 1500); return { money: -cost, health: 8, message: `Подготовился заранее за ${formatMoney(cost)}.` }; } },
        { label: 'Не придавать значения', effect: () => (chance(0.4) ? { health: -14, happiness: -4, message: 'Всё-таки заболел.' } : { happiness: 1, message: 'Пронесло.' }) },
      ],
    },
    {
      id: 'hand_charity_ask',
      text: 'Незнакомец на улице просит немного денег на еду.',
      conditions: always,
      choices: [
        { label: 'Дать немного', effect: (state) => { const cost = scaleByWealth(state, 150); return { money: -cost, happiness: 4, reputation: 1, message: 'Небольшая помощь, но приятно на душе.' }; } },
        { label: 'Пройти мимо', effect: () => ({ happiness: -1, message: 'Своих забот хватает.' }) },
      ],
    },
    {
      id: 'hand_mentor',
      text: 'Успешный человек предлагает бесплатно стать твоим наставником, если ты будешь выполнять его задания.',
      conditions: always,
      choices: [
        { label: 'Согласиться', effect: () => ({ energy: -6, happiness: 5, reputation: 3, message: 'Первые задания уже дают результат.' }) },
        { label: 'Отказаться, справлюсь сам', effect: () => ({ happiness: 1, message: 'Пойдёшь своим путём.' }) },
      ],
    },
    {
      id: 'hand_new_position',
      text: 'Другая компания предлагает тебе более высокую и денежную позицию.',
      conditions: hasJobFn,
      choices: [
        { label: 'Принять предложение', effect: (state) => { const bonus = scaleByWealth(state, 5000); return { money: bonus, reputation: 3, happiness: 6, message: 'Новая должность — новые возможности!' }; } },
        { label: 'Остаться на нынешнем месте', effect: () => ({ reputation: 2, happiness: -1, message: 'Верность старому месту тоже чего-то стоит.' }) },
      ],
    },
    {
      id: 'hand_burnout',
      text: 'Ты понимаешь, что давно не отдыхал по-настоящему.',
      conditions: always,
      choices: [
        { label: 'Взять отпуск', effect: (state) => { const cost = scaleByWealth(state, 3500); return { money: -cost, energy: 25, happiness: 12, health: 5, message: `Отпуск обошёлся в ${formatMoney(cost)}, но того стоил.` }; } },
        { label: 'Продолжать работать на износ', effect: () => ({ energy: -15, health: -8, happiness: -6, message: 'Организм всё чаще напоминает о себе усталостью.' }) },
      ],
    },
    {
      id: 'hand_slip_fall',
      text: 'Ты поскользнулся на льду и упал.',
      conditions: always,
      choices: [
        { label: 'Обратиться к врачу', effect: (state) => { const cost = scaleByWealth(state, 1200); return { money: -cost, health: 10, message: `Обошлось без осложнений, потрачено ${formatMoney(cost)}.` }; } },
        { label: 'Отлежаться дома', effect: () => (chance(0.3) ? { health: -18, message: 'Стало хуже, надо было идти к врачу.' } : { health: -4, message: 'Кое-как оклемался сам.' }) },
      ],
    },
    {
      id: 'hand_philanthropy',
      text: 'Журналисты спрашивают, планируешь ли ты заняться благотворительностью.',
      conditions: isRichPlus,
      choices: [
        { label: 'Основать собственный фонд', effect: (state) => { const cost = scaleByWealth(state, 80000); return { money: -cost, reputation: 15, happiness: 10, message: `Фонд основан, потрачено ${formatMoney(cost)}. Пресса в восторге.` }; } },
        { label: 'Уклониться от ответа', effect: () => ({ reputation: -4, message: 'Журналисты сделали свои выводы.' }) },
      ],
    },
    {
      id: 'hand_side_idea',
      text: 'У тебя внезапно появилась идея для небольшого побочного дела.',
      conditions: always,
      choices: [
        { label: 'Попробовать запустить', effect: (state) => { const cost = scaleByWealth(state, 2000); return chance(0.4) ? { money: Math.round(cost * 2) - cost, happiness: 8, message: 'Идея выстрелила, дело приносит доход!' } : { money: -cost, happiness: -4, message: 'Идея не взлетела, деньги потрачены впустую.' }; } },
        { label: 'Оставить идею на потом', effect: () => ({ happiness: -1, message: 'Может, ещё вернёшься к этой мысли.' }) },
      ],
    },
    {
      id: 'hand_year_reflection',
      text: 'Заканчивается очередной год твоей жизни. Пора подвести итоги.',
      conditions: always,
      choices: [
        { label: 'Порадоваться достигнутому', effect: () => ({ happiness: 8, message: 'Оптимизм заряжает на новые свершения.' }) },
        { label: 'Расстроиться, что не всё получилось', effect: () => ({ happiness: -5, reputation: 1, message: 'Самокритика тоже помогает двигаться дальше.' }) },
      ],
    },
    {
      id: 'hand_retirement_thought',
      text: 'Ты задумался: не пора ли начать откладывать на старость побольше?',
      conditions: (s) => s.age >= 50,
      choices: [
        { label: 'Начать откладывать больше', effect: (state) => { const cost = scaleByWealth(state, 1000); return { money: -cost, happiness: 3, message: 'Небольшая финансовая подушка радует спокойствием.' }; } },
        { label: 'Жить сегодняшним днём', effect: () => ({ happiness: 4, message: 'Живёшь ярко, а там видно будет.' }) },
      ],
    },
    {
      id: 'hand_ipo_dream',
      text: 'Инвестбанкиры предлагают вывести твою компанию на биржу через IPO.',
      conditions: isBusinessy,
      choices: [
        { label: 'Провести IPO', effect: (state) => { const gain = scaleByWealth(state, 400000); return chance(0.55) ? { money: gain, reputation: 12, happiness: 15, message: `IPO прошло блестяще! Капитал вырос на ${formatMoney(gain)}.` } : { money: -Math.round(gain * 0.2), reputation: -5, happiness: -8, message: 'Рынок встретил IPO прохладно, акции просели.' }; } },
        { label: 'Остаться частной компанией', effect: () => ({ reputation: 2, message: 'Контроль важнее шумихи.' }) },
      ],
    },
  ];

  /* ============ Сборка общего пула ============ */

  window.EVENTS = [].concat(
    invest, shopping, health, housing, transport, selfdev, gambling, business,
    survival, luxury, family, crime, weather, tech, general, work,
    HAND_EVENTS
  );
})();
