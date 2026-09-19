Config = {}

Config.Interact = 2.5
Config.Cooldown = 700

-- Доход капает владельцу раз в столько секунд, но только если заведение
-- открыто. Закрытая лавка не зарабатывает.
Config.PayoutEvery = 600

-- Больше стольких заведений на одного.
Config.MaxPerPlayer = 2

-- Типы. income - за одну выплату, price - сколько стоит купить.
Config.Types = {
    shop   = { label = 'Магазин',      blip = 52,  colour = 2,  income = 2200 },
    bar    = { label = 'Бар',          blip = 93,  colour = 5,  income = 2800 },
    club   = { label = 'Клуб',         blip = 121, colour = 27, income = 4200 },
    garage = { label = 'Автосервис',   blip = 446, colour = 46, income = 3000 },
    diner  = { label = 'Закусочная',   blip = 106, colour = 6,  income = 1800 },
}

-- Точки. Купить можно любую свободную.
Config.Spots = {
    { key = 'shop_grove',    type = 'shop',   label = 'Лавка на Гроув',      price = 320000,  x = -46.0,   y = -1757.0, z = 29.4 },
    { key = 'shop_sandy',    type = 'shop',   label = 'Лавка в Сэнди',       price = 240000,  x = 1961.0,  y = 3741.0,  z = 32.3 },
    { key = 'shop_paleto',   type = 'shop',   label = 'Лавка в Палето',      price = 210000,  x = -48.0,   y = 6528.0,  z = 31.5 },
    { key = 'bar_vespucci',  type = 'bar',    label = 'Бар на Веспуччи',     price = 540000,  x = -1300.0, y = -1080.0, z = 7.0 },
    { key = 'bar_sandy',     type = 'bar',    label = 'Йеллоу-Джек',         price = 380000,  x = 1985.0,  y = 3054.0,  z = 47.2 },
    { key = 'club_vinewood',  type = 'club',  label = 'Клуб в Вайнвуде',     price = 1400000, x = 370.0,   y = 260.0,   z = 103.0 },
    { key = 'club_downtown', type = 'club',   label = 'Клуб в центре',       price = 1200000, x = -560.0,  y = 280.0,   z = 83.0 },
    { key = 'garage_lamesa', type = 'garage', label = 'Сервис в Ла-Меса',    price = 620000,  x = 731.0,   y = -1088.0, z = 22.2 },
    { key = 'garage_sandy',  type = 'garage', label = 'Сервис в Сэнди',      price = 400000,  x = 1175.0,  y = 2640.0,  z = 37.8 },
    { key = 'diner_route68', type = 'diner',  label = 'Закусочная на 68-й',  price = 280000,  x = 1590.0,  y = 3592.0,  z = 35.4 },
    { key = 'diner_harmony', type = 'diner',  label = 'Закусочная в Хармони', price = 260000, x = 1135.0,  y = 2660.0,  z = 38.0 },
    { key = 'diner_pillbox', type = 'diner',  label = 'Закусочная в центре', price = 480000,  x = 60.0,    y = -745.0,  z = 44.2 },
}

-- Закрытое заведение видно только владельцу. Открытое - всем.
Config.ClosedColour = 40

-- Ограбление заведения. Приходит вместе с розыском, деньги берутся из
-- кассы: чем дольше владелец не забирал выручку, тем больше унесут.
Config.Robbery = {
    enabled = true,
    seconds = 40,
    crime = 'robbery',
    -- Сколько процентов кассы уносит грабитель.
    share = 60,
    -- На точку.
    cooldown = 2700,
    -- Меньше этого в кассе - грабить нечего.
    minTill = 5000,
}
