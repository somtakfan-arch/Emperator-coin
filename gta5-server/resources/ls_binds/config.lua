Config = {}

-- Клавиша меню.
--
-- OpenKey уходит в RegisterKeyMapping: она появляется в настройках GTA и
-- её можно переназначить. OpenRawKey - та же клавиша, читаемая напрямую.
--
-- Нужны обе. RegisterKeyMapping ставит клавишу по умолчанию только при
-- первой регистрации команды, и если у игрока F10 уже чем-то занята или
-- привязка не применилась, меню молча не открывается. Прямое чтение от
-- этого не зависит вообще.
Config.OpenKey = 'F10'
Config.OpenRawKey = 121     -- F10

-- Чтобы оба способа не сработали на одно нажатие и не открыли-закрыли
-- меню в один кадр.
Config.ToggleGuard = 300

-- Сколько биндов можно завести.
Config.MaxBinds = 16

-- Клавиши, которые нельзя занять: на них в игре и так висит важное.
-- Коды виртуальных клавиш Windows, те же, что приходят из браузера.
Config.Forbidden = {
    [27]  = 'Esc',
    [9]   = 'Tab',
    [13]  = 'Enter',
    [18]  = 'Alt',
    [91]  = 'Win',
    [121] = 'F10',      -- само меню
    [87]  = 'W',
    [65]  = 'A',
    [83]  = 'S',
    [68]  = 'D',
    [32]  = 'Пробел',
    [69]  = 'E',        -- меню взаимодействия
    [77]  = 'M',        -- карта
    [84]  = 'T',        -- чат
}

-- Заранее известные действия.
--
-- Каталог ls_interact наполняется по ходу игры: действие попадает туда,
-- когда его хоть раз предложили. До первого задержания наручников в списке
-- не будет, а назначить клавишу хочется заранее - поэтому самое ходовое
-- перечислено здесь и доступно с первой секунды.
Config.Seed = {
    { id = 'ls_police:w:cuffHard',   label = 'Наручники' },
    { id = 'ls_police:w:cuffSoft',   label = 'Стяжки' },
    { id = 'ls_police:w:uncuff',     label = 'Снять наручники' },
    { id = 'ls_police:w:escort',     label = 'Вести за собой' },
    { id = 'ls_police:w:carIn',      label = 'Посадить в машину' },
    { id = 'ls_police:w:carOut',     label = 'Вытащить из машины' },
    { id = 'ls_police:w:kneelDown',  label = 'На колени' },
    { id = 'ls_police:w:kneelUp',    label = 'Поднять с колен' },
    { id = 'ls_police:w:search',     label = 'Обыскать' },
    { id = 'ls_police:w:docs',       label = 'Проверить документы' },
    { id = 'ls_police:w:taser',      label = 'Тазер' },
    { id = 'ls_police:w:impound',    label = 'Изъять транспорт' },
    { id = 'ls_police:w:duty',       label = 'Снять со службы' },
    { id = 'ls_world:call',          label = 'Вызвать службы' },
    { id = 'ls_world:dig',           label = 'Копать' },
    { id = 'ls_jobs:leg',            label = 'Точка маршрута' },
    { id = 'ls_fuel:pump',           label = 'Заправить бак' },
    { id = 'ls_fuel:usecan',         label = 'Залить из канистры' },
    { id = 'ls_wild:sell',           label = 'Сдать промысел' },
    { id = 'ls_wild:skin',           label = 'Разделать тушу' },
    { id = 'ls_stash:place',         label = 'Заложить схрон' },
    { id = 'ls_shops:open',          label = 'Магазин' },
    { id = 'ls_tuning:open',         label = 'Тюнинг' },
}
