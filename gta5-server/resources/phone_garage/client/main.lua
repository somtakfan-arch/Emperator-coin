-- Client side: the phone UI, finding a parking spot and putting the car there.

local State = { money = 0, cars = {}, spots = {} }
local phoneOpen = false
local activeVehicle = nil
local activePlate = nil

-- --- helpers ---------------------------------------------------------------

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

-- The wardrobe app is rendered here but owned by ls_shops, so the call is
-- guarded: with ls_shops stopped the phone still works, minus that app.
local function outfits()
    local ok, list = pcall(function() return exports.ls_shops:getOutfits() end)
    if ok and type(list) == 'table' then return list, true end
    return {}, false
end

-- Same story for the backpack: ls_inventory owns it, the phone just sells it.
local function backpack()
    local ok, inv = pcall(function() return exports.ls_inventory:getState() end)
    if ok and type(inv) == 'table' then
        return {
            owned = inv.backpack == true,
            slots = inv.backpackSlots or 18,
            price = inv.backpackPrice or 0,
            available = true,
        }
    end
    return { owned = false, slots = 18, price = 0, available = false }
end

local function pushState()
    local list, available = outfits()
    SendNUIMessage({
        action = 'state',
        money = State.money,
        cars = State.cars,
        catalog = Config.Catalog,
        active = activePlate,
        outfits = list,
        wardrobe = available,
        backpack = backpack(),
    })
end

local function loadModel(model)
    local hash = GetHashKey(model)
    if not IsModelInCdimage(hash) or not IsModelAVehicle(hash) then
        return nil
    end
    RequestModel(hash)
    local deadline = GetGameTimer() + 10000
    while not HasModelLoaded(hash) and GetGameTimer() < deadline do
        Wait(10)
    end
    if not HasModelLoaded(hash) then return nil end
    return hash
end

-- The spots in config.lua are approximations, so drop the car onto whatever the
-- ground actually is. Collision has to be streamed in first or this reads zero.
local function groundAt(x, y, z)
    RequestCollisionAtCoord(x + 0.0, y + 0.0, z + 0.0)
    for _ = 1, 20 do
        if HasCollisionLoadedAroundEntity(PlayerPedId()) then break end
        Wait(20)
    end
    for _, probe in ipairs({ z + 2.0, z + 25.0, z + 100.0, 800.0 }) do
        local found, gz = GetGroundZFor_3dCoord(x + 0.0, y + 0.0, probe + 0.0, false)
        if found and gz and gz > -150.0 then
            return gz
        end
    end
    return z
end

local function spotFree(x, y, z)
    return not IsPositionOccupied(x + 0.0, y + 0.0, z + 0.0, 3.0, false, true, false, false, false, 0, false)
end

