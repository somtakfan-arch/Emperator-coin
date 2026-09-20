-- Легальные работы.
--
-- Маршрут строит сервер, и он же решает, доехал игрок до точки или нет:
-- клиент только докладывает "я на месте", а координаты проверяются здесь.
-- Иначе рейс закрывался бы, не выходя из депо.
--
-- Смена живёт, пока игрок на сервере. Это осознанно: рейс - штука на
-- двадцать минут, и хранить недоеденный маршрут между заходами незачем.

local shifts = {}       -- [src] = { job, route, at, earned, started }
local lastCall = {}

-- Имя объявлено заранее: его зовут из обработчика найма, который написан
-- выше самой функции. Без этой строчки там разрешилось бы глобальное nil.
local pushDuty

local function notify(src, text)
    TriggerClientEvent('ls_jobs:notify', src, text)
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

local function addMoney(src, amount)
    return pcall(function() return exports.phone_garage:addMoney(src, amount) end)
end

-- --- маршрут -----------------------------------------------------------------

-- Тасуем копию, а не сам список из конфига: конфиг общий для всех смен.
local function shuffled(list)
    local copy = {}
    for i, entry in ipairs(list) do copy[i] = entry end
    for i = #copy, 2, -1 do
        local j = math.random(i)
        copy[i], copy[j] = copy[j], copy[i]
    end
    return copy
end

local function stop(point, stage, pay, label)
    return {
        x = point.x, y = point.y, z = point.z,
        label = label or point.label, stage = stage, pay = pay,
    }
end

