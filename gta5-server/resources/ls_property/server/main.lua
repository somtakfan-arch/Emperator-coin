-- Семьи, недвижимость, склады и аукцион.
--
-- Всё считает сервер. Клиент только рисует и просит; ни одна цена, ни одна
-- ставка и ни одна передача собственности с его слов не выполняется.

local RES = GetCurrentResourceName()
local DATA_FILE = 'property.json'

local families = {}     -- [id] = { id, name, tag, leader, members = { [identifier] = {...} } }
local nextFamily = 1
local owned = {}        -- [key] = { owner, ownerName, family, storage = {}, boughtAt }
local auctions = {}     -- [id] = { kind, ref, seller, ..., bid, bidder, endsAt }
local nextAuction = 1
local invites = {}      -- [identifier] = { family, from, expires }
local refunds = {}      -- [identifier] = сколько ждёт того, кого не было в игре
local lastCall = {}
local dirty = false

-- --- мелочи ------------------------------------------------------------------

local function notify(src, text)
    TriggerClientEvent('ls_property:notify', src, text)
end

local function money(amount)
    local text = tostring(math.floor(amount))
    return (text:reverse():gsub('(%d%d%d)', '%1 '):reverse():gsub('^%s+', ''))
end

-- Lua сравнивает байты: ":lower()" кириллицу не трогает вообще, поэтому
-- "Кортезы" и "кортезы" прошли бы как два разных названия. Складываем
-- регистр по кодпоинтам.
local function lowerText(text)
    if type(text) ~= 'string' then return '' end

    local out = {}
    local ok = pcall(function()
        for _, code in utf8.codes(text) do
            if code >= 0x41 and code <= 0x5A then code = code + 0x20          -- A-Z
            elseif code >= 0x410 and code <= 0x42F then code = code + 0x20    -- А-Я
            elseif code == 0x401 then code = 0x451 end                        -- Ё
            out[#out + 1] = utf8.char(code)
        end
    end)
    if not ok then return text end
    return table.concat(out)
end

local function identifierOf(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 8) == 'license:' then return id end
    end
    return 'name:' .. GetPlayerName(src)
end

local function srcOf(identifier)
    for _, id in ipairs(GetPlayers()) do
        local player = tonumber(id)
        if identifierOf(player) == identifier then return player end
    end
    return nil
end

local function throttled(src)
    local now = GetGameTimer()
    if lastCall[src] and now - lastCall[src] < Config.Cooldown then return true end
    lastCall[src] = now
    return false
end

local function nameOf(src)
    local ok, name = pcall(function() return exports.ls_character:getName(src) end)
    if ok and type(name) == 'string' and name ~= '' then return name end
    return GetPlayerName(src)
end

-- --- соседние ресурсы --------------------------------------------------------

local function getMoney(src)
    local ok, amount = pcall(function() return exports.phone_garage:getMoney(src) end)
    return ok and (tonumber(amount) or 0) or 0
end

local function addMoney(src, amount)
    return pcall(function() return exports.phone_garage:addMoney(src, amount) end)
end

local function takeMoney(src, amount)
    local ok, done = pcall(function() return exports.phone_garage:removeMoney(src, amount) end)
    return ok and done == true
end

local function itemDef(item)
    local ok, def = pcall(function() return exports.ls_inventory:getItemDef(item) end)
    if ok and type(def) == 'table' then return def end
    return { label = item, type = 'misc' }
end

-- --- хранение ----------------------------------------------------------------

local function save()
    SaveResourceFile(RES, DATA_FILE, json.encode({
        families = families, nextFamily = nextFamily,
        owned = owned, auctions = auctions, nextAuction = nextAuction,
        refunds = refunds,
    }), -1)
    dirty = false
end

local function load()
    local raw = LoadResourceFile(RES, DATA_FILE)
    if not raw or raw == '' then return end
    local ok, data = pcall(json.decode, raw)
    if not ok or type(data) ~= 'table' then
        print('[ls_property] property.json битый, начинаю с нуля')
        return
    end
    families = data.families or {}
    nextFamily = tonumber(data.nextFamily) or 1
    owned = data.owned or {}
    auctions = data.auctions or {}
    nextAuction = tonumber(data.nextAuction) or 1
    refunds = data.refunds or {}
end

-- --- семьи -------------------------------------------------------------------

local function familyOf(identifier)
    for _, family in pairs(families) do
        if family.members and family.members[identifier] then return family end
    end
    return nil
end

local function isLeader(identifier)
    local family = familyOf(identifier)
    return family and family.leader == identifier and family or nil
end

local function memberCount(family)
    local n = 0
    for _ in pairs(family.members or {}) do n = n + 1 end
    return n
end

local function tellFamily(family, text)
    for identifier in pairs(family.members or {}) do
        local src = srcOf(identifier)
        if src then notify(src, text) end
    end
end

-- --- недвижимость ------------------------------------------------------------

local function propertyByKey(key)
    for _, entry in ipairs(Config.Properties) do
        if entry.key == key then return entry end
    end
    return nil
end

local function record(key)
    owned[key] = owned[key] or { storage = {} }
    owned[key].storage = owned[key].storage or {}
    return owned[key]
end

-- Кто имеет право открыть дверь: владелец, а для семейного офиса - вся семья.
local function mayEnter(identifier, key)
    local entry = owned[key]
    if not entry or not entry.owner then return false end
    if entry.owner == identifier then return true end

    if entry.family then
        local family = families[tostring(entry.family)] or families[entry.family]
        if family and family.members and family.members[identifier] then return true end
    end
    return false
end

-- Сколько мест в гараже у игрока: база плюс всё, чем он владеет.
local function garageSlots(identifier)
    local slots = Config.BaseGarageSlots
    for key, entry in pairs(owned) do
        if entry.owner == identifier then
            local def = propertyByKey(key)
            if def then slots = slots + (def.slots or 0) end
        end
    end
    return slots
end

-- --- состояние для телефона --------------------------------------------------

local function familyView(identifier)
    local family = familyOf(identifier)
    if not family then
        local invite = invites[identifier]
        if invite and invite.expires > os.time() then
            local from = families[tostring(invite.family)] or families[invite.family]
            return { invite = { family = from and from.name or '?', by = invite.fromName } }
        end
        return {}
    end

    local members = {}
    for id, member in pairs(family.members) do
        members[#members + 1] = {
            name = member.name, rank = member.rank,
            online = srcOf(id) ~= nil,
        }
    end
    table.sort(members, function(a, b)
        if a.rank ~= b.rank then return a.rank == 'leader' end
        return (a.name or '') < (b.name or '')
    end)

    local mine = family.members[identifier]
    return {
        id = family.id, name = family.name, tag = family.tag,
        leader = family.leader == identifier,
        -- Готовый ответ на вопрос "показывать ли кнопку приглашения":
        -- клиент не может спросить серверный экспорт, а гонять за этим
        -- отдельное событие незачем.
        canInvite = mine ~= nil and mine.rank ~= 'member',
        members = members,
    }
end

local function propertyView(identifier)
    local rows = {}
    for _, def in ipairs(Config.Properties) do
        local entry = owned[def.key]
        rows[#rows + 1] = {
            key = def.key, kind = def.kind, label = def.label,
            price = def.price, slots = def.slots, storage = def.storage,
            x = def.x, y = def.y, z = def.z,
            owner = entry and entry.ownerName or nil,
            mine = entry and entry.owner == identifier or false,
            family = entry and entry.family and true or false,
        }
    end
    return rows
end

local function auctionView(identifier)
    local rows = {}
    local now = os.time()
    for id, lot in pairs(auctions) do
        rows[#rows + 1] = {
            id = id, kind = lot.kind, label = lot.label,
            price = lot.bid or lot.startPrice,
            bidder = lot.bidderName,
            mine = lot.seller == identifier,
            leading = lot.bidder == identifier,
            left = math.max(0, (lot.endsAt or now) - now),
        }
    end
    table.sort(rows, function(a, b) return a.left < b.left end)
    return rows
end

local function pushPhone(src)
    local identifier = identifierOf(src)
    TriggerClientEvent('ls_property:phone', src, {
        family = familyView(identifier),
        properties = propertyView(identifier),
        auctions = auctionView(identifier),
        slots = garageSlots(identifier),
        money = getMoney(src),
    })
end

local function pushEveryone()
    for _, id in ipairs(GetPlayers()) do pushPhone(tonumber(id)) end
end

RegisterNetEvent('ls_property:request', function()
    pushPhone(source)
end)

-- --- семья: события ----------------------------------------------------------

RegisterNetEvent('ls_property:createFamily', function(name, tag)
    local src = source
    if throttled(src) then return end
    if type(name) ~= 'string' then return end

    local identifier = identifierOf(src)
    if familyOf(identifier) then
        notify(src, PropLocale.familyHave)
        return
    end

    name = name:gsub('^%s+', ''):gsub('%s+$', '')
    local length = utf8 and utf8.len(name) or #name
    if not length or length < Config.Family.nameMin or length > Config.Family.nameMax then
        notify(src, PropLocale.familyBadName:format(Config.Family.nameMin, Config.Family.nameMax))
        return
    end

    local wanted = lowerText(name)
    for _, family in pairs(families) do
        if lowerText(family.name) == wanted then
            notify(src, PropLocale.familyExists)
            return
        end
    end

    if not takeMoney(src, Config.Family.createPrice) then
        notify(src, PropLocale.familyNoMoney:format(money(Config.Family.createPrice)))
        return
    end

    local id = tostring(nextFamily)
    nextFamily = nextFamily + 1
    families[id] = {
        id = id, name = name,
        tag = (type(tag) == 'string' and tag:sub(1, Config.Family.tagMax)) or '',
        leader = identifier,
        members = { [identifier] = { name = nameOf(src), rank = 'leader', joined = os.time() } },
    }

    dirty = true
    save()
    notify(src, PropLocale.familyCreated:format(name))
    pushPhone(src)
    print(('[ls_property] семья «%s» создана игроком %s'):format(name, GetPlayerName(src)))
end)

-- Зовёт ls_rp из меню взаимодействия.
RegisterNetEvent('ls_property:invite', function(targetId)
    local src = source
    if throttled(src) then return end

    targetId = tonumber(targetId)
    if not targetId or targetId == src or GetPlayerName(targetId) == nil then return end

    local identifier = identifierOf(src)
    local family = familyOf(identifier)
    if not family then
        notify(src, PropLocale.familyNotIn)
        return
    end
    if family.members[identifier].rank == 'member' then
        notify(src, PropLocale.familyNotLeader)
        return
    end
    if memberCount(family) >= Config.Family.maxMembers then
        notify(src, PropLocale.familyFull)
        return
    end

    local targetIdentifier = identifierOf(targetId)
    if familyOf(targetIdentifier) then
        notify(src, PropLocale.familyTargetIn)
        return
    end

    invites[targetIdentifier] = {
        family = family.id, from = identifier,
        fromName = nameOf(src),
        expires = os.time() + Config.Family.inviteSeconds,
    }

    notify(src, PropLocale.familyInvited:format(nameOf(targetId)))
    notify(targetId, PropLocale.familyGotInvite:format(nameOf(src), family.name))
    pushPhone(targetId)
end)

RegisterNetEvent('ls_property:answerInvite', function(accept)
    local src = source
    if throttled(src) then return end

    local identifier = identifierOf(src)
    local invite = invites[identifier]
    invites[identifier] = nil

    if not invite or invite.expires <= os.time() then
        notify(src, PropLocale.familyNoInvite)
        pushPhone(src)
        return
    end

    if accept ~= true then
        pushPhone(src)
        return
    end

    local family = families[tostring(invite.family)] or families[invite.family]
    if not family or memberCount(family) >= Config.Family.maxMembers then
        notify(src, PropLocale.familyNoInvite)
        pushPhone(src)
        return
    end

    family.members[identifier] = { name = nameOf(src), rank = 'member', joined = os.time() }
    dirty = true
    save()

    notify(src, PropLocale.familyJoined:format(family.name))
    tellFamily(family, ('~b~%s вступил в семью'):format(nameOf(src)))
    pushEveryone()
end)

RegisterNetEvent('ls_property:leaveFamily', function()
    local src = source
    if throttled(src) then return end

    local identifier = identifierOf(src)
    local family = familyOf(identifier)
    if not family then return end

    -- Глава не уходит молча: иначе семья остаётся без владельца офиса.
    if family.leader == identifier then
        notify(src, PropLocale.familyLeaderOut)
        return
    end

    family.members[identifier] = nil
    dirty = true
    save()
    notify(src, PropLocale.familyLeft)
    pushEveryone()
end)

RegisterNetEvent('ls_property:kick', function(name)
    local src = source
    if throttled(src) then return end

    local family = isLeader(identifierOf(src))
    if not family then
        notify(src, PropLocale.familyNotLeader)
        return
    end

    for id, member in pairs(family.members) do
        if member.name == name and id ~= family.leader then
            family.members[id] = nil
            dirty = true
            save()
            local target = srcOf(id)
            if target then notify(target, PropLocale.familyKicked) end
            pushEveryone()
            return
        end
    end
end)

RegisterNetEvent('ls_property:disband', function()
    local src = source
    if throttled(src) then return end

    local family = isLeader(identifierOf(src))
    if not family then
        notify(src, PropLocale.familyNotLeader)
        return
    end

    -- Офисы, помеченные семейными, возвращаются владельцу в личное владение.
    for _, entry in pairs(owned) do
        if entry.family == family.id then entry.family = nil end
    end

    tellFamily(family, PropLocale.familyDisbanded)
    families[family.id] = nil
    dirty = true
    save()
    pushEveryone()
end)

-- --- недвижимость: события ---------------------------------------------------

RegisterNetEvent('ls_property:buy', function(key)
    local src = source
    if throttled(src) then return end

    local def = propertyByKey(key)
    if not def then return end

    local entry = owned[key]
    if entry and entry.owner then
        notify(src, PropLocale.propTaken)
        return
    end

    if not takeMoney(src, def.price) then
        notify(src, PropLocale.propNoMoney:format(money(def.price)))
        return
    end

    local rec = record(key)
    rec.owner = identifierOf(src)
    rec.ownerName = nameOf(src)
    rec.boughtAt = os.time()
    dirty = true
    save()

    notify(src, PropLocale.propBought:format(def.label))
    pushEveryone()
end)

RegisterNetEvent('ls_property:sellBack', function(key)
    local src = source
    if throttled(src) then return end

    local def = propertyByKey(key)
    local entry = owned[key]
    if not def or not entry or entry.owner ~= identifierOf(src) then
        notify(src, PropLocale.propNotOwner)
        return
    end

    -- Половина цены: продать государству дешевле, чем через аукцион.
    local back = math.floor(def.price / 2)
    owned[key] = nil
    dirty = true
    save()

    addMoney(src, back)
    notify(src, PropLocale.propSold:format(def.label, money(back)))
    pushEveryone()
end)

RegisterNetEvent('ls_property:setFamily', function(key, on)
    local src = source
    if throttled(src) then return end

    local def = propertyByKey(key)
    local entry = owned[key]
    local identifier = identifierOf(src)

    if not def or not entry or entry.owner ~= identifier then
        notify(src, PropLocale.propNotOwner)
        return
    end
    if def.kind ~= 'office' then
        notify(src, PropLocale.propHouseFamily)
        return
    end

    local family = familyOf(identifier)
    if not family then
        notify(src, PropLocale.familyNotIn)
        return
    end

    if on == true then
        entry.family = family.id
        notify(src, PropLocale.propFamilySet:format(def.label))
        tellFamily(family, ('~b~Офис «%s» открыт для семьи'):format(def.label))
    else
        entry.family = nil
        notify(src, PropLocale.propFamilyOff:format(def.label))
    end

    dirty = true
    save()
    pushEveryone()
end)

-- --- склад -------------------------------------------------------------------

local function storageView(key)
    local rec = record(key)
    local rows = {}
    for slot, entry in pairs(rec.storage) do
        local def = itemDef(entry.item)
        rows[#rows + 1] = {
            slot = slot, item = entry.item, count = entry.count,
            label = def.label, kind = def.type,
        }
    end
    table.sort(rows, function(a, b) return (a.slot or 0) < (b.slot or 0) end)
    return rows
end

local function pushStorage(src, key)
    local def = propertyByKey(key)
    TriggerClientEvent('ls_property:storage', src, {
        key = key,
        label = def and def.label or key,
        capacity = def and def.storage or 0,
        rows = storageView(key),
    })
end

RegisterNetEvent('ls_property:openStorage', function(key)
    local src = source
    if throttled(src) then return end

    local def = propertyByKey(key)
    if not def then return end

    local coords = GetEntityCoords(GetPlayerPed(src))
    if #(coords - vector3(def.x, def.y, def.z)) > Config.Interact + 6.0 then
        return
    end

    if not mayEnter(identifierOf(src), key) then
        notify(src, PropLocale.propLocked)
        return
    end

    pushStorage(src, key)
end)

RegisterNetEvent('ls_property:store', function(key, item, count)
    local src = source
    if throttled(src) then return end

    local def = propertyByKey(key)
    if not def or not mayEnter(identifierOf(src), key) then return end

    count = math.max(1, math.floor(tonumber(count) or 1))
    local rec = record(key)

    local used = 0
    for _ in pairs(rec.storage) do used = used + 1 end
    if used >= def.storage then
        notify(src, PropLocale.propStorageFull)
        return
    end

    local ok, taken = pcall(function()
        return exports.ls_inventory:takeItem(src, item, count)
    end)
    if not ok or taken ~= true then
        notify(src, PropLocale.propNothing)
        return
    end

    -- Кладём в первую свободную ячейку, докладывая в уже начатую при совпадении.
    local placed = false
    for _, entry in pairs(rec.storage) do
        if entry.item == item then
            entry.count = entry.count + count
            placed = true
            break
        end
    end
    if not placed then
        rec.storage[#rec.storage + 1] = { item = item, count = count }
    end

    dirty = true
    save()
    pushStorage(src, key)
end)

RegisterNetEvent('ls_property:takeOut', function(key, slot, count)
    local src = source
    if throttled(src) then return end

    local def = propertyByKey(key)
    if not def or not mayEnter(identifierOf(src), key) then return end

    local rec = record(key)
    local entry = rec.storage[tonumber(slot) or -1]
    if not entry then return end

    count = math.max(1, math.min(math.floor(tonumber(count) or 1), entry.count))

    local ok, fits = pcall(function()
        return exports.ls_inventory:canCarry(src, entry.item, count)
    end)
    if not ok or fits ~= true then
        notify(src, '~r~В инвентаре нет места')
        return
    end

    local given = pcall(function()
        return exports.ls_inventory:giveItem(src, entry.item, count)
    end)
    if not given then return end

    entry.count = entry.count - count
    if entry.count <= 0 then
        table.remove(rec.storage, tonumber(slot))
    end

    dirty = true
    save()
    pushStorage(src, key)
end)

-- --- аукцион -----------------------------------------------------------------

local function lotsOf(identifier)
    local n = 0
    for _, lot in pairs(auctions) do
        if lot.seller == identifier then n = n + 1 end
    end
    return n
end

-- Возврат лота продавцу: и когда никто не поставил, и когда лот снят.
local function returnLot(lot)
    if lot.kind == 'property' then
        local rec = record(lot.ref)
        rec.owner = lot.seller
        rec.ownerName = lot.sellerName
    end
    -- Машина всё время лота лежит "ничьей" в phone_garage: возвращаем.
    if lot.kind == 'car' then
        local src = srcOf(lot.seller)
        if src then
            pcall(function() return exports.phone_garage:restoreCar(src, lot.ref) end)
        end
    end
end

RegisterNetEvent('ls_property:listLot', function(kind, ref, price, minutes)
    local src = source
    if throttled(src) then return end

    local identifier = identifierOf(src)
    price = math.floor(tonumber(price) or 0)
    minutes = tonumber(minutes) or Config.Auction.durations[1]

    local okDuration = false
    for _, value in ipairs(Config.Auction.durations) do
        if value == minutes then okDuration = true break end
    end
    if not okDuration then return end

    if price < Config.Auction.minPrice then
        notify(src, PropLocale.aucMinPrice:format(money(Config.Auction.minPrice)))
        return
    end

    if lotsOf(identifier) >= Config.Auction.maxPerPlayer then
        notify(src, PropLocale.aucLimit:format(Config.Auction.maxPerPlayer))
        return
    end

    local label
    if kind == 'property' then
        local def = propertyByKey(ref)
        local entry = owned[ref]
        if not def or not entry or entry.owner ~= identifier then
            notify(src, PropLocale.aucNotYours)
            return
        end
        -- На время торгов недвижимость снимается с владельца: иначе можно
        -- продать её дважды.
        entry.owner = nil
        entry.ownerName = nil
        entry.family = nil
        label = def.label
    elseif kind == 'car' then
        local ok, taken = pcall(function()
            return exports.phone_garage:detachCar(src, ref)
        end)
        if not ok or type(taken) ~= 'table' then
            notify(src, PropLocale.aucNotYours)
            return
        end
        label = taken.label or ref
    else
        return
    end

    local id = tostring(nextAuction)
    nextAuction = nextAuction + 1
    auctions[id] = {
        id = id, kind = kind, ref = ref, label = label,
        seller = identifier, sellerName = nameOf(src),
        startPrice = price, bid = nil, bidder = nil, bidderName = nil,
        endsAt = os.time() + minutes * 60,
    }

    dirty = true
    save()
    notify(src, PropLocale.aucListed:format(label, money(price)))
    pushEveryone()
end)

RegisterNetEvent('ls_property:bid', function(id)
    local src = source
    if throttled(src) then return end

    local lot = auctions[tostring(id)]
    if not lot or lot.endsAt <= os.time() then
        notify(src, PropLocale.aucGone)
        return
    end

    local identifier = identifierOf(src)
    if lot.seller == identifier then
        notify(src, PropLocale.aucOwn)
        return
    end

    local current = lot.bid or lot.startPrice
    local next_ = lot.bid
        and math.ceil(current * (100 + Config.Auction.bidStep) / 100)
        or current

    -- Деньги списываются сразу, иначе ставка ничего не стоит и торги
    -- превращаются в игру "кто громче крикнет".
    if not takeMoney(src, next_) then
        notify(src, PropLocale.aucLowBid:format(money(next_)))
        return
    end

    if lot.bidder then
        local previous = srcOf(lot.bidder)
        if previous then
            addMoney(previous, lot.bid)
            notify(previous, PropLocale.aucOutbid:format(lot.label))
        else
            -- Перебитого нет в игре: деньги ждут его до следующего входа.
            refunds[lot.bidder] = (refunds[lot.bidder] or 0) + lot.bid
        end
    end

    lot.bid = next_
    lot.bidder = identifier
    lot.bidderName = nameOf(src)

    dirty = true
    save()
    notify(src, PropLocale.aucBid:format(money(next_)))
    pushEveryone()
end)

local function closeLot(id, lot)
    auctions[id] = nil

    if not lot.bidder then
        returnLot(lot)
        local src = srcOf(lot.seller)
        if src then notify(src, PropLocale.aucNoBids:format(lot.label)) end
        return
    end

    local fee = math.floor(lot.bid * Config.Auction.fee / 100)
    local payout = lot.bid - fee

    if lot.kind == 'property' then
        local rec = record(lot.ref)
        rec.owner = lot.bidder
        rec.ownerName = lot.bidderName
        rec.family = nil
    elseif lot.kind == 'car' then
        local winner = srcOf(lot.bidder)
        if winner then
            pcall(function() return exports.phone_garage:restoreCar(winner, lot.ref) end)
        end
    end

    local seller = srcOf(lot.seller)
    if seller then
        addMoney(seller, payout)
        notify(seller, PropLocale.aucSoldOut:format(lot.label, money(lot.bid), money(payout)))
    else
        refunds[lot.seller] = (refunds[lot.seller] or 0) + payout
    end

    local winner = srcOf(lot.bidder)
    if winner then notify(winner, PropLocale.aucWon:format(lot.label, money(lot.bid))) end
end

-- Отложенные выплаты тем, кого не было в игре в момент закрытия лота.
local function payPending(src)
    local identifier = identifierOf(src)
    local total = math.floor(refunds[identifier] or 0)
    if total <= 0 then return end

    refunds[identifier] = nil
    dirty = true
    save()
    addMoney(src, total)
    notify(src, ('~g~Возврат с аукциона: $%s'):format(money(total)))
end

CreateThread(function()
    while true do
        Wait(20000)
        local now = os.time()
        local closed = false

        for id, lot in pairs(auctions) do
            if lot.endsAt and lot.endsAt <= now then
                closeLot(id, lot)
                closed = true
            end
        end

        for identifier, invite in pairs(invites) do
            if invite.expires <= now then invites[identifier] = nil end
        end

        if closed then
            dirty = true
            save()
            pushEveryone()
        elseif dirty then
            save()
        end
    end
end)

-- --- жизненный цикл ----------------------------------------------------------

AddEventHandler('onResourceStart', function(name)
    if name ~= RES then return end
    load()
    local f, p = 0, 0
    for _ in pairs(families) do f = f + 1 end
    for _, entry in pairs(owned) do
        if entry.owner then p = p + 1 end
    end
    print(('[ls_property] семей: %d, занятой недвижимости: %d'):format(f, p))
end)

AddEventHandler('onResourceStop', function(name)
    if name == RES then save() end
end)

AddEventHandler('playerDropped', function()
    lastCall[source] = nil
end)

RegisterNetEvent('ls_property:ready', function()
    local src = source
    payPending(src)
    pushPhone(src)
end)

-- --- экспорты ----------------------------------------------------------------

exports('garageSlots', function(src)
    return garageSlots(identifierOf(src))
end)

exports('familyOf', function(src)
    local identifier = identifierOf(src)
    local family = familyOf(identifier)
    if not family then return nil end
    return {
        id = family.id, name = family.name, tag = family.tag,
        -- ls_forum смотрит на это: глава разбирает заявки в свою семью.
        leader = family.leader == identifier,
    }
end)

-- Офисы, помеченные семейными, в которых состоит этот игрок. Нужно
-- ls_armoury, чтобы знать, куда везти семейную поставку.
exports('familyOffices', function(src)
    local identifier = identifierOf(src)
    local family = familyOf(identifier)
    if not family then return {} end

    local out = {}
    for key, entry in pairs(owned) do
        if entry.family == family.id then
            local def = propertyByKey(key)
            if def then
                out[#out + 1] = {
                    key = key, label = def.label, family = family.id,
                    x = def.x, y = def.y, z = def.z,
                }
            end
        end
    end
    return out
end)

-- Положить товар на склад офиса мимо инвентаря: поставку привозят фурой,
-- а не в карманах.
exports('stockOffice', function(key, item, count)
    local def = propertyByKey(key)
    if not def or type(item) ~= 'string' then return false end

    count = math.max(1, math.floor(tonumber(count) or 1))
    local rec = record(key)

    local used = 0
    for _ in pairs(rec.storage) do used = used + 1 end

    for _, entry in pairs(rec.storage) do
        if entry.item == item then
            entry.count = entry.count + count
            dirty = true
            save()
            return true
        end
    end

    if used >= def.storage then return false end
    rec.storage[#rec.storage + 1] = { item = item, count = count }
    dirty = true
    save()
    return true
end)

exports('sameFamily', function(a, b)
    local first = familyOf(identifierOf(a))
    if not first then return false end
    local second = familyOf(identifierOf(b))
    return second ~= nil and first.id == second.id
end)

-- --- команды -----------------------------------------------------------------

RegisterCommand('families', function(src)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'garage.admin') then return end
    for _, family in pairs(families) do
        print(('  «%s» [%s] — участников: %d'):format(family.name, family.tag, memberCount(family)))
    end
end, false)

RegisterCommand('properties', function(src)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'garage.admin') then return end
    for key, entry in pairs(owned) do
        if entry.owner then
            print(('  %s -> %s%s'):format(key, entry.ownerName or '?',
                entry.family and ' (семейный)' or ''))
        end
    end
end, false)
