-- Client side: opens the grid, relays actions, applies what the server allows.

local open = false
local lastState = nil

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

local function money()
    local ok, value = pcall(function() return exports.phone_garage:getMoney() end)
    return (ok and tonumber(value)) or 0
end

-- ls_police blocks the inventory while a player is restrained. The call is
-- guarded so the inventory still works with ls_police stopped.
local function blocked()
    local ok, isBlocked = pcall(function() return exports.ls_police:isBlocked() end)
    return ok and isBlocked == true
end

local function setOpen(value)
    if value and blocked() then
        notify('~r~В наручниках это недоступно')
        return
    end
    open = value
    SetNuiFocus(value, value)
    if value then
        TriggerServerEvent('ls_inventory:request')
        SendNUIMessage({ action = 'open' })
    else
        SendNUIMessage({ action = 'close' })
    end
end

RegisterCommand('inventory', function()
    setOpen(not open)
end, false)

RegisterKeyMapping('inventory', 'Инвентарь', 'keyboard', Config.OpenKey)

-- --- NUI callbacks ---------------------------------------------------------

RegisterNUICallback('use', function(data, cb)
    if data and data.slot then TriggerServerEvent('ls_inventory:use', data.slot) end
    cb('ok')
end)

RegisterNUICallback('drop', function(data, cb)
    if data and data.slot then TriggerServerEvent('ls_inventory:drop', data.slot) end
    cb('ok')
end)

RegisterNUICallback('move', function(data, cb)
    if data and data.from and data.to then
        TriggerServerEvent('ls_inventory:move', data.from, data.to)
    end
    cb('ok')
end)

RegisterNUICallback('buyBackpack', function(_, cb)
    TriggerServerEvent('ls_inventory:buyBackpack')
    cb('ok')
end)

RegisterNUICallback('close', function(_, cb)
    setOpen(false)
    cb('ok')
end)

-- --- server events ---------------------------------------------------------

RegisterNetEvent('ls_inventory:sync', function(data)
    lastState = data
    data.money = money()
    SendNUIMessage({ action = 'state', state = data })
    -- The phone's wardrobe shows the backpack card, so keep it in step.
    TriggerEvent('phone_garage:refresh')
end)

RegisterNetEvent('ls_inventory:notify', function(text)
    notify(text)
end)

RegisterNetEvent('ls_inventory:equip', function(item, ammo)
    local ped = PlayerPedId()
    local hash = GetHashKey(item)
    GiveWeaponToPed(ped, hash, ammo or 250, false, true)
    notify('~g~Экипировано')
end)

-- --- видимый бронежилет ------------------------------------------------------

local vestOn = false

local function genderOf()
    local ok, char = pcall(function() return exports.ls_character:getCharacter() end)
    if ok and type(char) == 'table' and char.gender == 'female' then return 'female' end
    return 'male'
end

-- Ближайший заданный уровень: настроены 50 и 100, а приходить может что угодно.
local function vestFor(value)
    local table_ = Config.ArmourLook and Config.ArmourLook[genderOf()]
    if not table_ then return nil end

    local best, bestGap
    for level, look in pairs(table_) do
        local gap = math.abs(level - value)
        if not bestGap or gap < bestGap then best, bestGap = look, gap end
    end
    return best
end

local function takeVestOff()
    if not vestOn then return end
    vestOn = false
    -- Возвращаем сохранённый в гардеробе комплект целиком: снимать слот 9
    -- вручную нельзя, под жилетом мог быть свой.
    TriggerEvent('ls_character:applied')
end

RegisterNetEvent('ls_inventory:armour', function(value)
    value = math.min(100, math.floor(value or 50))
    SetPedArmour(PlayerPedId(), value)
    notify(('~g~Броня: %d%%'):format(value))

    if not Config.ShowArmour then return end
    local look = vestFor(value)
    if look then
        SetPedComponentVariation(PlayerPedId(), 9, look.d, look.t, 0)
        vestOn = true
    end
end)

-- Броню отстрелили или игрок возродился - жилет должен исчезнуть сам.
CreateThread(function()
    while true do
        Wait(1500)
        if vestOn and GetPedArmour(PlayerPedId()) <= 0 then
            takeVestOff()
        end
    end
end)

RegisterNetEvent('ls_inventory:heal', function(amount)
    local ped = PlayerPedId()
    SetEntityHealth(ped, math.min(GetEntityMaxHealth(ped), GetEntityHealth(ped) + (amount or 25)))
    notify(('~g~+%d HP'):format(amount or 25))
end)

-- --- exports ---------------------------------------------------------------
-- The phone's wardrobe app shows the backpack card, so it reads state here.

exports('getState', function()
    return lastState
end)

exports('buyBackpack', function()
    TriggerServerEvent('ls_inventory:buyBackpack')
end)

-- --- boot ------------------------------------------------------------------

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(1500)
    TriggerServerEvent('ls_inventory:request')
end)

AddEventHandler('onResourceStop', function(name)
    if name == GetCurrentResourceName() then
        SetNuiFocus(false, false)
    end
end)
