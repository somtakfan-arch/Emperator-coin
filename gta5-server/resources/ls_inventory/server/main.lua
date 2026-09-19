-- Server side: the inventory is the source of truth. The client asks to use,
-- move or drop a slot; every check happens here.

local RES = GetCurrentResourceName()
local DATA_FILE = 'inventories.json'

local inventories = {}   -- [identifier] = { backpack = bool, slots = { [slot] = {item, count} } }
local items = {}         -- item id -> definition (config + add-on weapons)
local dirty = false

-- --- item registry ---------------------------------------------------------

local function prettyWeaponName(id)
    local name = id:gsub('^WEAPON_', ''):gsub('_', ' '):lower()
    return (name:gsub('(%a)([%w]*)', function(first, rest)
        return first:upper() .. rest
    end))
end

local function registerItems()
    for id, def in pairs(Config.Items) do
        items[id] = def
    end

    -- Add-on weapons the installer scraped out of the gun packs.
    local raw = LoadResourceFile(Config.AddonWeaponResource, Config.AddonWeaponFile)
    if not raw or raw == '' then return end

    local ok, list = pcall(json.decode, raw)
    if not ok or type(list) ~= 'table' then
        print('[ls_inventory] addon_weapons.json is unreadable, skipping add-on weapons')
        return
    end

    local added = 0
    for _, entry in ipairs(list) do
        local id = type(entry) == 'table' and entry.name or entry
        if type(id) == 'string' and id ~= '' and not items[id] then
            items[id] = {
                label = (type(entry) == 'table' and entry.label) or prettyWeaponName(id),
                type = 'weapon',
                stack = 1,
                price = (type(entry) == 'table' and tonumber(entry.price)) or Config.AddonWeaponPrice,
                addon = true,
            }
            added = added + 1
        end
    end
    print(('[ls_inventory] registered %d add-on weapons'):format(added))
end

-- --- persistence -----------------------------------------------------------

local function readJson(file, fallback)
    local raw = LoadResourceFile(RES, file)
    if not raw or raw == '' then return fallback end
    local ok, decoded = pcall(json.decode, raw)
    if not ok or type(decoded) ~= 'table' then
        print(('[ls_inventory] %s is corrupt, starting from scratch'):format(file))
        return fallback
    end
    return decoded
end

local function save()
    SaveResourceFile(RES, DATA_FILE, json.encode(inventories), -1)
    dirty = false
end

local function identifierOf(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 8) == 'license:' then return id end
    end
    return 'name:' .. GetPlayerName(src)
end

-- Slot tables survive JSON as string keys, so they are normalised on read.
local function invOf(src)
    local id = identifierOf(src)
    local inv = inventories[id]

    if not inv then
        inv = { backpack = false, slots = {} }
        inventories[id] = inv
        dirty = true
        return inv
    end

    if not inv.normalised then
        local slots = {}
        for key, value in pairs(inv.slots or {}) do
            local slot = tonumber(key)
            if slot and type(value) == 'table' and value.item then
                slots[slot] = { item = value.item, count = tonumber(value.count) or 1 }
            end
        end
        inv.slots = slots
        inv.backpack = inv.backpack == true
        inv.normalised = true
    end
    return inv
end

local function capacity(inv)
    return Config.BaseSlots + (inv.backpack and Config.BackpackSlots or 0)
end

local function notify(src, text)
    TriggerClientEvent('ls_inventory:notify', src, text)
end

local function sync(src)
    local inv = invOf(src)
    local payload = {}
    for slot, entry in pairs(inv.slots) do
        local def = items[entry.item]
        payload[#payload + 1] = {
            slot = slot,
            item = entry.item,
            count = entry.count,
            label = def and def.label or entry.item,
            kind = def and def.type or 'misc',
        }
    end

    TriggerClientEvent('ls_inventory:sync', src, {
        slots = payload,
        capacity = capacity(inv),
        base = Config.BaseSlots,
        backpack = inv.backpack,
        backpackSlots = Config.BackpackSlots,
        backpackPrice = Config.BackpackPrice,
    })
end

-- --- inventory maths -------------------------------------------------------

local function firstFreeSlot(inv)
    local max = capacity(inv)
    for slot = 1, max do
        if not inv.slots[slot] then return slot end
    end
    return nil
end

