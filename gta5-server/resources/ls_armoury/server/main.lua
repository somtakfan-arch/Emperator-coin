-- Оружейка госфракции и поставки.
--
-- Серьёзные стволы не продаются нигде: ни в магазине, ни на чёрном рынке из
-- воздуха. Сюда они приезжают фурой, отсюда выдаются по рангу, дальше живут
-- своей жизнью. Склад конечный, и это единственное, что держит их цену.

local RES = GetCurrentResourceName()
local DATA_FILE = 'armoury.json'

local stock = {}        -- [item] = сколько на складе
local supply = nil      -- активная поставка: { kind, by, pickup, expires }
local nextSupply = 0    -- когда можно заказать следующую (os.time)
local familyRuns = {}   -- [familyId] = когда можно следующую
local lastCall = {}
local dirty = false

local function notify(src, text)
    TriggerClientEvent('ls_armoury:notify', src, text)
end

local function money(amount)
    local text = tostring(math.floor(amount))
    return (text:reverse():gsub('(%d%d%d)', '%1 '):reverse():gsub('^%s+', ''))
end

local function minutes(seconds)
    if seconds < 60 then return ('%d с'):format(seconds) end
    return ('%d мин'):format(math.ceil(seconds / 60))
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

-- --- соседи ------------------------------------------------------------------

local function rankOf(src)
    local ok, rank = pcall(function() return exports.ls_police:getRank(src) end)
    return ok and (tonumber(rank) or 0) or 0
end

local function onDuty(src)
    local ok, duty = pcall(function() return exports.ls_police:isOnDuty(src) end)
    return ok and duty == true
end

local function itemLabel(item)
    local ok, def = pcall(function() return exports.ls_inventory:getItemDef(item) end)
    if ok and type(def) == 'table' and def.label then return def.label end
    return item
end

local function giveItem(src, item, count)
    local ok, done = pcall(function() return exports.ls_inventory:giveItem(src, item, count) end)
    return ok and done == true
end

local function canCarry(src, item, count)
    local ok, fits = pcall(function() return exports.ls_inventory:canCarry(src, item, count) end)
    return ok and fits == true
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
        stock = stock, nextSupply = nextSupply, familyRuns = familyRuns,
    }), -1)
    dirty = false
end

local function load()
    local raw = LoadResourceFile(RES, DATA_FILE)
    if raw and raw ~= '' then
        local ok, data = pcall(json.decode, raw)
        if ok and type(data) == 'table' then
            stock = data.stock or {}
            nextSupply = tonumber(data.nextSupply) or 0
            familyRuns = data.familyRuns or {}
        else
            print('[ls_armoury] armoury.json битый, начинаю с нуля')
        end
    end

    -- Первый запуск: склад не пустой, иначе полиции нечем работать, пока
    -- кто-нибудь не съездит за поставкой.
    for _, row in ipairs(Config.Stock) do
        if stock[row.item] == nil then stock[row.item] = row.start or 0 end
    end
end

-- --- витрина склада ----------------------------------------------------------

local function stockView(src)
    local rank = rankOf(src)
    local rows = {}
    for _, row in ipairs(Config.Stock) do
        rows[#rows + 1] = {
            item = row.item,
            label = itemLabel(row.item),
            count = math.floor(stock[row.item] or 0),
            rank = row.rank,
            allowed = rank >= row.rank,
        }
    end
    return rows
end

local function atPoint(src)
    local coords = coordsOf(src)
    if not coords then return false end
    for _, point in ipairs(Config.Points) do
        if #(coords - vector3(point.x, point.y, point.z)) <= Config.Interact + 4.0 then
            return true
        end
    end
    return false
end

RegisterNetEvent('ls_armoury:open', function()
    local src = source
    if throttled(src) then return end
    if not onDuty(src) then notify(src, ArmLocale.notOfficer) return end
    if not atPoint(src) then return end

    TriggerClientEvent('ls_armoury:stock', src, stockView(src))
end)

