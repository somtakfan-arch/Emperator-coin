-- Server side. Every decision lives here: the client asks, it never decides.
--
-- Each handler runs the same gauntlet before it touches anything:
--   rate limit -> on duty -> rank permission -> distance to target
--   -> target really is in the state the action assumes.

local RES = GetCurrentResourceName()

-- Runtime state. Duty is deliberately not persisted: a restart clears the shift.
local onDuty = {}      -- [src] = { rank, callsign, station }
local escorting = {}   -- [officerSrc] = detaineeSrc
local escortedBy = {}  -- [detaineeSrc] = officerSrc
local cuffed = {}      -- [src] = { kind, by }
local jailed = {}      -- [src] = { until_ts, reason, bail }
local escapeUntil = {} -- [src] = os.time() when another attempt is allowed
local taserUntil = {}  -- [src]
local autoUntil = {}   -- [src..kind]
local buckets = {}     -- rate limiter

-- --- small helpers ----------------------------------------------------------

local function identifierOf(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 8) == 'license:' then return id end
    end
    return 'name:' .. GetPlayerName(src)
end

local function nameOf(src)
    local ok, name = pcall(function() return exports.ls_character:getName(src) end)
    if ok and type(name) == 'string' then return name end
    return GetPlayerName(src) or ('id ' .. tostring(src))
end

local function staticOf(src)
    local ok, value = pcall(function() return exports.ls_character:getStatic(src) end)
    return (ok and tonumber(value)) or 0
end

local function notify(src, text)
    TriggerClientEvent('ls_police:notify', src, text)
end

local function srcOfIdentifier(identifier)
    for _, id in ipairs(GetPlayers()) do
        local src = tonumber(id)
        if identifierOf(src) == identifier then return src end
    end
    return nil
end

-- --- rate limiting ----------------------------------------------------------

local function allowed(src, key)
    local limit = Config.RateLimit.perEvent[key] or Config.RateLimit.default
    local now = os.time()
    local bucketKey = ('%d:%s'):format(src, key)
    local bucket = buckets[bucketKey]

    if not bucket or now - bucket.start >= Config.RateLimit.windowSeconds then
        buckets[bucketKey] = { start = now, count = 1 }
        return true
    end

    bucket.count = bucket.count + 1
    if bucket.count > limit then
        notify(src, Locale.rateLimited)
        return false
    end
    return true
end

CreateThread(function()
    while true do
        Wait(60000)
        local now = os.time()
        for key, bucket in pairs(buckets) do
            if now - bucket.start > Config.RateLimit.windowSeconds * 3 then
                buckets[key] = nil
            end
        end
    end
end)

-- --- database ---------------------------------------------------------------

local function dbQuery(sql, params)
    local ok, result = pcall(function() return MySQL.query.await(sql, params) end)
    if not ok then
        print(('[ls_police] query failed: %s'):format(result))
        return nil
    end
    return result
end

local function dbSingle(sql, params)
    local ok, result = pcall(function() return MySQL.single.await(sql, params) end)
    if not ok then
        print(('[ls_police] query failed: %s'):format(result))
        return nil
    end
    return result
end

local function dbExec(sql, params)
    local ok, result = pcall(function() return MySQL.update.await(sql, params) end)
    if not ok then
        print(('[ls_police] statement failed: %s'):format(result))
        return nil
    end
    return result
end

-- --- logging ----------------------------------------------------------------

local function logAction(action, actorSrc, targetSrc, detail)
    local actor = actorSrc and nameOf(actorSrc) or 'система'
    local target = targetSrc and nameOf(targetSrc) or ''

    dbExec('INSERT INTO police_logs (action, actor, target, detail) VALUES (?, ?, ?, ?)',
        { action, actor, target, detail or '' })

    local url = Config.Discord.webhook
    if not url or url == '' then return end

    local body = json.encode({
        username = Config.Discord.username,
        embeds = { {
            color = Config.Discord.colour,
            title = action,
            description = ('**Сотрудник:** %s\n**Цель:** %s\n**Детали:** %s')
                :format(actor, target ~= '' and target or '—', detail or '—'),
            footer = { text = os.date('%d.%m.%Y %H:%M:%S') },
        } },
    })

    PerformHttpRequest(url, function(status)
        if status ~= 200 and status ~= 204 then
            print(('[ls_police] discord webhook returned %s'):format(tostring(status)))
        end
    end, 'POST', body, { ['Content-Type'] = 'application/json' })
end

-- --- permissions ------------------------------------------------------------

local function rankOf(src)
    local shift = onDuty[src]
    return shift and shift.rank or nil
end

local function can(src, perm)
    local rank = rankOf(src)
    if not rank then return false end
    local def = Config.Ranks[rank]
    return def ~= nil and def.perms[perm] == true
