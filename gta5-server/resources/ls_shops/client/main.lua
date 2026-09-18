-- Client side: blips, shop markers, the style editor and the buy menus.

local shops = {}          -- config + custom, merged
local blips = {}
local savedLook = nil
local uiOpen = false

-- Style editor state
local editor = nil        -- { kind, slots, original, current, changed }
local cam = nil

-- --- small helpers ---------------------------------------------------------

local function notify(text)
    SetNotificationTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawNotification(false, true)
end

local function money()
    local ok, value = pcall(function() return exports.phone_garage:getMoney() end)
    return (ok and tonumber(value)) or 0
end

local function drawText3D(x, y, z, text)
    SetTextScale(0.35, 0.35)
    SetTextFont(4)
    SetTextColour(255, 255, 255, 215)
    SetTextCentre(true)
    SetTextEntry('STRING')
    AddTextComponentString(text)
    SetDrawOrigin(x, y, z, 0)
    DrawText(0.0, 0.0)
    ClearDrawOrigin()
end

local function numHairColours()
    local ok, n = pcall(GetNumHairColors)
    if ok and type(n) == 'number' and n > 0 then return n end
    return 64
end

-- --- look model ------------------------------------------------------------
-- JSON turns integer keys into strings, so everything is normalised on the way
-- in and the tables are kept keyed by number from then on.

local function normalizeLook(raw)
    if type(raw) ~= 'table' then return nil end
    local look = { components = {}, props = {}, hair = { colour = 0, highlight = 0 }, overlays = {} }

    for key, value in pairs(raw.components or {}) do
        local id = tonumber(key)
        if id and type(value) == 'table' then
            look.components[id] = { d = tonumber(value.d) or 0, t = tonumber(value.t) or 0 }
        end
    end
    for key, value in pairs(raw.props or {}) do
        local id = tonumber(key)
        if id and type(value) == 'table' then
            look.props[id] = { d = tonumber(value.d) or -1, t = tonumber(value.t) or 0 }
        end
    end
    for key, value in pairs(raw.overlays or {}) do
        local id = tonumber(key)
        if id then look.overlays[id] = tonumber(value) or -1 end
    end
    if type(raw.hair) == 'table' then
        look.hair.colour = tonumber(raw.hair.colour) or 0
        look.hair.highlight = tonumber(raw.hair.highlight) or 0
    end
    return look
end

local function captureLook(ped)
    local look = { components = {}, props = {}, hair = {}, overlays = {} }

    for _, id in ipairs({ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 }) do
        look.components[id] = {
            d = GetPedDrawableVariation(ped, id),
            t = GetPedTextureVariation(ped, id),
        }
    end
    for _, id in ipairs({ 0, 1, 2, 6, 7 }) do
        look.props[id] = {
            d = GetPedPropIndex(ped, id),
            t = GetPedPropTextureIndex(ped, id),
        }
    end
    for _, id in ipairs({ 1, 2, 10 }) do
        local value = GetPedHeadOverlayValue(ped, id)
        look.overlays[id] = (value == 255) and -1 or value
    end

    local okColour, colour = pcall(GetPedHairColor, ped)
    local okHigh, highlight = pcall(GetPedHairHighlightColor, ped)
    look.hair.colour = (okColour and colour) or 0
    look.hair.highlight = (okHigh and highlight) or 0

    return look
end

local function applyLook(ped, look)
    if not look then return end

    for id, value in pairs(look.components or {}) do
        SetPedComponentVariation(ped, id, value.d, value.t, 0)
    end
    for id, value in pairs(look.props or {}) do
        if (value.d or -1) < 0 then
            ClearPedProp(ped, id)
        else
            SetPedPropIndex(ped, id, value.d, value.t, true)
        end
    end

    local hair = look.hair or {}
    SetPedHairColor(ped, hair.colour or 0, hair.highlight or 0)

    for id, value in pairs(look.overlays or {}) do
        if (value or -1) < 0 then
            SetPedHeadOverlay(ped, id, 255, 0.0)
        else
            SetPedHeadOverlay(ped, id, value, 1.0)
            -- Beard and brows follow the hair colour instead of getting their own slot.
            SetPedHeadOverlayColor(ped, id, 1, hair.colour or 0, hair.colour or 0)
        end
    end
