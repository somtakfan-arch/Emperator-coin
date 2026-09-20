-- Автосалон и доски объявлений на клиенте.
--
-- В зале стоят настоящие машины: их ставит клиент как декорацию, без
-- сети, поэтому у каждого они свои и никому не мешают. Купить можно и
-- выставленную, и любую другую из каталога.

local showroom = {}         -- что сегодня в зале: { spot, model, label, price }
local display = {}          -- поставленные машины
local ads = nil             -- последние объявления с доски
local nearSalon = false
local nearDisplay = nil     -- запись витрины, у которой стоим
local nearBoard = nil

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

local function money(amount)
    local text = tostring(math.floor(amount))
    return (text:reverse():gsub('(%d%d%d)', '%1 '):reverse():gsub('^%s+', ''))
end

-- --- метки ---------------------------------------------------------------------

CreateThread(function()
    local salon = AddBlipForCoord(Config.Salon.desk.x, Config.Salon.desk.y, Config.Salon.desk.z)
    SetBlipSprite(salon, Config.Salon.blip.sprite)
    SetBlipColour(salon, Config.Salon.blip.colour)
    SetBlipScale(salon, Config.Salon.blip.scale)
    SetBlipAsShortRange(salon, true)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName(Config.Salon.label)
    EndTextCommandSetBlipName(salon)

    for _, point in ipairs(Config.Board.points) do
        local blip = AddBlipForCoord(point.x, point.y, point.z)
        SetBlipSprite(blip, Config.Board.blip.sprite)
        SetBlipColour(blip, Config.Board.blip.colour)
        SetBlipScale(blip, Config.Board.blip.scale)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(Config.Board.label)
        EndTextCommandSetBlipName(blip)
    end
end)

-- --- витрина -------------------------------------------------------------------

local function clearDisplay()
    for _, veh in pairs(display) do
        if DoesEntityExist(veh) then DeleteEntity(veh) end
    end
    display = {}
end

local function buildDisplay()
    clearDisplay()

    for _, row in ipairs(showroom) do
        local spot = Config.Salon.display[row.spot]
        local hash = GetHashKey(row.model)
        -- Машины из аддонов может не быть: пак не установлен - место
        -- просто останется пустым, а каталог от этого не ломается.
        if spot and IsModelInCdimage(hash) and IsModelAVehicle(hash) then
            RequestModel(hash)
            local deadline = GetGameTimer() + 8000
            while not HasModelLoaded(hash) and GetGameTimer() < deadline do Wait(20) end
            if HasModelLoaded(hash) then
                local veh = CreateVehicle(hash, spot.x, spot.y, spot.z, spot.h, false, false)
                SetVehicleOnGroundProperly(veh)
                -- Витрина, а не транспорт: её не угоняют, не бьют и не
                -- сдвигают бампером.
                SetEntityInvincible(veh, true)
                FreezeEntityPosition(veh, true)
                SetVehicleDoorsLocked(veh, 2)
                SetVehicleNumberPlateText(veh, 'SALON')
                SetEntityAsMissionEntity(veh, true, true)
                SetModelAsNoLongerNeeded(hash)
                display[row.spot] = veh
            end
        end
    end
end

RegisterNetEvent('ls_places:showroom', function(rows)
    showroom = rows or {}
    -- Ставим только когда игрок рядом: четыре машины, висящие в памяти на
    -- другом конце карты, никому не нужны.
    local me = GetEntityCoords(PlayerPedId())
    if #(me - vector3(Config.Salon.desk.x, Config.Salon.desk.y, Config.Salon.desk.z)) < 120.0 then
        buildDisplay()
    end
end)

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(3000)
    TriggerServerEvent('ls_places:request')

    while true do
        Wait(3000)
        local me = GetEntityCoords(PlayerPedId())
        local near = #(me - vector3(Config.Salon.desk.x, Config.Salon.desk.y,
            Config.Salon.desk.z)) < 120.0

        if near and next(display) == nil and #showroom > 0 then
            buildDisplay()
        elseif not near and next(display) ~= nil then
            clearDisplay()
        end
    end
