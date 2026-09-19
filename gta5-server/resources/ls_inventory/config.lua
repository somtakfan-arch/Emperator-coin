Config = {}

-- Key that opens the inventory. Rebindable in-game under Settings -> Key Bindings.
Config.OpenKey = 'I'

Config.BaseSlots = 54          -- 6 columns x 9 rows
Config.BackpackSlots = 18      -- 3 extra rows once a backpack is bought
Config.BackpackPrice = 25000

Config.Columns = 6

-- Ammo handed over with a weapon when you use it.
-- ---------------------------------------------------------------------------
-- Кто чем торгует.
--
-- tier = 'serious' стоит на всём автоматическом, нарезном и взрывающемся.
-- Такое не продаётся ни в оружейном магазине, ни на чёрном рынке из воздуха:
-- в мир оно попадает только через склад госфракции. Дальше ходит по рукам -
-- отобрали, потеряли, продали на чёрный рынок, - но новых стволов ниоткуда
-- не берётся. Это и держит цену.
--
-- Всё, у чего tier не задан, считается обычным и продаётся как раньше.
Config.SeriousTier = 'serious'

-- Типы предметов, которые обслуживает другой ресурс. Он же решает, тратится
-- ли штука: отказ не должен съедать семечко.
Config.ExternalTypes = {
    tool = 'ls_crime',
    drug = 'ls_crime',
    part = 'ls_crime',
}

Config.WeaponAmmo = 250

-- ---------------------------------------------------------------------------
-- Видимый бронежилет.
--
-- Слот 9 у freemode-моделей - это бронежилет. Раньше броня была только
-- числом в углу экрана: надел - и по тебе не видно, что на тебе жилет.
-- Теперь виден, и слетает вместе с бронёй, когда её отстреляли в ноль.
--
-- d - номер модели жилета, t - расцветка. Подобрать другую можно прямо в
-- гардеробе: слот "Жилет" крутит те же значения.
Config.ShowArmour = true
Config.ArmourLook = {
    male = {
        [50]  = { d = 1, t = 0 },
        [100] = { d = 2, t = 0 },
    },
    female = {
        [50]  = { d = 1, t = 0 },
        [100] = { d = 2, t = 0 },
    },
}

-- Add-on weapons found by the installer are read from this file and registered
-- automatically, so a new gun pack does not need a config edit.
Config.AddonWeaponFile = 'addon_weapons.json'
Config.AddonWeaponResource = 'ls_shops'
Config.AddonWeaponPrice = 35000

