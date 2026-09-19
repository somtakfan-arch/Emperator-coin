-- Клиент заведений: метки на карте и пункты в меню E.
-- Закрытое видит только владелец, открытое - весь сервер.

local list = {}
local blips = {}
local nearSpot = nil

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

RegisterNetEvent('ls_business:notify', function(text) notify(text) end)

local function rebuildBlips()
    for _, blip in ipairs(blips) do RemoveBlip(blip) end
    blips = {}

    for _, row in ipairs(list) do
        -- Свободную точку показываем всем: иначе их никто не найдёт.
        -- Чужое закрытое заведение на карте не светится.
        local show = row.open or row.mine or not row.owner
        if show then
            local blip = AddBlipForCoord(row.x, row.y, row.z)
            SetBlipSprite(blip, row.blip)
            SetBlipColour(blip, row.colour)
            SetBlipScale(blip, row.open and 0.85 or 0.6)
            SetBlipAsShortRange(blip, not row.open)

            local name
            if not row.owner then
                name = ('%s — продаётся'):format(row.label)
            elseif row.open then
                name = ('%s — %s'):format(row.label, row.owner)
            else
                name = ('%s — закрыт'):format(row.label)
            end

            BeginTextCommandSetBlipName('STRING')
            AddTextComponentSubstringPlayerName(name)
            EndTextCommandSetBlipName(blip)
            blips[#blips + 1] = blip
        end
    end
end

RegisterNetEvent('ls_business:list', function(rows)
    list = rows or {}
    rebuildBlips()
end)

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(3000)
    TriggerServerEvent('ls_business:request')

    while true do
        Wait(700)
        nearSpot = nil
        local me = GetEntityCoords(PlayerPedId())
        for _, row in ipairs(list) do
            if #(me - vector3(row.x, row.y, row.z)) <= Config.Interact then
                nearSpot = row
                break
            end
        end
    end
end)

-- --- меню --------------------------------------------------------------------

AddEventHandler('ls_interact:collect', function()
    local row = nearSpot
    if not row then return end

    local function offer(id, label)
        TriggerEvent('ls_interact:offer', {
            id = id, label = label, group = 'biz',
        })
    end

    TriggerEvent('ls_interact:offer', {
        id = 'ls_business:menu', label = row.label, submenu = 'biz', order = 11,
    })

    if not row.owner then
        offer('ls_business:buy', ('%s — $%d'):format(BizLocale.buyPrompt, row.price))
        return
    end

    if row.mine then
        offer('ls_business:toggle', row.open and BizLocale.closePrompt or BizLocale.openPrompt)
        offer('ls_business:collect', ('%s (в кассе $%d)'):format(
            BizLocale.collectPrompt, row.till or 0))
        offer('ls_business:sell', BizLocale.sellPrompt)
    elseif row.open and Config.Robbery.enabled then
        offer('ls_business:rob', BizLocale.robPrompt)
    end
end)

AddEventHandler('ls_interact:run', function(id)
    local row = nearSpot
    if not row or type(id) ~= 'string' or id:sub(1, 12) ~= 'ls_business:' then return end

    local action = id:sub(13)
    if action == 'buy' or action == 'toggle' or action == 'collect'
        or action == 'sell' or action == 'rob' then
        TriggerServerEvent('ls_business:' .. action, row.key)
    end
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    for _, blip in ipairs(blips) do RemoveBlip(blip) end
end)