end)

-- Витрина меняется в полночь: переспрашиваем, чтобы в зале не стояло
-- вчерашнее.
CreateThread(function()
    while true do
        Wait(900000)
        TriggerServerEvent('ls_places:request')
    end
end)

-- --- что рядом -----------------------------------------------------------------

CreateThread(function()
    while true do
        Wait(700)
        local me = GetEntityCoords(PlayerPedId())

        nearSalon = #(me - vector3(Config.Salon.desk.x, Config.Salon.desk.y,
            Config.Salon.desk.z)) <= Config.Interact + 2.0

        nearDisplay = nil
        for _, row in ipairs(showroom) do
            local spot = Config.Salon.display[row.spot]
            if spot and #(me - vector3(spot.x, spot.y, spot.z)) <= 3.5 then
                nearDisplay = row
                break
            end
        end

        nearBoard = nil
        for _, point in ipairs(Config.Board.points) do
            if #(me - vector3(point.x, point.y, point.z)) <= Config.Interact then
                nearBoard = point
                break
            end
        end
    end
end)

-- --- доска ---------------------------------------------------------------------

RegisterNetEvent('ls_places:ads', function(rows)
    ads = rows or {}
    if #ads == 0 then notify(PlacesLocale.boardEmpty) return end

    TriggerEvent('ls_interact:show', {
        title = PlacesLocale.boardPrompt,
        rows = (function()
            local out = {}
            for index, ad in ipairs(ads) do
                out[#out + 1] = {
                    id = 'ls_places:ad:' .. index,
                    label = PlacesLocale.adLine:format(ad.title, ad.author or '?'),
                }
            end
            return out
        end)(),
    })
end)

-- --- меню E --------------------------------------------------------------------

AddEventHandler('ls_interact:collect', function()
    if nearDisplay then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_places:buy:' .. nearDisplay.model, order = 2,
            label = PlacesLocale.buyPrompt:format(nearDisplay.label, money(nearDisplay.price)),
        })
    end

    if nearSalon then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_places:salon', label = PlacesLocale.salonPrompt,
            submenu = 'salon', order = 4,
        })
        -- Весь каталог в одном списке был бы простынёй на сотню строк,
        -- поэтому в зале продаётся то, что в зале и стоит. Остальное -
        -- в телефоне, он никуда не делся.
        for _, row in ipairs(showroom) do
            TriggerEvent('ls_interact:offer', {
                id = 'ls_places:buy:' .. row.model, group = 'salon',
                label = PlacesLocale.lookPrompt:format(row.label, money(row.price)),
            })
        end
    end

    if nearBoard then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_places:board', label = PlacesLocale.boardPrompt,
            submenu = 'board', order = 4,
        })
        TriggerEvent('ls_interact:offer', {
            id = 'ls_places:read', group = 'board', label = PlacesLocale.readPrompt,
        })
        TriggerEvent('ls_interact:offer', {
            id = 'ls_places:write', group = 'board', label = PlacesLocale.writePrompt,
        })
    end
end)

AddEventHandler('ls_interact:run', function(id)
    if id == 'ls_places:read' then
        TriggerServerEvent('ls_places:board')

    elseif id == 'ls_places:write' then
        pcall(function() return exports.phone_garage:openPhone() end)

    elseif id:sub(1, 14) == 'ls_places:buy:' then
        -- Покупку ведёт phone_garage: деньги, номер и гараж - всё там.
        TriggerServerEvent('phone_garage:buy', id:sub(15))

    elseif id:sub(1, 13) == 'ls_places:ad:' then
        local index = tonumber(id:sub(14))
        local ad = ads and ads[index]
        if ad then
            notify(PlacesLocale.adBody:format(ad.body or '', ad.author or '?'))
        end
    end
end)

AddEventHandler('onResourceStop', function(name)
    if name == GetCurrentResourceName() then clearDisplay() end
end)
