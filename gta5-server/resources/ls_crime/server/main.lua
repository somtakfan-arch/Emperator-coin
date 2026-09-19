-- Криминал: ограбления, наркота, разбор машин, банкоматы, территории.
--
-- Всё решает сервер. Клиент только рисует подсказку и полосу прогресса и
-- говорит "я начал" и "я закончил" - но время считает сервер, поэтому
-- закончить раньше срока нельзя, сколько бы клиент ни врал.

local RES = GetCurrentResourceName()
local DATA_FILE = 'crime.json'

local cooldowns = {}    -- ["job:point"] = когда освободится (os.time)
local active = {}       -- [serverId] = { kind, key, point, endsAt, meta }
local lastCall = {}     -- [serverId] = GetGameTimer()
local plants = {}       -- [id] = { owner, x, y, z, ripeAt, rotAt }
local nextPlant = 1
local turf = {}         -- [territory key] = { owner, name, since }
local purse = {}        -- [identifier] = накопленный доход с районов
local van = nil         -- { point, spawnedAt, expiresAt } или nil
local dirty = false

-- --- мелочи ------------------------------------------------------------------

local function notify(src, text)
    TriggerClientEvent('ls_crime:notify', src, text)
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

local function coordsOf(src)
    local ped = GetPlayerPed(src)
    if ped == 0 then return nil end
    return GetEntityCoords(ped)
end

local function nearPoint(src, point, slack)
    local coords = coordsOf(src)
    if not coords then return false end
    return #(coords - vector3(point.x, point.y, point.z)) <= (slack or Config.LeashDistance + 6.0)
end

local function throttled(src)
    local now = GetGameTimer()
    if lastCall[src] and now - lastCall[src] < Config.Cooldown then return true end
    lastCall[src] = now
    return false
end

local function minutes(seconds)
    if seconds < 60 then return ('%d с'):format(seconds) end
    return ('%d мин'):format(math.ceil(seconds / 60))
end

-- --- чужие ресурсы -----------------------------------------------------------
-- Каждый вызов в pcall: упавший сосед не должен ронять ограбление.

local function addMoney(src, amount)
    local ok = pcall(function() return exports.phone_garage:addMoney(src, amount) end)
    return ok
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

local function countItem(src, item)
    local ok, inv = pcall(function() return exports.ls_inventory:getInventory(src) end)
    if not ok or type(inv) ~= 'table' then return 0 end

    local total = 0
    for _, entry in pairs(inv.slots or inv) do
        if type(entry) == 'table' and entry.item == item then
            total = total + (tonumber(entry.count) or 0)
        end
    end
    return total
end

local function canCarry(src, item, count)
    local ok, fits = pcall(function() return exports.ls_inventory:canCarry(src, item, count) end)
    return ok and fits == true
end

local function report(src, crime)
    if not crime then return end
    pcall(function() return exports.ls_police:reportCrime(src, crime) end)
end

local function officersOnline()
    local ok, n = pcall(function() return exports.ls_police:onlineOfficers() end)
    return ok and (tonumber(n) or 0) or 0
end

local function itemLabel(item)
    local ok, def = pcall(function() return exports.ls_inventory:getItemDef(item) end)
    if ok and type(def) == 'table' and def.label then return def.label end
    return item
end

-- --- хранение ----------------------------------------------------------------

local function save()
    SaveResourceFile(RES, DATA_FILE, json.encode({
        plants = plants, nextPlant = nextPlant, turf = turf, purse = purse,
        cooldowns = cooldowns,
    }), -1)
    dirty = false
end

local function load()
    local raw = LoadResourceFile(RES, DATA_FILE)
    if not raw or raw == '' then return end
    local ok, data = pcall(json.decode, raw)
    if not ok or type(data) ~= 'table' then
        print('[ls_crime] crime.json битый, начинаю с нуля')
        return
    end
    plants = data.plants or {}
    nextPlant = tonumber(data.nextPlant) or 1
    turf = data.turf or {}
    purse = data.purse or {}
    cooldowns = data.cooldowns or {}
end

-- --- ежедневная ротация ------------------------------------------------------

