# Emperator Exchange — симулятор криптобиржи

Виртуальные деньги, живые цены Binance. Никаких реальных платежей.

## Подключение Firebase (один раз)

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. **Build → Authentication → Get started → Sign-in method**: включи **Email/Password** и **Google**.
3. **Authentication → Settings → Authorized domains**: добавь `somtakfan-arch.github.io`.
4. **Build → Firestore Database → Create database** (production mode, любой регион).
5. **Firestore → Rules**: вставь целиком `firestore.rules` → **Publish**.
6. **Project settings → General → Your apps → Web (`</>`)**: зарегистрируй приложение,
   скопируй `firebaseConfig` в `firebase-config.js`.

## Локальный запуск

```bash
npx http-server -c-1 .   # из корня репо, открыть /exchange/
```

С эмулятором Firebase: `firebase emulators:start --only auth,firestore`
(порты 9099 и 8085) и открыть `/exchange/?emulator`.
