// Инициализация Firebase (модульный SDK с CDN, без сборщика).
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

// Для локальной разработки: открой страницу с ?emulator — подключится Firebase Emulator Suite.
const useEmulator = new URLSearchParams(location.search).has("emulator");
const config = useEmulator ? { apiKey: "demo", projectId: "demo-emperator", authDomain: location.hostname } : firebaseConfig;

export const isConfigured = typeof config.apiKey === "string" && !config.apiKey.startsWith("ВСТАВЬ");

export const app = isConfigured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

if (auth) auth.languageCode = "ru";
if (useEmulator) {
  connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, location.hostname, 8085);
}
