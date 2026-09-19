-- Server side: validates every purchase, keeps appearance between sessions.
-- The wallet itself belongs to phone_garage, reached through its exports.

local RES = GetCurrentResourceName()
local LOOKS_FILE = 'looks.json'
local OUTFITS_FILE = 'outfits.json'
local SHOPS_FILE = 'custom_shops.json'

local looks = {}        -- [identifier] = { components = {...}, props = {...}, hair = {...}, overlays = {...} }
local outfits = {}      -- [identifier] = { { id = 'o3', name = 'Работа', look = {...} } }
local customShops = {}
local dirty = false

local MAX_OUTFITS = 20

local function readJson(file, fallback)
    local raw = LoadResourceFile(RES, file)
    if not raw or raw == '' then return fallback end
    local ok, decoded = pcall(json.decode, raw)
    if not ok or type(decoded) ~= 'table' then
        print(('[ls_shops] %s is corrupt, starting from scratch'):format(file))
        return fallback
    end
    return decoded
end

local function save()
    SaveResourceFile(RES, LOOKS_FILE, json.encode(looks), -1)
    SaveResourceFile(RES, OUTFITS_FILE, json.encode(outfits), -1)
    SaveResourceFile(RES, SHOPS_FILE, json.encode(customShops), -1)
    dirty = false
end

local function identifierOf(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 8) == 'license:' then return id end
    end
    return 'name:' .. GetPlayerName(src)
end

local function notify(src, text)
    TriggerClientEvent('ls_shops:notify', src, text)
end

local function charge(src, amount)
    amount = math.floor(tonumber(amount) or 0)
    if amount <= 0 then return true end
    local ok, result = pcall(function()
        return exports.phone_garage:removeMoney(src, amount)
    end)
    if not ok then
        print('[ls_shops] phone_garage is not running - purchases cannot be charged')
        return false
    end
    return result == true
end

-- --- lifecycle -------------------------------------------------------------

