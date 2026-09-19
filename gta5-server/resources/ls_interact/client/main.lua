-- Одно меню на всё взаимодействие.
--
-- Раньше E ловили пять ресурсов сразу, каждый своим потоком: кто первым
-- увидел игрока, тот и съел нажатие. Стоя у двери офиса рядом с барыгой,
-- было невозможно предсказать, что откроется.
--
-- Теперь E ловит только этот ресурс. По нажатию он спрашивает у всех
-- остальных, что они могут предложить здесь и сейчас, показывает одним
-- списком и сообщает выбравшему владельцу.
--
-- Как подключиться со своей стороны:
--
--     AddEventHandler('ls_interact:collect', function()
--         TriggerEvent('ls_interact:offer', {
--             id = 'мой_ресурс:действие:42',   -- вернётся в :run
--             label = 'Что-то сделать',
--             order = 30,                      -- меньше = выше в списке
--         })
--     end)
--
-- Действий много - убери их в свой раздел, чтобы не топить корень:
--
--     TriggerEvent('ls_interact:offer', {
--         id = 'мой_ресурс:раздел', label = 'Работа', submenu = 'work', order = 4,
--     })
--     TriggerEvent('ls_interact:offer', {
--         id = 'мой_ресурс:обыскать', label = 'Обыскать', group = 'work',
--     })
--
-- Esc внутри раздела возвращает в корень, а не закрывает меню.
--
--     AddEventHandler('ls_interact:run', function(id)
--         if id:sub(1, 11) ~= 'мой_ресурс:' then return end
--         ...
--     end)
--
-- TriggerEvent на клиенте синхронный, поэтому после опроса список уже
-- собран - ждать ничего не надо.

local offers = {}       -- всё, что предложили в этот заход
local shown = {}        -- то, что видно на текущей странице
local page = nil        -- nil - корень, иначе имя раздела
local pageTitle = nil
local open = false
local pick = 1
local scroll = 0
local available = 0     -- сколько действий рядом, для подсказки

local function sortOffers(list)
    table.sort(list, function(a, b)
        local oa, ob = a.order or 50, b.order or 50
        if oa ~= ob then return oa < ob end
        return (a.label or '') < (b.label or '')
    end)
    return list
end

-- Корень показывает всё без раздела; раздел - только своё.
local function build()
    shown = {}
    for _, offer in ipairs(offers) do
        if (offer.group or nil) == page then shown[#shown + 1] = offer end
    end
    sortOffers(shown)
    pick = 1
    scroll = 0
    return shown
end

local function collect()
    offers = {}
    TriggerEvent('ls_interact:collect')
    sortOffers(offers)
    page, pageTitle = nil, nil
    return build()
end

AddEventHandler('ls_interact:offer', function(offer)
    if type(offer) ~= 'table' then return end
    if type(offer.id) ~= 'string' or type(offer.label) ~= 'string' then return end
    offers[#offers + 1] = offer
end)

-- --- рисование ---------------------------------------------------------------

local function text(content, x, y, scale, centred, colour)
    SetTextFont(4)
    SetTextScale(scale, scale)
    if centred then SetTextCentre(true) end
    if colour then SetTextColour(colour[1], colour[2], colour[3], 255) end
    SetTextOutline()
    BeginTextCommandDisplayText('STRING')
    AddTextComponentSubstringPlayerName(content)
    EndTextCommandDisplayText(x, y)
end

local function draw()
    local total = #shown
    local rows = math.min(total, Config.Rows)
    local top = 0.32
    local lineHeight = 0.035

    DrawRect(0.5, top + rows * lineHeight / 2 - 0.012,
        0.32, rows * lineHeight + 0.085, 0, 0, 0, 190)

    text(pageTitle or InteractLocale.title, 0.5, top - 0.05, 0.42, true)

    for row = 1, rows do
        local index = row + scroll
        local offer = shown[index]
        if offer then
            local picked = index == pick
            text((picked and '> ' or '   ') .. offer.label,
                0.5, top + (row - 1) * lineHeight, 0.35, true,
                picked and { 120, 190, 255 } or nil)
        end
    end

    if total > rows then
        text(('%d / %d'):format(pick, total), 0.5, top + rows * lineHeight + 0.004, 0.28, true)
        text(page and InteractLocale.footerSub or InteractLocale.footer,
            0.5, top + rows * lineHeight + 0.028, 0.28, true)
    else
        text(page and InteractLocale.footerSub or InteractLocale.footer,
            0.5, top + rows * lineHeight + 0.008, 0.28, true)
    end
end

local function keepInView()
    if pick < scroll + 1 then scroll = pick - 1 end
    if pick > scroll + Config.Rows then scroll = pick - Config.Rows end
    if scroll < 0 then scroll = 0 end
end

-- --- меню --------------------------------------------------------------------

local function close()
    open = false
    offers = {}
    shown = {}
    page, pageTitle = nil, nil
end

local function openMenu()
    if #collect() == 0 then return end
    open = true
    pick = 1
    scroll = 0
end

CreateThread(function()
    while true do
        local wait = 0

        if open then
            -- Пока меню открыто, машина и оружие не слушаются: иначе выбор
            -- пункта заодно стреляет.
            DisableControlAction(0, 24, true)
            DisableControlAction(0, 25, true)
            DisableControlAction(0, 68, true)
            DisableControlAction(0, Config.Key, true)

            draw()

            if IsControlJustReleased(0, Config.Up) then
                pick = pick > 1 and pick - 1 or #shown
                keepInView()
            elseif IsControlJustReleased(0, Config.Down) then
                pick = pick < #shown and pick + 1 or 1
                keepInView()
            elseif IsControlJustReleased(0, Config.Enter) then
                local offer = shown[pick]
                if offer and offer.submenu then
                    -- Внутрь раздела, список уже собран - опрашивать заново
                    -- нечего.
                    page, pageTitle = offer.submenu, offer.label
                    build()
                elseif offer then
                    close()
                    TriggerEvent('ls_interact:run', offer.id)
                end
            elseif IsControlJustReleased(0, Config.Back) then
                -- Из раздела - назад в корень, а не сразу из меню.
                if page then
                    page, pageTitle = nil, nil
                    build()
                else
                    close()
                end
            end

            -- Меню не должно висеть, когда игрок умер или уехал.
            if IsEntityDead(PlayerPedId()) then close() end

        else
            wait = 150
            if not IsPauseMenuActive() and not IsEntityDead(PlayerPedId())
                and IsControlJustReleased(0, Config.Key) then
                openMenu()
            end
        end

        Wait(wait)
    end
end)

-- --- подсказка ---------------------------------------------------------------
-- Опрашивать всех каждый кадр дорого, а раз в полсекунды - незаметно.

CreateThread(function()
    while true do
        Wait(500)
        if Config.ShowHint and not open and not IsEntityDead(PlayerPedId()) then
            available = #collect()
            offers, shown = {}, {}
        else
            available = 0
        end
    end
end)

CreateThread(function()
    while true do
        Wait(open and 500 or 0)
        if available > 0 and not open then
            text(InteractLocale.hint, 0.5, 0.86, 0.36, true)
        end
    end
end)

-- Другие ресурсы спрашивают это, прежде чем открыть своё окно.
exports('isOpen', function()
    return open
end)
