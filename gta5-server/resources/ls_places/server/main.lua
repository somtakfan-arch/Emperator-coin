-- Автосалон и доски объявлений.
--
-- Сервер здесь почти ничего не решает: покупку машины по-прежнему ведёт
-- phone_garage, а темы хранит ls_forum. Его дело - выбрать, что сегодня
-- стоит в зале, и отдать доске заголовки.

local lastCall = {}

local function throttled(src)
    local now = GetGameTimer()
    if lastCall[src] and now - lastCall[src] < Config.Cooldown then return true end
    lastCall[src] = now
    return false
end

-- --- витрина -------------------------------------------------------------------

-- Что стоит в зале сегодня. Выводится из даты: у всех одинаково, после
-- рестарта то же самое, и раз в сутки меняется само.
local function showroomToday()
    local ok, catalog = pcall(function() return exports.phone_garage:catalog() end)
    if not ok or type(catalog) ~= 'table' or #catalog == 0 then return {} end

    local seed = tonumber(os.date('%Y%m%d')) or 0
    local rows = {}
    for index = 1, #Config.Salon.display do
        -- Шаг взаимно прост с большинством длин каталога, поэтому четыре
        -- места почти никогда не занимает одна и та же машина.
        local pick = ((seed + index * 7919) % #catalog) + 1
        local car = catalog[pick]
        if car then
            rows[#rows + 1] = {
                spot = index, model = car.model, label = car.label, price = car.price,
            }
        end
    end
    return rows
end

RegisterNetEvent('ls_places:request', function()
    local src = source
    TriggerClientEvent('ls_places:showroom', src, showroomToday())
end)

-- --- доска ---------------------------------------------------------------------

RegisterNetEvent('ls_places:board', function()
    local src = source
    if throttled(src) then return end

    local ok, rows = pcall(function()
        return exports.ls_forum:latest(Config.Board.forumBoard, Config.Board.limit)
    end)
    TriggerClientEvent('ls_places:ads', src, ok and rows or {})
end)

AddEventHandler('playerDropped', function()
    lastCall[source] = nil
end)
