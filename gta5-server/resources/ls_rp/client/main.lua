-- Client side: the E prompt on a nearby player, the interaction menu,
-- the document viewer and the clinic points.

local myDocs = {}
local menuOpen = false
local target = nil       -- server id of the player the menu is about
local clinicBlips = {}

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

-- Есть ли смысл показывать кнопку "Пригласить в семью".
-- Экспорт клиентский: серверный из клиента не вызывается, это уже ломало
-- магазин раньше.
local function canInvite()
    local ok, may = pcall(function() return exports.ls_property:canInvite() end)
    return ok and may == true
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

-- ls_shops listens on E too, so its prompt wins when you are stood in a shop.
local function shopBusy()
    local ok, busy = pcall(function() return exports.ls_shops:isBusy() end)
    return ok and busy == true
end

-- --- nearest player --------------------------------------------------------

local function nearestPlayer()
    local myPed = PlayerPedId()
    local myCoords = GetEntityCoords(myPed)
    local best, bestDist

    for _, playerId in ipairs(GetActivePlayers()) do
        if playerId ~= PlayerId() then
            local ped = GetPlayerPed(playerId)
            if DoesEntityExist(ped) and not IsEntityDead(ped) then
                local dist = #(myCoords - GetEntityCoords(ped))
                if dist < Config.PromptDistance and (not bestDist or dist < bestDist) then
                    best, bestDist = playerId, dist
                end
            end
        end
    end
    return best, bestDist
end

-- --- emotes ----------------------------------------------------------------

local function playEmote(id)
    local emote
    for _, entry in ipairs(Config.Emotes) do
        if entry.id == id then emote = entry break end
    end
    if not emote then return end

    RequestAnimDict(emote.dict)
    local deadline = GetGameTimer() + 3000
    while not HasAnimDictLoaded(emote.dict) and GetGameTimer() < deadline do Wait(10) end

    if not HasAnimDictLoaded(emote.dict) then
        notify('~r~Анимация недоступна в этой сборке игры')
        return
    end

    TaskPlayAnim(PlayerPedId(), emote.dict, emote.anim, 8.0, -8.0, 2500, 49, 0.0, false, false, false)
    RemoveAnimDict(emote.dict)
end

-- --- menu ------------------------------------------------------------------

local function docRows()
    local rows = {}
    for _, doc in ipairs(myDocs) do
        rows[#rows + 1] = {
            id = doc.id,
            kind = doc.kind,
            label = Config.DocumentLabels[doc.kind] or doc.kind,
            subtitle = (doc.kind == 'vehicle') and (doc.data.label .. ' · ' .. doc.data.plate) or nil,
        }
    end
    return rows
end

local function openMenu(playerId)
    target = GetPlayerServerId(playerId)
    menuOpen = true
    SetNuiFocus(true, true)

    local ok, inventory = pcall(function() return exports.ls_inventory:getState() end)
    local items = {}
    if ok and type(inventory) == 'table' then
        for _, entry in ipairs(inventory.slots or {}) do
            items[#items + 1] = {
                slot = entry.slot,
                label = entry.label,
                count = entry.count,
            }
        end
    end

    -- ls_medical knows who is on the floor; the revive button only shows then.
    local okDown, targetDown = pcall(function()
        return exports.ls_medical:isDownPlayer(target)
    end)

    SendNUIMessage({
        action = 'open',
        target = target,
        targetName = GetPlayerName(playerId),
        emotes = Config.Emotes,
        documents = docRows(),
        items = items,
        canRevive = okDown and targetDown == true,
        -- Звать в семью может только тот, кто в ней есть и не рядовой.
        -- Право окончательно проверяет ls_property, тут только кнопка.
        canInvite = canInvite(),
    })
end

local function closeMenu()
    menuOpen = false
    target = nil
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })
end

-- --- prompt loop -----------------------------------------------------------

CreateThread(function()
    while true do
        local wait = 400
        if not menuOpen and not shopBusy() then
            local playerId, dist = nearestPlayer()
            if playerId and dist and dist < Config.InteractDistance then
                wait = 0
                local coords = GetEntityCoords(GetPlayerPed(playerId))
                drawText3D(coords.x, coords.y, coords.z + 0.75, '~b~[E]~w~ Взаимодействие')

                if IsControlJustReleased(0, Config.InteractControl) then
                    openMenu(playerId)
                end
            elseif playerId then
                wait = 200
            end
        end
        Wait(wait)
    end
end)

-- --- clinics ---------------------------------------------------------------

