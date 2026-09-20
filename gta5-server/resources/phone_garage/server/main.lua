-- Server side: owns the money and the garage. The client may ask for things,
-- it never decides them - every price and balance check happens here.

local RES = GetCurrentResourceName()
local PLAYERS_FILE = 'players.json'
local SPOTS_FILE = 'parking_spots.json'
local DETACHED_FILE = 'detached_cars.json'

local players = {}      -- [identifier] = { money = number, cars = { {model, label, plate, price} } }
local customSpots = {}  -- recorded with /parkhere
-- Машины, снятые с владельца на время торгов. Ничьи, но не потерянные:
-- переживают рестарт, иначе выставленный лот обнулил бы машину.
local detachedCars = {} -- [plate] = запись машины
local dirty = false

-- Catalog lookup so a client cannot invent a model or a price.
local catalogByModel = {}
for _, car in ipairs(Config.Catalog) do
    catalogByModel[car.model:lower()] = car
end

local function readJson(file, fallback)
    local raw = LoadResourceFile(RES, file)
    if not raw or raw == '' then return fallback end
    local ok, decoded = pcall(json.decode, raw)
    if not ok or type(decoded) ~= 'table' then
        print(('[phone_garage] %s is corrupt, starting from scratch'):format(file))
        return fallback
    end
    return decoded
end

local function save()
    SaveResourceFile(RES, PLAYERS_FILE, json.encode(players), -1)
    SaveResourceFile(RES, SPOTS_FILE, json.encode(customSpots), -1)
    SaveResourceFile(RES, DETACHED_FILE, json.encode(detachedCars), -1)
    dirty = false
end

local function identifierOf(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 8) == 'license:' then return id end
    end
    -- No Rockstar licence (rare, e.g. a local test build) - fall back to the name
    -- so at least the session keeps working.
    return 'name:' .. GetPlayerName(src)
end

local function recordOf(src)
    local id = identifierOf(src)
    if not players[id] then
        players[id] = { money = Config.StartingMoney, cars = {} }
        dirty = true
    end
    return players[id], id
end

-- Every plate in use, across every player. The СТС, the impound lot and the
-- police lookup all key off the plate, so two cars sharing one would quietly
-- break all three.
local function plateTaken(plate)
    for _, record in pairs(players) do
        for _, car in ipairs(record.cars or {}) do
            if car.plate == plate then return true end
        end
    end
    return false
end

