// ============================================================
//  Badchat — конфигурация
//  Заполни значения ниже данными из своей консоли Firebase
//  (Project settings → General → Your apps → Web app → SDK setup)
// ============================================================

export const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT.firebaseapp.com",
  projectId: "PASTE_PROJECT",
  storageBucket: "PASTE_PROJECT.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
};

// ============================================================
//  Cloudinary — хранилище фото и голосовых (бесплатный тариф)
//  Dashboard → Cloud name
//  Settings → Upload → Upload presets → Add → Signing mode: Unsigned
// ============================================================

export const cloudinaryConfig = {
  cloudName: "PASTE_CLOUD_NAME",
  uploadPreset: "badchat_unsigned",
  // Папка внутри Cloudinary (необязательно)
  folder: "badchat",
};

// Фон приложения. Можно заменить на свою картинку (положи в badchat/ и
// укажи, например, "./bg.jpg"). Главное — тёмная и не пёстрая.
export const backgroundImage =
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=70";