end

local function copyLook(look)
    return normalizeLook(json.decode(json.encode(look)))
end

-- --- blips -----------------------------------------------------------------

local function clearBlips()
    for _, blip in ipairs(blips) do
        if DoesBlipExist(blip) then RemoveBlip(blip) end
    end
    blips = {}
end

local function rebuildBlips()
    clearBlips()
    for _, shop in ipairs(shops) do
        local kind = Config.Types[shop.type]
        if kind then
            local blip = AddBlipForCoord(shop.x + 0.0, shop.y + 0.0, shop.z + 0.0)
            SetBlipSprite(blip, kind.blip)
            SetBlipColour(blip, kind.colour)
            SetBlipScale(blip, 0.75)
            SetBlipAsShortRange(blip, true)
            BeginTextCommandSetBlipName('STRING')
            AddTextComponentSubstringPlayerName(('%s — %s'):format(kind.label, shop.label or ''))
            EndTextCommandSetBlipName(blip)
            blips[#blips + 1] = blip
        end
    end
end

-- --- camera ----------------------------------------------------------------

local function startCam(ped)
    local coords = GetEntityCoords(ped)
    local forward = GetEntityForwardVector(ped)
    cam = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA',
        coords.x + forward.x * 2.0, coords.y + forward.y * 2.0, coords.z + 0.25,
        0.0, 0.0, 0.0, 45.0, false, 0)
    PointCamAtEntity(cam, ped, 0.0, 0.0, 0.2, true)
    SetCamActive(cam, true)
    RenderScriptCams(true, true, 400, true, true)
end

local function stopCam()
    RenderScriptCams(false, true, 400, true, true)
    if cam then
        DestroyCam(cam, false)
        cam = nil
    end
end

-- --- style editor ----------------------------------------------------------

-- How many options a slot has, and where the current value sits in that range.
local function slotInfo(ped, slot, look)
    if slot.kind == 'component' then
        local value = look.components[slot.id] or { d = 0, t = 0 }
        local count = GetNumberOfPedDrawableVariations(ped, slot.id)
        local textures = GetNumberOfPedTextureVariations(ped, slot.id, value.d)
        return value.d, math.max(count, 1), value.t, math.max(textures, 1), 0
    elseif slot.kind == 'prop' then
        local value = look.props[slot.id] or { d = -1, t = 0 }
        local count = GetNumberOfPedPropDrawableVariations(ped, slot.id)
        local textures = (value.d >= 0) and GetNumberOfPedPropTextureVariations(ped, slot.id, value.d) or 1
        return value.d, math.max(count, 1), value.t, math.max(textures, 1), -1
    elseif slot.kind == 'hairColour' then
        local hair = look.hair or {}
        local value = (slot.id == 0) and (hair.colour or 0) or (hair.highlight or 0)
        return value, numHairColours(), 0, 1, 0
    else -- overlay
        local value = look.overlays[slot.id]
        if value == nil then value = -1 end
        local count = GetPedHeadOverlayNum(slot.id)
        return value, math.max(count, 1), 0, 1, -1
    end
end

local function setSlot(ped, slot, look, drawable, texture)
    if slot.kind == 'component' then
        look.components[slot.id] = { d = drawable, t = texture }
    elseif slot.kind == 'prop' then
        look.props[slot.id] = { d = drawable, t = texture }
    elseif slot.kind == 'hairColour' then
        look.hair = look.hair or {}
        if slot.id == 0 then look.hair.colour = drawable else look.hair.highlight = drawable end
    else
        look.overlays[slot.id] = drawable
    end
    applyLook(ped, look)
end

local function countChanged()
    if not editor then return 0 end
    local changed = 0
    for _, slot in ipairs(editor.slots) do
        local nowD, _, nowT = slotInfo(PlayerPedId(), slot, editor.current)
        local wasD, _, wasT = slotInfo(PlayerPedId(), slot, editor.original)
        if nowD ~= wasD or nowT ~= wasT then changed = changed + 1 end
    end
    return changed
