# Emperator Bank

Сайт-банк для сервера Bedsmp: игроки регистрируются под ником/паролем,
получают счёт в Emperator Coin (EMP), переводят монеты друг другу и
привязывают свой игровой аккаунт на Bedsmp через Minecraft-плагин, чтобы
переносить деньги между игровой экономикой и банком.

## Структура репозитория

- `backend/` — Node.js/Express API + SQLite. Хранит пользователей, балансы,
  транзакции, коды привязки Minecraft-аккаунтов.
- `frontend/` — статический сайт (HTML/CSS/JS, тёмная имперская тема),
  раздаётся тем же Express-сервером.
- `plugin/` — Java-плагин для Paper/Spigot-сервера Bedsmp. Даёт команду
  `/bank link|balance|deposit|withdraw`, ходит в backend по HTTP.

## Как это работает

1. Игрок регистрируется на сайте (ник + пароль) — получает банковский счёт
   с балансом 0 EMP.
2. В личном кабинете нажимает «Получить код привязки» — код живёт 10 минут.
3. На сервере Bedsmp вводит `/bank link <код>` — плагин отправляет UUID и
   ник игрока в backend, привязка сохраняется в таблице `mc_links`.
4. После привязки: `/bank balance`, `/bank deposit <сумма>` (переносит деньги
   из игровой экономики Vault в банк), `/bank withdraw <сумма>` (обратно).
5. На сайте — переводы между игроками, история операций, для админов —
   эмиссия/списание монет и заморозка счетов.

## Backend

```bash
cd backend
npm install
cp .env.example .env   # заполните JWT_SECRET и PLUGIN_API_KEY случайными строками
npm start
```

Сервер поднимется на `http://localhost:3000` и одновременно раздаёт фронтенд
из `frontend/`.

Чтобы сделать пользователя администратором:

```bash
node scripts/make-admin.js <username>
```

### API

- `POST /api/auth/register`, `POST /api/auth/login`
- `GET /api/bank/me`, `GET /api/bank/transactions`, `POST /api/bank/transfer`,
  `POST /api/bank/link-code` — требуют `Authorization: Bearer <JWT>`
- `GET /api/admin/users`, `POST /api/admin/mint`, `POST /api/admin/burn`,
  `POST /api/admin/freeze/:id`, `POST /api/admin/unfreeze/:id` — только admin
- `POST /api/plugin/link`, `GET /api/plugin/balance/:mcUuid`,
  `POST /api/plugin/deposit`, `POST /api/plugin/withdraw` — требуют
  `Authorization: Bearer <PLUGIN_API_KEY>`, вызываются плагином, а не браузером

## Minecraft-плагин

```bash
cd plugin
mvn package
```

Готовый `emperator-bank-plugin.jar` появится в `plugin/target/`. Положите его
на сервер Bedsmp в папку `plugins/`, запустите сервер один раз, чтобы
создался `plugins/EmperatorBank/config.yml`, впишите туда `api-base-url`
(адрес вашего backend) и `api-key` (тот же `PLUGIN_API_KEY`, что в `.env`
backend). Для депозитов/выводов в игровую валюту нужен установленный Vault
и любой экономический плагин (например EssentialsX).

## Дальнейшие шаги (не реализовано)

- Интеграция с реальными деньгами (фиат/криптовалюта) — сейчас EMP только
  внутренняя валюта банка, эмитируемая администратором. Когда определитесь
  с платёжным провайдером, добавим отдельный модуль обмена EMP ↔ реальные
  деньги поверх текущей таблицы транзакций.
- Восстановление пароля, 2FA.
- Деплой (домен, HTTPS, процесс-менеджер) — сейчас проект рассчитан на
  локальный/тестовый запуск.