-- Fills existing stacks first, then empty slots. Returns false and changes
-- nothing when it does not all fit.
local function canFit(inv, itemId, count)
    local def = items[itemId]
    if not def then return false end

    local stack = def.stack or 1
    local remaining = count
    local max = capacity(inv)

    for slot = 1, max do
        local entry = inv.slots[slot]
        if entry and entry.item == itemId and entry.count < stack then
            remaining = remaining - (stack - entry.count)
        elseif not entry then
            remaining = remaining - stack
        end
        if remaining <= 0 then return true end
    end
    return false
end

local function addItem(inv, itemId, count)
    local def = items[itemId]
    if not def then return false end

    local stack = def.stack or 1
    local remaining = count
    local max = capacity(inv)

    for slot = 1, max do
        if remaining <= 0 then break end
        local entry = inv.slots[slot]
        if entry and entry.item == itemId and entry.count < stack then
            local room = math.min(stack - entry.count, remaining)
            entry.count = entry.count + room
            remaining = remaining - room
        end
    end

    while remaining > 0 do
        local slot = firstFreeSlot(inv)
        if not slot then return false end
        local put = math.min(stack, remaining)
        inv.slots[slot] = { item = itemId, count = put }
        remaining = remaining - put
    end

    dirty = true
    return true
end

local function removeSlot(inv, slot, count)
    local entry = inv.slots[slot]
    if not entry then return false end

    count = math.min(count or 1, entry.count)
    entry.count = entry.count - count
    if entry.count <= 0 then inv.slots[slot] = nil end
    dirty = true
    return true
end

-- --- lifecycle -------------------------------------------------------------

