-- Клиент: метки, подсказки [E], полоса прогресса и кусты конопли.
-- Ничего не решает - только показывает и докладывает.

local state = { dealers = {}, market = 1, plants = {}, turf = {}, van = nil, cooldowns = {} }
local running = nil     -- { endsAt, label, at, finish }
local bushes = {}       -- [id плантации] = объект
local blips = {}
local vanBlip = nil
local vanVehicle = nil

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

local function drawText3D(x, y, z, text)
    SetDrawOrigin(x, y, z, 0)
    SetTextFont(4)
    SetTextScale(0.35, 0.35)
    SetTextCentre(true)
    SetTextOutline()
    BeginTextCommandDisplayText('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayText(0.0, 0.0)
    ClearDrawOrigin()
end

local function here()
    return GetEntityCoords(PlayerPedId())
end

local function dist(a, b)
    return #(a - vector3(b.x, b.y, b.z))
end

-- --- метки -------------------------------------------------------------------

local function addBlip(point, cfg, name)
    local blip = AddBlipForCoord(point.x, point.y, point.z)
    SetBlipSprite(blip, cfg.sprite or 1)
    SetBlipColour(blip, cfg.colour or 0)
    SetBlipScale(blip, 0.75)
    SetBlipAsShortRange(blip, true)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName(name)
    EndTextCommandSetBlipName(blip)
    blips[#blips + 1] = blip
    return blip
end

local function rebuildBlips()
    for _, blip in ipairs(blips) do RemoveBlip(blip) end
    blips = {}

    for key, job in pairs(Config.Jobs) do
        if job.blip then
            for _, point in ipairs(job.points) do
                addBlip(point, job.blip, ('%s — %s'):format(job.blip.label, point.label or ''))
            end
        end
    end

    for _, point in ipairs(Config.ChopShop.points) do
        addBlip(point, Config.ChopShop.blip, Config.ChopShop.blip.label)
    end

    -- Барыги и рынок переезжают каждый день, поэтому метки строятся заново
    -- при каждом обновлении состояния, а не один раз при старте.
    for index, point in ipairs(Config.Dealers.points) do
        if state.dealers[index] or state.dealers[tostring(index)] then
            addBlip(point, { sprite = 378, colour = 2 }, 'Барыга')
        end
    end

    local market = Config.BlackMarket.points[state.market]
    if market then
        addBlip(market, { sprite = 110, colour = 4 }, Config.BlackMarket.label)
    end
end

-- --- полоса прогресса --------------------------------------------------------

local function runProgress(job)
    running = job
    local ped = PlayerPedId()

    CreateThread(function()
        local total = job.seconds * 1000
        local started = GetGameTimer()

        while running do
            local passed = GetGameTimer() - started
            if passed >= total then break end

            -- Отошёл или умер - дело сорвалось. Сервер об этом узнает и
            -- просто не получит "закончил".
            if IsEntityDead(PlayerPedId())
                or dist(here(), job) > Config.LeashDistance then
                running = nil
                TriggerServerEvent('ls_crime:abort')
                notify(CrimeLocale.moved)
                return
            end

            local fraction = passed / total
            DrawRect(0.5, 0.88, 0.24, 0.032, 0, 0, 0, 170)
            DrawRect(0.38 + 0.12 * fraction, 0.88, 0.24 * fraction, 0.024, 90, 160, 255, 220)

            SetTextFont(4)
            SetTextScale(0.36, 0.36)
            SetTextCentre(true)
            SetTextOutline()
            BeginTextCommandDisplayText('STRING')
            AddTextComponentSubstringPlayerName(
                ('%s  %d%%'):format(job.label, math.floor(fraction * 100)))
            EndTextCommandDisplayText(0.5, 0.855)

            Wait(0)
        end

        if not running then return end
        running = nil
        TriggerServerEvent(job.finish)
    end)
end

RegisterNetEvent('ls_crime:notify', function(text) notify(text) end)

RegisterNetEvent('ls_crime:run', function(job)
    if running then return end
    job.finish = job.finish or 'ls_crime:finishJob'
    runProgress(job)
end)

-- --- состояние мира ----------------------------------------------------------

RegisterNetEvent('ls_crime:state', function(next)
    state = next or state
    state.dealers = state.dealers or {}
    state.plants = state.plants or {}
    state.turf = state.turf or {}
    rebuildBlips()
end)

-- --- кусты -------------------------------------------------------------------

local function plantModel(plant)
    local ripe = (plant.ripeAt or 0) <= os.time()
    return ripe and Config.Weed.model or Config.Weed.sproutModel
end

CreateThread(function()
    while true do
        Wait(3000)
        local me = here()
        local seen = {}

        for _, plant in ipairs(state.plants) do
            seen[plant.id] = true
            local far = #(me - vector3(plant.x, plant.y, plant.z)) > 120.0

            if far then
                if bushes[plant.id] and DoesEntityExist(bushes[plant.id]) then
                    DeleteEntity(bushes[plant.id])
                end
                bushes[plant.id] = nil
            elseif not bushes[plant.id] or not DoesEntityExist(bushes[plant.id]) then
                local hash = GetHashKey(plantModel(plant))
                if IsModelInCdimage(hash) then
                    RequestModel(hash)
                    local deadline = GetGameTimer() + 5000
                    while not HasModelLoaded(hash) and GetGameTimer() < deadline do Wait(20) end
                    if HasModelLoaded(hash) then
                        local object = CreateObject(hash, plant.x, plant.y, plant.z - 1.0,
                            false, false, false)
                        PlaceObjectOnGroundProperly(object)
                        FreezeEntityPosition(object, true)
                        bushes[plant.id] = object
                        SetModelAsNoLongerNeeded(hash)
                    end
                end
            end
        end

        -- Куст собрали или он сгнил - объект должен уйти следом.
        for id, object in pairs(bushes) do
            if not seen[id] then
                if DoesEntityExist(object) then DeleteEntity(object) end
                bushes[id] = nil
            end
        end
    end
end)

-- --- инкассаторы -------------------------------------------------------------

CreateThread(function()
    while true do
        Wait(4000)

        if state.van and state.van.point then
            local spot = Config.Van.points[state.van.point]
            if spot then
                if not vanBlip then
                    vanBlip = AddBlipForCoord(spot.x, spot.y, spot.z)
                    SetBlipSprite(vanBlip, Config.Van.blip.sprite)
                    SetBlipColour(vanBlip, Config.Van.blip.colour)
                    SetBlipScale(vanBlip, 1.0)
                    BeginTextCommandSetBlipName('STRING')
                    AddTextComponentSubstringPlayerName(Config.Van.blip.label)
                    EndTextCommandSetBlipName(vanBlip)
                end

                -- Сама машина ставится локально у того, кто рядом: серверная
                -- тут не нужна, вскрытие всё равно проверяется по координатам.
                if #(here() - vector3(spot.x, spot.y, spot.z)) < 120.0 then
                    if not vanVehicle or not DoesEntityExist(vanVehicle) then
                        local hash = GetHashKey(Config.Van.model)
                        if IsModelInCdimage(hash) and IsModelAVehicle(hash) then
                            RequestModel(hash)
                            local deadline = GetGameTimer() + 8000
                            while not HasModelLoaded(hash) and GetGameTimer() < deadline do Wait(20) end
                            if HasModelLoaded(hash) then
                                vanVehicle = CreateVehicle(hash, spot.x, spot.y, spot.z,
                                    spot.h or 0.0, false, false)
                                SetVehicleOnGroundProperly(vanVehicle)
                                SetVehicleDoorsLocked(vanVehicle, 4)
                                SetEntityAsMissionEntity(vanVehicle, true, true)
                                SetModelAsNoLongerNeeded(hash)
                            end
                        end
                    end
                elseif vanVehicle and DoesEntityExist(vanVehicle) then
                    DeleteEntity(vanVehicle)
                    vanVehicle = nil
                end
            end
        else
            if vanBlip then RemoveBlip(vanBlip) vanBlip = nil end
            if vanVehicle and DoesEntityExist(vanVehicle) then
                DeleteEntity(vanVehicle)
                vanVehicle = nil
            end
        end
    end
end)

-- --- банкоматы ---------------------------------------------------------------

local atmHashes = {}
for _, model in ipairs(Config.Atm.models) do
    atmHashes[#atmHashes + 1] = GetHashKey(model)
end

local function closestAtm(coords)
    for _, hash in ipairs(atmHashes) do
        local object = GetClosestObjectOfType(coords.x, coords.y, coords.z,
            Config.Interact + 0.6, hash, false, false, false)
        if object ~= 0 and DoesEntityExist(object) then
            return object
        end
    end
    return nil
end

-- --- главный цикл взаимодействия --------------------------------------------

local function nearestOf(points, me, radius)
    local bestIndex, bestDist
    for index, point in ipairs(points) do
        local d = #(me - vector3(point.x, point.y, point.z))
        if d <= (radius or Config.Interact) and (not bestDist or d < bestDist) then
            bestIndex, bestDist = index, d
        end
    end
    return bestIndex
end

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(2500)
    TriggerServerEvent('ls_crime:ready')

    while true do
        local wait = 400
        if not running and not IsEntityDead(PlayerPedId()) then
            local me = here()
            local acted = false

            -- дела по точкам
            for key, job in pairs(Config.Jobs) do
                local index = nearestOf(job.points, me)
                if index then
                    wait = 0
                    acted = true
                    local point = job.points[index]
                    drawText3D(point.x, point.y, point.z + 0.9,
                        CrimeLocale.prompt:format(job.label))
                    if IsControlJustReleased(0, 38) then
                        TriggerServerEvent('ls_crime:startJob', key, index)
                        Wait(500)
                    end
                    break
                end
            end

            -- барыги
            if not acted then
                local index = nearestOf(Config.Dealers.points, me)
                if index and (state.dealers[index] or state.dealers[tostring(index)]) then
                    wait = 0
                    acted = true
                    local point = Config.Dealers.points[index]
                    drawText3D(point.x, point.y, point.z + 0.9, CrimeLocale.promptSell)
                    if IsControlJustReleased(0, 38) then
                        TriggerServerEvent('ls_crime:sell', index)
                        Wait(500)
                    end
                end
            end

            -- чёрный рынок
            if not acted then
                local market = Config.BlackMarket.points[state.market]
                if market and #(me - vector3(market.x, market.y, market.z)) <= Config.Interact then
                    wait = 0
                    acted = true
                    drawText3D(market.x, market.y, market.z + 0.9, CrimeLocale.promptMarket)
                    if IsControlJustReleased(0, 38) then
                        TriggerServerEvent('ls_crime:openMarket')
                        Wait(500)
                    end
                end
            end

            -- разбор: нужен транспорт под игроком
            if not acted then
                local index = nearestOf(Config.ChopShop.points, me, 8.0)
                if index then
                    wait = 0
                    acted = true
                    local point = Config.ChopShop.points[index]
                    local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
                    drawText3D(point.x, point.y, point.z + 0.9,
                        vehicle ~= 0 and CrimeLocale.promptChop or '~y~Загони машину сюда')
                    if vehicle ~= 0 and IsControlJustReleased(0, 38) then
                        TriggerServerEvent('ls_crime:chop', index,
                            GetVehicleNumberPlateText(vehicle), GetVehicleClass(vehicle))
                        Wait(700)
                    end
                end
            end

            -- инкассаторы
            if not acted and state.van and state.van.point then
                local spot = Config.Van.points[state.van.point]
                if spot and #(me - vector3(spot.x, spot.y, spot.z)) <= 5.0 then
                    wait = 0
                    acted = true
                    drawText3D(spot.x, spot.y, spot.z + 1.2, '~b~[E]~w~ Вскрыть инкассаторов')
                    if IsControlJustReleased(0, 38) then
                        TriggerServerEvent('ls_crime:startVan')
                        Wait(500)
                    end
                end
            end

            -- кусты
            if not acted then
                for _, plant in ipairs(state.plants) do
                    if #(me - vector3(plant.x, plant.y, plant.z)) <= 2.0 then
                        wait = 0
                        acted = true
                        local left = (plant.ripeAt or 0) - os.time()
                        drawText3D(plant.x, plant.y, plant.z + 0.8,
                            left > 0
                                and ('~y~Созреет через %d мин'):format(math.ceil(left / 60))
                                or CrimeLocale.promptHarvest)
                        if left <= 0 and IsControlJustReleased(0, 38) then
                            TriggerServerEvent('ls_crime:harvest', plant.id)
                            Wait(500)
                        end
                        break
                    end
                end
            end

            -- банкоматы
            if not acted then
                local atm = closestAtm(me)
                if atm then
                    local coords = GetEntityCoords(atm)
                    wait = 0
                    acted = true
                    drawText3D(coords.x, coords.y, coords.z + 0.9, CrimeLocale.promptAtm)
                    if IsControlJustReleased(0, 38) then
                        TriggerServerEvent('ls_crime:startAtm',
                            { x = coords.x, y = coords.y, z = coords.z })
                        Wait(500)
                    end
                end
            end
        end
        Wait(wait)
    end
end)

-- --- захват территорий -------------------------------------------------------
-- Отдельным потоком: районы большие, проверять их каждый кадр незачем.

local territories = {}

CreateThread(function()
    Wait(4000)
    local ok, list = pcall(function() return exports.ls_gangs:getTerritories() end)
    territories = (ok and type(list) == 'table') and list or {}
end)

CreateThread(function()
    local holding, heldFor = nil, 0

    while true do
        Wait(1000)

        local busy = running or IsEntityDead(PlayerPedId())
        local inside = nil

        if not busy then
            local me = here()
            for _, t in ipairs(territories) do
                if #(me - vector3(t.x, t.y, t.z)) <= (t.radius or 120.0) then
                    inside = t
                    break
                end
            end
        end

        if not inside then
            holding, heldFor = nil, 0
        else
            if holding ~= inside.key then holding, heldFor = inside.key, 0 end
            heldFor = heldFor + 1

            local left = Config.Turf.captureSeconds - heldFor
            if left > 0 then
                local owner = state.turf[inside.key]
                BeginTextCommandDisplayHelp('STRING')
                AddTextComponentSubstringPlayerName(
                    ('%s — %s. Держись ещё %d с'):format(
                        inside.label or inside.key,
                        owner and ('владелец: ' .. (owner.name or '?')) or 'ничей',
                        left))
                EndTextCommandDisplayHelp(0, false, true, -1)
            else
                heldFor = 0
                TriggerServerEvent('ls_crime:claimTurf', inside.key)
            end
        end
    end
end)

-- --- окно чёрного рынка ------------------------------------------------------

local marketOpen = false

local function closeMarket()
    if not marketOpen then return end
    marketOpen = false
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })
end

