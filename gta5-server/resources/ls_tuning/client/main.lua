-- Client side: the shop prompt, live preview and applying a saved build.

local uiOpen = false
local shopBlips = {}
local current = nil    -- { vehicle, plate, original, draft }
local pending = nil    -- { plate, vehicle } waiting for its saved build

-- Тюнинг-мастерская, у которой игрок стоит прямо сейчас.
local nearTuning = nil

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

local categoryById = {}
for _, category in ipairs(Config.Categories) do
    categoryById[category.id] = category
end

-- --- reading and writing a vehicle ------------------------------------------

-- Nothing on a vehicle can be modified until its mod kit is open.
local function prepare(vehicle)
    SetVehicleModKit(vehicle, 0)
end

local function readValue(vehicle, category)
    if category.kind == 'toggle' then
        return IsToggleModOn(vehicle, category.mod)
    elseif category.kind == 'wheels' then
        return { type = GetVehicleWheelType(vehicle), index = GetVehicleMod(vehicle, 23) }
    elseif category.kind == 'colour' then
        local primary, secondary = GetVehicleColours(vehicle)
        local pearl, wheelColour = GetVehicleExtraColours(vehicle)
        if category.slot == 1 then return primary end
        if category.slot == 2 then return secondary end
        if category.slot == 3 then return pearl end
        return wheelColour
    elseif category.kind == 'tint' then
        return GetVehicleWindowTint(vehicle)
    elseif category.kind == 'neon' then
        return IsVehicleNeonLightEnabled(vehicle, 0)
    elseif category.kind == 'neoncol' then
        local r = GetVehicleNeonLightsColour(vehicle)
        return r or 0
    elseif category.kind == 'smoke' then
        return GetVehicleTyreSmokeColor(vehicle) or 0
    end
    return GetVehicleMod(vehicle, category.mod)
end

local function writeValue(vehicle, category, value)
    prepare(vehicle)

    if category.kind == 'toggle' then
        ToggleVehicleMod(vehicle, category.mod, value == true)

    elseif category.kind == 'wheels' then
        SetVehicleWheelType(vehicle, tonumber(value.type) or 0)
        SetVehicleMod(vehicle, 23, tonumber(value.index) or -1, false)

    elseif category.kind == 'colour' then
        local primary, secondary = GetVehicleColours(vehicle)
        local pearl, wheelColour = GetVehicleExtraColours(vehicle)
        value = tonumber(value) or 0

        if category.slot == 1 then primary = value
        elseif category.slot == 2 then secondary = value
        elseif category.slot == 3 then pearl = value
        else wheelColour = value end

        SetVehicleColours(vehicle, primary, secondary)
        SetVehicleExtraColours(vehicle, pearl, wheelColour)

    elseif category.kind == 'tint' then
        SetVehicleWindowTint(vehicle, tonumber(value) or 0)

    elseif category.kind == 'neon' then
        for index = 0, 3 do
            SetVehicleNeonLightEnabled(vehicle, index, value == true)
        end

    elseif category.kind == 'neoncol' then
        -- The palette index is turned into an actual RGB by the game's own
        -- colour table, which SetVehicleCustomPrimaryColour does not expose,
        -- so a small fixed palette is used instead.
        local palette = {
            [0] = { 255, 255, 255 }, { 255, 0, 0 }, { 255, 128, 0 }, { 255, 255, 0 },
            { 0, 255, 0 }, { 0, 255, 255 }, { 0, 128, 255 }, { 0, 0, 255 },
            { 128, 0, 255 }, { 255, 0, 255 }, { 255, 0, 128 },
        }
        local colour = palette[(tonumber(value) or 0) % 11] or palette[0]
        SetVehicleNeonLightsColour(vehicle, colour[1], colour[2], colour[3])

    elseif category.kind == 'smoke' then
        local palette = {
            [0] = { 255, 255, 255 }, { 255, 0, 0 }, { 255, 140, 0 }, { 255, 255, 0 },
            { 0, 200, 0 }, { 0, 200, 255 }, { 0, 0, 255 }, { 160, 0, 255 },
            { 255, 0, 160 }, { 20, 20, 20 },
        }
        local colour = palette[(tonumber(value) or 0) % 10] or palette[0]
        ToggleVehicleMod(vehicle, 20, true)
        SetVehicleTyreSmokeColor(vehicle, colour[1], colour[2], colour[3])

    else
        SetVehicleMod(vehicle, category.mod, tonumber(value) or -1, false)
    end
end

local function applyBuild(vehicle, build)
    if not build then return end
    prepare(vehicle)
    for id, value in pairs(build) do
        local category = categoryById[id]
        if category then writeValue(vehicle, category, value) end
    end
end

local function snapshot(vehicle)
    prepare(vehicle)
    local state = {}
    for _, category in ipairs(Config.Categories) do
        state[category.id] = readValue(vehicle, category)
    end
    return state
end

-- --- menu data --------------------------------------------------------------

