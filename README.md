# Remindly

Напоминалка в виде PWA (Progressive Web App): маркетинговый лендинг + рабочее MVP-приложение в одном Next.js-проекте. Тёмная тема, градиентные обложки категорий и анимация лайка вдохновлены Яндекс Музыкой.

## Структура

- `app/page.tsx` — лендинг (hero, фичи, живое демо, установка)
- `app/app/*` — само приложение (Сегодня / Все / Избранное / Профиль), состояние хранится в `localStorage`
- `lib/AppDataContext.tsx` — внешний store напоминаний (`useSyncExternalStore`)
- `app/manifest.ts`, `public/sw.js` — PWA-манифест и service worker для установки на телефон

## Разработка

```bash
npm install
npm run dev
```

Открыть `http://localhost:3000` для лендинга, `http://localhost:3000/app` — для приложения.

```bash
npm run build   # production-сборка
npm run lint    # eslint + React Compiler проверки
```

## Важно

Это PWA, а не нативное iOS/Android-приложение — оно не публикуется в App Store или Google Play напрямую, но устанавливается на домашний экран телефона и работает офлайн. Публикация в сторах и попадание в топ потребуют отдельного нативного билда, ASO и роста удержания пользователей.
