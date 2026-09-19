-- Client side: shows things, plays animations, reports events.
-- It never decides whether an action is allowed - the server does.

local State = { onDuty = false, perms = {}, cuffed = nil, escorted = false, jail = nil }
local escortOfficer = nil
local jailConfig = nil
local uiOpen = false
local kneeling = false
local escapeBar = nil
local placedProps = {}
local stationBlips = {}
local lastShotReport = 0

local CUFF_DICT = 'mp_arresting'
local CUFF_ANIM = 'idle'
local ARREST_DICT = 'mp_arrest_paired'

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

local function drawText3D(x, y, z, text)
    SetTextScale(0.35, 0.35)
    SetTextFont(4)
    SetTextColour(255, 255, 255, 215)
    SetTextCentre(true)
    SetTextEntry('STRING')
    AddTextComponentString(text)
    SetDrawOrigin(x, y, z, 0)
    DrawText(0.0, 0.0)
    ClearDrawOrigin()
end

local function loadAnim(dict)
    RequestAnimDict(dict)
    local deadline = GetGameTimer() + 3000
    while not HasAnimDictLoaded(dict) and GetGameTimer() < deadline do Wait(10) end
    return HasAnimDictLoaded(dict)
end

local function nearestPlayer()
    local myCoords = GetEntityCoords(PlayerPedId())
    local best, bestDist

    for _, playerId in ipairs(GetActivePlayers()) do
        if playerId ~= PlayerId() then
            local ped = GetPlayerPed(playerId)
            if DoesEntityExist(ped) then
                local dist = #(myCoords - GetEntityCoords(ped))
                if dist < 3.0 and (not bestDist or dist < bestDist) then
                    best, bestDist = playerId, dist
                end
            end
        end
    end
    return best
end

-- --- cuffed: what you cannot do --------------------------------------------

local function cuffAnimation(hold)
    local ped = PlayerPedId()
    if hold then
        if loadAnim(CUFF_DICT) then
            TaskPlayAnim(ped, CUFF_DICT, CUFF_ANIM, 8.0, -8.0, -1, 49, 0.0, false, false, false)
        end
        SetEnableHandcuffs(ped, true)
        DisablePlayerFiring(PlayerId(), true)
    else
        ClearPedTasks(ped)
        SetEnableHandcuffs(ped, false)
    end
end

CreateThread(function()
    while true do
        local wait = 300
        if State.cuffed then
            wait = 0
            local ped = PlayerPedId()

            -- No shooting, no fists, no inventory, no getting behind a wheel.
            DisablePlayerFiring(PlayerId(), true)
            DisableControlAction(0, 24, true)   -- attack
            DisableControlAction(0, 25, true)   -- aim
            DisableControlAction(0, 140, true)  -- melee light
            DisableControlAction(0, 141, true)  -- melee heavy
            DisableControlAction(0, 142, true)  -- melee alt
            DisableControlAction(0, 257, true)  -- attack 2
            DisableControlAction(0, 263, true)  -- melee attack 1
            DisableControlAction(0, 264, true)
            DisableControlAction(0, 45, true)   -- reload
            DisableControlAction(0, 22, true)   -- jump
            DisableControlAction(0, 21, true)   -- sprint
            DisableControlAction(0, 75, true)   -- exit vehicle
            DisableControlAction(0, 23, true)   -- enter vehicle
            DisableControlAction(0, 37, true)   -- weapon wheel

            SetPedCanPlayGestureAnims(ped, false)
            if not IsEntityPlayingAnim(ped, CUFF_DICT, CUFF_ANIM, 3) and not IsPedInAnyVehicle(ped, false) then
                cuffAnimation(true)
            end

            -- A cuffed driver is not a thing.
            if IsPedInAnyVehicle(ped, false) and GetPedInVehicleSeat(GetVehiclePedIsIn(ped, false), -1) == ped then
                TaskLeaveVehicle(ped, GetVehiclePedIsIn(ped, false), 16)
            end
        end
        Wait(wait)
    end
end)

-- ls_inventory asks this before opening.
exports('isBlocked', function()
    return State.cuffed ~= nil
end)

-- --- escape bar -------------------------------------------------------------

