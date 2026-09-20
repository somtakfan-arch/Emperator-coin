-- Клиент живой карты: метки, граффити на стенах, лагеря, битые машины.
--
-- Объекты ставятся у того, кто рядом, и убираются, когда он уехал. Метки
-- на карте висят всегда - в этом их смысл.

local state = { hotspots = {}, calls = {}, tags = {}, camps = {}, wrecks = {} }
local blips = {}
local campProps = {}    -- [id] = { объекты }
local wreckCars = {}    -- [id] = машина
local nearTag = nil
local nearCamp = nil
local nearWreck = nil
local nearCall = nil
local watched = {}      -- машины, про которые уже доложили

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

RegisterNetEvent('ls_world:notify', function(text) notify(text) end)

local function here()
    return GetEntityCoords(PlayerPedId())
end

local function loadModel(model)
    local hash = type(model) == 'number' and model or GetHashKey(model)
    if not IsModelInCdimage(hash) then return nil end
    RequestModel(hash)
    local deadline = GetGameTimer() + 5000
    while not HasModelLoaded(hash) and GetGameTimer() < deadline do Wait(10) end
    if not HasModelLoaded(hash) then return nil end
    return hash
end

local function drop(list)
    for _, object in ipairs(list or {}) do
        if DoesEntityExist(object) then DeleteEntity(object) end
    end
end

-- --- карта -------------------------------------------------------------------

