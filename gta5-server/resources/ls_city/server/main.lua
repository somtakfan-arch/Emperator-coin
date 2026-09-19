-- Город: карантин, стройка и перекрытия дорог.
--
-- Всё, что меняет карту для всех сразу, живёт тут. Клиент такое решать не
-- может: карантин должен начаться у всех одновременно, а перекрытие обязано
-- стоять у того, кто про него не знал.

local RES = GetCurrentResourceName()
local DATA_FILE = 'city.json'

local quarantine = nil      -- { zone, ends, looted = { [index] = true } }
local builds = {}           -- [siteKey] = { stage, raised, donors = { {name, sum} } }
local closures = {}         -- [id] = { x, y, h, by, label, expires }
local nextClosure = 1
local lastCall = {}
local dirty = false

local function notify(src, text)
    TriggerClientEvent('ls_city:notify', src, text)
end

local function tellAll(text)
    TriggerClientEvent('ls_city:notify', -1, text)
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

local function nameOf(src)
    local ok, name = pcall(function() return exports.ls_character:getName(src) end)
    if ok and type(name) == 'string' and name ~= '' then return name end
    return GetPlayerName(src)
end

local function takeMoney(src, amount)
    local ok, done = pcall(function() return exports.phone_garage:removeMoney(src, amount) end)
    return ok and done == true
end

local function giveItem(src, item, count)
    local ok, done = pcall(function() return exports.ls_inventory:giveItem(src, item, count) end)
    return ok and done == true
end

local function canCarry(src, item, count)
    local ok, fits = pcall(function() return exports.ls_inventory:canCarry(src, item, count) end)
    return ok and fits == true
end

local function rankOf(src)
    local ok, rank = pcall(function() return exports.ls_police:getRank(src) end)
    return ok and (tonumber(rank) or 0) or 0
end

local function onDuty(src)
    local ok, duty = pcall(function() return exports.ls_police:isOnDuty(src) end)
    return ok and duty == true
end

-- --- хранение ----------------------------------------------------------------

local function save()
    SaveResourceFile(RES, DATA_FILE, json.encode({
        builds = builds, closures = closures, nextClosure = nextClosure,
    }), -1)
    dirty = false
end

local function load()
    local raw = LoadResourceFile(RES, DATA_FILE)
    if not raw or raw == '' then return end
    local ok, data = pcall(json.decode, raw)
    if not ok or type(data) ~= 'table' then
        print('[ls_city] city.json битый, начинаю с нуля')
        return
    end
    builds = data.builds or {}
    closures = data.closures or {}
    nextClosure = tonumber(data.nextClosure) or 1
end

-- --- состояние для клиента ---------------------------------------------------

local function buildView()
    local rows = {}
    for _, site in ipairs(Config.Build.sites) do
        local entry = builds[site.key] or { stage = 0, raised = 0, donors = {} }
        local stage = Config.Build.stages[entry.stage + 1]
        rows[#rows + 1] = {
            key = site.key, label = site.label,
            x = site.x, y = site.y, z = site.z,
            stage = entry.stage or 0,
            stageLabel = stage and stage.label or 'Достроено',
            need = stage and stage.cost or 0,
            raised = math.floor(entry.raised or 0),
            donors = entry.donors or {},
        }
    end
    return rows
end

local function closureView()
    local rows = {}
    for id, closure in pairs(closures) do
        rows[#rows + 1] = {
            id = id, x = closure.x, y = closure.y, h = closure.h,
            label = closure.label,
        }
    end
    return rows
end

local function view()
    return {
        quarantine = quarantine and {
            zone = quarantine.zone,
            ends = quarantine.ends,
            looted = quarantine.looted,
        } or nil,
        builds = buildView(),
        closures = closureView(),
        works = Config.Road.works,
    }
end

local function push(target)
    TriggerClientEvent('ls_city:state', target or -1, view())
end

RegisterNetEvent('ls_city:request', function()
    push(source)
end)

-- --- карантин ----------------------------------------------------------------