RegisterNetEvent('ls_crime:marketOpen', function(data)
    marketOpen = true
    SetNuiFocus(true, true)
    data.action = 'open'
    SendNUIMessage(data)
end)

RegisterNUICallback('close', function(_, cb) closeMarket() cb('ok') end)

RegisterNUICallback('buy', function(data, cb)
    if data and data.item then TriggerServerEvent('ls_crime:market', 'buy', data.item) end
    -- Перерисовываем: изменились и деньги, и остатки.
    Wait(250)
    if marketOpen then TriggerServerEvent('ls_crime:openMarket') end
    cb('ok')
end)

RegisterNUICallback('sell', function(data, cb)
    if data and data.item then TriggerServerEvent('ls_crime:market', 'sell', data.item) end
    Wait(250)
    if marketOpen then TriggerServerEvent('ls_crime:openMarket') end
    cb('ok')
end)

RegisterNUICallback('collect', function(_, cb)
    TriggerServerEvent('ls_crime:market', 'collect')
    Wait(250)
    if marketOpen then TriggerServerEvent('ls_crime:openMarket') end
    cb('ok')
end)

-- Если окно когда-нибудь залипнет, курсор должен возвращаться.
RegisterCommand('crimeunstuck', function()
    marketOpen = false
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })
end, false)

-- --- уборка ------------------------------------------------------------------

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    SetNuiFocus(false, false)
    for _, blip in ipairs(blips) do RemoveBlip(blip) end
    if vanBlip then RemoveBlip(vanBlip) end
    for _, object in pairs(bushes) do
        if DoesEntityExist(object) then DeleteEntity(object) end
    end
    if vanVehicle and DoesEntityExist(vanVehicle) then DeleteEntity(vanVehicle) end
end)
