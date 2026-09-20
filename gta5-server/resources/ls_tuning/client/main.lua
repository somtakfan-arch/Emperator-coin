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

-- Какую машину тюнингуем.
--
-- Сначала ту, за рулём которой сидим. Если вышли - ближайшую в паре шагов:
-- требовать сидеть за рулём незачем, в мастерской из машины как раз
-- вылезают, а понять, почему меню пустое, было невозможно.
local function tuneVehicle()
    local ped = PlayerPedId()

    local veh = GetVehiclePedIsIn(ped, false)
    if veh ~= 0 then
        if GetPedInVehicleSeat(veh, -1) == ped then return veh end
        return nil      -- пассажиру чужую машину красить нечего
    end

    local me = GetEntityCoords(ped)
    local best, bestDist
    for _, other in ipairs(GetGamePool('CVehicle')) do
        local dist = #(me - GetEntityCoords(other))
        if dist <= Config.TuneReach and (not bestDist or dist < bestDist) then
            best, bestDist = other, dist
        end
    end
    return best
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

        -- Сидя в машине меряем от самой машины: её центр ближе к метке,
        -- чем водительское сиденье, и на длинной машине разница решает.
        local inVeh = GetVehiclePedIsIn(ped, false)
        local from = inVeh ~= 0 and GetEntityCoords(inVeh) or coords

        for _, shop in ipairs(Config.Shops) do
            local dist = #(from - vector3(shop.x, shop.y, shop.z))
            if dist < 25.0 then
                wait = 0
                DrawMarker(1, shop.x, shop.y, shop.z - 0.98, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                    3.0, 3.0, 0.6, 120, 90, 255, 80, false, true, 2, false, nil, nil, false)

                if dist < Config.ShopRadius and not uiOpen then
                    -- Подсказку и нажатие держит ls_interact. Напоминание
                    -- "сядь за руль" оставляем: без него непонятно, почему
                    -- в меню ничего нет.
                    nearTuning = shop
                    if not tuneVehicle() then
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
local driveTable = {}   -- модель -> { kmh, power, torque }, прислал сервер

-- Модель приходит строкой, а на руках у нас хэш: считаем хэши один раз.
local driveByHash = {}

RegisterNetEvent('ls_tuning:driveTable', function(rows)
    driveTable = rows or {}
    driveByHash = {}
    for model, entry in pairs(driveTable) do
        driveByHash[GetHashKey(model)] = entry
    end
end)

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(3000)
    TriggerServerEvent('ls_tuning:driveRequest')
end)

-- Сколько должна ехать эта машина, с каким мотором и как держать дорогу.
local function driveTarget(vehicle)
    local entry = driveByHash[GetEntityModel(vehicle)]
    local kmh = entry and entry.kmh or Config.Drive.defaultKmh
    local power = entry and entry.power or Config.Drive.defaultPower
    local torque = entry and entry.torque or Config.Drive.defaultTorque
    local grip = entry and entry.grip or Config.Drive.defaultGrip

    -- Класс перебивает каталог вниз, но не вверх: мотоцикл за три миллиона
    -- всё равно не должен ехать семьсот.
    local class = GetVehicleClass(vehicle)
    local byClass = Config.Drive.classKmh[class]
    if byClass and byClass < kmh then kmh = byClass end

    -- Мотоциклам и фурам прибавка к сцеплению даётся вполовину: половина
    -- отклонения от единицы, а не половина самого значения - иначе
    -- множитель 1.9 превратился бы в 0.95, то есть в ухудшение.
    if grip and Config.Drive.softGripClasses[class] then
        local half = {}
        for field, value in pairs(grip) do
            if field == 'gravity' then
                half[field] = 9.8 + (value - 9.8) * 0.5
            else
                half[field] = 1.0 + (value - 1.0) * 0.5
            end
        end
        grip = half
    end

    return math.min(kmh, Config.Drive.maxKmh), power, torque, grip
end

-- Сцепление и подвеска.
--
-- Хендлинг правится на самой машине, а не в handling.meta: файл разошёлся
-- бы с аддонами, а так дорогая машина держит дорогу хоть из салона, хоть
-- угнанная. Правка живёт только у того клиента, который её сделал, - но
-- своей машиной управляет он же, так что расхождения не видно.
local function applyGrip(vehicle, grip)
    if not grip then return end

    -- Множитель к заводскому значению, а не абсолютная цифра: у каждой
    -- модели своя подвеска, и одно число на всех сделало бы половину
    -- машин неуправляемыми.
    local function scale(field, mult)
        if not mult or mult == 1.0 then return end
        local base = GetVehicleHandlingFloat(vehicle, 'CHandlingData', field)
        if type(base) == 'number' and base > 0.0 then
            SetVehicleHandlingFloat(vehicle, 'CHandlingData', field, base * mult)
        end
    end

    -- Шины держат дорогу.
    scale('fTractionCurveMax', grip.traction)
    scale('fTractionCurveMin', grip.traction)
    scale('fTractionCurveLateral', grip.traction)

    -- Подвеска не раскачивается и не отыгрывает после кочки.
    scale('fSuspensionReboundDamp', grip.damp)
    scale('fSuspensionCompDamp', grip.damp)

    -- Ход подвески меньше - колёса прижаты, машину не подбрасывает.
    scale('fSuspensionForce', grip.damp)
    scale('fTractionSpringDeltaMax', grip.spring)

    -- Тормоза. Половина ощущения "машина слушается" - это возможность
    -- сбросить скорость перед поворотом, а не проехать его по прямой.
    scale('fBrakeForce', grip.brakes)

    -- Притяжение сильнее заводского: на трамплинах машина почти не
    -- взлетает, а взлетев, быстро возвращается на дорогу.
    if grip.gravity and grip.gravity > 0.0 then
        SetVehicleGravityAmount(vehicle, grip.gravity)
    end

    -- Штатное ухудшение сцепления у GTA (мокрый асфальт, дрифт-режим)
    -- перебивало бы всё, что мы тут настроили.
    SetVehicleReduceGrip(vehicle, false)

    -- На семистах километрах приземление ломает подвеску с первого же
    -- бугра, и машина встаёт посреди трассы.
    SetVehicleHasStrongAxles(vehicle, true)
    SetVehicleWheelsCanBreak(vehicle, false)