AddEventHandler('onResourceStart', function(name)
    if name ~= RES then return end
    looks = readJson(LOOKS_FILE, {})
    outfits = readJson(OUTFITS_FILE, {})
    customShops = readJson(SHOPS_FILE, {})
    local n = 0
    for _ in pairs(looks) do n = n + 1 end
    print(('[ls_shops] loaded %d looks, %d custom shops'):format(n, #customShops))
end)

-- Выход игрока - момент, когда его данные обязаны оказаться на диске.
-- Одного таймера на минуту мало: купил что-то, вышел через полминуты, и
-- покупки нет. Рестарт сервера теряет ровно так же.
AddEventHandler('playerDropped', function()
    if dirty then save() end
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

-- --- sync ------------------------------------------------------------------

local function pushSync(src)
    local id = identifierOf(src)
    TriggerClientEvent('ls_shops:sync', src, {
        look = looks[id],
        outfits = outfits[id] or {},
        shops = customShops,
    })
end

RegisterNetEvent('ls_shops:requestSync', function()
    pushSync(source)
end)

-- The client sends the look it ended up with; it is cosmetic only, so it is
-- stored as-is after a shape check rather than re-validated slot by slot.
RegisterNetEvent('ls_shops:saveLook', function(look)
    local src = source
    if type(look) ~= 'table' then return end
    if type(look.components) ~= 'table' or type(look.props) ~= 'table' then return end

    looks[identifierOf(src)] = {
        components = look.components,
        props = look.props,
        hair = type(look.hair) == 'table' and look.hair or nil,
        overlays = type(look.overlays) == 'table' and look.overlays or nil,
    }
    dirty = true
    save()
end)

-- --- wardrobe --------------------------------------------------------------

local function looksValid(look)
    return type(look) == 'table'
        and type(look.components) == 'table'
        and type(look.props) == 'table'
end

RegisterNetEvent('ls_shops:saveOutfit', function(name, look)
    local src = source
    if not looksValid(look) then return end

    local id = identifierOf(src)
    outfits[id] = outfits[id] or {}

    if #outfits[id] >= MAX_OUTFITS then
        notify(src, ('~r~Гардероб полон (максимум %d)'):format(MAX_OUTFITS))
        return
    end

    name = type(name) == 'string' and name:gsub('^%s+', ''):gsub('%s+$', ''):sub(1, 24) or ''
    if name == '' then name = 'Образ ' .. tostring(#outfits[id] + 1) end

    outfits[id][#outfits[id] + 1] = {
        id = tostring(math.random(100000, 999999)) .. tostring(#outfits[id]),
        name = name,
        look = {
            components = look.components,
            props = look.props,
            hair = type(look.hair) == 'table' and look.hair or nil,
            overlays = type(look.overlays) == 'table' and look.overlays or nil,
        },
    }
    dirty = true
    save()
    pushSync(src)
    notify(src, ('~g~Образ сохранён: %s'):format(name))
end)

RegisterNetEvent('ls_shops:deleteOutfit', function(outfitId)
    local src = source
    if type(outfitId) ~= 'string' then return end

    local id = identifierOf(src)
    for index, outfit in ipairs(outfits[id] or {}) do
        if outfit.id == outfitId then
            table.remove(outfits[id], index)
            dirty = true
            save()
            pushSync(src)
            notify(src, '~g~Образ удалён')
            return
        end
    end
end)

-- Wearing an outfit is free, but it becomes the look that gets restored on join.
RegisterNetEvent('ls_shops:wearOutfit', function(outfitId)
    local src = source
    if type(outfitId) ~= 'string' then return end

    local id = identifierOf(src)
    for _, outfit in ipairs(outfits[id] or {}) do
        if outfit.id == outfitId then
            looks[id] = outfit.look
            dirty = true
            save()
            TriggerClientEvent('ls_shops:applyOutfit', src, outfit.look)
            notify(src, ('~g~Надето: %s'):format(outfit.name))
            return
        end
    end
    notify(src, '~r~Образ не найден')
end)

-- --- purchases -------------------------------------------------------------

RegisterNetEvent('ls_shops:payStyle', function(kind, slots)
    local src = source
    slots = math.floor(tonumber(slots) or 0)
    if slots <= 0 then
        TriggerClientEvent('ls_shops:styleResult', src, true)
        return
    end

    local perSlot = (kind == 'barber') and Config.BarberSlotPrice or Config.ClothingSlotPrice
    local total = perSlot * slots

    if charge(src, total) then
        notify(src, ('~g~Оплачено $%d'):format(total))
        TriggerClientEvent('ls_shops:styleResult', src, true)
    else
        notify(src, '~r~Не хватает денег')
        TriggerClientEvent('ls_shops:styleResult', src, false)
    end
end)

-- Ammu-Nation and 24/7 stock comes from ls_inventory, which only exposes it
-- server-side, so the shop menu is filled from here.
RegisterNetEvent('ls_shops:requestStock', function(kind)
    local src = source
    if type(kind) ~= 'string' then return end

    local allowed = Config.Sells[kind]
    if not allowed then return end

    local ok, stock = pcall(function() return exports.ls_inventory:listItems() end)
    if not ok or type(stock) ~= 'table' then
        notify(src, '~r~Магазин недоступен: ls_inventory не отвечает')
        return
    end

    local items = {}
    for _, entry in ipairs(stock) do
        -- Серьёзные стволы в свободной продаже не бывают: в мир они
        -- попадают только через склад госфракции.
        local blocked = entry.tier == 'serious'
        if allowed[entry.kind] and (tonumber(entry.price) or 0) > 0 and not blocked then
            items[#items + 1] = {
                item = entry.item,
                label = entry.label,
                price = entry.price,
                -- kind нужен витрине, чтобы выбрать иконку.
                kind = entry.kind,
                note = entry.addon and 'мод' or nil,
            }
        end
    end
    table.sort(items, function(a, b) return a.price < b.price end)

    TriggerClientEvent('ls_shops:stock', src, kind, items)
end)

-- Buying puts the item in the inventory - nothing is equipped or eaten here.
-- Order matters: check the shop sells it, check it fits, charge, hand it over.
RegisterNetEvent('ls_shops:purchase', function(shopKind, item)
    local src = source
    if type(item) ~= 'string' or type(shopKind) ~= 'string' then return end

    local allowed = Config.Sells[shopKind]
    if not allowed then
        notify(src, '~r~Здесь это не продаётся')
        return
    end

    -- Витрину клиент может и не спрашивать - событие приходит от него.
    local okDef, def = pcall(function() return exports.ls_inventory:getItemDef(item) end)
    if okDef and type(def) == 'table' and def.tier == 'serious' then
        notify(src, '~r~Такое в свободной продаже не бывает')
        return
    end

    local ok, def = pcall(function()
        return exports.ls_inventory:getItemDef(item)
    end)
    if not ok then
        print('[ls_shops] ls_inventory is not running - nothing can be sold')
        notify(src, '~r~Магазин недоступен')
        return
    end
    if type(def) ~= 'table' or not allowed[def.type] then
        notify(src, '~r~Здесь это не продаётся')
        return
    end

    local price = math.floor(tonumber(def.price) or 0)
    if price <= 0 then
        notify(src, '~r~У товара нет цены')
        return
    end

    if exports.ls_inventory:canCarry(src, item, 1) ~= true then
        notify(src, '~r~В инвентаре нет места')
        return
    end

    if not charge(src, price) then
        notify(src, '~r~Не хватает денег')
        return
    end

    if exports.ls_inventory:giveItem(src, item, 1) ~= true then
        -- Should not happen after canCarry, but never keep the money if it does.
        exports.phone_garage:addMoney(src, price)
        notify(src, '~r~Не поместилось, деньги возвращены')
        return
    end

    notify(src, ('~g~Куплено: %s — в инвентаре'):format(def.label or item))
end)

-- --- /shophere -------------------------------------------------------------

RegisterNetEvent('ls_shops:addShop', function(shop)
    local src = source
    if type(shop) ~= 'table' then return end
    if not Config.Types[shop.type] then
        notify(src, '~r~Неизвестный тип магазина')
        return
    end

    local x, y, z = tonumber(shop.x), tonumber(shop.y), tonumber(shop.z)
    if not (x and y and z) then return end

    customShops[#customShops + 1] = {
        type = shop.type,
        x = x, y = y, z = z,
        label = type(shop.label) == 'string' and shop.label:sub(1, 40) or 'Своя точка',
    }
    dirty = true
    save()

    for _, id in ipairs(GetPlayers()) do
        pushSync(tonumber(id))
    end
    notify(src, '~g~Точка записана')
end)