CreateThread(function()
    while true do
        local wait = 500
        if escapeBar then
            wait = 0
            local now = GetGameTimer()
            local done = math.min((now - escapeBar.start) / escapeBar.length, 1.0)

            DrawRect(0.5, 0.88, 0.22, 0.028, 0, 0, 0, 170)
            DrawRect(0.39 + (0.22 * done) / 2, 0.88, 0.22 * done, 0.028, 78, 163, 255, 220)

            SetTextScale(0.34, 0.34)
            SetTextFont(4)
            SetTextCentre(true)
            SetTextColour(255, 255, 255, 220)
            SetTextEntry('STRING')
            AddTextComponentString('Вырываешься...')
            DrawText(0.5, 0.872)

            if done >= 1.0 then escapeBar = nil end
        end
        Wait(wait)
    end
end)

-- --- escorting --------------------------------------------------------------

CreateThread(function()
    while true do
        Wait(Config.Escort.checkInterval)
        if escortOfficer then
            local officerPed = GetPlayerPed(GetPlayerFromServerId(escortOfficer))
            local ped = PlayerPedId()

            if not DoesEntityExist(officerPed) then
                DetachEntity(ped, true, false)
                escortOfficer = nil
                TriggerServerEvent('ls_police:escortBroke')
            else
                local dist = #(GetEntityCoords(ped) - GetEntityCoords(officerPed))
                if dist > Config.Escort.breakDistance then
                    DetachEntity(ped, true, false)
                    escortOfficer = nil
                    TriggerServerEvent('ls_police:escortBroke')
                elseif not IsEntityAttachedToEntity(ped, officerPed) and not IsPedInAnyVehicle(ped, false) then
                    AttachEntityToEntity(ped, officerPed, 11816, 0.36, 0.44, 0.0,
                        0.0, 0.0, 0.0, false, false, false, false, 2, true)
                end
            end
        end
    end
end)

-- --- jail -------------------------------------------------------------------

CreateThread(function()
    while true do
        local wait = 1000
        if State.jail and jailConfig then
            local ped = PlayerPedId()
            local coords = GetEntityCoords(ped)
            local centre = vector3(jailConfig.x, jailConfig.y, jailConfig.z)

            if #(coords - centre) > jailConfig.radius then
                SetEntityCoords(ped, jailConfig.x, jailConfig.y, jailConfig.z, false, false, false, false)
                notify(Locale.jailStayInside)
            end

            local left = math.max(0, math.ceil((State.jail.until_ts - os.time()) / 60))
            SetTextScale(0.4, 0.4)
            SetTextFont(4)
            SetTextCentre(true)
            SetTextColour(255, 210, 120, 220)
            SetTextEntry('STRING')
            AddTextComponentString(Locale.jailRemaining:format(left))
            DrawText(0.5, 0.05)
            wait = 0
        end
        Wait(wait)
    end
end)

-- --- crime detection --------------------------------------------------------

CreateThread(function()
    while true do
        Wait(700)
        local ped = PlayerPedId()

        if IsPedShooting(ped) then
            local now = GetGameTimer()
            if now - lastShotReport > 10000 then
                lastShotReport = now
                TriggerServerEvent('ls_police:crime', 'shooting')
            end
        end

        if IsPedJacking(ped) then
            TriggerServerEvent('ls_police:crime', 'vehicleTheft')
        end
    end
end)

AddEventHandler('gameEventTriggered', function(name, args)
    if name ~= 'CEventNetworkEntityDamage' then return end

    local victim, attacker, fatal = args[1], args[2], args[4]
    if attacker ~= PlayerPedId() or victim == PlayerPedId() then return end
    if fatal ~= 1 and fatal ~= true then return end
    if not IsPedAPlayer(victim) then return end

    TriggerServerEvent('ls_police:crime', 'killPlayer')
end)

-- --- stations ---------------------------------------------------------------

