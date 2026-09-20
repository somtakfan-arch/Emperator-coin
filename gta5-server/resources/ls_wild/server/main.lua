-- Промыслы: сервер решает, кто что добыл.
--
-- Клиент говорит только "я долблю вот эту точку". Координаты, откат точки и
-- выдача предмета - здесь: иначе руда сыпалась бы из чата.
--
-- Откаты точек держатся в памяти и не переживают перезапуск. Это осознанно:
-- после рестарта карьер снова полон, и это меньшее зло, чем файл, который
-- пишется каждые девять секунд на каждого игрока.

local nodeUntil = {}    -- ['quarry:3'] = os.time, когда точка снова даёт
local lastHunt = {}     -- [src] = когда последний раз свежевал
local lastCall = {}

local function notify(src, text)
    TriggerClientEvent('ls_wild:notify', src, text)
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

local function canCarry(src, item, count)
    local ok, fits = pcall(function() return exports.ls_inventory:canCarry(src, item, count) end)
    return ok and fits == true
end

local function takeItem(src, item, count)
    local ok, done = pcall(function() return exports.ls_inventory:takeItem(src, item, count) end)
    return ok and done == true
end

local function inventoryOf(src)
    local ok, inv = pcall(function() return exports.ls_inventory:getInventory(src) end)
    if ok and type(inv) == 'table' then return inv end
    return nil
end

local function addMoney(src, amount)
    return pcall(function() return exports.phone_garage:addMoney(src, amount) end)
end

local function itemLabel(item)
    local ok, def = pcall(function() return exports.ls_inventory:getItemDef(item) end)
    if ok and type(def) == 'table' and def.label then return def.label end
    return item
end

local function rolled(range)
    local low, high = range[1], range[2]
    if high <= low then return low end
    return math.random(low, high)
end

-- --- добыча с точки ------------------------------------------------------------

RegisterNetEvent('ls_wild:gather', function(tradeKey, index)
    local src = source

    local trade = Config.Trades[tradeKey]
    if not trade then return end
    index = tonumber(index)
    local node = index and trade.nodes[index]
    if not node then return end

    local coords = coordsOf(src)
    if not coords or #(coords - vector3(node.x, node.y, node.z)) > Config.Interact + 4.0 then
        notify(src, WildLocale.tooFar)
        return
    end

    local key = tradeKey .. ':' .. index
    local now = os.time()
    if nodeUntil[key] and nodeUntil[key] > now then
        notify(src, WildLocale.spent)
        return
    end

    local count = rolled(trade.amount)
    if not canCarry(src, trade.item, count) then
        notify(src, WildLocale.noRoom)
        return
    end

    -- Точку гасим до выдачи: если выдача не пройдёт, повторить всё равно
    -- нельзя будет сразу, и это честнее, чем гасить после и позволить двум
    -- нажатиям пройти сквозь одну точку.
    nodeUntil[key] = now + Config.NodeCooldown
    TriggerClientEvent('ls_wild:node', -1, key, nodeUntil[key])

    if giveItem(src, trade.item, count) then
        notify(src, WildLocale.got:format(itemLabel(trade.item), count))
    else
        notify(src, WildLocale.noRoom)
    end
end)

-- Клиенту нужно знать, какие точки сейчас пустые, чтобы не рисовать над
-- ними маркер и не предлагать пункт в меню.
RegisterNetEvent('ls_wild:requestNodes', function()
    local src = source
    local now = os.time()
    local rows = {}
    for key, until_ in pairs(nodeUntil) do
        if until_ > now then rows[key] = until_ end
    end
    TriggerClientEvent('ls_wild:nodes', src, rows)
end)

-- --- охота ---------------------------------------------------------------------

RegisterNetEvent('ls_wild:skin', function()
    local src = source

    local now = os.time()
    if lastHunt[src] and now - lastHunt[src] < Config.Hunt.cooldown then
        notify(src, WildLocale.busy)
        return
    end

    local coords = coordsOf(src)
    if not coords then return end

    local zone = Config.Hunt.zone
    if #(coords - vector3(zone.x, zone.y, coords.z)) > zone.r then
        notify(src, WildLocale.huntZone)
        return
    end

    -- Саму тушу сервер не видит: животные живут только на клиентах. Поэтому
    -- защита тут другая - угодья плюс откат. На маленьком сервере этого
    -- хватает, а тащить сюда проверку сущности значило бы доверять клиенту
    -- ровно тот же самый факт.
    lastHunt[src] = now

    local gave = false
    for _, entry in ipairs(Config.Hunt.loot) do
        local count = rolled(entry.amount)
        if canCarry(src, entry.item, count) and giveItem(src, entry.item, count) then
            gave = true
        end
    end

    notify(src, gave and WildLocale.huntDone or WildLocale.noRoom)
end)

-- --- скупщик -------------------------------------------------------------------

RegisterNetEvent('ls_wild:sell', function()
    local src = source
    if throttled(src) then return end

    local coords = coordsOf(src)
    if not coords then return end
    local near = false
    for _, buyer in ipairs(Config.Buyers) do
        if #(coords - vector3(buyer.x, buyer.y, buyer.z)) <= Config.Interact + 3.0 then
            near = true
            break
        end
    end
    if not near then
        notify(src, WildLocale.tooFar)
        return
    end

    local inv = inventoryOf(src)
    if not inv then return end

    -- Сначала считаем, потом забираем: иначе предмет мог бы уйти, а деньги
    -- за него - нет.
    -- getInventory отдаёт { slots = {...}, capacity, backpack }; запасной
    -- вариант "а вдруг это сам список" перебирал бы capacity как предмет.
    local haul = {}
    for _, entry in ipairs(inv.slots or {}) do
        local item = entry.item
        if item and Config.Prices[item] then
            haul[item] = (haul[item] or 0) + (tonumber(entry.count) or 0)
        end
    end

    local total, lines = 0, {}
    for item, count in pairs(haul) do
        if count > 0 and takeItem(src, item, count) then
            local sum = count * Config.Prices[item]
            total = total + sum
            lines[#lines + 1] = ('%s ×%d'):format(itemLabel(item), count)
        end
    end

    if total <= 0 then
        notify(src, WildLocale.nothing)
        return
    end

    addMoney(src, total)
    notify(src, WildLocale.sold:format(table.concat(lines, ', '), money(total)))
end)

AddEventHandler('playerDropped', function()
    local src = source
    lastCall[src] = nil
    lastHunt[src] = nil
end)
