-- Заведения игроков.
--
-- Купил, открыл - метка появилась у всех на карте. Пока открыто, в кассу
-- капает выручка. Касса не бездонная и её можно обнести, поэтому держать
-- заведение открытым и не заходить за деньгами - плохая идея.

local RES = GetCurrentResourceName()
local DATA_FILE = 'business.json'

local owned = {}        -- [key] = { owner, ownerName, open, till, robbedUntil }
local lastCall = {}
local dirty = false

local function notify(src, text)
    TriggerClientEvent('ls_business:notify', src, text)
end

local function money(amount)
    local text = tostring(math.floor(amount))
    return (text:reverse():gsub('(%d%d%d)', '%1 '):reverse():gsub('^%s+', ''))
end

local function minutes(seconds)
    if seconds < 60 then return ('%d с'):format(seconds) end
    return ('%d мин'):format(math.ceil(seconds / 60))
end

local function identifierOf(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 8) == 'license:' then return id end
    end
    return 'name:' .. GetPlayerName(src)
end

local function nameOf(src)
    local ok, name = pcall(function() return exports.ls_character:getName(src) end)
    if ok and type(name) == 'string' and name ~= '' then return name end
    return GetPlayerName(src)
end

local function throttled(src)
    local now = GetGameTimer()
    if lastCall[src] and now - lastCall[src] < Config.Cooldown then return true end
    lastCall[src] = now
    return false
end

local function coordsOf(src)
    local ped = GetPlayerPed(src)
    if ped == 0 then return nil end
    return GetEntityCoords(ped)
end

local function spotByKey(key)
    for _, spot in ipairs(Config.Spots) do
        if spot.key == key then return spot end
    end
    return nil
end

local function near(src, spot, slack)
    local coords = coordsOf(src)
    if not coords then return false end
    return #(coords - vector3(spot.x, spot.y, spot.z)) <= (slack or Config.Interact + 4.0)
end

local function takeMoney(src, amount)
    local ok, done = pcall(function() return exports.phone_garage:removeMoney(src, amount) end)
    return ok and done == true
end

local function addMoney(src, amount)
    return pcall(function() return exports.phone_garage:addMoney(src, amount) end)
end

-- --- хранение ----------------------------------------------------------------

local function save()
    SaveResourceFile(RES, DATA_FILE, json.encode({ owned = owned }), -1)
    dirty = false
end

local function load()
    local raw = LoadResourceFile(RES, DATA_FILE)
    if not raw or raw == '' then return end
    local ok, data = pcall(json.decode, raw)
    if ok and type(data) == 'table' then
        owned = data.owned or {}
    else
        print('[ls_business] business.json битый, начинаю с нуля')
    end
end

local function record(key)
    owned[key] = owned[key] or { till = 0 }
    return owned[key]
end

local function heldBy(identifier)
    local n = 0
    for _, entry in pairs(owned) do
        if entry.owner == identifier then n = n + 1 end
    end
    return n
end

-- --- витрина -----------------------------------------------------------------

local function view(src)
    local identifier = src and identifierOf(src) or nil
    local rows = {}

    for _, spot in ipairs(Config.Spots) do
        local entry = owned[spot.key]
        local type_ = Config.Types[spot.type]
        local mine = entry and entry.owner == identifier or false

        rows[#rows + 1] = {
            key = spot.key, label = spot.label, kind = spot.type,
            typeLabel = type_ and type_.label or spot.type,
            blip = type_ and type_.blip or 1,
            colour = (entry and entry.open) and (type_ and type_.colour or 0)
                or Config.ClosedColour,
            price = spot.price,
            x = spot.x, y = spot.y, z = spot.z,
            owner = entry and entry.ownerName or nil,
            open = entry and entry.open == true or false,
            mine = mine,
            -- Сколько в кассе, видит только владелец.
            till = mine and math.floor(entry.till or 0) or nil,
        }
    end
    return rows
end

local function push(target)
    if target then
        TriggerClientEvent('ls_business:list', target, view(target))
        return
    end
    -- Касса у каждого своя, поэтому рассылаем персонально.
    for _, id in ipairs(GetPlayers()) do
        local player = tonumber(id)
        TriggerClientEvent('ls_business:list', player, view(player))
    end
end

RegisterNetEvent('ls_business:request', function()
    push(source)
end)

-- --- покупка и продажа -------------------------------------------------------

RegisterNetEvent('ls_business:buy', function(key)
    local src = source
    if throttled(src) then return end

    local spot = spotByKey(key)
    if not spot or not near(src, spot) then return end

    local entry = owned[key]
    if entry and entry.owner then
        notify(src, BizLocale.taken)
        return
    end

    local identifier = identifierOf(src)
    if heldBy(identifier) >= Config.MaxPerPlayer then
        notify(src, BizLocale.tooMany:format(Config.MaxPerPlayer))
        return
    end

    if not takeMoney(src, spot.price) then
        notify(src, BizLocale.noMoney:format(money(spot.price)))
        return
    end

    local rec = record(key)
    rec.owner = identifier
    rec.ownerName = nameOf(src)
    rec.open = false
    rec.till = 0

    dirty = true
    save()
    notify(src, BizLocale.bought:format(spot.label))
    push()
end)