-- Один и тот же день даёт один и тот же набор точек у всех и после
-- рестарта: перемешивание идёт от даты, а не от math.random.
local function dailyOrder(count)
    local day = tonumber(os.date('%Y%m%d')) or 0
    local order = {}
    for i = 1, count do order[i] = i end

    -- Фишер-Йейтс на линейном конгруэнтном генераторе от даты.
    local seed = day
    for i = count, 2, -1 do
        seed = (seed * 1103515245 + 12345) % 2147483648
        local j = (seed % i) + 1
        order[i], order[j] = order[j], order[i]
    end
    return order
end

local function activeDealers()
    local order = dailyOrder(#Config.Dealers.points)
    local set = {}
    for i = 1, math.min(Config.Dealers.activePerDay, #order) do
        set[order[i]] = true
    end
    return set
end

local function marketPoint()
    local order = dailyOrder(#Config.BlackMarket.points)
    return order[1]
end

-- --- состояние для клиента ---------------------------------------------------

local function worldState()
    local ripe = {}
    for id, plant in pairs(plants) do
        ripe[#ripe + 1] = {
            id = id, x = plant.x, y = plant.y, z = plant.z,
            ripeAt = plant.ripeAt, owner = plant.owner,
        }
    end

    local owned = {}
    for key, entry in pairs(turf) do
        owned[key] = { owner = entry.owner, name = entry.name }
    end

    return {
        dealers = activeDealers(),
        market = marketPoint(),
        plants = ripe,
        turf = owned,
        van = van and { point = van.point } or nil,
        cooldowns = cooldowns,
    }
end

local function pushState(target)
    TriggerClientEvent('ls_crime:state', target or -1, worldState())
end

-- --- движок дел --------------------------------------------------------------

local function cooldownKey(key, point)
    return ('%s:%d'):format(key, point)
end

local function onCooldown(key, point)
    local until_ = cooldowns[cooldownKey(key, point)]
    return until_ and until_ > os.time() and (until_ - os.time()) or nil
end

local function setCooldown(key, point, seconds)
    if (seconds or 0) <= 0 then return end
    cooldowns[cooldownKey(key, point)] = os.time() + seconds
    dirty = true
end

-- Проверки, общие для всех дел с полосой прогресса.
local function mayStart(src, job, point)
    if active[src] then
        notify(src, CrimeLocale.busy)
        return false
    end

    local spot = job.points and job.points[point]
    if not spot or not nearPoint(src, spot) then
        notify(src, CrimeLocale.tooFar)
        return false
    end

    local left = onCooldown(job.key, point)
    if left then
        notify(src, CrimeLocale.cooling:format(minutes(left)))
        return false
    end

    if job.requiresOfficers and officersOnline() < job.requiresOfficers then
        notify(src, CrimeLocale.needOfficers)
        return false
    end

    local needs = job.needs or {}
    if needs.item and countItem(src, needs.item) <= 0 then
        notify(src, CrimeLocale.needItem:format(itemLabel(needs.item)))
        return false
    end

    if needs.anyWeapon then
        local ok, weapon = pcall(function()
            return GetSelectedPedWeapon(GetPlayerPed(src))
        end)
        if not ok or weapon == GetHashKey('WEAPON_UNARMED') then
            notify(src, CrimeLocale.needWeapon)
            return false
        end
    end

    if job.convert and countItem(src, job.convert.from) < job.convert.count then
        notify(src, CrimeLocale.needItem:format(itemLabel(job.convert.from)))
        return false
    end

    return true
end

RegisterNetEvent('ls_crime:startJob', function(key, point)
    local src = source
    if throttled(src) then return end

    point = tonumber(point)
    local job = Config.Jobs[key]
    if not job or not point then return end
    job.key = key

    if not mayStart(src, job, point) then return end

    active[src] = {
        kind = 'job', key = key, point = point,
        endsAt = os.time() + job.seconds,
    }

    -- Розыск вешается на старте, а не в конце: полиция должна успеть
    -- приехать, пока дело идёт, иначе ограбление ничем не рискует.
    report(src, job.crime)

    TriggerClientEvent('ls_crime:run', src, {
        seconds = job.seconds,
        label = job.verb or job.label,
        finish = 'ls_crime:finishJob',
        x = job.points[point].x, y = job.points[point].y, z = job.points[point].z,
    })

    -- Горячая точка: дело идёт прямо сейчас, и это видно всем на карте.
    -- Ради неё и затевается - она стягивает народ.
    if job.crime then
        local spot = job.points[point]
        pcall(function()
            return exports.ls_world:hotspot(('job:%s:%d'):format(key, point),
                job.label, spot.x, spot.y, spot.z, job.seconds + 120)
        end)
    end
end)

local function rollLoot(src, loot)
    local given = {}
    for _, entry in ipairs(loot or {}) do
        if math.random(100) <= (entry.chance or 0) then
            local count = math.random(entry.min or 1, entry.max or 1)
            if canCarry(src, entry.item, count) and giveItem(src, entry.item, count) then
                given[#given + 1] = { item = entry.item, count = count }
            end
        end
    end
    return given
end

RegisterNetEvent('ls_crime:finishJob', function()
    local src = source
    local run = active[src]
    if not run or run.kind ~= 'job' then return end
    active[src] = nil

    -- Клиент не может закончить раньше сервера, сколько бы он ни присылал.
    if os.time() < run.endsAt then
        notify(src, CrimeLocale.cancelled)
        return
    end

    local job = Config.Jobs[run.key]
    if not job then return end

    local spot = job.points[run.point]
    if not nearPoint(src, spot) then
        notify(src, CrimeLocale.moved)
        return
    end

    setCooldown(run.key, run.point, job.cooldown)

    if job.convert then
        local c = job.convert
        if not takeItem(src, c.from, c.count) then
            notify(src, CrimeLocale.nothing)
            return
        end
        if not giveItem(src, c.to, c.give) then
            notify(src, CrimeLocale.noRoom)
            return
        end
        notify(src, CrimeLocale.converted:format(itemLabel(c.to), c.give))
        return
    end

    if job.needs and job.needs.item then
        takeItem(src, job.needs.item, 1)
    end

    if job.reward then
        local amount = math.random(job.reward.min, job.reward.max)
        addMoney(src, amount)
        notify(src, CrimeLocale.gotMoney:format(money(amount)))
    end

    for _, got in ipairs(rollLoot(src, job.loot)) do
        notify(src, CrimeLocale.gotItems:format(itemLabel(got.item), got.count))
    end

    print(('[ls_crime] %s: %s (%s)'):format(GetPlayerName(src), job.label, spot.label or '?'))
    dirty = true
end)

RegisterNetEvent('ls_crime:abort', function()
    active[source] = nil
end)

-- --- банкоматы ---------------------------------------------------------------
-- У банкомата нет номера в списке, поэтому ключ остывания - его координаты,
-- округлённые до метра.

local function atmKey(coords)
    return ('atm:%d:%d:%d'):format(math.floor(coords.x), math.floor(coords.y), math.floor(coords.z))
end

RegisterNetEvent('ls_crime:startAtm', function(raw)
    local src = source
    if throttled(src) then return end
    if active[src] then notify(src, CrimeLocale.busy) return end

    if type(raw) ~= 'table' then return end
    local x, y, z = tonumber(raw.x), tonumber(raw.y), tonumber(raw.z)
    if not x or not y or not z then return end

    local at = vector3(x, y, z)
    local me = coordsOf(src)
    if not me or #(me - at) > Config.LeashDistance + 4.0 then
        notify(src, CrimeLocale.tooFar)
        return
    end

    local key = atmKey(at)
    if cooldowns[key] and cooldowns[key] > os.time() then
        notify(src, CrimeLocale.cooling:format(minutes(cooldowns[key] - os.time())))
        return
    end

    if countItem(src, Config.Atm.needs.item) <= 0 then
        notify(src, CrimeLocale.needItem:format(itemLabel(Config.Atm.needs.item)))
        return
    end

    active[src] = { kind = 'atm', key = key, at = at, endsAt = os.time() + Config.Atm.seconds }
    report(src, Config.Atm.crime)

    TriggerClientEvent('ls_crime:run', src, {
        seconds = Config.Atm.seconds, label = 'Вскрываешь банкомат',
        finish = 'ls_crime:finishAtm',
        x = x, y = y, z = z,
    })
end)

RegisterNetEvent('ls_crime:finishAtm', function()
    local src = source
    local run = active[src]
    if not run or run.kind ~= 'atm' then return end
    active[src] = nil

    if os.time() < run.endsAt then notify(src, CrimeLocale.cancelled) return end

    local me = coordsOf(src)
    if not me or #(me - run.at) > Config.LeashDistance + 4.0 then
        notify(src, CrimeLocale.moved)
        return
    end

    cooldowns[run.key] = os.time() + Config.Atm.cooldown
    takeItem(src, Config.Atm.needs.item, 1)

    local amount = math.random(Config.Atm.reward.min, Config.Atm.reward.max)
    addMoney(src, amount)
    notify(src, CrimeLocale.gotMoney:format(money(amount)))
    dirty = true
end)

-- --- конопля -----------------------------------------------------------------

local function plantsOf(identifier)
    local n = 0
    for _, plant in pairs(plants) do
        if plant.owner == identifier then n = n + 1 end
    end
    return n
end

-- Вызывается из ls_inventory, когда игрок жмёт "Применить" на семенах.
-- Возвращает true, только если семечко действительно ушло в землю.
local function plantSeed(src)
    local identifier = identifierOf(src)
    if plantsOf(identifier) >= Config.Weed.maxPerPlayer then
        notify(src, CrimeLocale.plantLimit:format(Config.Weed.maxPerPlayer))
        return false
    end

    local coords = coordsOf(src)
    if not coords then return false end

    local id = tostring(nextPlant)
    nextPlant = nextPlant + 1
    plants[id] = {
        owner = identifier,
        x = coords.x, y = coords.y, z = coords.z,
        ripeAt = os.time() + Config.Weed.growSeconds,
        rotAt = os.time() + Config.Weed.growSeconds + Config.Weed.rotSeconds,
    }

    dirty = true
    save()
    pushState()
    notify(src, CrimeLocale.plantDone:format(math.ceil(Config.Weed.growSeconds / 60)))
    return true
end

RegisterNetEvent('ls_crime:harvest', function(id)
    local src = source
    if throttled(src) then return end

    local plant = plants[tostring(id)]
    if not plant then return end

    if not nearPoint(src, plant, 3.5) then
        notify(src, CrimeLocale.tooFar)
        return
    end

    local left = plant.ripeAt - os.time()
    if left > 0 then
        notify(src, CrimeLocale.plantNotReady:format(math.ceil(left / 60)))
        return
    end

    local yield = math.random(Config.Weed.yield.min, Config.Weed.yield.max)
    if not canCarry(src, Config.Weed.raw, yield) then
        notify(src, CrimeLocale.noRoom)
        return
    end

    -- Куст снимается первым: если инвентарь вдруг откажет, лучше потерять
    -- урожай, чем получить бесконечный куст.
    plants[tostring(id)] = nil
    dirty = true
    save()
    pushState()

    giveItem(src, Config.Weed.raw, yield)
    notify(src, CrimeLocale.plantHarvest:format(yield))
end)

-- --- сбыт --------------------------------------------------------------------

RegisterNetEvent('ls_crime:sell', function(index)
    local src = source
    if throttled(src) then return end

    index = tonumber(index)
    local spot = index and Config.Dealers.points[index]
    if not spot then return end

    if not activeDealers()[index] then
        notify(src, CrimeLocale.dealerClosed)
        return
    end

    if not nearPoint(src, spot) then
        notify(src, CrimeLocale.tooFar)
        return
    end

    local have = countItem(src, Config.Weed.pack)
    local count = math.min(have, Config.Dealers.maxPerSale)
    if count <= 0 then
        notify(src, CrimeLocale.dealerNothing)
        return
    end

    if not takeItem(src, Config.Weed.pack, count) then
        notify(src, CrimeLocale.dealerNothing)
        return
    end

    local total = 0
    for _ = 1, count do
        total = total + math.random(Config.Dealers.pricePerPack.min, Config.Dealers.pricePerPack.max)
    end

    addMoney(src, total)
    report(src, Config.Dealers.crime)
    notify(src, CrimeLocale.sold:format(count, money(total)))
end)

-- --- разбор машин ------------------------------------------------------------

RegisterNetEvent('ls_crime:chop', function(index, plate, class)
    local src = source
    if throttled(src) then return end

    index = tonumber(index)
    local spot = index and Config.ChopShop.points[index]
    if not spot or not nearPoint(src, spot, 12.0) then
        notify(src, CrimeLocale.tooFar)
        return
    end

    local left = onCooldown('chop', index)
    if left then
        notify(src, CrimeLocale.cooling:format(minutes(left)))
        return
    end

    plate = type(plate) == 'string' and plate or ''
    class = tonumber(class) or 0

    -- Своя машина ничего не приносит: иначе разбор превращается в кнопку
    -- "обменять гараж на деньги".
    if not Config.ChopShop.ownCarPays and plate ~= '' then
        local ok, cars = pcall(function() return exports.phone_garage:getCars(src) end)
        if ok and type(cars) == 'table' then
            for _, car in pairs(cars) do
                if type(car) == 'table' and car.plate == plate then
                    notify(src, CrimeLocale.chopOwn)
                    return
                end
            end
        end
    end

    setCooldown('chop', index, Config.ChopShop.cooldown)

    local pay = Config.ChopShop.payByClass[class] or Config.ChopShop.defaultPay
    local parts = math.random(Config.ChopShop.parts.min, Config.ChopShop.parts.max)

    addMoney(src, pay)
    if canCarry(src, 'CAR_PART', parts) then
        giveItem(src, 'CAR_PART', parts)
    else
        parts = 0
    end

    report(src, Config.ChopShop.crime)
    TriggerClientEvent('ls_crime:chopped', src)
    notify(src, CrimeLocale.chopDone:format(money(pay), parts))
end)

-- --- чёрный рынок ------------------------------------------------------------

RegisterNetEvent('ls_crime:openMarket', function()
    local src = source
    if throttled(src) then return end

    local spot = Config.BlackMarket.points[marketPoint()]
    if not spot or not nearPoint(src, spot) then
        notify(src, CrimeLocale.tooFar)
        return
    end

    local sells = {}
    for _, row in ipairs(Config.BlackMarket.sells) do
        local ok, def = pcall(function() return exports.ls_inventory:getItemDef(row.item) end)
        sells[#sells + 1] = {
            item = row.item, price = row.price,
            label = (ok and type(def) == 'table' and def.label) or row.item,
            kind = (ok and type(def) == 'table' and def.type) or 'misc',
        }
    end

    local buys = {}
    for _, row in ipairs(Config.BlackMarket.buys) do
        local ok, def = pcall(function() return exports.ls_inventory:getItemDef(row.item) end)
        buys[#buys + 1] = {
            item = row.item, price = row.price, have = countItem(src, row.item),
            label = (ok and type(def) == 'table' and def.label) or row.item,
            kind = (ok and type(def) == 'table' and def.type) or 'misc',
        }
    end

    local wallet = 0
    local okMoney, have = pcall(function() return exports.phone_garage:getMoney(src) end)
    if okMoney then wallet = tonumber(have) or 0 end

    TriggerClientEvent('ls_crime:marketOpen', src, {
        money = wallet, sells = sells, buys = buys,
        turf = math.floor(purse[identifierOf(src)] or 0),
    })
end)

RegisterNetEvent('ls_crime:market', function(action, item)
    local src = source
    if throttled(src) then return end

    local spot = Config.BlackMarket.points[marketPoint()]
    if not spot or not nearPoint(src, spot) then
        notify(src, CrimeLocale.tooFar)
        return
    end

    if action == 'collect' then
        local identifier = identifierOf(src)
        local amount = math.floor(purse[identifier] or 0)
        if amount <= 0 then
            notify(src, CrimeLocale.turfEmpty)
            return
        end
        purse[identifier] = 0
        dirty = true
        addMoney(src, amount)
        notify(src, CrimeLocale.turfIncome:format(money(amount)))
        return
    end

    if action == 'buy' then
        for _, row in ipairs(Config.BlackMarket.sells) do
            if row.item == item then
                if not canCarry(src, row.item, 1) then
                    notify(src, CrimeLocale.noRoom)
                    return
                end
                if not takeMoney(src, row.price) then
                    notify(src, CrimeLocale.noMoney)
                    return
                end
                if not giveItem(src, row.item, 1) then
                    -- Не выдалось - деньги обратно, иначе это просто кража.
                    addMoney(src, row.price)
                    notify(src, CrimeLocale.noRoom)
                    return
                end
                notify(src, CrimeLocale.marketBought:format(itemLabel(row.item)))
                return
            end
        end
        return
    end

    if action == 'sell' then
        for _, row in ipairs(Config.BlackMarket.buys) do
            if row.item == item then
                local count = countItem(src, row.item)
                if count <= 0 then
                    notify(src, CrimeLocale.nothing)
                    return
                end
                if not takeItem(src, row.item, count) then
                    notify(src, CrimeLocale.nothing)
                    return
                end
                local total = row.price * count
                addMoney(src, total)
                notify(src, CrimeLocale.marketSold:format(itemLabel(row.item), count, money(total)))
                return
            end
        end
    end
end)

-- --- инкассаторы -------------------------------------------------------------

local function spawnVan()
    local index = math.random(#Config.Van.points)
    van = { point = index, expiresAt = os.time() + Config.Van.livesSeconds }
    pushState()
    for _, id in ipairs(GetPlayers()) do
        TriggerClientEvent('ls_crime:notify', tonumber(id), CrimeLocale.vanHere)
    end
end

RegisterNetEvent('ls_crime:startVan', function()
    local src = source
    if throttled(src) then return end
    if active[src] then notify(src, CrimeLocale.busy) return end
    if not van then return end

    local spot = Config.Van.points[van.point]
    if not spot or not nearPoint(src, spot, 8.0) then
        notify(src, CrimeLocale.tooFar)
        return
    end

    active[src] = { kind = 'van', endsAt = os.time() + Config.Van.seconds, at = spot }
    report(src, Config.Van.crime)
    TriggerClientEvent('ls_crime:run', src, {
        seconds = Config.Van.seconds, label = 'Вскрываешь двери',
        finish = 'ls_crime:finishVan',
        x = spot.x, y = spot.y, z = spot.z,
    })
end)

RegisterNetEvent('ls_crime:finishVan', function()
    local src = source
    local run = active[src]
    if not run or run.kind ~= 'van' then return end
    active[src] = nil

    if os.time() < run.endsAt then notify(src, CrimeLocale.cancelled) return end
    if not van then notify(src, CrimeLocale.vanGone) return end
    if not nearPoint(src, run.at, 8.0) then notify(src, CrimeLocale.moved) return end

    local bags = math.random(Config.Van.bags.min, Config.Van.bags.max)
    if not canCarry(src, Config.Van.bagItem, bags) then
        notify(src, CrimeLocale.noRoom)
        return
    end

    van = nil
    pushState()
    giveItem(src, Config.Van.bagItem, bags)
    notify(src, CrimeLocale.vanDone:format(bags))
    print(('[ls_crime] %s вскрыл инкассаторов'):format(GetPlayerName(src)))
end)

-- --- территории --------------------------------------------------------------

local function territories()
    local ok, list = pcall(function() return exports.ls_gangs:getTerritories() end)
    if ok and type(list) == 'table' then return list end
    return {}
end

local function turfOf(identifier)
    local n = 0
    for _, entry in pairs(turf) do
        if entry.owner == identifier then n = n + 1 end
    end
    return n
end

RegisterNetEvent('ls_crime:claimTurf', function(key)
    local src = source
    if not Config.Turf.enabled then return end
    if throttled(src) then return end
    if type(key) ~= 'string' then return end

    local spot
    for _, t in ipairs(territories()) do
        if t.key == key then spot = t break end
    end
    if not spot or not nearPoint(src, spot, spot.radius or 120.0) then
        notify(src, CrimeLocale.tooFar)
        return
    end

    local identifier = identifierOf(src)
    if turf[key] and turf[key].owner == identifier then
        notify(src, CrimeLocale.turfMine)
        return
    end

    if turfOf(identifier) >= Config.Turf.maxPerPlayer then
        notify(src, CrimeLocale.turfLimit:format(Config.Turf.maxPerPlayer))
        return
    end

    -- Район берут у банды, а не у воздуха: пока её бойцы живы, ничего не выйдет.
    local ok, clear = pcall(function()
        return exports.ls_gangs:isTerritoryClear(key)
    end)
    if not ok or clear ~= true then
        notify(src, CrimeLocale.turfBusy)
        return
    end

    local previous = turf[key] and turf[key].owner
    turf[key] = { owner = identifier, name = GetPlayerName(src), since = os.time() }
    dirty = true
    save()
    pushState()

    report(src, Config.Turf.crime)
    notify(src, CrimeLocale.turfTaken:format(spot.label or key))

    if previous and previous ~= identifier then
        for _, id in ipairs(GetPlayers()) do
            if identifierOf(tonumber(id)) == previous then
                notify(tonumber(id), CrimeLocale.turfLost:format(spot.label or key))
            end
        end
    end
end)

-- Доход капает владельцу, даже когда он не в игре: забрать можно на рынке.
CreateThread(function()
    if not Config.Turf.enabled then return end
    while true do
        Wait(Config.Turf.payoutEvery * 1000)
        local paid = false
        for _, entry in pairs(turf) do
            local amount = math.random(Config.Turf.payout.min, Config.Turf.payout.max)
            purse[entry.owner] = (purse[entry.owner] or 0) + amount
            paid = true
        end
        if paid then dirty = true end
    end
end)

-- --- жизненный цикл ----------------------------------------------------------

AddEventHandler('onResourceStart', function(name)
    if name ~= RES then return end
    load()
    math.randomseed(os.time())

    local bushes, districts = 0, 0
    for _ in pairs(plants) do bushes = bushes + 1 end
    for _ in pairs(turf) do districts = districts + 1 end
    print(('[ls_crime] кустов: %d, районов занято: %d'):format(bushes, districts))
end)

AddEventHandler('onResourceStop', function(name)
    if name == RES then save() end
end)

AddEventHandler('playerDropped', function()
    active[source] = nil
    lastCall[source] = nil
end)

RegisterNetEvent('ls_crime:ready', function()
    TriggerClientEvent('ls_crime:state', source, worldState())
end)

-- Уборка: сгнившие кусты, протухшие остывания, ушедшие инкассаторы.
CreateThread(function()
    local sinceVan = 0
    while true do
        Wait(15000)
        local now = os.time()
        local changed = false

        for id, plant in pairs(plants) do
            if plant.rotAt and plant.rotAt <= now then
                plants[id] = nil
                changed = true
            end
        end

        for key, until_ in pairs(cooldowns) do
            if until_ <= now then cooldowns[key] = nil end
        end

        if van and van.expiresAt <= now then
            van = nil
            changed = true
        end

        sinceVan = sinceVan + 15
        if not van and sinceVan >= Config.Van.everySeconds then
            sinceVan = 0
            spawnVan()
        end

        if changed then
            dirty = true
            pushState()
        end
        if dirty then save() end
    end
end)

-- --- экспорты и команды ------------------------------------------------------

-- ls_inventory зовёт это, когда игрок применил предмет наших типов.
exports('useItem', function(src, item)
    if item == Config.Weed.seed then
        return plantSeed(src)
    end
    notify(src, 'Этот предмет применяется на месте, а не из инвентаря')
    return false
end)

RegisterCommand('crime', function(src)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'police.admin') then return end
    local n = 0
    for _ in pairs(plants) do n = n + 1 end
    print(('  кустов: %d'):format(n))
    print(('  инкассаторы: %s'):format(van and ('точка ' .. van.point) or 'нет'))
    for key, entry in pairs(turf) do
        print(('  район %s -> %s'):format(key, entry.name or entry.owner))
    end
end, false)

RegisterCommand('crimevan', function(src)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'police.admin') then return end
    spawnVan()
    print('[ls_crime] инкассаторы вызваны вручную')
end, false)