end

-- The single gate every officer action goes through.
-- Returns the target's server id, or nil after telling the caller why not.
local function gate(src, key, perm, targetId, requireCuffed)
    if not allowed(src, key) then return nil end

    if not onDuty[src] then
        notify(src, Locale.notOnDuty)
        return nil
    end

    if perm and not can(src, perm) then
        notify(src, Locale.noPermission)
        return nil
    end

    if targetId == nil then return true end

    targetId = tonumber(targetId)
    if not targetId or targetId == src or GetPlayerName(targetId) == nil then
        notify(src, Locale.targetNotFound)
        return nil
    end

    local pedA, pedB = GetPlayerPed(src), GetPlayerPed(targetId)
    if pedA == 0 or pedB == 0
        or #(GetEntityCoords(pedA) - GetEntityCoords(pedB)) > Config.ActionDistance then
        notify(src, Locale.tooFar)
        return nil
    end

    if requireCuffed and not cuffed[targetId] then
        notify(src, Locale.notCuffed)
        return nil
    end

    return targetId
end

local function atStation(src)
    local ped = GetPlayerPed(src)
    if ped == 0 then return false end
    local coords = GetEntityCoords(ped)
    for _, station in ipairs(Config.Stations) do
        if #(coords - vector3(station.x, station.y, station.z)) <= Config.StationRadius then
            return true, station.label
        end
    end
    return false
end

-- --- state broadcast --------------------------------------------------------

local function dutyList()
    local list = {}
    for src, shift in pairs(onDuty) do
        list[#list + 1] = {
            id = src,
            name = nameOf(src),
            rank = Config.Ranks[shift.rank] and Config.Ranks[shift.rank].label or '?',
            callsign = shift.callsign,
        }
    end
    table.sort(list, function(a, b) return a.name < b.name end)
    return list
end

local function pushDuty()
    local list = dutyList()
    for src in pairs(onDuty) do
        TriggerClientEvent('ls_police:duty', src, list)
    end
end

local function pushState(src)
    TriggerClientEvent('ls_police:state', src, {
        onDuty = onDuty[src] ~= nil,
        rank = rankOf(src),
        rankLabel = rankOf(src) and Config.Ranks[rankOf(src)].label or nil,
        perms = rankOf(src) and Config.Ranks[rankOf(src)].perms or {},
        cuffed = cuffed[src],
        escorted = escortedBy[src] ~= nil,
        jail = jailed[src],
    })
end

-- --- restoring after a relog or restart -------------------------------------

local function restore(src)
    local identifier = identifierOf(src)

    local cuff = dbSingle('SELECT kind, by_name FROM police_cuffs WHERE identifier = ?', { identifier })
    if cuff then
        cuffed[src] = { kind = cuff.kind, by = cuff.by_name }
    end

    local jail = dbSingle('SELECT until_ts, reason, bail FROM police_jail WHERE identifier = ?', { identifier })
    if jail then
        if tonumber(jail.until_ts) > os.time() then
            jailed[src] = { until_ts = tonumber(jail.until_ts), reason = jail.reason, bail = tonumber(jail.bail) }
            TriggerClientEvent('ls_police:jail', src, jailed[src], Config.Jail)
        else
            dbExec('DELETE FROM police_jail WHERE identifier = ?', { identifier })
        end
    end

    pushState(src)
end

AddEventHandler('playerDropped', function()
    local src = source
    -- Cuffs and jail stay in the database; only the live handles are dropped.
    if escorting[src] then
        local detainee = escorting[src]
        escortedBy[detainee] = nil
        TriggerClientEvent('ls_police:escort', detainee, nil)
        escorting[src] = nil
    end
    if escortedBy[src] then
        escorting[escortedBy[src]] = nil
        escortedBy[src] = nil
    end

    onDuty[src] = nil
    cuffed[src] = nil
    jailed[src] = nil
    escapeUntil[src] = nil
    taserUntil[src] = nil
    pushDuty()
end)

RegisterNetEvent('ls_police:ready', function()
    restore(source)
end)

-- --- duty -------------------------------------------------------------------