local function buildRoute(key)
    local job = Config.Jobs[key]
    local route = {}

    if job.kind == 'fare' then
        -- Такси: посадка в одной точке, высадка в другой. Цена считается
        -- сразу при постройке - так пассажир знает её заранее, а сервер
        -- потом не пересчитывает по координатам, которые прислал клиент.
        local pool = shuffled(job.points)
        for fare = 1, job.legs do
            local from = pool[((fare * 2 - 2) % #pool) + 1]
            local to   = pool[((fare * 2 - 1) % #pool) + 1]
            if from == to then to = pool[(fare % #pool) + 1] end

            local dist = #(vector3(from.x, from.y, from.z) - vector3(to.x, to.y, to.z))
            route[#route + 1] = stop(from, 'pick', 0)
            route[#route + 1] = stop(to, 'drop', math.floor(job.pay + dist * job.perMetre))
        end

    elseif job.ordered then
        -- Автобус идёт по кругу: порядок точек - это и есть маршрут.
        for i = 1, math.min(job.legs, #job.points) do
            route[#route + 1] = stop(job.points[i], 'stop', job.pay)
        end

    else
        -- Мусоровоз просто объезжает баки, фура возвращается в порт за
        -- каждой новой партией.
        local pool = shuffled(job.points)
        for i = 1, job.legs do
            if job.roundTrip and job.depot then
                route[#route + 1] = stop(job.depot, 'pick', 0, job.depot.label)
            end
            route[#route + 1] = stop(pool[((i - 1) % #pool) + 1], 'drop', job.pay)
        end
    end

    return route
end

local function pushShift(src)
    local shift = shifts[src]
    if not shift then
        TriggerClientEvent('ls_jobs:shift', src, nil)
        return
    end
    TriggerClientEvent('ls_jobs:shift', src, {
        job = shift.job,
        at = shift.at,
        stop = shift.route[shift.at],
        left = #shift.route - shift.at + 1,
        earned = shift.earned,
    })
end

-- --- наём --------------------------------------------------------------------

RegisterNetEvent('ls_jobs:hire', function(key)
    local src = source
    if throttled(src) then return end

    local job = Config.Jobs[key]
    if not job then return end

    if shifts[src] then
        notify(src, JobsLocale.already:format(Config.Jobs[shifts[src].job].label))
        return
    end

    local coords = coordsOf(src)
    if not coords then return end
    local near = false
    for _, centre in ipairs(Config.Centres) do
        if #(coords - vector3(centre.x, centre.y, centre.z)) <= Config.Interact + 3.0 then
            near = true
            break
        end
    end
    if not near then
        notify(src, JobsLocale.tooFar)
        return
    end

    shifts[src] = {
        job = key,
        route = job.kind == 'call' and {} or buildRoute(key),
        at = 1,
        earned = 0,
        started = os.time(),
    }

    notify(src, (job.kind == 'call' and JobsLocale.hiredPlain or JobsLocale.hired):format(job.label))
    pushShift(src)
    pushDuty()
end)

RegisterNetEvent('ls_jobs:quit', function()
    local src = source
    local shift = shifts[src]
    if not shift then
        notify(src, JobsLocale.notOnShift)
        return
    end

    notify(src, JobsLocale.quit:format(money(shift.earned)))
    shifts[src] = nil
    pushShift(src)
    pushDuty()
end)

-- --- точки маршрута ----------------------------------------------------------

RegisterNetEvent('ls_jobs:leg', function()
    local src = source
    local shift = shifts[src]
    if not shift then return end

    local point = shift.route[shift.at]
    if not point then return end

    local coords = coordsOf(src)
    if not coords or #(coords - vector3(point.x, point.y, point.z)) > Config.LegRadius + 5.0 then
        notify(src, JobsLocale.tooFar)
        return
    end

    -- На рабочей машине, а не пешком. Пустой хэш означает, что сервер не
    -- смог прочитать машину - тогда не придираемся, чтобы не ломать смену
    -- из-за мигнувшей синхронизации.
    local job = Config.Jobs[shift.job]
    if job.vehicle then
        local veh = GetVehiclePedIsIn(GetPlayerPed(src), false)
        if veh ~= 0 and GetEntityModel(veh) ~= GetHashKey(job.vehicle) then
            notify(src, JobsLocale.needVeh)
            return
        end
    end

    if (point.pay or 0) > 0 then
        addMoney(src, point.pay)
        shift.earned = shift.earned + point.pay
        notify(src, JobsLocale.legDone:format(money(point.pay), point.label or ''))
    end

    shift.at = shift.at + 1

    -- Маршрут кончился - сразу следующий, чтобы смена не обрывалась на
    -- полуслове и не приходилось ехать в центр занятости заново.
    if shift.at > #shift.route then
        notify(src, JobsLocale.routeDone:format(money(shift.earned)))
        shift.route = buildRoute(shift.job)
        shift.at = 1
    end

    pushShift(src)
end)

-- --- механик -----------------------------------------------------------------

RegisterNetEvent('ls_jobs:fixed', function()
    local src = source
    if throttled(src) then return end

    local shift = shifts[src]
    if not shift or shift.job ~= 'mechanic' then
        notify(src, JobsLocale.notOnShift)
        return
    end

    local pay = Config.Jobs.mechanic.pay
    addMoney(src, pay)
    shift.earned = shift.earned + pay
    notify(src, JobsLocale.fixDone:format(money(pay)))
    pushShift(src)
end)

-- --- кто на смене ------------------------------------------------------------

pushDuty = function()
    local rows = {}
    for src, shift in pairs(shifts) do
        local job = Config.Jobs[shift.job]
        if job and job.service then
            local coords = coordsOf(src)
            if coords then
                rows[#rows + 1] = {
                    id = src,
                    label = job.label,
                    sprite = job.blip.sprite,
                    colour = job.blip.colour,
                    x = coords.x, y = coords.y, z = coords.z,
                }
            end
        end
    end
    TriggerClientEvent('ls_jobs:duty', -1, rows)
end

CreateThread(function()
    while true do
        Wait(Config.DutyPush * 1000)
        pushDuty()
    end
end)

RegisterNetEvent('ls_jobs:request', function()
    pushShift(source)
end)

AddEventHandler('playerDropped', function()
    local src = source
    shifts[src] = nil
    lastCall[src] = nil
    pushDuty()
end)

exports('isOnDuty', function(src) return shifts[src] ~= nil end)
exports('jobOf', function(src) return shifts[src] and shifts[src].job or nil end)
