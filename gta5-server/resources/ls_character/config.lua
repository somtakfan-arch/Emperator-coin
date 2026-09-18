Config = {}

-- Static IDs are handed out in order, starting here, and never reused.
Config.FirstStatic = 1

-- Name rules. Latin and Cyrillic only - no digits, no symbols.
Config.NameMin = 2
Config.NameMax = 16
Config.NamePattern = "^[A-Za-zА-Яа-яЁё%-]+$"

-- Show "Имя Фамилия | #12" above nearby players.
Config.ShowTags = true
Config.TagDistance = 18.0

Config.Models = {
    male   = 'mp_m_freemode_01',
    female = 'mp_f_freemode_01',
}

-- Head blend parents: 45 mothers and fathers ship with the game.
Config.MaxParent = 45

-- SetPedFaceFeature indices, in the order the game defines them.
Config.Features = {
    [0]  = 'Ширина носа',
    [1]  = 'Высота кончика носа',
    [2]  = 'Длина носа',
    [3]  = 'Высота переносицы',
    [4]  = 'Наклон кончика носа',
    [5]  = 'Изгиб переносицы',
    [6]  = 'Высота бровей',
    [7]  = 'Выступ бровей',
    [8]  = 'Высота скул',
    [9]  = 'Ширина скул',
    [10] = 'Полнота щёк',
    [11] = 'Разрез глаз',
    [12] = 'Полнота губ',
    [13] = 'Ширина челюсти',
    [14] = 'Длина челюсти',
    [15] = 'Высота подбородка',
    [16] = 'Длина подбородка',
    [17] = 'Ширина подбородка',
    [18] = 'Ямочка на подбородке',
    [19] = 'Толщина шеи',
}

-- Head overlays worth exposing at creation. colourType: 1 = hair palette,
-- 2 = makeup palette, nil = no colour control.
Config.Overlays = {
    { id = 1,  label = 'Борода',    colourType = 1 },
    { id = 2,  label = 'Брови',     colourType = 1 },
    { id = 0,  label = 'Веснушки',  colourType = nil },
    { id = 3,  label = 'Возраст',   colourType = nil },
    { id = 6,  label = 'Цвет лица', colourType = nil },
    { id = 4,  label = 'Макияж',    colourType = 2 },
    { id = 8,  label = 'Помада',    colourType = 2 },
}

Config.MaxEyeColour = 31
