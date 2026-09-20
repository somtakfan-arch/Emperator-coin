-- Схроны на клиенте.
--
-- Содержимое показывается тем же меню E, что и всё остальное: отдельное
-- окно ради двадцати слотов не стоит ни строчки NUI.

local mine = {}             -- схроны своей семьи: { id, x, y, z, place }
local blips = {}
local nearStash = nil       -- { id, x, y, z } - свой, если рядом
local nearForeign = nil     -- чужой рядом: виден только вблизи
local contents = nil        -- открытое содержимое: { id, rows }
local raiding = false

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

RegisterNetEvent('ls_stash:notify', function(text) notify(text) end)

-- --- метки ---------------------------------------------------------------------

local function redrawBlips()
    for _, blip in pairs(blips) do
        if DoesBlipExist(blip) then RemoveBlip(blip) end
    end
    blips = {}

    for _, stash in ipairs(mine) do
        local blip = AddBlipForCoord(stash.x, stash.y, stash.z)
        SetBlipSprite(blip, Config.Blip.sprite)
        SetBlipColour(blip, Config.Blip.colour)
        SetBlipScale(blip, Config.Blip.scale)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName('Схрон — ' .. (stash.place or ''))
        EndTextCommandSetBlipName(blip)
        blips[#blips + 1] = blip
    end
end

RegisterNetEvent('ls_stash:mine', function(rows)
    mine = rows or {}
    redrawBlips()
end)

-- Про чужой схрон клиент узнаёт от сервера и только стоя на нём: держать у
-- себя список всех тайников значило бы раздать их карту каждому.
RegisterNetEvent('ls_stash:foreign', function(id)
    nearForeign = id
end)

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(3000)
    TriggerServerEvent('ls_stash:request')
end)

-- --- что рядом -----------------------------------------------------------------

CreateThread(function()
    while true do
        Wait(700)
        local me = GetEntityCoords(PlayerPedId())

        nearStash = nil
        for _, stash in ipairs(mine) do
            if #(me - vector3(stash.x, stash.y, stash.z)) <= Config.Interact then
                nearStash = stash
                break
            end
        end
    end
end)

-- Свой схрон обозначен маркером на земле: без него тайник невозможно найти
-- даже тому, кто его закопал.
CreateThread(function()
    while true do
        local wait = 700
        local me = GetEntityCoords(PlayerPedId())
        for _, stash in ipairs(mine) do
            local point = vector3(stash.x, stash.y, stash.z)
            if #(me - point) < 30.0 then
                wait = 0
                DrawMarker(23, point.x, point.y, point.z - 0.95, 0, 0, 0, 0, 0, 0,
                    0.9, 0.9, 0.4, 200, 170, 60, 120,
                    false, false, 2, false, nil, nil, false)
            end
        end
        Wait(wait)
    end
end)

-- --- содержимое ----------------------------------------------------------------

RegisterNetEvent('ls_stash:contents', function(id, rows)
    contents = { id = id, rows = rows or {} }

    if #contents.rows == 0 then
        notify(StashLocale.empty)
        return
    end

    TriggerEvent('ls_interact:show', {
        title = StashLocale.takePrompt,
        rows = (function()
            local out = {}
            for _, row in ipairs(contents.rows) do
                out[#out + 1] = {
                    id = ('ls_stash:take:%s:%d'):format(id, row.slot),
                    label = StashLocale.row:format(row.label, row.count),
                }
            end
            return out
        end)(),
    })
end)

-- Список того, что можно положить, строится из своего же инвентаря:
-- спрашивать сервер незачем, он всё равно перепроверит при выдаче.
local function showDeposit(id)
    local ok, state = pcall(function() return exports.ls_inventory:getState() end)
    if not ok or type(state) ~= 'table' or type(state.slots) ~= 'table' then return end

    local rows = {}
    for _, entry in pairs(state.slots) do
        if entry.item and entry.item ~= Config.Kit then
            rows[#rows + 1] = {
                id = ('ls_stash:put:%s:%s:%d'):format(id, entry.item, entry.count),
                label = StashLocale.row:format(entry.label or entry.item, entry.count),
            }
        end
    end

    if #rows == 0 then notify(StashLocale.empty) return end
    TriggerEvent('ls_interact:show', { title = StashLocale.putPrompt, rows = rows })
