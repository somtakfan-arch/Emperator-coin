-- Server side: who is down, who may get up, and which buff is running.
-- Death state is runtime only: a relog while down respawns you normally.

local down = {}        -- [src] = { since = os.time(), reviving = bool }
local painkiller = {}  -- [src] = { item, until_ts, defense, melee }
local reviving = {}    -- [src] = true while a revive is in progress

local function notify(src, text)
    TriggerClientEvent('ls_medical:notify', src, text)
end

local function nameOf(src)
    local ok, name = pcall(function() return exports.ls_character:getName(src) end)
    if ok and type(name) == 'string' then return name end
    return GetPlayerName(src) or ('id ' .. tostring(src))
end

local function nearEachOther(a, b, distance)
    local pedA, pedB = GetPlayerPed(a), GetPlayerPed(b)
    if pedA == 0 or pedB == 0 then return false end
    return #(GetEntityCoords(pedA) - GetEntityCoords(pedB)) <= distance
end

local function clearPainkiller(src)
    if not painkiller[src] then return end
    painkiller[src] = nil
    TriggerClientEvent('ls_medical:painkiller', src, nil)
    notify(src, MedLocale.painkillerOff)
end

-- Everyone needs to know who is on the floor so the revive prompt can appear.
local function pushDownList()
    local list = {}
    for src in pairs(down) do list[tostring(src)] = true end
    TriggerClientEvent('ls_medical:downList', -1, list)
end

local function getUp(src, health)
    down[src] = nil

    -- Раненого видно службам на карте: без этого его никто не найдёт.
    pcall(function()
        local coords = GetEntityCoords(GetPlayerPed(src))
        return exports.ls_world:call('down', nil, coords.x, coords.y, coords.z)
    end)
    reviving[src] = nil
    TriggerClientEvent('ls_medical:revive', src, health or Config.Death.reviveHealth)
    pushDownList()
end

-- --- death ------------------------------------------------------------------

RegisterNetEvent('ls_medical:died', function()
    local src = source
    if down[src] then return end

    down[src] = { since = os.time() }
    clearPainkiller(src)

    TriggerClientEvent('ls_medical:down', src, Config.Death.lieSeconds, Config.Death.dropWeapons)
    pushDownList()
end)