-- Какой район закрывается на этой неделе. Номер недели даёт один и тот же
-- ответ у всех и не сбрасывается рестартом.
local function zoneOfWeek()
    local week = tonumber(os.date('%Y')) * 53 + tonumber(os.date('%W'))
    local list = Config.Quarantine.zones
    return list[(week % #list) + 1]
end

local function startQuarantine(zone)
    zone = zone or zoneOfWeek()
    quarantine = {
        zone = zone,
        ends = os.time() + Config.Quarantine.minutes * 60,
        looted = {},
    }
    push()
    tellAll(CityLocale.quarantineOn:format(zone.label, Config.Quarantine.minutes))
    print(('[ls_city] карантин: %s на %d мин'):format(zone.label, Config.Quarantine.minutes))
end

local function endQuarantine()
    if not quarantine then return end
    local label = quarantine.zone.label
    quarantine = nil
    push()
    tellAll(CityLocale.quarantineOff:format(label))
end

CreateThread(function()
    local firedAt = nil
    while true do
        Wait(30000)

        if quarantine and quarantine.ends <= os.time() then
            endQuarantine()
        end

        if Config.Quarantine.enabled and not quarantine then
            local now = os.date('*t')
            local slot = ('%d-%d'):format(now.yday, now.hour)
            if now.wday == Config.Quarantine.weekday
                and now.hour == Config.Quarantine.hour
                and firedAt ~= slot then
                firedAt = slot
                startQuarantine()
            end
        end
    end
end)

RegisterNetEvent('ls_city:loot', function(index)
    local src = source
    if throttled(src) then return end
    if not quarantine then return end

    index = tonumber(index)
    if not index or quarantine.looted[tostring(index)] then return end

    -- Ящик стоит внутри зоны, а игрок должен стоять у ящика. Точные
    -- координаты ящика знает клиент, но зону проверяем сами.
    local coords = coordsOf(src)
    local zone = quarantine.zone
    if not coords or #(coords - vector3(zone.x, zone.y, coords.z)) > zone.r then
        return
    end

    quarantine.looted[tostring(index)] = true
    TriggerClientEvent('ls_city:looted', -1, index)

    local got = {}
    for _, row in ipairs(Config.Quarantine.loot) do
        if math.random(100) <= row.chance then
            local count = math.random(row.min, row.max)
            if canCarry(src, row.item, count) and giveItem(src, row.item, count) then
                got[#got + 1] = ('%s ×%d'):format(row.item, count)
            end
        end
    end

    if #got > 0 then
        notify(src, CityLocale.looted:format(#got))
    else
        notify(src, CityLocale.lootEmpty)
    end
end)

-- Розыска в карантине нет: об этом спрашивает ls_police.
exports('inQuarantine', function(src)
    if not quarantine or not Config.Quarantine.noWanted then return false end
    local coords = coordsOf(src)
    if not coords then return false end
    local zone = quarantine.zone
    return #(coords - vector3(zone.x, zone.y, coords.z)) <= zone.r
end)

-- --- стройка -----------------------------------------------------------------

RegisterNetEvent('ls_city:donate', function(key, amount)
    local src = source
    if throttled(src) then return end

    local site
    for _, entry in ipairs(Config.Build.sites) do
        if entry.key == key then site = entry break end
    end
    if not site then return end

    amount = math.floor(tonumber(amount) or 0)
    if amount < Config.Build.minDonation then
        notify(src, CityLocale.donateMin:format(money(Config.Build.minDonation)))
        return
    end

    local entry = builds[key] or { stage = 0, raised = 0, donors = {} }
    builds[key] = entry

    local stage = Config.Build.stages[(entry.stage or 0) + 1]
    if not stage then
        notify(src, CityLocale.buildDone)
        return
    end

    if not takeMoney(src, amount) then
        notify(src, CityLocale.noMoney)
        return
    end

    entry.raised = (entry.raised or 0) + amount

    -- Имя остаётся на табличке. Скинувшийся дважды не занимает две строки.
    local who = nameOf(src)
    local found = false
    for _, donor in ipairs(entry.donors) do
        if donor.name == who then
            donor.sum = donor.sum + amount
            found = true
            break
        end
    end
    if not found then
        entry.donors[#entry.donors + 1] = { name = who, sum = amount }
    end
    table.sort(entry.donors, function(a, b) return a.sum > b.sum end)

    notify(src, CityLocale.donated:format(money(amount), site.label))

    -- Этап закрыт - стройка растёт, и об этом узнают все.
    while stage and entry.raised >= stage.cost do
        entry.raised = entry.raised - stage.cost
        entry.stage = (entry.stage or 0) + 1
        tellAll(CityLocale.stageUp:format(site.label, stage.label))
        stage = Config.Build.stages[entry.stage + 1]
    end

    dirty = true
    save()
    push()
end)

-- --- перекрытия --------------------------------------------------------------

local function closureCount()
    local n = 0
    for _ in pairs(closures) do n = n + 1 end
    return n
end

RegisterNetEvent('ls_city:closeRoad', function()
    local src = source
    if throttled(src) then return end

    if not onDuty(src) or rankOf(src) < Config.Road.rank then
        notify(src, CityLocale.roadRank)
        return
    end

    if closureCount() >= Config.Road.maxClosures then
        notify(src, CityLocale.roadMany:format(Config.Road.maxClosures))
        return
    end

    local coords = coordsOf(src)
    if not coords then return end

    local id = tostring(nextClosure)
    nextClosure = nextClosure + 1
    closures[id] = {
        x = coords.x, y = coords.y,
        h = GetEntityHeading(GetPlayerPed(src)),
        by = nameOf(src),
        label = CityLocale.roadClosed,
        expires = os.time() + Config.Road.lifetime,
    }

    dirty = true
    save()
    push()
    notify(src, CityLocale.roadUp)
end)

RegisterNetEvent('ls_city:openRoad', function(id)
    local src = source
    if throttled(src) then return end
    if not onDuty(src) then return end

    id = tostring(id)
    local closure = closures[id]
    if not closure then return end

    local coords = coordsOf(src)
    if not coords or #(coords - vector3(closure.x, closure.y, coords.z)) > 25.0 then
        return
    end

    closures[id] = nil
    dirty = true
    save()
    push()
    notify(src, CityLocale.roadDown)
end)

CreateThread(function()
    while true do
        Wait(60000)
        local now = os.time()
        local changed = false
        for id, closure in pairs(closures) do
            if closure.expires and closure.expires <= now then
                closures[id] = nil
                changed = true
            end
        end
        if changed then
            dirty = true
            push()
        end
        if dirty then save() end
    end
end)

-- --- жизненный цикл ----------------------------------------------------------

AddEventHandler('onResourceStart', function(name)
    if name ~= RES then return end
    load()
    math.randomseed(os.time())
    print(('[ls_city] стройплощадок: %d, перекрытий: %d, карантин на неделе: %s')
        :format(#Config.Build.sites, closureCount(), zoneOfWeek().label))
end)

AddEventHandler('onResourceStop', function(name)
    if name == RES then save() end
end)

AddEventHandler('playerDropped', function()
    lastCall[source] = nil
    if dirty then save() end
end)

-- --- команды -----------------------------------------------------------------

RegisterCommand('quarantine', function(src, args)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'garage.admin') then return end

    if args[1] == 'off' then
        endQuarantine()
        return
    end

    local zone
    for _, entry in ipairs(Config.Quarantine.zones) do
        if entry.key == args[1] then zone = entry break end
    end
    startQuarantine(zone)
end, false)

RegisterCommand('builds', function(src)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'garage.admin') then return end
    for _, row in ipairs(buildView()) do
        print(('  %-10s этап %d — %s, собрано %d из %d, скинулось %d')
            :format(row.key, row.stage, row.stageLabel, row.raised, row.need, #row.donors))
    end
end, false)
