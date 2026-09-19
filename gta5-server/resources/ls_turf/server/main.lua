-- Районы, войны за них, доход и обломки после.
--
-- Владелец района - семья, не игрок: воюют группами. Война объявляется, о
-- ней знает весь сервер, и десять минут считаются убийства внутри зоны.
-- Ничего из этого клиент не решает: он только докладывает, кто кого убил,
-- а координаты сервер проверяет сам.

local RES = GetCurrentResourceName()
local DATA_FILE = 'turf.json'

local zones = {}        -- [key] = { owner, ownerName, since, debris, war }
local wars = {}         -- [key] = { attacker, attackerName, ends, score = {} }
local purse = {}        -- [familyId] = накопленный доход
local colours = {}      -- [familyId] = цвет на карте
local nextColour = 1
local lastCall = {}
local dirty = false

local function notify(src, text)
    TriggerClientEvent('ls_turf:notify', src, text)
end

local function tellAll(text)
    TriggerClientEvent('ls_turf:notify', -1, text)
end

local function money(amount)
    local text = tostring(math.floor(amount))
    return (text:reverse():gsub('(%d%d%d)', '%1 '):reverse():gsub('^%s+', ''))
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

local function zoneByKey(key)
    for _, zone in ipairs(Config.Zones) do
        if zone.key == key then return zone end
    end
    return nil
end

-- Район, внутри которого стоят эти координаты. Зоны не пересекаются, но
-- если вдруг - берём ближайший центр.
local function zoneAt(coords)
    local best, bestDist
    for _, zone in ipairs(Config.Zones) do
        local d = #(coords - vector3(zone.x, zone.y, coords.z))
        if d <= zone.r and (not bestDist or d < bestDist) then
            best, bestDist = zone, d
        end
    end
    return best
end

-- --- соседи ------------------------------------------------------------------

local function familyOf(src)
    local ok, family = pcall(function() return exports.ls_property:familyOf(src) end)
    if ok and type(family) == 'table' and family.id then return family end
    return nil
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
    SaveResourceFile(RES, DATA_FILE, json.encode({
        zones = zones, purse = purse, colours = colours, nextColour = nextColour,
    }), -1)
    dirty = false
end

local function load()
    local raw = LoadResourceFile(RES, DATA_FILE)
    if not raw or raw == '' then return end
    local ok, data = pcall(json.decode, raw)
    if not ok or type(data) ~= 'table' then
        print('[ls_turf] turf.json битый, начинаю с нуля')
        return
    end
    zones = data.zones or {}
    purse = data.purse or {}
    colours = data.colours or {}
    nextColour = tonumber(data.nextColour) or 1
end

local function record(key)
    zones[key] = zones[key] or {}
    return zones[key]
end

