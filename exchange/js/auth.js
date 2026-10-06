// Авторизация: email/пароль и Google. Новому юзеру — 10 000 виртуальных USDT.
import {
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  sendPasswordResetEmail, updateProfile, signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  doc, runTransaction, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";

export const START_USDT = 10000;

// ───────── состояние сессии ─────────
const session = { user: null, profile: null, ready: false };
const listeners = new Set();
let unsubProfile = null;
let registering = null; // промис регистрации — чтобы ник из формы не перетёрся

export const getSession = () => session;
export function onSession(cb) {
  listeners.add(cb);
  if (session.ready) cb(session);
  return () => listeners.delete(cb);
}
const emit = () => listeners.forEach((cb) => cb(session));

export function initAuth() {
  getRedirectResult(auth).catch(() => {});
  onAuthStateChanged(auth, async (user) => {
    unsubProfile?.();
    unsubProfile = null;
    session.user = user;
    session.profile = null;

    if (!user) {
      session.ready = true;
      return emit();
    }
    try {
      if (registering) await registering.catch(() => {});
      await ensureUserDoc(user);
    } catch (e) {
      console.error("Не удалось создать профиль", e);
    }
    unsubProfile = onSnapshot(doc(db, "users", user.uid), (snap) => {
      session.profile = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      session.ready = true;
      emit();
    }, (e) => {
      console.error(e);
      session.ready = true;
      emit();
    });
  });
}

// ───────── профиль + стартовый баланс (атомарно) ─────────
export function cleanNick(raw) {
  const n = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 20);
  return n.length >= 2 ? n : `trader${Math.floor(1000 + Math.random() * 9000)}`;
}

async function ensureUserDoc(user, nick) {
  const userRef = doc(db, "users", user.uid);
  const usdtRef = doc(db, "users", user.uid, "balances", "USDT");
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    if (snap.exists()) return;
    const name = cleanNick(nick || user.displayName || (user.email || "").split("@")[0]);
    tx.set(userRef, {
      nick: name,
      createdAt: serverTimestamp(),
      portfolioValue: START_USDT,
      updatedAt: serverTimestamp(),
    });
    tx.set(usdtRef, { amount: START_USDT, locked: 0, avgPrice: 1, updatedAt: serverTimestamp() });
  });
}

// ───────── действия ─────────
export function register(nick, email, password) {
  registering = (async () => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const name = cleanNick(nick);
    await updateProfile(cred.user, { displayName: name });
    await ensureUserDoc(cred.user, name);
  })();
  return registering.finally(() => { registering = null; });
}

export const login = (email, password) => signInWithEmailAndPassword(auth, email, password);

export async function loginGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    // На некоторых телефонах попапы блокируются — переходим на редирект.
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      return signInWithRedirect(auth, provider);
    }
    throw e;
  }
}

export const resetPassword = (email) => sendPasswordResetEmail(auth, email);
export const logout = () => signOut(auth);

// ───────── понятные ошибки ─────────
const ERRORS = {
  "auth/invalid-email": "Некорректный email",
  "auth/missing-email": "Введи email",
  "auth/missing-password": "Введи пароль",
  "auth/weak-password": "Пароль слишком простой — минимум 6 символов",
  "auth/email-already-in-use": "Этот email уже зарегистрирован — попробуй войти",
  "auth/invalid-credential": "Неверный email или пароль",
  "auth/wrong-password": "Неверный email или пароль",
  "auth/user-not-found": "Такого аккаунта нет",
  "auth/too-many-requests": "Слишком много попыток. Подожди немного",
  "auth/network-request-failed": "Нет соединения с интернетом",
  "auth/popup-closed-by-user": "Окно входа закрыто",
  "auth/cancelled-popup-request": "Окно входа закрыто",
  "auth/unauthorized-domain": "Домен не добавлен в Firebase → Authentication → Settings → Authorized domains",
  "auth/operation-not-allowed": "Этот способ входа не включён в Firebase Console",
};
export const authError = (e) => ERRORS[e?.code] || "Что-то пошло не так. Попробуй ещё раз";
