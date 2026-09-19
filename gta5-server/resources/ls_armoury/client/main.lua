-- Клиент оружейки: метки, пункты в меню E, фура поставки.
-- Список склада показывается тем же нативным меню, что и всё остальное.

local stockRows = nil       -- открытый склад: то, что прислал сервер
local run = nil             -- активная поставка: { pickup, drops, model, mine }
local truck = nil
local runBlip = nil
local dropBlips = {}
local nearPoint = nil

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

local function isOnDuty()
    local ok, duty = pcall(function() return exports.ls_police:isOnDuty() end)
    return ok and duty == true
end

RegisterNetEvent('ls_armoury:notify', function(text) notify(text) end)

-- --- метки -------------------------------------------------------------------

CreateThread(function()
    for _, point in ipairs(Config.Points) do
        local blip = AddBlipForCoord(point.x, point.y, point.z)
        SetBlipSprite(blip, Config.Blip.sprite)
        SetBlipColour(blip, Config.Blip.colour)
        SetBlipScale(blip, Config.Blip.scale)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(('%s — %s'):format(Config.Blip.label, point.label))
        EndTextCommandSetBlipName(blip)
    end
end)

CreateThread(function()
    while true do
        Wait(700)
        nearPoint = nil
        local me = GetEntityCoords(PlayerPedId())
        for _, point in ipairs(Config.Points) do
            if #(me - vector3(point.x, point.y, point.z)) <= Config.Interact then
                nearPoint = point
                break
            end
        end
    end
end)

-- --- склад в меню ------------------------------------------------------------

RegisterNetEvent('ls_armoury:stock', function(rows)
    stockRows = rows
    -- Открываем сразу, не дожидаясь второго нажатия: игрок уже выбрал
    -- "Оружейка" в меню, показывать ему ещё один пункт незачем.
    TriggerEvent('ls_armoury:showStock')
end)

AddEventHandler('ls_interact:collect', function()
    local me = GetEntityCoords(PlayerPedId())

    -- Сдать привезённую партию.
    if run then
        for _, drop in ipairs(run.drops or {}) do
            local radius = run.family and Config.FamilySupply.dropRadius or Config.Supply.dropRadius
            if #(me - vector3(drop.x, drop.y, drop.z)) <= radius then
                TriggerEvent('ls_interact:offer', {
                    id = 'ls_armoury:deliver',
                    label = ArmLocale.deliverPrompt,
                    order = 3,
                })
                break
            end
        end
    end

    if not nearPoint or not isOnDuty() then return end

    TriggerEvent('ls_interact:offer', {
        id = 'ls_armoury:open', label = ArmLocale.takePrompt, order = 6,
    })

    if not run then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_armoury:order', label = ArmLocale.supplyPrompt, order = 7,
        })
    end
end)

AddEventHandler('ls_interact:run', function(id)
    if id == 'ls_armoury:open' then
        TriggerServerEvent('ls_armoury:open')
    elseif id == 'ls_armoury:order' then
        TriggerServerEvent('ls_armoury:orderSupply')
    elseif id == 'ls_armoury:deliver' then
        TriggerServerEvent(run and run.family
            and 'ls_armoury:deliverFamily' or 'ls_armoury:deliverSupply')
    elseif id:sub(1, 16) == 'ls_armoury:take:' then
        TriggerServerEvent('ls_armoury:take', id:sub(17))
    end
end)

-- Склад показывается тем же меню: второй проход по :collect, но уже с
-- содержимым склада вместо точек на карте.
AddEventHandler('ls_armoury:showStock', function()
    if not stockRows then return end

    -- Пустой склад - не повод показывать пустое окно.
    local any = false
    for _, row in ipairs(stockRows) do
        if row.allowed and row.count > 0 then any = true break end
    end
    if not any then
        notify(ArmLocale.empty)
        return
    end

    TriggerEvent('ls_interact:show', {
        title = ArmLocale.takePrompt,
        rows = (function()
            local out = {}
            for _, row in ipairs(stockRows) do
                out[#out + 1] = {
                    id = 'ls_armoury:take:' .. row.item,
                    label = ('%s — %d шт.%s'):format(row.label, row.count,
                        row.allowed and '' or ' (нужен ранг выше)'),
                    disabled = not row.allowed or row.count <= 0,
                }
            end
            return out
        end)(),
    })
end)

-- --- фура --------------------------------------------------------------------

local function clearRun()
    if runBlip then RemoveBlip(runBlip) runBlip = nil end
    for _, blip in ipairs(dropBlips) do RemoveBlip(blip) end
    dropBlips = {}
    if truck and DoesEntityExist(truck) then DeleteEntity(truck) end
    truck = nil
    run = nil
end

RegisterNetEvent('ls_armoury:supplyOver', function() clearRun() end)

RegisterNetEvent('ls_armoury:supply', function(data)
    clearRun()
    if type(data) ~= 'table' then return end

    run = {
        pickup = data.pickup, drops = data.drops, model = data.model,
        mine = data.forSrc == GetPlayerServerId(PlayerId()),
        family = data.model == Config.FamilySupply.model,
    }

    runBlip = AddBlipForCoord(data.pickup.x, data.pickup.y, data.pickup.z)
    SetBlipSprite(runBlip, 477)
    SetBlipColour(runBlip, 5)
    SetBlipRoute(runBlip, run.mine)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName('Поставка — ' .. (data.pickup.label or ''))
    EndTextCommandSetBlipName(runBlip)

    for _, drop in ipairs(data.drops or {}) do
        local blip = AddBlipForCoord(drop.x, drop.y, drop.z)
        SetBlipSprite(blip, 478)
        SetBlipColour(blip, 2)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName('Сдать партию')
        EndTextCommandSetBlipName(blip)
        dropBlips[#dropBlips + 1] = blip
    end
end)

-- Фура ставится у точки погрузки тем, кто до неё доехал.
CreateThread(function()
    while true do
        Wait(3000)
        if run and run.pickup then
            local me = GetEntityCoords(PlayerPedId())
            local near = #(me - vector3(run.pickup.x, run.pickup.y, run.pickup.z)) < 120.0

            if near and (not truck or not DoesEntityExist(truck)) then
                local hash = GetHashKey(run.model)
                if IsModelInCdimage(hash) and IsModelAVehicle(hash) then
                    RequestModel(hash)
                    local deadline = GetGameTimer() + 8000
                    while not HasModelLoaded(hash) and GetGameTimer() < deadline do Wait(20) end
                    if HasModelLoaded(hash) then
                        truck = CreateVehicle(hash, run.pickup.x, run.pickup.y, run.pickup.z,
                            run.pickup.h or 0.0, false, false)
                        SetVehicleOnGroundProperly(truck)
                        SetEntityAsMissionEntity(truck, true, true)
                        SetModelAsNoLongerNeeded(hash)
                    end
                end
            elseif not near and truck and DoesEntityExist(truck)
                and not IsPedInVehicle(PlayerPedId(), truck, false) then
                DeleteEntity(truck)
                truck = nil
            end

            -- Фуру сожгли - партия потеряна, и об этом надо сказать серверу.
            if run.mine and truck and DoesEntityExist(truck) and IsEntityDead(truck) then
                TriggerServerEvent('ls_armoury:supplyLost')
                clearRun()
            end
        end
    end
end)

AddEventHandler('onResourceStop', function(name)
    if name == GetCurrentResourceName() then clearRun() end
end)
