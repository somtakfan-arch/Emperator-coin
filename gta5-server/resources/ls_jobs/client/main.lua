-- Работы на стороне клиента: метки, рабочая машина, точки маршрута,
-- пассажир такси и ремонт у механика.
--
-- Машина ставится не в момент найма, а когда игрок доехал до депо: депо на
-- другом конце карты, и брошенная там фура мешала бы всем остальным.
-- Тот же приём, что у фуры с оружием в ls_armoury.

local shift = nil           -- что прислал сервер: { job, stop, at, left, earned }
local workVeh = nil
local stopBlip = nil
local depotBlip = nil
local passenger = nil
local fixing = false
local nearCentre = nil
local nearStop = false
local dutyBlips = {}        -- [serverId] = blip

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

RegisterNetEvent('ls_jobs:notify', function(text) notify(text) end)

local function money(amount)
    local text = tostring(math.floor(amount))
    return (text:reverse():gsub('(%d%d%d)', '%1 '):reverse():gsub('^%s+', ''))
end

local function jobDef()
    return shift and Config.Jobs[shift.job] or nil
end

-- --- метки центров занятости --------------------------------------------------

CreateThread(function()
    for _, centre in ipairs(Config.Centres) do
        local blip = AddBlipForCoord(centre.x, centre.y, centre.z)
        SetBlipSprite(blip, Config.CentreBlip.sprite)
        SetBlipColour(blip, Config.CentreBlip.colour)
        SetBlipScale(blip, Config.CentreBlip.scale)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(('%s — %s'):format(JobsLocale.centre, centre.label))
        EndTextCommandSetBlipName(blip)
    end
end)

-- --- метки маршрута ------------------------------------------------------------

local function clearStopBlip()
    if stopBlip then RemoveBlip(stopBlip) stopBlip = nil end
end

local function clearDepotBlip()
    if depotBlip then RemoveBlip(depotBlip) depotBlip = nil end
end

local function setStopBlip()
    clearStopBlip()
    local job = jobDef()
    if not shift or not shift.stop or not job then return end

    local point = shift.stop
    stopBlip = AddBlipForCoord(point.x, point.y, point.z)
    SetBlipSprite(stopBlip, job.blip.sprite)
    SetBlipColour(stopBlip, job.blip.colour)
    SetBlipScale(stopBlip, 0.9)
    SetBlipRoute(stopBlip, true)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName(point.label or job.label)
    EndTextCommandSetBlipName(stopBlip)
end

local function setDepotBlip()
    clearDepotBlip()
    local job = jobDef()
    if not job or not job.depot then return end

    depotBlip = AddBlipForCoord(job.depot.x, job.depot.y, job.depot.z)
    SetBlipSprite(depotBlip, 50)
    SetBlipColour(depotBlip, 3)
    SetBlipScale(depotBlip, 0.8)
    SetBlipAsShortRange(depotBlip, true)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName('Депо — ' .. (job.depot.label or ''))
    EndTextCommandSetBlipName(depotBlip)
end

-- --- пассажир такси ------------------------------------------------------------

local function dropPassenger()
    if passenger and DoesEntityExist(passenger) then
        -- Машина могла уже исчезнуть: тогда просто убираем пассажира, а не
        -- высаживаем его из нулевой сущности.
        local veh = GetVehiclePedIsIn(passenger, false)
        if veh ~= 0 then TaskLeaveVehicle(passenger, veh, 0) end
        local ped = passenger
        -- Даём ему выйти, потом убираем: труп, растворяющийся в салоне,
        -- выглядит хуже, чем человек, ушедший в сторону.
        SetTimeout(6000, function()
            if DoesEntityExist(ped) then DeleteEntity(ped) end
        end)
    end
    passenger = nil
end

local function takePassenger()
    if passenger and DoesEntityExist(passenger) then return end

    local veh = GetVehiclePedIsIn(PlayerPedId(), false)
    if veh == 0 then return end

    local model = GetHashKey('a_m_y_business_01')
    RequestModel(model)
    local deadline = GetGameTimer() + 5000
    while not HasModelLoaded(model) and GetGameTimer() < deadline do Wait(20) end
    if not HasModelLoaded(model) then return end

    local coords = GetEntityCoords(veh)
    passenger = CreatePed(4, model, coords.x, coords.y, coords.z, 0.0, false, false)
    SetEntityAsMissionEntity(passenger, true, true)
    SetBlockingOfNonTemporaryEvents(passenger, true)
    -- Именно варп, а не "дойди и сядь": пешком он застрянет о бордюр, и
    -- игрок будет стоять и ждать, пока NPC обойдёт машину.
    TaskWarpPedIntoVehicle(passenger, veh, 2)
    SetModelAsNoLongerNeeded(model)
end

-- --- рабочая машина ------------------------------------------------------------