-- ---------------------------------------------------------------------------
-- Items.
--
-- type:  weapon  -> handed to the player and used up
--        armour  -> sets body armour to `value` percent, used up
--        food    -> heals `heal` points, used up
--        misc    -> no effect, just sits there
-- ---------------------------------------------------------------------------
Config.Items = {
    -- Броня
    ARMOUR_50  = { label = 'Бронежилет 50%',  type = 'armour', value = 50,  stack = 5, price = 3500 },
    ARMOUR_100 = { label = 'Бронежилет 100%', type = 'armour', value = 100, stack = 5, price = 7500 },

    -- Еда и медицина
    SNACK  = { label = 'Чипсы',     type = 'food', heal = 25,  stack = 10, price = 150 },
    BURGER = { label = 'Бургер',    type = 'food', heal = 60,  stack = 10, price = 400 },
    WATER  = { label = 'Вода',      type = 'food', heal = 15,  stack = 10, price = 100 },
    ENERGY = { label = 'Энергетик', type = 'food', heal = 40,  stack = 10, price = 350 },
    MEDKIT = { label = 'Аптечка',   type = 'food', heal = 100, stack = 5,  price = 2500 },

    -- Медицина
    DEFIBRILLATOR = { label = 'Дефибриллятор', type = 'defib', stack = 3, price = 18000 },

    PAINKILLER_WEAK   = { label = 'Анальгин', type = 'painkiller', stack = 10, price = 900 },
    PAINKILLER_MED    = { label = 'Кетанов',  type = 'painkiller', stack = 10, price = 3200 },
    PAINKILLER_STRONG = { label = 'Морфин',   type = 'painkiller', stack = 5,  price = 9500 },

    -- Маски. Надеваются и снимаются, не расходуются.
    MASK_BALACLAVA = { label = 'Балаклава',   type = 'mask', stack = 1, price = 4500 },
    MASK_SKULL     = { label = 'Маска-череп', type = 'mask', stack = 1, price = 6000 },
    MASK_HOCKEY    = { label = 'Хоккейная маска', type = 'mask', stack = 1, price = 5200 },
    MASK_GASMASK   = { label = 'Противогаз',  type = 'mask', stack = 1, price = 11000 },
    MASK_BANDANA   = { label = 'Бандана',     type = 'mask', stack = 1, price = 1800 },
    MASK_MEDICAL   = { label = 'Медицинская маска', type = 'mask', stack = 1, price = 400 },

    -- Криминал. Инструменты и товар - ими занимается ls_crime.
    LOCKPICK   = { label = 'Отмычка',      type = 'tool', stack = 5,  price = 2500 },
    DRILL      = { label = 'Дрель',        type = 'tool', stack = 2,  price = 14000 },
    THERMITE   = { label = 'Термит',       type = 'tool', stack = 2,  price = 45000 },
    HACK_KIT   = { label = 'Скиммер',      type = 'tool', stack = 3,  price = 9000 },

    WEED_SEED  = { label = 'Семена конопли', type = 'drug', stack = 20, price = 1200 },
    WEED_RAW   = { label = 'Сырая конопля',  type = 'drug', stack = 50, price = 0 },
    WEED_PACK  = { label = 'Пакет травы',    type = 'drug', stack = 30, price = 0 },

    CAR_PART   = { label = 'Автозапчасть',  type = 'part', stack = 30, price = 0 },
    MONEY_BAG  = { label = 'Мешок с деньгами', type = 'part', stack = 6, price = 0 },

    -- Мир: метки банд и лагеря.
    SPRAY_CAN = { label = 'Баллончик',        type = 'tool', stack = 10, price = 1500 },
    CAMP_KIT  = { label = 'Набор для лагеря', type = 'tool', stack = 3,  price = 12000 },

    -- Полицейское снаряжение. Цены нулевые: это не продаётся в магазине,
    -- а выдаётся при заступлении на службу.
    HANDCUFFS = { label = 'Наручники',       type = 'misc', stack = 3, price = 0 },
    CUFF_KEY  = { label = 'Ключ от наручников', type = 'misc', stack = 1, price = 0 },

    WEAPON_STUNGUN    = { label = 'Тазер',    type = 'weapon', stack = 1, price = 0 },
    WEAPON_NIGHTSTICK = { label = 'Дубинка',  type = 'weapon', stack = 1, price = 0 },

    -- Оружие (ванильное)
    WEAPON_PISTOL        = { label = 'Пистолет',             type = 'weapon', stack = 1, price = 4500 },
    WEAPON_COMBATPISTOL  = { label = 'Боевой пистолет',      type = 'weapon', stack = 1, price = 9500 },
    WEAPON_APPISTOL      = { label = 'AP Pistol',            type = 'weapon', tier = 'serious', stack = 1, price = 15000 },
    WEAPON_PISTOL50      = { label = 'Pistol .50',           type = 'weapon', tier = 'serious', stack = 1, price = 17000 },
    WEAPON_MICROSMG      = { label = 'Micro SMG',            type = 'weapon', tier = 'serious', stack = 1, price = 18000 },
    WEAPON_SMG           = { label = 'SMG',                  type = 'weapon', tier = 'serious', stack = 1, price = 24000 },
    WEAPON_ASSAULTSMG    = { label = 'Assault SMG',          type = 'weapon', tier = 'serious', stack = 1, price = 31000 },
    WEAPON_PUMPSHOTGUN   = { label = 'Помповый дробовик',    type = 'weapon', stack = 1, price = 22000 },
    WEAPON_SAWNOFFSHOTGUN= { label = 'Обрез',                type = 'weapon', stack = 1, price = 19000 },
    WEAPON_ASSAULTSHOTGUN= { label = 'Штурмовой дробовик',   type = 'weapon', tier = 'serious', stack = 1, price = 38000 },
    WEAPON_HEAVYSHOTGUN  = { label = 'Тяжёлый дробовик',     type = 'weapon', tier = 'serious', stack = 1, price = 44000 },
    WEAPON_CARBINERIFLE  = { label = 'Карабин',              type = 'weapon', tier = 'serious', stack = 1, price = 48000 },
    WEAPON_ASSAULTRIFLE  = { label = 'Штурмовая винтовка',   type = 'weapon', tier = 'serious', stack = 1, price = 42000 },
    WEAPON_SPECIALCARBINE= { label = 'Special Carbine',      type = 'weapon', tier = 'serious', stack = 1, price = 52000 },
    WEAPON_BULLPUPRIFLE  = { label = 'Bullpup Rifle',        type = 'weapon', tier = 'serious', stack = 1, price = 46000 },
    WEAPON_SNIPERRIFLE   = { label = 'Снайперская винтовка', type = 'weapon', tier = 'serious', stack = 1, price = 65000 },
    WEAPON_MARKSMANRIFLE = { label = 'Marksman Rifle',       type = 'weapon', tier = 'serious', stack = 1, price = 72000 },
    WEAPON_MG            = { label = 'Пулемёт',              type = 'weapon', tier = 'serious', stack = 1, price = 58000 },
    WEAPON_COMBATMG      = { label = 'Боевой пулемёт',       type = 'weapon', tier = 'serious', stack = 1, price = 68000 },
    WEAPON_KNIFE         = { label = 'Нож',                  type = 'weapon', stack = 1, price = 1200 },
    WEAPON_MACHETE       = { label = 'Мачете',               type = 'weapon', stack = 1, price = 1800 },
    WEAPON_BAT           = { label = 'Бита',                 type = 'weapon', stack = 1, price = 800 },
    WEAPON_CROWBAR       = { label = 'Монтировка',           type = 'weapon', stack = 1, price = 900 },
    WEAPON_GRENADE       = { label = 'Граната',              type = 'weapon', tier = 'serious', stack = 1, price = 12000 },
    WEAPON_MOLOTOV       = { label = 'Коктейль Молотова',    type = 'weapon', stack = 1, price = 6000 },
}
