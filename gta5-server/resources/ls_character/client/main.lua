-- Client side: the creator, applying the character, and name tags.

local character = nil
local roster = {}
local creating = false
local cam = nil

-- Working copy while the creator is open.
local draft = nil

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

local function defaultAppearance()
    local appearance = {
        mother = 0, father = 0,
        shapeMix = 0.5, skinMix = 0.5,
        eyeColour = 0,
        hair = 0, hairColour = 0, hairHighlight = 0,
        features = {}, overlays = {}, overlayColours = {},
    }
    for index = 0, 19 do appearance.features[tostring(index)] = 0.0 end
    for _, overlay in ipairs(Config.Overlays) do
        appearance.overlays[tostring(overlay.id)] = -1
        appearance.overlayColours[tostring(overlay.id)] = 0
    end
    return appearance
end

-- JSON hands integer keys back as strings, so both are accepted on read.
local function pick(map, key, fallback)
    if type(map) ~= 'table' then return fallback end
    local value = map[tostring(key)]
    if value == nil then value = map[key] end
    if value == nil then return fallback end
    return value
end

local function applyAppearance(ped, appearance)
    if not appearance then return end

    SetPedHeadBlendData(ped,
        appearance.mother or 0, appearance.father or 0, 0,
        appearance.mother or 0, appearance.father or 0, 0,
        appearance.shapeMix or 0.5, appearance.skinMix or 0.5, 0.0, false)

    for index = 0, 19 do
        SetPedFaceFeature(ped, index, tonumber(pick(appearance.features, index, 0.0)) or 0.0)
    end

    SetPedComponentVariation(ped, 2, appearance.hair or 0, 0, 0)
    SetPedHairColor(ped, appearance.hairColour or 0, appearance.hairHighlight or 0)

    for _, overlay in ipairs(Config.Overlays) do
        local value = tonumber(pick(appearance.overlays, overlay.id, -1)) or -1
        if value < 0 then
            SetPedHeadOverlay(ped, overlay.id, 255, 0.0)
        else
            SetPedHeadOverlay(ped, overlay.id, value, 1.0)
            if overlay.colourType then
                local colour = tonumber(pick(appearance.overlayColours, overlay.id, 0)) or 0
                SetPedHeadOverlayColor(ped, overlay.id, overlay.colourType, colour, colour)
            end
        end
    end

    SetPedEyeColor(ped, appearance.eyeColour or 0)
end

local function setModel(gender)
    local name = Config.Models[gender] or Config.Models.male
    local hash = GetHashKey(name)

    RequestModel(hash)
    local deadline = GetGameTimer() + 10000
    while not HasModelLoaded(hash) and GetGameTimer() < deadline do Wait(10) end
    if not HasModelLoaded(hash) then
        notify('~r~Не удалось загрузить модель персонажа')
        return false
    end

    SetPlayerModel(PlayerId(), hash)
    SetPedDefaultComponentVariation(PlayerPedId())
    SetModelAsNoLongerNeeded(hash)
    return true
end

local function applyCharacter(char)
    if not char then return end
    if not setModel(char.gender) then return end
    applyAppearance(PlayerPedId(), char.appearance)
    -- Clothing lives in ls_shops; swapping the model wiped it, so ask for it back.
    TriggerEvent('ls_character:applied')
end

-- --- camera ----------------------------------------------------------------

local function startCam(ped)
    local coords = GetEntityCoords(ped)
    local forward = GetEntityForwardVector(ped)
    cam = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA',
        coords.x + forward.x * 1.2, coords.y + forward.y * 1.2, coords.z + 0.55,
        0.0, 0.0, 0.0, 32.0, false, 0)
    PointCamAtEntity(cam, ped, 0.0, 0.0, 0.55, true)
    SetCamActive(cam, true)
    RenderScriptCams(true, true, 500, true, true)
end

local function stopCam()
    RenderScriptCams(false, true, 500, true, true)
    if cam then
        DestroyCam(cam, false)
        cam = nil
    end
end

-- --- creator ---------------------------------------------------------------

-- Overlay option counts come from the ped, and they differ between the male
-- and female models, so they are re-sent whenever the gender changes.
local function overlayCounts()
    local counts = {}
    for _, overlay in ipairs(Config.Overlays) do
        counts[tostring(overlay.id)] = GetPedHeadOverlayNum(overlay.id)
    end
    return counts
end

