-- NPC-банды: сервер владеет состоянием, клиенты только рисуют педов.
--
-- Сами педы создаются на клиентах: серверные педы требуют, чтобы кто-то ими
-- "владел", и их боевой ИИ всё равно считает ближайший клиент. Поэтому точки
-- сервер расставляет сам и одинаково для всех, а клиент по ним спавнит. Тогда
-- задержание можно проверить: сервер знает, где стоит слот, и где игрок.

local RES = GetCurrentResourceName()

local slots = {}        -- [id] = { gang, label, x, y, z, state, until, officer }
local surrendered = {}  -- [id] = true, как только клиент доложил о сдаче
local escortOf = {}     -- [serverId полицейского] = id слота
local lastCall = {}     -- [serverId] = GetGameTimer() последнего запроса

local function notify(src, text)
    TriggerClientEvent('ls_gangs:notify', src, text)
end

-- Золотой угол: точки ложатся равномерно, без сгущения в центре, и порядок
-- всегда один и тот же - это важнее красоты, слоты должны совпадать у всех.
local GOLDEN = 2.399963229728653

local function buildSlots()
    slots = {}
    local id = 0
    for _, gang in ipairs(Config.Gangs) do
        local t = gang.territory
        for index = 1, gang.count do
            id = id + 1
            local radius = t.radius * math.sqrt(index / gang.count)
            local angle = index * GOLDEN
            slots[id] = {
                id = id,
                gang = gang.key,
                label = gang.label,
                territory = t.label,
                x = t.x + radius * math.cos(angle),
                y = t.y + radius * math.sin(angle),
                z = t.z,
                state = 'alive',
            }
        end
    end
    print(('[ls_gangs] %d гангстеров в %d районах'):format(id, #Config.Gangs))
end

local function publicSlots()
    local out = {}
    for id, slot in pairs(slots) do
        out[#out + 1] = {
            id = id, gang = slot.gang, label = slot.label,
            x = slot.x, y = slot.y, z = slot.z, state = slot.state,
        }
    end
    return out
end

local function broadcast(id)
    local slot = slots[id]
    if not slot then return end
    TriggerClientEvent('ls_gangs:slot', -1, {
        id = id, gang = slot.gang, label = slot.label,
        x = slot.x, y = slot.y, z = slot.z, state = slot.state,
    })
end

-- Слот уходит с карты на таймер. surrendered сбрасываем: вернётся он свежим.
local function retire(id, seconds)
    local slot = slots[id]
    if not slot then return end
    slot.state = 'gone'
    slot.returns = os.time() + seconds
    surrendered[id] = nil
    broadcast(id)
end

local function coordsOf(src)
    local ped = GetPlayerPed(src)
    if ped == 0 then return nil end
    return GetEntityCoords(ped)
end

-- Игрок должен быть достаточно близко к слоту, чтобы его доклад о нём
-- что-то значил. Для ареста это пара метров, а вот убить можно и с крыши
-- через полквартала - там достаточно, чтобы гангстер вообще был у него
-- загружен, иначе слот завис бы живым с трупом на земле.
local function near(src, id, requireState, distance)
    local slot = slots[tonumber(id) or -1]
    if not slot then return nil end
    if requireState and slot.state ~= requireState then return nil end

    local coords = coordsOf(src)
    if not coords then return nil end
    if #(coords - vector3(slot.x, slot.y, slot.z)) > distance then return nil end
    return slot
end

local ARREST_RANGE  = Config.ArrestDistance + 12.0
local WITNESS_RANGE = Config.StreamDistance + 60.0

local function throttled(src)
    local now = GetGameTimer()
    if lastCall[src] and now - lastCall[src] < Config.Cooldown then return true end
    lastCall[src] = now
    return false
end

local function onDuty(src)
    local ok, result = pcall(function()
        return exports.ls_police:isOnDuty(src)
    end)
    return ok and result == true
end

local function pay(src, amount)
    local ok = pcall(function()
        return exports.phone_garage:addMoney(src, amount)
    end)
    return ok
end

local function money(amount)
    -- 2500 -> "2 500", так читается быстрее.
    local text = tostring(math.floor(amount))
    local out = text:reverse():gsub('(%d%d%d)', '%1 '):reverse()
    return (out:gsub('^%s+', ''))
end

-- --- lifecycle --------------------------------------------------------------

AddEventHandler('onResourceStart', function(name)
    if name ~= RES then return end
    buildSlots()
end)

AddEventHandler('playerDropped', function()
    local src = source
    -- Полицейский вышел из игры, не доведя задержанного: слот не должен
    -- залипнуть навсегда в состоянии "его ведут".
    local id = escortOf[src]
    if id then
        escortOf[src] = nil
        retire(id, Config.RespawnArrested)
    end
    lastCall[src] = nil
end)

CreateThread(function()
    while true do
        Wait(10000)
        local now = os.time()
        for id, slot in pairs(slots) do
            if slot.state == 'gone' and slot.returns and slot.returns <= now then
                slot.state = 'alive'
                slot.returns = nil
                broadcast(id)
            end
        end
    end
end)

-- --- клиентские доклады -----------------------------------------------------

RegisterNetEvent('ls_gangs:ready', function()
    TriggerClientEvent('ls_gangs:sync', source, publicSlots())
end)

RegisterNetEvent('ls_gangs:surrendered', function(id)
    local src = source
    if throttled(src) then return end
    local slot = near(src, id, 'alive', WITNESS_RANGE)
    if not slot then return end
    surrendered[slot.id] = true
end)

RegisterNetEvent('ls_gangs:killed', function(id)
    local src = source
    local slot = near(src, id, 'alive', WITNESS_RANGE)
    if not slot then return end     -- уже убран, или доклад не от свидетеля
    retire(slot.id, Config.RespawnDead)
end)

-- --- задержание -------------------------------------------------------------

RegisterNetEvent('ls_gangs:arrest', function(id)
    local src = source
    if throttled(src) then return end

    if not onDuty(src) then
        notify(src, GangLocale.notPolice)
        return
    end

    if escortOf[src] then
        notify(src, GangLocale.handsFull)
        return
    end

    local slot = slots[tonumber(id) or -1]
    if not slot then return end
    if slot.state ~= 'alive' then
        notify(src, GangLocale.alreadyTaken)
        return
    end

    local coords = coordsOf(src)
    if not coords or #(coords - vector3(slot.x, slot.y, slot.z)) > ARREST_RANGE then
        notify(src, GangLocale.tooFar)
        return
    end

    if not surrendered[slot.id] then
        notify(src, GangLocale.notSurrendered)
        return
    end

    slot.state = 'escort'
    slot.officer = src
    escortOf[src] = slot.id

    -- Порядок важен. escortStart забирает педа из списка слотов у самого
    -- мента, и только потом broadcast говорит остальным его удалить - иначе
    -- мент удалил бы собственного задержанного, не успев его получить.
    TriggerClientEvent('ls_gangs:escortStart', src, slot.id)
    broadcast(slot.id)

    pay(src, Config.Reward.arrest)
    notify(src, GangLocale.arrested:format(slot.label, slot.territory, money(Config.Reward.arrest)))
    notify(src, GangLocale.escorting)
    print(('[ls_gangs] %s задержал %s (слот %d)'):format(GetPlayerName(src), slot.label, slot.id))
end)

RegisterNetEvent('ls_gangs:deliver', function()
    local src = source
    if throttled(src) then return end

    local id = escortOf[src]
    if not id then return end

    local coords = coordsOf(src)
    if not coords then return end

    for _, station in ipairs(Config.Stations) do
        if #(coords - vector3(station.x, station.y, station.z)) <= Config.StationRadius then
            escortOf[src] = nil
            retire(id, Config.RespawnArrested)
            pay(src, Config.Reward.deliver)
            notify(src, GangLocale.delivered:format(station.label, money(Config.Reward.deliver)))
            print(('[ls_gangs] %s сдал задержанного в «%s»'):format(GetPlayerName(src), station.label))
            return
        end
    end

    notify(src, GangLocale.tooFar)
end)

-- Клиент сообщает, что задержанный отстал или пропал. Базовая выплата
-- остаётся - мент своё уже сделал.
RegisterNetEvent('ls_gangs:escortLost', function()
    local src = source
    local id = escortOf[src]
    if not id then return end

    escortOf[src] = nil
    retire(id, Config.RespawnDead)
    notify(src, GangLocale.escapedAway)
end)

-- --- админ ------------------------------------------------------------------

RegisterCommand('gangs', function(src)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'police.admin') then return end

    local counts = {}
    for _, slot in pairs(slots) do
        counts[slot.state] = (counts[slot.state] or 0) + 1
    end
    for state, n in pairs(counts) do
        print(('  %-8s %d'):format(state, n))
    end
end, false)

RegisterCommand('gangsreset', function(src)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'police.admin') then return end
    buildSlots()
    escortOf = {}
    surrendered = {}
    TriggerClientEvent('ls_gangs:sync', -1, publicSlots())
    print('[ls_gangs] все банды возвращены на карту')
end, false)
