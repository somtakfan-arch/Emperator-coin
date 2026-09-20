-- Промыслы на клиенте: метки, маркеры над точками, анимация работы и
-- свежевание туши.
--
-- Какие точки пустые, решает сервер: у него одни часы на всех. Клиент
-- только хранит присланный список, чтобы не рисовать маркер там, где брать
-- уже нечего.

local nodeUntil = {}        -- ['quarry:3'] = os.time, когда снова даёт
local nearNode = nil        -- { trade, index, node }
local nearBuyer = nil
local busy = false

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

RegisterNetEvent('ls_wild:notify', function(text) notify(text) end)

RegisterNetEvent('ls_wild:nodes', function(rows)
    nodeUntil = rows or {}
end)

RegisterNetEvent('ls_wild:node', function(key, until_)
    nodeUntil[key] = until_
end)

-- Серверное os.time и клиентское совпадают: оба идут от одних и тех же
-- часов машины, а расхождение в пару секунд тут ничего не решает.
local function nodeReady(key)
    local until_ = nodeUntil[key]
    return not until_ or until_ <= os.time()
end

-- --- метки ---------------------------------------------------------------------

CreateThread(function()
    for _, trade in pairs(Config.Trades) do
        -- Одна метка на промысел, а не на каждый камень: восемь значков в
        -- одной точке карты - это не карта, а помойка.
        local first = trade.nodes[1]
        local blip = AddBlipForCoord(first.x, first.y, first.z)
        SetBlipSprite(blip, trade.blip.sprite)
        SetBlipColour(blip, trade.blip.colour)
        SetBlipScale(blip, trade.blip.scale)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(trade.label)
        EndTextCommandSetBlipName(blip)
    end

    -- Рыбалка разбросана по побережью - там метка нужна на каждой точке.
    for i = 2, #Config.Trades.fishing.nodes do
        local node = Config.Trades.fishing.nodes[i]
        local blip = AddBlipForCoord(node.x, node.y, node.z)
        SetBlipSprite(blip, Config.Trades.fishing.blip.sprite)
        SetBlipColour(blip, Config.Trades.fishing.blip.colour)
        SetBlipScale(blip, Config.Trades.fishing.blip.scale)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(Config.Trades.fishing.label)
        EndTextCommandSetBlipName(blip)
    end

    for _, buyer in ipairs(Config.Buyers) do
        local blip = AddBlipForCoord(buyer.x, buyer.y, buyer.z)
        SetBlipSprite(blip, Config.BuyerBlip.sprite)
        SetBlipColour(blip, Config.BuyerBlip.colour)
        SetBlipScale(blip, Config.BuyerBlip.scale)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(buyer.label)
        EndTextCommandSetBlipName(blip)
    end

    -- Угодья кругом на карте: точки в них нет, есть area.
    local zone = Config.Hunt.zone
    local area = AddBlipForRadius(zone.x, zone.y, zone.z, zone.r)
    SetBlipColour(area, Config.Hunt.blip.colour)
    SetBlipAlpha(area, 80)

    local mark = AddBlipForCoord(zone.x, zone.y, zone.z)
    SetBlipSprite(mark, Config.Hunt.blip.sprite)
    SetBlipColour(mark, Config.Hunt.blip.colour)
    SetBlipScale(mark, Config.Hunt.blip.scale)
    SetBlipAsShortRange(mark, true)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName(Config.Hunt.label)
    EndTextCommandSetBlipName(mark)
end)

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(2500)
    TriggerServerEvent('ls_wild:requestNodes')
end)

-- --- что рядом -----------------------------------------------------------------

CreateThread(function()
    while true do
        Wait(700)
        local me = GetEntityCoords(PlayerPedId())

        nearNode = nil
        for key, trade in pairs(Config.Trades) do
            for index, node in ipairs(trade.nodes) do
                if #(me - vector3(node.x, node.y, node.z)) <= Config.Interact then
                    nearNode = { key = key, trade = trade, index = index, node = node }
                    break
                end
            end
            if nearNode then break end
        end

        nearBuyer = nil
        for _, buyer in ipairs(Config.Buyers) do
            if #(me - vector3(buyer.x, buyer.y, buyer.z)) <= Config.Interact then
                nearBuyer = buyer
                break
            end
        end
    end
end)

