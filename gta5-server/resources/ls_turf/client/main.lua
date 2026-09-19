-- Клиент районов: цветная карта, обломки на земле, доклад об убийстве.

local zones = {}
local blips = {}
local inZone = nil
local debris = {}       -- [key] = { объекты }
local wasDead = false

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

RegisterNetEvent('ls_turf:notify', function(text) notify(text) end)

-- --- карта -------------------------------------------------------------------

local function rebuildBlips()
    for _, blip in ipairs(blips) do RemoveBlip(blip) end
    blips = {}

    for _, zone in ipairs(zones) do
        local area = AddBlipForRadius(zone.x, zone.y, 0.0, zone.r)
        SetBlipColour(area, zone.colour or Config.NeutralColour)
        SetBlipAlpha(area, Config.BlipAlpha)
        blips[#blips + 1] = area

        local marker = AddBlipForCoord(zone.x, zone.y, 0.0)
        SetBlipSprite(marker, zone.war and 303 or 437)
        SetBlipColour(marker, zone.colour or Config.NeutralColour)
        SetBlipScale(marker, 0.7)
        SetBlipAsShortRange(marker, true)

        local name = zone.label
        if zone.war then
            name = ('%s — ВОЙНА'):format(zone.label)
        elseif zone.ownerName then
            name = ('%s — %s%s'):format(zone.label, zone.ownerName,
                zone.debris and ' (разрушен)' or '')
        else
            name = ('%s — ничей'):format(zone.label)
        end

        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(name)
        EndTextCommandSetBlipName(marker)
        blips[#blips + 1] = marker
    end
end

-- --- обломки -----------------------------------------------------------------

-- Точки разбрасываются по золотому углу от центра зоны: у всех клиентов
-- одинаково, и без сгущения в середине.
local GOLDEN = 2.399963229728653

local function clearDebris(key)
    for _, object in ipairs(debris[key] or {}) do
        if DoesEntityExist(object) then DeleteEntity(object) end
    end
    debris[key] = nil
end

local function placeDebris(zone)
    if debris[zone.key] then return end
    debris[zone.key] = {}

    local spread = zone.r * Config.Debris.spread
    for index = 1, Config.Debris.count do
        local radius = spread * math.sqrt(index / Config.Debris.count)
        local angle = index * GOLDEN
        local x = zone.x + radius * math.cos(angle)
        local y = zone.y + radius * math.sin(angle)

        local found, groundZ = GetGroundZFor_3dCoord(x, y, 1000.0, false)
        if found then
            local model = Config.Debris.props[((index - 1) % #Config.Debris.props) + 1]
            local hash = GetHashKey(model)
            if IsModelInCdimage(hash) then
                RequestModel(hash)
                local deadline = GetGameTimer() + 4000
                while not HasModelLoaded(hash) and GetGameTimer() < deadline do Wait(10) end
                if HasModelLoaded(hash) then
                    local object = CreateObject(hash, x, y, groundZ, false, false, false)
                    PlaceObjectOnGroundProperly(object)
                    SetEntityHeading(object, (index * 47) % 360 + 0.0)
                    FreezeEntityPosition(object, true)
                    debris[zone.key][#debris[zone.key] + 1] = object
                    SetModelAsNoLongerNeeded(hash)
                end
            end
        end
    end
end

CreateThread(function()
    while true do
        Wait(4000)
        if Config.Debris.enabled then
            local me = GetEntityCoords(PlayerPedId())
            for _, zone in ipairs(zones) do
                local near = #(me - vector3(zone.x, zone.y, me.z)) < zone.r + 100.0
                if zone.debris and near then
                    placeDebris(zone)
                elseif debris[zone.key] and (not zone.debris or not near) then
                    clearDebris(zone.key)
                end
            end
        end
    end
end)

-- --- где я -------------------------------------------------------------------

RegisterNetEvent('ls_turf:zones', function(list)
    zones = list or {}
    rebuildBlips()
end)

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(3000)
    TriggerServerEvent('ls_turf:request')

    while true do
        Wait(Config.Tick)
        local me = GetEntityCoords(PlayerPedId())
        local found = nil
        for _, zone in ipairs(zones) do
            if #(me - vector3(zone.x, zone.y, me.z)) <= zone.r then
                found = zone
                break
            end
        end

        if found and (not inZone or inZone.key ~= found.key) then
            notify(('~b~%s~w~ — %s'):format(found.label,
                found.ownerName or TurfLocale.nobody))
        end
        inZone = found
    end
end)

-- --- счёт войны на экране ----------------------------------------------------

CreateThread(function()
    while true do
        local wait = 500
        if inZone and inZone.war then
            wait = 0
            local left = math.max(0, (inZone.war.ends or 0) - GetCloudTimeAsInt())
            SetTextFont(4)
            SetTextScale(0.4, 0.4)
            SetTextCentre(true)
            SetTextOutline()
            BeginTextCommandDisplayText('STRING')
            AddTextComponentSubstringPlayerName(
                ('~r~ВОЙНА~w~ за %s — %d:%02d'):format(inZone.label,
                    math.floor(left / 60), left % 60))
            EndTextCommandDisplayText(0.5, 0.045)
        end
        Wait(wait)
    end
end)

-- --- убийства ----------------------------------------------------------------
-- Докладывает убитый: он точно знает, кто его положил, а где он при этом
-- лежал, сервер посмотрит сам.

CreateThread(function()
    while true do
        Wait(400)
        local ped = PlayerPedId()
        local dead = IsEntityDead(ped)

        if dead and not wasDead then
            wasDead = true
            local killer = GetPedSourceOfDeath(ped)
            if killer and killer ~= 0 and killer ~= ped and IsEntityAPed(killer) then
                local player = NetworkGetPlayerIndexFromPed(killer)
                if player and player ~= -1 and player ~= PlayerId() then
                    TriggerServerEvent('ls_turf:killed', GetPlayerServerId(player))
                end
            end
        elseif not dead then
            wasDead = false
        end
    end
end)

-- --- меню --------------------------------------------------------------------

AddEventHandler('ls_interact:collect', function()
    if not inZone then return end

    TriggerEvent('ls_interact:offer', {
        id = 'ls_turf:menu', label = ('Район «%s»'):format(inZone.label),
        submenu = 'turf', order = 9,
    })

    if not inZone.war then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_turf:declare', label = TurfLocale.declarePrompt, group = 'turf',
        })
    end

    if inZone.debris then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_turf:repair', label = TurfLocale.repairPrompt, group = 'turf',
        })
    end

    TriggerEvent('ls_interact:offer', {
        id = 'ls_turf:collect', label = TurfLocale.collectPrompt, group = 'turf',
    })
end)

AddEventHandler('ls_interact:run', function(id)
    if not inZone then return end
    if id == 'ls_turf:declare' then
        TriggerServerEvent('ls_turf:declare', inZone.key)
    elseif id == 'ls_turf:repair' then
        TriggerServerEvent('ls_turf:repair', inZone.key)
    elseif id == 'ls_turf:collect' then
        TriggerServerEvent('ls_turf:collect')
    end
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    for _, blip in ipairs(blips) do RemoveBlip(blip) end
    for key in pairs(debris) do clearDebris(key) end
end)