RegisterNetEvent('ls_armoury:take', function(item)
    local src = source
    if throttled(src) then return end
    if not onDuty(src) then notify(src, ArmLocale.notOfficer) return end
    if not atPoint(src) then return end

    local row
    for _, entry in ipairs(Config.Stock) do
        if entry.item == item then row = entry break end
    end
    if not row then return end

    if rankOf(src) < row.rank then
        notify(src, ArmLocale.rankLow)
        return
    end

    if (stock[item] or 0) < 1 then
        notify(src, ArmLocale.empty)
        return
    end

    if not canCarry(src, item, 1) then
        notify(src, ArmLocale.noRoom)
        return
    end

    -- Списываем до выдачи: если выдача не прошла, возвращаем. Наоборот
    -- было бы дырой в складе.
    stock[item] = stock[item] - 1
    if not giveItem(src, item, 1) then
        stock[item] = stock[item] + 1
        notify(src, ArmLocale.noRoom)
        return
    end

    dirty = true
    save()
    notify(src, ArmLocale.took:format(itemLabel(item), stock[item]))
    print(('[ls_armoury] %s взял %s, осталось %d')
        :format(GetPlayerName(src), item, stock[item]))
    TriggerClientEvent('ls_armoury:stock', src, stockView(src))
end)

-- --- поставка в оружейку -----------------------------------------------------

