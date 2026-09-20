-- Семейные схроны.
--
-- Схрон - это точка в мире, о которой знает только своя семья. Всё, что
-- решает, кто свой, живёт в ls_property: здесь мы только спрашиваем.
--
-- Чужой схрон можно вскрыть - и это главное, ради чего он существует.
-- Тайник, который нельзя потерять, ничем не отличается от банковской
-- ячейки, а на анархии вещи должны уметь пропадать.

local RES = GetCurrentResourceName()
local DATA_FILE = 'stash.json'

local stashes = {}      -- [id] = { family, familyName, x, y, z, place, storage }
local nextId = 1
local raiding = {}      -- [src] = id, кто что сейчас вскрывает
local lastCall = {}
local dirty = false

local function notify(src, text)
    TriggerClientEvent('ls_stash:notify', src, text)
end

local function throttled(src)
    local now = GetGameTimer()
    if lastCall[src] and now - lastCall[src] < Config.Cooldown then return true end
    lastCall[src] = now
    return false
end

local function coordsOf(src)
    local ped = GetPlayerPed(src)
    if ped == 0 then return nil end
    return GetEntityCoords(ped)
end

local function familyOf(src)
    local ok, family = pcall(function() return exports.ls_property:familyOf(src) end)
    if ok and type(family) == 'table' and family.id then return family end
    return nil
end

local function itemLabel(item)
    local ok, def = pcall(function() return exports.ls_inventory:getItemDef(item) end)
    if ok and type(def) == 'table' and def.label then return def.label end
    return item
end

local function giveItem(src, item, count)
    local ok, done = pcall(function() return exports.ls_inventory:giveItem(src, item, count) end)
    return ok and done == true
end

local function takeItem(src, item, count)
    local ok, done = pcall(function() return exports.ls_inventory:takeItem(src, item, count) end)
    return ok and done == true
end

local function canCarry(src, item, count)
    local ok, fits = pcall(function() return exports.ls_inventory:canCarry(src, item, count) end)
    return ok and fits == true
end

local function hasItem(src, item)
    local ok, inv = pcall(function() return exports.ls_inventory:getInventory(src) end)
    if not ok or type(inv) ~= 'table' then return false end
    for _, entry in ipairs(inv.slots or {}) do
        if entry.item == item then return true end
    end
    return false
end

-- --- хранение ------------------------------------------------------------------

local function save()
    SaveResourceFile(RES, DATA_FILE, json.encode({
        stashes = stashes, nextId = nextId,
    }), -1)
    dirty = false
end

local function load()
    local raw = LoadResourceFile(RES, DATA_FILE)
    if not raw or raw == '' then return end
    local ok, data = pcall(json.decode, raw)
    if not ok or type(data) ~= 'table' then
        print('[ls_stash] stash.json битый, начинаю с нуля')
        return
    end
    stashes = data.stashes or {}
    nextId = tonumber(data.nextId) or 1
end

CreateThread(function()
    load()
    while true do
        Wait(60000)
        if dirty then save() end
    end
end)

AddEventHandler('onResourceStop', function(name)
    if name == RES and dirty then save() end
end)

-- --- рассылка ------------------------------------------------------------------

-- Игрок видит только схроны своей семьи. Это не украшение: чужой схрон,
-- подсвеченный на карте, перестаёт быть схроном.
local function pushFor(src)
    local family = familyOf(src)
    local rows = {}
    if family then
        for id, stash in pairs(stashes) do
            if stash.family == family.id then
                rows[#rows + 1] = {
                    id = id, x = stash.x, y = stash.y, z = stash.z, place = stash.place,
                }
            end
        end
    end
    TriggerClientEvent('ls_stash:mine', src, rows)
end

local function pushFamily(familyId)
    for _, src in ipairs(GetPlayers()) do
        src = tonumber(src)
        local family = familyOf(src)
        if family and family.id == familyId then pushFor(src) end
    end
end

RegisterNetEvent('ls_stash:request', function() pushFor(source) end)

