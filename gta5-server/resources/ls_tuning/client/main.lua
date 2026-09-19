-- Client side: the shop prompt, live preview and applying a saved build.

local uiOpen = false
local shopBlips = {}
local current = nil    -- { vehicle, plate, original, draft }

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

        for _, shop in ipairs(Config.Shops) do
            local dist = #(coords - vector3(shop.x, shop.y, shop.z))
            if dist < 25.0 then
                wait = 0
                DrawMarker(1, shop.x, shop.y, shop.z - 0.98, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                    3.0, 3.0, 0.6, 120, 90, 255, 80, false, true, 2, false, nil, nil, false)

                if dist < Config.ShopRadius and not uiOpen then
                    local vehicle = GetVehiclePedIsIn(ped, false)
                    if vehicle ~= 0 and GetPedInVehicleSeat(vehicle, -1) == ped then
                        drawText3D(shop.x, shop.y, shop.z + 0.6, '~p~[E]~w~ Тюнинг')
                        if IsControlJustReleased(0, 38) then
                            openShop(vehicle)
                        end
                    else
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
    if not build then return end
    -- The car the garage just put on the ground carries this plate.
    local ped = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle == 0 then
        vehicle = GetClosestVehicle(GetEntityCoords(ped), 12.0, 0, 71)
    end
    if vehicle == 0 or not DoesEntityExist(vehicle) then return end

    local onPlate = GetVehicleNumberPlateText(vehicle)
    if onPlate and onPlate:gsub('%s+$', '') == plate then
        applyBuild(vehicle, build)
    end
end)

-- The garage says when it has spawned something, so the saved build goes on.
AddEventHandler('phone_garage:spawned', function(plate)
    if type(plate) == 'string' and plate ~= '' then
        TriggerServerEvent('ls_tuning:request', plate)
    end
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    SetNuiFocus(false, false)
    for _, blip in ipairs(shopBlips) do
        if DoesBlipExist(blip) then RemoveBlip(blip) end
    end
end)
