Config = {}

Config.Interact = 2.0
Config.Cooldown = 700

-- Предмет, который тратится на закладку. Продаётся на чёрном рынке.
Config.Kit = 'STASH_KIT'

-- Сколько схронов держит одна семья и сколько слотов в каждом.
Config.MaxPerFamily = 3
Config.Slots = 20

-- Два схрона рядом - это один большой склад в обход лимита.
Config.MinApart = 120.0

-- Вскрытие чужого.
Config.Raid = {
    tool = 'LOCKPICK',
    seconds = 30,
    crime = 'burglary',
    -- Метка на карте для всех, пока вскрывают: схрон стоит защищать.
    hotspotSeconds = 120,
}

Config.Blip = { sprite = 480, colour = 5, scale = 0.7 }
