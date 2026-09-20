-- Живая карта: горячие точки, вызовы служб, граффити, лагеря, битые машины.
--
-- Всё это держится на сервере, потому что видеть должны все сразу, а
-- переживать рестарт обязаны граффити, лагеря и брошенные на дороге машины.

local RES = GetCurrentResourceName()
local DATA_FILE = 'world.json'

local hotspots = {}     -- [id] = { label, x, y, z, ends }
local calls = {}        -- [id] = { kind, label, x, y, z, ends, by }
local nextCall = 1
local tags = {}         -- [id] = { family, familyName, x, y, z, nx, ny, nz, decal, ends }
local nextTag = 1
local camps = {}        -- [id] = { owner, ownerName, x, y, z, h, ends }
local nextCamp = 1
local wrecks = {}       -- [id] = { model, x, y, z, h, ends }
local nextWreck = 1
local lastCall = {}
local lastReport = {}
local dirty = false
local treasureTakenOn = nil     -- '20260920', если сегодняшний клад уже нашли

local function notify(src, text)
    TriggerClientEvent('ls_world:notify', src, text)
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

local function nameOf(src)
    local ok, name = pcall(function() return exports.ls_character:getName(src) end)
    if ok and type(name) == 'string' and name ~= '' then return name end
    return GetPlayerName(src)
end

local function money(amount)
    local text = tostring(math.floor(amount))
    return (text:reverse():gsub('(%d%d%d)', '%1 '):reverse():gsub('^%s+', ''))
end

local function identifierOf(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 8) == 'license:' then return id end
    end
    return 'name:' .. GetPlayerName(src)
end

local function familyOf(src)
    local ok, family = pcall(function() return exports.ls_property:familyOf(src) end)
    if ok and type(family) == 'table' and family.id then return family end
    return nil
end

local function onDuty(src)
    local ok, duty = pcall(function() return exports.ls_police:isOnDuty(src) end)
    return ok and duty == true
end

local function takeItem(src, item, count)
    local ok, done = pcall(function() return exports.ls_inventory:takeItem(src, item, count) end)
    return ok and done == true
end

local function addMoney(src, amount)
    return pcall(function() return exports.phone_garage:addMoney(src, amount) end)
end

-- --- хранение ----------------------------------------------------------------
-- Горячие точки и вызовы не сохраняем: они живут минуты, и после рестарта
-- показывать вчерашнюю перестрелку незачем.

local function save()
    SaveResourceFile(RES, DATA_FILE, json.encode({
        tags = tags, nextTag = nextTag,
        camps = camps, nextCamp = nextCamp,
        wrecks = wrecks, nextWreck = nextWreck,
        treasureTakenOn = treasureTakenOn,
    }), -1)
    dirty = false
end

local function load()
    local raw = LoadResourceFile(RES, DATA_FILE)
    if not raw or raw == '' then return end
    local ok, data = pcall(json.decode, raw)
    if not ok or type(data) ~= 'table' then
        print('[ls_world] world.json битый, начинаю с нуля')
        return
    end
    tags = data.tags or {}
    nextTag = tonumber(data.nextTag) or 1
    camps = data.camps or {}
    nextCamp = tonumber(data.nextCamp) or 1
    wrecks = data.wrecks or {}
    nextWreck = tonumber(data.nextWreck) or 1
    treasureTakenOn = data.treasureTakenOn
end

-- --- рассылка ----------------------------------------------------------------

-- Вызовы видят только те, кто на смене, поэтому срез у каждого свой.
local function callsFor(src)
    local police = onDuty(src)
    local medic = police     -- медики пока те же полицейские: отдельной
                             -- фракции ЕМС нет, а вызов должен куда-то идти
    local rows = {}

    for id, call in pairs(calls) do
        local kind = Config.Calls.kinds[call.kind]
        if kind then
            local mine = call.by == identifierOf(src)
            local seen = mine
                or (kind.for_ == 'police' and police)
                or (kind.for_ == 'medic' and medic)
                or (kind.for_ == 'both' and (police or medic))
            if seen then
                rows[#rows + 1] = {
                    id = id, kind = call.kind, label = call.label,
                    x = call.x, y = call.y, z = call.z, ends = call.ends,
                    sprite = kind.sprite, colour = kind.colour,
                }
            end
        end
    end
    return rows
