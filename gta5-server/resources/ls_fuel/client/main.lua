-- Топливо на стороне клиента.
--
-- Считает расход только тот, кто сидит за рулём: он владеет машиной, и
-- только его запись в state bag дойдёт до остальных. Пассажир и прохожий
-- уровень читают, но не трогают - иначе два клиента писали бы в один бак
-- разные числа.
--
-- Начальный уровень выводится из номера машины, а не из random: у всех
-- клиентов номер один и тот же, значит и бак у только что заспавненной
-- машины везде одинаковый.

local warned = {}           -- [номер] = предупредили про остаток
local nearStation = nil
local hudFuel = nil         -- что показывать на шкале, nil - не показывать

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

RegisterNetEvent('ls_fuel:notify', function(text) notify(text) end)

-- --- бак ---------------------------------------------------------------------

local function plateOf(veh)
    local plate = GetVehicleNumberPlateText(veh)
    return plate and plate:gsub('%s+', '') or ''
end

-- Сид от номера: одинаково на всех клиентах, без обмена сообщениями.
local function startingFuel(veh)
    local plate = plateOf(veh)
    local sum = 0
    for i = 1, #plate do sum = sum + plate:byte(i) * i end
    return Config.Tank * (0.35 + (sum % 60) / 100.0)
end

local function skipVehicle(veh)
    return Config.SkipClasses[GetVehicleClass(veh)] == true
end

local function getFuel(veh)
    if not DoesEntityExist(veh) or skipVehicle(veh) then return nil end
    local state = Entity(veh).state
    local fuel = state and state.fuel
    if type(fuel) ~= 'number' then
        fuel = startingFuel(veh)
        -- Записать может только владелец. Если мы не за рулём, просто
        -- показываем расчётное значение и ждём, пока запишет водитель.
        if NetworkGetEntityOwner(veh) == PlayerId() then
            state:set('fuel', fuel, true)
        end
    end
    return fuel
end

local function setFuel(veh, value)
    value = math.max(0.0, math.min(Config.Tank, value))
    Entity(veh).state:set('fuel', value, true)
    -- Стрелка на приборке берёт своё значение отсюда.
    SetVehicleFuelLevel(veh, value + 0.0)
    return value
end

exports('getFuel', function(veh) return getFuel(veh) end)
exports('setFuel', function(veh, value) return setFuel(veh, value) end)

-- --- расход ------------------------------------------------------------------

local function burnFor(veh)
    local rate = Config.IdleBurn
        + (Config.FullBurn - Config.IdleBurn) * math.min(1.0, GetVehicleCurrentRpm(veh))

    rate = rate * (Config.ClassBurn[GetVehicleClass(veh)] or 1.0)

    local model = GetEntityModel(veh)
    for name in pairs(Config.Electric) do
        if model == GetHashKey(name) then
            rate = rate * Config.ElectricBurn
            break
        end
    end
    return rate
end

CreateThread(function()
    while true do
        Wait(1000)
        local ped = PlayerPedId()
        local veh = GetVehiclePedIsIn(ped, false)

        hudFuel = nil
        if veh ~= 0 and not skipVehicle(veh) then
            local fuel = getFuel(veh)
            hudFuel = fuel

            -- Жжёт только водитель работающей машины.
            if GetPedInVehicleSeat(veh, -1) == ped and GetIsVehicleEngineRunning(veh) then
                if fuel and fuel > 0 then
                    fuel = setFuel(veh, fuel - burnFor(veh))
                    hudFuel = fuel

                    local plate = plateOf(veh)
                    if fuel <= Config.WarnBelow and not warned[plate] then
                        warned[plate] = true
                        notify(FuelLocale.low)
                    elseif fuel > Config.WarnBelow then
                        warned[plate] = nil
                    end
                end

                if fuel and fuel <= 0 then
                    notify(FuelLocale.dry)
                end
            end
        end
    end
end)

-- Заглохшую машину держим заглохшей. Отдельным быстрым потоком: если
-- заводить обратно раз в секунду, двигатель будет дёргаться.
CreateThread(function()
    while true do
        local wait = 500
        local ped = PlayerPedId()
        local veh = GetVehiclePedIsIn(ped, false)

        if veh ~= 0 and GetPedInVehicleSeat(veh, -1) == ped and not skipVehicle(veh) then
            local fuel = Entity(veh).state.fuel
            if type(fuel) == 'number' and fuel <= 0 then
                wait = 0
                SetVehicleEngineOn(veh, false, true, true)
                DisableControlAction(0, 71, true)   -- газ вперёд
                DisableControlAction(0, 72, true)   -- газ назад
            end
        end

        Wait(wait)
    end
end)

-- --- шкала -------------------------------------------------------------------

