# Badchat

Мессенджер-PWA: личные и групповые чаты, фото, голосовые, статусы «онлайн», галочки прочтения,
«печатает…», ответы и удаление своих сообщений. Ставится на телефон как обычное приложение.

**Стек:** чистые HTML/CSS/JS · Firebase Auth + Firestore · Cloudinary (фото и голосовые).

```
badchat/
├── index.html          разметка всех экранов
├── style.css           тёмная тема, матовое стекло (blur 5px)
├── app.js              вся логика
├── firebase-config.js  ← сюда вставляешь свои ключи
├── manifest.json       PWA-манифест
├── sw.js               service worker (офлайн-оболочка)
├── firestore.rules     правила доступа
├── firebase.json       конфиг Firebase Hosting
└── icons/              иконки приложения
```

---

## 1. Firebase

1. https://console.firebase.google.com → **Add project** (Google Analytics можно выключить).
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
3. **Build → Firestore Database → Create database → Production mode**, регион — ближе к игрокам
   (`europe-west3` — Франкфурт).
4. **Project settings (шестерёнка) → General → Your apps → Web (`</>`)** → назови «Badchat» →
   скопируй объект `firebaseConfig`.
5. Вставь его в `badchat/firebase-config.js` вместо `PASTE_...`.
6. **Project settings → General → Authorized domains** (вкладка Authentication → Settings):
   убедись, что там есть домен, с которого открываешь приложение.

Индексы заводить не нужно — все запросы однополевые.

## 2. Cloudinary (фото и голосовые)

1. https://cloudinary.com → бесплатный аккаунт.
2. **Dashboard → Cloud name** — скопируй.
3. **Settings → Upload → Upload presets → Add upload preset**:
   - Preset name: `badchat_unsigned`
   - Signing mode: **Unsigned**
   - Folder: `badchat` (необязательно)
   - Save.
4. Впиши `cloudName` и `uploadPreset` в `firebase-config.js`.

> Unsigned-пресет позволяет загружать файлы без секретного ключа — это нормально для клиентского
> приложения. В настройках пресета можно ограничить размер и типы файлов.

## 3. Правила доступа

```bash
npm install -g firebase-tools
firebase login
cd badchat
firebase use --add            # выбери свой проект
firebase deploy --only firestore:rules
```

Либо скопируй содержимое `firestore.rules` в консоли: **Firestore Database → Rules → Publish**.

Что делают правила:

- профиль читает любой авторизованный, а меняет только владелец (`uid` и `username` неизменны);
- чат и его сообщения видят и пишут только участники;
- удалять и править сообщение может только автор;
- из чата нельзя выкинуть других участников, а тип чата и создателя нельзя подменить;
- всё, что не описано явно, закрыто.

## 4. Деплой на Firebase Hosting

```bash
cd badchat
firebase deploy --only hosting
```

Если проект ещё не инициализирован в этой папке:

```bash
cd badchat
firebase init hosting
# Public directory: .
# Single-page app: Yes
# Не перезаписывать index.html!
firebase deploy
```

Получишь адрес вида `https://ТВОЙ-ПРОЕКТ.web.app`.

**Установка на телефон:** открыть адрес в Chrome → меню → «Установить приложение».
На iPhone: Safari → «Поделиться» → «На экран Домой».

> PWA требует HTTPS. Локально работает `http://localhost` (`python3 -m http.server 5173`),
> но микрофон и установка на телефоне — только по HTTPS.

## 5. Как устроены данные

```
users/{uid}                 uid, username, name, avatar, online, lastSeen, createdAt
usernames/{username}        uid                         ← занятые ники
chats/{chatId}              type: private|group, members[], name, avatar, owner,
                            createdBy, createdAt, updatedAt,
                            lastMessage {text,type,senderId,at},
                            read {uid: время прочтения},   ← галочки
                            typing {uid: метка времени}    ← «печатает…»
chats/{chatId}/messages/{id} senderId, type: text|image|voice, text, url, duration,
                            replyTo {id,name,preview}, createdAt
```

`chatId` личного чата — это два uid, отсортированные и склеенные через `__`, поэтому дубли
чатов невозможны.

## 6. Безопасность текста

Весь пользовательский текст проходит через `esc()` перед вставкой в HTML, а ссылки на медиа —
через `safeUrl()` (пропускаются только `http`/`https`). Так что ни `<script>` в сообщении,
ни `javascript:` в аватарке не сработают.
