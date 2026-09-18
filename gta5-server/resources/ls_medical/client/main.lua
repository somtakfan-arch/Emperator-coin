-- Client side: the downed state, the countdown, revive animations, the
-- painkiller modifiers and the mask.

local isDown = false
local downUntil = 0
local canRespawn = false
local maskOn = nil
local bar = nil
local hospitalBlips = {}

local DEAD_DICT = 'dead'
local DEAD_ANIM = 'dead_a'
local CPR_DICT = 'mini@cpr@char_a@cpr_str'
local CPR_ANIM = 'cpr_pumpchest'

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

local function loadAnim(dict)
    RequestAnimDict(dict)
    local deadline = GetGameTimer() + 3000
    while not HasAnimDictLoaded(dict) and GetGameTimer() < deadline do Wait(10) end
    return HasAnimDictLoaded(dict)
end

local function centreText(y, text, r, g, b)
    SetTextScale(0.42, 0.42)
    SetTextFont(4)
    SetTextCentre(true)
    SetTextColour(r or 255, g or 255, b or 255, 220)
    SetTextEntry('STRING')
    AddTextComponentString(text)
    DrawText(0.5, y)
end

-- --- going down -------------------------------------------------------------

local function goDown(seconds, dropWeapons)
    isDown = true
    canRespawn = false
    downUntil = GetGameTimer() + seconds * 1000

    local ped = PlayerPedId()
    if dropWeapons then
        RemoveAllPedWeapons(ped, true)
    end

    SetEntityInvincible(ped, true)
    SetEntityHealth(ped, 101)   -- alive enough to animate, not enough to act

    if loadAnim(DEAD_DICT) then
        TaskPlayAnim(ped, DEAD_DICT, DEAD_ANIM, 8.0, -8.0, -1, 1, 0.0, false, false, false)
    else
        SetPedToRagdoll(ped, seconds * 1000, seconds * 1000, 0, false, false, false)
    end
end

local function standUp(health)
    isDown = false
    canRespawn = false
    bar = nil

    local ped = PlayerPedId()
    ClearPedTasksImmediately(ped)
    SetEntityInvincible(ped, false)
    SetEntityHealth(ped, math.min(GetEntityMaxHealth(ped), health or 140))
end

CreateThread(function()
    while true do
        local wait = 400
        if isDown then
            wait = 0
            local ped = PlayerPedId()

            -- Nothing works while you are on the floor.
            DisableAllControlActions(0)
            EnableControlAction(0, 249, true)   -- push to talk
            EnableControlAction(0, 1, true)     -- look around
            EnableControlAction(0, 2, true)
            EnableControlAction(0, Config.Death.respawnControl, true)

            local left = math.ceil((downUntil - GetGameTimer()) / 1000)
            if left > 0 then
                centreText(0.86, MedLocale.died:format(left), 255, 120, 120)
            else
                canRespawn = true
                centreText(0.86, MedLocale.canRespawn, 120, 220, 160)
                if IsDisabledControlJustReleased(0, Config.Death.respawnControl) then
                    TriggerServerEvent('ls_medical:respawn')
                end
            end

            if not IsEntityPlayingAnim(ped, DEAD_DICT, DEAD_ANIM, 3) then
                if loadAnim(DEAD_DICT) then
                    TaskPlayAnim(ped, DEAD_DICT, DEAD_ANIM, 8.0, -8.0, -1, 1, 0.0, false, false, false)
                end
            end
        end
        Wait(wait)
    end
end)

-- Death detection: report once, let the server decide what happens next.
CreateThread(function()
    while true do
        Wait(300)
        if not isDown and IsEntityDead(PlayerPedId()) then
            TriggerServerEvent('ls_medical:died')
            Wait(2000)
        end
    end
end)

-- --- progress bar -----------------------------------------------------------

CreateThread(function()
    while true do
        local wait = 400
        if bar then
            wait = 0
            local done = math.min((GetGameTimer() - bar.start) / bar.length, 1.0)

            DrawRect(0.5, 0.80, 0.24, 0.028, 0, 0, 0, 170)
            DrawRect(0.38 + (0.24 * done) / 2, 0.80, 0.24 * done, 0.028, 90, 200, 150, 220)
            centreText(0.792, bar.label, 255, 255, 255)

            if done >= 1.0 then bar = nil end
        end
        Wait(wait)
    end
end)

-- --- painkillers ------------------------------------------------------------

