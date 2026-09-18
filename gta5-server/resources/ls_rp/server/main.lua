-- Server side: documents and everything that moves between two players.
-- Distance is re-checked here, so a faked request cannot reach across the map.

local RES = GetCurrentResourceName()
local DATA_FILE = 'documents.json'

local documents = {}   -- [identifier] = { { id, kind, data } }
local dirty = false

local function readJson(file, fallback)
    local raw = LoadResourceFile(RES, file)
    if not raw or raw == '' then return fallback end
    local ok, decoded = pcall(json.decode, raw)
    if not ok or type(decoded) ~= 'table' then
        print(('[ls_rp] %s is corrupt, starting from scratch'):format(file))
        return fallback
    end
    return decoded
end

local function save()
    SaveResourceFile(RES, DATA_FILE, json.encode(documents), -1)
    dirty = false
end

local function identifierOf(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 8) == 'license:' then return id end
    end
    return 'name:' .. GetPlayerName(src)
end

local function docsOf(src)
    local id = identifierOf(src)
    documents[id] = documents[id] or {}
    return documents[id], id
end

local function newId()
    return ('%x%x'):format(math.random(0x100000, 0xffffff), math.random(0x100, 0xfff))
end

local function notify(src, text)
    TriggerClientEvent('ls_rp:notify', src, text)
end

local function character(src)
    local ok, char = pcall(function() return exports.ls_character:getCharacter(src) end)
    return ok and char or nil
end

local function today()
    return os.date('%d.%m.%Y')
end

-- --- issuing ---------------------------------------------------------------

local function findDoc(list, predicate)
    for index, doc in ipairs(list) do
        if predicate(doc) then return doc, index end
    end
    return nil
end

-- A passport comes with the character; the date of birth is rolled once and
-- then lives with the document.
local function ensurePassport(src)
    local list = docsOf(src)
    local char = character(src)
    if not char then return end

    local existing = findDoc(list, function(doc) return doc.kind == 'passport' end)
    if existing then
        -- Keep it in step if an admin renamed the player.
        existing.data.first = char.first
        existing.data.last = char.last
        existing.data.static = char.static
        dirty = true
        return
    end

    local age = math.random(18, 45)
    local year = tonumber(os.date('%Y')) - age

    list[#list + 1] = {
        id = newId(),
        kind = 'passport',
        data = {
            first = char.first,
            last = char.last,
            gender = char.gender == 'female' and 'Ж' or 'М',
            static = char.static,
            birth = ('%02d.%02d.%d'):format(math.random(1, 28), math.random(1, 12), year),
            issued = today(),
        },
    }
    dirty = true
end

-- One registration per owned car: issue for new cars, drop for cars that left.
local function syncVehicleDocs(src)
    local list = docsOf(src)
    local char = character(src)

    local ok, cars = pcall(function() return exports.phone_garage:getCars(src) end)
    if not ok or type(cars) ~= 'table' then return end

    local owned = {}
    for _, car in ipairs(cars) do owned[car.plate] = car end

    for index = #list, 1, -1 do
        local doc = list[index]
        if doc.kind == 'vehicle' and not owned[doc.data.plate] then
            table.remove(list, index)
            dirty = true
        end
    end

    for plate, car in pairs(owned) do
        local existing = findDoc(list, function(doc)
            return doc.kind == 'vehicle' and doc.data.plate == plate
        end)
        if not existing then
            list[#list + 1] = {
                id = newId(),
                kind = 'vehicle',
                data = {
                    plate = plate,
                    label = car.label or car.model,
                    model = car.model,
                    owner = char and ('%s %s'):format(char.first, char.last) or GetPlayerName(src),
                    static = char and char.static or 0,
                    issued = today(),
                },
            }
            dirty = true
        end
    end
end

local function sync(src)
    ensurePassport(src)
    syncVehicleDocs(src)
    if dirty then save() end
    TriggerClientEvent('ls_rp:documents', src, docsOf(src))
end

-- --- lifecycle -------------------------------------------------------------

AddEventHandler('onResourceStart', function(name)
    if name ~= RES then return end
    math.randomseed(os.time())
    documents = readJson(DATA_FILE, {})
    local n = 0
    for _ in pairs(documents) do n = n + 1 end
    print(('[ls_rp] loaded documents for %d players'):format(n))
end)

AddEventHandler('onResourceStop', function(name)
    if name == RES then save() end
end)

CreateThread(function()
    while true do
        Wait(60000)
        if dirty then save() end
    end
end)

RegisterNetEvent('ls_rp:request', function()
    sync(source)
end)

-- --- distance --------------------------------------------------------------

local function nearEachOther(a, b)
    local pedA, pedB = GetPlayerPed(a), GetPlayerPed(b)
    if not pedA or not pedB or pedA == 0 or pedB == 0 then return false end
    return #(GetEntityCoords(pedA) - GetEntityCoords(pedB)) <= Config.MaxGiveDistance
end

local function targetOk(src, targetId)
    targetId = tonumber(targetId)
    if not targetId or targetId == src then return nil end
    if GetPlayerName(targetId) == nil then return nil end
    if not nearEachOther(src, targetId) then
        notify(src, '~r~Слишком далеко')
        return nil
    end
    return targetId
end

-- --- showing and handing over ----------------------------------------------

