-- Одно меню на всё взаимодействие.
--
-- Раньше E ловили пять ресурсов сразу, каждый своим потоком: кто первым
-- увидел игрока, тот и съел нажатие. Стоя у двери офиса рядом с барыгой,
-- было невозможно предсказать, что откроется.
--
-- Теперь E ловит только этот ресурс. По нажатию он спрашивает у всех
-- остальных, что они могут предложить здесь и сейчас, показывает одним
-- списком и сообщает выбравшему владельцу.
--
-- Как подключиться со своей стороны:
--
--     AddEventHandler('ls_interact:collect', function()
--         TriggerEvent('ls_interact:offer', {
--             id = 'мой_ресурс:действие:42',   -- вернётся в :run
--             label = 'Что-то сделать',
--             order = 30,                      -- меньше = выше в списке
--         })
--     end)
--
-- Действий много - убери их в свой раздел, чтобы не топить корень:
--
--     TriggerEvent('ls_interact:offer', {
--         id = 'мой_ресурс:раздел', label = 'Работа', submenu = 'work', order = 4,
--     })
--     TriggerEvent('ls_interact:offer', {
--         id = 'мой_ресурс:обыскать', label = 'Обыскать', group = 'work',
--     })
--
-- Действие, доступное всегда и везде, помечай quiet = true - иначе плашка
-- "[E] Взаимодействие" будет висеть на экране постоянно:
--
--     TriggerEvent('ls_interact:offer', {
--         id = 'мой_ресурс:позвонить', label = 'Позвонить', quiet = true,
--     })
--
-- Esc внутри раздела возвращает в корень, а не закрывает меню.
--
--     AddEventHandler('ls_interact:run', function(id)
--         if id:sub(1, 11) ~= 'мой_ресурс:' then return end
--         ...
--     end)
--
-- TriggerEvent на клиенте синхронный, поэтому после опроса список уже
-- собран - ждать ничего не надо.

local offers = {}       -- всё, что предложили в этот заход
local shown = {}        -- то, что видно на текущей странице
local page = nil        -- nil - корень, иначе имя раздела
local pageTitle = nil
local open = false
local pick = 1
local scroll = 0
local available = 0     -- сколько действий рядом, для подсказки

-- IsControlJustReleased истинна ровно один кадр, поэтому опрашивать её
-- можно только каждый кадр. Раньше в закрытом состоянии цикл спал по 150 мс
-- - девять кадров при 60 fps, - и нажатие E терялось примерно в девяти
-- случаях из десяти. Выглядело это как "меню не открывается".
--
-- Читаем через IsDisabledControl*: обычная версия молчит про клавишу,
-- которую мы сами же заблокировали, а W/S внутри меню как раз блокируются,
-- чтобы игрок не уходил, листая список.
local function pressed(keys)
    if type(keys) == 'number' then return IsDisabledControlJustReleased(0, keys) end
    for _, key in ipairs(keys) do
        if IsDisabledControlJustReleased(0, key) then return true end
    end
    return false
end

local function disable(keys)
    if type(keys) == 'number' then DisableControlAction(0, keys, true) return end
    for _, key in ipairs(keys) do DisableControlAction(0, key, true) end
end

local function sortOffers(list)
    table.sort(list, function(a, b)
        local oa, ob = a.order or 50, b.order or 50
        if oa ~= ob then return oa < ob end
        return (a.label or '') < (b.label or '')
    end)
    return list
end

