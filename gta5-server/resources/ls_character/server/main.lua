-- Server side: characters, static IDs and the name roster.
-- A static is assigned once and never reused, so it stays a stable handle.

local RES = GetCurrentResourceName()
local DATA_FILE = 'characters.json'

local characters = {}   -- [identifier] = { gender, first, last, static, appearance }
local nextStatic = Config.FirstStatic
local roster = {}       -- [serverId] = { name, static, masked }
local masked = {}       -- [serverId] = label of the mask being worn
local lastReport = {}   -- [serverId] = момент последнего принятого пакета позиции
local dirty = false

local function readJson(file, fallback)
    local raw = LoadResourceFile(RES, file)
    if not raw or raw == '' then return fallback end
    local ok, decoded = pcall(json.decode, raw)
    if not ok or type(decoded) ~= 'table' then
        print(('[ls_character] %s is corrupt, starting from scratch'):format(file))
        return fallback
    end
    return decoded
end

local function save()
    SaveResourceFile(RES, DATA_FILE, json.encode({
        characters = characters,
        nextStatic = nextStatic,
    }), -1)
    dirty = false
end

local function identifierOf(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 8) == 'license:' then return id end
    end
    return 'name:' .. GetPlayerName(src)
end

local function fullName(char)
    return ('%s %s'):format(char.first, char.last)
end

local function pushRoster()
    for _, id in ipairs(GetPlayers()) do
        TriggerClientEvent('ls_character:roster', tonumber(id), roster)
    end
end

local function enterRoster(src, char)
    roster[tostring(src)] = {
        name = fullName(char),
        static = char.static,
        masked = masked[tostring(src)] ~= nil,
    }
    pushRoster()
end

-- A masked player is shown by static only. The name still exists server-side:
-- the police MDT and the logs are not fooled by a balaclava.
exports('setMasked', function(src, on, label)
    local key = tostring(src)
    masked[key] = on and (label ~= '' and label or 'маска') or nil

    if roster[key] then
        roster[key].masked = on == true
        pushRoster()
    end
    return true
end)

exports('isMasked', function(src)
    return masked[tostring(src)] ~= nil
end)

-- --- validation ------------------------------------------------------------

-- Lua ничего не знает про юникод: ":upper()" кириллицу не трогает, а
-- символьные классы в шаблонах работают по байтам. Поэтому и проверка
-- букв, и регистр здесь делаются по кодпоинтам.

local function isNameChar(code)
    for _, range in ipairs(Config.NameRanges) do
        if code >= range[1] and code <= range[2] then return true end
    end
    return false
end

local function upperCode(code)
    if code >= 0x0061 and code <= 0x007A then return code - 0x20 end   -- a-z
    if code >= 0x0430 and code <= 0x044F then return code - 0x20 end   -- а-я
    if code == 0x0451 then return 0x0401 end                           -- ё
    return code
end

local function lowerCode(code)
    if code >= 0x0041 and code <= 0x005A then return code + 0x20 end
    if code >= 0x0410 and code <= 0x042F then return code + 0x20 end
    if code == 0x0401 then return 0x0451 end
    return code
end