end

local function worldView()
    local hot = {}
    for id, spot in pairs(hotspots) do
        hot[#hot + 1] = { id = id, label = spot.label, x = spot.x, y = spot.y, z = spot.z }
    end

    local tagRows = {}
    for id, tag in pairs(tags) do
        tagRows[#tagRows + 1] = {
            id = id, x = tag.x, y = tag.y, z = tag.z,
            nx = tag.nx, ny = tag.ny, nz = tag.nz,
            decal = tag.decal, family = tag.familyName,
        }
    end

    local campRows = {}
    for id, camp in pairs(camps) do
        campRows[#campRows + 1] = {
            id = id, x = camp.x, y = camp.y, z = camp.z, h = camp.h,
            owner = camp.ownerName,
        }
    end

    local wreckRows = {}
    for id, wreck in pairs(wrecks) do
        wreckRows[#wreckRows + 1] = {
            id = id, model = wreck.model,
            x = wreck.x, y = wreck.y, z = wreck.z, h = wreck.h,
        }
    end

    return { hotspots = hot, tags = tagRows, camps = campRows, wrecks = wreckRows }
end

local function push(target)
    local world = worldView()
    if target then
        world.calls = callsFor(target)
        TriggerClientEvent('ls_world:state', target, world)
        return
    end
    for _, id in ipairs(GetPlayers()) do
        local player = tonumber(id)
        world.calls = callsFor(player)
        TriggerClientEvent('ls_world:state', player, world)
    end
end

RegisterNetEvent('ls_world:request', function()
    push(source)
end)

-- --- горячие точки -----------------------------------------------------------

-- Зовут другие ресурсы: началось ограбление, война за район, замес.
exports('hotspot', function(id, label, x, y, z, seconds)
    if type(id) ~= 'string' or type(label) ~= 'string' then return false end
    hotspots[id] = {
        label = label, x = x + 0.0, y = y + 0.0, z = (z or 0.0) + 0.0,
        ends = os.time() + (tonumber(seconds) or Config.Hotspot.seconds),
    }
    push()
    return true
end)

exports('clearHotspot', function(id)
    if hotspots[id] then
        hotspots[id] = nil
        push()
    end
    return true
end)

-- --- вызовы ------------------------------------------------------------------

local function addCall(kind, label, x, y, z, by)
    local def = Config.Calls.kinds[kind]
    if not def then return nil end

    local id = tostring(nextCall)
    nextCall = nextCall + 1
    calls[id] = {
        kind = kind, label = label or def.label,
        x = x + 0.0, y = y + 0.0, z = (z or 0.0) + 0.0,
        ends = os.time() + Config.Calls.seconds,
        by = by,
    }
    push()
    return id
end

exports('call', function(kind, label, x, y, z)
    return addCall(kind, label, x, y, z, nil)
end)

RegisterNetEvent('ls_world:report', function(kind, label)
    local src = source
    if not Config.Calls.kinds[kind] then return end

    -- Свой лимит: вызовы - не то, чем спамят.
    local now = os.time()
    if lastReport[src] and now - lastReport[src] < Config.Calls.perPlayer then return end
    lastReport[src] = now

    local coords = coordsOf(src)
    if not coords then return end

    addCall(kind, type(label) == 'string' and label:sub(1, 60) or nil,
        coords.x, coords.y, coords.z, identifierOf(src))
    notify(src, WorldLocale.called)
end)

RegisterNetEvent('ls_world:closeCall', function(id)
    local src = source
    if throttled(src) then return end
    if not onDuty(src) then return end

    id = tostring(id)
    if not calls[id] then return end
    calls[id] = nil
    push()
end)

-- --- граффити ----------------------------------------------------------------

local function tagsOf(familyId)
    local n = 0
    for _, tag in pairs(tags) do
        if tag.family == familyId then n = n + 1 end
    end
    return n
end

RegisterNetEvent('ls_world:spray', function(spot)
    local src = source
    if throttled(src) then return end
    if not Config.Graffiti.enabled or type(spot) ~= 'table' then return end

    local family = familyOf(src)
    if not family then
        notify(src, WorldLocale.needFamily)
        return
    end

    if tagsOf(family.id) >= Config.Graffiti.maxPerFamily then
        notify(src, WorldLocale.tagLimit:format(Config.Graffiti.maxPerFamily))
        return
    end

    local coords = coordsOf(src)
    local x, y, z = tonumber(spot.x), tonumber(spot.y), tonumber(spot.z)
    if not coords or not x or not y or not z then return end
    if #(coords - vector3(x, y, z)) > 6.0 then return end

    if not takeItem(src, Config.Graffiti.item, 1) then
        notify(src, WorldLocale.needSpray)
        return
    end

    local id = tostring(nextTag)
    nextTag = nextTag + 1
    -- Цвет тега берётся из id семьи: одна семья - один рисунок.
    local decals = Config.Graffiti.decals
    local pick = (tonumber(family.id) or #family.id) % #decals + 1

    tags[id] = {
        family = family.id, familyName = family.name,
        x = x, y = y, z = z,
        nx = tonumber(spot.nx) or 0.0,
        ny = tonumber(spot.ny) or 1.0,
        nz = tonumber(spot.nz) or 0.0,
        decal = decals[pick],
        ends = os.time() + Config.Graffiti.lifetime,
    }

    dirty = true
    save()
    push()
    notify(src, WorldLocale.sprayed:format(family.name))
end)

RegisterNetEvent('ls_world:clean', function(id)
    local src = source
    if throttled(src) then return end
    if not onDuty(src) then return end

    id = tostring(id)
    local tag = tags[id]
    if not tag then return end

    local coords = coordsOf(src)
    if not coords or #(coords - vector3(tag.x, tag.y, tag.z)) > 6.0 then return end

    if not takeItem(src, Config.Graffiti.item, 1) then
        notify(src, WorldLocale.needSpray)
        return
    end

    tags[id] = nil
    dirty = true
    save()
    push()
    notify(src, WorldLocale.cleaned)
end)

-- --- лагеря ------------------------------------------------------------------

local function campsOf(identifier)
    local n = 0
    for _, camp in pairs(camps) do
        if camp.owner == identifier then n = n + 1 end
    end
    return n
end

RegisterNetEvent('ls_world:camp', function()
    local src = source
    if throttled(src) then return end
    if not Config.Camp.enabled then return end

    local identifier = identifierOf(src)
    if campsOf(identifier) >= Config.Camp.maxPerPlayer then
        notify(src, WorldLocale.campLimit:format(Config.Camp.maxPerPlayer))
        return
    end

    local coords = coordsOf(src)
    if not coords then return end

    if not takeItem(src, Config.Camp.item, 1) then
        notify(src, WorldLocale.needKit)
        return
    end

    local id = tostring(nextCamp)
    nextCamp = nextCamp + 1
    camps[id] = {
        owner = identifier, ownerName = nameOf(src),
        x = coords.x, y = coords.y, z = coords.z,
        h = GetEntityHeading(GetPlayerPed(src)),
        ends = os.time() + Config.Camp.lifetime,
    }

    dirty = true
    save()
    push()
    notify(src, WorldLocale.campUp)
end)

RegisterNetEvent('ls_world:packCamp', function(id)
    local src = source
    if throttled(src) then return end

    id = tostring(id)
    local camp = camps[id]
    if not camp or camp.owner ~= identifierOf(src) then return end

    camps[id] = nil
    dirty = true
    save()
    push()
    notify(src, WorldLocale.campDown)
end)

-- --- битые машины ------------------------------------------------------------

RegisterNetEvent('ls_world:wreck', function(data)
    local src = source
    if not Config.Wreck.enabled or type(data) ~= 'table' then return end

    local x, y, z = tonumber(data.x), tonumber(data.y), tonumber(data.z)
    if not x or not y or not z then return end

    local coords = coordsOf(src)
    if not coords or #(coords - vector3(x, y, z)) > 60.0 then return end

    -- Одна и та же машина не должна попасть в список дважды.
    for _, wreck in pairs(wrecks) do
        if #(vector3(wreck.x, wreck.y, wreck.z) - vector3(x, y, z)) < 3.0 then return end
    end

    local id = tostring(nextWreck)
    nextWreck = nextWreck + 1
    wrecks[id] = {
        model = tonumber(data.model) or 0,
        x = x, y = y, z = z, h = tonumber(data.h) or 0.0,
        ends = os.time() + Config.Wreck.lifetime,
    }

    dirty = true
    push()

    if Config.Wreck.callServices then
        addCall('crash', nil, x, y, z, nil)
    end
end)

RegisterNetEvent('ls_world:tow', function(id)
    local src = source
    if throttled(src) then return end

    id = tostring(id)
    local wreck = wrecks[id]
    if not wreck then return end

    local coords = coordsOf(src)
    if not coords or #(coords - vector3(wreck.x, wreck.y, wreck.z)) > 15.0 then return end

    wrecks[id] = nil
    dirty = true
    save()
    push()

    addMoney(src, Config.Wreck.pay)
    notify(src, WorldLocale.towed:format(Config.Wreck.pay))
end)

-- --- уборка ------------------------------------------------------------------

CreateThread(function()
    while true do
        Wait(15000)
        local now = os.time()
        local changed = false

        for id, spot in pairs(hotspots) do
            if spot.ends <= now then hotspots[id] = nil changed = true end
        end
        for id, call in pairs(calls) do
            if call.ends <= now then calls[id] = nil changed = true end
        end
        for id, tag in pairs(tags) do
            if tag.ends and tag.ends <= now then tags[id] = nil changed = true dirty = true end
        end
        for id, camp in pairs(camps) do
            if camp.ends and camp.ends <= now then camps[id] = nil changed = true dirty = true end
        end
        for id, wreck in pairs(wrecks) do
            if wreck.ends and wreck.ends <= now then wrecks[id] = nil changed = true dirty = true end
        end

        if changed then push() end
        if dirty then save() end
    end
end)

AddEventHandler('onResourceStart', function(name)
    if name ~= RES then return end
    load()
    local t, c, w = 0, 0, 0
    for _ in pairs(tags) do t = t + 1 end
    for _ in pairs(camps) do c = c + 1 end
    for _ in pairs(wrecks) do w = w + 1 end
    print(('[ls_world] граффити: %d, лагерей: %d, битых машин: %d'):format(t, c, w))
end)

AddEventHandler('onResourceStop', function(name)
    if name == RES then save() end
end)

AddEventHandler('playerDropped', function()
    lastCall[source] = nil
    lastReport[source] = nil
    if dirty then save() end
end)

-- ---------------------------------------------------------------------------
-- Клад дня.
--
-- Точка выводится из даты, поэтому одинакова у всех и переживает рестарт:
-- хранить надо ровно один факт - выкопали сегодня или ещё нет.
-- ---------------------------------------------------------------------------

local function today()
    return os.date('%Y%m%d')
end

local function treasureToday()
    if not Config.Treasure.enabled then return nil end
    local seed = tonumber(today()) or 0
    return Config.Treasure.spots[(seed % #Config.Treasure.spots) + 1]
end

local function treasureTaken()
    return treasureTakenOn == today()
end

-- Центр круга намеренно смещён от настоящей точки, и считается он здесь:
-- клиенту точные координаты не уходят вообще. Иначе достаточно прочитать
-- свою же память, чтобы копать по наводке, и загадка теряет смысл.
local function hintCentre(spot)
    local angle = ((math.floor(spot.x) + math.floor(spot.y)) % 360) * math.pi / 180.0
    local shift = Config.Treasure.hint * 0.45
    return spot.x + math.cos(angle) * shift, spot.y + math.sin(angle) * shift
end

local function pushTreasure(target)
    local spot = treasureToday()
    if not spot or treasureTaken() then
        TriggerClientEvent('ls_world:treasure', target or -1, nil)
        return
    end
    local cx, cy = hintCentre(spot)
    TriggerClientEvent('ls_world:treasure', target or -1, {
        cx = cx, cy = cy, z = spot.z, hint = Config.Treasure.hint,
    })
end

RegisterNetEvent('ls_world:treasureRequest', function()
    pushTreasure(source)
end)

RegisterNetEvent('ls_world:dig', function()
    local src = source
    if throttled(src) then return end

    local spot = treasureToday()
    if not spot or treasureTaken() then
        notify(src, WorldLocale.treasureGone)
        return
    end

    local coords = coordsOf(src)
    if not coords then return end

    -- Копать можно где угодно внутри круга; попал или нет, решает сервер.
    -- Промах не наказывается, а подсказывает: так круг обходится ногами, а
    -- не чтением памяти.
    local dist = #(vector3(coords.x, coords.y, 0.0) - vector3(spot.x, spot.y, 0.0))
    if dist > Config.Treasure.radius then
        local hint = WorldLocale.treasureCold
        if dist < 25.0 then hint = WorldLocale.treasureHot
        elseif dist < 70.0 then hint = WorldLocale.treasureWarm end
        notify(src, hint)
        return
    end

    -- Отмечаем до выдачи: два игрока, докопавшихся в одну секунду, не должны
    -- получить по кладу каждый.
    treasureTakenOn = today()
    dirty = true

    local reward = math.random(Config.Treasure.reward.min, Config.Treasure.reward.max)
    addMoney(src, reward)
    notify(src, WorldLocale.treasureFound:format(money(reward)))
    TriggerClientEvent('ls_world:notify', -1,
        WorldLocale.treasureTaken:format(nameOf(src)))
    pushTreasure()
end)

-- Загадку вешает сам сервер: форум - часть игры, а не канцелярия, и клад
-- должен появляться там без человека, который его объявит.
local function postRiddle()
    local spot = treasureToday()
    if not spot then return end
    pcall(function()
        return exports.ls_forum:systemPost(Config.Treasure.board,
            'Клад дня',
            spot.riddle .. '\n\nКруг на карте показывает район. Точное место - копать.',
            'treasure')
    end)
end

CreateThread(function()
    -- Ждём, пока поднимется форум: ресурсы стартуют по очереди.
    Wait(15000)
    local postedFor = nil
    while true do
        if Config.Treasure.enabled and postedFor ~= today() then
            postedFor = today()
            -- Новые сутки - новый клад и новая загадка.
            if treasureTakenOn ~= postedFor then treasureTakenOn = nil end
            postRiddle()
            pushTreasure()
        end
        Wait(60000)
    end
end)

RegisterCommand('world', function(src)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'garage.admin') then return end
    local function count(t) local n = 0 for _ in pairs(t) do n = n + 1 end return n end
    print(('  горячих точек: %d'):format(count(hotspots)))
    print(('  вызовов: %d'):format(count(calls)))
    print(('  граффити: %d'):format(count(tags)))
    print(('  лагерей: %d'):format(count(camps)))
    print(('  битых машин: %d'):format(count(wrecks)))
end, false)