local function countFor(familyId)
    local n = 0
    for _, stash in pairs(stashes) do
        if stash.family == familyId then n = n + 1 end
    end
    return n
end

-- --- закладка ------------------------------------------------------------------

RegisterNetEvent('ls_stash:place', function(place)
    local src = source
    if throttled(src) then return end

    local family = familyOf(src)
    if not family then notify(src, StashLocale.needFamily) return end

    if countFor(family.id) >= Config.MaxPerFamily then
        notify(src, StashLocale.tooMany:format(Config.MaxPerFamily))
        return
    end

    local coords = coordsOf(src)
    if not coords then return end

    -- Два схрона в двух шагах - это один большой склад в обход лимита.
    for _, stash in pairs(stashes) do
        if #(coords - vector3(stash.x, stash.y, stash.z)) < Config.MinApart then
            notify(src, StashLocale.tooClose)
            return
        end
    end

    if not hasItem(src, Config.Kit) then notify(src, StashLocale.needKit) return end
    if not takeItem(src, Config.Kit, 1) then notify(src, StashLocale.needKit) return end

    local id = tostring(nextId)
    nextId = nextId + 1
    stashes[id] = {
        family = family.id,
        familyName = family.name,
        x = coords.x, y = coords.y, z = coords.z,
        place = type(place) == 'string' and place:sub(1, 40) or 'где-то',
        storage = {},
        placedAt = os.time(),
    }

    dirty = true
    notify(src, StashLocale.placed)
    pushFamily(family.id)
end)

RegisterNetEvent('ls_stash:drop', function(id)
    local src = source
    local stash = stashes[tostring(id)]
    if not stash then return end

    local family = familyOf(src)
    if not family or family.id ~= stash.family then
        notify(src, StashLocale.notYours)
        return
    end

    -- Содержимое не испаряется: что не забрали, то и потеряли, и об этом
    -- лучше узнать до того, как снимешь.
    stashes[tostring(id)] = nil
    dirty = true
    notify(src, StashLocale.removed)
    pushFamily(family.id)
end)

-- --- содержимое ----------------------------------------------------------------

local function nearStash(src, id)
    local stash = stashes[tostring(id)]
    if not stash then return nil end
    local coords = coordsOf(src)
    if not coords then return nil end
    if #(coords - vector3(stash.x, stash.y, stash.z)) > Config.Interact + 3.0 then return nil end
    return stash
end

local function contentsOf(stash)
    local rows = {}
    for slot, entry in ipairs(stash.storage) do
        rows[#rows + 1] = {
            slot = slot, item = entry.item, count = entry.count,
            label = itemLabel(entry.item),
        }
    end
    return rows
end

RegisterNetEvent('ls_stash:open', function(id)
    local src = source
    local stash = nearStash(src, id)
    if not stash then return end

    local family = familyOf(src)
    if not family or family.id ~= stash.family then
        notify(src, StashLocale.notYours)
        return
    end

    TriggerClientEvent('ls_stash:contents', src, tostring(id), contentsOf(stash))
end)