local function allSpots()
    local spots = {}
    for _, s in ipairs(Config.ParkingSpots) do spots[#spots + 1] = s end
    for _, s in ipairs(State.spots or {}) do spots[#spots + 1] = s end
    return spots
end

-- Nearest recorded parking spot that nothing is standing on.
local function nearestParking(coords)
    local best, bestDist
    for _, s in ipairs(allSpots()) do
        local dist = #(coords - vector3(s.x + 0.0, s.y + 0.0, s.z + 0.0))
        if dist <= Config.MaxSearchRadius and (not bestDist or dist < bestDist) then
            local z = groundAt(s.x, s.y, s.z)
            if spotFree(s.x, s.y, z) then
                best = { x = s.x + 0.0, y = s.y + 0.0, z = z, h = s.h + 0.0, label = s.label, dist = dist }
                bestDist = dist
            end
        end
    end
    return best
end

-- No parking nearby: put it on the closest piece of road instead. The native's
-- argument list has bitten people before, so a bad call must not kill the spawn.
local function nearestRoad(coords)
    for i = 1, 8 do
        local ok, found, pos, heading = pcall(GetNthClosestVehicleNodeWithHeading,
            coords.x, coords.y, coords.z, i, 1, 3.0, 0)
        if ok and found and pos then
            local z = groundAt(pos.x, pos.y, pos.z)
            if spotFree(pos.x, pos.y, z) then
                return {
                    x = pos.x, y = pos.y, z = z,
                    h = tonumber(heading) or 0.0,
                    label = 'обочина', dist = #(coords - vector3(pos.x, pos.y, z)),
                }
            end
        end
    end
    return nil
end

local function besideYou(ped)
    local at = GetOffsetFromEntityInWorldCoords(ped, 3.0, 4.0, 0.0)
    return {
        x = at.x, y = at.y, z = groundAt(at.x, at.y, at.z),
        h = GetEntityHeading(ped) + 90.0, label = 'рядом с тобой', dist = 5.0,
    }
end

local function despawnActive()
    if activeVehicle and DoesEntityExist(activeVehicle) then
        SetEntityAsMissionEntity(activeVehicle, true, true)
        DeleteVehicle(activeVehicle)
    end
    activeVehicle, activePlate = nil, nil
end

-- --- parking blips ---------------------------------------------------------

local parkingBlips = {}

local function clearParkingBlips()
    for _, blip in ipairs(parkingBlips) do
        if DoesBlipExist(blip) then RemoveBlip(blip) end
    end
    parkingBlips = {}
end

local function rebuildParkingBlips()
    clearParkingBlips()
    for _, spot in ipairs(allSpots()) do
        local blip = AddBlipForCoord(spot.x + 0.0, spot.y + 0.0, spot.z + 0.0)
        SetBlipSprite(blip, 50)          -- garage
        SetBlipColour(blip, 3)           -- blue
        SetBlipScale(blip, 0.7)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName('Парковка: ' .. (spot.label or 'без названия'))
        EndTextCommandSetBlipName(blip)
        parkingBlips[#parkingBlips + 1] = blip
    end
end

-- --- spawning --------------------------------------------------------------

local function deliver(car)
    local ped = PlayerPedId()
    local coords = GetEntityCoords(ped)

    local hash = loadModel(car.model)
    if not hash then
        notify(('~r~Модель ~w~%s~r~ не найдена. Ресурс с этой машиной подключён?'):format(car.model))
        return
    end

    local spot = nearestParking(coords) or nearestRoad(coords) or besideYou(ped)

    despawnActive()

    local veh = CreateVehicle(hash, spot.x, spot.y, spot.z + 0.5, spot.h, true, false)
    if not veh or veh == 0 or not DoesEntityExist(veh) then
        SetModelAsNoLongerNeeded(hash)
        notify('~r~Не удалось создать машину. Попробуй ещё раз.')
        return
    end

    SetVehicleOnGroundProperly(veh)
    SetVehicleNumberPlateText(veh, car.plate)
    SetVehicleHasBeenOwnedByPlayer(veh, true)
    SetVehicleDirtLevel(veh, 0.0)
    SetVehicleNeedsToBeHotwired(veh, false)
    SetVehRadioStation(veh, 'OFF')
    SetEntityAsMissionEntity(veh, true, true)
    SetModelAsNoLongerNeeded(hash)

    activeVehicle, activePlate = veh, car.plate

    -- Drop a waypoint so you can actually find it.
    SetNewWaypoint(spot.x, spot.y)

    notify(('~g~%s~w~ подана: ~b~%s~w~ (%d м)'):format(car.label, spot.label, math.floor(spot.dist or 0)))
    pushState()
end

-- --- phone -----------------------------------------------------------------

local function setPhone(open)
    phoneOpen = open
    SetNuiFocus(open, open)
    SendNUIMessage({ action = open and 'open' or 'close' })
    if open then pushState() end
end

RegisterCommand('phone', function()
    setPhone(not phoneOpen)
end, false)

RegisterKeyMapping('phone', 'Телефон: гараж и автосалон', 'keyboard', Config.OpenKey)

RegisterCommand('parkhere', function()
    local ped = PlayerPedId()
    local veh = GetVehiclePedIsIn(ped, false)
    local coords, heading

    if veh ~= 0 then
        coords, heading = GetEntityCoords(veh), GetEntityHeading(veh)
    else
        coords, heading = GetEntityCoords(ped), GetEntityHeading(ped)
    end

    TriggerServerEvent('phone_garage:addSpot', {
        x = coords.x, y = coords.y, z = coords.z, h = heading,
        label = GetLabelText(GetNameOfZone(coords.x, coords.y, coords.z)),
    })
end, false)

RegisterCommand('park', function()
    if activeVehicle and DoesEntityExist(activeVehicle) then
        despawnActive()
        notify('~g~Машина убрана в гараж')
        pushState()
    else
        notify('~r~Сейчас нет вызванной машины')
    end
end, false)

-- --- NUI callbacks ---------------------------------------------------------

RegisterNUICallback('close', function(_, cb)
    setPhone(false)
    cb('ok')
end)

RegisterNUICallback('buy', function(data, cb)
    if data and data.model then
        TriggerServerEvent('phone_garage:buy', data.model)
    end
    cb('ok')
end)

RegisterNUICallback('sell', function(data, cb)
    if data and data.plate then
        TriggerServerEvent('phone_garage:sell', data.plate)
    end
    cb('ok')
end)

RegisterNUICallback('call', function(data, cb)
    if data and data.plate then
        TriggerServerEvent('phone_garage:call', data.plate)
        setPhone(false)
    end
    cb('ok')
end)

RegisterNUICallback('store', function(_, cb)
    if activeVehicle and DoesEntityExist(activeVehicle) then
        despawnActive()
        notify('~g~Машина убрана в гараж')
        pushState()
    else
        notify('~r~Сейчас нет вызванной машины')
    end
    cb('ok')
end)

RegisterNUICallback('wardrobeWear', function(data, cb)
    if data and data.id then
        pcall(function() exports.ls_shops:wearOutfit(data.id) end)
    end
    cb('ok')
end)

RegisterNUICallback('wardrobeDelete', function(data, cb)
    if data and data.id then
        pcall(function() exports.ls_shops:deleteOutfit(data.id) end)
    end
    cb('ok')
end)

RegisterNUICallback('buyBackpack', function(_, cb)
    pcall(function() exports.ls_inventory:buyBackpack() end)
    cb('ok')
end)

RegisterNUICallback('wardrobeSave', function(data, cb)
    pcall(function()
        exports.ls_shops:saveCurrentOutfit(data and data.name or '')
    end)
    cb('ok')
end)

-- --- server events ---------------------------------------------------------

RegisterNetEvent('phone_garage:sync', function(data)
    State.money = data.money or 0
    State.cars = data.cars or {}
    State.spots = data.spots or {}
    pushState()
    rebuildParkingBlips()
end)

RegisterNetEvent('phone_garage:notify', function(text)
    notify(text)
end)

-- Fired by ls_shops and ls_inventory when something the phone shows changed.
AddEventHandler('phone_garage:refresh', function()
    pushState()
end)

RegisterNetEvent('phone_garage:callApproved', function(car)
    CreateThread(function() deliver(car) end)
end)

RegisterNetEvent('phone_garage:despawn', function(plate)
    if activePlate == plate then
        despawnActive()
        pushState()
    end
end)

-- --- exports ---------------------------------------------------------------
-- ls_shops reads the balance from here to show it in its own UI.

exports('getMoney', function()
    return State.money
end)

-- --- boot ------------------------------------------------------------------

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(1000)
    TriggerServerEvent('phone_garage:requestSync')
end)

AddEventHandler('onResourceStop', function(name)
    if name == GetCurrentResourceName() then
        SetNuiFocus(false, false)
        despawnActive()
        clearParkingBlips()
    end
end)