local function randomPlate()
    local letters = Config.Plates.letters
    local pick = function()
        local index = math.random(#letters)
        return letters:sub(index, index)
    end

    return ('%s%03d%s%s%s'):format(
        pick(),
        math.random(0, 999),
        pick(), pick(),
        Config.Plates.regions[math.random(#Config.Plates.regions)])
end

local function makePlate()
    for _ = 1, 50 do
        local plate = randomPlate()
        if not plateTaken(plate) then return plate end
    end

    -- 12 letters x 1000 x 12 x 12 x regions is a big space; landing here means
    -- something is wrong, so fall back to something guaranteed unique.
    local fallback = ('X%03d%s'):format(math.random(0, 999), tostring(os.time()):sub(-4))
    print('[phone_garage] plate space exhausted, issued fallback ' .. fallback)
    return fallback
end

local function sync(src)
    local rec = recordOf(src)
    TriggerClientEvent('phone_garage:sync', src, {
        money = rec.money,
        cars = rec.cars,
        spots = customSpots,
    })
end

local function notify(src, text, kind)
    TriggerClientEvent('phone_garage:notify', src, text, kind or 'info')
end

-- --- lifecycle -------------------------------------------------------------

AddEventHandler('onResourceStart', function(name)
    if name ~= RES then return end
    math.randomseed(os.time())
    players = readJson(PLAYERS_FILE, {})
    customSpots = readJson(SPOTS_FILE, {})
    detachedCars = readJson(DETACHED_FILE, {})
    local profiles = 0
    for _ in pairs(players) do profiles = profiles + 1 end
    print(('[phone_garage] loaded %d profiles, %d custom parking spots'):format(profiles, #customSpots))
end)

AddEventHandler('onResourceStop', function(name)
    if name == RES then save() end
end)

AddEventHandler('playerDropped', function()
    if dirty then save() end
end)

CreateThread(function()
    while true do
        Wait(60000)
        if dirty then save() end
    end
end)

-- --- client requests -------------------------------------------------------

RegisterNetEvent('phone_garage:requestSync', function()
    sync(source)
end)

RegisterNetEvent('phone_garage:buy', function(model)
    local src = source
    if type(model) ~= 'string' then return end

    local car = catalogByModel[model:lower()]
    if not car then
        notify(src, 'Такой машины нет в салоне', 'error')
        return
    end

    local rec = recordOf(src)
    if rec.money < car.price then
        notify(src, 'Не хватает денег', 'error')
        return
    end

    -- Мест в гараже столько, сколько даёт недвижимость. Без ls_property
    -- ограничения нет: ресурс необязательный, и без него салон работает
    -- как раньше.
    local okSlots, slots = pcall(function() return exports.ls_property:garageSlots(src) end)
    if okSlots and type(slots) == 'number' and #rec.cars >= slots then
        notify(src, ('Мест в гараже: %d из %d. Нужен дом или офис')
            :format(#rec.cars, slots), 'error')
        return
    end

    rec.money = rec.money - car.price
    rec.cars[#rec.cars + 1] = {
        model = car.model,
        label = car.label,
        price = car.price,
        plate = makePlate(),
    }
    dirty = true
    save()
    sync(src)
    notify(src, ('Куплено: %s'):format(car.label), 'success')
end)

RegisterNetEvent('phone_garage:sell', function(plate)
    local src = source
    if type(plate) ~= 'string' then return end

    local rec = recordOf(src)
    for i, car in ipairs(rec.cars) do
        if car.plate == plate then
            local refund = math.floor((car.price or 0) * Config.SellRefund)
            table.remove(rec.cars, i)
            rec.money = rec.money + refund
            dirty = true
            save()
            sync(src)
            TriggerClientEvent('phone_garage:despawn', src, plate)
            notify(src, ('Продано: %s (+$%d)'):format(car.label, refund), 'success')
            return
        end
    end
    notify(src, 'Машина не найдена в гараже', 'error')
end)

-- A client asking to spawn still has to own the car, so it is checked here and
-- the go-ahead is sent back with the model the server knows about.
RegisterNetEvent('phone_garage:call', function(plate)
    local src = source
    if type(plate) ~= 'string' then return end

    local rec = recordOf(src)
    for _, car in ipairs(rec.cars) do
        if car.plate == plate then
            TriggerClientEvent('phone_garage:callApproved', src, car)
            return
        end
    end
    notify(src, 'Машина не найдена в гараже', 'error')
end)

RegisterNetEvent('phone_garage:addSpot', function(spot)
    local src = source
    if type(spot) ~= 'table' then return end
    if Config.RestrictParkHere and not IsPlayerAceAllowed(src, 'garage.admin') then
        notify(src, 'Нет прав на добавление парковки', 'error')
        return
    end

    local x, y, z, h = tonumber(spot.x), tonumber(spot.y), tonumber(spot.z), tonumber(spot.h)
    if not (x and y and z and h) then return end

    local label = type(spot.label) == 'string' and spot.label:sub(1, 40) or 'Своя парковка'
    customSpots[#customSpots + 1] = { x = x, y = y, z = z, h = h, label = label }
    dirty = true
    save()

    for _, id in ipairs(GetPlayers()) do
        sync(tonumber(id))
    end
    notify(src, ('Парковка записана: %s'):format(label), 'success')
end)

RegisterNetEvent('phone_garage:uiOk', function(where, count)
    print(('[phone_garage] интерфейс отрисован у %s (%s): строк %s')
        :format(GetPlayerName(source) or source, tostring(where), tostring(count)))
end)

RegisterNetEvent('phone_garage:uiError', function(where, message)
    print(('[phone_garage] ОШИБКА ИНТЕРФЕЙСА у %s (%s): %s')
        :format(GetPlayerName(source) or source, tostring(where), tostring(message)))
end)

-- --- exports ---------------------------------------------------------------
-- The wallet lives here, so other resources (ls_shops) go through these.

exports('getMoney', function(src)
    local rec = recordOf(src)
    return rec.money
end)

-- Каталог автосалона. Нужен физическому салону в мире: он выставляет в зале
-- машины отсюда, а покупка всё равно идёт через phone_garage:buy.
-- Отдаём копию: чужой ресурс не должен править наш конфиг на ходу.
exports('catalog', function()
    local rows = {}
    for _, car in ipairs(Config.Catalog) do
        rows[#rows + 1] = {
            model = car.model, label = car.label,
            class = car.class, price = car.price,
        }
    end
    return rows
end)

exports('addMoney', function(src, amount)
    amount = math.floor(tonumber(amount) or 0)
    if amount <= 0 then return false end
    local rec = recordOf(src)
    rec.money = rec.money + amount
    dirty = true
    save()
    sync(src)
    return true
end)

-- Returns false and changes nothing when the player cannot afford it.
exports('removeMoney', function(src, amount)
    amount = math.floor(tonumber(amount) or 0)
    if amount <= 0 then return false end
    local rec = recordOf(src)
    if rec.money < amount then return false end
    rec.money = rec.money - amount
    dirty = true
    save()
    sync(src)
    return true
end)

exports('getCars', function(src)
    local rec = recordOf(src)
    return rec.cars
end)

-- Handing over a vehicle registration hands over the car with it.
exports('transferCar', function(fromSrc, toSrc, plate)
    local from = recordOf(fromSrc)
    local to = recordOf(toSrc)

    for index, car in ipairs(from.cars) do
        if car.plate == plate then
            table.remove(from.cars, index)
            to.cars[#to.cars + 1] = car
            dirty = true
            save()
            sync(fromSrc)
            sync(toSrc)
            TriggerClientEvent('phone_garage:despawn', fromSrc, plate)
            return true
        end
    end
    return false
end)

-- --- commands --------------------------------------------------------------

RegisterCommand('money', function(src)
    if src == 0 then return end
    local rec = recordOf(src)
    notify(src, ('Баланс: $%d'):format(rec.money), 'info')
end, false)

RegisterCommand('givemoney', function(src, args)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'garage.admin') then
        notify(src, 'Нет прав', 'error')
        return
    end

    local target = tonumber(args[1])
    local amount = tonumber(args[2])
    if not target or not amount then
        print('usage: givemoney <player id> <amount>')
        return
    end
    if GetPlayerName(target) == nil then
        print('[phone_garage] no such player: ' .. tostring(target))
        return
    end

    local rec = recordOf(target)
    rec.money = rec.money + math.floor(amount)
    dirty = true
    save()
    sync(target)
    notify(target, ('Начислено $%d'):format(math.floor(amount)), 'success')
end, false)

-- --- аукцион -----------------------------------------------------------------
-- Пока машина на торгах, она не должна числиться ни за кем: иначе её можно
-- продать второй раз или вызвать из гаража прямо с аукциона.

exports('detachCar', function(src, plate)
    if type(plate) ~= 'string' then return nil end
    local rec = recordOf(src)

    for i, car in ipairs(rec.cars) do
        if car.plate == plate then
            local taken = table.remove(rec.cars, i)
            detachedCars[plate] = taken
            dirty = true
            save()
            sync(src)
            return taken
        end
    end
    return nil
end)

-- Машина возвращается владельцу или уходит победителю торгов. Номер и
-- тюнинг сохраняются: ls_tuning привязан именно к номеру.
exports('restoreCar', function(src, plate)
    if type(plate) ~= 'string' then return false end

    local car = detachedCars[plate]
    if not car then return false end
    detachedCars[plate] = nil

    local rec = recordOf(src)
    rec.cars[#rec.cars + 1] = car
    dirty = true
    save()
    sync(src)
    return true
end)