local function addBlip(x, y, z, sprite, colour, scale, name, flash, short)
    local blip = AddBlipForCoord(x, y, z or 0.0)
    SetBlipSprite(blip, sprite)
    SetBlipColour(blip, colour)
    SetBlipScale(blip, scale or 0.7)
    if flash then SetBlipFlashes(blip, true) end
    if short then SetBlipAsShortRange(blip, true) end
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName(name)
    EndTextCommandSetBlipName(blip)
    blips[#blips + 1] = blip
    return blip
end

local function rebuildBlips()
    for _, blip in ipairs(blips) do RemoveBlip(blip) end
    blips = {}

    -- Горячие точки мигают: их должно быть видно среди всего остального.
    for _, spot in ipairs(state.hotspots or {}) do
        addBlip(spot.x, spot.y, spot.z, Config.Hotspot.sprite, Config.Hotspot.colour,
            Config.Hotspot.scale, spot.label, Config.Hotspot.flash, false)
    end

    -- Вызовы приходят только тем, кто на смене: сервер их уже отфильтровал.
    for _, call in ipairs(state.calls or {}) do
        addBlip(call.x, call.y, call.z, call.sprite, call.colour, 0.85,
            call.label, true, false)
    end

    for _, camp in ipairs(state.camps or {}) do
        addBlip(camp.x, camp.y, camp.z, Config.Camp.blip.sprite, Config.Camp.blip.colour,
            Config.Camp.blip.scale, ('Лагерь — %s'):format(camp.owner or ''), false, true)
    end

    for _, wreck in ipairs(state.wrecks or {}) do
        addBlip(wreck.x, wreck.y, wreck.z, Config.Wreck.blip.sprite, Config.Wreck.blip.colour,
            Config.Wreck.blip.scale, 'Разбитая машина', false, true)
    end
end

-- --- граффити ----------------------------------------------------------------

-- Декали рисуются каждый кадр, а не ставятся объектом: это краска на
-- стене, у неё нет физики.
CreateThread(function()
    while true do
        local wait = 500
        if Config.Graffiti.enabled and #(state.tags or {}) > 0 then
            local me = here()
            for _, tag in ipairs(state.tags) do
                if #(me - vector3(tag.x, tag.y, tag.z)) < 40.0 then
                    wait = 0
                    DrawDecal(tag.decal or 1000,
                        tag.x, tag.y, tag.z,
                        tag.nx or 0.0, tag.ny or 1.0, tag.nz or 0.0,
                        0.0, 0.0, 1.0,
                        Config.Graffiti.size, Config.Graffiti.size,
                        255, 255, 255, 190, 0.0, false, false, false)
                end
            end
        end
        Wait(wait)
    end
end)

-- Куда смотрит игрок: нужна точка на стене и нормаль, иначе краска ляжет
-- в воздухе или лицом внутрь дома.
local function wallInFront()
    local ped = PlayerPedId()
    local from = GetEntityCoords(ped)
    local to = GetOffsetFromEntityInWorldCoords(ped, 0.0, 2.2, 0.4)

    local ray = StartShapeTestRay(from.x, from.y, from.z + 0.4, to.x, to.y, to.z, 1, ped, 0)
    local _, hit, at, normal = GetShapeTestResult(ray)
    if hit ~= 1 then return nil end
    return at, normal
end

-- --- лагеря ------------------------------------------------------------------

local function buildCamp(camp)
    if campProps[camp.id] then return end
    campProps[camp.id] = {}

    local rad = math.rad(camp.h or 0.0)
    for _, part in ipairs(Config.Camp.props) do
        local dx = part.dx * math.cos(rad) - part.dy * math.sin(rad)
        local dy = part.dx * math.sin(rad) + part.dy * math.cos(rad)
        local x, y = camp.x + dx, camp.y + dy

        local hash = loadModel(part.model)
        if hash then
            local found, groundZ = GetGroundZFor_3dCoord(x, y, camp.z + 20.0, false)
            local object = CreateObject(hash, x, y, found and groundZ or camp.z, false, false, false)
            PlaceObjectOnGroundProperly(object)
            SetEntityHeading(object, camp.h or 0.0)
            FreezeEntityPosition(object, true)
            campProps[camp.id][#campProps[camp.id] + 1] = object
            SetModelAsNoLongerNeeded(hash)
        end
    end
end

-- --- битые машины ------------------------------------------------------------

local function buildWreck(wreck)
    if wreckCars[wreck.id] and DoesEntityExist(wreckCars[wreck.id]) then return end

    local hash = loadModel(wreck.model)
    if not hash or not IsModelAVehicle(hash) then return end

    local car = CreateVehicle(hash, wreck.x, wreck.y, wreck.z, wreck.h or 0.0, false, false)
    SetModelAsNoLongerNeeded(hash)
    if not DoesEntityExist(car) then return end

    SetVehicleOnGroundProperly(car)
    -- Машина именно разбитая: заводиться не должна.
    SetVehicleEngineHealth(car, 0.0)
    SetVehicleBodyHealth(car, 50.0)
    SetVehicleUndriveable(car, true)
    SetVehicleDoorsLocked(car, 2)
    SetEntityAsMissionEntity(car, true, true)
    wreckCars[wreck.id] = car
end

local function inTowTruck()
    local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
    if vehicle == 0 then return false end
    local model = GetEntityModel(vehicle)
    for _, name in ipairs(Config.Wreck.towModels) do
        if model == GetHashKey(name) then return true end
    end
    return false
end

-- Разбил машину - она остаётся стоять. Докладывает тот, кто был за рулём.
CreateThread(function()
    while true do
        Wait(2000)
        if Config.Wreck.enabled then
            local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
            if vehicle ~= 0 then
                watched[vehicle] = true
            end

            for handle in pairs(watched) do
                if not DoesEntityExist(handle) then
                    watched[handle] = nil
                elseif GetVehicleEngineHealth(handle) <= Config.Wreck.deadBelow
                    or IsEntityDead(handle) then
                    local coords = GetEntityCoords(handle)
                    watched[handle] = nil
                    TriggerServerEvent('ls_world:wreck', {
                        model = GetEntityModel(handle),
                        x = coords.x, y = coords.y, z = coords.z,
                        h = GetEntityHeading(handle),
                    })
                end
            end
        end
    end
end)

-- --- состояние ---------------------------------------------------------------

RegisterNetEvent('ls_world:state', function(next)
    state = next or state
    rebuildBlips()

    local liveCamps = {}
    for _, camp in ipairs(state.camps or {}) do liveCamps[camp.id] = true end
    for id, list in pairs(campProps) do
        if not liveCamps[id] then drop(list) campProps[id] = nil end
    end

    local liveWrecks = {}
    for _, wreck in ipairs(state.wrecks or {}) do liveWrecks[wreck.id] = true end
    for id, car in pairs(wreckCars) do
        if not liveWrecks[id] then
            if DoesEntityExist(car) then DeleteEntity(car) end
            wreckCars[id] = nil
        end
    end
end)

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(3000)
    TriggerServerEvent('ls_world:request')

    while true do
        Wait(3000)
        local me = here()

        for _, camp in ipairs(state.camps or {}) do
            if #(me - vector3(camp.x, camp.y, camp.z)) < 150.0 then
                buildCamp(camp)
            elseif campProps[camp.id] then
                drop(campProps[camp.id])
                campProps[camp.id] = nil
            end
        end

        for _, wreck in ipairs(state.wrecks or {}) do
            if #(me - vector3(wreck.x, wreck.y, wreck.z)) < 150.0 then
                buildWreck(wreck)
            elseif wreckCars[wreck.id] then
                if DoesEntityExist(wreckCars[wreck.id]) then DeleteEntity(wreckCars[wreck.id]) end
                wreckCars[wreck.id] = nil
            end
        end
    end
end)

-- У костра затягивает раны: за этим в лагерь и ходят.
CreateThread(function()
    while true do
        Wait(4000)
        if Config.Camp.enabled then
            local me = here()
            for _, camp in ipairs(state.camps or {}) do
                if #(me - vector3(camp.x, camp.y, camp.z)) <= Config.Camp.healRadius then
                    local ped = PlayerPedId()
                    local health = GetEntityHealth(ped)
                    if health > 100 and health < GetEntityMaxHealth(ped) then
                        SetEntityHealth(ped, math.min(health + Config.Camp.healPerTick,
                            GetEntityMaxHealth(ped)))
                    end
                    break
                end
            end
        end
    end
end)

-- --- что рядом ---------------------------------------------------------------

CreateThread(function()
    while true do
        Wait(700)
        local me = here()
        nearTag, nearCamp, nearWreck, nearCall = nil, nil, nil, nil

        for _, tag in ipairs(state.tags or {}) do
            if #(me - vector3(tag.x, tag.y, tag.z)) <= 3.0 then nearTag = tag break end
        end
        for _, camp in ipairs(state.camps or {}) do
            if #(me - vector3(camp.x, camp.y, camp.z)) <= 4.0 then nearCamp = camp break end
        end
        for _, wreck in ipairs(state.wrecks or {}) do
            if #(me - vector3(wreck.x, wreck.y, wreck.z)) <= 12.0 then nearWreck = wreck break end
        end
        for _, call in ipairs(state.calls or {}) do
            if #(me - vector3(call.x, call.y, call.z)) <= 25.0 then nearCall = call break end
        end
    end
end)

local function isOnDuty()
    local ok, duty = pcall(function() return exports.ls_police:isOnDuty() end)
    return ok and duty == true
end

AddEventHandler('ls_interact:collect', function()
    TriggerEvent('ls_interact:offer', {
        id = 'ls_world:call', label = WorldLocale.callPrompt, order = 45,
    })

    if Config.Graffiti.enabled and wallInFront() then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_world:spray', label = WorldLocale.sprayPrompt, order = 35,
        })
    end

    if Config.Camp.enabled then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_world:camp', label = WorldLocale.campPrompt, order = 36,
        })
    end

    if nearCamp then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_world:packCamp', label = WorldLocale.packPrompt, order = 37,
        })
    end

    if nearWreck and inTowTruck() then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_world:tow', label = WorldLocale.towPrompt, order = 20,
        })
    end

    if isOnDuty() then
        if nearTag then
            TriggerEvent('ls_interact:offer', {
                id = 'ls_world:clean', label = WorldLocale.cleanPrompt,
                group = 'police', order = 35,
            })
        end
        if nearCall then
            TriggerEvent('ls_interact:offer', {
                id = 'ls_world:closeCall', label = WorldLocale.closePrompt,
                group = 'police', order = 36,
            })
        end
    end
