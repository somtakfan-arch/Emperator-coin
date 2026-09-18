Config = {}

-- ---------------------------------------------------------------------------
-- Death.
-- ---------------------------------------------------------------------------
Config.Death = {
    lieSeconds = 30,        -- forced on the ground before the hospital is offered
    respawnControl = 38,    -- E
    reviveHealth = 140,     -- out of 200
    -- Weapons carried on the ped are lost on death. Items in the inventory are
    -- untouched: only what was in your hands goes.
    dropWeapons = true,
}

Config.Hospitals = {
    { label = 'Pillbox Hill', x = 298.6,  y = -584.4,  z = 43.3, h = 70.0 },
    { label = 'Mount Zonah',  x = -449.7, y = -340.1,  z = 34.5, h = 88.0 },
    { label = 'Sandy Shores', x = 1839.0, y = 3672.9,  z = 34.3, h = 208.0 },
    { label = 'Paleto Bay',   x = -247.8, y = 6331.2,  z = 32.4, h = 224.0 },
}

Config.HospitalBlip = { sprite = 61, colour = 2, scale = 0.7 }

-- ---------------------------------------------------------------------------
-- Defibrillator.
-- ---------------------------------------------------------------------------
Config.Defib = {
    item = 'DEFIBRILLATOR',
    otherSeconds = 6,       -- reviving someone else
    selfSeconds = 12,       -- reviving yourself takes longer
    selfChance = 60,        -- percent; a failed self-revive still burns the unit
    distance = 2.5,
}

-- ---------------------------------------------------------------------------
-- Painkillers.
--
-- `defense` is the weapon defense modifier applied while it lasts: 0.75 means
-- incoming damage is cut by a quarter. Lower is stronger.
-- ---------------------------------------------------------------------------
Config.Painkillers = {
    PAINKILLER_WEAK = {
        label = 'Анальгин', defense = 0.85, melee = 0.90, seconds = 120,
    },
    PAINKILLER_MED = {
        label = 'Кетанов', defense = 0.70, melee = 0.80, seconds = 180,
    },
    PAINKILLER_STRONG = {
        label = 'Морфин', defense = 0.55, melee = 0.65, seconds = 240,
    },
}

-- Taking a second one replaces the first rather than stacking: no combining
-- three weak pills into immortality.
Config.PainkillerStacks = false

-- ---------------------------------------------------------------------------
-- Masks. Component 1 is the mask slot on freemode peds.
-- ---------------------------------------------------------------------------
Config.Masks = {
    MASK_BALACLAVA = { label = 'Балаклава',      drawable = 52,  texture = 0 },
    MASK_SKULL     = { label = 'Череп',          drawable = 12,  texture = 0 },
    MASK_HOCKEY    = { label = 'Хоккейная',      drawable = 25,  texture = 0 },
    MASK_GASMASK   = { label = 'Противогаз',     drawable = 35,  texture = 0 },
    MASK_BANDANA   = { label = 'Бандана',        drawable = 5,   texture = 0 },
    MASK_MEDICAL   = { label = 'Медицинская',    drawable = 122, texture = 0 },
}

Config.MaskComponent = 1