-- How many options each category offers on *this* vehicle. Everything the car
-- physically supports is listed; nothing is held back.
local function buildCatalog(vehicle)
    prepare(vehicle)
    local catalog = {}

    for _, category in ipairs(Config.Categories) do
        local entry = {
            id = category.id,
            label = category.label,
            kind = category.kind or 'mod',
            price = category.price,
            perf = category.perf == true,
            value = readValue(vehicle, category),
        }

        if entry.kind == 'mod' then
            entry.count = GetNumVehicleMods(vehicle, category.mod)
            entry.names = {}
            for index = 0, entry.count - 1 do
                entry.names[index + 1] = GetLabelText(GetModTextLabel(vehicle, category.mod, index))
            end
        elseif entry.kind == 'wheels' then
            entry.types = Config.WheelTypes
            entry.count = GetNumVehicleMods(vehicle, 23)
        elseif entry.kind == 'colour' or entry.kind == 'smoke' or entry.kind == 'neoncol' then
            entry.max = (entry.kind == 'colour') and Config.MaxColour or 10
        elseif entry.kind == 'tint' then
            entry.max = Config.MaxTint
        end

        if entry.count == nil or entry.count > 0 or entry.kind ~= 'mod' then
            catalog[#catalog + 1] = entry
        end
    end

    return catalog
end

-- --- opening ----------------------------------------------------------------

local function openShop(vehicle)
    local plate = GetVehicleNumberPlateText(vehicle)
    plate = plate and plate:gsub('%s+$', '') or ''

    prepare(vehicle)
    current = {
        vehicle = vehicle,
        plate = plate,
        original = snapshot(vehicle),
        draft = {},
    }

    uiOpen = true
    SetNuiFocus(true, true)
    SendNUIMessage({
        action = 'open',
        plate = plate,
        catalog = buildCatalog(vehicle),
        perfStep = Config.PerfStepMultiplier,
    })
end

local function closeShop(revert)
    if current and revert and DoesEntityExist(current.vehicle) then
        applyBuild(current.vehicle, current.original)
    end
    current = nil
    uiOpen = false
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })
end

-- --- shop loop --------------------------------------------------------------

