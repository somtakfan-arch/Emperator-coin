Config = {}

-- How close you have to stand before the shop marker reacts.
Config.Interact = 2.0
Config.MarkerRange = 25.0
Config.OpenControl = 38          -- E

-- Price charged per changed slot when you confirm in a clothing store / barber.
Config.ClothingSlotPrice = 250
Config.BarberSlotPrice = 150

-- ---------------------------------------------------------------------------
-- Shop types. Blip sprite/colour reference: docs.fivem.net/docs/game-references/blips
-- ---------------------------------------------------------------------------
Config.Types = {
    clothing = { label = 'Магазин одежды', blip = 73,  colour = 0,  prompt = 'одежду' },
    barber   = { label = 'Барбершоп',      blip = 71,  colour = 48, prompt = 'причёску' },
    ammu     = { label = 'Ammu-Nation',    blip = 110, colour = 1,  prompt = 'оружие' },
    store    = { label = 'Магазин 24/7',   blip = 52,  colour = 2,  prompt = 'товары' },
}

-- ---------------------------------------------------------------------------
-- Locations.
--
-- These are the well-known community coordinates for the stock GTA V shops.
-- They are accurate to a metre or two, which the marker radius covers. If one
-- sits badly, stand where it should be and type /shophere <type> - that records
-- an exact one for everybody, same as /parkhere does for parking.
-- ---------------------------------------------------------------------------
Config.Shops = {
    -- Одежда
    { type = 'clothing', x = 72.3,    y = -1399.1, z = 29.4,  label = 'Binco, Innocence Blvd' },
    { type = 'clothing', x = -703.8,  y = -152.3,  z = 37.4,  label = 'Ponsonbys, Rockford' },
    { type = 'clothing', x = -167.9,  y = -299.0,  z = 39.7,  label = 'Ponsonbys, Hawick' },
    { type = 'clothing', x = -822.3,  y = -1073.8, z = 11.3,  label = 'Suburban, Del Perro' },
    { type = 'clothing', x = -1447.8, y = -242.5,  z = 49.8,  label = 'Ponsonbys, Morningwood' },
    { type = 'clothing', x = 123.6,   y = -219.4,  z = 54.6,  label = 'Suburban, Hawick' },
    { type = 'clothing', x = 11.6,    y = 6514.2,  z = 31.9,  label = 'Binco, Paleto Bay' },
    { type = 'clothing', x = 1696.2,  y = 4829.3,  z = 42.1,  label = 'Binco, Grapeseed' },
    { type = 'clothing', x = 618.1,   y = 2759.6,  z = 42.1,  label = 'Binco, Harmony' },
    { type = 'clothing', x = -3172.5, y = 1048.1,  z = 20.9,  label = 'Binco, Chumash' },
    { type = 'clothing', x = -1108.4, y = 2708.9,  z = 19.1,  label = 'Binco, Route 68' },
    { type = 'clothing', x = 428.7,   y = -800.1,  z = 29.5,  label = 'Suburban, Downtown' },

    -- Барбершопы
    { type = 'barber', x = -814.3,  y = -183.8,  z = 37.6,  label = 'Hawick' },
    { type = 'barber', x = 136.8,   y = -1708.4, z = 29.3,  label = 'Davis' },
    { type = 'barber', x = -1282.6, y = -1116.8, z = 6.9,   label = 'Del Perro' },
    { type = 'barber', x = 1931.5,  y = 3729.7,  z = 32.8,  label = 'Sandy Shores' },
    { type = 'barber', x = -32.9,   y = -152.3,  z = 57.1,  label = 'Downtown' },
    { type = 'barber', x = -278.1,  y = 6228.5,  z = 31.7,  label = 'Paleto Bay' },
    { type = 'barber', x = 1212.8,  y = -472.9,  z = 66.2,  label = 'Mirror Park' },

    -- Ammu-Nation
    { type = 'ammu', x = 22.1,    y = -1107.2, z = 29.8,  label = 'Pillbox Hill' },
    { type = 'ammu', x = 810.2,   y = -2157.3, z = 29.6,  label = 'Cypress Flats' },
    { type = 'ammu', x = 1693.4,  y = 3760.2,  z = 34.7,  label = 'Sandy Shores' },
    { type = 'ammu', x = -330.2,  y = 6083.9,  z = 31.4,  label = 'Paleto Bay' },
    { type = 'ammu', x = 252.6,   y = -50.0,   z = 69.9,  label = 'Hawick' },
    { type = 'ammu', x = -662.1,  y = -935.3,  z = 21.8,  label = 'Little Seoul' },
    { type = 'ammu', x = -1305.2, y = -393.5,  z = 36.7,  label = 'Morningwood' },
    { type = 'ammu', x = -3172.6, y = 1087.7,  z = 20.8,  label = 'Chumash' },
    { type = 'ammu', x = 2567.6,  y = 294.3,   z = 108.7, label = 'Tataviam' },
    { type = 'ammu', x = -1117.5, y = 2698.6,  z = 18.5,  label = 'Route 68' },

    -- 24/7 и прочее
    { type = 'store', x = 25.7,    y = -1347.3, z = 29.5,  label = '24/7, Davis' },
    { type = 'store', x = -3038.9, y = 585.9,   z = 7.9,   label = '24/7, Great Ocean Hwy' },
    { type = 'store', x = 1729.2,  y = 6414.1,  z = 35.0,  label = '24/7, Paleto Bay' },
    { type = 'store', x = 1697.9,  y = 4924.4,  z = 42.1,  label = '24/7, Grapeseed' },
    { type = 'store', x = -706.2,  y = -914.6,  z = 19.2,  label = 'LTD, Little Seoul' },
    { type = 'store', x = -47.5,   y = -1757.5, z = 29.4,  label = 'LTD, Davis' },
    { type = 'store', x = 1163.4,  y = -323.8,  z = 69.2,  label = '24/7, Mirror Park' },
    { type = 'store', x = 373.9,   y = 325.9,   z = 103.6, label = "Rob's Liquor, Downtown" },
    { type = 'store', x = 2557.5,  y = 382.3,   z = 108.6, label = '24/7, Tataviam' },
    { type = 'store', x = -1222.9, y = -906.9,  z = 12.3,  label = "Rob's Liquor, Del Perro" },
}