end

local function applyDrive(vehicle)
    if not Config.Drive or not Config.Drive.enabled then return end
    if not DoesEntityExist(vehicle) then return end
    if Config.Drive.skipClasses[GetVehicleClass(vehicle)] then return end

    local kmh, power, torque, grip = driveTarget(vehicle)

    -- Разгон: проценты прибавки к мощности, тут множитель не нужен.
    if power > 0.0 then SetVehicleEnginePowerMultiplier(vehicle, power) end
    if torque and torque ~= 1.0 then SetVehicleEngineTorqueMultiplier(vehicle, torque) end

    applyGrip(vehicle, grip)

    -- Максималка задаётся множителем к заводской, поэтому под цель его надо
    -- посчитать. Сначала сбрасываем множитель в единицу: после
    -- ModifyVehicleTopSpeed эта же функция возвращает уже изменённое
    -- значение, и второй заход умножил бы всё повторно.
    local want = kmh / 3.6
    ModifyVehicleTopSpeed(vehicle, 1.0)
    local base = GetVehicleEstimatedMaxSpeed(vehicle)
    if base and base > 1.0 then
        -- Множитель применяется в обе стороны. Раньше тут стояло
        -- `if want > base`, то есть ограничитель умел только разгонять:
        -- аддонные суперкары приезжают со своим хендлингом, где максималка
        -- и так за четыреста, и мы их не трогали вообще. Самые быстрые
        -- машины на сервере оставались ровно такими, какими их сделал автор
        -- мода, что бы ни стояло в конфиге.
        ModifyVehicleTopSpeed(vehicle, want / base)
    end

    -- И жёсткий потолок сверху. Множитель считается от хендлинга, а тот у
    -- аддонов бывает какой угодно: эта строчка не зависит от него вообще и
    -- держит предел, даже если множитель промахнулся.
    SetVehicleMaxSpeed(vehicle, want)

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

-- Сколько эта машина едет по нашим правилам - чтобы можно было проверить,
-- не разгоняясь до упора на трассе.
RegisterCommand('speed', function()
    local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
    if vehicle == 0 then notify('~r~Сядь в машину') return end

    local kmh, power, _, grip = driveTarget(vehicle)

    -- Показываем и то, что игра реально считает пределом этой машины.
    -- Именно расхождение этих двух цифр когда-то и означало, что
    -- ограничитель не сработал, а понять это можно было только на трассе.
    local real = (GetVehicleEstimatedMaxSpeed(vehicle) or 0.0) * 3.6

    notify(('~b~Цель: ~w~%d~b~, по факту: ~w~%d км/ч~n~~b~мотор ~w~+%d%%~b~, сцепление ~w~×%.2f')
        :format(math.floor(kmh), math.floor(real), math.floor(power),
            (grip and grip.traction) or 1.0))
end, false)

-- Подобрать цифры проще живьём, чем перезапуском ресурса.
-- /drive 250 300 2.5  -> потолок 250 км/ч, мотор +300%, момент 2.5
--
-- Максималка тут в километрах в час, как и в конфиге: возиться с
-- множителями к заводской, подбирая цифру на глаз, смысла нет.
RegisterCommand('drive', function(_, args)
    local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
    if vehicle == 0 then
        notify('~r~Сядь в машину')
        return
    end

    local kmh = tonumber(args[1])
    local power = tonumber(args[2])
    local torque = tonumber(args[3])
    if not kmh then
        notify('~y~/drive <км/ч> [мощность %] [момент]')
        return
    end

    if power and power > 0.0 then SetVehicleEnginePowerMultiplier(vehicle, power) end
    if torque then SetVehicleEngineTorqueMultiplier(vehicle, torque) end

    -- Машину могли уже разогнать при посадке, поэтому сначала возвращаем
    -- заводскую максималку, иначе множитель ляжет на множитель.
    ModifyVehicleTopSpeed(vehicle, 1.0)
    local base = GetVehicleEstimatedMaxSpeed(vehicle)
    if base and base > 1.0 then
        ModifyVehicleTopSpeed(vehicle, (kmh / 3.6) / base)
    end
    SetVehicleMaxSpeed(vehicle, kmh / 3.6)
    boosted[vehicle] = true

    notify(('~g~Потолок %d км/ч, мотор +%d%%, момент %.1f')
        :format(math.floor(kmh), math.floor(power or 0), torque or 1.0))
end, false)

-- --- взаимодействие ----------------------------------------------------------

AddEventHandler('ls_interact:collect', function()
    if uiOpen or not nearTuning then return end
    if not tuneVehicle() then return end

    TriggerEvent('ls_interact:offer', {
        id = 'ls_tuning:open',
        label = 'Тюнинг',
        order = 14,
    })
end)

AddEventHandler('ls_interact:run', function(id)
    if id ~= 'ls_tuning:open' then return end
    local vehicle = tuneVehicle()
    if vehicle then openShop(vehicle) end
end)
