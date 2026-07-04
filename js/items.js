/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Каталог предметов инвентаря.

   Названия брендов вымышленные (не привязаны к реальным торговым
   маркам) — это флавор-текст для игры, а не отсылка к конкретным
   компаниям.

   Категории:
   - food: расходуется при "поедании" из инвентаря, поднимает шкалу
     "Еда" (state.pantry) и иногда здоровье/счастье. В чистую
     стоимость не считается.
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

    // ---------------- ОДЕЖДА ----------------
    item('clothes_market', 'clothes', 'Футболка с вещевого рынка', null, 300, '👕', { happiness: 1 }),
    item('clothes_jeans', 'clothes', 'Джинсы "Экономика"', 'Экономика', 700, '👖', { happiness: 1 }),
    item('clothes_sneakers', 'clothes', 'Кроссовки "УличноСтиль"', 'УличноСтиль', 1200, '👟', { happiness: 2, reputation: 1 }),
    item('clothes_jacket', 'clothes', 'Куртка "Бруно Верди"', 'Бруно Верди', 15000, '🧥', { happiness: 5, reputation: 6 }),
    item('clothes_suit', 'clothes', 'Костюм "Дюваль Пари"', 'Дюваль Пари', 120000, '🤵', { happiness: 10, reputation: 16 }),
    item('clothes_coat', 'clothes', 'Пальто "Голден Кросс"', 'Голден Кросс', 500000, '🧥', { happiness: 16, reputation: 26 }),

    // ---------------- МАШИНЫ ----------------
    item('car_econom', 'cars', '"Стрела-Эконом", б/у', 'Стрела', 150000, '🚗', { happiness: 6, reputation: 3 }),
    item('car_comfort', 'cars', '"Вояж Комфорт"', 'Вояж', 700000, '🚙', { happiness: 10, reputation: 7 }),
    item('car_prime', 'cars', '"Тоямото Прайм"', 'Тоямото', 2800000, '🚘', { happiness: 16, reputation: 13 }),
    item('car_gt5', 'cars', '"Вагнер GT 5"', 'Вагнер', 7000000, '🏎️', { happiness: 22, reputation: 20 }),
    item('car_spider', 'cars', '"Феррони Спайдер"', 'Феррони', 25000000, '🏎️', { happiness: 30, reputation: 28 }),
    item('car_classic', 'cars', '"Бентвуд Классик"', 'Бентвуд', 70000000, '🚔', { happiness: 38, reputation: 36 }),
    item('car_royal', 'cars', '"Голд Классик Роял"', 'Голд Классик', 250000000, '🚖', { happiness: 50, reputation: 48 }),

    // ---------------- СУМКИ ----------------
    item('bag_market', 'bags', 'Сумка с рынка', null, 500, '👜', { happiness: 1 }),
    item('bag_backpack', 'bags', 'Городской рюкзак', null, 1200, '🎒', { happiness: 1, reputation: 1 }),
    item('bag_bruno', 'bags', 'Сумка "Бруно Верди"', 'Бруно Верди', 9000, '👜', { happiness: 4, reputation: 5 }),
    item('bag_duval', 'bags', 'Клатч "Дюваль Пари"', 'Дюваль Пари', 65000, '👝', { happiness: 8, reputation: 11 }),
    item('bag_golden', 'bags', 'Легендарная сумка "Голден Кросс"', 'Голден Кросс', 3200000, '👜', { happiness: 18, reputation: 24 }),

    // ---------------- ЧАСЫ ----------------
    item('watch_tiktak', 'watches', 'Часы "Тик-Так"', 'Тик-Так', 2000, '⌚', { happiness: 1 }),
    item('watch_ulichno', 'watches', 'Хронограф "УличноСтиль"', 'УличноСтиль', 6000, '⌚', { happiness: 2, reputation: 2 }),
    item('watch_kron', 'watches', 'Часы "Крон-Швейц Классик"', 'Крон-Швейц', 250000, '⌚', { happiness: 9, reputation: 14 }),
    item('watch_golden', 'watches', 'Коллекционные часы "Голден Кросс"', 'Голден Кросс', 5000000, '⌚', { happiness: 20, reputation: 30 }),

    // ---------------- ЭЛЕКТРОНИКА ----------------
    item('tech_budget_phone', 'electronics', 'Бюджетный смартфон', null, 8000, '📱', { happiness: 2 }),
    item('tech_flagship_phone', 'electronics', 'Смартфон-флагман', null, 90000, '📱', { happiness: 5, reputation: 3 }),
    item('tech_laptop', 'electronics', 'Ноутбук для работы', null, 60000, '💻', { happiness: 4, reputation: 2 }),
    item('tech_gaming_setup', 'electronics', 'Игровой сетап мечты', null, 250000, '🖥️', { happiness: 12, reputation: 4 }),

    // ---------------- ЮВЕЛИРКА ----------------
    item('jewel_chain', 'jewelry', 'Серебряная цепочка', null, 3000, '📿', { happiness: 1 }),
    item('jewel_ring', 'jewelry', 'Золотое кольцо', null, 25000, '💍', { happiness: 3, reputation: 3 }),
    item('jewel_earrings', 'jewelry', 'Бриллиантовые серьги', null, 400000, '💎', { happiness: 10, reputation: 15 }),
    item('jewel_necklace', 'jewelry', 'Колье с крупным бриллиантом', null, 5000000, '💎', { happiness: 22, reputation: 32 }),
  ];

  const byId = {};
  list.forEach((it) => { byId[it.id] = it; });

  const NET_WORTH_CATEGORIES = ['clothes', 'cars', 'bags', 'watches', 'electronics', 'jewelry'];

  const CATEGORY_LABEL = {
    food: '🍽️ Еда',
    clothes: '👕 Одежда',
    cars: '🚗 Машины',
    bags: '👜 Сумки',
    watches: '⌚ Часы',
    electronics: '💻 Электроника',
    jewelry: '💎 Ювелирка',
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
