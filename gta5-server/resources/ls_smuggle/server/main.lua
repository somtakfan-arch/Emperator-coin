-- Контрабанда морем и воздухом.
--
-- Заказ живёт у игрока, а не у сервера целиком: точка забора и скупщик
-- выбираются при взятии заказа и больше не меняются. Скупщик дня один на
-- всех и выводится из даты - так на карте есть место, куда все везут, а
-- значит, и где друг друга встречают.

local runs = {}         -- [src] = { kind, pickup, buyer, units, loaded }
local lastCall = {}

local function notify(src, text)
    TriggerClientEvent('ls_smuggle:notify', src, text)
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

local function giveItem(src, item, count)
    local ok, done = pcall(function() return exports.ls_inventory:giveItem(src, item, count) end)
    return ok and done == true
end

local function takeItem(src, item, count)
    local ok, done = pcall(function() return exports.ls_inventory:takeItem(src, item, count) end)
    return ok and done == true
end

local function canCarry(src, item, count)
    local ok, fits = pcall(function() return exports.ls_inventory:canCarry(src, item, count) end)
    return ok and fits == true
end

local function countItem(src, item)
    local ok, inv = pcall(function() return exports.ls_inventory:getInventory(src) end)
    if not ok or type(inv) ~= 'table' then return 0 end
    local total = 0
    for _, entry in ipairs(inv.slots or {}) do
        if entry.item == item then total = total + (tonumber(entry.count) or 0) end
    end
    return total
end

local function addMoney(src, amount)
    return pcall(function() return exports.phone_garage:addMoney(src, amount) end)
end

-- --- скупщик дня ---------------------------------------------------------------

-- Дата как сид: у всех клиентов и после рестарта - один и тот же скупщик,
-- и ничего не надо хранить на диске.
local function buyerToday()
    local seed = tonumber(os.date('%Y%m%d')) or 0
    return Config.Buyers[(seed % #Config.Buyers) + 1]
end

exports('buyerToday', buyerToday)

RegisterNetEvent('ls_smuggle:request', function()
    local src = source
    TriggerClientEvent('ls_smuggle:buyer', src, buyerToday())
    TriggerClientEvent('ls_smuggle:run', src, runs[src])
end)

-- --- заказ ---------------------------------------------------------------------

RegisterNetEvent('ls_smuggle:order', function(kind)
    local src = source
    if throttled(src) then return end

    local run = Config.Runs[kind]
    if not run then return end

    if runs[src] then
        notify(src, SmugLocale.busy)
        return
    end

    local coords = coordsOf(src)
    local point = run.dispatch
    if not coords or #(coords - vector3(point.x, point.y, point.z)) > Config.Interact + 4.0 then
        notify(src, SmugLocale.tooFar)
        return
    end

    runs[src] = {
        kind = kind,
        pickup = run.pickups[math.random(#run.pickups)],
        buyer = buyerToday(),
        units = math.random(Config.Units[1], Config.Units[2]),
        loaded = false,
    }

    notify(src, SmugLocale.taken:format(run.label))
    TriggerClientEvent('ls_smuggle:run', src, runs[src])
end)

RegisterNetEvent('ls_smuggle:cancel', function()
    local src = source
    if not runs[src] then return end
    runs[src] = nil
    notify(src, SmugLocale.dropped)
    TriggerClientEvent('ls_smuggle:run', src, nil)
end)

-- --- забор груза ---------------------------------------------------------------

RegisterNetEvent('ls_smuggle:load', function()
    local src = source
    if throttled(src) then return end

    local run = runs[src]
    if not run then notify(src, SmugLocale.noRun) return end
    if run.loaded then return end

    local coords = coordsOf(src)
    if not coords then return end
    -- По горизонтали: над точкой в море можно висеть на высоте, и мерить
    -- расстояние вместе с Z значило бы требовать сесть на волну ровно в круг.
    local flat = #(vector3(coords.x, coords.y, 0.0)
        - vector3(run.pickup.x, run.pickup.y, 0.0))
    if flat > Config.PickRadius then
        notify(src, SmugLocale.tooFar)
        return
    end

    if not canCarry(src, Config.Item, run.units) then
        notify(src, SmugLocale.noRoom)
        return
    end

    if not giveItem(src, Config.Item, run.units) then
        notify(src, SmugLocale.noRoom)
        return
    end

    run.loaded = true
    notify(src, SmugLocale.loaded:format(run.units))
    TriggerClientEvent('ls_smuggle:run', src, run)
end)

-- --- сдача ---------------------------------------------------------------------

RegisterNetEvent('ls_smuggle:sell', function()
    local src = source
    if throttled(src) then return end

    local buyer = buyerToday()
    local coords = coordsOf(src)
    if not coords or #(coords - vector3(buyer.x, buyer.y, buyer.z)) > Config.Interact + 4.0 then
        notify(src, SmugLocale.tooFar)
        return
    end

    -- Сдать можно всё, что есть на руках, а не только свой заказ: груз,
    -- снятый с чужой лодки, тоже груз. В этом и смысл контрабанды.
    local units = countItem(src, Config.Item)
    if units <= 0 then
        notify(src, SmugLocale.nothing)
        return
    end

    if not takeItem(src, Config.Item, units) then
        notify(src, SmugLocale.nothing)
        return
    end

    local total = units * Config.PricePerUnit
    addMoney(src, total)
    notify(src, SmugLocale.sold:format(units, money(total)))

    if runs[src] then
        runs[src] = nil
        TriggerClientEvent('ls_smuggle:run', src, nil)
    end

    if math.random(100) <= Config.HeatChance then
        notify(src, SmugLocale.heat)
        pcall(function() return exports.ls_police:reportCrime(src, Config.Crime) end)
    end
end)

AddEventHandler('playerDropped', function()
    local src = source
    runs[src] = nil
    lastCall[src] = nil
end)
