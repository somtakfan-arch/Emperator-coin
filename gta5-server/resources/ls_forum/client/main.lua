-- Клиент форума: только пересылка. Рисует его телефон (phone_garage),
-- потому что форум — это приложение, а не отдельное окно.

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

RegisterNetEvent('ls_forum:notify', function(text) notify(text) end)

RegisterNetEvent('ls_forum:data', function(data)
    TriggerEvent('phone_garage:forumData', data)
end)

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(3000)
    TriggerServerEvent('ls_forum:request')
end)

-- Телефон дёргает это, когда открывают приложение: список мог измениться,
-- пока телефон лежал в кармане.
AddEventHandler('ls_forum:refresh', function()
    TriggerServerEvent('ls_forum:request')
end)
