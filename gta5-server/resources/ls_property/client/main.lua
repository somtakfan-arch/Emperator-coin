-- Клиент: метки недвижимости, [E] у двери и склад.
-- Телефонные приложения живут в phone_garage - он просто пересылает сюда.

local phone = { properties = {}, family = {}, auctions = {}, slots = 2 }
local blips = {}
local storage = nil     -- открытый склад: { key, label, capacity, rows }

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

local function drawText3D(x, y, z, text)
    SetDrawOrigin(x, y, z, 0)
    SetTextFont(4)
    SetTextScale(0.35, 0.35)
    SetTextCentre(true)
    SetTextOutline()
    BeginTextCommandDisplayText('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayText(0.0, 0.0)
    ClearDrawOrigin()
end

-- --- метки -------------------------------------------------------------------

local function rebuildBlips()
    for _, blip in ipairs(blips) do RemoveBlip(blip) end
    blips = {}
    if not Config.Blips.show then return end

    for _, row in ipairs(phone.properties or {}) do
        local style = Config.Blips.forSale
        local suffix = ' — продаётся'

        if row.mine then
            style = row.family and Config.Blips.family or Config.Blips.mine
            suffix = row.family and ' — семейный' or ' — твой'
        elseif row.owner then
            -- Чужое на карте не светится: незачем показывать, где чей дом.
            goto continue
        end

        do
            local blip = AddBlipForCoord(row.x, row.y, row.z)
            SetBlipSprite(blip, style.sprite)
            SetBlipColour(blip, style.colour)
            SetBlipScale(blip, style.scale)
            SetBlipAsShortRange(blip, true)
            BeginTextCommandSetBlipName('STRING')
            AddTextComponentSubstringPlayerName(row.label .. suffix)
            EndTextCommandSetBlipName(blip)
            blips[#blips + 1] = blip
        end

        ::continue::
    end
end

-- --- события сервера ---------------------------------------------------------

RegisterNetEvent('ls_property:notify', function(text) notify(text) end)

RegisterNetEvent('ls_property:phone', function(data)
    phone = data or phone
    rebuildBlips()
    -- Телефон рисует phone_garage; ему нужен свежий срез.
    TriggerEvent('phone_garage:propertyData', phone)

    -- Видно в F8. Парная к серверной строчке: если там "срез отправлен", а
    -- тут тишина, значит данные до клиента не доехали, и искать надо в
    -- сети, а не в интерфейсе.
    print(('[ls_property] срез получен: объектов %d')
        :format(#(phone.properties or {})))
    -- Подтверждение уходит и на сервер: клиентская консоль существует, но
    -- заглянуть в неё догадывается не каждый, а серверный лог уже читают.
    TriggerServerEvent('ls_property:ack', #(phone.properties or {}))
end)

RegisterNetEvent('ls_property:storage', function(data)
    storage = data
    TriggerEvent('phone_garage:storageData', data)
end)

-- --- дверь -------------------------------------------------------------------
-- Нажатие E ловит ls_interact; тут только предложение.

local doorKey = nil

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(2500)
    TriggerServerEvent('ls_property:ready')
end)

-- Дом покупается у двери, а не только в телефоне.
--
-- Так честнее по смыслу - приехал, посмотрел, купил, - и так это работает
-- даже когда телефон почему-то не показывает список. Телефонное приложение
-- никуда не делось, просто перестало быть единственным способом.
local function money(amount)
    local text = tostring(math.floor(amount))
    return (text:reverse():gsub('(%d%d%d)', '%1 '):reverse():gsub('^%s+', ''))
end

local buyKey = nil
local sellKey = nil

AddEventHandler('ls_interact:collect', function()
    local me = GetEntityCoords(PlayerPedId())
    doorKey, buyKey, sellKey = nil, nil, nil

    for _, row in ipairs(phone.properties or {}) do
        if #(me - vector3(row.x, row.y, row.z)) <= Config.Interact then
            if row.mine or row.family then
                doorKey = row.key
                TriggerEvent('ls_interact:offer', {
                    id = 'ls_property:storage',
                    label = ('Склад — %s'):format(row.label),
                    order = 15,
                })
                if row.mine then
                    sellKey = row.key
                    TriggerEvent('ls_interact:offer', {
                        id = 'ls_property:sell',
                        label = ('Продать — %s'):format(row.label),
                        order = 17,
                    })
                end
            elseif not row.owner then
                buyKey = row.key
                TriggerEvent('ls_interact:offer', {
                    id = 'ls_property:buy',
                    label = ('Купить %s — $%s'):format(row.label, money(row.price or 0)),
                    order = 15,
                })
            end
            break
        end
    end
end)

AddEventHandler('ls_interact:run', function(id)
    if id == 'ls_property:storage' and doorKey then
        TriggerServerEvent('ls_property:openStorage', doorKey)
    elseif id == 'ls_property:buy' and buyKey then
        TriggerServerEvent('ls_property:buy', buyKey)
    elseif id == 'ls_property:sell' and sellKey then
        TriggerServerEvent('ls_property:sellBack', sellKey)
    end
end)

-- --- семья командами ----------------------------------------------------------
-- Телефонное приложение - удобство, а не единственная дверь. Команды делают
-- то же самое и не зависят от интерфейса вообще.

RegisterCommand('family', function(_, args)
    local action = (args[1] or ''):lower()

    if action == 'create' then
        local name = args[2]
        local tag = args[3]
        if not name then
            notify('~y~/family create <название> <тег>')
            return
        end
        TriggerServerEvent('ls_property:createFamily', name, tag or '')

    elseif action == 'invite' then
        -- Ближайший игрок: искать его глазами в списке номеров незачем.
        local me = GetEntityCoords(PlayerPedId())
        local best, bestDist
        for _, other in ipairs(GetActivePlayers()) do
            if other ~= PlayerId() then
                local ped = GetPlayerPed(other)
                local dist = #(me - GetEntityCoords(ped))
                if dist < 5.0 and (not bestDist or dist < bestDist) then
                    best, bestDist = other, dist
                end
            end
        end
        if not best then
            notify('~r~Рядом никого нет')
            return
        end
        TriggerServerEvent('ls_property:invite', GetPlayerServerId(best))

    elseif action == 'accept' then
        TriggerServerEvent('ls_property:answerInvite', true)

    elseif action == 'decline' then
        TriggerServerEvent('ls_property:answerInvite', false)

    elseif action == 'leave' then
        TriggerServerEvent('ls_property:leaveFamily')

    elseif action == 'who' then
        local family = phone.family
        if type(family) ~= 'table' or not family.name then
            notify('~y~Ты не в семье')
            return
        end
        notify(('~b~%s~w~ [%s] — человек: %d')
            :format(family.name, family.tag or '', #(family.members or {})))

    else
        notify('~y~/family create | invite | accept | decline | leave | who')
    end
end, false)

-- ls_rp спрашивает это перед тем, как показать кнопку "Пригласить в семью".
-- Клиентский экспорт: серверный из клиента не вызвать.
exports('canInvite', function()
    return type(phone.family) == 'table' and phone.family.canInvite == true
end)

exports('myFamily', function()
    if type(phone.family) ~= 'table' or not phone.family.name then return nil end
    return { id = phone.family.id, name = phone.family.name, tag = phone.family.tag }
end)

-- --- команды -----------------------------------------------------------------

-- Двери в GTA стоят где им удобно. Встал как надо - записал координаты.
RegisterCommand('prophere', function()
    local coords = GetEntityCoords(PlayerPedId())
    local line = ('x = %.1f, y = %.1f, z = %.1f'):format(coords.x, coords.y, coords.z)
    TriggerEvent('chat:addMessage', {
        color = { 120, 200, 255 },
        multiline = true,
        args = { 'Координаты', line },
    })
    print('[ls_property] ' .. line)
end, false)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    for _, blip in ipairs(blips) do RemoveBlip(blip) end
end)