RegisterNetEvent('ls_rp:show', function(targetId, docId)
    local src = source
    targetId = targetOk(src, targetId)
    if not targetId or type(docId) ~= 'string' then return end

    local list = docsOf(src)
    local doc = findDoc(list, function(entry) return entry.id == docId end)
    if not doc then return end

    local char = character(src)
    local from = char and ('%s %s'):format(char.first, char.last) or GetPlayerName(src)

    TriggerClientEvent('ls_rp:viewDocument', targetId, doc, from)
    notify(src, ('Документ показан: %s'):format(Config.DocumentLabels[doc.kind] or doc.kind))
end)

RegisterNetEvent('ls_rp:giveDocument', function(targetId, docId)
    local src = source
    targetId = targetOk(src, targetId)
    if not targetId or type(docId) ~= 'string' then return end

    local list = docsOf(src)
    local doc, index = findDoc(list, function(entry) return entry.id == docId end)
    if not doc then return end

    -- A registration is the car: handing it over moves the vehicle too.
    if doc.kind == 'vehicle' then
        local ok, moved = pcall(function()
            return exports.phone_garage:transferCar(src, targetId, doc.data.plate)
        end)
        if not ok or moved ~= true then
            notify(src, '~r~Машина не передалась, документ остался у тебя')
            return
        end
    end

    table.remove(list, index)
    local targetList = docsOf(targetId)
    targetList[#targetList + 1] = doc
    dirty = true
    save()

    sync(src)
    sync(targetId)

    local label = Config.DocumentLabels[doc.kind] or doc.kind
    notify(src, ('~g~Передано: %s'):format(label))
    notify(targetId, ('~g~Тебе передали: %s'):format(label))
end)

RegisterNetEvent('ls_rp:giveMoney', function(targetId, amount)
    local src = source
    targetId = targetOk(src, targetId)
    amount = math.floor(tonumber(amount) or 0)
    if not targetId or amount <= 0 then return end

    local ok, taken = pcall(function()
        return exports.phone_garage:removeMoney(src, amount)
    end)
    if not ok or taken ~= true then
        notify(src, '~r~Не хватает денег')
        return
    end

    exports.phone_garage:addMoney(targetId, amount)
    notify(src, ('~g~Передано $%d'):format(amount))
    notify(targetId, ('~g~Тебе передали $%d'):format(amount))
end)

RegisterNetEvent('ls_rp:giveItem', function(targetId, slot)
    local src = source
    targetId = targetOk(src, targetId)
    if not targetId then return end

    -- Take it first so the item is never in two inventories at once; if the
    -- other side has no room it goes straight back below.
    local ok, taken = pcall(function() return exports.ls_inventory:takeSlot(src, slot) end)
    if not ok or type(taken) ~= 'string' then
        notify(src, '~r~Слот пуст')
        return
    end

    local given
    ok, given = pcall(function() return exports.ls_inventory:giveItem(targetId, taken, 1) end)
    if not ok or given ~= true then
        -- Put it straight back rather than deleting it.
        exports.ls_inventory:giveItem(src, taken, 1)
        notify(src, '~r~У него нет места в инвентаре')
        return
    end

    local def = exports.ls_inventory:getItemDef(taken)
    local label = (type(def) == 'table' and def.label) or taken
    notify(src, ('~g~Передано: %s'):format(label))
    notify(targetId, ('~g~Тебе передали: %s'):format(label))
end)

-- --- medical card ----------------------------------------------------------

RegisterNetEvent('ls_rp:buyMedCard', function()
    local src = source
    local list = docsOf(src)

    if findDoc(list, function(doc) return doc.kind == 'medcard' end) then
        notify(src, 'Медсправка уже есть')
        return
    end

    local char = character(src)
    if not char then
        notify(src, '~r~Сначала создай персонажа')
        return
    end

    local ok, paid = pcall(function()
        return exports.phone_garage:removeMoney(src, Config.MedCardPrice)
    end)
    if not ok or paid ~= true then
        notify(src, '~r~Не хватает денег')
        return
    end

    list[#list + 1] = {
        id = newId(),
        kind = 'medcard',
        data = {
            first = char.first,
            last = char.last,
            static = char.static,
            blood = Config.BloodTypes[math.random(#Config.BloodTypes)],
            issued = today(),
        },
    }
    dirty = true
    save()
    sync(src)
    notify(src, '~g~Медсправка выдана')
end)

-- --- commands --------------------------------------------------------------

-- The classic RP shorthands, alongside the E menu.
local function showByKind(src, kind, targetId)
    targetId = targetOk(src, targetId)
    if not targetId then return end

    local doc = findDoc(docsOf(src), function(entry) return entry.kind == kind end)
    if not doc then
        notify(src, '~r~У тебя нет такого документа')
        return
    end
    local char = character(src)
    local from = char and ('%s %s'):format(char.first, char.last) or GetPlayerName(src)
    TriggerClientEvent('ls_rp:viewDocument', targetId, doc, from)
end

RegisterCommand('pass', function(src, args)
    if src ~= 0 then showByKind(src, 'passport', args[1]) end
end, false)

RegisterCommand('card', function(src, args)
    if src ~= 0 then showByKind(src, 'medcard', args[1]) end
end, false)
