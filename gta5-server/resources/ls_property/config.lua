Config = {}

-- ---------------------------------------------------------------------------
-- Общее
-- ---------------------------------------------------------------------------

Config.Interact = 2.0
Config.Cooldown = 600           -- мс между запросами одного игрока

-- Сколько машин можно держать в гараже без всякой недвижимости.
Config.BaseGarageSlots = 2

-- Координаты дверей подобраны по известным местам, но двери в GTA стоят
-- где им удобно. Встань где надо и введи /prophere - команда напечатает
-- координаты, их можно вписать сюда.

-- ---------------------------------------------------------------------------
-- Семьи
-- ---------------------------------------------------------------------------

Config.Family = {
    createPrice = 150000,
    nameMin = 3,
    nameMax = 24,
    tagMax = 5,
    maxMembers = 20,
    -- Приглашение висит столько секунд и протухает.
    inviteSeconds = 120,
}

-- ---------------------------------------------------------------------------
-- Недвижимость
-- ---------------------------------------------------------------------------

-- kind: 'house' - жильё, 'office' - офис. Офис можно назначить семейным,
-- дом нельзя: дом личный.
--
-- slots - сколько мест в гараже прибавляет.
-- storage - сколько ячеек на складе.
Config.Properties = {
    -- --- офисы -------------------------------------------------------------
    { key = 'office_mazewest', kind = 'office', label = 'Maze Bank West',
      price = 1600000, slots = 5, storage = 60,
      x = -1379.0, y = -499.0, z = 33.2 },

    { key = 'office_arcadius', kind = 'office', label = 'Arcadius Center',
      price = 2100000, slots = 5, storage = 60,
      x = -117.0, y = -620.0, z = 36.3 },

    { key = 'office_lombank', kind = 'office', label = 'Lom Bank',
      price = 1850000, slots = 5, storage = 60,
      x = -1579.0, y = -558.0, z = 34.9 },

    { key = 'office_mazetower', kind = 'office', label = 'Maze Bank Tower',
      price = 3400000, slots = 5, storage = 80,
      x = -72.0, y = -801.0, z = 44.2 },

    { key = 'office_vespucci', kind = 'office', label = 'Офис на Веспуччи',
      price = 900000, slots = 5, storage = 40,
      x = -1152.0, y = -1522.0, z = 10.6 },

    { key = 'office_sandy', kind = 'office', label = 'Офис в Сэнди-Шорс',
      price = 650000, slots = 5, storage = 40,
      x = 1698.0, y = 3757.0, z = 34.7 },

    -- --- дома --------------------------------------------------------------
    { key = 'house_grove', kind = 'house', label = 'Дом на Гроув-Стрит',
      price = 180000, slots = 1, storage = 20,
      x = -14.0, y = -1441.0, z = 31.1 },

    { key = 'house_davis', kind = 'house', label = 'Дом в Дэвисе',
      price = 165000, slots = 1, storage = 20,
      x = 111.0, y = -1955.0, z = 21.3 },

    { key = 'house_mirror', kind = 'house', label = 'Дом в Миррор-Парк',
      price = 420000, slots = 2, storage = 30,
      x = 1274.0, y = -1720.0, z = 54.8 },

    { key = 'house_vespucci', kind = 'house', label = 'Квартира на Веспуччи',
      price = 350000, slots = 2, storage = 25,
      x = -1156.0, y = -1520.0, z = 10.6 },

    { key = 'house_vinewood', kind = 'house', label = 'Особняк в Вайнвуде',
      price = 1250000, slots = 2, storage = 40,
      x = -682.0, y = 592.0, z = 145.2 },

    { key = 'house_richman', kind = 'house', label = 'Вилла в Ричман',
      price = 1600000, slots = 2, storage = 40,
      x = -1288.0, y = 440.0, z = 96.0 },

    { key = 'house_sandy', kind = 'house', label = 'Дом в Сэнди-Шорс',
      price = 120000, slots = 1, storage = 20,
      x = 1966.0, y = 3816.0, z = 32.4 },

    { key = 'house_paleto', kind = 'house', label = 'Дом в Палето',
      price = 95000, slots = 1, storage = 20,
      x = -12.0, y = 6470.0, z = 31.5 },

    { key = 'house_littleseoul', kind = 'house', label = 'Квартира в Литл-Сеуле',
      price = 290000, slots = 1, storage = 25,
      x = -662.0, y = -854.0, z = 24.5 },

    { key = 'house_strawberry', kind = 'house', label = 'Квартира в Строберри',
      price = 210000, slots = 1, storage = 20,
      x = 336.0, y = -1994.0, z = 23.4 },
}

-- Метки на карте. Купленные показываются другим цветом.
Config.Blips = {
    forSale = { sprite = 350, colour = 2, scale = 0.7 },
    mine    = { sprite = 350, colour = 3, scale = 0.7 },
    family  = { sprite = 350, colour = 5, scale = 0.7 },
    show    = true,
}

-- ---------------------------------------------------------------------------
-- Аукцион
-- ---------------------------------------------------------------------------

Config.Auction = {
    -- Сколько длится лот, в минутах. Игрок выбирает из этого списка.
    durations = { 30, 60, 180, 720 },
    -- Комиссия площадки с продажи, в процентах.
    fee = 5,
    minPrice = 1000,
    -- Шаг ставки в процентах от текущей цены.
    bidStep = 5,
    -- Больше стольких лотов одновременно на одного.
    maxPerPlayer = 3,
}
