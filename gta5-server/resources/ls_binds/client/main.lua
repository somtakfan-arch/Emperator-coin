-- Свои клавиши на любое действие.
--
-- Меню на F10 показывает каталог действий и позволяет повесить на каждое
-- свою клавишу. Нажатие такой клавиши равносильно выбору пункта в меню E:
-- ls_interact заново опрашивает всех и выполняет действие, если оно
-- доступно здесь и сейчас.
--
-- Биндами занимается отдельный ресурс, а не ls_interact: тот держит меню и
-- контракт для остальных, и подмешивать в него настройки клавиш значило бы
-- заставить весь сервер перезапускаться из-за правки интерфейса.
--
-- Клавиши читаются сырыми кодами (IsRawKeyJustPressed), а не через
-- RegisterKeyMapping: у второго клавиша задаётся в настройках GTA и меняется
-- только там, а нам нужно назначать её прямо в меню.

local KVP = 'ls_binds:v1'

local binds = {}        -- [id действия] = код клавиши
local uiOpen = false

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

-- --- хранение ------------------------------------------------------------------
-- Бинды - настройка игрока, а не состояние персонажа, поэтому лежат у него
-- на диске и не занимают место на сервере.

local function save()
    SetResourceKvp(KVP, json.encode(binds))
end

local function load()
    local raw = GetResourceKvpString(KVP)
    if not raw or raw == '' then return end
    local ok, data = pcall(json.decode, raw)
    if ok and type(data) == 'table' then binds = data end
end

-- --- каталог действий ------------------------------------------------------------

local function catalogue()
    local rows, seen = {}, {}

    for _, entry in ipairs(Config.Seed) do
        rows[#rows + 1] = { id = entry.id, label = entry.label, key = binds[entry.id] }
        seen[entry.id] = true
    end

    -- Всё, что встретилось по ходу игры и чего нет в заготовке.
    local ok, known = pcall(function() return exports.ls_interact:knownActions() end)
    if ok and type(known) == 'table' then
        for _, entry in ipairs(known) do
            if not seen[entry.id] then
                rows[#rows + 1] = { id = entry.id, label = entry.label, key = binds[entry.id] }
                seen[entry.id] = true
            end
        end
    end

    -- Назначенные - наверх: их правят чаще, чем ищут новые.
    table.sort(rows, function(a, b)
        if (a.key ~= nil) ~= (b.key ~= nil) then return a.key ~= nil end
        return a.label < b.label
    end)
    return rows
end

local function push()
    SendNUIMessage({
        action = 'binds',
        rows = catalogue(),
        forbidden = Config.Forbidden,
        max = Config.MaxBinds,
    })
end

-- --- меню --------------------------------------------------------------------

local function setUI(open)
    uiOpen = open
    SetNuiFocus(open, open)
    SendNUIMessage({ action = open and 'open' or 'close' })
    if open then push() end
end

-- Меню открывают два независимых пути: привязка FiveM и прямое чтение
-- клавиши. Без этой заслонки одно нажатие сработало бы дважды и закрыло
-- меню в том же кадре, в котором открыло.
local lastToggle = 0

local function toggle()
    local now = GetGameTimer()
    if now - lastToggle < Config.ToggleGuard then return end
    lastToggle = now
    setUI(not uiOpen)
end

RegisterCommand('binds', function()
    toggle()
end, false)

RegisterKeyMapping('binds', 'Меню биндов', 'keyboard', Config.OpenKey)

RegisterNUICallback('close', function(_, cb)
    setUI(false)
    cb('ok')
end)

RegisterNUICallback('bind', function(data, cb)
    data = data or {}
    local id = tostring(data.id or '')
    local key = tonumber(data.key)

    if id == '' then cb('ok') return end

    if key == nil then
        binds[id] = nil
    elseif Config.Forbidden[key] then
        notify(('~r~Клавиша %s занята игрой'):format(Config.Forbidden[key]))
        cb('ok')
        return
    else
        -- Одна клавиша - одно действие: иначе нажатие запускало бы два, и
        -- какое именно, зависело бы от порядка перебора таблицы.
        for other, bound in pairs(binds) do
            if bound == key and other ~= id then binds[other] = nil end
        end

        local count = 0
        for _ in pairs(binds) do count = count + 1 end
        if binds[id] == nil and count >= Config.MaxBinds then
            notify(('~r~Больше %d биндов не держим'):format(Config.MaxBinds))
            cb('ok')
            return
        end

        binds[id] = key
    end

    save()
    push()
    cb('ok')
end)

-- --- нажатия -------------------------------------------------------------------

local function busy()
    if uiOpen or IsPauseMenuActive() then return true end
    -- Чужое окно в фокусе - телефон, инвентарь, чат: клавиша сейчас
    -- набирает текст, а не командует персонажем.
    if IsNuiFocused() then return true end
    local ok, open = pcall(function() return exports.ls_interact:isOpen() end)
    if ok and open then return true end
    return IsEntityDead(PlayerPedId())
end

CreateThread(function()
    load()

    -- Чтение сырых кодов клавиш появилось в FiveM не сразу. Если сборка
    -- старая, натива нет, и цикл сыпал бы ошибкой каждый кадр. Проверяем
    -- один раз и честно говорим, что меню биндов тут не заработает.
    local ok = pcall(IsRawKeyJustPressed, 0x70)
    if not ok then
        print('[ls_binds] IsRawKeyJustPressed недоступен на этой сборке, бинды выключены')
        return
    end

    while true do
        Wait(0)

        -- Открытие меню читаем всегда, даже когда меню открыто: иначе
        -- закрыть его той же клавишей было бы нельзя.
        if not IsPauseMenuActive() and IsRawKeyJustPressed(Config.OpenRawKey) then
            if uiOpen or not IsNuiFocused() then toggle() end
        end

        if not busy() then
            for id, key in pairs(binds) do
                if IsRawKeyJustPressed(key) then
                    local ok, done = pcall(function()
                        return exports.ls_interact:runAction(id)
                    end)
                    if not ok or done ~= true then
                        notify('~y~Это сейчас недоступно')
                    end
                    break
                end
            end
        end
    end
end)
