-- Уличные гонки.
--
-- Заезд на сервере один: две одновременные гонки на два десятка человек
-- превращаются в два пустых заезда. Кто объявил - тот и хозяин, но банк
-- общий, и забирает его первый финишировавший.
--
-- Чекпоинты проверяет сервер и только по порядку: прислать сразу последний
-- нельзя, а координаты каждого сверяются с настоящими.

local race = nil        -- { track, host, hostName, pot, state, entrants, order, at }
local lastCall = {}

local function notify(src, text)
    TriggerClientEvent('ls_race:notify', src, text)
end

local function tellAll(text)
    TriggerClientEvent('ls_race:notify', -1, text)
end

local function money(amount)
    local text = tostring(math.floor(amount))
    return (text:reverse():gsub('(%d%d%d)', '%1 '):reverse():gsub('^%s+', ''))
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

local function takeMoney(src, amount)
    local ok, done = pcall(function() return exports.phone_garage:removeMoney(src, amount) end)
    return ok and done == true
end

local function addMoney(src, amount)
    return pcall(function() return exports.phone_garage:addMoney(src, amount) end)
end

local function trackByKey(key)
    for _, track in ipairs(Config.Tracks) do
        if track.key == key then return track end
    end
    return nil
end

local function nameOf(src)
    local ok, name = pcall(function() return exports.ls_character:getName(src) end)
    if ok and type(name) == 'string' and name ~= '' then return name end
    return GetPlayerName(src) or ('#' .. tostring(src))
end

-- --- состояние на клиент -------------------------------------------------------

local function pushRace(target)
    if not race then
        TriggerClientEvent('ls_race:state', target or -1, nil)
        return
    end

    TriggerClientEvent('ls_race:state', target or -1, {
        track = race.track.key,
        label = race.track.label,
        start = race.track.start,
        state = race.state,
        pot = race.pot,
        entrants = race.entrants,
        checkpoints = race.state == 'running' and race.track.checkpoints or nil,
    })
end

RegisterNetEvent('ls_race:request', function() pushRace(source) end)

local function refund()
    for src in pairs(race.entrants) do addMoney(src, Config.Fee) end
end

local function endRace()
    race = nil
    pushRace()
end

-- --- объявление ----------------------------------------------------------------

RegisterNetEvent('ls_race:host', function(key)
    local src = source
    if throttled(src) then return end

    if race then
        notify(src, race.state == 'running' and RaceLocale.running or RaceLocale.hostBusy)
        return
    end

    local track = trackByKey(key)
    if not track then return end

    local coords = coordsOf(src)
    if not coords or #(coords - vector3(track.start.x, track.start.y, track.start.z)) > Config.Interact + 6.0 then
        notify(src, RaceLocale.tooFar)
        return
    end

    if not takeMoney(src, Config.Fee) then
        notify(src, RaceLocale.noMoney:format(money(Config.Fee)))
        return
    end

    race = {
        track = track,
        host = src,
        state = 'signup',
        pot = Config.Fee,
        entrants = { [src] = 0 },   -- [src] = сколько чекпоинтов взято
        closesAt = os.time() + Config.Signup,
    }

    tellAll(RaceLocale.announced:format(nameOf(src), track.label,
        money(Config.Fee), Config.Signup))
    pushRace()

    -- Сходка - это тоже событие на карте.
    pcall(function()
        return exports.ls_world:hotspot('race:' .. track.key,
            ('ЗАЕЗД — %s'):format(track.label),
            track.start.x, track.start.y, track.start.z, Config.Signup)
    end)

    local mine = race
    SetTimeout(Config.Signup * 1000, function()
        -- За время набора заезд могли отменить и объявить новый.
        if race ~= mine or race.state ~= 'signup' then return end

        local count = 0
        for _ in pairs(race.entrants) do count = count + 1 end
        if count < Config.MinEntrants then
            tellAll(RaceLocale.tooFew)
            refund()
            endRace()
            return
        end

        race.state = 'running'
        race.startedAt = os.time()
        race.placed = 0
        for entrant in pairs(race.entrants) do
            notify(entrant, RaceLocale.started:format(#race.track.checkpoints))
        end
        pushRace()
    end)
end)

RegisterNetEvent('ls_race:join', function()
    local src = source
    if throttled(src) then return end

    if not race then notify(src, RaceLocale.noRace) return end
    if race.state ~= 'signup' then notify(src, RaceLocale.running) return end
    if race.entrants[src] then notify(src, RaceLocale.alreadyIn) return end

    local coords = coordsOf(src)
    local start = race.track.start
    if not coords or #(coords - vector3(start.x, start.y, start.z)) > Config.Interact + 6.0 then
        notify(src, RaceLocale.tooFar)
        return
    end

    if not takeMoney(src, Config.Fee) then
        notify(src, RaceLocale.noMoney:format(money(Config.Fee)))
        return
    end

    race.entrants[src] = 0
    race.pot = race.pot + Config.Fee
    notify(src, RaceLocale.joined:format(money(race.pot)))
    pushRace()
end)

-- --- чекпоинты -----------------------------------------------------------------

RegisterNetEvent('ls_race:checkpoint', function(index)
    local src = source
    if not race or race.state ~= 'running' then return end

    local taken = race.entrants[src]
    if not taken then return end

    index = tonumber(index)
    -- Только следующий по порядку: перепрыгнуть через половину трассы
    -- одним событием нельзя. На любой отказ возвращаем игроку то, что у нас
    -- записано: он ждёт ответа и без него не увидит следующий чекпоинт.
    local function refuse()
        TriggerClientEvent('ls_race:progress', src, taken)
    end

    if index ~= taken + 1 then refuse() return end

    local point = race.track.checkpoints[index]
    if not point then refuse() return end

    local coords = coordsOf(src)
    if not coords or #(coords - vector3(point.x, point.y, point.z)) > Config.Radius + 8.0 then
        refuse()
        return
    end

    race.entrants[src] = index
    TriggerClientEvent('ls_race:progress', src, index)

    if index < #race.track.checkpoints then
        notify(src, RaceLocale.checkpoint:format(index, #race.track.checkpoints))
        return
    end

    -- Финиш.
    race.placed = (race.placed or 0) + 1
    if race.placed == 1 then
        addMoney(src, race.pot)
        tellAll(RaceLocale.won:format(nameOf(src), money(race.pot)))
        endRace()
    else
        notify(src, RaceLocale.finished:format(race.placed))
    end
end)

-- Заезд, который никто не закончил, не должен висеть вечно и держать сервер
-- в состоянии "гонка идёт".
CreateThread(function()
    while true do
        Wait(30000)
        if race and race.state == 'running' and race.startedAt
            and os.time() - race.startedAt > Config.MaxMinutes * 60 then
            tellAll(RaceLocale.tooFew)
            refund()
            endRace()
        end
    end
end)

AddEventHandler('playerDropped', function()
    local src = source
    lastCall[src] = nil
    if not race then return end

    if race.entrants[src] then
        -- Ушедший уносит свой взнос из банка, но не срывает заезд.
        race.entrants[src] = nil
        race.pot = math.max(0, race.pot - Config.Fee)
    end

    local count = 0
    for _ in pairs(race.entrants) do count = count + 1 end
    if count == 0 then endRace() else pushRace() end
end)
