Config = {}

-- Сколько метров вокруг игрока гангстеры вообще существуют. Дальше этого
-- педы удаляются - иначе полсотни NPC висят в памяти у каждого клиента.
Config.StreamDistance = 160.0

-- Раненый гангстер поднимает руки, когда здоровья осталось меньше этого
-- (у педа по умолчанию 200). После этого он перестаёт стрелять и его можно
-- задержать. Пока он на ногах - только стрелять в ответ.
Config.SurrenderHealth = 120

-- На каком расстоянии работает [E].
Config.ArrestDistance = 2.5

-- Убитый гангстер не исчезает сразу. Пока тело лежит, мент успевает надеть
-- на него наручники и поднять дефибриллятором - и повести в участок уже
-- живым. Не успел за это время - тело убирается, слот уходит на респавн.
Config.DownSeconds = 180
Config.CuffItem = 'HANDCUFFS'
Config.DefibItem = 'DEFIBRILLATOR'

-- Сколько секунд слот пустует после смерти или задержания.
Config.RespawnDead = 300
Config.RespawnArrested = 420

-- Агрессия. false - гангстеры стоят и огрызаются только если тронешь.
Config.HostileToPlayers = true

-- Выплаты менту.
Config.Reward = {
    arrest = 2500,      -- за наручники на месте
    deliver = 4000,     -- сверху, если довёл до участка
}

-- Сколько метров от участка считается "довёл".
Config.StationRadius = 30.0

-- Участки, куда сдавать задержанных. Те же, что в ls_police.
Config.Stations = {
    { label = 'Mission Row',  x = 441.0,   y = -982.0, z = 30.7 },
    { label = 'Vespucci',     x = -1108.0, y = -845.0, z = 19.3 },
    { label = 'Sandy Shores', x = 1853.2,  y = 3689.6, z = 34.3 },
    { label = 'Paleto Bay',   x = -448.6,  y = 6012.7, z = 31.7 },
}

-- Чаще одного раза в столько мс один игрок не может дёргать сервер.
Config.Cooldown = 700

-- Банды. z - подсказка: клиент всё равно сажает педа на землю сам, потому
-- что точная высота зависит от рельефа и от того, что там настроено.
--
-- count - сколько гангстеров стоит на районе. Точки сервер расставляет сам
-- по спирали от центра, одинаково для всех - иначе клиенты видели бы разных
-- NPC и задержание было бы невозможно проверить.
Config.Gangs = {
    {
        key = 'ballas',
        label = 'Ballas',
        blip = 83,                      -- фиолетовый
        models = { 'g_m_y_ballasout_01', 'g_m_y_ballaeast_01', 'g_m_y_ballaorig_01' },
        weapons = { 'WEAPON_PISTOL', 'WEAPON_MICROSMG', 'WEAPON_SAWNOFFSHOTGUN' },
        accuracy = 30,
        armour = 20,
        count = 9,
        territory = { label = 'Дэвис', x = 88.0, y = -1961.0, z = 21.0, radius = 120.0 },
    },
    {
        key = 'families',
        label = 'Families',
        blip = 2,                       -- зелёный
        models = { 'g_m_y_famca_01', 'g_m_y_famdnf_01', 'g_m_y_famfor_01' },
        weapons = { 'WEAPON_PISTOL', 'WEAPON_MICROSMG', 'WEAPON_PUMPSHOTGUN' },
        accuracy = 30,
        armour = 20,
        count = 9,
        territory = { label = 'Чемберлен-Хиллз', x = -170.0, y = -1620.0, z = 33.0, radius = 110.0 },
    },
    {
        key = 'vagos',
        label = 'Vagos',
        blip = 5,                       -- жёлтый
        models = { 'g_m_y_mexgoon_01', 'g_m_y_mexgoon_02', 'g_m_y_mexgoon_03' },
        weapons = { 'WEAPON_PISTOL', 'WEAPON_MACHINEPISTOL', 'WEAPON_SAWNOFFSHOTGUN' },
        accuracy = 32,
        armour = 25,
        count = 9,
        territory = { label = 'Эль-Бурро-Хайтс', x = 1380.0, y = -1500.0, z = 58.0, radius = 120.0 },
    },
    {
        key = 'marabunta',
        label = 'Marabunta Grande',
        blip = 27,                      -- бирюзовый
        models = { 'g_m_y_salvaboss_01', 'g_m_y_salvagoon_01', 'g_m_y_salvagoon_02' },
        weapons = { 'WEAPON_PISTOL', 'WEAPON_MICROSMG', 'WEAPON_KNIFE' },
        accuracy = 30,
        armour = 20,
        count = 8,
        territory = { label = 'Сайпресс-Флэтс', x = 860.0, y = -1720.0, z = 30.0, radius = 110.0 },
    },
    {
        key = 'koreans',
        label = 'Корейцы',
        blip = 38,                      -- синий
        models = { 'g_m_m_korboss_01', 'g_m_y_korean_01', 'g_m_y_korlieut_01' },
        weapons = { 'WEAPON_PISTOL', 'WEAPON_ASSAULTSMG', 'WEAPON_KNIFE' },
        accuracy = 38,
        armour = 40,
        count = 8,
        territory = { label = 'Литл-Сеул', x = -680.0, y = -880.0, z = 24.0, radius = 100.0 },
    },
    {
        key = 'lost',
        label = 'The Lost MC',
        blip = 40,                      -- серый
        models = { 'g_m_y_lost_01', 'g_m_y_lost_02', 'g_m_y_lost_03' },
        weapons = { 'WEAPON_PISTOL', 'WEAPON_PUMPSHOTGUN', 'WEAPON_MACHETE' },
        accuracy = 34,
        armour = 35,
        count = 9,
        territory = { label = 'Стэб-Сити', x = 60.0, y = 3700.0, z = 40.0, radius = 130.0 },
    },
}

-- Метки районов на карте. Сами гангстеры на карте не светятся - их надо
-- искать глазами.
Config.ShowTerritoryBlips = true