RegisterNetEvent('ls_police:toggleDuty', function()
    local src = source
    if not allowed(src, 'duty') then return end

    if onDuty[src] then
        onDuty[src] = nil
        notify(src, Locale.offDuty)
        logAction('Снятие со службы', src, nil, '')
        pushState(src)
        pushDuty()
        TriggerClientEvent('ls_police:uniform', src, false)
        return
    end

    local ok, station = atStation(src)
    if not ok then
        notify(src, Locale.notAtStation)
        return
    end

    local record = dbSingle('SELECT rank, callsign FROM police_officers WHERE identifier = ?',
        { identifierOf(src) })
    if not record then
        notify(src, Locale.notOfficer)
        return
    end

    local rank = math.min(tonumber(record.rank) or 1, Config.MaxRank)
    onDuty[src] = { rank = rank, callsign = record.callsign or '', station = station }

    notify(src, Locale.onDuty:format(Config.Ranks[rank].label))
    logAction('Заступил на службу', src, nil, Config.Ranks[rank].label)

    -- Uniform and kit.
    TriggerClientEvent('ls_police:uniform', src, true, Config.Uniform)

    local given = 0
    for _, entry in ipairs(Config.Loadout) do
        if not entry.perm or can(src, entry.perm) then
            local okGive, gave = pcall(function()
                return exports.ls_inventory:giveItem(src, entry.item, 1)
            end)
            if okGive and gave == true then given = given + 1 end
        end
    end
    notify(src, given > 0 and Locale.loadoutGiven or Locale.loadoutNoRoom)

    pushState(src)
    pushDuty()
end)

RegisterNetEvent('ls_police:requestDuty', function()
    local src = source
    if not onDuty[src] then return end
    TriggerClientEvent('ls_police:duty', src, dutyList())
end)

-- --- cuffs ------------------------------------------------------------------

local function applyCuffs(src, targetId, kind, byName)
    cuffed[targetId] = { kind = kind, by = byName }

    dbExec([[INSERT INTO police_cuffs (identifier, kind, by_name) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE kind = VALUES(kind), by_name = VALUES(by_name), since = CURRENT_TIMESTAMP]],
        { identifierOf(targetId), kind, byName })

    TriggerClientEvent('ls_police:cuffed', targetId, kind)
    notify(targetId, kind == 'soft' and Locale.cuffedSoft or Locale.cuffedHard)
    pushState(targetId)
end

RegisterNetEvent('ls_police:cuff', function(targetId, kind)
    local src = source
    targetId = gate(src, 'cuff', 'cuff', targetId)
    if not targetId then return end

    if cuffed[targetId] then
        notify(src, Locale.alreadyCuffed)
        return
    end

    kind = (kind == 'soft') and 'soft' or 'hard'

    -- The officer must actually be carrying restraints.
    local okItem, taken = pcall(function()
        return exports.ls_inventory:takeItem(src, 'HANDCUFFS', 1)
    end)
    if not okItem or taken ~= true then
        notify(src, Locale.needCuffs)
        return
    end

    applyCuffs(src, targetId, kind, nameOf(src))
    notify(src, Locale.cuffApplied)
    logAction('Наручники', src, targetId, kind == 'soft' and 'стяжки' or 'жёсткие')
end)

local function releaseCuffs(targetId)
    cuffed[targetId] = nil
    dbExec('DELETE FROM police_cuffs WHERE identifier = ?', { identifierOf(targetId) })
    TriggerClientEvent('ls_police:cuffed', targetId, nil)
    notify(targetId, Locale.uncuffed)
    pushState(targetId)

    if escortedBy[targetId] then
        escorting[escortedBy[targetId]] = nil
        escortedBy[targetId] = nil
        TriggerClientEvent('ls_police:escort', targetId, nil)
    end
end

RegisterNetEvent('ls_police:uncuff', function(targetId)
    local src = source
    targetId = gate(src, 'uncuff', 'cuff', targetId, true)
    if not targetId then return end

    releaseCuffs(targetId)
    notify(src, Locale.uncuffDone)
    logAction('Снятие наручников', src, targetId, '')
end)

-- A key works without being on duty: that is the point of a key.
RegisterNetEvent('ls_police:uncuffWithKey', function(targetId)
    local src = source
    if not allowed(src, 'uncuff') then return end

    targetId = tonumber(targetId)
    if not targetId or GetPlayerName(targetId) == nil then
        notify(src, Locale.targetNotFound)
        return
    end
    if not cuffed[targetId] then
        notify(src, Locale.notCuffed)
        return
    end

    local pedA, pedB = GetPlayerPed(src), GetPlayerPed(targetId)
    if pedA == 0 or pedB == 0
        or #(GetEntityCoords(pedA) - GetEntityCoords(pedB)) > Config.ActionDistance then
        notify(src, Locale.tooFar)
        return
    end

    local okItem, taken = pcall(function()
        return exports.ls_inventory:takeItem(src, 'CUFF_KEY', 1)
    end)
    if not okItem or taken ~= true then
        notify(src, Locale.needKey)
        return
    end

    releaseCuffs(targetId)
    notify(src, Locale.uncuffDone)
    logAction('Снятие наручников ключом', src, targetId, '')
end)