-- Корень показывает всё без раздела; раздел - только своё.
-- pageTitle при этом не трогаем: его ставит тот, кто открыл страницу.
local function build()
    shown = {}
    for _, offer in ipairs(offers) do
        if (offer.group or nil) == page then shown[#shown + 1] = offer end
    end
    sortOffers(shown)
    pick = 1
    scroll = 0
    return shown
end

local function collect()
    offers = {}
    TriggerEvent('ls_interact:collect')
    sortOffers(offers)
    page, pageTitle = nil, nil
    return build()
end

-- Всё, что хоть раз предлагали за сессию: id -> подпись.
--
-- Нужен меню биндов: оно показывает список действий, которые вообще бывают,
-- а не только те, что доступны прямо сейчас. Иначе назначить клавишу на
-- наручники можно было бы, только стоя над нарушителем.
local known = {}

-- Подписи часто содержат имя цели: "Наручники — Вася". Для каталога нужна
-- сама команда, без того, к кому её применили в последний раз.
local function plainLabel(label)
    return (label:gsub('%s+[—-]%s+.*$', ''))
end

AddEventHandler('ls_interact:offer', function(offer)
    if type(offer) ~= 'table' then return end
    if type(offer.id) ~= 'string' or type(offer.label) ~= 'string' then return end
    offers[#offers + 1] = offer
    if not offer.submenu then
        known[offer.id] = plainLabel(offer.label)
    end
end)

-- Каталог для меню биндов.
exports('knownActions', function()
    local rows = {}
    for id, label in pairs(known) do
        rows[#rows + 1] = { id = id, label = label }
    end
    table.sort(rows, function(a, b) return a.label < b.label end)
    return rows
end)

-- Выполнить действие по id, если оно доступно здесь и сейчас.
--
-- Опрашиваем заново, а не берём из последнего показа меню: между открытием
-- меню и нажатием клавиши игрок мог отойти, и тогда бинд сработал бы по
-- тому, чего рядом уже нет.
exports('runAction', function(id)
    if type(id) ~= 'string' then return false end

    offers = {}
    TriggerEvent('ls_interact:collect')
    for _, offer in ipairs(offers) do
        if offer.id == id and not offer.disabled then
            offers, shown = {}, {}
            TriggerEvent('ls_interact:run', id)
            return true
        end
    end

    offers, shown = {}, {}
    return false
end)

-- --- рисование ---------------------------------------------------------------

local function text(content, x, y, scale, centred, colour)
    SetTextFont(4)
    SetTextScale(scale, scale)
    if centred then SetTextCentre(true) end
    if colour then SetTextColour(colour[1], colour[2], colour[3], 255) end
    SetTextOutline()
    BeginTextCommandDisplayText('STRING')
    AddTextComponentSubstringPlayerName(content)
    EndTextCommandDisplayText(x, y)
end

local function draw()
    local total = #shown
    local rows = math.min(total, Config.Rows)
    local top = 0.32
    local lineHeight = 0.035

    DrawRect(0.5, top + rows * lineHeight / 2 - 0.012,
        0.32, rows * lineHeight + 0.085, 0, 0, 0, 190)

    text(pageTitle or InteractLocale.title, 0.5, top - 0.05, 0.42, true)

    for row = 1, rows do
        local index = row + scroll
        local offer = shown[index]
        if offer then
            local picked = index == pick
            local colour
            if offer.disabled then
                colour = picked and { 150, 120, 120 } or { 110, 110, 118 }
            elseif picked then
                colour = { 120, 190, 255 }
            end
            text((picked and '> ' or '   ') .. offer.label,
                0.5, top + (row - 1) * lineHeight, 0.35, true, colour)
        end
    end

    if total > rows then
        text(('%d / %d'):format(pick, total), 0.5, top + rows * lineHeight + 0.004, 0.28, true)
        text(page and InteractLocale.footerSub or InteractLocale.footer,
            0.5, top + rows * lineHeight + 0.028, 0.28, true)
    else
        text(page and InteractLocale.footerSub or InteractLocale.footer,
            0.5, top + rows * lineHeight + 0.008, 0.28, true)
    end
end

local function keepInView()
    if pick < scroll + 1 then scroll = pick - 1 end
    if pick > scroll + Config.Rows then scroll = pick - Config.Rows end
    if scroll < 0 then scroll = 0 end
end

-- --- меню --------------------------------------------------------------------

local function close()
    open = false
    offers = {}
    shown = {}
    page, pageTitle = nil, nil
end

local function openMenu()
    if #collect() == 0 then return end
    open = true
    pick = 1
    scroll = 0
end

-- Открыть меню готовым списком, минуя опрос.
--
-- Нужно там, где содержимое знает только сервер: склад оружейки, например,
-- приходит ответом, а не лежит под ногами. Пункты с disabled видно, но
-- выбрать нельзя - чтобы было понятно, что ствол есть, просто не по рангу.
AddEventHandler('ls_interact:show', function(data)
    if type(data) ~= 'table' or type(data.rows) ~= 'table' then return end

    offers = {}
    for _, row in ipairs(data.rows) do
        if type(row) == 'table' and type(row.id) == 'string' and type(row.label) == 'string' then
            offers[#offers + 1] = row
        end
    end
    if #offers == 0 then return end

    page, pageTitle = nil, data.title
    build()
    open = true
end)

CreateThread(function()
    while true do
        local wait = 0

        if open then
            -- Пока меню открыто, машина и оружие не слушаются: иначе выбор
            -- пункта заодно стреляет.
            DisableControlAction(0, 24, true)
            DisableControlAction(0, 25, true)
            DisableControlAction(0, 68, true)
            disable(Config.Key)

            -- Ходьба: иначе листание списка на W уводит персонажа от того,
            -- с чем он собрался взаимодействовать.
            for _, key in ipairs({ 30, 31, 32, 33, 34, 35 }) do
                DisableControlAction(0, key, true)
            end

            draw()

            if pressed(Config.Up) then
                pick = pick > 1 and pick - 1 or #shown
                keepInView()
            elseif pressed(Config.Down) then
                pick = pick < #shown and pick + 1 or 1
                keepInView()
            elseif pressed(Config.Enter) then
                local offer = shown[pick]
                if offer and offer.submenu then
                    -- Внутрь раздела, список уже собран - опрашивать заново
                    -- нечего.
                    page, pageTitle = offer.submenu, offer.label
                    build()
                elseif offer and not offer.disabled then
                    close()
                    TriggerEvent('ls_interact:run', offer.id)
                end
            elseif pressed(Config.Back) then
                -- Из раздела - назад в корень, а не сразу из меню.
                if page then
                    page, pageTitle = nil, nil
                    build()
                else
                    close()
                end
            end

            -- Меню не должно висеть, когда игрок умер или уехал.
            if IsEntityDead(PlayerPedId()) then close() end

        else
            -- Ни в коем случае не спим: см. комментарий к pressed().
            if not IsPauseMenuActive() and not IsEntityDead(PlayerPedId())
                and pressed(Config.Key) then
                openMenu()
            end
        end

        Wait(wait)
    end
end)

-- --- подсказка ---------------------------------------------------------------
-- Опрашивать всех каждый кадр дорого, а раз в полсекунды - незаметно.

-- Подсказку поднимают не все действия.
--
-- Есть те, что доступны всегда и везде: позвонить в службы, открыть раздел
-- работы у копа на смене. Они законно лежат в меню, но если считать и их,
-- плашка "[E] Взаимодействие" висит на экране непрерывно с первой секунды
-- и перестаёт что-либо значить. Такие помечаются quiet = true: в меню
-- видны, подсказку не поднимают.
local function loudCount()
    local n = 0
    for _, offer in ipairs(shown) do
        if not offer.quiet then n = n + 1 end
    end
    return n
end

CreateThread(function()
    while true do
        Wait(500)
        if Config.ShowHint and not open and not IsEntityDead(PlayerPedId()) then
            collect()
            available = loudCount()
            offers, shown = {}, {}
        else
            available = 0
        end
    end
end)

CreateThread(function()
    while true do
        Wait(open and 500 or 0)
        if available > 0 and not open then
            text(InteractLocale.hint, 0.5, 0.86, 0.36, true)
        end
    end
end)

-- Другие ресурсы спрашивают это, прежде чем открыть своё окно.
exports('isOpen', function()
    return open
end)