-- Приводит "иВАН" к "Иван", "петров-водкин" к "Петров-Водкин".
-- Возвращает nil, если имя не годится.
local function tidyName(name)
    if type(name) ~= 'string' then return nil end
    name = name:gsub('^%s+', ''):gsub('%s+$', '')

    -- utf8.codes падает на битой последовательности, а клиент может
    -- прислать что угодно.
    local codes = {}
    local ok = pcall(function()
        for _, code in utf8.codes(name) do codes[#codes + 1] = code end
    end)
    if not ok then return nil end

    if #codes < Config.NameMin or #codes > Config.NameMax then return nil end

    local HYPHEN = 0x002D
    if codes[1] == HYPHEN or codes[#codes] == HYPHEN then return nil end

    local out = {}
    local startOfWord = true
    for index, code in ipairs(codes) do
        if not isNameChar(code) then return nil end
        if code == HYPHEN and startOfWord then return nil end   -- "Пе--тров"

        out[index] = utf8.char(startOfWord and upperCode(code) or lowerCode(code))
        startOfWord = (code == HYPHEN)
    end

    return table.concat(out)
end

-- Appearance is cosmetic, so it is shape-checked and stored rather than
-- re-validated field by field.
local function tidyAppearance(raw)
    if type(raw) ~= 'table' then return nil end

    local clamp = function(value, low, high, fallback)
        value = tonumber(value)
        if not value then return fallback end
        return math.max(low, math.min(high, value))
    end

    local appearance = {
        mother = math.floor(clamp(raw.mother, 0, Config.MaxParent, 0)),
        father = math.floor(clamp(raw.father, 0, Config.MaxParent, 0)),
        shapeMix = clamp(raw.shapeMix, 0.0, 1.0, 0.5),
        skinMix = clamp(raw.skinMix, 0.0, 1.0, 0.5),
        eyeColour = math.floor(clamp(raw.eyeColour, 0, Config.MaxEyeColour, 0)),
        hair = math.floor(clamp(raw.hair, 0, 80, 0)),
        hairColour = math.floor(clamp(raw.hairColour, 0, 63, 0)),
        hairHighlight = math.floor(clamp(raw.hairHighlight, 0, 63, 0)),
        features = {},
        overlays = {},
        overlayColours = {},
    }

    for index = 0, 19 do
        local value = raw.features and (raw.features[tostring(index)] or raw.features[index])
        appearance.features[tostring(index)] = clamp(value, -1.0, 1.0, 0.0)
    end

    for _, overlay in ipairs(Config.Overlays) do
        local key = tostring(overlay.id)
        local value = raw.overlays and (raw.overlays[key] or raw.overlays[overlay.id])
        appearance.overlays[key] = math.floor(clamp(value, -1, 254, -1))

        local colour = raw.overlayColours and (raw.overlayColours[key] or raw.overlayColours[overlay.id])
        appearance.overlayColours[key] = math.floor(clamp(colour, 0, 63, 0))
    end

    return appearance
end

-- --- lifecycle -------------------------------------------------------------

AddEventHandler('onResourceStart', function(name)
    if name ~= RES then return end
    local data = readJson(DATA_FILE, {})
    characters = data.characters or {}
    nextStatic = tonumber(data.nextStatic) or Config.FirstStatic

    local n = 0
    for _ in pairs(characters) do n = n + 1 end
    print(('[ls_character] loaded %d characters, next static #%d'):format(n, nextStatic))
end)

AddEventHandler('onResourceStop', function(name)
    if name == RES then save() end
end)

AddEventHandler('playerDropped', function()
    masked[tostring(source)] = nil
    roster[tostring(source)] = nil
    lastReport[tostring(source)] = nil
    pushRoster()
    if dirty then save() end
end)

-- --- last known position ---------------------------------------------------
-- Спавн на точке выхода. Позиция едет внутри самого характера, поэтому
-- сохраняется и грузится тем же кодом, что и всё остальное.

local function tidyPosition(raw)
    if type(raw) ~= 'table' then return nil end

    local x, y, z = tonumber(raw.x), tonumber(raw.y), tonumber(raw.z)
    if not x or not y or not z then return nil end

    -- NaN не равен сам себе. Один такой в файле - и персонаж больше никогда
    -- нормально не заспавнится, так что ловим здесь.
    if x ~= x or y ~= y or z ~= z then return nil end

    -- Карта GTA V с большим запасом. Всё, что дальше - мусор или чит.
    if math.abs(x) > 10000.0 or math.abs(y) > 10000.0 then return nil end
    if z < -1000.0 or z > 3000.0 then return nil end

    local h = tonumber(raw.h) or 0.0
    if h ~= h then h = 0.0 end

    return { x = x, y = y, z = z, h = h % 360.0 }
end

RegisterNetEvent('ls_character:position', function(raw)
    local src = source
    if not Config.RememberPosition then return end

    -- Пол-интервала форы на пинг, всё что чаще - выбрасываем: иначе клиент
    -- с читом может слать по пакету на тик.
    local key = tostring(src)
    local now = GetGameTimer()
    if lastReport[key] and now - lastReport[key] < Config.PositionInterval * 0.5 then
        return
    end
    lastReport[key] = now

    local char = characters[identifierOf(src)]
    if not char then return end

    local pos = tidyPosition(raw)
    if not pos then return end

    char.position = pos
    dirty = true
end)

-- Файл пишется по таймеру, а не на каждый пакет.
CreateThread(function()
    while true do
        Wait(Config.PositionFlush)
        if dirty then save() end
    end
end)

-- --- client requests -------------------------------------------------------

RegisterNetEvent('ls_character:request', function()
    local src = source
    local char = characters[identifierOf(src)]

    if char then
        enterRoster(src, char)
        TriggerClientEvent('ls_character:load', src, char)
    else
        TriggerClientEvent('ls_character:create', src)
    end
end)

RegisterNetEvent('ls_character:submit', function(data)
    local src = source
    if type(data) ~= 'table' then return end

    local id = identifierOf(src)
    if characters[id] then
        -- Already has one: never hand out a second static.
        TriggerClientEvent('ls_character:load', src, characters[id])
        return
    end

    local first = tidyName(data.first)
    local last = tidyName(data.last)
    if not first or not last then
        TriggerClientEvent('ls_character:rejected', src,
            ('Имя и фамилия: от %d до %d букв, без цифр и символов')
                :format(Config.NameMin, Config.NameMax))
        return
    end

    local gender = (data.gender == 'female') and 'female' or 'male'
    local appearance = tidyAppearance(data.appearance)
    if not appearance then
        TriggerClientEvent('ls_character:rejected', src, 'Внешность не сохранилась, попробуй ещё раз')
        return
    end

    local char = {
        gender = gender,
        first = first,
        last = last,
        static = nextStatic,
        appearance = appearance,
    }

    characters[id] = char
    nextStatic = nextStatic + 1
    dirty = true
    save()

    enterRoster(src, char)
    TriggerClientEvent('ls_character:load', src, char)
    print(('[ls_character] %s registered as %s %s (static #%d)')
        :format(GetPlayerName(src), first, last, char.static))
end)

-- --- chat ------------------------------------------------------------------
-- Messages go out under the character name, not the Rockstar nickname.

AddEventHandler('chatMessage', function(src, _, message)
    local char = characters[identifierOf(src)]
    if not char then return end

    CancelEvent()
    TriggerClientEvent('chat:addMessage', -1, {
        color = { 200, 210, 230 },
        multiline = true,
        args = { ('%s [#%d]'):format(fullName(char), char.static), message },
    })
end)

-- --- exports ---------------------------------------------------------------

exports('getCharacter', function(src)
    return characters[identifierOf(src)]
end)

exports('getStatic', function(src)
    local char = characters[identifierOf(src)]
    return char and char.static or nil
end)

exports('getName', function(src)
    local char = characters[identifierOf(src)]
    return char and fullName(char) or GetPlayerName(src)
end)

-- --- commands --------------------------------------------------------------

RegisterCommand('id', function(src)
    if src == 0 then return end
    local char = characters[identifierOf(src)]
    if char then
        TriggerClientEvent('ls_character:notify', src,
            ('%s — статик ~b~#%d'):format(fullName(char), char.static))
    else
        TriggerClientEvent('ls_character:notify', src, '~r~Персонаж ещё не создан')
    end
end, false)

RegisterCommand('players', function(src)
    if src == 0 then return end
    local lines = {}
    for serverId, entry in pairs(roster) do
        lines[#lines + 1] = ('#%d %s (id %s)'):format(entry.static, entry.name, serverId)
    end
    table.sort(lines)

    TriggerClientEvent('chat:addMessage', src, {
        color = { 120, 180, 255 },
        multiline = true,
        args = { 'Онлайн', (#lines > 0) and table.concat(lines, '\n') or 'никого' },
    })
end, false)

-- Lets an admin rename someone without touching the JSON by hand.
RegisterCommand('setname', function(src, args)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'garage.admin') then return end

    local target = tonumber(args[1])
    local first = tidyName(args[2])
    local last = tidyName(args[3])
    if not target or not first or not last then
        print('usage: setname <player id> <Имя> <Фамилия>')
        return
    end
    if GetPlayerName(target) == nil then
        print('[ls_character] no such player: ' .. tostring(target))
        return
    end

    local char = characters[identifierOf(target)]
    if not char then
        print('[ls_character] that player has no character yet')
        return
    end

    char.first, char.last = first, last
    dirty = true
    save()
    enterRoster(target, char)
    TriggerClientEvent('ls_character:load', target, char)
end, false)

-- Точка выхода может оказаться внутри стены или под картой - тогда игрок
-- спавнится и сразу проваливается, и сам себя оттуда не вытащит.
RegisterCommand('clearspawn', function(src, args)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'garage.admin') then return end

    local target = tonumber(args[1])
    if not target or GetPlayerName(target) == nil then
        print('usage: clearspawn <player id>')
        return
    end

    local char = characters[identifierOf(target)]
    if not char then
        print('[ls_character] that player has no character yet')
        return
    end

    char.position = nil
    dirty = true
    save()
    TriggerClientEvent('ls_character:notify', target,
        '~y~Точка выхода сброшена — следующий заход со спавна')
    print(('[ls_character] spawn point cleared for %s'):format(GetPlayerName(target)))
end, false)