RegisterNetEvent('ls_police:tryEscape', function()
    local src = source
    if not allowed(src, 'escape') then return end

    local state = cuffed[src]
    if not state then return end

    if state.kind == 'hard' and Config.Cuffs.hardNeedsKey then
        notify(src, Locale.escapeHard)
        return
    end

    local now = os.time()
    if escapeUntil[src] and escapeUntil[src] > now then
        notify(src, Locale.escapeCooldown:format(escapeUntil[src] - now))
        return
    end

    -- The roll happens here, not on the client, and only after the bar has had
    -- time to run; the client reports back when it finishes.
    escapeUntil[src] = now + Config.Cuffs.softEscapeSeconds + Config.Cuffs.escapeCooldown
    TriggerClientEvent('ls_police:escapeStarted', src, Config.Cuffs.softEscapeSeconds)
    notify(src, Locale.escapeStart)

    SetTimeout(Config.Cuffs.softEscapeSeconds * 1000, function()
        if not cuffed[src] or GetPlayerName(src) == nil then return end

        if math.random(100) <= Config.Cuffs.softEscapeChance then
            escapeUntil[src] = nil
            releaseCuffs(src)
            notify(src, Locale.escapeSuccess)
            logAction('Побег из стяжек', nil, src, 'удачно')
        else
            notify(src, Locale.escapeFail:format(Config.Cuffs.escapeCooldown))
            TriggerClientEvent('ls_police:escapeFailed', src)
        end
    end)
end)

-- --- escorting --------------------------------------------------------------

RegisterNetEvent('ls_police:escort', function(targetId)
    local src = source
    targetId = gate(src, 'escort', 'cuff', targetId, true)
    if not targetId then return end

    if escorting[src] == targetId then
        escorting[src] = nil
        escortedBy[targetId] = nil
        TriggerClientEvent('ls_police:escort', targetId, nil)
        notify(src, Locale.escortStop)
        notify(targetId, Locale.escortFreed)
        return
    end

    if escortedBy[targetId] then
        notify(src, Locale.alreadyCuffed)
        return
    end

    escorting[src] = targetId
    escortedBy[targetId] = src
    TriggerClientEvent('ls_police:escort', targetId, src)
    notify(src, Locale.escortStart)
    notify(targetId, Locale.escortBeing)
    logAction('Конвоирование', src, targetId, '')
end)

RegisterNetEvent('ls_police:escortBroke', function()
    local src = source
    local officer = escortedBy[src]
    if not officer then return end

    escorting[officer] = nil
    escortedBy[src] = nil
    notify(officer, Locale.escortTooFar)
    TriggerClientEvent('ls_police:escort', src, nil)
end)

RegisterNetEvent('ls_police:vehicleMove', function(targetId, action)
    local src = source
    targetId = gate(src, 'escort', 'cuff', targetId, true)
    if not targetId then return end

    TriggerClientEvent('ls_police:vehicleMove', targetId, action == 'out' and 'out' or 'in')
    notify(src, action == 'out' and Locale.pulledOut or Locale.putInCar)
    logAction(action == 'out' and 'Вытащен из транспорта' or 'Посажен в транспорт', src, targetId, '')
end)

RegisterNetEvent('ls_police:kneel', function(targetId, down)
    local src = source
    targetId = gate(src, 'escort', 'cuff', targetId, true)
    if not targetId then return end

    TriggerClientEvent('ls_police:kneel', targetId, down == true)
    notify(src, down and Locale.kneelDown or Locale.standUp)
end)

-- --- search and seizure -----------------------------------------------------

RegisterNetEvent('ls_police:search', function(targetId)
    local src = source
    targetId = gate(src, 'search', 'search', targetId)
    if not targetId then return end

    local ok, state = pcall(function() return exports.ls_inventory:getInventory(targetId) end)
    if not ok or type(state) ~= 'table' then
        notify(src, Locale.seizeNothing)
        return
    end

    TriggerClientEvent('ls_police:searchResult', src, {
        target = targetId,
        name = nameOf(targetId),
        slots = state.slots or {},
    })
    notify(src, Locale.searchOpened:format(nameOf(targetId)))
    notify(targetId, Locale.searchedBy)
    logAction('Обыск', src, targetId, '')
end)

RegisterNetEvent('ls_police:seize', function(targetId, slot)
    local src = source
    targetId = gate(src, 'seize', 'seize', targetId)
    if not targetId then return end

    local ok, item = pcall(function() return exports.ls_inventory:takeSlot(targetId, slot) end)
    if not ok or type(item) ~= 'string' then
        notify(src, Locale.seizeNothing)
        return
    end

    dbExec('INSERT INTO police_seized (identifier, item, count, by_name) VALUES (?, ?, 1, ?)',
        { identifierOf(targetId), item, nameOf(src) })

    local okDef, def = pcall(function() return exports.ls_inventory:getItemDef(item) end)
    local label = (okDef and type(def) == 'table' and def.label) or item

    notify(src, Locale.seized:format(label))
    notify(targetId, Locale.seizedFrom:format(label))
    logAction('Изъятие', src, targetId, label)

    -- Refresh the officer's view of the searched inventory.
    local okState, state = pcall(function() return exports.ls_inventory:getInventory(targetId) end)
    if okState and type(state) == 'table' then
        TriggerClientEvent('ls_police:searchResult', src, {
            target = targetId,
            name = nameOf(targetId),
            slots = state.slots or {},
        })
    end
end)