CreateThread(function()
    for _, station in ipairs(Config.Stations) do
        local blip = AddBlipForCoord(station.x, station.y, station.z)
        SetBlipSprite(blip, Config.StationBlip.sprite)
        SetBlipColour(blip, Config.StationBlip.colour)
        SetBlipScale(blip, Config.StationBlip.scale)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName('Отделение полиции — ' .. station.label)
        EndTextCommandSetBlipName(blip)
        stationBlips[#stationBlips + 1] = blip
    end

    while true do
        local wait = 700
        if not uiOpen then
            local coords = GetEntityCoords(PlayerPedId())
            for _, station in ipairs(Config.Stations) do
                local dist = #(coords - vector3(station.x, station.y, station.z))
                if dist < 15.0 then
                    wait = 0
                    DrawMarker(1, station.x, station.y, station.z - 0.98, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                        1.2, 1.2, 0.5, 60, 120, 255, 90, false, true, 2, false, nil, nil, false)

                    if dist < Config.StationRadius then
                        drawText3D(station.x, station.y, station.z + 0.3,
                            State.onDuty and '~b~[G]~w~ Снятие со службы' or '~b~[G]~w~ Заступить на службу')
                        if IsControlJustReleased(0, 47) then
                            TriggerServerEvent('ls_police:toggleDuty')
                        end
                    end
                end
            end
        end
        Wait(wait)
    end
end)

-- --- menu -------------------------------------------------------------------

local function openMenu()
    local targetPlayer = nearestPlayer()
    uiOpen = true
    SetNuiFocus(true, true)

    SendNUIMessage({
        action = 'open',
        state = {
            onDuty = State.onDuty,
            rank = State.rankLabel,
            perms = State.perms,
        },
        target = targetPlayer and GetPlayerServerId(targetPlayer) or nil,
        targetName = targetPlayer and GetPlayerName(targetPlayer) or nil,
        props = Config.Props,
        finePresets = Config.Fines.presets,
        jail = { min = Config.Jail.minMinutes, max = Config.Jail.maxMinutes },
    })
end

local function closeMenu()
    uiOpen = false
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })
end

RegisterCommand('mvd', function()
    if State.cuffed then
        notify(Locale.cuffedBlocked)
        return
    end
    if uiOpen then closeMenu() else openMenu() end
end, false)

RegisterKeyMapping('mvd', 'Полиция: меню', 'keyboard', 'F6')

-- --- props ------------------------------------------------------------------