-- The client asks once its countdown has run out; the server checks the clock
-- itself, so a patched countdown gets nowhere.
RegisterNetEvent('ls_medical:respawn', function()
    local src = source
    local state = down[src]
    if not state then return end

    if os.time() - state.since < Config.Death.lieSeconds then
        notify(src, MedLocale.died:format(Config.Death.lieSeconds - (os.time() - state.since)))
        return
    end

    local hospital = Config.Hospitals[math.random(#Config.Hospitals)]
    down[src] = nil
    reviving[src] = nil
    pushDownList()

    TriggerClientEvent('ls_medical:respawnAt', src, hospital, Config.Death.dropWeapons)
    notify(src, MedLocale.respawned)
end)

-- --- defibrillator ----------------------------------------------------------

RegisterNetEvent('ls_medical:reviveOther', function(targetId)
    local src = source
    targetId = tonumber(targetId)

    if not targetId or targetId == src or GetPlayerName(targetId) == nil then return end
    if not down[targetId] then
        notify(src, MedLocale.reviveNotDead)
        return
    end
    if reviving[targetId] then
        notify(src, MedLocale.reviveBusy)
        return
    end
    if not nearEachOther(src, targetId, Config.Defib.distance) then
        notify(src, MedLocale.reviveTooFar)
        return
    end

    local ok, taken = pcall(function()
        return exports.ls_inventory:takeItem(src, Config.Defib.item, 1)
    end)
    if not ok or taken ~= true then
        notify(src, MedLocale.reviveNoItem)
        return
    end

    reviving[targetId] = true
    TriggerClientEvent('ls_medical:reviveAnim', src, Config.Defib.otherSeconds)

    SetTimeout(Config.Defib.otherSeconds * 1000, function()
        reviving[targetId] = nil
        if not down[targetId] or GetPlayerName(targetId) == nil then return end

        -- Both still have to be there and still close when it finishes.
        if GetPlayerName(src) == nil or not nearEachOther(src, targetId, Config.Defib.distance) then
            notify(src, MedLocale.reviveTooFar)
            return
        end

        getUp(targetId)
        notify(targetId, MedLocale.revivedBy)
        notify(src, MedLocale.revivedOther)
        print(('[ls_medical] %s поднял %s'):format(nameOf(src), nameOf(targetId)))
    end)
end)

RegisterNetEvent('ls_medical:reviveSelf', function()
    local src = source
    if not down[src] then
        notify(src, MedLocale.reviveSelfNotDead)
        return
    end
    if reviving[src] then
        notify(src, MedLocale.reviveBusy)
        return
    end

    local ok, taken = pcall(function()
        return exports.ls_inventory:takeItem(src, Config.Defib.item, 1)
    end)
    if not ok or taken ~= true then
        notify(src, MedLocale.reviveNoItem)
        return
    end

    reviving[src] = true
    notify(src, MedLocale.reviveSelf)
    TriggerClientEvent('ls_medical:selfReviveBar', src, Config.Defib.selfSeconds)

    SetTimeout(Config.Defib.selfSeconds * 1000, function()
        reviving[src] = nil
        if not down[src] or GetPlayerName(src) == nil then return end

        -- The roll is here, not on the client that would like to win it.
        if math.random(100) <= Config.Defib.selfChance then
            getUp(src, math.floor(Config.Death.reviveHealth * 0.6))
            notify(src, MedLocale.reviveSelfOk)
        else
            notify(src, MedLocale.reviveSelfFail)
            TriggerClientEvent('ls_medical:selfReviveFailed', src)
        end
    end)
end)

-- --- items ------------------------------------------------------------------
-- ls_inventory hands these over instead of trying to apply them itself.

exports('usePainkiller', function(src, itemId)
    local def = Config.Painkillers[itemId]
    if not def then return false end

    if down[src] then
        notify(src, MedLocale.painkillerDead)
        return false
    end

    if painkiller[src] and not Config.PainkillerStacks and painkiller[src].until_ts > os.time() then
        notify(src, MedLocale.painkillerActive)
        return false
    end

    painkiller[src] = {
        item = itemId,
        until_ts = os.time() + def.seconds,
        defense = def.defense,
        melee = def.melee,
    }

    TriggerClientEvent('ls_medical:painkiller', src, {
        defense = def.defense,
        melee = def.melee,
        seconds = def.seconds,
    })
    notify(src, MedLocale.painkillerOn:format(
        def.label, math.floor((1.0 - def.defense) * 100), def.seconds))
    return true
end)

exports('useDefib', function(src)
    -- Using it from the inventory means reviving yourself; reviving someone
    -- else goes through the interaction menu instead.
    if not down[src] then
        notify(src, MedLocale.reviveSelfNotDead)
        return false
    end
    -- The item is taken by the revive handler, not here, so it is not lost
    -- twice. Returning false keeps ls_inventory from consuming it.
    TriggerEvent('ls_medical:selfReviveRequest', src)
    return false
end)

AddEventHandler('ls_medical:selfReviveRequest', function(src)
    TriggerClientEvent('ls_medical:askSelfRevive', src)
end)

exports('useMask', function(src, itemId)
    local def = Config.Masks[itemId]
    if not def then return false end

    if down[src] then
        notify(src, MedLocale.maskDead)
        return false
    end

    TriggerClientEvent('ls_medical:mask', src, {
        item = itemId,
        label = def.label,
        component = Config.MaskComponent,
        drawable = def.drawable,
        texture = def.texture,
    })
    return false   -- a mask is worn, not used up
end)

-- The client reports the result so the server can tell everyone else whether
-- this player's name should be hidden.
RegisterNetEvent('ls_medical:maskState', function(on, label)
    local src = source
    local ok = pcall(function()
        exports.ls_character:setMasked(src, on == true, tostring(label or ''):sub(1, 32))
    end)
    if not ok then
        print('[ls_medical] ls_character:setMasked unavailable - masks will not hide names')
    end
    notify(src, on and MedLocale.maskOn:format(tostring(label or '')) or MedLocale.maskOff)
end)

exports('isDown', function(src) return down[src] ~= nil end)

-- --- upkeep -----------------------------------------------------------------

CreateThread(function()
    while true do
        Wait(5000)
        local now = os.time()
        for src, state in pairs(painkiller) do
            if GetPlayerName(src) == nil then
                painkiller[src] = nil
            elseif state.until_ts <= now then
                clearPainkiller(src)
            end
        end
    end
end)

AddEventHandler('playerDropped', function()
    local src = source
    down[src] = nil
    painkiller[src] = nil
    reviving[src] = nil
    pushDownList()
end)