RegisterNetEvent('ls_police:checkDocs', function(targetId)
    local src = source
    targetId = gate(src, 'search', 'search', targetId)
    if not targetId then return end

    local rows = dbQuery('SELECT kind, data, revoked FROM documents WHERE identifier = ?',
        { identifierOf(targetId) })

    TriggerClientEvent('ls_police:docsResult', src, {
        name = nameOf(targetId),
        static = staticOf(targetId),
        documents = rows or {},
    })
    notify(targetId, Locale.docsShown)
    logAction('Проверка документов', src, targetId, '')
end)

-- --- wanted -----------------------------------------------------------------

local function wantedLevel(identifier)
    local row = dbSingle(
        'SELECT COALESCE(SUM(level), 0) AS total FROM police_wanted WHERE identifier = ? AND cleared = 0',
        { identifier })
    local total = row and tonumber(row.total) or 0
    return math.min(total, Config.Wanted.maxLevel)
end

local function addWanted(identifier, level, reason, byName)
    dbExec('INSERT INTO police_wanted (identifier, level, reason, by_name) VALUES (?, ?, ?, ?)',
        { identifier, level, reason, byName })
end

RegisterNetEvent('ls_police:addWanted', function(targetId, level, reason)
    local src = source
    targetId = gate(src, 'arrest', 'arrest', targetId)
    if not targetId then return end

    level = math.max(1, math.min(tonumber(level) or 1, Config.Wanted.maxLevel))
    reason = tostring(reason or ''):sub(1, 150)

    addWanted(identifierOf(targetId), level, reason, nameOf(src))
    notify(src, Locale.wantedAdded:format(nameOf(targetId), level, reason))
    notify(targetId, Locale.wantedSelf:format(wantedLevel(identifierOf(targetId)), reason))
    logAction('Розыск объявлен', src, targetId, ('%d — %s'):format(level, reason))
end)

RegisterNetEvent('ls_police:clearWanted', function(identifier)
    local src = source
    if gate(src, 'mdt', 'clearWanted') ~= true then return end
    if type(identifier) ~= 'string' then return end

    dbExec('UPDATE police_wanted SET cleared = 1 WHERE identifier = ? AND cleared = 0', { identifier })

    local targetSrc = srcOfIdentifier(identifier)
    local who = targetSrc and nameOf(targetSrc) or identifier
    notify(src, Locale.wantedCleared:format(who))
    logAction('Розыск снят', src, targetSrc, who)
end)

-- Automatic additions. The client reports the event; the server decides whether
-- it counts, so a spoofed report can at worst waste its own cooldown.
-- Вынесено из события, чтобы тем же путём мог ходить ls_crime: ограбление
-- подтверждает сервер, и розыск должен вешаться оттуда, а не по слову клиента.
local function raiseWanted(src, kind)
    local rule = Config.Wanted.auto[kind]
    if not rule then return false end

    local key = ('%d:%s'):format(src, kind)
    local now = os.time()
    if autoUntil[key] and autoUntil[key] > now then return end
    autoUntil[key] = now + Config.Wanted.autoCooldown

    addWanted(identifierOf(src), rule.level, rule.reason, 'автоматически')
    notify(src, Locale.wantedSelf:format(wantedLevel(identifierOf(src)), rule.reason))
    logAction('Автоматический розыск', nil, src, rule.reason)

    for officer in pairs(onDuty) do
        TriggerClientEvent('ls_police:alert', officer, {
            name = nameOf(src),
            reason = rule.reason,
            coords = GetEntityCoords(GetPlayerPed(src)),
        })
    end
    return true
end

RegisterNetEvent('ls_police:crime', function(kind)
    local src = source
    if not allowed(src, 'crime') then return end
    raiseWanted(src, kind)
end)

exports('reportCrime', function(src, kind)
    return raiseWanted(src, kind) == true
end)

exports('onlineOfficers', function()
    local n = 0
    for _ in pairs(onDuty) do n = n + 1 end
    return n
end)

-- --- jail -------------------------------------------------------------------

local function release(src)
    jailed[src] = nil
    dbExec('DELETE FROM police_jail WHERE identifier = ?', { identifierOf(src) })
    TriggerClientEvent('ls_police:jail', src, nil, Config.Jail)
    notify(src, Locale.jailReleased)
    pushState(src)
end

