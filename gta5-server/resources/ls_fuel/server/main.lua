-- Топливо на стороне сервера.
--
-- Клиент решает, сколько литров ему надо, но деньги списывает и разрешение
-- даёт сервер: иначе бак наливался бы бесплатно одним событием.
--
-- Самого уровня топлива сервер не хранит: он живёт в state bag машины и
-- едет вместе с ней. Здесь только касса.

local lastCall = {}

local function notify(src, text)
    TriggerClientEvent('ls_fuel:notify', src, text)
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

-- Стоять надо у колонки. Радиус чуть шире клиентского: игрок мог отойти на
-- шаг, пока листал меню, и отказ в такой момент выглядит как поломка.
local function atStation(src)
    local coords = coordsOf(src)
    if not coords then return false end
    for _, station in ipairs(Config.Stations) do
        if #(coords - vector3(station.x, station.y, station.z)) <= Config.Interact + 3.0 then
            return true
        end
    end
    return false
end

local function takeMoney(src, amount)
    local ok, done = pcall(function() return exports.phone_garage:removeMoney(src, amount) end)
    return ok and done == true
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

-- --- заправка ----------------------------------------------------------------

RegisterNetEvent('ls_fuel:buy', function(litres, netId)
    local src = source
    if throttled(src) then return end

    litres = math.floor(tonumber(litres) or 0)
    -- Больше бака за раз не продаём: сколько бы клиент ни попросил.
    if litres < 1 or litres > Config.Tank then return end
    if type(netId) ~= 'number' or netId <= 0 then return end

    if not atStation(src) then
        notify(src, FuelLocale.notDriver)
        return
    end

    local price = litres * Config.PricePerLitre
    if not takeMoney(src, price) then
        notify(src, FuelLocale.noMoney:format(money(price)))
        return
    end

    TriggerClientEvent('ls_fuel:pour', src, netId, litres)
    notify(src, FuelLocale.filled:format(litres, money(price)))
end)

-- --- канистра ----------------------------------------------------------------

RegisterNetEvent('ls_fuel:buyCan', function()
    local src = source
    if throttled(src) then return end

    if not atStation(src) then
        notify(src, FuelLocale.notDriver)
        return
    end

    if not canCarry(src, Config.Jerrycan.item, 1) then
        notify(src, FuelLocale.canNoRoom)
        return
    end

    if not takeMoney(src, Config.Jerrycan.price) then
        notify(src, FuelLocale.noMoney:format(money(Config.Jerrycan.price)))
        return
    end

    if not giveItem(src, Config.Jerrycan.item, 1) then
        -- Выдать не вышло - деньги вернуть. Иначе канистра куплена в никуда.
        pcall(function() return exports.phone_garage:addMoney(src, Config.Jerrycan.price) end)
        notify(src, FuelLocale.canNoRoom)
        return
    end

    notify(src, FuelLocale.canBought:format(money(Config.Jerrycan.price)))
end)

RegisterNetEvent('ls_fuel:useCan', function(netId)
    local src = source
    if throttled(src) then return end
    if type(netId) ~= 'number' or netId <= 0 then return end

    -- Канистра одноразовая: забираем до заливки, чтобы двойным нажатием
    -- нельзя было налить дважды из одной.
    if not takeItem(src, Config.Jerrycan.item, 1) then
        notify(src, FuelLocale.canEmpty)
        return
    end

    TriggerClientEvent('ls_fuel:pour', src, netId, Config.Jerrycan.litres)
    notify(src, FuelLocale.canUsed:format(Config.Jerrycan.litres))
end)

AddEventHandler('playerDropped', function()
    lastCall[source] = nil
end)
