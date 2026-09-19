Config = {}

-- Static IDs are handed out in order, starting here, and never reused.
Config.FirstStatic = 1

-- Name rules. Latin and Cyrillic only - no digits, no symbols.
Config.NameMin = 2
Config.NameMax = 16

-- Разрешённые буквы - диапазонами юникода, а НЕ шаблоном Lua.
-- Шаблон "^[A-Za-zА-Яа-яЁё%-]+$" выглядит правильно, но Lua читает его
-- побайтово: "а-я" превращается в диапазон байтов, который не покрывает
-- р…я (это байты D1 80…D1 8F). "Петров" и "Смирнов" такой шаблон
-- отвергает, а "Иван" пропускает.
Config.NameRanges = {
    { 0x0041, 0x005A },   -- A-Z
    { 0x0061, 0x007A },   -- a-z
    { 0x0410, 0x044F },   -- А-я
    { 0x0401, 0x0401 },   -- Ё
    { 0x0451, 0x0451 },   -- ё
    { 0x002D, 0x002D },   -- дефис, для двойных фамилий
}

-- Спавн на точке выхода. Позиция лежит в characters.json рядом с самим
-- персонажем, так что переживает и релог, и рестарт сервера.
Config.RememberPosition = true

-- Как часто клиент шлёт свои координаты. Это же и максимальный "откат"
-- назад при вылете: с 10 секундами игрок теряет метров сто бега, не больше.
Config.PositionInterval = 10000

-- Как часто сервер сбрасывает накопленное в файл. Писать файл на каждый
-- пакет от каждого игрока - это диск на 20 человек в секунду.
Config.PositionFlush = 60000

-- Меньше этого не шлём: стоящий на месте игрок не должен ничего слать.
Config.PositionMinMove = 2.0

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