RegisterNetEvent('ls_police:arrest', function(targetId, minutes, reason)
    local src = source
    targetId = gate(src, 'arrest', 'arrest', targetId, true)
    if not targetId then return end

    minutes = math.max(Config.Jail.minMinutes, math.min(tonumber(minutes) or 5, Config.Jail.maxMinutes))
    reason = tostring(reason or ''):sub(1, 150)

    local until_ts = os.time() + minutes * 60
    local bail = minutes * Config.Jail.bailPerMinute
    local identifier = identifierOf(targetId)

    dbExec([[INSERT INTO police_jail (identifier, until_ts, reason, by_name, bail) VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE until_ts = VALUES(until_ts), reason = VALUES(reason),
                                     by_name = VALUES(by_name), bail = VALUES(bail)]],
        { identifier, until_ts, reason, nameOf(src), bail })

    dbExec('UPDATE police_wanted SET cleared = 1 WHERE identifier = ? AND cleared = 0', { identifier })

    jailed[targetId] = { until_ts = until_ts, reason = reason, bail = bail }
    releaseCuffs(targetId)

    TriggerClientEvent('ls_police:jail', targetId, jailed[targetId], Config.Jail)
    notify(targetId, Locale.jailed:format(minutes, reason))
    notify(src, Locale.jailedBy:format(nameOf(targetId), minutes))
    logAction('Арест', src, targetId, ('%d мин — %s'):format(minutes, reason))
    pushState(targetId)
end)

RegisterNetEvent('ls_police:payBail', function()
    local src = source
    if not allowed(src, 'arrest') then return end

    local state = jailed[src]
    if not state then return end

    if wantedLevel(identifierOf(src)) > Config.Jail.bailAllowedFromLevel then
        notify(src, Locale.jailBailBlocked)
        return
    end

    local ok, paid = pcall(function()
        return exports.phone_garage:removeMoney(src, state.bail)
    end)
    if not ok or paid ~= true then
        notify(src, Locale.jailBailNoMoney)
        return
    end

    release(src)
    notify(src, Locale.jailBailPaid)
    logAction('Залог', nil, src, ('$%d'):format(state.bail))
end)

CreateThread(function()
    while true do
        Wait(15000)
        local now = os.time()
        for src, state in pairs(jailed) do
            if GetPlayerName(src) == nil then
                jailed[src] = nil
            elseif state.until_ts <= now then
                release(src)
            end
        end
    end
end)

-- --- fines ------------------------------------------------------------------

RegisterNetEvent('ls_police:fine', function(targetId, amount, reason)
    local src = source
    targetId = gate(src, 'fine', 'fine', targetId)
    if not targetId then return end

    amount = math.floor(tonumber(amount) or 0)
    if amount < Config.Fines.min or amount > Config.Fines.max then
        notify(src, Locale.fineBadAmount)
        return
    end
    reason = tostring(reason or ''):sub(1, 150)

    local ok, paid = pcall(function()
        return exports.phone_garage:removeMoney(targetId, amount)
    end)
    local settled = ok and paid == true

    dbExec('INSERT INTO police_fines (identifier, amount, reason, by_name, paid) VALUES (?, ?, ?, ?, ?)',
        { identifierOf(targetId), amount, reason, nameOf(src), settled and 1 or 0 })

    notify(src, Locale.fineIssued:format(amount, reason))
    notify(targetId, Locale.fineReceived:format(amount, reason))
    notify(targetId, settled and Locale.fineCharged:format(amount) or Locale.fineUnpaid)
    logAction('Штраф', src, targetId, ('$%d — %s%s'):format(amount, reason, settled and '' or ' (долг)'))
end)

-- --- taser ------------------------------------------------------------------

RegisterNetEvent('ls_police:taser', function(targetId)
    local src = source
    -- gate без targetId: проверяет смену и права, но не трёхметровую
    -- дистанцию - у тазера своя, иначе по машине не выстрелишь.
    if gate(src, 'taser', 'cuff') ~= true then return end

    targetId = tonumber(targetId)
    if not targetId or targetId == src or GetPlayerName(targetId) == nil then
        notify(src, Locale.targetNotFound)
        return
    end

    local pedA, pedB = GetPlayerPed(src), GetPlayerPed(targetId)
    if pedA == 0 or pedB == 0
        or #(GetEntityCoords(pedA) - GetEntityCoords(pedB)) > Config.Taser.range then
        notify(src, Locale.tooFar)
        return
    end

    local now = os.time()
    if taserUntil[src] and taserUntil[src] > now then
        notify(src, Locale.taserCooldown:format(taserUntil[src] - now))
        return
    end
    taserUntil[src] = now + Config.Taser.cooldown

    TriggerClientEvent('ls_police:tased', targetId, Config.Taser.stunSeconds)
    notify(targetId, Locale.taserHit)
    logAction('Тазер', src, targetId, '')
end)

