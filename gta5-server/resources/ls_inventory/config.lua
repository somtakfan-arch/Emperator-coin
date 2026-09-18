Config = {}

-- Key that opens the inventory. Rebindable in-game under Settings -> Key Bindings.
Config.OpenKey = 'I'

Config.BaseSlots = 54          -- 6 columns x 9 rows
Config.BackpackSlots = 18      -- 3 extra rows once a backpack is bought
Config.BackpackPrice = 25000

Config.Columns = 6

-- Ammo handed over with a weapon when you use it.
Config.WeaponAmmo = 250

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

    -- Полицейское снаряжение. Цены нулевые: это не продаётся в магазине,
    -- а выдаётся при заступлении на службу.
    HANDCUFFS = { label = 'Наручники',       type = 'misc', stack = 3, price = 0 },
    CUFF_KEY  = { label = 'Ключ от наручников', type = 'misc', stack = 1, price = 0 },

    WEAPON_STUNGUN    = { label = 'Тазер',    type = 'weapon', stack = 1, price = 0 },
    WEAPON_NIGHTSTICK = { label = 'Дубинка',  type = 'weapon', stack = 1, price = 0 },

    -- Оружие (ванильное)
    WEAPON_PISTOL        = { label = 'Пистолет',             type = 'weapon', stack = 1, price = 4500 },
    WEAPON_COMBATPISTOL  = { label = 'Боевой пистолет',      type = 'weapon', stack = 1, price = 9500 },
    WEAPON_APPISTOL      = { label = 'AP Pistol',            type = 'weapon', stack = 1, price = 15000 },
    WEAPON_PISTOL50      = { label = 'Pistol .50',           type = 'weapon', stack = 1, price = 17000 },
    WEAPON_MICROSMG      = { label = 'Micro SMG',            type = 'weapon', stack = 1, price = 18000 },
    WEAPON_SMG           = { label = 'SMG',                  type = 'weapon', stack = 1, price = 24000 },
    WEAPON_ASSAULTSMG    = { label = 'Assault SMG',          type = 'weapon', stack = 1, price = 31000 },
    WEAPON_PUMPSHOTGUN   = { label = 'Помповый дробовик',    type = 'weapon', stack = 1, price = 22000 },
    WEAPON_SAWNOFFSHOTGUN= { label = 'Обрез',                type = 'weapon', stack = 1, price = 19000 },
    WEAPON_ASSAULTSHOTGUN= { label = 'Штурмовой дробовик',   type = 'weapon', stack = 1, price = 38000 },
    WEAPON_HEAVYSHOTGUN  = { label = 'Тяжёлый дробовик',     type = 'weapon', stack = 1, price = 44000 },
    WEAPON_CARBINERIFLE  = { label = 'Карабин',              type = 'weapon', stack = 1, price = 48000 },
    WEAPON_ASSAULTRIFLE  = { label = 'Штурмовая винтовка',   type = 'weapon', stack = 1, price = 42000 },
    WEAPON_SPECIALCARBINE= { label = 'Special Carbine',      type = 'weapon', stack = 1, price = 52000 },
    WEAPON_BULLPUPRIFLE  = { label = 'Bullpup Rifle',        type = 'weapon', stack = 1, price = 46000 },
    WEAPON_SNIPERRIFLE   = { label = 'Снайперская винтовка', type = 'weapon', stack = 1, price = 65000 },
    WEAPON_MARKSMANRIFLE = { label = 'Marksman Rifle',       type = 'weapon', stack = 1, price = 72000 },
    WEAPON_MG            = { label = 'Пулемёт',              type = 'weapon', stack = 1, price = 58000 },
    WEAPON_COMBATMG      = { label = 'Боевой пулемёт',       type = 'weapon', stack = 1, price = 68000 },
    WEAPON_KNIFE         = { label = 'Нож',                  type = 'weapon', stack = 1, price = 1200 },
    WEAPON_MACHETE       = { label = 'Мачете',               type = 'weapon', stack = 1, price = 1800 },
    WEAPON_BAT           = { label = 'Бита',                 type = 'weapon', stack = 1, price = 800 },
    WEAPON_CROWBAR       = { label = 'Монтировка',           type = 'weapon', stack = 1, price = 900 },
    WEAPON_GRENADE       = { label = 'Граната',              type = 'weapon', stack = 1, price = 12000 },
    WEAPON_MOLOTOV       = { label = 'Коктейль Молотова',    type = 'weapon', stack = 1, price = 6000 },
}
