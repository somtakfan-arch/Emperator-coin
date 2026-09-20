-- Форум как часть игры: заявления, жалобы, отчёты фракций.
--
-- Всё живёт на сервере и переживает рестарт. Права на чтение проверяются
-- здесь, а не в телефоне: закрытый раздел не должен приезжать клиенту
-- вообще, иначе "невидимая" жалоба читается в консоли за минуту.

local RES = GetCurrentResourceName()
local DATA_FILE = 'forum.json'

local topics = {}       -- [id] = { board, title, body, author, authorName, open, at, replies }
local nextTopic = 1
local lastCall = {}
local dirty = false

local function notify(src, text)
    TriggerClientEvent('ls_forum:notify', src, text)
end

local function identifierOf(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 8) == 'license:' then return id end
    end
    return 'name:' .. GetPlayerName(src)
end

local function nameOf(src)
    local ok, name = pcall(function() return exports.ls_character:getName(src) end)
    if ok and type(name) == 'string' and name ~= '' then return name end
    return GetPlayerName(src)
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

-- Обрезаем по буквам, а не по байтам: 60 байт кириллицы - это 30 символов,
-- и заголовок обрывался бы вдвое раньше обещанного, да ещё и посередине
-- буквы.
local function trim(text, limit)
    if type(text) ~= 'string' then return '' end
    text = text:gsub('^%s+', ''):gsub('%s+$', '')

    local out, count = {}, 0
    local ok = pcall(function()
        for _, code in utf8.codes(text) do
            count = count + 1
            if count > limit then break end
            out[#out + 1] = utf8.char(code)
        end
    end)
    if not ok then return '' end
    return table.concat(out)
end

-- --- права -------------------------------------------------------------------

local function isStaff(src)
    if IsPlayerAceAllowed(src, 'police.admin') or IsPlayerAceAllowed(src, 'garage.admin') then
        return true
    end
    local ok, rank = pcall(function() return exports.ls_police:getRank(src) end)
    if ok and (tonumber(rank) or 0) >= Config.StaffRank then return true end

    -- Глава семьи отвечает за заявки в свою семью.
    local okFam, family = pcall(function() return exports.ls_property:familyOf(src) end)
    return okFam and type(family) == 'table' and family.leader == true
end

local function boardByKey(key)
    for _, board in ipairs(Config.Boards) do
        if board.key == key then return board end
    end
    return nil
end

local function maySee(src, topic)
    local board = boardByKey(topic.board)
    if not board then return false end
    if board.read == 'all' then return true end
    if topic.author == identifierOf(src) then return true end
    return isStaff(src)
end

-- --- хранение ----------------------------------------------------------------

local function save()
    SaveResourceFile(RES, DATA_FILE, json.encode({
        topics = topics, nextTopic = nextTopic,
    }), -1)
    dirty = false
end

local function load()
    local raw = LoadResourceFile(RES, DATA_FILE)
    if not raw or raw == '' then return end
    local ok, data = pcall(json.decode, raw)
    if not ok or type(data) ~= 'table' then
        print('[ls_forum] forum.json битый, начинаю с нуля')
        return
    end
    topics = data.topics or {}
    nextTopic = tonumber(data.nextTopic) or 1
end

-- --- витрина -----------------------------------------------------------------

local function openCount(identifier)
    local n = 0
    for _, topic in pairs(topics) do
        if topic.author == identifier and topic.open then n = n + 1 end
    end
    return n
end

local function view(src)
    local staff = isStaff(src)
    local identifier = identifierOf(src)

    local boards = {}
    for _, board in ipairs(Config.Boards) do
        boards[#boards + 1] = {
            key = board.key, label = board.label, hint = board.hint,
            closed = board.read ~= 'all',
        }
    end

    local rows = {}
    for id, topic in pairs(topics) do
        if maySee(src, topic) then
            local replies = {}
            for _, reply in ipairs(topic.replies or {}) do
                replies[#replies + 1] = {
                    name = reply.name, staff = reply.staff == true,
                    body = reply.body, at = reply.at,
                }
            end
            rows[#rows + 1] = {
                id = id, board = topic.board, title = topic.title, body = topic.body,
                author = topic.authorName, mine = topic.author == identifier,
                open = topic.open == true, at = topic.at, replies = replies,
            }
        end
    end

    table.sort(rows, function(a, b)
        if a.open ~= b.open then return a.open end
        return (a.at or 0) > (b.at or 0)
    end)

    -- Больше страницы в телефон не влезет, а грузить весь архив незачем.
    while #rows > Config.PageSize do table.remove(rows) end

    return { boards = boards, topics = rows, staff = staff, limits = {
        title = Config.TitleMax, body = Config.BodyMax, reply = Config.ReplyMax,
    } }
end

local function push(src)
    TriggerClientEvent('ls_forum:data', src, view(src))
end

RegisterNetEvent('ls_forum:request', function()
    push(source)
end)

-- --- темы --------------------------------------------------------------------

RegisterNetEvent('ls_forum:post', function(boardKey, title, body)
    local src = source
    if throttled(src) then return end

    local board = boardByKey(boardKey)
    if not board then
        notify(src, ForumLocale.noBoard)
        return
    end

    title = trim(title, Config.TitleMax)
    body = trim(body, Config.BodyMax)
    if title == '' or body == '' then
        notify(src, ForumLocale.tooShort)
        return
    end

    local identifier = identifierOf(src)
    if openCount(identifier) >= Config.MaxOpenPerPlayer then
        notify(src, ForumLocale.tooMany:format(Config.MaxOpenPerPlayer))
        return
    end

    local id = tostring(nextTopic)
    nextTopic = nextTopic + 1
    topics[id] = {
        board = board.key, title = title, body = body,
        author = identifier, authorName = nameOf(src),
        open = true, at = os.time(), replies = {},
    }

    dirty = true
    save()
    notify(src, ForumLocale.posted:format(title))
    push(src)

    -- Тех, кто этим занимается, надо позвать: иначе заявка лежит, пока
    -- автор не напишет в чат.
    for _, pid in ipairs(GetPlayers()) do
        local player = tonumber(pid)
        if player ~= src and isStaff(player) then
            notify(player, ForumLocale.newTopic:format(board.label, title))
        end
    end

    print(('[ls_forum] %s: [%s] %s'):format(nameOf(src), board.label, title))
end)

-- Тема от сервера, а не от игрока.
--
-- Нужна там, где форум - часть игры, а не только канцелярия: загадка про
-- клад дня должна появляться сама, без человека, который её напишет.
-- Лимит открытых тем на автора тут не применяется: у системы нет автора,
-- а её темы закрываются сами, когда теряют смысл.
-- Последние темы доски, без тела и ответов.
--
-- Нужно физической доске объявлений в мире: она показывает заголовки прямо
-- в меню E, чтобы её можно было прочитать, не доставая телефон. Закрытые
-- темы не отдаём - объявление о продаже машины, которой уже нет, только
-- путает.
exports('latest', function(boardKey, limit)
    if type(boardKey) ~= 'string' then return {} end
    limit = math.min(tonumber(limit) or 8, 25)

    local rows = {}
    for id, topic in pairs(topics) do
        if topic.board == boardKey and topic.open then
            rows[#rows + 1] = {
                id = id, title = topic.title, body = topic.body,
                author = topic.authorName, at = topic.at,
            }
        end
    end

    table.sort(rows, function(a, b) return (a.at or 0) > (b.at or 0) end)
    while #rows > limit do table.remove(rows) end
    return rows
end)

exports('systemPost', function(boardKey, title, body, tag)
    if type(boardKey) ~= 'string' or type(title) ~= 'string' or type(body) ~= 'string' then
        return nil
    end

    local board
    for _, entry in ipairs(Config.Boards) do
        if entry.key == boardKey then board = entry break end
    end
    if not board then return nil end

    -- Тема с тем же тегом заменяется, а не копится: вчерашняя загадка не
    -- должна лежать рядом с сегодняшней.
    if tag then
        for id, topic in pairs(topics) do
            if topic.tag == tag then topics[id] = nil end
        end
    end

    local id = tostring(nextTopic)
    nextTopic = nextTopic + 1
    topics[id] = {
        board = board.key,
        title = trim(title, Config.TitleMax),
        body = trim(body, Config.BodyMax),
        author = 'system', authorName = 'Система',
        open = true, at = os.time(), replies = {}, tag = tag,
    }

    dirty = true
    save()
    for _, pid in ipairs(GetPlayers()) do
        push(tonumber(pid))
    end
    return id
end)

RegisterNetEvent('ls_forum:reply', function(id, body)
    local src = source
    if throttled(src) then return end

    local topic = topics[tostring(id)]
    if not topic or not topic.open then return end
    if not maySee(src, topic) then
        notify(src, ForumLocale.noAccess)
        return
    end

    body = trim(body, Config.ReplyMax)
    if body == '' then
        notify(src, ForumLocale.tooShort)
        return
    end

    topic.replies = topic.replies or {}
    topic.replies[#topic.replies + 1] = {
        name = nameOf(src), staff = isStaff(src),
        body = body, at = os.time(),
    }

    dirty = true
    save()
    notify(src, ForumLocale.replied)
    push(src)

    local author = srcOf(topic.author)
    if author and author ~= src then
        notify(author, ForumLocale.newReply:format(topic.title))
        push(author)
    end
end)

-- Закрыть может автор или тот, кто разбирает такие темы.
RegisterNetEvent('ls_forum:close', function(id)
    local src = source
    if throttled(src) then return end

    local topic = topics[tostring(id)]
    if not topic then return end

    if topic.author ~= identifierOf(src) and not isStaff(src) then
        notify(src, ForumLocale.notYours)
        return
    end

    topic.open = false
    dirty = true
    save()
    notify(src, ForumLocale.closed)
    push(src)

    local author = srcOf(topic.author)
    if author and author ~= src then push(author) end
end)

-- --- жизненный цикл ----------------------------------------------------------

AddEventHandler('onResourceStart', function(name)
    if name ~= RES then return end
    load()
    local n, opened = 0, 0
    for _, topic in pairs(topics) do
        n = n + 1
        if topic.open then opened = opened + 1 end
    end
    print(('[ls_forum] тем: %d, открытых: %d'):format(n, opened))
end)

AddEventHandler('onResourceStop', function(name)
    if name == RES then save() end
end)

AddEventHandler('playerDropped', function()
    lastCall[source] = nil
    if dirty then save() end
end)

RegisterCommand('forum', function(src)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'garage.admin') then return end
    for id, topic in pairs(topics) do
        print(('  #%s [%s] %s — %s%s'):format(id, topic.board, topic.title,
            topic.authorName or '?', topic.open and '' or ' (закрыта)'))
    end
end, false)