-- --- impound ----------------------------------------------------------------

RegisterNetEvent('ls_police:impound', function(plate, reason)
    local src = source
    if gate(src, 'arrest', 'impound') ~= true then return end
    if type(plate) ~= 'string' then return end

    plate = plate:gsub('^%s+', ''):gsub('%s+$', ''):sub(1, 16)
    local row = dbSingle('SELECT identifier FROM player_cars WHERE plate = ?', { plate })
    local ownerIdentifier = row and row.identifier or ''

    dbExec([[INSERT INTO police_impound (plate, identifier, reason, by_name, fee) VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE reason = VALUES(reason), by_name = VALUES(by_name),
                                     fee = VALUES(fee), created_at = CURRENT_TIMESTAMP]],
        { plate, ownerIdentifier, tostring(reason or ''):sub(1, 150), nameOf(src), Config.Impound.fee })

    notify(src, Locale.impounded:format(plate))

    local ownerSrc = ownerIdentifier ~= '' and srcOfIdentifier(ownerIdentifier) or nil
    if ownerSrc then
        notify(ownerSrc, Locale.impoundedOwner:format(plate, Config.Impound.fee))
        TriggerClientEvent('phone_garage:despawn', ownerSrc, plate)
    end

    logAction('Штрафстоянка', src, ownerSrc, plate)
end)

RegisterNetEvent('ls_police:redeem', function(plate)
    local src = source
    if not allowed(src, 'mdt') then return end
    if type(plate) ~= 'string' then return end

    local identifier = identifierOf(src)
    local row = dbSingle('SELECT fee FROM police_impound WHERE plate = ? AND identifier = ?',
        { plate, identifier })
    if not row then
        notify(src, Locale.impoundEmpty)
        return
    end

    local ok, paid = pcall(function()
        return exports.phone_garage:removeMoney(src, tonumber(row.fee) or Config.Impound.fee)
    end)
    if not ok or paid ~= true then
        notify(src, Locale.impoundNoMoney)
        return
    end

    dbExec('DELETE FROM police_impound WHERE plate = ?', { plate })
    notify(src, Locale.impoundReleased)
    logAction('Выкуп с штрафстоянки', nil, src, plate)
end)

RegisterNetEvent('ls_police:impoundList', function()
    local src = source
    if not allowed(src, 'mdt') then return end

    local rows = dbQuery(
        'SELECT plate, reason, by_name, fee, created_at FROM police_impound WHERE identifier = ?',
        { identifierOf(src) })
    TriggerClientEvent('ls_police:impoundList', src, rows or {})
end)

-- --- radio ------------------------------------------------------------------

local function sendRadio(src, message)
    if not allowed(src, 'radio') then return end
    if not onDuty[src] then
        notify(src, Locale.notOnDuty)
        return
    end

    message = tostring(message or ''):gsub('^%s+', ''):gsub('%s+$', ''):sub(1, 200)
    if message == '' then
        notify(src, Locale.radioEmpty)
        return
    end

    local shift = onDuty[src]
    local tag = ('%s %s%s'):format(
        Config.Ranks[shift.rank].label,
        nameOf(src),
        shift.callsign ~= '' and (' [' .. shift.callsign .. ']') or '')

    for officer in pairs(onDuty) do
        TriggerClientEvent('chat:addMessage', officer, {
            color = { 90, 170, 255 },
            multiline = true,
            args = { ('РАЦИЯ ' .. tag), message },
        })
    end
end

RegisterNetEvent('ls_police:radio', function(message)
    sendRadio(source, message)
end)

-- --- MDT --------------------------------------------------------------------

RegisterNetEvent('ls_police:mdtSearch', function(query)
    local src = source
    if gate(src, 'mdt', 'mdt') ~= true then return end

    query = tostring(query or ''):gsub('^%s+', ''):gsub('%s+$', ''):sub(1, 64)
    if query == '' then return end

    local like = '%' .. query .. '%'
    local people = dbQuery([[SELECT identifier, first_name, last_name, static
                             FROM characters
                             WHERE CONCAT(first_name, ' ', last_name) LIKE ?
                                OR CAST(static AS CHAR) = ?
                             LIMIT 15]], { like, query })

    if not people or #people == 0 then
        notify(src, Locale.mdtNotFound)
        TriggerClientEvent('ls_police:mdtResult', src, { people = {} })
        return
    end

    for _, person in ipairs(people) do
        person.wanted = wantedLevel(person.identifier)
        person.fines = dbQuery(
            'SELECT amount, reason, by_name, paid, created_at FROM police_fines WHERE identifier = ? ORDER BY id DESC LIMIT 10',
            { person.identifier }) or {}
        person.record = dbQuery(
            'SELECT action, actor, detail, created_at FROM police_logs WHERE target = ? ORDER BY id DESC LIMIT 10',
            { ('%s %s'):format(person.first_name, person.last_name) }) or {}
        person.licenses = dbQuery(
            "SELECT id, kind, revoked FROM documents WHERE identifier = ? AND kind IN ('driver','weapon')",
            { person.identifier }) or {}
        person.wantedReasons = dbQuery(
            'SELECT level, reason, by_name, created_at FROM police_wanted WHERE identifier = ? AND cleared = 0',
            { person.identifier }) or {}
    end

    TriggerClientEvent('ls_police:mdtResult', src, { people = people })
end)