CreateThread(function()
    for _, clinic in ipairs(Config.Clinics) do
        local blip = AddBlipForCoord(clinic.x, clinic.y, clinic.z)
        SetBlipSprite(blip, Config.ClinicBlip.sprite)
        SetBlipColour(blip, Config.ClinicBlip.colour)
        SetBlipScale(blip, Config.ClinicBlip.scale)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName('Медсправка — ' .. clinic.label)
        EndTextCommandSetBlipName(blip)
        clinicBlips[#clinicBlips + 1] = blip
    end

    while true do
        local wait = 500
        if not menuOpen then
            local coords = GetEntityCoords(PlayerPedId())
            for _, clinic in ipairs(Config.Clinics) do
                local dist = #(coords - vector3(clinic.x, clinic.y, clinic.z))
                if dist < 20.0 then
                    wait = 0
                    DrawMarker(1, clinic.x, clinic.y, clinic.z - 0.98,
                        0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.2, 1.2, 0.5,
                        80, 200, 140, 90, false, true, 2, false, nil, nil, false)

                    if dist < 2.0 then
                        drawText3D(clinic.x, clinic.y, clinic.z + 0.3,
                            ('~b~[G]~w~ Медсправка — $%d'):format(Config.MedCardPrice))
                        if IsControlJustReleased(0, 47) then    -- G
                            TriggerServerEvent('ls_rp:buyMedCard')
                        end
                    end
                end
            end
        end
        Wait(wait)
    end
end)

-- --- NUI callbacks ---------------------------------------------------------

RegisterNUICallback('close', function(_, cb)
    closeMenu()
    cb('ok')
end)

RegisterNUICallback('emote', function(data, cb)
    closeMenu()
    if data and data.id then playEmote(data.id) end
    cb('ok')
end)

RegisterNUICallback('showDoc', function(data, cb)
    if target and data and data.id then
        TriggerServerEvent('ls_rp:show', target, data.id)
    end
    cb('ok')
end)

RegisterNUICallback('giveDoc', function(data, cb)
    if target and data and data.id then
        TriggerServerEvent('ls_rp:giveDocument', target, data.id)
    end
    closeMenu()
    cb('ok')
end)

RegisterNUICallback('giveMoney', function(data, cb)
    if target and data and data.amount then
        TriggerServerEvent('ls_rp:giveMoney', target, data.amount)
    end
    closeMenu()
    cb('ok')
end)

RegisterNUICallback('giveItem', function(data, cb)
    if target and data and data.slot then
        TriggerServerEvent('ls_rp:giveItem', target, data.slot)
    end
    closeMenu()
    cb('ok')
end)

RegisterNUICallback('familyInvite', function(_, cb)
    closeMenu()
    if target then TriggerServerEvent('ls_property:invite', target) end
    cb('ok')
end)

RegisterNUICallback('revive', function(_, cb)
    if target then
        TriggerServerEvent('ls_medical:reviveOther', target)
    end
    closeMenu()
    cb('ok')
end)

RegisterNUICallback('closeDoc', function(_, cb)
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'closeDoc' })
    cb('ok')
end)

-- --- server events ---------------------------------------------------------

RegisterNetEvent('ls_rp:documents', function(list)
    myDocs = list or {}
    if menuOpen then
        SendNUIMessage({ action = 'documents', documents = docRows() })
    end
end)

RegisterNetEvent('ls_rp:notify', function(text)
    notify(text)
end)

RegisterNetEvent('ls_rp:viewDocument', function(doc, from)
    if not doc then return end
    SetNuiFocus(true, true)
    SendNUIMessage({
        action = 'viewDoc',
        doc = doc,
        title = Config.DocumentLabels[doc.kind] or doc.kind,
        from = from,
    })
end)

-- --- commands --------------------------------------------------------------

RegisterCommand('docs', function()
    if menuOpen then return end
    SetNuiFocus(true, true)
    menuOpen = true
    target = nil
    SendNUIMessage({
        action = 'open',
        target = nil,
        targetName = nil,
        emotes = Config.Emotes,
        documents = docRows(),
        items = {},
    })
end, false)

-- --- boot ------------------------------------------------------------------

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(2000)
    TriggerServerEvent('ls_rp:request')
end)

-- A new car means a new registration, and selling one takes it away.
AddEventHandler('phone_garage:refresh', function()
    TriggerServerEvent('ls_rp:request')
end)

AddEventHandler('onResourceStop', function(name)
    if name == GetCurrentResourceName() then
        SetNuiFocus(false, false)
        for _, blip in ipairs(clinicBlips) do
            if DoesBlipExist(blip) then RemoveBlip(blip) end
        end
    end
end)
