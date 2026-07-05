/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Каталог предметов инвентаря.

   Названия брендов — узнаваемые пародии на реальные марки с изменённым
   написанием (Ролакс, Буга, Гуччо, Тесло и т.п.), а не точное
   воспроизведение чужих товарных знаков — это игровой флавор-текст,
   а не отсылка к конкретным настоящим компаниям.

   Категории:
   - food: расходуется при "поедании" из инвентаря, поднимает шкалу
     "Еда" (state.pantry) и иногда здоровье/счастье. В чистую
     стоимость не считается.
   - housing: недвижимость — не занимает место в "переносном" лимите
     инвентаря (как машины), но полностью учитывается в чистой
     стоимости; можно владеть несколькими объектами одновременно.
   - остальные категории (clothes/cars/bags/watches/electronics/
     jewelry) — предметы статуса: одноразовый эффект при покупке
     (счастье/репутация) и вклад в "чистую стоимость" (netWorth),
     которая помогает пересечь границу следующего социального слоя.
     Их можно продать на аукционе другим игрокам.
   ========================================================= */

window.ITEMS = (function () {
  function item(id, category, name, brand, price, icon, effects) {
    return { id, category, name, brand: brand || null, price, icon, effects: effects || {} };
  }

  const list = [
    // ---------------- ЕДА ----------------
    item('food_bread', 'food', 'Батон и консервы', null, 60, '🍞', { pantry: 15 }),
    item('food_instant', 'food', 'Дошик и сосиски', null, 120, '🍜', { pantry: 20, happiness: 1 }),
    item('food_weekly', 'food', 'Продукты на неделю', null, 900, '🛒', { pantry: 50, happiness: 2 }),
    item('food_lunch', 'food', 'Бизнес-ланч в кафе', null, 600, '🍱', { pantry: 30, happiness: 4, health: 2 }),
    item('food_sushi', 'food', 'Сет суши на двоих', null, 2500, '🍣', { pantry: 45, happiness: 9 }),
    item('food_steak', 'food', 'Стейк в ресторане', null, 6000, '🥩', { pantry: 55, happiness: 13, health: 4 }),
    item('food_tasting', 'food', 'Дегустационный ужин от шеф-повара', null, 45000, '🍽️', { pantry: 70, happiness: 22, health: 8, reputation: 3 }),
    item('food_pelmeni', 'food', 'Пельмени из морозилки', null, 90, '🥟', { pantry: 18 }),
    item('food_shaurma', 'food', 'Шаурма в ларьке', null, 250, '🌯', { pantry: 22, happiness: 2 }),
    item('food_makdak', 'food', 'Комбо в "МакДаке"', 'МакДак', 350, '🍔', { pantry: 25, happiness: 4 }),
    item('food_burgir_king', 'food', 'Воппер в "Бургир Кинге"', 'Бургир Кинг', 400, '🍔', { pantry: 26, happiness: 4 }),
    item('food_starbiks', 'food', 'Кофе с десертом в "Старбиксе"', 'Старбикс', 550, '☕', { pantry: 15, happiness: 5 }),
    item('food_kfsee', 'food', 'Ведёрко крылышек в "КейФС"', 'КейФС', 500, '🍗', { pantry: 30, happiness: 4 }),
    item('food_yasushi', 'food', 'Суши-сет "Ясуши"', 'Ясуши', 2200, '🍣', { pantry: 42, happiness: 8 }),
    item('food_wine_dinner', 'food', 'Ужин с вином на двоих', null, 4500, '🍷', { pantry: 40, happiness: 12 }),
    item('food_seafood', 'food', 'Морепродукты в ресторане', null, 9000, '🦐', { pantry: 50, happiness: 15, health: 3 }),
    item('food_private_chef', 'food', 'Личный повар на вечер', null, 60000, '👨‍🍳', { pantry: 65, happiness: 20, reputation: 4 }),

    // ---------------- ОДЕЖДА ----------------
    item('clothes_market', 'clothes', 'Футболка с вещевого рынка', null, 300, '👕', { happiness: 1 }),
    item('clothes_jeans', 'clothes', 'Джинсы "Экономика"', 'Экономика', 700, '👖', { happiness: 1 }),
    item('clothes_sneakers', 'clothes', 'Кроссовки "УличноСтиль"', 'УличноСтиль', 1200, '👟', { happiness: 2, reputation: 1 }),
    item('clothes_jacket', 'clothes', 'Куртка "Бруно Верди"', 'Бруно Верди', 15000, '🧥', { happiness: 5, reputation: 6 }),
    item('clothes_suit', 'clothes', 'Костюм "Дюваль Пари"', 'Дюваль Пари', 120000, '🤵', { happiness: 10, reputation: 16 }),
    item('clothes_coat', 'clothes', 'Пальто "Голден Кросс"', 'Голден Кросс', 500000, '🧥', { happiness: 16, reputation: 26 }),
    item('clothes_secondhand', 'clothes', 'Вещи из секонд-хенда', null, 150, '👕', { happiness: 1 }),
    item('clothes_zarra', 'clothes', 'Футболка "Зарра"', 'Зарра', 900, '👕', { happiness: 1 }),
    item('clothes_h_and_em', 'clothes', 'Куртка "Н&Эм"', 'Н&Эм', 2500, '🧥', { happiness: 2, reputation: 1 }),
    item('clothes_naik', 'clothes', 'Кроссовки "Naik Air"', 'Naik', 6000, '👟', { happiness: 3, reputation: 2 }),
    item('clothes_guccho', 'clothes', 'Ремень "Гуччо"', 'Гуччо', 35000, '👔', { happiness: 6, reputation: 9 }),
    item('clothes_versachi', 'clothes', 'Рубашка с принтом "Версачи Роза"', 'Версачи Роза', 90000, '👔', { happiness: 8, reputation: 12 }),
    item('clothes_pradoff', 'clothes', 'Плащ "Прадоф"', 'Прадоф', 180000, '🧥', { happiness: 10, reputation: 16 }),
    item('clothes_armanto', 'clothes', 'Костюм "Арманто"', 'Арманто', 350000, '🤵', { happiness: 14, reputation: 22 }),
    item('clothes_shanella', 'clothes', 'Пальто "Шанелла"', 'Шанелла', 900000, '🧥', { happiness: 20, reputation: 30 }),
    item('clothes_diorra', 'clothes', 'Кутюрное платье "Диорра Нуар"', 'Диорра Нуар', 2500000, '👗', { happiness: 26, reputation: 38 }),

    // ---------------- МАШИНЫ ----------------
    item('car_econom', 'cars', '"Стрела-Эконом", б/у', 'Стрела', 150000, '🚗', { happiness: 6, reputation: 3 }),
    item('car_comfort', 'cars', '"Вояж Комфорт"', 'Вояж', 700000, '🚙', { happiness: 10, reputation: 7 }),
    item('car_prime', 'cars', '"Тоямото Прайм"', 'Тоямото', 2800000, '🚘', { happiness: 16, reputation: 13 }),
    item('car_gt5', 'cars', '"Вагнер GT 5"', 'Вагнер', 7000000, '🏎️', { happiness: 22, reputation: 20 }),
    item('car_spider', 'cars', '"Феррони Спайдер"', 'Феррони', 25000000, '🏎️', { happiness: 30, reputation: 28 }),
    item('car_classic', 'cars', '"Бентвуд Классик"', 'Бентвуд', 70000000, '🚔', { happiness: 38, reputation: 36 }),
    item('car_royal', 'cars', '"Голд Классик Роял"', 'Голд Классик', 250000000, '🚖', { happiness: 50, reputation: 48 }),
    item('car_vespo', 'cars', 'Мопед "Веспо"', 'Веспо', 60000, '🛵', { happiness: 3, reputation: 1 }),
    item('car_vada', 'cars', '"Вада-Классика"', 'Вада', 180000, '🚗', { happiness: 4, reputation: 2 }),
    item('car_mercedos', 'cars', '"Мерседос С-Класс"', 'Мерседос', 6500000, '🚗', { happiness: 22, reputation: 18 }),
    item('car_teslo', 'cars', '"Тесло Модель Т"', 'Тесло', 3500000, '⚡', { happiness: 20, reputation: 16 }),
    item('car_bmvey', 'cars', '"БМВэй М5-Спорт"', 'БМВэй', 9000000, '🚘', { happiness: 24, reputation: 20 }),
    item('car_reyndj_rovir', 'cars', '"Рейндж Ровир Спорт"', 'Рейндж Ровир', 12000000, '🚙', { happiness: 26, reputation: 20 }),
    item('car_porshen', 'cars', '"Поршень 911-К"', 'Поршень', 18000000, '🏎️', { happiness: 30, reputation: 26 }),
    item('car_lamborgin', 'cars', '"Ламборгин Торо"', 'Ламборгин', 60000000, '🏎️', { happiness: 42, reputation: 38 }),
    item('car_rolz_roych', 'cars', '"Ролз-Ройч Призрак"', 'Ролз-Ройч', 150000000, '🚖', { happiness: 50, reputation: 48 }),
    item('car_buga', 'cars', '"Буга Широн"', 'Буга', 900000000, '🏎️', { happiness: 70, reputation: 65 }),

    // ---------------- СУМКИ ----------------
    item('bag_market', 'bags', 'Сумка с рынка', null, 500, '👜', { happiness: 1 }),
    item('bag_backpack', 'bags', 'Городской рюкзак', null, 1200, '🎒', { happiness: 1, reputation: 1 }),
    item('bag_bruno', 'bags', 'Сумка "Бруно Верди"', 'Бруно Верди', 9000, '👜', { happiness: 4, reputation: 5 }),
    item('bag_duval', 'bags', 'Клатч "Дюваль Пари"', 'Дюваль Пари', 65000, '👝', { happiness: 8, reputation: 11 }),
    item('bag_golden', 'bags', 'Легендарная сумка "Голден Кросс"', 'Голден Кросс', 3200000, '👜', { happiness: 18, reputation: 24 }),
    item('bag_totebag', 'bags', 'Тканевая сумка-шоппер', null, 350, '👜', { happiness: 1 }),
    item('bag_zarra', 'bags', 'Сумка "Зарра Basic"', 'Зарра', 1200, '👜', { happiness: 1 }),
    item('bag_maikl_kors', 'bags', 'Сумка "Майкл Корc Лайт"', 'Майкл Корc', 15000, '👜', { happiness: 4, reputation: 5 }),
    item('bag_balensiaga', 'bags', 'Рюкзак "Баленсияга Стрит"', 'Баленсияга', 220000, '🎒', { happiness: 9, reputation: 13 }),
    item('bag_guccho2', 'bags', 'Клатч "Гуччо Ночь"', 'Гуччо', 180000, '👝', { happiness: 8, reputation: 14 }),
    item('bag_prada_travel', 'bags', 'Дорожная сумка "Прадоф Вояж"', 'Прадоф', 400000, '👜', { happiness: 12, reputation: 18 }),
    item('bag_luiviton', 'bags', 'Сумка "Луи Виттонн"', 'Луи Виттонн', 250000, '👜', { happiness: 10, reputation: 16 }),
    item('bag_shanella_micro', 'bags', 'Микросумка "Шанелла Микро"', 'Шанелла', 700000, '👝', { happiness: 16, reputation: 24 }),
    item('bag_hermec', 'bags', 'Сумка "Эрмец Бирка"', 'Эрмец', 3000000, '👜', { happiness: 20, reputation: 30 }),
    item('bag_vault', 'bags', 'Коллекционная сумка-сейф "Крон-Швейц"', 'Крон-Швейц', 25000000, '👜', { happiness: 34, reputation: 44 }),

    // ---------------- ЧАСЫ ----------------
    item('watch_tiktak', 'watches', 'Часы "Тик-Так"', 'Тик-Так', 2000, '⌚', { happiness: 1 }),
    item('watch_ulichno', 'watches', 'Хронограф "УличноСтиль"', 'УличноСтиль', 6000, '⌚', { happiness: 2, reputation: 2 }),
    item('watch_kron', 'watches', 'Часы "Крон-Швейц Классик"', 'Крон-Швейц', 250000, '⌚', { happiness: 9, reputation: 14 }),
    item('watch_golden', 'watches', 'Коллекционные часы "Голден Кросс"', 'Голден Кросс', 5000000, '⌚', { happiness: 20, reputation: 30 }),
    item('watch_kasyo', 'watches', 'Часы "Касьо Классик"', 'Касьо', 1500, '⌚', { happiness: 1 }),
    item('watch_fitbip', 'watches', 'Фитнес-браслет "Фитбип"', 'Фитбип', 3000, '⌚', { happiness: 2, health: 1 }),
    item('watch_omego', 'watches', 'Часы "Омего Сифорс"', 'Омего', 80000, '⌚', { happiness: 6, reputation: 8 }),
    item('watch_rolax', 'watches', 'Часы "Ролакс Дейтова"', 'Ролакс', 900000, '⌚', { happiness: 14, reputation: 20 }),
    item('watch_kartyez', 'watches', 'Часы "Картьез Танк"', 'Картьез', 1500000, '⌚', { happiness: 16, reputation: 24 }),
    item('watch_patek_filimon', 'watches', 'Часы "Патек Филимон"', 'Патек Филимон', 8000000, '⌚', { happiness: 24, reputation: 34 }),
    item('watch_odemar', 'watches', 'Часы "Одемар Пигар Оффшор"', 'Одемар Пигар', 12000000, '⌚', { happiness: 28, reputation: 38 }),
    item('watch_vasheron', 'watches', 'Часы "Вашерон Константян"', 'Вашерон Константян', 20000000, '⌚', { happiness: 32, reputation: 42 }),
    item('watch_richardmilo', 'watches', 'Часы "Ричард Мило"', 'Ричард Мило', 45000000, '⌚', { happiness: 38, reputation: 48 }),
    item('watch_kron_vintage', 'watches', 'Винтажные часы "Крон Винтаж"', 'Крон', 15000000, '⌚', { happiness: 26, reputation: 36 }),

    // ---------------- ЭЛЕКТРОНИКА ----------------
    item('tech_budget_phone', 'electronics', 'Бюджетный смартфон', null, 8000, '📱', { happiness: 2 }),
    item('tech_flagship_phone', 'electronics', 'Смартфон-флагман', null, 90000, '📱', { happiness: 5, reputation: 3 }),
    item('tech_laptop', 'electronics', 'Ноутбук для работы', null, 60000, '💻', { happiness: 4, reputation: 2 }),
    item('tech_gaming_setup', 'electronics', 'Игровой сетап мечты', null, 250000, '🖥️', { happiness: 12, reputation: 4 }),
    item('tech_eppol_phone', 'electronics', 'Смартфон "Эппол 15"', 'Эппол', 90000, '📱', { happiness: 5, reputation: 3 }),
    item('tech_samsunk_phone', 'electronics', 'Смартфон "Самсунk Галактика"', 'Самсунk', 75000, '📱', { happiness: 4, reputation: 2 }),
    item('tech_eppol_laptop', 'electronics', 'Ноутбук "Эппол Макбучок"', 'Эппол', 150000, '💻', { happiness: 6, reputation: 4 }),
    item('tech_dello_pc', 'electronics', 'Игровой ПК "Дэлло XPS"', 'Дэлло', 200000, '🖥️', { happiness: 8, reputation: 3 }),
    item('tech_soni_tv', 'electronics', 'Телевизор "Сonи Браво"', 'Сonи', 120000, '📺', { happiness: 10 }),
    item('tech_kanon_camera', 'electronics', 'Фотоаппарат "Kанон EOS"', 'Kанон', 85000, '📷', { happiness: 5, reputation: 3 }),
    item('tech_didjey_drone', 'electronics', 'Дрон "ДиДжэй Мавик"', 'ДиДжэй', 95000, '🚁', { happiness: 6, reputation: 3 }),
    item('tech_meto_vr', 'electronics', 'VR-гарнитура "Мето Квест"', 'Мето', 60000, '🥽', { happiness: 8 }),
    item('tech_server_rig', 'electronics', 'Сервер для майнинга и разработки', null, 1200000, '🖥️', { happiness: 6, reputation: 5 }),
    item('tech_smart_home_gugol', 'electronics', 'Система умного дома "Гугол Хаус"', 'Гугол', 600000, '🏠', { happiness: 10, reputation: 4 }),

    // ---------------- ЮВЕЛИРКА ----------------
    item('jewel_chain', 'jewelry', 'Серебряная цепочка', null, 3000, '📿', { happiness: 1 }),
    item('jewel_ring', 'jewelry', 'Золотое кольцо', null, 25000, '💍', { happiness: 3, reputation: 3 }),
    item('jewel_earrings', 'jewelry', 'Бриллиантовые серьги', null, 400000, '💎', { happiness: 10, reputation: 15 }),
    item('jewel_necklace', 'jewelry', 'Колье с крупным бриллиантом', null, 5000000, '💎', { happiness: 22, reputation: 32 }),
    item('jewel_tiffano', 'jewelry', 'Браслет "Тиффано"', 'Тиффано', 45000, '💍', { happiness: 5, reputation: 6 }),
    item('jewel_bulgar', 'jewelry', 'Кольцо "Булгар"', 'Булгар', 250000, '💍', { happiness: 9, reputation: 14 }),
    item('jewel_chopard', 'jewelry', 'Гарнитур "Чопард Хэппи"', 'Чопард', 1800000, '💍', { happiness: 16, reputation: 22 }),
    item('jewel_kartyez_solo', 'jewelry', 'Кольцо "Картьез Соло"', 'Картьез', 3500000, '💍', { happiness: 20, reputation: 28 }),
    item('jewel_graf', 'jewelry', 'Колье "Граф Даймонд"', 'Граф', 9000000, '💎', { happiness: 26, reputation: 36 }),
    item('jewel_harri_winstoun', 'jewelry', 'Диадема "Гарри Уинстоун"', 'Гарри Уинстоун', 25000000, '💎', { happiness: 34, reputation: 44 }),
    item('jewel_rare_gem', 'jewelry', 'Редкий цветной бриллиант', null, 15000000, '💎', { happiness: 28, reputation: 38 }),
    item('jewel_royal_crown', 'jewelry', 'Коллекционная корона-реплика', null, 40000000, '👑', { happiness: 36, reputation: 48 }),
    item('jewel_vault_collection', 'jewelry', 'Коллекция драгоценностей мирового уровня', null, 100000000, '💎', { happiness: 45, reputation: 55 }),
    item('jewel_studs', 'jewelry', 'Простые серьги-гвоздики', null, 1200, '📿', { happiness: 1 }),

    // ---------------- ПИТОМЦЫ ----------------
    item('pet_hamster', 'pets', 'Хомяк', null, 800, '🐹', { happiness: 4 }),
    item('pet_cat', 'pets', 'Кот с улицы', null, 1500, '🐱', { happiness: 8 }),
    item('pet_dog', 'pets', 'Щенок из приюта', null, 2500, '🐶', { happiness: 10 }),
    item('pet_parrot', 'pets', 'Попугай', null, 6000, '🦜', { happiness: 7, reputation: 1 }),
    item('pet_purebred_dog', 'pets', 'Породистый пёс с родословной', null, 80000, '🐕', { happiness: 14, reputation: 4 }),
  ];

  /* ---------- НЕДВИЖИМОСТЬ: 10 типов × 5 ЖК = 50 вариантов ---------- */
  const HOUSE_TYPES = [
    { key: 'room', name: 'Комната в общежитии', icon: '🛏️', base: 150000, hap: 2, rep: 0 },
    { key: 'studio', name: 'Студия', icon: '🏢', base: 600000, hap: 4, rep: 1 },
    { key: '1br', name: 'Однокомнатная квартира', icon: '🏠', base: 1800000, hap: 6, rep: 2 },
    { key: '2br', name: 'Двухкомнатная квартира', icon: '🏠', base: 3500000, hap: 9, rep: 4 },
    { key: '3br', name: 'Трёхкомнатная квартира', icon: '🏠', base: 7000000, hap: 12, rep: 6 },
    { key: 'townhouse', name: 'Таунхаус', icon: '🏘️', base: 16000000, hap: 16, rep: 9 },
    { key: 'cottage', name: 'Загородный коттедж', icon: '🏡', base: 32000000, hap: 20, rep: 12 },
    { key: 'mansion', name: 'Особняк', icon: '🏰', base: 80000000, hap: 28, rep: 18 },
    { key: 'penthouse', name: 'Пентхаус', icon: '🏙️', base: 200000000, hap: 38, rep: 26 },
    { key: 'villa', name: 'Вилла у моря', icon: '🏝️', base: 500000000, hap: 50, rep: 36 },
  ];
  const HOUSE_COMPLEXES = ['ЖК «Северный Парк»', 'ЖК «Речной Берег»', 'ЖК «Столичные Высоты»', 'ЖК «Зелёная Долина»', 'ЖК «Панорама Сити»'];
  const HOUSE_PRICE_MUL = [0.85, 1.0, 1.15, 1.35, 1.6];

  const housingList = [];
  HOUSE_TYPES.forEach((type) => {
    HOUSE_COMPLEXES.forEach((complex, idx) => {
      const mul = HOUSE_PRICE_MUL[idx];
      const price = Math.round((type.base * mul) / 1000) * 1000;
      housingList.push(
        item(`house_${type.key}_${idx}`, 'housing', `${type.name}, ${complex}`, complex, price, type.icon, {
          happiness: Math.round(type.hap * (0.85 + idx * 0.1)),
          reputation: Math.round(type.rep * (0.85 + idx * 0.1)),
        })
      );
    });
  });
  list.push.apply(list, housingList);

  const byId = {};
  list.forEach((it) => { byId[it.id] = it; });

  const NET_WORTH_CATEGORIES = ['clothes', 'cars', 'bags', 'watches', 'electronics', 'jewelry', 'housing', 'pets'];

  const CATEGORY_LABEL = {
    food: '🍽️ Еда',
    clothes: '👕 Одежда',
    cars: '🚗 Машины',
    bags: '👜 Сумки',
    watches: '⌚ Часы',
    electronics: '💻 Электроника',
    jewelry: '💎 Ювелирка',
    housing: '🏠 Недвижимость',
    pets: '🐾 Питомцы',
  };

  function byCategory(cat) {
    return list.filter((it) => it.category === cat);
  }

  function computeInventoryNetWorth(state) {
    const inv = state.inventory || {};
    let total = 0;
    Object.keys(inv).forEach((id) => {
      const it = byId[id];
      if (it && NET_WORTH_CATEGORIES.indexOf(it.category) !== -1) {
        total += it.price * (inv[id] || 0);
      }
    });
    return total;
  }

  return {
    list,
    byId,
    byCategory,
    NET_WORTH_CATEGORIES,
    CATEGORY_LABEL,
    computeInventoryNetWorth,
  };
})();

/* ---------- Кейсы (открываются мини-игрой "Поймай момент", без удачи) ---------- */

window.CASES = [
  {
    id: 'case_bag_basic',
    category: 'bags',
    name: 'Обычный кейс сумок',
    price: 5000,
    pool: ['bag_market', 'bag_backpack', 'bag_bruno', 'bag_duval'],
  },
  {
    id: 'case_bag_premium',
    category: 'bags',
    name: 'Премиальный кейс сумок',
    price: 180000,
    pool: ['bag_bruno', 'bag_duval', 'bag_duval', 'bag_golden'],
  },
  {
    id: 'case_watch_basic',
    category: 'watches',
    name: 'Кейс часов',
    price: 20000,
    pool: ['watch_tiktak', 'watch_ulichno', 'watch_kron', 'watch_kron'],
  },
  {
    id: 'case_jewelry_premium',
    category: 'jewelry',
    name: 'Ювелирный кейс',
    price: 800000,
    pool: ['jewel_ring', 'jewel_earrings', 'jewel_earrings', 'jewel_necklace'],
  },
];