RegisterNetEvent('ls_police:wantedList', function()
    local src = source
    if gate(src, 'mdt', 'mdt') ~= true then return end

    local rows = dbQuery([[SELECT w.identifier, w.level, w.reason, w.by_name, w.created_at,
                                  c.first_name, c.last_name, c.static
                           FROM police_wanted w
                           LEFT JOIN characters c ON c.identifier = w.identifier
                           WHERE w.cleared = 0
                           ORDER BY w.created_at DESC LIMIT 50]])
    TriggerClientEvent('ls_police:wantedList', src, rows or {})
end)

RegisterNetEvent('ls_police:revokeLicense', function(documentId)
    local src = source
    if gate(src, 'mdt', 'revokeLicense') ~= true then return end
    if type(documentId) ~= 'string' then return end

    local row = dbSingle("SELECT kind, identifier FROM documents WHERE id = ? AND kind IN ('driver','weapon')",
        { documentId })
    if not row then
        notify(src, Locale.licenseNotFound)
        return
    end

    dbExec('UPDATE documents SET revoked = 1 WHERE id = ?', { documentId })
    notify(src, Locale.licenseRevoked:format(row.kind == 'driver' and 'водительская' or 'на оружие'))
    logAction('Аннулирование лицензии', src, srcOfIdentifier(row.identifier), row.kind)
end)

-- --- personnel commands -----------------------------------------------------

local function isAdmin(src)
    return src == 0 or IsPlayerAceAllowed(src, 'police.admin')
end

RegisterCommand('police', function(src, args)
    local action = args[1]

    if action == 'hire' or action == 'rank' or action == 'fire' then
        if not isAdmin(src) and not can(src, 'hire') then
            if src ~= 0 then notify(src, Locale.noPermission) end
            return
        end

        local targetId = tonumber(args[2])
        if not targetId or GetPlayerName(targetId) == nil then
            if src ~= 0 then notify(src, Locale.targetNotFound) end
            return
        end
        local identifier = identifierOf(targetId)

        if action == 'fire' then
            dbExec('DELETE FROM police_officers WHERE identifier = ?', { identifier })
            onDuty[targetId] = nil
            pushState(targetId)
            pushDuty()
            if src ~= 0 then notify(src, Locale.fired:format(nameOf(targetId))) end
            logAction('Увольнение', src ~= 0 and src or nil, targetId, '')
            return
        end

        local rank = math.max(1, math.min(tonumber(args[3]) or 1, Config.MaxRank))
        local callsign = tostring(args[4] or ''):sub(1, 16)

        dbExec([[INSERT INTO police_officers (identifier, rank, callsign) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE rank = VALUES(rank),
                                         callsign = IF(VALUES(callsign) = '', callsign, VALUES(callsign))]],
            { identifier, rank, callsign })

        if onDuty[targetId] then
            onDuty[targetId].rank = rank
            pushState(targetId)
            pushDuty()
        end

        if src ~= 0 then
            notify(src, (action == 'hire' and Locale.hired or Locale.rankSet)
                :format(nameOf(targetId), Config.Ranks[rank].label))
        end
        logAction(action == 'hire' and 'Приём в полицию' or 'Смена ранга', src ~= 0 and src or nil,
            targetId, Config.Ranks[rank].label)
        return
    end

    if src ~= 0 then
        local list = dutyList()
        notify(src, #list > 0 and Locale.officersOnline:format(#list) or Locale.officersNone)
    end
end, false)

RegisterCommand(Config.Radio.textCommand, function(src, args)
    if src == 0 then return end
    sendRadio(src, table.concat(args, ' '))
end, false)

-- --- exports ----------------------------------------------------------------

exports('isOnDuty', function(src) return onDuty[src] ~= nil end)
exports('isCuffed', function(src) return cuffed[src] ~= nil end)
exports('isJailed', function(src) return jailed[src] ~= nil end)
exports('getRank', function(src) return rankOf(src) end)

AddEventHandler('onResourceStart', function(name)
    if name ~= RES then return end
    math.randomseed(os.time())
    print('[ls_police] started')
end)