end)

AddEventHandler('ls_interact:run', function(id)
    if id == 'ls_world:spray' then
        local at, normal = wallInFront()
        if at then
            TriggerServerEvent('ls_world:spray', {
                x = at.x, y = at.y, z = at.z,
                nx = normal.x, ny = normal.y, nz = normal.z,
            })
        end
    elseif id == 'ls_world:camp' then
        TriggerServerEvent('ls_world:camp')
    elseif id == 'ls_world:packCamp' and nearCamp then
        TriggerServerEvent('ls_world:packCamp', nearCamp.id)
    elseif id == 'ls_world:tow' and nearWreck then
        TriggerServerEvent('ls_world:tow', nearWreck.id)
    elseif id == 'ls_world:clean' and nearTag then
        TriggerServerEvent('ls_world:clean', nearTag.id)
    elseif id == 'ls_world:closeCall' and nearCall then
        TriggerServerEvent('ls_world:closeCall', nearCall.id)
    elseif id == 'ls_world:call' then
        TriggerServerEvent('ls_world:report', 'help')
    end
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    for _, blip in ipairs(blips) do RemoveBlip(blip) end
    for _, list in pairs(campProps) do drop(list) end
    for _, car in pairs(wreckCars) do
        if DoesEntityExist(car) then DeleteEntity(car) end
    end
end)

