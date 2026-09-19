-- Клиент города: ящики в карантине, растущая стройка, перекрытые улицы.
--
-- Всё это объекты на земле. Они ставятся у того, кто рядом, и убираются,
-- когда он уехал - держать в памяти полгорода реквизита незачем.

local state = { builds = {}, closures = {}, works = {} }
local crates = {}       -- [index] = объект
local blockades = {}
local buildProps = {}   -- [siteKey] = { объекты }
local roadProps = {}    -- [id] = { объекты }
local workProps = {}
local blips = {}
local nearCrate = nil
local nearSite = nil
local nearClosure = nil
local inQuarantine = false

local GOLDEN = 2.399963229728653

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

RegisterNetEvent('ls_city:notify', function(text) notify(text) end)

local function loadModel(model)
    local hash = GetHashKey(model)
    if not IsModelInCdimage(hash) then return nil end
    RequestModel(hash)
    local deadline = GetGameTimer() + 4000
    while not HasModelLoaded(hash) and GetGameTimer() < deadline do Wait(10) end
    if not HasModelLoaded(hash) then return nil end
    return hash
end

local function placeProp(model, x, y, heading)
    local hash = loadModel(model)
    if not hash then return nil end

    local found, groundZ = GetGroundZFor_3dCoord(x + 0.0, y + 0.0, 1000.0, false)
    if not found then groundZ = 0.0 end

    local object = CreateObject(hash, x + 0.0, y + 0.0, groundZ, false, false, false)
    PlaceObjectOnGroundProperly(object)
    SetEntityHeading(object, heading or 0.0)
    FreezeEntityPosition(object, true)
    SetModelAsNoLongerNeeded(hash)
    return object
end

local function drop(list)
    for _, object in ipairs(list or {}) do
        if DoesEntityExist(object) then DeleteEntity(object) end
    end
end

-- --- карантин ----------------------------------------------------------------

-- Ящики раскладываются от центра зоны по золотому углу: у всех одинаково,
-- и сервер может проверить номер, не зная координат.
local function cratePos(zone, index)
    local radius = zone.r * 0.8 * math.sqrt(index / Config.Quarantine.crates)
    local angle = index * GOLDEN
    return zone.x + radius * math.cos(angle), zone.y + radius * math.sin(angle)
end

local function clearQuarantine()
    drop(crates) crates = {}
    drop(blockades) blockades = {}
end

RegisterNetEvent('ls_city:looted', function(index)
    local object = crates[index]
    if object and DoesEntityExist(object) then DeleteEntity(object) end
    crates[index] = nil
    if state.quarantine then
        state.quarantine.looted = state.quarantine.looted or {}
        state.quarantine.looted[tostring(index)] = true
    end
end)

