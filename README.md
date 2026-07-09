# Emperator Bank

Сайт-банк для сервера Bedsmp: игроки регистрируются под ником/паролем,
получают счёт в Emperator Coin (EMP), переводят монеты друг другу и
привязывают свой игровой аккаунт на Bedsmp через Minecraft-плагин, чтобы
переносить деньги между игровой экономикой и банком.

## Структура репозитория

- `backend/` — Node.js/Express API + Cloud Firestore. Хранит пользователей,
  балансы, транзакции, коды привязки Minecraft-аккаунтов. Работает и как
  обычный сервер (`server.js`), и как Netlify Function (`netlify/functions/api.js`).
- `frontend/` — статический сайт (HTML/CSS/JS, тёмная имперская тема).
- `plugin/` — Java-плагин для Paper/Spigot-сервера Bedsmp. Даёт команду
  `/bank link|balance|deposit|withdraw`, ходит в backend по HTTP.
- `netlify.toml` — конфигурация деплоя фронтенда и backend'а на Netlify.

## Как это работает

1. Игрок регистрируется на сайте (ник + пароль) — получает банковский счёт
   с балансом 0 EMP.
2. В личном кабинете нажимает «Получить код привязки» — код живёт 10 минут.
3. На сервере Bedsmp вводит `/bank link <код>` — плагин отправляет UUID и
   ник игрока в backend, привязка сохраняется в Firestore.
4. После привязки: `/bank balance`, `/bank deposit <сумма>` (переносит деньги
   из игровой экономики Vault в банк), `/bank withdraw <сумма>` (обратно).
5. На сайте — переводы между игроками, история операций, для админов —
   эмиссия/списание монет и заморозка счетов.

## 1. Создать проект Firebase (один раз)

1. Зайдите на https://console.firebase.google.com, создайте проект.
2. В нём включите **Firestore Database** (раздел Build -> Firestore Database
   -> Create database, режим "Production" подходит).
3. Project settings -> Service accounts -> "Generate new private key" —
   скачается JSON-файл. Его содержимое (весь JSON целиком, в одну строку)
   и есть значение `FIREBASE_SERVICE_ACCOUNT_JSON` из `.env.example`.
   Никогда не коммитьте этот файл в git.

## 2. Backend локально

```bash
cd backend
npm install
cp .env.example .env
# впишите в .env: JWT_SECRET, PLUGIN_API_KEY (любые случайные строки,
# например из `openssl rand -hex 32`) и FIREBASE_SERVICE_ACCOUNT_JSON
npm start
```

Сервер поднимется на `http://localhost:3000` и раздаёт фронтенд из `frontend/`.

### Локально без реального Firebase-проекта (эмулятор)

```bash
npx firebase-tools emulators:start --only firestore   # в отдельном терминале
```

В `.env` вместо `FIREBASE_SERVICE_ACCOUNT_JSON` укажите:
```
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_PROJECT_ID=emperator-bank-dev
```
Данные при этом хранятся только в памяти эмулятора и пропадают при его
остановке — удобно для разработки, не для продакшена.

### Сделать пользователя администратором

```bash
node scripts/make-admin.js <username>
```

### API

- `POST /api/auth/register`, `POST /api/auth/login`
- `GET /api/bank/me`, `GET /api/bank/transactions`, `POST /api/bank/transfer`,
  `POST /api/bank/link-code` — требуют `Authorization: Bearer <JWT>`
- `GET /api/admin/users`, `GET /api/admin/transactions`, `POST /api/admin/mint`,
  `POST /api/admin/burn`, `POST /api/admin/freeze/:id`,
  `POST /api/admin/unfreeze/:id` — только admin
- `POST /api/plugin/link`, `GET /api/plugin/balance/:mcUuid`,
  `POST /api/plugin/deposit`, `POST /api/plugin/withdraw` — требуют
  `Authorization: Bearer <PLUGIN_API_KEY>`, вызываются плагином, а не браузером

## 3. Деплой на Netlify

Репозиторий уже настроен под Netlify (`netlify.toml`): фронтенд раздаётся
как статика, backend превращается в одну Netlify Function
(`backend/netlify/functions/api.js`), `/api/*` редиректится на неё.

1. На https://app.netlify.com -> Add new site -> Import an existing project,
   выберите этот репозиторий.
2. Netlify сам подхватит `netlify.toml` (base: `backend`, публикует `frontend/`,
   функции из `backend/netlify/functions`).
3. Site settings -> Environment variables — добавьте те же переменные, что
   в `backend/.env.example`: `JWT_SECRET`, `PLUGIN_API_KEY`,
   `FIREBASE_SERVICE_ACCOUNT_JSON` (весь JSON сервисного аккаунта одной строкой).
4. Задеплойте. Сайт будет на `https://<ваш-сайт>.netlify.app`, API — на
   `https://<ваш-сайт>.netlify.app/api/...`.

Перед первым реальным деплоем стоит проверить редиректы локально командой
`netlify dev` (пакет `netlify-cli`) — поведение обрезания пути у Netlify
Functions иногда отличается между версиями, `netlify dev` покажет это сразу.

## 4. Minecraft-плагин

```bash
cd plugin
mvn package
```

Готовый `emperator-bank-plugin.jar` появится в `plugin/target/`. Положите его
на сервер Bedsmp в папку `plugins/`, запустите сервер один раз, чтобы
создался `plugins/EmperatorBank/config.yml`, впишите туда `api-base-url`
(например `https://<ваш-сайт>.netlify.app/api/plugin`) и `api-key` (тот же
`PLUGIN_API_KEY`, что в переменных окружения backend). Для депозитов/выводов
в игровую валюту нужен установленный Vault и любой экономический плагин
(например EssentialsX).

## Дальнейшие шаги (не реализовано)

- Интеграция с реальными деньгами (фиат/криптовалюта) — сейчас EMP только
  внутренняя валюта банка, эмитируемая администратором. Когда определитесь
  с платёжным провайдером, добавим отдельный модуль обмена EMP ↔ реальные
  деньги поверх текущей коллекции транзакций.
- Восстановление пароля, 2FA.
- Правила безопасности Firestore (сейчас доступ к базе идёт только через
  backend с firebase-admin, который их игнорирует — это ок, пока к базе
  никто не обращается напрямую из браузера).