local function clearWorkVeh()
    if workVeh and DoesEntityExist(workVeh) then DeleteEntity(workVeh) end
    workVeh = nil
end

CreateThread(function()
    while true do
        Wait(3000)
        local job = jobDef()

        if job and job.vehicle and job.depot then
            local me = GetEntityCoords(PlayerPedId())
            local near = #(me - vector3(job.depot.x, job.depot.y, job.depot.z)) < 100.0

            if near and (not workVeh or not DoesEntityExist(workVeh)) then
                local hash = GetHashKey(job.vehicle)
                if IsModelInCdimage(hash) and IsModelAVehicle(hash) then
                    RequestModel(hash)
                    local deadline = GetGameTimer() + 8000
                    while not HasModelLoaded(hash) and GetGameTimer() < deadline do Wait(20) end
                    if HasModelLoaded(hash) then
                        workVeh = CreateVehicle(hash, job.depot.x, job.depot.y, job.depot.z,
                            job.depot.h or 0.0, true, false)
                        SetVehicleOnGroundProperly(workVeh)
                        SetEntityAsMissionEntity(workVeh, true, true)
                        SetVehicleHasBeenOwnedByPlayer(workVeh, true)
                        SetVehicleNumberPlateText(workVeh, 'JOB' .. math.random(100, 999))
                        SetModelAsNoLongerNeeded(hash)
                        clearDepotBlip()
                    end
                end
            end
        elseif workVeh then
            -- Смена кончилась - машина не наша.
            if not IsPedInVehicle(PlayerPedId(), workVeh, false) then clearWorkVeh() end
        end
    end
end)

-- --- состояние смены -----------------------------------------------------------

RegisterNetEvent('ls_jobs:shift', function(data)
    local hadTaxiFare = shift and shift.stop and shift.stop.stage == 'drop'
    shift = data

    if not shift then
        clearStopBlip()
        clearDepotBlip()
        dropPassenger()
        clearWorkVeh()
        return
    end

    setStopBlip()
    if not workVeh or not DoesEntityExist(workVeh) then setDepotBlip() end

    -- Такси: пассажир появляется ровно тогда, когда следующая точка -
    -- высадка, и уходит, когда она сменилась на новую посадку.
    if shift.job == 'taxi' then
        if shift.stop and shift.stop.stage == 'drop' then
            takePassenger()
        elseif hadTaxiFare then
            dropPassenger()
        end
    end
end)

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(2000)
    TriggerServerEvent('ls_jobs:request')
end)

-- --- где мы стоим --------------------------------------------------------------

CreateThread(function()
    while true do
        Wait(600)
        local me = GetEntityCoords(PlayerPedId())

        nearCentre = nil
        for _, centre in ipairs(Config.Centres) do
            if #(me - vector3(centre.x, centre.y, centre.z)) <= Config.Interact then
                nearCentre = centre
                break
            end
        end

        nearStop = false
        if shift and shift.stop then
            nearStop = #(me - vector3(shift.stop.x, shift.stop.y, shift.stop.z)) <= Config.LegRadius
        end
    end
end)

-- Маркер на земле: без него точка "где-то здесь" превращается в поиск
-- вслепую по миникарте.
CreateThread(function()
    while true do
        local wait = 500
        if shift and shift.stop then
            local me = GetEntityCoords(PlayerPedId())
            local point = vector3(shift.stop.x, shift.stop.y, shift.stop.z)
            if #(me - point) < 60.0 then
                wait = 0
                local job = jobDef()
                DrawMarker(1, point.x, point.y, point.z - 1.0, 0, 0, 0, 0, 0, 0,
                    3.0, 3.0, 1.2,
                    (job and job.blip.colour == 2) and 60 or 120, 180, 255, 110,
                    false, false, 2, false, nil, nil, false)
            end
        end
        Wait(wait)
    end
end)

-- --- меню E --------------------------------------------------------------------

local function stageLabel(stage)
    if stage == 'pick' then return JobsLocale.pickUp end
    if stage == 'drop' then
        if shift and shift.job == 'taxi' then return JobsLocale.dropFare end
        if shift and shift.job == 'garbage' then return JobsLocale.emptyBin end
        return JobsLocale.dropOff
    end
    return JobsLocale.busStop
end

-- Машина рядом, которую механику есть смысл чинить. Целые отсеиваем здесь,
-- а не при нажатии: предлагать пункт, который тут же отвечает "и так
-- целая", - это не подсказка, а обман.
local function brokenNearby()
    local limit = Config.Jobs.mechanic.fixBelow
    local me = GetEntityCoords(PlayerPedId())
    local best, bestDist
    for _, veh in ipairs(GetGamePool('CVehicle')) do
        local hurt = GetEntityHealth(veh) < limit
            or GetVehicleEngineHealth(veh) < limit
            or GetVehicleBodyHealth(veh) < limit
        if hurt then
            local d = #(me - GetEntityCoords(veh))
            if d <= 5.0 and (not bestDist or d < bestDist) then best, bestDist = veh, d end
        end
    end
    return best