local function placeProp(id)
    local def
    for _, entry in ipairs(Config.Props) do
        if entry.id == id then def = entry break end
    end
    if not def then return end

    if #placedProps >= Config.MaxPropsPerOfficer then
        notify(Locale.propLimit:format(Config.MaxPropsPerOfficer))
        return
    end

    local hash = GetHashKey(def.model)
    RequestModel(hash)
    local deadline = GetGameTimer() + 5000
    while not HasModelLoaded(hash) and GetGameTimer() < deadline do Wait(10) end
    if not HasModelLoaded(hash) then return end

    local ped = PlayerPedId()
    local at = GetOffsetFromEntityInWorldCoords(ped, 0.0, 1.4, -1.0)
    local object = CreateObject(hash, at.x, at.y, at.z, true, true, false)
    PlaceObjectOnGroundProperly(object)
    SetEntityHeading(object, GetEntityHeading(ped))
    FreezeEntityPosition(object, true)
    SetModelAsNoLongerNeeded(hash)

    placedProps[#placedProps + 1] = object
    notify(Locale.propPlaced:format(def.label))
end

local function removeNearestProp()
    local coords = GetEntityCoords(PlayerPedId())
    for index = #placedProps, 1, -1 do
        local object = placedProps[index]
        if DoesEntityExist(object) and #(coords - GetEntityCoords(object)) < 3.0 then
            DeleteObject(object)
            table.remove(placedProps, index)
            notify(Locale.propRemoved)
            return
        end
    end
    notify(Locale.propNone)
end

-- --- NUI callbacks ----------------------------------------------------------

local function relay(endpoint, event)
    RegisterNUICallback(endpoint, function(data, cb)
        closeMenu()
        if data and data.target then
            TriggerServerEvent(event, data.target)
        end
        cb('ok')
    end)
end

RegisterNUICallback('close', function(_, cb) closeMenu() cb('ok') end)

RegisterNUICallback('cuff', function(data, cb)
    closeMenu()
    if data and data.target then
        if loadAnim(ARREST_DICT) then
            TaskPlayAnim(PlayerPedId(), ARREST_DICT, 'cop_garage_arrest', 8.0, -8.0,
                Config.Cuffs.applySeconds * 1000, 49, 0.0, false, false, false)
        end
        Wait(Config.Cuffs.applySeconds * 1000)
        TriggerServerEvent('ls_police:cuff', data.target, data.kind)
    end
    cb('ok')
end)

relay('uncuff', 'ls_police:uncuff')
relay('uncuffKey', 'ls_police:uncuffWithKey')
relay('escort', 'ls_police:escort')
relay('search', 'ls_police:search')
relay('checkDocs', 'ls_police:checkDocs')
relay('taser', 'ls_police:taser')

RegisterNUICallback('vehicleMove', function(data, cb)
    closeMenu()
    if data and data.target then
        TriggerServerEvent('ls_police:vehicleMove', data.target, data.move)
    end
    cb('ok')
end)

RegisterNUICallback('kneel', function(data, cb)
    closeMenu()
    if data and data.target then
        TriggerServerEvent('ls_police:kneel', data.target, data.down == true)
    end
    cb('ok')
end)

RegisterNUICallback('seize', function(data, cb)
    if data and data.target and data.slot then
        TriggerServerEvent('ls_police:seize', data.target, data.slot)
    end
    cb('ok')
end)

RegisterNUICallback('arrest', function(data, cb)
    closeMenu()
    if data and data.target then
        TriggerServerEvent('ls_police:arrest', data.target, data.minutes, data.reason)
    end
    cb('ok')
end)

RegisterNUICallback('wanted', function(data, cb)
    closeMenu()
    if data and data.target then
        TriggerServerEvent('ls_police:addWanted', data.target, data.level, data.reason)
    end
    cb('ok')
end)

RegisterNUICallback('fine', function(data, cb)
    closeMenu()
    if data and data.target then
        TriggerServerEvent('ls_police:fine', data.target, data.amount, data.reason)
    end
    cb('ok')
end)

RegisterNUICallback('prop', function(data, cb)
    closeMenu()
    if data and data.id == 'remove' then removeNearestProp()
    elseif data and data.id then placeProp(data.id) end
    cb('ok')
end)

RegisterNUICallback('impound', function(data, cb)
    closeMenu()
    local ped = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle == 0 then
        vehicle = GetClosestVehicle(GetEntityCoords(ped), 6.0, 0, 71)
    end
    if vehicle == 0 or not DoesEntityExist(vehicle) then
        notify(Locale.impoundNotFound)
        cb('ok')
        return
    end

    local plate = GetVehicleNumberPlateText(vehicle)
    TriggerServerEvent('ls_police:impound', plate and plate:gsub('%s+$', '') or '',
        (data and data.reason) or '')
    SetEntityAsMissionEntity(vehicle, true, true)
    DeleteVehicle(vehicle)
    cb('ok')
end)

RegisterNUICallback('mdtSearch', function(data, cb)
    if data and data.query then TriggerServerEvent('ls_police:mdtSearch', data.query) end
    cb('ok')
end)

RegisterNUICallback('wantedList', function(_, cb)
    TriggerServerEvent('ls_police:wantedList')
    cb('ok')
end)

RegisterNUICallback('clearWanted', function(data, cb)
    if data and data.identifier then TriggerServerEvent('ls_police:clearWanted', data.identifier) end
    cb('ok')
end)

RegisterNUICallback('revokeLicense', function(data, cb)
    if data and data.id then TriggerServerEvent('ls_police:revokeLicense', data.id) end
    cb('ok')
end)

RegisterNUICallback('duty', function(_, cb)
    TriggerServerEvent('ls_police:requestDuty')
    cb('ok')
end)

RegisterNUICallback('escape', function(_, cb)
    TriggerServerEvent('ls_police:tryEscape')
    closeMenu()
    cb('ok')
end)

-- --- server events ----------------------------------------------------------

RegisterNetEvent('ls_police:notify', function(text) notify(text) end)

RegisterNetEvent('ls_police:state', function(state)
    State.onDuty = state.onDuty
    State.perms = state.perms or {}
    State.rankLabel = state.rankLabel
    State.cuffed = state.cuffed
    State.escorted = state.escorted
    State.jail = state.jail
end)

RegisterNetEvent('ls_police:cuffed', function(kind)
    State.cuffed = kind and { kind = kind } or nil
    cuffAnimation(kind ~= nil)
    if not kind then
        escapeBar = nil
        DetachEntity(PlayerPedId(), true, false)
        escortOfficer = nil
    end
end)

RegisterNetEvent('ls_police:escapeStarted', function(seconds)
    escapeBar = { start = GetGameTimer(), length = seconds * 1000 }
end)

RegisterNetEvent('ls_police:escapeFailed', function()
    escapeBar = nil
end)

RegisterNetEvent('ls_police:escort', function(officerServerId)
    escortOfficer = officerServerId
    if not officerServerId then
        DetachEntity(PlayerPedId(), true, false)
    end
end)

RegisterNetEvent('ls_police:vehicleMove', function(move)
    local ped = PlayerPedId()
    if move == 'out' then
        local vehicle = GetVehiclePedIsIn(ped, false)
        if vehicle ~= 0 then
            TaskLeaveVehicle(ped, vehicle, 16)
        end
        return
    end

    local vehicle = GetClosestVehicle(GetEntityCoords(ped), 8.0, 0, 71)
    if vehicle == 0 or not DoesEntityExist(vehicle) then
        notify(Locale.noVehicleNear)
        return
    end

    DetachEntity(ped, true, false)
    for seat = 0, GetVehicleMaxNumberOfPassengers(vehicle) - 1 do
        if IsVehicleSeatFree(vehicle, seat) then
            TaskWarpPedIntoVehicle(ped, vehicle, seat)
            return
        end
    end
end)

RegisterNetEvent('ls_police:kneel', function(down)
    local ped = PlayerPedId()
    kneeling = down

    if down then
        if loadAnim('random@arrests@busted') then
            TaskPlayAnim(ped, 'random@arrests@busted', 'idle_a', 8.0, -8.0, -1, 1, 0.0, false, false, false)
        end
    else
        ClearPedTasks(ped)
        if State.cuffed then cuffAnimation(true) end
    end
end)

RegisterNetEvent('ls_police:tased', function(seconds)
    local ped = PlayerPedId()
    SetPedToRagdoll(ped, seconds * 1000, seconds * 1000, 0, false, false, false)
end)

RegisterNetEvent('ls_police:jail', function(jail, config)
    State.jail = jail
    jailConfig = config

    if jail then
        SetEntityCoords(PlayerPedId(), config.x, config.y, config.z, false, false, false, false)
    elseif config then
        SetEntityCoords(PlayerPedId(), config.releaseX, config.releaseY, config.releaseZ,
            false, false, false, false)
    end
end)

RegisterNetEvent('ls_police:uniform', function(on, uniform)
    if not on or not uniform then
        -- Back into whatever ls_shops has saved for this player.
        TriggerEvent('ls_character:applied')
        return
    end

    local ped = PlayerPedId()
    local isFemale = GetEntityModel(ped) == GetHashKey('mp_f_freemode_01')
    local set = uniform[isFemale and 'female' or 'male']
    if not set then return end

    for component, values in pairs(set) do
        SetPedComponentVariation(ped, tonumber(component), values[1], values[2], 0)
    end
end)

RegisterNetEvent('ls_police:alert', function(info)
    if not State.onDuty then return end
    notify(('~r~ВЫЗОВ~w~: %s — %s'):format(info.name, info.reason))

    if info.coords then
        local blip = AddBlipForCoord(info.coords.x, info.coords.y, info.coords.z)
        SetBlipSprite(blip, 161)
        SetBlipColour(blip, 1)
        SetBlipScale(blip, 1.1)
        SetBlipFlashes(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName('Вызов: ' .. info.reason)
        EndTextCommandSetBlipName(blip)
        SetTimeout(60000, function()
            if DoesBlipExist(blip) then RemoveBlip(blip) end
        end)
    end
end)

RegisterNetEvent('ls_police:searchResult', function(result)
    SendNUIMessage({ action = 'search', result = result })
    if not uiOpen then
        uiOpen = true
        SetNuiFocus(true, true)
    end
end)

RegisterNetEvent('ls_police:docsResult', function(result)
    SendNUIMessage({ action = 'docs', result = result })
    if not uiOpen then
        uiOpen = true
        SetNuiFocus(true, true)
    end
end)

RegisterNetEvent('ls_police:mdtResult', function(result)
    SendNUIMessage({ action = 'mdt', result = result })
end)

RegisterNetEvent('ls_police:wantedList', function(rows)
    SendNUIMessage({ action = 'wantedList', rows = rows })
end)

-- A sheet without the cursor is a trap: it draws over the screen with nothing
-- to click. Whenever one is shown, make sure focus comes with it.
local function ensureFocus()
    if not uiOpen then
        uiOpen = true
        SetNuiFocus(true, true)
    end
end

RegisterNetEvent('ls_police:duty', function(list)
    ensureFocus()
    SendNUIMessage({ action = 'dutyList', list = list })
end)

RegisterNetEvent('ls_police:impoundList', function(rows)
    ensureFocus()
    SendNUIMessage({ action = 'impoundList', rows = rows })
end)

-- Last resort if any menu ever leaves the cursor stuck.
RegisterCommand('unstuck', function()
    closeMenu()
    SetNuiFocus(false, false)
    notify('~g~Интерфейс сброшен')
end, false)

-- --- boot -------------------------------------------------------------------

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(2500)
    TriggerServerEvent('ls_police:ready')
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    SetNuiFocus(false, false)
    DetachEntity(PlayerPedId(), true, false)
    ClearPedTasks(PlayerPedId())
    for _, blip in ipairs(stationBlips) do
        if DoesBlipExist(blip) then RemoveBlip(blip) end
    end
    for _, object in ipairs(placedProps) do
        if DoesEntityExist(object) then DeleteObject(object) end
    end
end)