RegisterNetEvent('ls_armoury:orderSupply', function()
    local src = source
    if throttled(src) then return end

    if not onDuty(src) or rankOf(src) < Config.Supply.rank then
        notify(src, ArmLocale.supplyRank)
        return
    end

    if supply then
        notify(src, ArmLocale.supplyBusy)
        return
    end

    local now = os.time()
    if nextSupply > now then
        notify(src, ArmLocale.supplyWait:format(minutes(nextSupply - now)))
        return
    end

    if not takeMoney(src, Config.Supply.price) then
        notify(src, ArmLocale.supplyMoney:format(money(Config.Supply.price)))
        return
    end

    local pickup = Config.Supply.pickups[math.random(#Config.Supply.pickups)]
    supply = {
        kind = 'armoury', by = src, pickup = pickup,
        paid = Config.Supply.price,
        expires = now + 1800,
    }

    notify(src, ArmLocale.supplyGo:format(pickup.label))
    TriggerClientEvent('ls_armoury:supply', -1, {
        pickup = pickup, drops = Config.Points, model = Config.Supply.model,
        forSrc = src,
    })

    -- Фура с оружием - законная добыча. Про неё знают все.
    if Config.Supply.tellEveryone then
        for _, id in ipairs(GetPlayers()) do
            local player = tonumber(id)
            if player ~= src then notify(player, ArmLocale.supplyAlert) end
        end
    end

    print(('[ls_armoury] %s заказал поставку из «%s»'):format(GetPlayerName(src), pickup.label))
end)

RegisterNetEvent('ls_armoury:deliverSupply', function()
    local src = source
    if throttled(src) then return end
    if not supply or supply.kind ~= 'armoury' then return end

    local coords = coordsOf(src)
    if not coords then return end

    local ok = false
    for _, point in ipairs(Config.Points) do
        if #(coords - vector3(point.x, point.y, point.z)) <= Config.Supply.dropRadius then
            ok = true
            break
        end
    end
    if not ok then return end

    -- Партия ложится на склад. Кто именно довёз - неважно: это работа
    -- фракции, а не личная.
    for _, row in ipairs(Config.Stock) do
        local now_ = (stock[row.item] or 0) + Config.Supply.crates
        stock[row.item] = math.min(now_, Config.MaxStock)
    end

    supply = nil
    nextSupply = os.time() + Config.Supply.cooldown
    dirty = true
    save()

    TriggerClientEvent('ls_armoury:supplyOver', -1)
    notify(src, ArmLocale.supplyDone)
    print(('[ls_armoury] партия принята, довёз %s'):format(GetPlayerName(src)))
end)

-- Фуру сожгли по дороге. Деньги не возвращаются: в этом и риск.
RegisterNetEvent('ls_armoury:supplyLost', function()
    local src = source
    if not supply or supply.kind ~= 'armoury' then return end
    if supply.by ~= src then return end

    supply = nil
    nextSupply = os.time() + Config.Supply.cooldown
    dirty = true
    save()

    TriggerClientEvent('ls_armoury:supplyOver', -1)
    notify(src, ArmLocale.supplyLost)
end)

-- --- семейная поставка -------------------------------------------------------

local function familyOffice(src)
    local ok, list = pcall(function() return exports.ls_property:familyOffices(src) end)
    if ok and type(list) == 'table' and list[1] then return list[1] end
    return nil
end

RegisterNetEvent('ls_armoury:orderFamily', function()
    local src = source
    if throttled(src) then return end

    local office = familyOffice(src)
    if not office then
        notify(src, ArmLocale.famNoOffice)
        return
    end

    local now = os.time()
    local until_ = familyRuns[office.family] or 0
    if until_ > now then
        notify(src, ArmLocale.supplyWait:format(minutes(until_ - now)))
        return
    end

    if supply then
        notify(src, ArmLocale.supplyBusy)
        return
    end

    if not takeMoney(src, Config.FamilySupply.price) then
        notify(src, ArmLocale.supplyMoney:format(money(Config.FamilySupply.price)))
        return
    end

    local pickup = Config.FamilySupply.pickups[math.random(#Config.FamilySupply.pickups)]
    supply = {
        kind = 'family', by = src, pickup = pickup,
        office = office, family = office.family,
        expires = now + 1800,
    }

    notify(src, ArmLocale.supplyGo:format(pickup.label))
    TriggerClientEvent('ls_armoury:supply', src, {
        pickup = pickup,
        drops = { { label = office.label, x = office.x, y = office.y, z = office.z } },
        model = Config.FamilySupply.model,
        forSrc = src,
    })
end)

RegisterNetEvent('ls_armoury:deliverFamily', function()
    local src = source
    if throttled(src) then return end
    if not supply or supply.kind ~= 'family' then return end

    local coords = coordsOf(src)
    local office = supply.office
    if not coords or not office then return end
    if #(coords - vector3(office.x, office.y, office.z)) > Config.FamilySupply.dropRadius then
        return
    end

    local crate = Config.FamilySupply.crates
    local ok = pcall(function()
        return exports.ls_property:stockOffice(office.key, crate.item, crate.count)
    end)

    familyRuns[supply.family] = os.time() + Config.FamilySupply.cooldown
    supply = nil
    dirty = true
    save()

    TriggerClientEvent('ls_armoury:supplyOver', src)
    if ok then
        notify(src, ArmLocale.famDone:format(itemLabel(crate.item), crate.count))
    else
        notify(src, ArmLocale.supplyLost)
    end
end)

-- --- жизненный цикл ----------------------------------------------------------

AddEventHandler('onResourceStart', function(name)
    if name ~= RES then return end
    load()
    math.randomseed(os.time())

    local total = 0
    for _, n in pairs(stock) do total = total + n end
    print(('[ls_armoury] на складе единиц: %d'):format(total))
end)

AddEventHandler('onResourceStop', function(name)
    if name == RES then save() end
end)

AddEventHandler('playerDropped', function()
    local src = source
    lastCall[src] = nil
    -- Заказавший вышел - поставка не должна висеть вечно.
    if supply and supply.by == src then
        supply = nil
        TriggerClientEvent('ls_armoury:supplyOver', -1)
    end
end)

CreateThread(function()
    while true do
        Wait(30000)
        if supply and supply.expires and supply.expires <= os.time() then
            supply = nil
            TriggerClientEvent('ls_armoury:supplyOver', -1)
        end
        if dirty then save() end
    end
end)

-- --- экспорты и команды ------------------------------------------------------

-- Чёрный рынок спрашивает это, чтобы знать, сколько стволов вообще в мире.
exports('stockOf', function(item)
    return math.floor(stock[item] or 0)
end)

RegisterCommand('armoury', function(src)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'police.admin') then return end
    for _, row in ipairs(Config.Stock) do
        print(('  %-26s %d'):format(row.item, math.floor(stock[row.item] or 0)))
    end
end, false)

RegisterCommand('armourygive', function(src, args)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'police.admin') then return end
    local item, count = args[1], tonumber(args[2]) or 1
    if not item or stock[item] == nil then
        print('usage: armourygive <WEAPON_...> <сколько>')
        return
    end
    stock[item] = math.min((stock[item] or 0) + count, Config.MaxStock)
    dirty = true
    save()
    print(('[ls_armoury] %s -> %d'):format(item, stock[item]))
end, false)
