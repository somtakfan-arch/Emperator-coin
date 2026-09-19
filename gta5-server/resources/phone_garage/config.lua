Config = {}

-- Key that opens the phone. Rebindable in-game: Settings -> Key Bindings -> FiveM.
-- 'UP' is the up arrow; F1 collides with other bindings too often.
Config.OpenKey = 'UP'

-- Money a player starts with, the first time they ever join.
Config.StartingMoney = 250000

-- Share of the price you get back when selling a car from the garage.
Config.SellRefund = 0.6

-- ---------------------------------------------------------------------------
-- Номера.
--
-- Формат российский: А123ВС 77. Буквы взяты только те 12, что есть и в
-- кириллице, и в латинице - в игре шрифт латинский, но читается как русский
-- номер. Всё вместе ровно 8 символов, это предел GTA.
-- ---------------------------------------------------------------------------
Config.Plates = {
    letters = 'ABEKMHOPCTYX',
    regions = { '77', '97', '99', '50', '90', '78', '23', '61', '16', '02' },
    -- Стиль таблички: 0 синяя, 1 жёлтая, 2 синяя с белым, 3 жёлтая с чёрным,
    -- 4 экзотическая, 5 северная Янктон.
    style = 0,
}

-- How far the script looks for a parking spot before falling back to the roadside.
Config.MaxSearchRadius = 400.0

-- Anyone may record new parking spots with /parkhere. Set to true to require
-- the "garage.admin" ace instead (add_ace group.admin garage.admin allow).
Config.RestrictParkHere = false

-- ---------------------------------------------------------------------------
-- Dealership catalog.
--
-- All models below ship with GTA V, so this works on a stock server. To sell
-- add-on cars, add an entry with the spawn name from your car pack - the ones
-- setup.ps1 / setup.sh wrote into spawn-names.txt.
-- ---------------------------------------------------------------------------
Config.Catalog = {
    -- Гиперкары
    { model = 'adder',     label = 'Truffade Adder',        class = 'Гиперкары', price = 1000000 },
    { model = 'nero2',     label = 'Truffade Nero Custom',  class = 'Гиперкары', price = 1440000 },
    { model = 'thrax',     label = 'Truffade Thrax',        class = 'Гиперкары', price = 2325000 },
    { model = 'deveste',   label = 'Principe Deveste Eight',class = 'Гиперкары', price = 1795000 },
    { model = 'krieger',   label = 'Benefactor Krieger',    class = 'Гиперкары', price = 2875000 },
    { model = 'emerus',    label = 'Progen Emerus',         class = 'Гиперкары', price = 2750000 },
    { model = 'zorrusso',  label = 'Pegassi Zorrusso',      class = 'Гиперкары', price = 1925000 },
    { model = 'entity2',   label = 'Överflöd Entity XXR',   class = 'Гиперкары', price = 2305000 },

    -- Суперкары
    { model = 'zentorno',  label = 'Pegassi Zentorno',      class = 'Суперкары', price = 725000 },
    { model = 't20',       label = 'Progen T20',            class = 'Суперкары', price = 2200000 },
    { model = 'italigtb2', label = 'Progen Itali GTB Custom',class = 'Суперкары',price = 1189000 },
    { model = 'osiris',    label = 'Pegassi Osiris',        class = 'Суперкары', price = 1950000 },

    -- Спорт
    { model = 'elegy2',    label = 'Annis Elegy RH8',       class = 'Спорт',     price = 95000 },
    { model = 'sultan',    label = 'Karin Sultan',          class = 'Спорт',     price = 12000 },
    { model = 'comet2',    label = 'Pfister Comet',         class = 'Спорт',     price = 100000 },
    { model = 'dominator', label = 'Vapid Dominator',       class = 'Спорт',     price = 35000 },

    -- Внедорожники и прочее
    { model = 'kuruma2',   label = 'Karin Kuruma (броня)',  class = 'Разное',    price = 698000 },
    { model = 'sandking',  label = 'Vapid Sandking XL',     class = 'Разное',    price = 45000 },
    { model = 'sanchez',   label = 'Maibatsu Sanchez',      class = 'Разное',    price = 8000 },
    { model = 'vigilante', label = 'Vigilante',             class = 'Разное',    price = 3750000 },
}

-- ---------------------------------------------------------------------------
-- Parking spots.
--
-- These are hand-picked approximations, not surveyed coordinates: the script
-- snaps every spot to the ground and skips occupied ones, so a few metres of
-- drift is harmless. If a spot lands somewhere silly, stand where you want it
-- and type /parkhere - that records an exact one and everybody gets it.
-- ---------------------------------------------------------------------------
Config.ParkingSpots = {
    { x = 215.0,   y = -805.0,  z = 30.7,  h = 340.0, label = 'Legion Square' },
    { x = 224.0,   y = -800.0,  z = 30.6,  h = 250.0, label = 'Legion Square' },
    { x = 425.0,   y = -1020.0, z = 29.0,  h = 90.0,  label = 'Mission Row' },
    { x = 300.0,   y = -570.0,  z = 43.2,  h = 70.0,  label = 'Pillbox Hill' },
    { x = -570.0,  y = -930.0,  z = 23.9,  h = 90.0,  label = 'Little Seoul' },
    { x = 200.0,   y = -1650.0, z = 29.3,  h = 140.0, label = 'Strawberry' },
    { x = 110.0,   y = -1940.0, z = 20.8,  h = 320.0, label = 'Grove Street' },
    { x = 725.0,   y = -1080.0, z = 22.2,  h = 0.0,   label = 'La Mesa / LSC' },
    { x = -1190.0, y = -1500.0, z = 4.4,   h = 125.0, label = 'Vespucci Beach' },
    { x = -1600.0, y = -1000.0, z = 13.0,  h = 320.0, label = 'Del Perro Pier' },
    { x = -720.0,  y = -180.0,  z = 37.0,  h = 210.0, label = 'Rockford Hills' },
    { x = 300.0,   y = 180.0,   z = 104.0, h = 160.0, label = 'Vinewood Blvd' },
    { x = 920.0,   y = 40.0,    z = 80.0,  h = 60.0,  label = 'Vinewood Casino' },
    { x = -170.0,  y = 500.0,   z = 137.0, h = 100.0, label = 'Vinewood Hills' },
    { x = -430.0,  y = 1090.0,  z = 325.0, h = 260.0, label = 'Обсерватория' },
    { x = -1040.0, y = -2700.0, z = 20.0,  h = 240.0, label = 'Аэропорт LSIA' },
    { x = -290.0,  y = -2000.0, z = 28.0,  h = 350.0, label = 'Maze Bank Arena' },
    { x = 100.0,   y = -2550.0, z = 6.0,   h = 55.0,  label = 'Порт Elysian' },
    { x = -3200.0, y = 1000.0,  z = 12.0,  h = 270.0, label = 'Chumash' },
    { x = -2100.0, y = 3150.0,  z = 32.8,  h = 150.0, label = 'Форт Занкудо' },
    { x = 90.0,    y = 3600.0,  z = 39.0,  h = 300.0, label = 'Harmony' },
    { x = 1735.0,  y = 3710.0,  z = 34.1,  h = 20.0,  label = 'Sandy Shores' },
    { x = 1690.0,  y = 4800.0,  z = 42.0,  h = 100.0, label = 'Grapeseed' },
    { x = -110.0,  y = 6450.0,  z = 31.5,  h = 45.0,  label = 'Paleto Bay' },
    { x = 1600.0,  y = 6450.0,  z = 25.0,  h = 150.0, label = 'Mount Chiliad' },
}