end

AddEventHandler('ls_interact:collect', function()
    if nearCentre then
        if shift then
            TriggerEvent('ls_interact:offer', {
                id = 'ls_jobs:quit', label = JobsLocale.quitPrompt, order = 5,
            })
        else
            TriggerEvent('ls_interact:offer', {
                id = 'ls_jobs:hire', label = JobsLocale.hirePrompt,
                submenu = 'jobs', order = 5,
            })
            for _, key in ipairs(Config.Order) do
                local job = Config.Jobs[key]
                if job then
                    TriggerEvent('ls_interact:offer', {
                        id = 'ls_jobs:hire:' .. key, group = 'jobs',
                        label = JobsLocale.jobLine:format(job.label, money(job.pay)),
                    })
                end
            end
        end
    end

    if shift and nearStop and shift.stop then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_jobs:leg', label = stageLabel(shift.stop.stage), order = 2,
        })
    end

    if shift and shift.job == 'mechanic' and not fixing then
        local veh = brokenNearby()
        if veh then
            TriggerEvent('ls_interact:offer', {
                id = 'ls_jobs:fix', label = JobsLocale.fixPrompt, order = 3,
            })
        end
    end
end)

local function repairNearby()
    local veh = brokenNearby()
    if not veh then notify(JobsLocale.fixNoVeh) return end

    fixing = true
    local seconds = Config.Jobs.mechanic.seconds
    local ped = PlayerPedId()

    RequestAnimDict('mini@repair')
    local deadline = GetGameTimer() + 3000
    while not HasAnimDictLoaded('mini@repair') and GetGameTimer() < deadline do Wait(20) end
    if HasAnimDictLoaded('mini@repair') then
        TaskPlayAnim(ped, 'mini@repair', 'fixing_a_ped', 8.0, -8.0, seconds * 1000, 1, 0, false, false, false)
    end

    -- Машина чужая: без контроля над сущностью ремонт не применится.
    local tries = 0
    while not NetworkHasControlOfEntity(veh) and tries < 40 do
        NetworkRequestControlOfEntity(veh)
        tries = tries + 1
        Wait(50)
    end

    Wait(seconds * 1000)
    ClearPedTasks(ped)

    if DoesEntityExist(veh) then
        SetVehicleFixed(veh)
        SetVehicleDeformationFixed(veh)
        SetVehicleUndriveable(veh, false)
        SetVehicleEngineHealth(veh, 1000.0)
        SetVehicleBodyHealth(veh, 1000.0)
        TriggerServerEvent('ls_jobs:fixed')
    end

    fixing = false
end

AddEventHandler('ls_interact:run', function(id)
    if id == 'ls_jobs:quit' then
        TriggerServerEvent('ls_jobs:quit')
    elseif id == 'ls_jobs:leg' then
        TriggerServerEvent('ls_jobs:leg')
    elseif id == 'ls_jobs:fix' then
        if fixing then notify(JobsLocale.fixBusy) return end
        CreateThread(repairNearby)
    elseif id:sub(1, 13) == 'ls_jobs:hire:' then
        TriggerServerEvent('ls_jobs:hire', id:sub(14))
    end
end)

-- --- метки тех, кто на смене ---------------------------------------------------

RegisterNetEvent('ls_jobs:duty', function(rows)
    local mine = GetPlayerServerId(PlayerId())
    local seen = {}

    for _, row in ipairs(rows or {}) do
        if row.id ~= mine then
            seen[row.id] = true
            local blip = dutyBlips[row.id]
            if not blip or not DoesBlipExist(blip) then
                blip = AddBlipForCoord(row.x, row.y, row.z)
                SetBlipSprite(blip, row.sprite)
                SetBlipColour(blip, row.colour)
                SetBlipScale(blip, Config.DutyScale)
                SetBlipAsShortRange(blip, false)
                BeginTextCommandSetBlipName('STRING')
                AddTextComponentSubstringPlayerName(row.label)
                EndTextCommandSetBlipName(blip)
                dutyBlips[row.id] = blip
            else
                SetBlipCoords(blip, row.x, row.y, row.z)
            end
        end
    end

    -- Ушедшие со смены метки убираем, иначе такси навсегда останется
    -- стоять там, где закончило работу.
    for id, blip in pairs(dutyBlips) do
        if not seen[id] then
            if DoesBlipExist(blip) then RemoveBlip(blip) end
            dutyBlips[id] = nil
        end
    end
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    clearStopBlip()
    clearDepotBlip()
    clearWorkVeh()
    if passenger and DoesEntityExist(passenger) then DeleteEntity(passenger) end
    for _, blip in pairs(dutyBlips) do
        if DoesBlipExist(blip) then RemoveBlip(blip) end
    end
end)