end

local function pushEditor()
    if not editor then return end
    local ped = PlayerPedId()
    local rows = {}

    for index, slot in ipairs(editor.slots) do
        local drawable, count, texture, textures, minValue = slotInfo(ped, slot, editor.current)
        rows[#rows + 1] = {
            index = index,
            label = slot.label,
            value = drawable - minValue + 1,
            count = count - minValue,
            texture = texture + 1,
            textures = textures,
            hasTexture = (slot.kind == 'component' or slot.kind == 'prop'),
        }
    end

    local changed = countChanged()
    local perSlot = (editor.kind == 'barber') and Config.BarberSlotPrice or Config.ClothingSlotPrice

    SendNUIMessage({
        action = 'style',
        title = editor.kind == 'barber' and 'Барбершоп' or 'Магазин одежды',
        rows = rows,
        changed = changed,
        total = changed * perSlot,
        money = money(),
    })
end

local function openEditor(kind)
    local ped = PlayerPedId()
    editor = {
        kind = kind,
        slots = (kind == 'barber') and Config.BarberSlots or Config.ClothingSlots,
        original = captureLook(ped),
    }
    editor.current = copyLook(editor.original)

    uiOpen = true
    SetNuiFocus(true, true)
    startCam(ped)
    SendNUIMessage({ action = 'open', view = 'style' })
    pushEditor()
end

local function closeEditor(revert)
    if not editor then return end
    if revert then applyLook(PlayerPedId(), editor.original) end
    editor = nil
    uiOpen = false
    stopCam()
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })
end

-- --- buy menus -------------------------------------------------------------

local function openList(kind)
    local catalog = (kind == 'ammu') and Config.AmmuCatalog or Config.StoreCatalog
    local items = {}
    for _, entry in ipairs(catalog) do
        items[#items + 1] = {
            item = entry.item,
            label = entry.label,
            price = entry.price,
            note = entry.heal and ('+' .. entry.heal .. ' HP')
                or (entry.armour and ('+' .. entry.armour .. ' брони'))
                or nil,
        }
    end

    uiOpen = true
    SetNuiFocus(true, true)
    SendNUIMessage({
        action = 'open',
        view = 'list',
        title = Config.Types[kind].label,
        kind = kind,
        items = items,
        money = money(),
    })
end

local function closeList()
    uiOpen = false
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })
end

-- --- markers ---------------------------------------------------------------

CreateThread(function()
    while true do
        local wait = 500
        if not uiOpen then
            local ped = PlayerPedId()
            local coords = GetEntityCoords(ped)

            for _, shop in ipairs(shops) do
                local dist = #(coords - vector3(shop.x + 0.0, shop.y + 0.0, shop.z + 0.0))
                if dist < Config.MarkerRange then
                    wait = 0
                    local kind = Config.Types[shop.type]
                    DrawMarker(1, shop.x + 0.0, shop.y + 0.0, shop.z - 0.98,
                        0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.2, 1.2, 0.5,
                        60, 160, 255, 90, false, true, 2, false, nil, nil, false)

                    if dist < Config.Interact then
                        drawText3D(shop.x + 0.0, shop.y + 0.0, shop.z + 0.3,
                            ('~b~[E]~w~ %s'):format(kind.label))
                        if IsControlJustReleased(0, Config.OpenControl) then
                            if shop.type == 'clothing' then
                                openEditor('clothing')
                            elseif shop.type == 'barber' then
                                openEditor('barber')
                            else
                                openList(shop.type)
                            end
                        end
                    end
                end
            end
        end
        Wait(wait)
    end
end)

-- --- NUI callbacks ---------------------------------------------------------

RegisterNUICallback('styleChange', function(data, cb)
    if editor and data and data.index then
        local slot = editor.slots[tonumber(data.index)]
        if slot then
            local ped = PlayerPedId()
            local drawable, count, texture, textures, minValue = slotInfo(ped, slot, editor.current)
            local dir = tonumber(data.dir) or 1

            if data.axis == 'texture' then
                texture = texture + dir
                if texture < 0 then texture = textures - 1 end
                if texture >= textures then texture = 0 end
            else
                drawable = drawable + dir
                if drawable < minValue then drawable = count - 1 end
                if drawable >= count then drawable = minValue end
                texture = 0
            end

            setSlot(ped, slot, editor.current, drawable, texture)
            pushEditor()
        end
    end
    cb('ok')
end)

