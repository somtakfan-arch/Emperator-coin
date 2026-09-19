-- Клиент: рисует гангстеров по слотам, следит за их здоровьем и предлагает
-- ментам [E]. Решает всё сервер, здесь только показ и доклады.

local slots = {}        -- [id] = { gang, label, x, y, z, state }
local peds = {}         -- [id] = ped
local gaveUp = {}       -- [id] = true, руки подняты и доложено серверу
local killed = {}       -- [id] = true, смерть доложена
local groups = {}       -- [gang key] = хеш группы отношений
local escortPed = nil   -- пед, который идёт за игроком
local escortSlot = nil

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

local function gangByKey(key)
    for _, gang in ipairs(Config.Gangs) do
        if gang.key == key then return gang end
    end
    return nil
end

local function drawText3D(x, y, z, text)
    SetDrawOrigin(x, y, z, 0)
    SetTextFont(4)
    SetTextScale(0.34, 0.34)
    SetTextCentre(true)
    SetTextOutline()
    BeginTextCommandDisplayText('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayText(0.0, 0.0)
    ClearDrawOrigin()
end

local function loadModel(model)
    local hash = type(model) == 'number' and model or GetHashKey(model)
    if not IsModelInCdimage(hash) or not IsModelAPed(hash) then return nil end

    RequestModel(hash)
    local deadline = GetGameTimer() + 8000
    while not HasModelLoaded(hash) and GetGameTimer() < deadline do Wait(20) end
    if not HasModelLoaded(hash) then return nil end
    return hash
end

-- Каждой банде своя группа: своих не трогают, игроков - по настройке.
local function relationshipGroup(gang)
    if groups[gang.key] then return groups[gang.key] end

    local name = 'GANG_' .. gang.key:upper()
    AddRelationshipGroup(name)
    local hash = GetHashKey(name)

    SetRelationshipBetweenGroups(0, hash, hash)                 -- 0 = свои
    if Config.HostileToPlayers then
        SetRelationshipBetweenGroups(5, hash, GetHashKey('PLAYER'))      -- 5 = ненависть
        SetRelationshipBetweenGroups(5, GetHashKey('PLAYER'), hash)
    end
    -- С другими бандами - вражда. Иначе они мирно стоят рядом на границе.
    for key, other in pairs(groups) do
        if key ~= gang.key then
            SetRelationshipBetweenGroups(5, hash, other)
            SetRelationshipBetweenGroups(5, other, hash)
        end
    end

    groups[gang.key] = hash
    return hash
end

-- Слот хранит высоту "примерно". Настоящую землю знает только клиент.
local function groundAt(x, y, z)
    local found, groundZ = GetGroundZFor_3dCoord(x + 0.0, y + 0.0, z + 60.0, false)
    if found and groundZ > -200.0 then return groundZ + 1.0 end
    return z
end

local function spawnGangster(id, slot)
    local gang = gangByKey(slot.gang)
    if not gang then return end

    local hash = loadModel(gang.models[math.random(#gang.models)])
    if not hash then return end

    local z = groundAt(slot.x, slot.y, slot.z)
    local ped = CreatePed(4, hash, slot.x, slot.y, z, math.random(0, 359) + 0.0, false, true)
    SetModelAsNoLongerNeeded(hash)
    if not DoesEntityExist(ped) then return end

    -- Без этого движок выгружает педа, как только игрок отвернулся, и слот
    -- начинает мигать.
    SetEntityAsMissionEntity(ped, true, true)
    SetPedDropsWeaponsWhenDead(ped, false)
    SetPedDiesWhenInjured(ped, false)
    SetPedCanRagdollFromPlayerImpact(ped, true)
    SetPedArmour(ped, gang.armour or 0)
    SetPedAccuracy(ped, gang.accuracy or 30)
    SetPedRelationshipGroupHash(ped, relationshipGroup(gang))

    GiveWeaponToPed(ped, GetHashKey(gang.weapons[math.random(#gang.weapons)]), 250, false, true)
    SetPedCombatAbility(ped, 1)
    SetPedCombatRange(ped, 1)
    SetPedFleeAttributes(ped, 0, false)
    SetPedCombatAttributes(ped, 46, true)   -- всегда драться
    SetPedCombatAttributes(ped, 5, true)    -- может использовать укрытия
    TaskWanderInArea(ped, slot.x, slot.y, z, 30.0, 8.0, 8.0)

    peds[id] = ped
    gaveUp[id], killed[id] = nil, nil
end

local function despawn(id)
    local ped = peds[id]
    peds[id] = nil
    gaveUp[id], killed[id] = nil, nil
    if ped and DoesEntityExist(ped) and ped ~= escortPed then
        DeleteEntity(ped)
    end
end

local function dropEscort(tellServer)
    if escortPed and DoesEntityExist(escortPed) and escortPed ~= 0 then
        DeleteEntity(escortPed)
    end
    escortPed, escortSlot = nil, nil
    if tellServer then TriggerServerEvent('ls_gangs:escortLost') end
end

-- --- события сервера --------------------------------------------------------

RegisterNetEvent('ls_gangs:notify', function(text) notify(text) end)

RegisterNetEvent('ls_gangs:sync', function(list)
    slots = {}
    for _, slot in ipairs(list) do slots[slot.id] = slot end
end)

RegisterNetEvent('ls_gangs:slot', function(slot)
    slots[slot.id] = slot
    -- 'down' - это лежащее тело, его убирать нельзя: над ним ещё работают.
    if slot.state ~= 'alive' and slot.state ~= 'down' then
        if slot.id == escortSlot then
            -- Сервер уже закрыл слот (сдали или потеряли) - убираем куклу.
            if escortPed and DoesEntityExist(escortPed) then DeleteEntity(escortPed) end
            escortPed, escortSlot = nil, nil
        end
        despawn(slot.id)
    end
end)

-- --- стриминг ---------------------------------------------------------------

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(2000)
    TriggerServerEvent('ls_gangs:ready')

    while true do
        Wait(1500)
        local me = GetEntityCoords(PlayerPedId())

        for id, slot in pairs(slots) do
            local distance = #(me - vector3(slot.x, slot.y, slot.z))
            if slot.state == 'down' then
                -- Тело уже стоит у того, кто его положил. Остальным его
                -- создавать не надо: оно не переживёт чужой стриминг.
            elseif slot.state == 'alive' and distance <= Config.StreamDistance then
                if not peds[id] or not DoesEntityExist(peds[id]) then
                    spawnGangster(id, slot)
                end
            elseif peds[id] and distance > Config.StreamDistance + 40.0 then
                despawn(id)
            end
        end
    end
end)

-- --- сдача и смерть ---------------------------------------------------------

CreateThread(function()
    while true do
        Wait(400)
        for id, ped in pairs(peds) do
            if not DoesEntityExist(ped) then
                peds[id] = nil
            elseif IsPedDeadOrDying(ped, true) then
                -- Отдельный флаг от сдачи: сдавшегося ещё могут пристрелить,
                -- и тогда о смерти надо доложить, иначе слот зависнет живым
                -- с трупом на земле и никогда не вернётся.
                if not killed[id] then
                    killed[id] = true
                    TriggerServerEvent('ls_gangs:killed', id)
                end
            elseif GetEntityHealth(ped) <= Config.SurrenderHealth then
                if not gaveUp[id] then
                    gaveUp[id] = true
                    -- Руки вверх и больше не стреляет. Навсегда: пока его не
                    -- заберут или не пристрелят.
                    ClearPedTasksImmediately(ped)
                    SetPedCombatAttributes(ped, 46, false)
                    TaskHandsUp(ped, -1, 0, -1, true)
                    SetPedKeepTask(ped, true)
                    TriggerServerEvent('ls_gangs:surrendered', id)
                end
            end
        end
    end
end)

RegisterNetEvent('ls_gangs:revived', function(id)
    local ped = peds[id]
    if not ped or not DoesEntityExist(ped) then return end

    -- Именно ResurrectPed: NetworkResurrectLocalPlayer поднял бы самого
    -- игрока, да ещё и на месте трупа.
    ResurrectPed(ped)
    SetEntityHealth(ped, 150)
    ClearPedTasksImmediately(ped)

    -- Поднятый стоит в наручниках: не дерётся, не убегает, ждёт конвоя.
    SetPedCombatAttributes(ped, 46, false)
    SetBlockingOfNonTemporaryEvents(ped, true)
    TaskHandsUp(ped, -1, 0, -1, true)
    SetPedKeepTask(ped, true)

    gaveUp[id] = true
    killed[id] = nil
end)

-- --- взаимодействие ---------------------------------------------------------
-- Само нажатие E ловит ls_interact. Здесь только "что я могу предложить".

local function isOnDuty()
    local ok, duty = pcall(function() return exports.ls_police:isOnDuty() end)
    return ok and duty == true
end

AddEventHandler('ls_interact:collect', function()
    local me = GetEntityCoords(PlayerPedId())

    if escortSlot then
        for index, station in ipairs(Config.Stations) do
            if #(me - vector3(station.x, station.y, station.z)) <= Config.StationRadius then
                TriggerEvent('ls_interact:offer', {
                    id = 'ls_gangs:deliver',
                    label = ('Сдать задержанного — %s'):format(station.label),
                    order = 5,
                })
                break
            end
        end
        return
    end

    if not isOnDuty() then return end

    for id, ped in pairs(peds) do
        if DoesEntityExist(ped) and #(me - GetEntityCoords(ped)) <= Config.ArrestDistance then
            local slot = slots[id]
            local label, event

            if slot and slot.state == 'down' then
                -- Сначала наручники, потом дефибриллятор. Поднятый без
                -- наручников просто убежал бы.
                if slot.cuffed then
                    label, event = 'Поднять дефибриллятором', 'reviveDown'
                else
                    label, event = 'Надеть наручники', 'cuffDown'
                end
            elseif gaveUp[id] and not IsPedDeadOrDying(ped, true) then
                label, event = 'Задержать', 'arrest'
            end

            if label then
                TriggerEvent('ls_interact:offer', {
                    id = ('ls_gangs:%s:%s'):format(event, id),
                    label = ('%s — %s'):format(label, slot and slot.label or 'гангстер'),
                    order = 10,
                })
            end
        end
    end
end)

AddEventHandler('ls_interact:run', function(id)
    if type(id) ~= 'string' or id:sub(1, 9) ~= 'ls_gangs:' then return end

    if id == 'ls_gangs:deliver' then
        TriggerServerEvent('ls_gangs:deliver')
        return
    end

    local action, slotId = id:match('^ls_gangs:(%a+):(%d+)$')
    if not action then return end
    TriggerServerEvent('ls_gangs:' .. action, tonumber(slotId))
end)

-- Конвой рвётся сам, без всякого меню.
CreateThread(function()
    while true do
        Wait(1000)
        if escortSlot then
            local me = GetEntityCoords(PlayerPedId())
            if not escortPed or not DoesEntityExist(escortPed)
                or IsPedDeadOrDying(escortPed, true)
                or #(me - GetEntityCoords(escortPed)) > 60.0 then
                dropEscort(true)
            end
        end
    end
end)

-- --- метки районов ----------------------------------------------------------

CreateThread(function()
    if not Config.ShowTerritoryBlips then return end
    for _, gang in ipairs(Config.Gangs) do
        local t = gang.territory
        local blip = AddBlipForRadius(t.x, t.y, t.z, t.radius)
        SetBlipColour(blip, gang.blip or 1)
        SetBlipAlpha(blip, 70)

        local marker = AddBlipForCoord(t.x, t.y, t.z)
        SetBlipSprite(marker, 84)
        SetBlipColour(marker, gang.blip or 1)
        SetBlipScale(marker, 0.75)
        SetBlipAsShortRange(marker, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(('%s — %s'):format(gang.label, t.label))
        EndTextCommandSetBlipName(marker)
    end
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    for id in pairs(peds) do despawn(id) end
    if escortPed and DoesEntityExist(escortPed) then DeleteEntity(escortPed) end
end)
