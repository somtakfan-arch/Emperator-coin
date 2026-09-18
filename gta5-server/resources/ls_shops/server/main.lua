-- Server side: validates every purchase, keeps appearance between sessions.
-- The wallet itself belongs to phone_garage, reached through its exports.

local RES = GetCurrentResourceName()
local LOOKS_FILE = 'looks.json'
local SHOPS_FILE = 'custom_shops.json'

local looks = {}        -- [identifier] = { components = {...}, props = {...}, hair = {...}, overlays = {...} }
local customShops = {}
local dirty = false

local ammuByItem, storeByItem = {}, {}
for _, entry in ipairs(Config.AmmuCatalog) do ammuByItem[entry.item] = entry end
for _, entry in ipairs(Config.StoreCatalog) do storeByItem[entry.item] = entry end

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
    customShops = readJson(SHOPS_FILE, {})
    local n = 0
    for _ in pairs(looks) do n = n + 1 end
    print(('[ls_shops] loaded %d looks, %d custom shops'):format(n, #customShops))
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

RegisterNetEvent('ls_shops:requestSync', function()
    local src = source
    TriggerClientEvent('ls_shops:sync', src, {
        look = looks[identifierOf(src)],
        shops = customShops,
    })
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

RegisterNetEvent('ls_shops:buyWeapon', function(item)
    local src = source
    if type(item) ~= 'string' then return end

    local entry = ammuByItem[item]
    if not entry then
        notify(src, '~r~Такого товара нет')
        return
    end
    if not charge(src, entry.price) then
        notify(src, '~r~Не хватает денег')
        return
    end

    TriggerClientEvent('ls_shops:giveWeapon', src, entry.item)
    notify(src, ('~g~Куплено: %s'):format(entry.label))
end)

RegisterNetEvent('ls_shops:buyItem', function(item)
    local src = source
    if type(item) ~= 'string' then return end

    local entry = storeByItem[item]
    if not entry then
        notify(src, '~r~Такого товара нет')
        return
    end
    if not charge(src, entry.price) then
        notify(src, '~r~Не хватает денег')
        return
    end

    TriggerClientEvent('ls_shops:consume', src, { heal = entry.heal, armour = entry.armour })
    notify(src, ('~g~Куплено: %s'):format(entry.label))
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
        local pid = tonumber(id)
        TriggerClientEvent('ls_shops:sync', pid, {
            look = looks[identifierOf(pid)],
            shops = customShops,
        })
    end
    notify(src, '~g~Точка записана')
end)
