# Bed Exchange — симулятор криптобиржи

Виртуальные деньги, живые цены Binance. Никаких реальных платежей, пополнений и выводов.

## Подключение Firebase (один раз)

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. **Build → Authentication → Get started → Sign-in method**: включи **Email/Password** и **Google**.
3. **Authentication → Settings → Authorized domains**: добавь `somtakfan-arch.github.io`.
4. **Build → Firestore Database → Create database** (production mode, любой регион).
5. **Firestore → Rules**: вставь целиком `firestore.rules` → **Publish**.
6. **Project settings → General → Your apps → Web (`</>`)**: зарегистрируй приложение,
   скопируй `firebaseConfig` в `firebase-config.js`.

Индексы создавать не нужно — все запросы работают на автоматических.

## Как устроено

| Файл | Что делает |
|---|---|
| `js/market.js` | Цены (`miniTicker`), стакан (`depth20@100ms`), свечи (`klines`). Если WebSocket молчит — опрос REST Binance, если Binance недоступен совсем — CoinGecko |
| `js/store.js` | Балансы и открытые ордера юзера в реальном времени, синхронизация стоимости портфеля для рейтинга |
| `js/trade.js` | Рыночные и лимитные ордера, отмена, исполнение лимиток. Всё — `runTransaction` |
| `js/views/*` | Экраны: вход, рынки, торговля, кошелёк, история, рейтинг |

Правила игры:
- старт — 10 000 USDT; комиссия 0,1% (при покупке — в монете, при продаже — в USDT);
- минимальная сделка — 1 USDT;
- лимитный ордер замораживает средства (`locked`), отмена размораживает;
- лимитка исполняется на клиенте, пока открыта вкладка. При следующем входе
  по свечам проверяется, не дошла ли цена до уровня, пока тебя не было;
- лимитка на покупку выше рынка исполняется сразу по рыночной цене (как на настоящей бирже).

Ограничение: без серверного кода (Cloud Functions) правила не могут проверить, что цена
в сделке настоящая — технически подкованный игрок может накрутить баланс через консоль.
Для симулятора это нормально.

## Локальный запуск

```bash
npx http-server -c-1 .   # из корня репо, открыть /exchange/
```

С эмулятором Firebase: `firebase emulators:start --only auth,firestore`
(порты 9099 и 8085) и открыть `/exchange/?emulator`.
