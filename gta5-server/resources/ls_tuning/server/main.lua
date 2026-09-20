-- Server side: owns the prices, the wallet and the saved build.
-- The client previews; it never decides what a change costs or whether it
-- happened. Nothing here checks a level, because nothing is locked.

local RES = GetCurrentResourceName()
local DATA_FILE = 'tuning.json'

local builds = {}   -- [plate] = { mods = {}, wheels = {}, colours = {}, ... }
local dirty = false

local categoryById = {}
for _, category in ipairs(Config.Categories) do
    categoryById[category.id] = category
end

local function notify(src, text)
    TriggerClientEvent('ls_tuning:notify', src, text)
end

local function readJson(file, fallback)
    local raw = LoadResourceFile(RES, file)
    if not raw or raw == '' then return fallback end
    local ok, decoded = pcall(json.decode, raw)
    if not ok or type(decoded) ~= 'table' then
        print(('[ls_tuning] %s is corrupt, starting from scratch'):format(file))
        return fallback
    end
    return decoded
end

local function save()
    SaveResourceFile(RES, DATA_FILE, json.encode(builds), -1)
    dirty = false
end

local function ownsPlate(src, plate)
    if not Config.OnlyOwnedCars then return true end

    local ok, cars = pcall(function() return exports.phone_garage:getCars(src) end)
    if not ok or type(cars) ~= 'table' then return false end

    for _, car in ipairs(cars) do
        if car.plate == plate then return true end
    end
    return false
end

-- What one selection costs. Performance parts scale with the step chosen, but
-- every step is on the shelf from the start - the step sets the price, not a
-- requirement.
local function priceOf(category, value)
    local base = tonumber(category.price) or 0

    if category.perf then
        local step = math.max(0, math.floor(tonumber(value) or 0))
        return math.floor(base * (1 + step * Config.PerfStepMultiplier))
    end
    return base
end

-- --- lifecycle --------------------------------------------------------------

AddEventHandler('onResourceStart', function(name)
    if name ~= RES then return end
    builds = readJson(DATA_FILE, {})
    local n = 0
    for _ in pairs(builds) do n = n + 1 end
    print(('[ls_tuning] loaded %d builds'):format(n))
end)

-- Выход игрока - момент, когда его данные обязаны оказаться на диске.
-- Одного таймера на минуту мало: купил что-то, вышел через полминуты, и
-- покупки нет. Рестарт сервера теряет ровно так же.
AddEventHandler('playerDropped', function()
    if dirty then save() end
end)

AddEventHandler('onResourceStop', function(name)
    if name == RES then save() end
end)

CreateThread(function()
    while true do
        Wait(60000)
        if dirty then save() end
    end
end)

-- --- reading ----------------------------------------------------------------

RegisterNetEvent('ls_tuning:request', function(plate)
    local src = source
    if type(plate) ~= 'string' then return end
    TriggerClientEvent('ls_tuning:build', src, plate, builds[plate])
end)

-- --- applying ---------------------------------------------------------------

-- `changes` is a map of category id -> chosen value. The server prices it from
-- its own config, charges once, then stores the whole build.
RegisterNetEvent('ls_tuning:apply', function(plate, changes)
    local src = source

    if type(plate) ~= 'string' or type(changes) ~= 'table' then return end
    if not ownsPlate(src, plate) then
        notify(src, TuneLocale.notYours)
        TriggerClientEvent('ls_tuning:rejected', src)
        return
    end

    local total = 0
    local clean = {}

    for id, value in pairs(changes) do
        local category = categoryById[id]
        if category then
            -- Values are clamped here so a patched menu cannot ask for mod 9999.
            local stored = value
            if category.kind == 'toggle' then
                stored = value == true
            elseif category.kind == 'colour' or category.kind == 'neoncol' then
                stored = math.max(0, math.min(math.floor(tonumber(value) or 0), Config.MaxColour))
            elseif category.kind == 'tint' then
                stored = math.max(0, math.min(math.floor(tonumber(value) or 0), Config.MaxTint))
            elseif category.kind == 'neon' then
                stored = value == true
            elseif category.kind == 'smoke' then
                stored = math.max(0, math.min(math.floor(tonumber(value) or 0), Config.MaxColour))
            elseif category.kind == 'wheels' then
                stored = {
                    type = math.max(0, math.min(math.floor(tonumber(value.type) or 0), 11)),
                    index = math.max(-1, math.floor(tonumber(value.index) or -1)),
                }
            else
                stored = math.max(-1, math.floor(tonumber(value) or -1))
            end

            clean[id] = stored

            -- Stock (-1 / off) costs nothing: taking a part back off is free.
            local isStock = (stored == -1) or (stored == false)
            if not isStock then
                total = total + priceOf(category, type(stored) == 'number' and stored or 0)
            end
        end
    end

    if total > 0 then
        local ok, paid = pcall(function()
            return exports.phone_garage:removeMoney(src, total)
        end)
        if not ok or paid ~= true then
            notify(src, TuneLocale.noMoney:format(total))
            TriggerClientEvent('ls_tuning:rejected', src)
            return
        end
    end

    local build = builds[plate] or {}
    for id, value in pairs(clean) do
        build[id] = value
    end
    builds[plate] = build
    dirty = true
    save()

    TriggerClientEvent('ls_tuning:applied', src, plate, build, total)
    notify(src, total > 0 and TuneLocale.paid:format(total) or TuneLocale.noChanges)
end)

-- --- exports ----------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Как быстро едет какая машина.
--
-- Таблица модель -> цель строится из каталога автосалона: дорогая машина
-- едет быстро не потому, что её имя вписали в список, а потому что она
-- дорогая. Правят ценник - едет по-новому, без правки этого файла.
-- ---------------------------------------------------------------------------

local driveTable = nil

local function tierFor(price)
    for _, tier in ipairs(Config.Drive.tiers) do
        if price >= tier.from then return tier end
    end
    return Config.Drive.tiers[#Config.Drive.tiers]
end

local function buildDriveTable()
    local rows = {}

    local ok, catalog = pcall(function() return exports.phone_garage:catalog() end)
    if not ok or type(catalog) ~= 'table' then
        print('[ls_tuning] каталог автосалона недоступен, скорости будут по умолчанию')
        return rows
    end

    for _, car in ipairs(catalog) do
        local tier = tierFor(tonumber(car.price) or 0)
        rows[car.model] = {
            kmh = math.min(tier.kmh, Config.Drive.maxKmh),
            power = tier.power,
            torque = tier.torque,
            grip = tier.grip,
        }
    end
    return rows
end

RegisterNetEvent('ls_tuning:driveRequest', function()
    -- Считаем один раз: каталог за время работы сервера не меняется.
    if not driveTable then driveTable = buildDriveTable() end
    TriggerClientEvent('ls_tuning:driveTable', source, driveTable)
end)

exports('getBuild', function(plate)
    return builds[plate]
end)

-- A car that changes hands keeps what was bolted to it.
exports('transferBuild', function(fromPlate, toPlate)
    if builds[fromPlate] and fromPlate ~= toPlate then
        builds[toPlate] = builds[fromPlate]
        builds[fromPlate] = nil
        dirty = true
        save()
        return true
    end
    return false
end)

exports('clearBuild', function(plate)
    if builds[plate] then
        builds[plate] = nil
        dirty = true
        save()
        return true
    end
    return false
end)
