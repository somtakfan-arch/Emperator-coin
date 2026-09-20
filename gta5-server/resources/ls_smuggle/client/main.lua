-- Контрабанда на клиенте: метки диспетчеров, лодка или самолёт у депо,
-- точка забора и скупщик дня.
--
-- Транспорт, как и на работах, ставится по приезде к депо, а не в момент
-- заказа: брошенный на причале катер мешал бы всем остальным.

local run = nil             -- { kind, pickup, buyer, units, loaded }
local buyer = nil           -- скупщик дня
local craft = nil
local pickBlip = nil
local sellBlip = nil
local nearDispatch = nil
local nearBuyer = false
local nearPickup = false

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

RegisterNetEvent('ls_smuggle:notify', function(text) notify(text) end)

local function money(amount)
    local text = tostring(math.floor(amount))
    return (text:reverse():gsub('(%d%d%d)', '%1 '):reverse():gsub('^%s+', ''))
end

-- --- метки ---------------------------------------------------------------------

CreateThread(function()
    for _, def in pairs(Config.Runs) do
        local blip = AddBlipForCoord(def.dispatch.x, def.dispatch.y, def.dispatch.z)
        SetBlipSprite(blip, def.blip.sprite)
        SetBlipColour(blip, def.blip.colour)
        SetBlipScale(blip, def.blip.scale)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(('Контрабанда — %s'):format(def.label))
        EndTextCommandSetBlipName(blip)
    end
end)

local function clearRunBlips()
    if pickBlip then RemoveBlip(pickBlip) pickBlip = nil end
end

local function setRunBlips()
    clearRunBlips()
    if not run or run.loaded then return end

    pickBlip = AddBlipForCoord(run.pickup.x, run.pickup.y, run.pickup.z)
    SetBlipSprite(pickBlip, 478)
    SetBlipColour(pickBlip, 5)
    SetBlipScale(pickBlip, 0.9)
    SetBlipRoute(pickBlip, true)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName('Груз — ' .. (run.pickup.label or ''))
    EndTextCommandSetBlipName(pickBlip)
end

RegisterNetEvent('ls_smuggle:buyer', function(data)
    buyer = data
    if sellBlip then RemoveBlip(sellBlip) sellBlip = nil end
    if not buyer then return end

    sellBlip = AddBlipForCoord(buyer.x, buyer.y, buyer.z)
    SetBlipSprite(sellBlip, Config.BuyerBlip.sprite)
    SetBlipColour(sellBlip, Config.BuyerBlip.colour)
    SetBlipScale(sellBlip, Config.BuyerBlip.scale)
    SetBlipAsShortRange(sellBlip, true)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName('Скупщик — ' .. (buyer.label or ''))
    EndTextCommandSetBlipName(sellBlip)
end)

RegisterNetEvent('ls_smuggle:run', function(data)
    run = data
    setRunBlips()
end)

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(2500)
    TriggerServerEvent('ls_smuggle:request')
end)

-- Скупщик меняется в полночь: спрашиваем сервер раз в пятнадцать минут,
-- чтобы метка не осталась висеть на вчерашнем.
CreateThread(function()
    while true do
        Wait(900000)
        TriggerServerEvent('ls_smuggle:request')
    end
end)

-- --- транспорт ------------------------------------------------------------------

local function clearCraft()
    if craft and DoesEntityExist(craft) then DeleteEntity(craft) end
    craft = nil
end