local function buildQuarantine()
    local zone = state.quarantine and state.quarantine.zone
    if not zone then clearQuarantine() return end

    local me = GetEntityCoords(PlayerPedId())
    if #(me - vector3(zone.x, zone.y, me.z)) > zone.r + 300.0 then
        clearQuarantine()
        return
    end

    local looted = (state.quarantine.looted or {})
    for index = 1, Config.Quarantine.crates do
        if not looted[tostring(index)] and not crates[index] then
            local x, y = cratePos(zone, index)
            if #(me - vector3(x, y, me.z)) < 200.0 then
                crates[index] = placeProp(Config.Quarantine.crateModel, x, y, (index * 37) % 360)
            end
        end
    end

    -- Блокпосты по кругу: въезды перекрыты, но зона не запечатана - кто
    -- очень хочет, тот пройдёт пешком, и это нормально.
    if #blockades == 0 then
        for index = 1, Config.Quarantine.blockades do
            local angle = (index / Config.Quarantine.blockades) * math.pi * 2
            local x = zone.x + zone.r * math.cos(angle)
            local y = zone.y + zone.r * math.sin(angle)
            if #(me - vector3(x, y, me.z)) < 300.0 then
                local model = Config.Quarantine.blockadeProps[
                    ((index - 1) % #Config.Quarantine.blockadeProps) + 1]
                local object = placeProp(model, x, y, math.deg(angle))
                if object then blockades[#blockades + 1] = object end
            end
        end
    end
end

-- --- стройка -----------------------------------------------------------------

local function buildSite(site)
    drop(buildProps[site.key])
    buildProps[site.key] = {}

    local stage = Config.Build.stages[site.stage]
    if not stage then return end

    -- Реквизит каждого этапа ставится кольцом вокруг центра площадки.
    for index, model in ipairs(stage.props) do
        local angle = (index / #stage.props) * math.pi * 2
        local x = site.x + 6.0 * math.cos(angle)
        local y = site.y + 6.0 * math.sin(angle)
        local object = placeProp(model, x, y, math.deg(angle) + 90.0)
        if object then buildProps[site.key][#buildProps[site.key] + 1] = object end
    end
end

-- --- перекрытия и работы -----------------------------------------------------

local function buildClosure(id, closure)
    if roadProps[id] then return end
    roadProps[id] = {}

    -- Поперёк дороги: ряд блоков по направлению взгляда того, кто ставил.
    local rad = math.rad(closure.h or 0.0)
    local steps = math.max(3, math.floor(Config.Road.width / 2.0))
    for index = 0, steps do
        local offset = (index - steps / 2) * 2.0
        local x = closure.x + math.cos(rad) * offset
        local y = closure.y + math.sin(rad) * offset
        local model = Config.Road.props[((index) % #Config.Road.props) + 1]
        local object = placeProp(model, x, y, (closure.h or 0.0) + 90.0)
        if object then roadProps[id][#roadProps[id] + 1] = object end
    end
end

-- --- карта -------------------------------------------------------------------

local function rebuildBlips()
    for _, blip in ipairs(blips) do RemoveBlip(blip) end
    blips = {}

    for _, site in ipairs(state.builds or {}) do
        local blip = AddBlipForCoord(site.x, site.y, site.z)
        SetBlipSprite(blip, Config.Build.blip.sprite)
        SetBlipColour(blip, Config.Build.blip.colour)
        SetBlipScale(blip, Config.Build.blip.scale)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(('Стройка — %s'):format(site.label))
        EndTextCommandSetBlipName(blip)
        blips[#blips + 1] = blip
    end

    for _, closure in ipairs(state.closures or {}) do
        local blip = AddBlipForCoord(closure.x, closure.y, 0.0)
        SetBlipSprite(blip, Config.Road.blip.sprite)
        SetBlipColour(blip, Config.Road.blip.colour)
        SetBlipScale(blip, Config.Road.blip.scale)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(closure.label or CityLocale.roadClosed)
        EndTextCommandSetBlipName(blip)
        blips[#blips + 1] = blip
    end

    local zone = state.quarantine and state.quarantine.zone
    if zone then
        local area = AddBlipForRadius(zone.x, zone.y, 0.0, zone.r)
        SetBlipColour(area, 1)
        SetBlipAlpha(area, 120)
        blips[#blips + 1] = area

        local marker = AddBlipForCoord(zone.x, zone.y, 0.0)
        SetBlipSprite(marker, 310)
        SetBlipColour(marker, 1)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName('КАРАНТИН — ' .. zone.label)
        EndTextCommandSetBlipName(marker)
        blips[#blips + 1] = marker
    end
end

RegisterNetEvent('ls_city:state', function(next)
    -- Перекрытия могли исчезнуть - реквизит должен уйти следом.
    local alive = {}
    for _, closure in ipairs((next or {}).closures or {}) do alive[closure.id] = true end
    for id, list in pairs(roadProps) do
        if not alive[id] then drop(list) roadProps[id] = nil end
    end

    state = next or state
    rebuildBlips()

    for _, site in ipairs(state.builds or {}) do buildSite(site) end
end)

-- --- главный цикл ------------------------------------------------------------

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(3000)
    TriggerServerEvent('ls_city:request')

    -- Постоянные дорожные работы ставятся один раз.
    for _, work in ipairs(Config.Road.works) do
        for index = 0, 3 do
            local rad = math.rad(work.h)
            local offset = (index - 1.5) * 2.0
            local object = placeProp(Config.Road.props[(index % #Config.Road.props) + 1],
                work.x + math.cos(rad) * offset, work.y + math.sin(rad) * offset, work.h + 90.0)
            if object then workProps[#workProps + 1] = object end
        end
    end

    while true do
        Wait(3000)
        local me = GetEntityCoords(PlayerPedId())

        buildQuarantine()

        for id, closure in pairs((function()
            local map = {}
            for _, row in ipairs(state.closures or {}) do map[row.id] = row end
            return map
        end)()) do
            if #(me - vector3(closure.x, closure.y, me.z)) < 200.0 then
                buildClosure(id, closure)
            elseif roadProps[id] then
                drop(roadProps[id])
                roadProps[id] = nil
            end
        end

        -- В карантине розыск не работает, и об этом надо напомнить.
        local zone = state.quarantine and state.quarantine.zone
        local nowIn = zone and #(me - vector3(zone.x, zone.y, me.z)) <= zone.r or false
        if nowIn and not inQuarantine then notify(CityLocale.quarantineIn) end
        inQuarantine = nowIn
    end
end)

-- --- что рядом ---------------------------------------------------------------

CreateThread(function()
    while true do
        Wait(700)
        local me = GetEntityCoords(PlayerPedId())
        nearCrate, nearSite, nearClosure = nil, nil, nil

        for index, object in pairs(crates) do
            if DoesEntityExist(object)
                and #(me - GetEntityCoords(object)) <= Config.Interact then
                nearCrate = index
                break
            end
        end

        for _, site in ipairs(state.builds or {}) do
            if #(me - vector3(site.x, site.y, site.z)) <= 6.0 then
                nearSite = site
                break
            end
        end

        for _, closure in ipairs(state.closures or {}) do
            if #(me - vector3(closure.x, closure.y, me.z)) <= 12.0 then
                nearClosure = closure.id
                break
            end
        end
    end
end)

local function isOnDuty()
    local ok, duty = pcall(function() return exports.ls_police:isOnDuty() end)
    return ok and duty == true
end

AddEventHandler('ls_interact:collect', function()
    if nearCrate then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_city:loot', label = CityLocale.lootPrompt, order = 5,
        })
    end

    if nearSite then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_city:build', label = ('%s — %s'):format(
                CityLocale.donatePrompt, nearSite.stageLabel), order = 25,
        })
    end

    if isOnDuty() then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_city:closeRoad', label = CityLocale.roadPrompt,
            group = 'police', order = 33,
        })
        if nearClosure then
            TriggerEvent('ls_interact:offer', {
                id = 'ls_city:openRoad', label = CityLocale.roadOpenPrompt,
                group = 'police', order = 34,
            })
        end
    end
end)

AddEventHandler('ls_interact:run', function(id)
    if id == 'ls_city:loot' and nearCrate then
        TriggerServerEvent('ls_city:loot', nearCrate)
    elseif id == 'ls_city:build' and nearSite then
        TriggerEvent('ls_city:askDonation', nearSite)
    elseif id == 'ls_city:closeRoad' then
        TriggerServerEvent('ls_city:closeRoad')
    elseif id == 'ls_city:openRoad' and nearClosure then
        TriggerServerEvent('ls_city:openRoad', nearClosure)
    end
end)

-- Сумма взноса набирается в чате: ради одного числа отдельное окно с
-- курсором - перебор.
AddEventHandler('ls_city:askDonation', function(site)
    notify(('~b~%s~w~: введи /donate <сумма>'):format(site.label))
end)

RegisterCommand('donate', function(_, args)
    if not nearSite then
        notify('~r~Встань на стройплощадке')
        return
    end
    local amount = tonumber(args[1])
    if not amount then
        notify('~y~/donate <сумма>')
        return
    end
    TriggerServerEvent('ls_city:donate', nearSite.key, amount)
end, false)

-- --- табличка с именами ------------------------------------------------------

CreateThread(function()
    while true do
        local wait = 500
        if nearSite then
            wait = 0
            local site = nearSite
            SetDrawOrigin(site.x, site.y, site.z + 2.2, 0)

            local lines = { ('%s — %s'):format(site.label, site.stageLabel) }
            if site.need > 0 then
                lines[#lines + 1] = ('Собрано %d из %d'):format(site.raised, site.need)
            end
            if #(site.donors or {}) > 0 then
                lines[#lines + 1] = CityLocale.plaqueTitle
                for index, donor in ipairs(site.donors) do
                    if index > Config.Build.plaque then break end
                    lines[#lines + 1] = ('%s — $%d'):format(donor.name, donor.sum)
                end
            end

            for index, line in ipairs(lines) do
                SetTextFont(4)
                SetTextScale(index == 1 and 0.36 or 0.28, index == 1 and 0.36 or 0.28)
                SetTextCentre(true)
                SetTextOutline()
                BeginTextCommandDisplayText('STRING')
                AddTextComponentSubstringPlayerName(line)
                EndTextCommandDisplayText(0.0, (index - 1) * 0.022)
            end

            ClearDrawOrigin()
        end
        Wait(wait)
    end
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    for _, blip in ipairs(blips) do RemoveBlip(blip) end
    clearQuarantine()
    drop(workProps)
    for _, list in pairs(buildProps) do drop(list) end
    for _, list in pairs(roadProps) do drop(list) end
end)