-- ---------------------------------------------------------------------------
-- Style editor slots.
--
-- kind: component  -> SetPedComponentVariation
--       prop       -> SetPedPropIndex (-1 means nothing worn)
--       hairColour -> SetPedHairColor
--       overlay    -> SetPedHeadOverlay (255 means none)
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Руки.
--
-- В GTA V слот 11 (верх) и слот 3 (торс с руками) связаны: почти у каждой
-- куртки свой набор рукавов, и если поставить верх, а торс оставить чужой,
-- руки просто исчезают. Магазин даёт крутить оба слота независимо, так что
-- остаться без рук - дело двух нажатий.
--
-- Полной таблицы соответствий тут нет и быть не может: у каждой модели свои
-- сотни вариантов. Вместо неё при смене верха торс сбрасывается на значение,
-- которое отрисовывается всегда. Нужны рукава именно от этой куртки - крути
-- слот "Торс и руки" руками, он никуда не делся, плюс есть /fixarms.
Config.FixArms = true
Config.DefaultTorso = 0

Config.ClothingSlots = {
    { kind = 'component', id = 1,  label = 'Маска' },
    { kind = 'component', id = 11, label = 'Верх' },
    { kind = 'component', id = 3,  label = 'Торс и руки' },
    { kind = 'component', id = 8,  label = 'Футболка' },
    { kind = 'component', id = 10, label = 'Нашивки' },
    { kind = 'component', id = 4,  label = 'Штаны' },
    { kind = 'component', id = 6,  label = 'Обувь' },
    { kind = 'component', id = 5,  label = 'Сумка' },
    { kind = 'component', id = 7,  label = 'Аксессуар' },
    { kind = 'component', id = 9,  label = 'Жилет' },
    { kind = 'prop',      id = 0,  label = 'Головной убор' },
    { kind = 'prop',      id = 1,  label = 'Очки' },
    { kind = 'prop',      id = 2,  label = 'Серьги' },
    { kind = 'prop',      id = 6,  label = 'Часы' },
    { kind = 'prop',      id = 7,  label = 'Браслет' },
}

Config.BarberSlots = {
    { kind = 'component',  id = 2, label = 'Причёска' },
    { kind = 'hairColour', id = 0, label = 'Цвет волос' },
    { kind = 'hairColour', id = 1, label = 'Мелирование' },
    { kind = 'overlay',    id = 1, label = 'Борода' },
    { kind = 'overlay',    id = 2, label = 'Брови' },
    { kind = 'overlay',    id = 10, label = 'Щетина по телу' },
}

-- ---------------------------------------------------------------------------
-- What each shop is allowed to sell.
--
-- The stock itself - labels, prices, and every add-on weapon the installer
-- found - comes from ls_inventory, so a new gun pack shows up in Ammu-Nation
-- without touching this file.
-- ---------------------------------------------------------------------------
Config.Sells = {
    ammu  = { weapon = true, armour = true, mask = true },
    store = { food = true, painkiller = true, mask = true, defib = true },
}