CreateThread(function()
    for _, shop in ipairs(Config.Shops) do
        local blip = AddBlipForCoord(shop.x, shop.y, shop.z)
        SetBlipSprite(blip, Config.ShopBlip.sprite)
        SetBlipColour(blip, Config.ShopBlip.colour)
        SetBlipScale(blip, Config.ShopBlip.scale)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName('Тюнинг — ' .. shop.label)
        EndTextCommandSetBlipName(blip)
        shopBlips[#shopBlips + 1] = blip
    end

    while true do
        local wait = 700
        local ped = PlayerPedId()
        local coords = GetEntityCoords(ped)
        nearTuning = nil

        for _, shop in ipairs(Config.Shops) do
            local dist = #(coords - vector3(shop.x, shop.y, shop.z))
            if dist < 25.0 then
                wait = 0
                DrawMarker(1, shop.x, shop.y, shop.z - 0.98, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                    3.0, 3.0, 0.6, 120, 90, 255, 80, false, true, 2, false, nil, nil, false)

                if dist < Config.ShopRadius and not uiOpen then
                    -- Подсказку и нажатие держит ls_interact. Напоминание
                    -- "сядь за руль" оставляем: без него непонятно, почему
                    -- в меню ничего нет.
                    nearTuning = shop
                    local vehicle = GetVehiclePedIsIn(ped, false)
                    if vehicle == 0 or GetPedInVehicleSeat(vehicle, -1) ~= ped then
                        drawText3D(shop.x, shop.y, shop.z + 0.6, TuneLocale.notInCar)
                    end
                end
            end
        end

        -- Driving off mid-session puts everything back rather than leaving a
        -- half-fitted car that was never paid for.
        if uiOpen and current then
            local inShop = false
            for _, shop in ipairs(Config.Shops) do
                if #(coords - vector3(shop.x, shop.y, shop.z)) < Config.ShopRadius + 4.0 then
                    inShop = true
                    break
                end
            end
            if not inShop then
                notify(TuneLocale.leftShop)
                closeShop(true)
            end
        end

        Wait(wait)
    end
end)

-- --- NUI callbacks ----------------------------------------------------------

RegisterNUICallback('preview', function(data, cb)
    if current and data and data.id then
        local category = categoryById[data.id]
        if category and DoesEntityExist(current.vehicle) then
            current.draft[data.id] = data.value
            writeValue(current.vehicle, category, data.value)
        end
    end
    cb('ok')
end)

RegisterNUICallback('apply', function(_, cb)
    if current then
        TriggerServerEvent('ls_tuning:apply', current.plate, current.draft)
    end
    cb('ok')
end)

RegisterNUICallback('cancel', function(_, cb)
    notify(TuneLocale.cancelled)
    closeShop(true)
    cb('ok')
end)

-- --- server events ----------------------------------------------------------

RegisterNetEvent('ls_tuning:notify', function(text) notify(text) end)

RegisterNetEvent('ls_tuning:applied', function(plate, build, total)
    if current and DoesEntityExist(current.vehicle) then
        applyBuild(current.vehicle, build)
    end
    closeShop(false)
end)

-- Payment failed: the preview goes back to what was actually paid for.
RegisterNetEvent('ls_tuning:rejected', function()
    closeShop(true)
end)

RegisterNetEvent('ls_tuning:build', function(plate, build)
    if not build then
        pending = nil
        return
    end

    -- Prefer the exact vehicle the garage just spawned; it may be parked well
    -- out of sight, so searching around the player would miss it.
    local vehicle
    if pending and pending.plate == plate and DoesEntityExist(pending.vehicle) then
        vehicle = pending.vehicle
    else
        local ped = PlayerPedId()
        vehicle = GetVehiclePedIsIn(ped, false)
        if vehicle == 0 then
            vehicle = GetClosestVehicle(GetEntityCoords(ped), 12.0, 0, 71)
        end
        if vehicle ~= 0 and DoesEntityExist(vehicle) then
            local onPlate = GetVehicleNumberPlateText(vehicle)
            if not onPlate or onPlate:gsub('%s+$', '') ~= plate then
                vehicle = 0
            end
        end
    end

    pending = nil
    if not vehicle or vehicle == 0 or not DoesEntityExist(vehicle) then return end

    applyBuild(vehicle, build)
end)

-- The garage says when it has spawned something, so the saved build goes on.
AddEventHandler('phone_garage:spawned', function(plate, vehicle)
    if type(plate) ~= 'string' or plate == '' then return end
    pending = { plate = plate, vehicle = vehicle }
    TriggerServerEvent('ls_tuning:request', plate)
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    SetNuiFocus(false, false)
    for _, blip in ipairs(shopBlips) do
        if DoesBlipExist(blip) then RemoveBlip(blip) end
    end
end)

-- --- как машины едут ---------------------------------------------------------
--
-- Прибавки живут на самой машине, а не в хендлинге, и слетают вместе с ней.
-- Поэтому накладываем при каждой посадке, а не один раз.

local boosted = {}      -- [машина] = true, чтобы не давить одно и то же каждый кадр

local function applyDrive(vehicle)
    if not Config.Drive or not Config.Drive.enabled then return end
    if not DoesEntityExist(vehicle) then return end

    local class = GetVehicleClass(vehicle)
    if Config.Drive.skipClasses[class] then return end

    local power = Config.Drive.power or 0.0
    local topSpeed = Config.Drive.topSpeed or 0.0
    local torque = Config.Drive.torque or 1.0

    local bonus = Config.Drive.classBonus[class]
    if bonus then
        power = power + (bonus.power or 0.0)
        topSpeed = topSpeed + (bonus.topSpeed or 0.0)
        torque = torque + (bonus.torque or 0.0)
    end

    -- Проценты прибавки, а не множители: 0 оставил бы машину как есть.
    if power > 0.0 then SetVehicleEnginePowerMultiplier(vehicle, power) end
    if torque ~= 1.0 then SetVehicleEngineTorqueMultiplier(vehicle, torque) end
    if topSpeed > 0.0 then ModifyVehicleTopSpeed(vehicle, topSpeed) end

    boosted[vehicle] = true
end

CreateThread(function()
    while true do
        Wait(1000)
        local ped = PlayerPedId()
        local vehicle = GetVehiclePedIsIn(ped, false)

        if vehicle ~= 0 and not boosted[vehicle] then
            applyDrive(vehicle)
        end

        -- Машины уезжают и удаляются; таблица не должна расти вечно.
        for handle in pairs(boosted) do
            if not DoesEntityExist(handle) then boosted[handle] = nil end
        end
    end
end)

-- Подобрать цифры проще живьём, чем перезапуском ресурса.
-- /drive 80 1.8 30  -> мощность +80%, момент 1.8, максималка +30%
RegisterCommand('drive', function(_, args)
    local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
    if vehicle == 0 then
        notify('~r~Сядь в машину')
        return
    end

    local power = tonumber(args[1])
    local torque = tonumber(args[2])
    local top = tonumber(args[3])
    if not power then
        notify('~y~/drive <мощность %> <момент> <максималка %>')
        return
    end

    if power > 0.0 then SetVehicleEnginePowerMultiplier(vehicle, power) end
    if torque then SetVehicleEngineTorqueMultiplier(vehicle, torque) end
    if top and top > 0.0 then ModifyVehicleTopSpeed(vehicle, top) end
    boosted[vehicle] = true

    notify(('~g~Мощность +%d%%, момент %.1f, максималка +%d%%')
        :format(math.floor(power), torque or 1.0, math.floor(top or 0)))
end, false)

-- --- взаимодействие ----------------------------------------------------------

AddEventHandler('ls_interact:collect', function()
    if uiOpen or not nearTuning then return end

    local ped = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle == 0 or GetPedInVehicleSeat(vehicle, -1) ~= ped then return end

    TriggerEvent('ls_interact:offer', {
        id = 'ls_tuning:open',
        label = 'Тюнинг',
        order = 14,
    })
end)

AddEventHandler('ls_interact:run', function(id)
    if id ~= 'ls_tuning:open' then return end
    local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
    if vehicle ~= 0 then openShop(vehicle) end
end)