local function applyDefense(defense, melee)
    local player = PlayerId()
    SetPlayerWeaponDefenseModifier(player, defense or 1.0)
    if SetPlayerMeleeWeaponDefenseModifier then
        SetPlayerMeleeWeaponDefenseModifier(player, melee or 1.0)
    end
end

RegisterNetEvent('ls_medical:painkiller', function(buff)
    if buff then
        applyDefense(buff.defense, buff.melee)
    else
        applyDefense(1.0, 1.0)
    end
end)

-- SetPlayerWeaponDefenseModifier is set on the player, not the ped, so it
-- survives a model swap and needs no reapplying.

-- --- mask -------------------------------------------------------------------

RegisterNetEvent('ls_medical:mask', function(mask)
    local ped = PlayerPedId()

    if maskOn and maskOn.item == mask.item then
        -- Same mask again: take it off.
        SetPedComponentVariation(ped, mask.component, 0, 0, 0)
        maskOn = nil
        TriggerServerEvent('ls_medical:maskState', false, '')
        return
    end

    SetPedComponentVariation(ped, mask.component, mask.drawable, mask.texture, 0)
    maskOn = mask
    TriggerServerEvent('ls_medical:maskState', true, mask.label)
end)

exports('isMasked', function() return maskOn ~= nil end)

-- --- revive -----------------------------------------------------------------

RegisterNetEvent('ls_medical:down', function(seconds, dropWeapons)
    goDown(seconds, dropWeapons)
end)

RegisterNetEvent('ls_medical:revive', function(health)
    standUp(health)
    -- Buffs do not survive being put back together.
    applyDefense(1.0, 1.0)
end)

RegisterNetEvent('ls_medical:respawnAt', function(hospital, dropWeapons)
    local ped = PlayerPedId()
    standUp(Config.Death.reviveHealth)

    if dropWeapons then
        RemoveAllPedWeapons(ped, true)
        notify(MedLocale.weaponsLost)
    end

    SetEntityCoords(ped, hospital.x, hospital.y, hospital.z, false, false, false, false)
    SetEntityHeading(ped, hospital.h or 0.0)
    applyDefense(1.0, 1.0)
end)

RegisterNetEvent('ls_medical:reviveAnim', function(seconds)
    bar = { start = GetGameTimer(), length = seconds * 1000, label = 'Реанимация...' }

    local ped = PlayerPedId()
    if loadAnim(CPR_DICT) then
        TaskPlayAnim(ped, CPR_DICT, CPR_ANIM, 8.0, -8.0, seconds * 1000, 1, 0.0, false, false, false)
    end
end)

RegisterNetEvent('ls_medical:selfReviveBar', function(seconds)
    bar = { start = GetGameTimer(), length = seconds * 1000, label = 'Самореанимация...' }
end)

RegisterNetEvent('ls_medical:selfReviveFailed', function()
    bar = nil
end)

RegisterNetEvent('ls_medical:askSelfRevive', function()
    TriggerServerEvent('ls_medical:reviveSelf')
end)

RegisterNetEvent('ls_medical:notify', function(text)
    notify(text)
end)

-- --- hospitals on the map ---------------------------------------------------

CreateThread(function()
    for _, hospital in ipairs(Config.Hospitals) do
        local blip = AddBlipForCoord(hospital.x, hospital.y, hospital.z)
        SetBlipSprite(blip, Config.HospitalBlip.sprite)
        SetBlipColour(blip, Config.HospitalBlip.colour)
        SetBlipScale(blip, Config.HospitalBlip.scale)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName('Больница — ' .. hospital.label)
        EndTextCommandSetBlipName(blip)
        hospitalBlips[#hospitalBlips + 1] = blip
    end
end)

exports('isDown', function() return isDown end)

-- Whether some *other* player is on the floor. The client cannot know that on
-- its own, so it is mirrored from the server.
local downPlayers = {}

RegisterNetEvent('ls_medical:downList', function(list)
    downPlayers = list or {}
end)

exports('isDownPlayer', function(serverId)
    return downPlayers[tostring(serverId)] == true
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    applyDefense(1.0, 1.0)
    SetEntityInvincible(PlayerPedId(), false)
    ClearPedTasksImmediately(PlayerPedId())
    for _, blip in ipairs(hospitalBlips) do
        if DoesBlipExist(blip) then RemoveBlip(blip) end
    end
end)