CreateThread(function()
    while true do
        Wait(3000)
        local def = run and Config.Runs[run.kind] or nil

        if def then
            local me = GetEntityCoords(PlayerPedId())
            local near = #(me - vector3(def.depot.x, def.depot.y, def.depot.z)) < 90.0

            if near and (not craft or not DoesEntityExist(craft)) then
                local hash = GetHashKey(def.vehicle)
                if IsModelInCdimage(hash) and IsModelAVehicle(hash) then
                    RequestModel(hash)
                    local deadline = GetGameTimer() + 8000
                    while not HasModelLoaded(hash) and GetGameTimer() < deadline do Wait(20) end
                    if HasModelLoaded(hash) then
                        craft = CreateVehicle(hash, def.depot.x, def.depot.y, def.depot.z,
                            def.depot.h or 0.0, true, false)
                        SetVehicleOnGroundProperly(craft)
                        SetEntityAsMissionEntity(craft, true, true)
                        SetVehicleHasBeenOwnedByPlayer(craft, true)
                        SetModelAsNoLongerNeeded(hash)
                    end
                end
            end
        elseif craft and not IsPedInVehicle(PlayerPedId(), craft, false) then
            clearCraft()
        end
    end
end)

-- --- где мы --------------------------------------------------------------------

CreateThread(function()
    while true do
        Wait(700)
        local me = GetEntityCoords(PlayerPedId())

        nearDispatch = nil
        for key, def in pairs(Config.Runs) do
            if #(me - vector3(def.dispatch.x, def.dispatch.y, def.dispatch.z)) <= Config.Interact then
                nearDispatch = key
                break
            end
        end

        nearBuyer = buyer ~= nil
            and #(me - vector3(buyer.x, buyer.y, buyer.z)) <= Config.Interact

        -- По горизонтали: над точкой в море висят на высоте.
        nearPickup = run ~= nil and not run.loaded
            and #(vector3(me.x, me.y, 0.0) - vector3(run.pickup.x, run.pickup.y, 0.0))
                <= Config.PickRadius
    end
end)

-- Столб над точкой забора: в открытом море нет ни одного ориентира.
CreateThread(function()
    while true do
        local wait = 700
        if run and not run.loaded then
            local me = GetEntityCoords(PlayerPedId())
            local flat = #(vector3(me.x, me.y, 0.0)
                - vector3(run.pickup.x, run.pickup.y, 0.0))
            if flat < 400.0 then
                wait = 0
                DrawMarker(1, run.pickup.x, run.pickup.y, run.pickup.z - 1.0, 0, 0, 0, 0, 0, 0,
                    Config.PickRadius * 2.0, Config.PickRadius * 2.0, 40.0,
                    255, 180, 60, 80, false, false, 2, false, nil, nil, false)
            end
        end
        Wait(wait)
    end
end)

-- --- меню E ---------------------------------------------------------------------

local function haveCargo()
    local ok, has = pcall(function()
        return exports.ls_inventory:hasItem(Config.Item)
    end)
    return ok and has == true
end

AddEventHandler('ls_interact:collect', function()
    if nearDispatch then
        if run then
            TriggerEvent('ls_interact:offer', {
                id = 'ls_smuggle:cancel', label = SmugLocale.cancelPrompt, order = 7,
            })
        else
            local def = Config.Runs[nearDispatch]
            TriggerEvent('ls_interact:offer', {
                id = 'ls_smuggle:order:' .. nearDispatch, order = 5,
                label = SmugLocale.runLine:format(def.label,
                    money(Config.Units[2] * Config.PricePerUnit)),
            })
        end
    end

    if nearPickup then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_smuggle:load', label = SmugLocale.loadPrompt, order = 2,
        })
    end

    if nearBuyer and haveCargo() then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_smuggle:sell', label = SmugLocale.sellPrompt, order = 2,
        })
    end
end)

AddEventHandler('ls_interact:run', function(id)
    if id == 'ls_smuggle:load' then
        TriggerServerEvent('ls_smuggle:load')
    elseif id == 'ls_smuggle:sell' then
        TriggerServerEvent('ls_smuggle:sell')
    elseif id == 'ls_smuggle:cancel' then
        TriggerServerEvent('ls_smuggle:cancel')
    elseif id:sub(1, 17) == 'ls_smuggle:order:' then
        TriggerServerEvent('ls_smuggle:order', id:sub(18))
    end
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    clearRunBlips()
    clearCraft()
    if sellBlip then RemoveBlip(sellBlip) end
end)