-- ---------------------------------------------------------------------------
-- Клад дня.
--
-- На карте только круг: точное место ищется по загадке с форума и глазами.
-- Копать можно в небольшом радиусе от настоящей точки.
-- ---------------------------------------------------------------------------

local treasure = nil
local treasureArea = nil
local digging = false

local function clearTreasureBlip()
    if treasureArea then RemoveBlip(treasureArea) treasureArea = nil end
end

-- Приходит только круг: центр уже смещён сервером, настоящей точки клиент
-- не знает и знать не должен.
RegisterNetEvent('ls_world:treasure', function(data)
    treasure = data
    clearTreasureBlip()
    if not treasure then return end

    treasureArea = AddBlipForRadius(treasure.cx, treasure.cy, treasure.z, treasure.hint)
    SetBlipColour(treasureArea, Config.Treasure.blip.colour)
    SetBlipAlpha(treasureArea, Config.Treasure.blip.alpha)
end)

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(4000)
    TriggerServerEvent('ls_world:treasureRequest')

    -- Сутки могут смениться, пока игрок на сервере.
    while true do
        Wait(600000)
        TriggerServerEvent('ls_world:treasureRequest')
    end
end)

AddEventHandler('ls_interact:collect', function()
    if not treasure or digging then return end

    -- Копать предлагаем в любом месте круга: где именно зарыто, знает
    -- только сервер, он же и ответит.
    local me = GetEntityCoords(PlayerPedId())
    local flat = #(vector3(me.x, me.y, 0.0) - vector3(treasure.cx, treasure.cy, 0.0))
    if flat > treasure.hint then return end

    TriggerEvent('ls_interact:offer', {
        id = 'ls_world:dig', label = WorldLocale.digPrompt, order = 2,
    })
end)

AddEventHandler('ls_interact:run', function(id)
    if id ~= 'ls_world:dig' or digging then return end

    digging = true
    CreateThread(function()
        local ped = PlayerPedId()
        RequestAnimDict('amb@world_human_gardener_plant@male@base')
        local deadline = GetGameTimer() + 3000
        while not HasAnimDictLoaded('amb@world_human_gardener_plant@male@base')
            and GetGameTimer() < deadline do Wait(20) end
        if HasAnimDictLoaded('amb@world_human_gardener_plant@male@base') then
            TaskPlayAnim(ped, 'amb@world_human_gardener_plant@male@base', 'base',
                8.0, -8.0, Config.Treasure.seconds * 1000, 1, 0, false, false, false)
        end

        Wait(Config.Treasure.seconds * 1000)
        ClearPedTasks(PlayerPedId())
        digging = false
        TriggerServerEvent('ls_world:dig')
    end)
end)
