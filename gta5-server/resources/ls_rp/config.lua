Config = {}

-- E, same key the shops use. ls_rp stands down when a shop prompt is showing.
Config.InteractControl = 38
Config.InteractDistance = 2.6
Config.PromptDistance = 6.0

-- The server re-checks this before moving anything between two players, so a
-- faked client request cannot reach someone across the map.
Config.MaxGiveDistance = 4.0

Config.MedCardPrice = 5000
Config.BloodTypes = { 'O(I) Rh+', 'O(I) Rh−', 'A(II) Rh+', 'A(II) Rh−',
                      'B(III) Rh+', 'B(III) Rh−', 'AB(IV) Rh+', 'AB(IV) Rh−' }

-- Clinics that issue the medical card.
Config.Clinics = {
    { x = 295.8,   y = -1446.5, z = 29.9, label = 'Pillbox Hill Medical' },
    { x = -449.5,  y = -340.9,  z = 34.5, label = 'Mount Zonah Medical' },
    { x = 1839.5,  y = 3672.9,  z = 34.3, label = 'Sandy Shores Medical' },
    { x = -247.6,  y = 6331.3,  z = 32.4, label = 'Paleto Bay Care' },
}

Config.ClinicBlip = { sprite = 61, colour = 2, scale = 0.8 }

-- Emotes. Every one of these lives in the anim@mp_player_intupper* family,
-- which ships with the base game, so no add-on animation pack is needed.
Config.Emotes = {
    { id = 'wave',   label = 'Помахать',      dict = 'anim@mp_player_intupperwave',      anim = 'idle_a' },
    { id = 'salute', label = 'Отдать честь',  dict = 'anim@mp_player_intuppersalute',    anim = 'idle_a' },
    { id = 'clap',   label = 'Поаплодировать',dict = 'anim@mp_player_intupperslow_clap', anim = 'idle_a' },
    { id = 'palm',   label = 'Фейспалм',      dict = 'anim@mp_player_intupperface_palm', anim = 'idle_a' },
    { id = 'finger', label = 'Средний палец', dict = 'anim@mp_player_intupperfinger',    anim = 'idle_a' },
}

Config.DocumentLabels = {
    passport = 'Паспорт',
    medcard  = 'Медицинская справка',
    vehicle  = 'СТС (свидетельство о регистрации)',
}