RegisterNUICallback('styleRotate', function(data, cb)
    local ped = PlayerPedId()
    SetEntityHeading(ped, GetEntityHeading(ped) + ((tonumber(data and data.dir) or 1) * 25.0))
    cb('ok')
end)

RegisterNUICallback('styleConfirm', function(_, cb)
    if editor then
        TriggerServerEvent('ls_shops:payStyle', editor.kind, countChanged())
    end
    cb('ok')
end)

RegisterNUICallback('styleCancel', function(_, cb)
    closeEditor(true)
    cb('ok')
end)

RegisterNUICallback('listBuy', function(data, cb)
    if data and data.item then
        if data.kind == 'ammu' then
            TriggerServerEvent('ls_shops:buyWeapon', data.item)
        else
            TriggerServerEvent('ls_shops:buyItem', data.item)
        end
    end
    cb('ok')
end)

RegisterNUICallback('listClose', function(_, cb)
    closeList()
    cb('ok')
end)

-- --- server events ---------------------------------------------------------

RegisterNetEvent('ls_shops:sync', function(data)
    savedLook = normalizeLook(data and data.look)

    shops = {}
    for _, shop in ipairs(Config.Shops) do shops[#shops + 1] = shop end
    for _, shop in ipairs((data and data.shops) or {}) do shops[#shops + 1] = shop end
    rebuildBlips()

    if savedLook then
        applyLook(PlayerPedId(), savedLook)
    end
end)

RegisterNetEvent('ls_shops:notify', function(text)
    notify(text)
end)

RegisterNetEvent('ls_shops:styleResult', function(paid)
    if not editor then return end
    if paid then
        savedLook = copyLook(editor.current)
        TriggerServerEvent('ls_shops:saveLook', savedLook)
        closeEditor(false)
        notify('~g~Готово')
    else
        -- Charge failed: keep the editor open so nothing is silently lost.
        SendNUIMessage({ action = 'styleDenied' })
    end
end)

RegisterNetEvent('ls_shops:giveWeapon', function(item)
    local ped = PlayerPedId()
    if item == 'ARMOUR' then
        SetPedArmour(ped, 100)
    else
        GiveWeaponToPed(ped, GetHashKey(item), 250, false, false)
    end
end)

RegisterNetEvent('ls_shops:consume', function(effect)
    local ped = PlayerPedId()
    if effect.heal then
        SetEntityHealth(ped, math.min(GetEntityMaxHealth(ped), GetEntityHealth(ped) + effect.heal))
    end
    if effect.armour then
        SetPedArmour(ped, math.min(100, GetPedArmour(ped) + effect.armour))
    end
end)

-- --- commands --------------------------------------------------------------

RegisterCommand('shophere', function(_, args)
    local kind = args[1]
    if not kind or not Config.Types[kind] then
        notify('~r~Формат: /shophere clothing|barber|ammu|store')
        return
    end
    local coords = GetEntityCoords(PlayerPedId())
    TriggerServerEvent('ls_shops:addShop', {
        type = kind,
        x = coords.x, y = coords.y, z = coords.z,
        label = GetLabelText(GetNameOfZone(coords.x, coords.y, coords.z)),
    })
end, false)

-- --- boot ------------------------------------------------------------------

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(200) end
    Wait(1500)
    TriggerServerEvent('ls_shops:requestSync')
end)

-- The ped is rebuilt on respawn, so the saved look has to go back on.
AddEventHandler('playerSpawned', function()
    Wait(1000)
    if savedLook then applyLook(PlayerPedId(), savedLook) end
end)

AddEventHandler('onResourceStop', function(name)
    if name == GetCurrentResourceName() then
        clearBlips()
        stopCam()
        SetNuiFocus(false, false)
    end
end)