AddEventHandler('onResourceStart', function(name)
    if name ~= RES then return end
    registerItems()
    inventories = readJson(DATA_FILE, {})
    local n = 0
    for _ in pairs(inventories) do n = n + 1 end
    print(('[ls_inventory] loaded %d inventories'):format(n))
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

-- --- client requests -------------------------------------------------------

RegisterNetEvent('ls_inventory:request', function()
    sync(source)
end)

RegisterNetEvent('ls_inventory:use', function(slot)
    local src = source
    slot = tonumber(slot)
    if not slot then return end

    local inv = invOf(src)
    local entry = inv.slots[slot]
    if not entry then return end

    local def = items[entry.item]
    if not def then
        notify(src, '~r~Неизвестный предмет')
        return
    end

    -- Some types belong to ls_medical. It decides whether the unit is spent -
    -- a mask is worn rather than used up, and a refused action must not eat it.
    local function external(exportName)
        local ok, consumed = pcall(function()
            return exports.ls_medical[exportName](exports.ls_medical, src, entry.item)
        end)
        if not ok then
            notify(src, 'Эта механика сейчас недоступна')
            return false
        end
        return consumed == true
    end

    local consume
    if def.type == 'weapon' then
        TriggerClientEvent('ls_inventory:equip', src, entry.item, Config.WeaponAmmo)
        consume = true
    elseif def.type == 'armour' then
        TriggerClientEvent('ls_inventory:armour', src, def.value or 50)
        consume = true
    elseif def.type == 'food' then
        TriggerClientEvent('ls_inventory:heal', src, def.heal or 25)
        consume = true
    elseif def.type == 'painkiller' then
        consume = external('usePainkiller')
    elseif def.type == 'defib' then
        consume = external('useDefib')
    elseif def.type == 'mask' then
        consume = external('useMask')
    else
        -- Тип, за который отвечает другой ресурс. Спрашиваем его, и он же
        -- говорит, списывать предмет или нет.
        local owner = Config.ExternalTypes and Config.ExternalTypes[def.type]
        if not owner then
            notify(src, 'Этот предмет ни на что не влияет')
            return
        end

        local ok, spent = pcall(function()
            return exports[owner]:useItem(src, entry.item)
        end)
        if not ok then
            notify(src, 'Эта механика сейчас недоступна')
            return
        end
        consume = spent == true
    end

    if not consume then
        sync(src)
        return
    end

    removeSlot(inv, slot, 1)
    save()
    sync(src)
end)

RegisterNetEvent('ls_inventory:move', function(from, to)
    local src = source
    from, to = tonumber(from), tonumber(to)
    if not from or not to or from == to then return end

    local inv = invOf(src)
    local max = capacity(inv)
    if from < 1 or from > max or to < 1 or to > max then return end

    inv.slots[from], inv.slots[to] = inv.slots[to], inv.slots[from]
    dirty = true
    sync(src)
end)

RegisterNetEvent('ls_inventory:drop', function(slot)
    local src = source
    slot = tonumber(slot)
    if not slot then return end

    local inv = invOf(src)
    local entry = inv.slots[slot]
    if not entry then return end

    local def = items[entry.item]
    inv.slots[slot] = nil
    dirty = true
    save()
    sync(src)
    notify(src, ('~y~Выброшено: %s'):format(def and def.label or entry.item))
end)

RegisterNetEvent('ls_inventory:buyBackpack', function()
    local src = source
    local inv = invOf(src)

    if inv.backpack then
        notify(src, 'Рюкзак уже есть')
        return
    end

    local ok, paid = pcall(function()
        return exports.phone_garage:removeMoney(src, Config.BackpackPrice)
    end)
    if not ok then
        print('[ls_inventory] phone_garage is not running - cannot charge for the backpack')
        notify(src, '~r~Кошелёк недоступен')
        return
    end
    if paid ~= true then
        notify(src, '~r~Не хватает денег')
        return
    end

    inv.backpack = true
    dirty = true
    save()
    sync(src)
    notify(src, ('~g~Рюкзак куплен: +%d слотов'):format(Config.BackpackSlots))
end)

-- --- exports ---------------------------------------------------------------
-- ls_shops hands purchases over through these instead of applying them.

exports('getItemDef', function(itemId)
    return items[itemId]
end)

exports('listItems', function()
    local list = {}
    for id, def in pairs(items) do
        list[#list + 1] = {
            item = id,
            label = def.label,
            kind = def.type,
            price = def.price,
            addon = def.addon == true,
        }
    end
    return list
end)

exports('canCarry', function(src, itemId, count)
    return canFit(invOf(src), itemId, tonumber(count) or 1)
end)

exports('giveItem', function(src, itemId, count)
    count = tonumber(count) or 1
    local inv = invOf(src)
    if not canFit(inv, itemId, count) then return false end
    if not addItem(inv, itemId, count) then return false end
    save()
    sync(src)
    return true
end)

-- Takes one unit out of a slot and reports what it was, so the caller can put
-- it somewhere else. Returns nil when the slot is empty.
exports('takeSlot', function(src, slot)
    slot = tonumber(slot)
    if not slot then return nil end

    local inv = invOf(src)
    local entry = inv.slots[slot]
    if not entry then return nil end

    local itemId = entry.item
    removeSlot(inv, slot, 1)
    save()
    sync(src)
    return itemId
end)

-- Takes `count` of a named item wherever it sits. Used for things the holder
-- must actually be carrying, like handcuffs or a key.
exports('takeItem', function(src, itemId, count)
    count = tonumber(count) or 1
    if type(itemId) ~= 'string' or count <= 0 then return false end

    local inv = invOf(src)
    local held = 0
    for _, entry in pairs(inv.slots) do
        if entry.item == itemId then held = held + entry.count end
    end
    if held < count then return false end

    local remaining = count
    for slot = 1, capacity(inv) do
        if remaining <= 0 then break end
        local entry = inv.slots[slot]
        if entry and entry.item == itemId then
            local take = math.min(entry.count, remaining)
            removeSlot(inv, slot, take)
            remaining = remaining - take
        end
    end

    save()
    sync(src)
    return true
end)

-- A read-only view of someone's inventory, for the police search screen.
exports('getInventory', function(src)
    local inv = invOf(src)
    local slots = {}
    for slot, entry in pairs(inv.slots) do
        local def = items[entry.item]
        slots[#slots + 1] = {
            slot = slot,
            item = entry.item,
            count = entry.count,
            label = def and def.label or entry.item,
            kind = def and def.type or 'misc',
        }
    end
    return { slots = slots, capacity = capacity(inv), backpack = inv.backpack }
end)

exports('hasBackpack', function(src)
    return invOf(src).backpack == true
end)

exports('sync', function(src)
    sync(src)
end)

-- --- command ---------------------------------------------------------------

RegisterCommand('giveitem', function(src, args)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'garage.admin') then
        notify(src, '~r~Нет прав')
        return
    end

    local target = tonumber(args[1])
    local itemId = args[2]
    local count = tonumber(args[3]) or 1

    if not target or not itemId then
        print('usage: giveitem <player id> <item> [count]')
        return
    end
    if not items[itemId] then
        print('[ls_inventory] unknown item: ' .. tostring(itemId))
        return
    end
    if GetPlayerName(target) == nil then
        print('[ls_inventory] no such player: ' .. tostring(target))
        return
    end

    local inv = invOf(target)
    if canFit(inv, itemId, count) and addItem(inv, itemId, count) then
        save()
        sync(target)
        notify(target, ('~g~Получено: %s x%d'):format(items[itemId].label, count))
    else
        notify(target, '~r~Инвентарь полон')
    end
end, false)