-- Маркеры над точками: только над готовыми и только вблизи, иначе игра
-- рисует полсотни цилиндров через всю карту.
CreateThread(function()
    while true do
        local wait = 700
        local me = GetEntityCoords(PlayerPedId())

        for key, trade in pairs(Config.Trades) do
            for index, node in ipairs(trade.nodes) do
                local point = vector3(node.x, node.y, node.z)
                if #(me - point) < 35.0 then
                    wait = 0
                    if nodeReady(key .. ':' .. index) then
                        DrawMarker(23, point.x, point.y, point.z - 0.95, 0, 0, 0, 0, 0, 0,
                            1.4, 1.4, 0.6, 120, 200, 140, 110,
                            false, false, 2, false, nil, nil, false)
                    end
                end
            end
        end

        Wait(wait)
    end
end)

-- --- работа --------------------------------------------------------------------

local function work(trade, seconds)
    busy = true
    local ped = PlayerPedId()

    if trade.anim then
        RequestAnimDict(trade.anim.dict)
        local deadline = GetGameTimer() + 3000
        while not HasAnimDictLoaded(trade.anim.dict) and GetGameTimer() < deadline do Wait(20) end
        if HasAnimDictLoaded(trade.anim.dict) then
            TaskPlayAnim(ped, trade.anim.dict, trade.anim.name, 8.0, -8.0,
                seconds * 1000, 1, 0, false, false, false)
        end
    end

    Wait(seconds * 1000)
    ClearPedTasks(PlayerPedId())
    busy = false
end

-- --- охота ---------------------------------------------------------------------

local animalHashes = nil

local function carcassNearby()
    if not animalHashes then
        animalHashes = {}
        for _, name in ipairs(Config.Hunt.animals) do
            animalHashes[GetHashKey(name)] = true
        end
    end

    local me = GetEntityCoords(PlayerPedId())
    for _, ped in ipairs(GetGamePool('CPed')) do
        if IsEntityDead(ped) and animalHashes[GetEntityModel(ped)]
            and #(me - GetEntityCoords(ped)) <= 3.0 then
            return ped
        end
    end
    return nil
end

local function inHuntZone()
    local zone = Config.Hunt.zone
    local me = GetEntityCoords(PlayerPedId())
    return #(me - vector3(zone.x, zone.y, me.z)) <= zone.r
end

-- --- меню E --------------------------------------------------------------------

AddEventHandler('ls_interact:collect', function()
    if busy then return end

    if nearNode and nodeReady(nearNode.key .. ':' .. nearNode.index) then
        TriggerEvent('ls_interact:offer', {
            id = ('ls_wild:gather:%s:%d'):format(nearNode.key, nearNode.index),
            label = WildLocale[nearNode.trade.prompt] or nearNode.trade.label,
            order = 4,
        })
    end

    if nearBuyer then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_wild:sell', label = WildLocale.sellPrompt, order = 4,
        })
    end

    if inHuntZone() and carcassNearby() then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_wild:skin', label = WildLocale.skinPrompt, order = 3,
        })
    end
end)

AddEventHandler('ls_interact:run', function(id)
    if id == 'ls_wild:sell' then
        TriggerServerEvent('ls_wild:sell')

    elseif id == 'ls_wild:skin' then
        if busy then notify(WildLocale.busy) return end
        CreateThread(function()
            local carcass = carcassNearby()
            if not carcass then notify(WildLocale.huntNone) return end

            work({ anim = { dict = 'amb@medic@standing@kneel@base', name = 'base' } },
                Config.Hunt.seconds)

            -- Туша уходит вместе со шкурой: оставлять её лежать значит
            -- разрешить свежевать одного оленя всей деревней.
            if DoesEntityExist(carcass) then
                NetworkRequestControlOfEntity(carcass)
                DeleteEntity(carcass)
            end
            TriggerServerEvent('ls_wild:skin')
        end)

    elseif id:sub(1, 15) == 'ls_wild:gather:' then
        if busy then notify(WildLocale.busy) return end
        local rest = id:sub(16)
        local key, index = rest:match('^(.-):(%d+)$')
        local trade = key and Config.Trades[key]
        if not trade then return end

        CreateThread(function()
            work(trade, trade.seconds)
            TriggerServerEvent('ls_wild:gather', key, tonumber(index))
        end)
    end
end)

AddEventHandler('onResourceStop', function(name)
    if name == GetCurrentResourceName() then ClearPedTasks(PlayerPedId()) end
end)