RegisterNetEvent('ls_stash:put', function(id, item, count)
    local src = source
    local stash = nearStash(src, id)
    if not stash then return end

    local family = familyOf(src)
    if not family or family.id ~= stash.family then
        notify(src, StashLocale.notYours)
        return
    end

    if type(item) ~= 'string' then return end
    count = math.floor(tonumber(count) or 0)
    if count < 1 then return end

    -- Сначала место, потом предмет: иначе вещь исчезнет из инвентаря и
    -- не появится в схроне.
    local slot
    for index, entry in ipairs(stash.storage) do
        if entry.item == item then slot = index break end
    end
    if not slot and #stash.storage >= Config.Slots then
        notify(src, StashLocale.full)
        return
    end

    if not takeItem(src, item, count) then return end

    if slot then
        stash.storage[slot].count = stash.storage[slot].count + count
    else
        stash.storage[#stash.storage + 1] = { item = item, count = count }
    end

    dirty = true
    notify(src, StashLocale.stored:format(itemLabel(item), count))
    TriggerClientEvent('ls_stash:contents', src, tostring(id), contentsOf(stash))
end)

RegisterNetEvent('ls_stash:take', function(id, slot)
    local src = source
    local stash = nearStash(src, id)
    if not stash then return end

    local family = familyOf(src)
    if not family or family.id ~= stash.family then
        notify(src, StashLocale.notYours)
        return
    end

    slot = math.floor(tonumber(slot) or 0)
    local entry = stash.storage[slot]
    if not entry then return end

    if not canCarry(src, entry.item, entry.count) then
        notify(src, StashLocale.noRoom)
        return
    end
    if not giveItem(src, entry.item, entry.count) then
        notify(src, StashLocale.noRoom)
        return
    end

    notify(src, StashLocale.tookOut:format(itemLabel(entry.item), entry.count))
    table.remove(stash.storage, slot)
    dirty = true
    TriggerClientEvent('ls_stash:contents', src, tostring(id), contentsOf(stash))
end)

-- --- вскрытие ------------------------------------------------------------------

RegisterNetEvent('ls_stash:raidStart', function(id)
    local src = source
    if throttled(src) then return end

    local stash = nearStash(src, id)
    if not stash then return end

    local family = familyOf(src)
    if family and family.id == stash.family then return end

    if not hasItem(src, Config.Raid.tool) then
        notify(src, StashLocale.raidNeed)
        return
    end

    raiding[src] = tostring(id)

    -- Пока вскрывают, схрон виден всем: у семьи должен быть шанс приехать.
    local coords = coordsOf(src)
    if coords then
        pcall(function()
            return exports.ls_world:hotspot('stash:' .. tostring(id),
                'ВСКРЫВАЮТ СХРОН', coords.x, coords.y, coords.z,
                Config.Raid.hotspotSeconds)
        end)
    end

    for _, other in ipairs(GetPlayers()) do
        other = tonumber(other)
        local fam = familyOf(other)
        if fam and fam.id == stash.family then
            notify(other, StashLocale.robbed:format(stash.place or 'городе'))
        end
    end

    pcall(function() return exports.ls_police:reportCrime(src, Config.Raid.crime) end)
    TriggerClientEvent('ls_stash:raidGo', src, Config.Raid.seconds)
end)

RegisterNetEvent('ls_stash:raidDone', function()
    local src = source
    local id = raiding[src]
    raiding[src] = nil
    if not id then return end

    local stash = nearStash(src, id)
    if not stash then return end

    local family = familyOf(src)
    if family and family.id == stash.family then return end

    -- Что влезло - унёс, остальное пропало вместе со схроном. Иначе
    -- вскрытие превращается в бесконечный кран.
    for _, entry in ipairs(stash.storage) do
        if canCarry(src, entry.item, entry.count) then
            giveItem(src, entry.item, entry.count)
        end
    end

    local owner = stash.family
    stashes[id] = nil
    dirty = true
    notify(src, StashLocale.raided)
    pushFamily(owner)
    pushFor(src)
end)

-- Чужой схрон клиент знать не должен - иначе достаточно прочитать свою же
-- память, чтобы получить карту всех тайников сервера. Поэтому о нём
-- сообщаем только тому, кто на него натурально наступил, и только пока он
-- рядом.
local foreignNear = {}      -- [src] = id, о котором игроку уже сказали

CreateThread(function()
    while true do
        Wait(2000)
        for _, player in ipairs(GetPlayers()) do
            local src = tonumber(player)
            local coords = coordsOf(src)
            local family = familyOf(src)
            local found = nil

            if coords then
                for id, stash in pairs(stashes) do
                    if (not family or family.id ~= stash.family)
                        and #(coords - vector3(stash.x, stash.y, stash.z)) <= Config.Interact then
                        found = id
                        break
                    end
                end
            end

            if foreignNear[src] ~= found then
                foreignNear[src] = found
                TriggerClientEvent('ls_stash:foreign', src, found)
            end
        end
    end
end)

AddEventHandler('playerDropped', function()
    local src = source
    raiding[src] = nil
    lastCall[src] = nil
    foreignNear[src] = nil
end)