end

-- --- вскрытие ------------------------------------------------------------------

RegisterNetEvent('ls_stash:raidGo', function(seconds)
    if raiding then return end
    raiding = true

    CreateThread(function()
        local ped = PlayerPedId()
        RequestAnimDict('mini@repair')
        local deadline = GetGameTimer() + 3000
        while not HasAnimDictLoaded('mini@repair') and GetGameTimer() < deadline do Wait(20) end
        if HasAnimDictLoaded('mini@repair') then
            TaskPlayAnim(ped, 'mini@repair', 'fixing_a_ped', 8.0, -8.0,
                seconds * 1000, 1, 0, false, false, false)
        end

        local start = GetEntityCoords(ped)
        local left = seconds * 1000
        while left > 0 do
            Wait(250)
            left = left - 250
            -- Ушёл - не вскрыл. Иначе достаточно было бы нажать и уехать.
            if #(GetEntityCoords(PlayerPedId()) - start) > 4.0 then
                ClearPedTasks(PlayerPedId())
                raiding = false
                return
            end
        end

        ClearPedTasks(PlayerPedId())
        raiding = false
        TriggerServerEvent('ls_stash:raidDone')
    end)
end)

-- --- меню E --------------------------------------------------------------------

AddEventHandler('ls_interact:collect', function()
    local ped = PlayerPedId()

    if nearStash then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_stash:menu', label = StashLocale.prompt, submenu = 'stash', order = 3,
        })
        TriggerEvent('ls_interact:offer', {
            id = 'ls_stash:open:' .. nearStash.id, group = 'stash',
            label = StashLocale.takePrompt,
        })
        TriggerEvent('ls_interact:offer', {
            id = 'ls_stash:deposit:' .. nearStash.id, group = 'stash',
            label = StashLocale.putPrompt,
        })
        TriggerEvent('ls_interact:offer', {
            id = 'ls_stash:drop:' .. nearStash.id, group = 'stash',
            label = StashLocale.dropPrompt,
        })
        return
    end

    -- Заложить можно только пешком: закладка из окна машины выглядит
    -- странно и позволяет прятать схрон там, куда пешком не дойти.
    local okKit, hasKit = pcall(function()
        return exports.ls_inventory:hasItem(Config.Kit)
    end)
    if not IsPedInAnyVehicle(ped, false) and okKit and hasKit then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_stash:place', label = StashLocale.placePrompt, order = 8,
        })
    end

    if nearForeign and not raiding then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_stash:raid:' .. nearForeign, label = StashLocale.raidPrompt, order = 3,
        })
    end
end)

AddEventHandler('ls_interact:run', function(id)
    if id == 'ls_stash:place' then
        -- Название района нужно только для строчки "ваш схрон в Дэвисе
        -- вскрыли": по нему семья понимает, куда ехать.
        local me = GetEntityCoords(PlayerPedId())
        local zone = GetLabelText(GetNameOfZone(me.x, me.y, me.z))
        TriggerServerEvent('ls_stash:place', zone)

    elseif id:sub(1, 14) == 'ls_stash:open:' then
        TriggerServerEvent('ls_stash:open', id:sub(15))

    elseif id:sub(1, 17) == 'ls_stash:deposit:' then
        showDeposit(id:sub(18))

    elseif id:sub(1, 14) == 'ls_stash:drop:' then
        TriggerServerEvent('ls_stash:drop', id:sub(15))

    elseif id:sub(1, 14) == 'ls_stash:raid:' then
        TriggerServerEvent('ls_stash:raidStart', id:sub(15))

    elseif id:sub(1, 14) == 'ls_stash:take:' then
        local stashId, slot = id:sub(15):match('^(.-):(%d+)$')
        if stashId then TriggerServerEvent('ls_stash:take', stashId, tonumber(slot)) end

    elseif id:sub(1, 13) == 'ls_stash:put:' then
        local stashId, item, count = id:sub(14):match('^(.-):(.-):(%d+)$')
        if stashId then TriggerServerEvent('ls_stash:put', stashId, item, tonumber(count)) end
    end
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    for _, blip in pairs(blips) do
        if DoesBlipExist(blip) then RemoveBlip(blip) end
    end
end)