RegisterNetEvent('ls_business:sell', function(key)
    local src = source
    if throttled(src) then return end

    local spot = spotByKey(key)
    local entry = owned[key]
    if not spot or not entry or entry.owner ~= identifierOf(src) then
        notify(src, BizLocale.notOwner)
        return
    end

    -- Половина цены плюс то, что лежало в кассе.
    local back = math.floor(spot.price / 2) + math.floor(entry.till or 0)
    owned[key] = nil
    dirty = true
    save()

    addMoney(src, back)
    notify(src, BizLocale.sold:format(spot.label, money(back)))
    push()
end)

-- --- открыть, закрыть, забрать -----------------------------------------------

RegisterNetEvent('ls_business:toggle', function(key)
    local src = source
    if throttled(src) then return end

    local spot = spotByKey(key)
    local entry = owned[key]
    if not spot or not entry or entry.owner ~= identifierOf(src) then
        notify(src, BizLocale.notOwner)
        return
    end
    if not near(src, spot) then return end

    entry.open = not entry.open
    dirty = true
    save()

    notify(src, (entry.open and BizLocale.opened or BizLocale.closed):format(spot.label))
    push()
end)

RegisterNetEvent('ls_business:collect', function(key)
    local src = source
    if throttled(src) then return end

    local spot = spotByKey(key)
    local entry = owned[key]
    if not spot or not entry or entry.owner ~= identifierOf(src) then
        notify(src, BizLocale.notOwner)
        return
    end
    if not near(src, spot) then return end

    local amount = math.floor(entry.till or 0)
    if amount <= 0 then
        notify(src, BizLocale.tillEmpty)
        return
    end

    entry.till = 0
    dirty = true
    save()

    addMoney(src, amount)
    notify(src, BizLocale.collected:format(money(amount)))
    push(src)
end)

-- --- ограбление --------------------------------------------------------------

RegisterNetEvent('ls_business:rob', function(key)
    local src = source
    if throttled(src) then return end
    if not Config.Robbery.enabled then return end

    local spot = spotByKey(key)
    local entry = owned[key]
    if not spot or not entry or not entry.owner then return end
    if not near(src, spot) then return end

    if not entry.open then
        notify(src, BizLocale.robClosed)
        return
    end

    local now = os.time()
    if entry.robbedUntil and entry.robbedUntil > now then
        notify(src, BizLocale.robCooling:format(minutes(entry.robbedUntil - now)))
        return
    end

    local till = math.floor(entry.till or 0)
    if till < Config.Robbery.minTill then
        notify(src, BizLocale.robEmpty)
        return
    end

    -- Розыск вешается сразу, а не после: полиция должна успеть приехать.
    pcall(function() return exports.ls_police:reportCrime(src, Config.Robbery.crime) end)

    local taken = math.floor(till * Config.Robbery.share / 100)
    entry.till = till - taken
    entry.robbedUntil = now + Config.Robbery.cooldown

    dirty = true
    save()
    addMoney(src, taken)
    notify(src, BizLocale.robbed:format(money(taken)))

    -- Владельцу и всем, кто на смене: это и есть горячая точка.
    for _, id in ipairs(GetPlayers()) do
        local player = tonumber(id)
        if player ~= src then
            local ok, duty = pcall(function() return exports.ls_police:isOnDuty(player) end)
            if (ok and duty == true) or identifierOf(player) == entry.owner then
                notify(player, BizLocale.robAlert:format(spot.label))
            end
        end
    end

    pcall(function()
        return exports.ls_world:hotspot('rob:' .. key, BizLocale.robAlert:format(spot.label),
            spot.x, spot.y, spot.z, 240)
    end)

    push()
end)

-- --- выручка -----------------------------------------------------------------

CreateThread(function()
    while true do
        Wait(Config.PayoutEvery * 1000)
        local changed = false

        for _, spot in ipairs(Config.Spots) do
            local entry = owned[spot.key]
            -- Закрытая лавка не зарабатывает: метка на карте и есть работа.
            if entry and entry.owner and entry.open then
                local type_ = Config.Types[spot.type]
                entry.till = (entry.till or 0) + (type_ and type_.income or 0)
                changed = true
            end
        end

        if changed then
            dirty = true
            push()
        end
    end
end)

-- --- жизненный цикл ----------------------------------------------------------

AddEventHandler('onResourceStart', function(name)
    if name ~= RES then return end
    load()
    local n = 0
    for _, entry in pairs(owned) do
        if entry.owner then n = n + 1 end
    end
    print(('[ls_business] точек: %d, занято: %d'):format(#Config.Spots, n))
end)

AddEventHandler('onResourceStop', function(name)
    if name == RES then save() end
end)

AddEventHandler('playerDropped', function()
    lastCall[source] = nil
    if dirty then save() end
end)

RegisterCommand('business', function(src)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'garage.admin') then return end
    for _, spot in ipairs(Config.Spots) do
        local entry = owned[spot.key]
        print(('  %-16s %-26s %s%s'):format(spot.key, spot.label,
            entry and entry.ownerName or 'свободно',
            entry and entry.open and ' (открыто)' or ''))
    end
end, false)
