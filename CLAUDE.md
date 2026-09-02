# Emperator-coin — проект (память для будущих сессий)

Владелец: **@cozpe / emperatorrr** (Telegram id `7563505180`, email somtakgaming@gmail.com).
Репозиторий монорепо: **и Telegram-бот, и веб-проект с играми** в одном репо.
Рабочая ветка бота: **`claude/telegram-bed-dialog-bot-cszg9u`** (весь код бота, деплой — с неё).
Общение с владельцем — по-русски.

## Что это
**Bed Dialog** — Telegram-бот на **Business API** (Chat Automation): владелец подключает бота к
своему бизнес-аккаунту, бот следит за его диалогами и даёт кучу функций. Стек: Python +
`python-telegram-bot 21.x`, SQLite, деплой на Railway 24/7. Код — в `bed_dialog_bot/`.
(В корне репо ещё лежит статический веб-проект с играми — `index.html`, `games/`, `stickman/` — это НЕ бот.)

## Архитектура (`bed_dialog_bot/`)
- `main.py` — запуск, Application, фоновые циклы (напоминания, крипто-инвойсы, депозиты BED,
  бэкап БД раз в 24ч, стейки/алерты цены, запись истории курса), восстановление БД из `_seed.db`,
  и **`FloodSafeRateLimiter`** (анти-флуд: пер-чат токен-бакет со всплеском поверх AIORateLimiter).
- `handlers.py` — огромный диспетчер: бизнес-сообщения (удаления/правки/одноразовые медиа),
  DM-команды, callback'и меню, платежи (Stars/крипта/BED).
- `commands.py` — команды в бизнес-чате (`.ban .spam .troll .clone .fake .kawai .stalker` и т.д.),
  power-команды за BED (`.boom .matrix .hack .trace .seen .phantom .vanish .roulette`),
  кастомные команды юзера, ULTRA-иммунитеты.
- `storage.py` — SQLite (схема + миграции через ALTER-гварды). Все данные тут.
- `menus.py` — инлайн фото-меню (навигация редактированием одного сообщения).
- `bedcoin.py` — экономика BED (цена растёт со спросом), титулы держателей.
- `ton.py` — on-chain BED (jetton на TON): депозиты/выводы. `tonutils==0.3.4` (НЕ обновлять до 2.x!).
- `adlink.py` / `workink.py` — бесплатный премиум за рекламу (GPLinks / work.ink).
- `admin.py` — роли/права. `config.py` — все настройки из env.

## Ключевые системы
- **Роли:** супер-админ (только `7563505180`), ранги через `/admin grant`. Права: logs/saves/tickets/
  moderation/premium/users/promo/broadcast.
- **Премиум-тарифы:** Premium 100⭐/мес, **ULTRA PREMIUM** 250⭐ или 20 BED/мес, «навсегда» 100 BED.
  ULTRA = иммунитет к .ban/.spam/.troll/power (тумблеры), рикошет, невидимка, анти-клон, бесплатные
  power-команды, BED −15%, ×2 промо/ежедневка, топ лидерборда, кастом-титул, враги/VIP (`.enemy`/`.vip`),
  несокрушимый бан ×5, регекс-алерты, grace 3 дня. Удаления ULTRA не видят бесплатные юзеры.
- **BedCoin (BED):** реальный jetton на TON `EQD7Atapy0DsS88yqP4vCXEiU6Tu_DFsw9KNFjKdfiNr_MKQ`
  (9 decimals, supply 10000). Казна `EQCJaz4nfb7JbYEQLGA8m9si3H9wAnoY6zS7ZY1zCjK06SHb` (WalletV5R1,
  админ/минтер джеттона). Внутренний баланс кастодиальный, обеспечен on-chain резервом; каждое
  движение → `bed_ledger`; `/bedaudit` сверяет обязательства с резервом.
- **Кошелёк:** покупка BED за ⭐, депозит/вывод on-chain, перевод (`/send @ник сумма`), чеки
  (`/bedcode`,`/redeemcode`), история (`/history`), обмен на премиум (`/exchange`), кости (`/dice`),
  стейкинг/копилка (`/stake`), алерт цены (`/pricealert`), график (`/chart`), PIN на вывод
  (`/setpin`), достижения (`/achievements`), калькулятор (`/calc`).
- **Кастом-команды:** `/create имя текст` → `.имя` в чате подставляет текст; магазин команд
  (`/publish`, кнопка «🛒 Магазин команд»).
- **Логи/слежка:** `/log /photolog /photologcheck /getlog /chatlog <owner> <contact>` (переписка пары,
  включая удалённое), `/searchall`, `/status reload`.

## Деплой (ВАЖНО)
- Хостинг: **Railway, аккаунт друга** `bedsmp.pro@gmail.com` (проект `cheerful-nourishment`,
  сервис `Emperator-coin`). Volume `/data`, `DB_PATH=/data/bed_dialog.db`.
- Деплой командой: `git push origin claude/telegram-bed-dialog-bot-cszg9u` затем
  **`railway up --detach`** (uploads локально; nixpacks собирает Python-бота по `nixpacks.toml`
  + `railway.json`, start `python -m bed_dialog_bot`). НЕ полагаться на GitHub-автодеплой Railway —
  он ловит `index.html` в корне и собирает статику (Caddy) вместо бота.
- Проверка: `railway logs` → ждать `Application started`, отсутствие Traceback, идут `getUpdates`.
- Railway CLI может слетать при пересоздании контейнера — тогда `npm i -g @railway/cli` и
  `railway login --browserless` (владелец подтверждает ссылку).
- БД мигрирует на новый volume через `_seed.db` (кладётся в корень, не в git; restore-on-first-boot
  в `main.py`).

## Секреты — ТОЛЬКО в Railway env, НИКОГДА в git/чат/лог
`BOT_TOKEN, TON_TREASURY_MNEMONIC, TON_API_KEY, CRYPTO_PAY_TOKEN, ADLINK_API_KEY, WORKINK_LINK_URL`.

## Грабли
- `tonutils==0.3.4` фиксирован (2.x — другой API).
- Анти-флуд: не слать в один чат быстрее ~1/сек (Telegram даёт Peer_flood с долгим RetryAfter).
  Интервалы `.spam`/`.troll` настраиваются env (`SPAM_INTERVAL_*`, `TROLL_INTERVAL_*`); ULTRA быстрее.
  Если «отправлено 1 из N» — почти всегда аккаунт под Peer_flood от тестов, ждать/@SpamBot.
- Telegram НЕ шлёт ботам «печатает» и реакции в бизнес-чатах (typing/reactions недоступны).
- Атрибуция коммитов: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` +
  `Claude-Session: <url>`.
