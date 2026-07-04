/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Конфигурация Firebase.

   Чтобы включить аккаунты, таблицу лидеров, аукцион и админ-панель:
   1. Зайди на https://console.firebase.google.com/ и создай проект.
   2. В разделе Build → Authentication включи способ входа
      "Email/Password".
   3. В разделе Build → Firestore Database создай базу (Production
      mode подойдёт, правила ниже).
   4. В настройках проекта (⚙ → Project settings → General →
      Your apps → Web app "</>") создай веб-приложение и скопируй
      сюда объект конфигурации.
   5. В Firestore → Rules вставь правила из README.md этого проекта.

   Пока здесь стоят заглушки — игра работает полностью офлайн
   (без аккаунтов, лидеров и аукциона), остальной функционал не
   страдает.
   ========================================================= */

window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA0MxwYUUa9uHvOsIp7noBtgVESVAvmUUE',
  authDomain: 'lifegame-defd1.firebaseapp.com',
  projectId: 'lifegame-defd1',
  storageBucket: 'lifegame-defd1.firebasestorage.app',
  messagingSenderId: '432652694530',
  appId: '1:432652694530:web:d4160ee4f6deb05442231b',
};
