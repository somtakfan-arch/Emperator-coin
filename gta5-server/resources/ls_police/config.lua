Config = {}

-- ---------------------------------------------------------------------------
-- Ranks.
--
-- Every permission is checked on the server. Adding a rank here is enough -
-- no code change needed.
-- ---------------------------------------------------------------------------
Config.Ranks = {
    [1] = { label = 'Стажёр',      perms = { cuff = true } },
    [2] = { label = 'Патрульный',  perms = { cuff = true, weapons = true, search = true, fine = true } },
    [3] = { label = 'Сержант',     perms = { cuff = true, weapons = true, search = true, fine = true,
                                             seize = true, arrest = true, impound = true, mdt = true } },
    [4] = { label = 'Лейтенант',   perms = { cuff = true, weapons = true, search = true, fine = true,
                                             seize = true, arrest = true, impound = true, mdt = true,
                                             clearWanted = true } },
    [5] = { label = 'Капитан',     perms = { cuff = true, weapons = true, search = true, fine = true,
                                             seize = true, arrest = true, impound = true, mdt = true,
                                             clearWanted = true, revokeLicense = true } },
    [6] = { label = 'Комиссар',    perms = { cuff = true, weapons = true, search = true, fine = true,
                                             seize = true, arrest = true, impound = true, mdt = true,
                                             clearWanted = true, revokeLicense = true, hire = true } },
}

Config.MaxRank = 6

-- ---------------------------------------------------------------------------
-- Stations: where you go on and off duty, and take a loadout.
-- ---------------------------------------------------------------------------
Config.Stations = {
    { label = 'Mission Row',   x = 441.0,  y = -982.0,  z = 30.7 },
    { label = 'Vespucci',      x = -1108.0, y = -845.0, z = 19.3 },
    { label = 'Sandy Shores',  x = 1853.2, y = 3689.6,  z = 34.3 },
    { label = 'Paleto Bay',    x = -448.6, y = 6012.7,  z = 31.7 },
}

Config.StationBlip = { sprite = 60, colour = 29, scale = 0.9 }
Config.StationRadius = 2.5

-- Handed out when going on duty. Weapons need the "weapons" permission.
Config.Loadout = {
    { item = 'WEAPON_STUNGUN',   perm = nil },
    { item = 'WEAPON_NIGHTSTICK',perm = nil },
    { item = 'HANDCUFFS',        perm = nil },
    { item = 'CUFF_KEY',         perm = nil },
    { item = 'WEAPON_PISTOL',    perm = 'weapons' },
    { item = 'ARMOUR_100',       perm = 'weapons' },
}

-- Uniform: component id -> { drawable, texture } per gender.
Config.Uniform = {
    male = {
        [3]  = { 4, 0 },    -- torso
        [4]  = { 35, 0 },   -- legs
        [6]  = { 25, 0 },   -- shoes
        [8]  = { 58, 0 },   -- undershirt
        [11] = { 55, 0 },   -- top
    },
    female = {
        [3]  = { 3, 0 },
        [4]  = { 34, 0 },
        [6]  = { 25, 0 },
        [8]  = { 35, 0 },
        [11] = { 48, 0 },
    },
}

-- ---------------------------------------------------------------------------
-- Cuffs.
-- ---------------------------------------------------------------------------
Config.Cuffs = {
    applySeconds = 3,        -- animation before they go on
    softEscapeSeconds = 12,  -- how long the escape bar takes
    softEscapeChance = 35,   -- percent, per attempt
    escapeCooldown = 45,     -- seconds after a failed attempt
    hardNeedsKey = true,     -- hard cuffs come off with a key or an officer
    uncuffSeconds = 2,
}

-- ---------------------------------------------------------------------------
-- Escorting.
-- ---------------------------------------------------------------------------
Config.Escort = {
    breakDistance = 6.0,     -- metres before the detainee is let go
    checkInterval = 500,     -- ms
}

-- ---------------------------------------------------------------------------
-- Wanted levels and jail.
-- ---------------------------------------------------------------------------
Config.Wanted = {
    maxLevel = 5,
    -- Automatic additions. The server watches for these itself.
    auto = {
        shooting      = { level = 1, reason = 'Стрельба в городе' },
        killPlayer    = { level = 3, reason = 'Убийство' },
        vehicleTheft  = { level = 1, reason = 'Угон транспорта' },
        officerAssault= { level = 2, reason = 'Нападение на сотрудника' },
    },
    autoCooldown = 60,       -- seconds between automatic additions of the same kind
}

Config.Jail = {
    x = 1691.9, y = 2565.3, z = 45.6,
    releaseX = 1846.0, releaseY = 2585.8, releaseZ = 45.7,
    radius = 70.0,           -- leaving this radius teleports you back
    minMinutes = 1,
    maxMinutes = 120,
    bailPerMinute = 2500,    -- cost to buy the rest of the sentence off
    bailAllowedFromLevel = 1,-- wanted levels at or below this may post bail
}

-- ---------------------------------------------------------------------------
-- Fines.
-- ---------------------------------------------------------------------------
Config.Fines = {
    min = 100,
    max = 500000,
    presets = {
        { label = 'Превышение скорости',     amount = 2500 },
        { label = 'Парковка в неположенном', amount = 1500 },
        { label = 'Неподчинение',            amount = 7500 },
        { label = 'Оружие без лицензии',     amount = 25000 },
        { label = 'Порча имущества',         amount = 12000 },
    },
}

-- ---------------------------------------------------------------------------
-- Tools.
-- ---------------------------------------------------------------------------
Config.Taser = {
    weapon = 'WEAPON_STUNGUN',
    cooldown = 12,           -- seconds between shots
    stunSeconds = 8,
}

Config.Props = {
    { id = 'cone',    label = 'Конус',   model = 'prop_roadcone02a' },
    { id = 'barrier', label = 'Барьер',  model = 'prop_barrier_work05' },
    { id = 'tape',    label = 'Лента',   model = 'prop_consign_02a' },
    { id = 'block',   label = 'Блокпост',model = 'prop_barrier_work06a' },
}

Config.MaxPropsPerOfficer = 30

-- ---------------------------------------------------------------------------
-- Impound.
-- ---------------------------------------------------------------------------
Config.Impound = {
    x = 408.9, y = -1622.9, z = 29.3,
    fee = 15000,
}

-- ---------------------------------------------------------------------------
-- Radio. Text always works; voice is used when pma-voice is running.
-- ---------------------------------------------------------------------------
Config.Radio = {
    channel = 101,
    textCommand = 'r',
}

-- ---------------------------------------------------------------------------
-- Rate limits: max calls per window, per player, per event.
-- ---------------------------------------------------------------------------
Config.RateLimit = {
    windowSeconds = 10,
    default = 10,
    perEvent = {
        ['cuff'] = 4,
        ['uncuff'] = 4,
        ['escort'] = 6,
        ['search'] = 4,
        ['seize'] = 10,
        ['arrest'] = 3,
        ['fine'] = 5,
        ['taser'] = 6,
        ['prop'] = 15,
        ['mdt'] = 12,
        ['radio'] = 10,
        ['escape'] = 3,
    },
}

-- How close an officer must be to act on someone. Checked on the server.
Config.ActionDistance = 3.0

-- ---------------------------------------------------------------------------
-- Discord logging. Leave the URL empty to turn it off.
-- ---------------------------------------------------------------------------
Config.Discord = {
    webhook = '',
    username = 'МВД',
    colour = 3447003,
}
