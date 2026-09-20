-- Гонки на клиенте: метки сходок, меню записи и сами чекпоинты.
--
-- Чекпоинт засчитывается автоматически, как только въехал в радиус: жать E
-- на скорости сто шестьдесят - это не гонка, а тест на реакцию. Но решает
-- всё равно сервер, клиент только сообщает номер.

local race = nil            -- то, что прислал сервер
local mine = false          -- участвую ли я
local at = 0                -- сколько чекпоинтов я уже взял
local cpBlip = nil
local nearStart = nil

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

RegisterNetEvent('ls_race:notify', function(text) notify(text) end)

local function money(amount)
    local text = tostring(math.floor(amount))
    return (text:reverse():gsub('(%d%d%d)', '%1 '):reverse():gsub('^%s+', ''))
end

-- --- метки сходок ---------------------------------------------------------------

CreateThread(function()
    for _, track in ipairs(Config.Tracks) do
        local blip = AddBlipForCoord(track.start.x, track.start.y, track.start.z)
        SetBlipSprite(blip, Config.MeetBlip.sprite)
        SetBlipColour(blip, Config.MeetBlip.colour)
        SetBlipScale(blip, Config.MeetBlip.scale)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(('%s — %s'):format(RaceLocale.meetPrompt, track.label))
        EndTextCommandSetBlipName(blip)
    end
end)

-- --- состояние ------------------------------------------------------------------

local function clearCheckpoint()
    if cpBlip then RemoveBlip(cpBlip) cpBlip = nil end
end

local function setCheckpoint()
    clearCheckpoint()
    if not race or race.state ~= 'running' or not mine then return end

    local point = race.checkpoints and race.checkpoints[at + 1]
    if not point then return end

    cpBlip = AddBlipForCoord(point.x, point.y, point.z)
    SetBlipSprite(cpBlip, 1)
    SetBlipColour(cpBlip, 5)
    SetBlipScale(cpBlip, 1.0)
    SetBlipRoute(cpBlip, true)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName(('Чекпоинт %d'):format(at + 1))
    EndTextCommandSetBlipName(cpBlip)
end

RegisterNetEvent('ls_race:state', function(data)
    race = data
    if not race then
        mine = false
        at = 0
        clearCheckpoint()
        return
    end

    local me = GetPlayerServerId(PlayerId())
    local taken = race.entrants and race.entrants[me] or race.entrants and race.entrants[tostring(me)]
    mine = taken ~= nil
    at = tonumber(taken) or 0
    setCheckpoint()
end)

-- Ответ сервера: сколько чекпоинтов он за мной засчитал. Это
-- единственный источник правды про прогресс.
RegisterNetEvent('ls_race:progress', function(taken)
    at = tonumber(taken) or 0
    setCheckpoint()
end)

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(2500)
    TriggerServerEvent('ls_race:request')
end)

-- --- сам заезд -------------------------------------------------------------------

CreateThread(function()
    while true do
        local wait = 500

        if race and race.state == 'running' and mine and race.checkpoints then
            local point = race.checkpoints[at + 1]
            if point then
                wait = 0
                local me = GetEntityCoords(PlayerPedId())
                local target = vector3(point.x, point.y, point.z)

                if #(me - target) < 250.0 then
                    -- Столб виден издалека: в гонке важнее найти поворот, чем
                    -- разглядеть кружок под колёсами.
                    DrawMarker(1, target.x, target.y, target.z - 1.0, 0, 0, 0, 0, 0, 0,
                        Config.Radius * 2.0, Config.Radius * 2.0, 12.0,
                        120, 190, 255, 90, false, false, 2, false, nil, nil, false)
                end

                if #(me - target) <= Config.Radius then
                    -- Не двигаем at сами: если сервер чекпоинт не засчитает,
                    -- клиент уехал бы вперёд и молча пропустил точку. Гасим
                    -- маркер до ответа, чтобы не слать одно и то же каждый
                    -- кадр, пока едем через радиус.
                    local sending = at + 1
                    at = -1
                    TriggerServerEvent('ls_race:checkpoint', sending)
                    clearCheckpoint()
                end
            end
        end

        Wait(wait)
    end
end)

-- --- меню E ----------------------------------------------------------------------

CreateThread(function()
    while true do
        Wait(700)
        nearStart = nil
        local me = GetEntityCoords(PlayerPedId())
        for _, track in ipairs(Config.Tracks) do
            if #(me - vector3(track.start.x, track.start.y, track.start.z)) <= Config.Interact then
                nearStart = track
                break
            end
        end
    end
end)

AddEventHandler('ls_interact:collect', function()
    if not nearStart then return end

    -- Идёт набор на этой же трассе - предлагаем записаться, а не объявлять
    -- второй заезд поверх первого.
    if race and race.state == 'signup' and not mine then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_race:join', order = 3,
            label = RaceLocale.joinPrompt:format(money(Config.Fee)),
        })
        return
    end

    if race then return end

    TriggerEvent('ls_interact:offer', {
        id = 'ls_race:host', label = RaceLocale.hostPrompt, submenu = 'race', order = 5,
    })
    for _, track in ipairs(Config.Tracks) do
        TriggerEvent('ls_interact:offer', {
            id = 'ls_race:host:' .. track.key, group = 'race',
            label = RaceLocale.trackLine:format(track.label, #track.checkpoints),
        })
    end
end)

AddEventHandler('ls_interact:run', function(id)
    if id == 'ls_race:join' then
        TriggerServerEvent('ls_race:join')
    elseif id:sub(1, 13) == 'ls_race:host:' then
        TriggerServerEvent('ls_race:host', id:sub(14))
    end
end)

AddEventHandler('onResourceStop', function(name)
    if name == GetCurrentResourceName() then clearCheckpoint() end
end)