local function colourFor(familyId)
    if not familyId then return Config.NeutralColour end
    if not colours[familyId] then
        colours[familyId] = Config.Colours[((nextColour - 1) % #Config.Colours) + 1]
        nextColour = nextColour + 1
        dirty = true
    end
    return colours[familyId]
end

local function heldBy(familyId)
    local n = 0
    for _, entry in pairs(zones) do
        if entry.owner == familyId then n = n + 1 end
    end
    return n
end

-- --- состояние для клиента ---------------------------------------------------

local function view()
    local rows = {}
    for _, zone in ipairs(Config.Zones) do
        local entry = zones[zone.key] or {}
        local war = wars[zone.key]
        rows[#rows + 1] = {
            key = zone.key, label = zone.label,
            x = zone.x, y = zone.y, r = zone.r, income = zone.income,
            owner = entry.owner, ownerName = entry.ownerName,
            colour = colourFor(entry.owner),
            debris = entry.debris and true or false,
            war = war and {
                attacker = war.attackerName,
                ends = war.ends,
                score = war.score,
            } or nil,
        }
    end
    return rows
end

local function push(target)
    TriggerClientEvent('ls_turf:zones', target or -1, view())
end

RegisterNetEvent('ls_turf:request', function()
    push(source)
end)

-- --- война -------------------------------------------------------------------

local function activeWars()
    local n = 0
    for _ in pairs(wars) do n = n + 1 end
    return n
end

RegisterNetEvent('ls_turf:declare', function(key)
    local src = source
    if throttled(src) then return end

    local zone = zoneByKey(key)
    if not zone then return end

    local family = familyOf(src)
    if not family then
        notify(src, TurfLocale.needFamily)
        return
    end

    local entry = record(key)
    if entry.owner == family.id then
        notify(src, TurfLocale.alreadyYours)
        return
    end

    if wars[key] then
        notify(src, TurfLocale.warRunning)
        return
    end

    if activeWars() >= Config.War.maxActive then
        notify(src, TurfLocale.tooManyWars:format(Config.War.maxActive))
        return
    end

    if heldBy(family.id) >= Config.MaxPerFamily then
        notify(src, TurfLocale.tooManyZones:format(Config.MaxPerFamily))
        return
    end

    local now = os.time()
    if entry.warUntil and entry.warUntil > now then
        notify(src, TurfLocale.zoneCooling:format(math.ceil((entry.warUntil - now) / 60)))
        return
    end

    -- Объявлять надо стоя в районе: война за Палето из Веспуччи - это не
    -- война, а кнопка.
    local coords = coordsOf(src)
    if not coords or #(coords - vector3(zone.x, zone.y, coords.z)) > zone.r then
        notify(src, TurfLocale.notInside)
        return
    end

    if not takeMoney(src, Config.War.price) then
        notify(src, TurfLocale.warPrice:format(money(Config.War.price)))
        return
    end

    wars[key] = {
        attacker = family.id, attackerName = family.name,
        defender = entry.owner, defenderName = entry.ownerName,
        ends = now + Config.War.minutes * 60,
        score = {},
    }

    dirty = true
    push()
    tellAll(TurfLocale.warStarted:format(family.name,
        entry.ownerName or TurfLocale.nobody, zone.label, Config.War.minutes))
    print(('[ls_turf] война за «%s»: %s против %s')
        :format(zone.label, family.name, entry.ownerName or 'ничьей'))
end)

-- Убийство внутри зоны идёт в счёт. Докладывает убитый: он знает, кто его
-- положил, и его координаты сервер тут же проверяет сам.
RegisterNetEvent('ls_turf:killed', function(killerId)
    local src = source
    killerId = tonumber(killerId)
    if not killerId or killerId == src or GetPlayerName(killerId) == nil then return end

    local coords = coordsOf(src)
    if not coords then return end

    local zone = zoneAt(coords)
    if not zone then return end

    local war = wars[zone.key]
    if not war or war.ends <= os.time() then return end

    local family = familyOf(killerId)
    if not family then return end

    -- Очки идут только сторонам конфликта: третья семья счёт не портит.
    if family.id ~= war.attacker and family.id ~= war.defender then return end

    war.score[family.id] = (war.score[family.id] or 0) + 1
    push()
end)

local function scatterDebris(key)
    if not Config.Debris.enabled then return end
    local entry = record(key)
    entry.debris = os.time()
    dirty = true
end

local function endWar(key)
    local war = wars[key]
    if not war then return end
    wars[key] = nil

    local zone = zoneByKey(key)
    local entry = record(key)
    local attack = war.score[war.attacker] or 0
    local defend = war.defender and (war.score[war.defender] or 0) or 0

    entry.warUntil = os.time() + Config.War.cooldown

    -- Ничья остаётся за защитником, и слишком тихая война ничего не решает:
    -- три трупа - это не передел района.
    local taken = attack > defend and attack >= Config.War.minKills
    if Config.War.defenderWinsTie and attack == defend then taken = false end

    if taken then
        entry.owner = war.attacker
        entry.ownerName = war.attackerName
        entry.since = os.time()
        colourFor(war.attacker)
        tellAll(TurfLocale.warWon:format(war.attackerName, zone and zone.label or key,
            attack, defend))
    else
        tellAll(TurfLocale.warHeld:format(
            war.defenderName or TurfLocale.nobody, zone and zone.label or key,
            defend, attack))
    end

    scatterDebris(key)
    dirty = true
    save()
    push()
end

CreateThread(function()
    while true do
        Wait(5000)
        local now = os.time()
        for key, war in pairs(wars) do
            if war.ends <= now then endWar(key) end
        end
    end
end)

-- --- доход -------------------------------------------------------------------

CreateThread(function()
    while true do
        Wait(Config.PayoutEvery * 1000)
        local paid = false

        for _, zone in ipairs(Config.Zones) do
            local entry = zones[zone.key]
            if entry and entry.owner then
                local amount = zone.income
                -- Разрушенный район приносит меньше, пока его не отстроят.
                if entry.debris then
                    amount = math.floor(amount * Config.Debris.incomePenalty)
                end
                purse[entry.owner] = (purse[entry.owner] or 0) + amount
                paid = true
            end
        end

        if paid then dirty = true end
    end
end)

-- --- восстановление ----------------------------------------------------------

RegisterNetEvent('ls_turf:repair', function(key)
    local src = source
    if throttled(src) then return end

    local zone = zoneByKey(key)
    local entry = zones[key]
    if not zone or not entry or not entry.debris then return end

    local family = familyOf(src)
    if not family or entry.owner ~= family.id then
        notify(src, TurfLocale.notYours)
        return
    end

    local coords = coordsOf(src)
    if not coords or #(coords - vector3(zone.x, zone.y, coords.z)) > zone.r then
        notify(src, TurfLocale.notInside)
        return
    end

    if not takeMoney(src, Config.Debris.repairPrice) then
        notify(src, TurfLocale.repairPrice:format(money(Config.Debris.repairPrice)))
        return
    end

    entry.debris = nil
    dirty = true
    save()
    push()
    tellAll(TurfLocale.repaired:format(zone.label, family.name))
end)

-- --- касса -------------------------------------------------------------------

RegisterNetEvent('ls_turf:collect', function()
    local src = source
    if throttled(src) then return end

    local family = familyOf(src)
    if not family then
        notify(src, TurfLocale.needFamily)
        return
    end

    local amount = math.floor(purse[family.id] or 0)
    if amount <= 0 then
        notify(src, TurfLocale.nothingToTake)
        return
    end

    purse[family.id] = 0
    dirty = true
    save()
    addMoney(src, amount)
    notify(src, TurfLocale.collected:format(money(amount)))
end)

-- --- жизненный цикл ----------------------------------------------------------

AddEventHandler('onResourceStart', function(name)
    if name ~= RES then return end
    load()
    local held = 0
    for _, entry in pairs(zones) do
        if entry.owner then held = held + 1 end
    end
    print(('[ls_turf] районов: %d, занято: %d'):format(#Config.Zones, held))
end)

AddEventHandler('onResourceStop', function(name)
    if name == RES then save() end
end)

AddEventHandler('playerDropped', function()
    lastCall[source] = nil
    if dirty then save() end
end)

CreateThread(function()
    while true do
        Wait(60000)
        if dirty then save() end
    end
end)

-- --- экспорты и команды ------------------------------------------------------

exports('zoneAt', function(x, y, z)
    local zone = zoneAt(vector3(x, y, z or 0.0))
    if not zone then return nil end
    local entry = zones[zone.key] or {}
    return { key = zone.key, label = zone.label, owner = entry.owner }
end)

exports('purseOf', function(familyId)
    return math.floor(purse[familyId] or 0)
end)

RegisterCommand('turf', function(src)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'garage.admin') then return end
    for _, zone in ipairs(Config.Zones) do
        local entry = zones[zone.key] or {}
        print(('  %-14s %-22s %s%s'):format(zone.key, zone.label,
            entry.ownerName or 'ничей', entry.debris and ' (разрушен)' or ''))
    end
end, false)

RegisterCommand('turfreset', function(src, args)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'garage.admin') then return end
    local key = args[1]
    if key and zones[key] then
        zones[key] = {}
        wars[key] = nil
    else
        zones, wars = {}, {}
    end
    dirty = true
    save()
    push()
    print('[ls_turf] районы сброшены')
end, false)