local function openCreator()
    creating = true
    draft = { gender = 'male', first = '', last = '', appearance = defaultAppearance() }

    local ped = PlayerPedId()
    FreezeEntityPosition(ped, true)
    SetEntityInvincible(ped, true)
    SetEntityVisible(ped, true, false)

    setModel(draft.gender)
    applyAppearance(PlayerPedId(), draft.appearance)
    startCam(PlayerPedId())

    SetNuiFocus(true, true)
    SendNUIMessage({
        action = 'open',
        features = Config.Features,
        overlays = Config.Overlays,
        maxParent = Config.MaxParent,
        maxEye = Config.MaxEyeColour,
        maxHair = GetNumberOfPedDrawableVariations(PlayerPedId(), 2) - 1,
        overlayCounts = overlayCounts(),
        nameMin = Config.NameMin,
        nameMax = Config.NameMax,
        draft = draft,
    })
end

local function closeCreator()
    creating = false
    draft = nil
    SetNuiFocus(false, false)
    stopCam()

    local ped = PlayerPedId()
    FreezeEntityPosition(ped, false)
    SetEntityInvincible(ped, false)
    SendNUIMessage({ action = 'close' })
end

-- --- NUI callbacks ---------------------------------------------------------

RegisterNUICallback('gender', function(data, cb)
    if draft and data and data.gender then
        draft.gender = (data.gender == 'female') and 'female' or 'male'
        if setModel(draft.gender) then
            applyAppearance(PlayerPedId(), draft.appearance)
            startCam(PlayerPedId())
            SendNUIMessage({
                action = 'limits',
                maxHair = GetNumberOfPedDrawableVariations(PlayerPedId(), 2) - 1,
                overlayCounts = overlayCounts(),
            })
        end
    end
    cb('ok')
end)

RegisterNUICallback('appearance', function(data, cb)
    if draft and type(data) == 'table' and type(data.appearance) == 'table' then
        draft.appearance = data.appearance
        applyAppearance(PlayerPedId(), draft.appearance)
    end
    cb('ok')
end)

RegisterNUICallback('rotate', function(data, cb)
    local ped = PlayerPedId()
    SetEntityHeading(ped, GetEntityHeading(ped) + ((tonumber(data and data.dir) or 1) * 25.0))
    cb('ok')
end)

RegisterNUICallback('submit', function(data, cb)
    if draft and type(data) == 'table' then
        draft.first = tostring(data.first or '')
        draft.last = tostring(data.last or '')
        TriggerServerEvent('ls_character:submit', draft)
    end
    cb('ok')
end)

-- --- server events ---------------------------------------------------------

RegisterNetEvent('ls_character:create', function()
    if not creating then openCreator() end
end)

RegisterNetEvent('ls_character:load', function(char)
    character = char
    if creating then closeCreator() end
    applyCharacter(char)
    notify(('~g~%s %s~w~ — статик ~b~#%d'):format(char.first, char.last, char.static))
end)

RegisterNetEvent('ls_character:rejected', function(reason)
    SendNUIMessage({ action = 'rejected', reason = reason })
end)

RegisterNetEvent('ls_character:roster', function(list)
    roster = list or {}
end)

RegisterNetEvent('ls_character:notify', function(text)
    notify(text)
end)

-- --- name tags -------------------------------------------------------------

local function drawTag(x, y, z, text)
    SetTextScale(0.32, 0.32)
    SetTextFont(4)
    SetTextColour(235, 240, 250, 190)
    SetTextCentre(true)
    SetTextEntry('STRING')
    AddTextComponentString(text)
    SetDrawOrigin(x, y, z, 0)
    DrawText(0.0, 0.0)
    ClearDrawOrigin()
end

CreateThread(function()
    while true do
        local wait = 500
        if Config.ShowTags and not creating then
            local myPed = PlayerPedId()
            local myCoords = GetEntityCoords(myPed)

            for _, playerId in ipairs(GetActivePlayers()) do
                if playerId ~= PlayerId() then
                    local ped = GetPlayerPed(playerId)
                    if DoesEntityExist(ped) then
                        local coords = GetEntityCoords(ped)
                        if #(myCoords - coords) < Config.TagDistance then
                            local entry = roster[tostring(GetPlayerServerId(playerId))]
                            if entry then
                                wait = 0
                                -- Under a mask only the static shows.
                                local label = entry.masked
                                    and ('~b~#%d'):format(entry.static)
                                    or ('%s  ~b~#%d'):format(entry.name, entry.static)
                                drawTag(coords.x, coords.y, coords.z + 1.05, label)
                            end
                        end
                    end
                end
            end
        end
        Wait(wait)
    end
end)

-- --- boot ------------------------------------------------------------------

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(1500)
    TriggerServerEvent('ls_character:request')
end)

AddEventHandler('playerSpawned', function()
    Wait(1200)
    if character and not creating then
        applyCharacter(character)
    end
end)

exports('getCharacter', function()
    return character
end)

AddEventHandler('onResourceStop', function(name)
    if name == GetCurrentResourceName() then
        SetNuiFocus(false, false)
        stopCam()
        FreezeEntityPosition(PlayerPedId(), false)
    end
end)