CreateThread(function()
    while true do
        local wait = 400

        if hudFuel and not IsPauseMenuActive() then
            wait = 0
            local share = math.max(0.0, math.min(1.0, hudFuel / Config.Tank))

            -- Под миникартой, слева внизу.
            local x, y, w, h = 0.158, 0.958, 0.075, 0.009
            DrawRect(x, y, w + 0.004, h + 0.004, 0, 0, 0, 170)
            -- Красная, когда почти пусто.
            local r, g, b = 90, 190, 120
            if share < 0.15 then r, g, b = 220, 80, 80
            elseif share < 0.3 then r, g, b = 230, 180, 70 end
            DrawRect(x - w / 2 + w * share / 2, y, w * share, h, r, g, b, 220)
        end

        Wait(wait)
    end
end)

-- --- заправка ----------------------------------------------------------------

CreateThread(function()
    for _, station in ipairs(Config.Stations) do
        local blip = AddBlipForCoord(station.x, station.y, station.z)
        SetBlipSprite(blip, Config.Blip.sprite)
        SetBlipColour(blip, Config.Blip.colour)
        SetBlipScale(blip, Config.Blip.scale)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(('%s — %s'):format(Config.Blip.label, station.label))
        EndTextCommandSetBlipName(blip)
    end
end)

CreateThread(function()
    while true do
        Wait(800)
        nearStation = nil
        local me = GetEntityCoords(PlayerPedId())
        for _, station in ipairs(Config.Stations) do
            if #(me - vector3(station.x, station.y, station.z)) <= Config.Interact then
                nearStation = station
                break
            end
        end
    end
end)

-- Машина, которую мы собираемся заправлять: та, в которой сидим, иначе
-- ближайшая. Иначе пришлось бы вылезать и садиться обратно ради меню.
local function targetVehicle()
    local ped = PlayerPedId()
    local veh = GetVehiclePedIsIn(ped, false)
    if veh ~= 0 then return veh end

    local me = GetEntityCoords(ped)
    local best, bestDist
    for _, other in ipairs(GetGamePool('CVehicle')) do
        local d = #(me - GetEntityCoords(other))
        if d <= 6.0 and (not bestDist or d < bestDist) then best, bestDist = other, d end
    end
    return best
end

local function money(amount)
    local text = tostring(math.floor(amount))
    return (text:reverse():gsub('(%d%d%d)', '%1 '):reverse():gsub('^%s+', ''))
end

local function hasJerrycan()
    local ok, has = pcall(function()
        return exports.ls_inventory:hasItem(Config.Jerrycan.item)
    end)
    return ok and has == true
end

AddEventHandler('ls_interact:collect', function()
    if nearStation then
        TriggerEvent('ls_interact:offer', {
            id = 'ls_fuel:pump', label = FuelLocale.pumpPrompt, submenu = 'fuel', order = 5,
        })
        for _, litres in ipairs(Config.Portions) do
            TriggerEvent('ls_interact:offer', {
                id = 'ls_fuel:fill:' .. litres, group = 'fuel',
                label = FuelLocale.litres:format(litres, money(litres * Config.PricePerLitre)),
            })
        end
        TriggerEvent('ls_interact:offer', {
            id = 'ls_fuel:fill:max', group = 'fuel', label = FuelLocale.toFull:format('по остатку'),
        })
        TriggerEvent('ls_interact:offer', {
            id = 'ls_fuel:buycan', group = 'fuel',
            label = FuelLocale.canPrompt:format(money(Config.Jerrycan.price)),
        })
    end

    -- Канистра работает где угодно - в этом весь её смысл.
    if hasJerrycan() then
        local veh = targetVehicle()
        if veh and not skipVehicle(veh) then
            TriggerEvent('ls_interact:offer', {
                id = 'ls_fuel:usecan', label = FuelLocale.useCan, order = 6,
            })
        end
    end
end)

AddEventHandler('ls_interact:run', function(id)
    if id:sub(1, 13) == 'ls_fuel:fill:' then
        local veh = targetVehicle()
        if not veh then notify(FuelLocale.noVehicle) return end

        local fuel = getFuel(veh)
        if not fuel then notify(FuelLocale.noVehicle) return end

        local room = Config.Tank - fuel
        if room < 1.0 then notify(FuelLocale.full) return end

        local want = id:sub(14)
        local litres = want == 'max' and room or math.min(room, tonumber(want) or 0)
        if litres < 1.0 then notify(FuelLocale.full) return end

        -- Сколько лить, решает клиент, но платит и разрешает сервер.
        TriggerServerEvent('ls_fuel:buy', math.floor(litres + 0.5), VehToNet(veh))

    elseif id == 'ls_fuel:buycan' then
        TriggerServerEvent('ls_fuel:buyCan')

    elseif id == 'ls_fuel:usecan' then
        TriggerServerEvent('ls_fuel:useCan', VehToNet(targetVehicle() or 0))
    end
end)

-- Сервер списал деньги и разрешил - заливаем.
RegisterNetEvent('ls_fuel:pour', function(netId, litres)
    local veh = NetToVeh(netId)
    if not veh or veh == 0 or not DoesEntityExist(veh) then return end

    local fuel = getFuel(veh) or 0
    setFuel(veh, fuel + litres)
    warned[plateOf(veh)] = nil

    -- Залили - можно заводить.
    if GetPedInVehicleSeat(veh, -1) == PlayerPedId() then
        SetVehicleEngineOn(veh, true, false, true)
    end
end)
