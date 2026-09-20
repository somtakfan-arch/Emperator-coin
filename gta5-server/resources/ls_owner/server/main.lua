-- Владелец сервера: все права и не кончающиеся деньги.
--
-- Хранится лицензия Rockstar, а не серверный номер: номер у каждого захода
-- свой, а лицензия одна на всю жизнь аккаунта. Поэтому выданные один раз
-- права никуда не денутся после перезахода и перезапуска.

local RES = GetCurrentResourceName()
local DATA_FILE = 'owners.json'

local owners = {}       -- [license] = { name, since }
local dirty = false

local function licenseOf(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 8) == 'license:' then return id end
    end
    return nil
end

local function isOwner(src)
    local license = licenseOf(src)
    return license ~= nil and owners[license] ~= nil
end

local function notify(src, text)
    if src == 0 then
        print('[ls_owner] ' .. text:gsub('~%a~', ''))
    else
        TriggerClientEvent('chat:addMessage', src, { args = { '[Владелец]', text } })
    end
end

-- --- хранение ------------------------------------------------------------------

local function save()
    SaveResourceFile(RES, DATA_FILE, json.encode({ owners = owners }), -1)
    dirty = false
end

local function load()
    local raw = LoadResourceFile(RES, DATA_FILE)
    if not raw or raw == '' then return end
    local ok, data = pcall(json.decode, raw)
    if not ok or type(data) ~= 'table' then
        print('[ls_owner] owners.json битый, начинаю с нуля')
        return
    end
    owners = data.owners or {}
end

-- --- выдача прав ----------------------------------------------------------------

-- Права выдаются на лицензию, а не на сессию: add_ace переживает перезаход.
local function grantAces(license)
    for _, ace in ipairs(Config.Aces) do
        ExecuteCommand(('add_ace identifier.%s %s allow'):format(license, ace))
    end
end

local function grantPolice(src)
    -- Ранг ставим через штатную команду: она сама пишет в базу и
    -- пересобирает состояние игрока. Дублировать это здесь значило бы
    -- завести второй способ нанимать копов, который разойдётся с первым.
    ExecuteCommand(('police hire %d %d %s'):format(src, Config.PoliceRank, Config.Callsign))
end

local function topUp(src)
    local ok, money = pcall(function() return exports.phone_garage:getMoney(src) end)
    if not ok or type(money) ~= 'number' then return end
    if money >= Config.MoneyFloor then return end
    pcall(function()
        return exports.phone_garage:addMoney(src, Config.MoneyFloor - money)
    end)
end

-- Всё, что надо сделать владельцу при заходе. Отдельной функцией, потому
-- что то же самое происходит и в момент выдачи прав.
local function applyTo(src)
    local license = licenseOf(src)
    if not license then return end

    grantAces(license)
    grantPolice(src)
    topUp(src)
end

-- --- команда --------------------------------------------------------------------

RegisterCommand('owner', function(src, args)
    -- Из консоли можно всегда, из игры - только тому, кто уже владелец.
    -- Иначе первый же зашедший выдал бы права себе.
    if src ~= 0 and not isOwner(src) then
        notify(src, 'Эта команда не для тебя')
        return
    end

    local action = args[1]

    if action == 'list' then
        local n = 0
        for license, row in pairs(owners) do
            n = n + 1
            notify(src, ('%d. %s (%s)'):format(n, row.name or '?', license))
        end
        if n == 0 then notify(src, 'Владельцев нет') end
        return
    end

    if action == 'remove' then
        local target = tonumber(args[2])
        if not target or GetPlayerName(target) == nil then
            notify(src, 'Кого убирать? owner remove <номер игрока>')
            return
        end
        local license = licenseOf(target)
        if license and owners[license] then
            owners[license] = nil
            dirty = true
            save()
            notify(src, ('Права сняты: %s'):format(GetPlayerName(target)))
        end
        return
    end

    local target = tonumber(action)
    if not target or GetPlayerName(target) == nil then
        notify(src, 'owner <номер игрока> | owner remove <номер> | owner list')
        return
    end

    local license = licenseOf(target)
    if not license then
        notify(src, 'У этого игрока нет лицензии Rockstar - права выдать некуда')
        return
    end

    owners[license] = { name = GetPlayerName(target), since = os.time() }
    dirty = true
    save()

    applyTo(target)
    notify(src, ('Владелец: %s'):format(GetPlayerName(target)))
    notify(target, 'Тебе выданы все права. Кошелёк пополнен')
    print(('[ls_owner] владелец: %s (%s)'):format(GetPlayerName(target), license))
end, false)

-- --- жизненный цикл --------------------------------------------------------------

AddEventHandler('playerJoining', function()
    local src = source
    -- Ждём, пока поднимутся кошелёк и полиция: playerJoining прилетает
    -- раньше, чем игрок вообще что-либо загрузил.
    SetTimeout(15000, function()
        if GetPlayerName(src) and isOwner(src) then applyTo(src) end
    end)
end)

CreateThread(function()
    load()

    -- Права на лицензию выдаём сразу на старте ресурса: игрок мог быть уже
    -- на сервере, когда ресурс перезапустили.
    for license in pairs(owners) do
        grantAces(license)
    end

    while true do
        Wait(Config.TopUpEvery * 1000)
        for _, player in ipairs(GetPlayers()) do
            local src = tonumber(player)
            if isOwner(src) then topUp(src) end
        end
        if dirty then save() end
    end
end)

AddEventHandler('onResourceStop', function(name)
    if name == RES and dirty then save() end
end)

exports('isOwner', function(src) return isOwner(src) end)
