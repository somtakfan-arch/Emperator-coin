// ============================================================
//  Badchat — мессенджер на Firebase + Cloudinary
//  Чистый JS, без фреймворков. Модульный Firebase SDK с CDN.
// ============================================================

import { firebaseConfig, cloudinaryConfig, backgroundImage } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc,
  collection, query, where, orderBy, limit, limitToLast, onSnapshot,
  serverTimestamp, runTransaction, getDocs, arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ------------------------------------------------------------
//  Утилиты
// ------------------------------------------------------------

const $ = (id) => document.getElementById(id);

/** Экранирование — всё, что пришло от пользователя, проходит через это. */
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Разрешаем только http(s) ссылки на картинки/аудио (защита от javascript:). */
function safeUrl(url) {
  const s = String(url ?? "");
  return /^https?:\/\//i.test(s) ? esc(s) : "";
}

const DEFAULT_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
       <rect width="64" height="64" rx="32" fill="#1b2433"/>
       <circle cx="32" cy="25" r="11" fill="#43536b"/>
       <path d="M10 60c3-13 11-19 22-19s19 6 22 19z" fill="#43536b"/>
     </svg>`
  );

const avatarOf = (u) => (u && u.avatar ? safeUrl(u.avatar) || DEFAULT_AVATAR : DEFAULT_AVATAR);

function toast(text, ms = 2600) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

const toDate = (ts) => (ts && typeof ts.toDate === "function" ? ts.toDate() : ts instanceof Date ? ts : null);

function timeStr(date) {
  if (!date) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function dayStr(date) {
  const now = new Date();
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function listTimeStr(date) {
  if (!date) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return timeStr(date);
  if ((now - date) / 86400000 < 7) return date.toLocaleDateString("ru-RU", { weekday: "short" });
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function lastSeenStr(user) {
  if (!user) return "";
  if (isOnline(user)) return "в сети";
  const d = toDate(user.lastSeen);
  if (!d) return "был(а) давно";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "был(а) только что";
  if (mins < 60) return `был(а) ${mins} мин назад`;
  if (d.toDateString() === new Date().toDateString()) return `был(а) в ${timeStr(d)}`;
  return `был(а) ${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}`;
}

const ONLINE_WINDOW = 70_000; // считаем онлайн, если heartbeat свежее 70 сек
function isOnline(user) {
  if (!user || !user.online) return false;
  const d = toDate(user.lastSeen);
  return !!d && Date.now() - d.getTime() < ONLINE_WINDOW;
}

function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function authErrorText(code) {
  const map = {
    "auth/invalid-email": "Некорректный email",
    "auth/email-already-in-use": "Этот email уже зарегистрирован",
    "auth/weak-password": "Пароль слишком простой (минимум 6 символов)",
    "auth/invalid-credential": "Неверный email или пароль",
    "auth/wrong-password": "Неверный пароль",
    "auth/user-not-found": "Пользователь не найден",
    "auth/too-many-requests": "Слишком много попыток, подожди немного",
    "auth/network-request-failed": "Нет связи с сервером",
  };
  return map[code] || "Что-то пошло не так. Попробуй ещё раз.";
}

// ------------------------------------------------------------
//  Cloudinary — загрузка файлов (unsigned)
// ------------------------------------------------------------

async function uploadToCloudinary(file, kind = "image") {
  if (!cloudinaryConfig.cloudName || cloudinaryConfig.cloudName.startsWith("PASTE")) {
    throw new Error("Cloudinary не настроен: заполни cloudName и uploadPreset в firebase-config.js");
  }
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", cloudinaryConfig.uploadPreset);
  if (cloudinaryConfig.folder) form.append("folder", cloudinaryConfig.folder);

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/auto/upload`;
  const res = await fetch(endpoint, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.secure_url) {
    throw new Error(data?.error?.message || "Не удалось загрузить файл");
  }
  return { url: data.secure_url, duration: data.duration || 0, kind };
}

/** Уменьшенная версия картинки через Cloudinary-трансформации. */
function thumb(url, w = 480) {
  return url.includes("/upload/") ? url.replace("/upload/", `/upload/c_limit,w_${w},q_auto,f_auto/`) : url;
}

// ------------------------------------------------------------
//  Состояние
// ------------------------------------------------------------

const state = {
  user: null,          // firebase auth user
  me: null,            // профиль из Firestore
  chats: [],           // список чатов
  chatId: null,        // открытый чат
  chat: null,          // документ открытого чата
  messages: [],
  profiles: new Map(), // uid -> профиль (кэш + подписки)
  replyTo: null,
  groupDraft: { members: new Map(), avatar: "" },
  unsub: { chats: null, messages: null, chat: null, profiles: new Map() },
  typingSentAt: 0,
};

function profileOf(uid) {
  return state.profiles.get(uid) || null;
}

/** Подписка на профиль (для онлайн-статусов и аватарок). */
function watchProfile(uid) {
  if (!uid || state.unsub.profiles.has(uid)) return;
  const un = onSnapshot(doc(db, "users", uid), (snap) => {
    if (snap.exists()) {
      state.profiles.set(uid, { uid, ...snap.data() });
      renderChatList();
      if (state.chat) renderChatHeader();
    }
  }, () => {});
  state.unsub.profiles.set(uid, un);
}

// ============================================================
//  ШАГ 1. Авторизация и профили
// ============================================================

const authScreen = $("authScreen");
const appScreen = $("appScreen");

function showAuthError(text) {
  const box = $("authError");
  box.textContent = text;
  box.hidden = !text;
}

// переключение вкладок вход/регистрация
document.querySelectorAll("[data-authtab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-authtab]").forEach((t) => t.classList.toggle("active", t === tab));
    const isLogin = tab.dataset.authtab === "login";
    $("loginForm").hidden = !isLogin;
    $("registerForm").hidden = isLogin;
    showAuthError("");
  });
});

const normUsername = (v) => String(v || "").trim().toLowerCase().replace(/^@/, "");

// живая проверка занятости юзернейма
let usernameCheckTimer = null;
$("regUsername").addEventListener("input", (e) => {
  const value = normUsername(e.target.value);
  const hint = $("usernameHint");
  hint.className = "hint";
  clearTimeout(usernameCheckTimer);
  if (!/^[a-z0-9_]{3,20}$/.test(value)) {
    hint.textContent = "3–20 символов: латиница, цифры, _";
    return;
  }
  hint.textContent = "Проверяем…";
  usernameCheckTimer = setTimeout(async () => {
    try {
      const snap = await getDoc(doc(db, "usernames", value));
      hint.textContent = snap.exists() ? `@${value} уже занят` : `@${value} свободен`;
      hint.classList.add(snap.exists() ? "bad" : "good");
    } catch {
      hint.textContent = "";
    }
  }, 450);
});

// --- вход ---
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  showAuthError("");
  const btn = e.target.querySelector("button");
  btn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, $("loginEmail").value.trim(), $("loginPassword").value);
  } catch (err) {
    showAuthError(authErrorText(err.code));
  } finally {
    btn.disabled = false;
  }
});

// --- регистрация ---
$("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  showAuthError("");
  const username = normUsername($("regUsername").value);
  const name = $("regName").value.trim();

  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return showAuthError("Юзернейм: 3–20 символов, латиница, цифры и _");
  }
  if (!name) return showAuthError("Впиши имя");

  const btn = e.target.querySelector("button");
  btn.disabled = true;
  try {
    const taken = await getDoc(doc(db, "usernames", username));
    if (taken.exists()) throw new Error(`@${username} уже занят`);

    const cred = await createUserWithEmailAndPassword(
      auth, $("regEmail").value.trim(), $("regPassword").value
    );
    const uid = cred.user.uid;

    // Транзакция: ник занимаем и профиль создаём атомарно.
    await runTransaction(db, async (tx) => {
      const ref = doc(db, "usernames", username);
      const snap = await tx.get(ref);
      if (snap.exists()) throw new Error(`@${username} уже занят`);
      tx.set(ref, { uid, createdAt: serverTimestamp() });
      tx.set(doc(db, "users", uid), {
        uid,
        username,
        name,
        avatar: "",
        online: true,
        lastSeen: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    showAuthError(err.code ? authErrorText(err.code) : err.message);
  } finally {
    btn.disabled = false;
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await setOffline();
  await signOut(auth);
  closeModals();
});

// --- реакция на смену состояния авторизации ---
onAuthStateChanged(auth, async (user) => {
  teardown();
  state.user = user || null;

  if (!user) {
    state.me = null;
    authScreen.hidden = false;
    appScreen.hidden = true;
    return;
  }

  const meSnap = await getDoc(doc(db, "users", user.uid));
  if (!meSnap.exists()) {
    // аккаунт есть, а профиля нет (например, прервалась регистрация)
    showAuthError("Профиль не найден. Зарегистрируйся заново или напиши администратору.");
    await signOut(auth);
    return;
  }

  authScreen.hidden = true;
  appScreen.hidden = false;
  showAuthError("");

  // свой профиль держим в реальном времени
  state.unsub.profiles.set(user.uid, onSnapshot(doc(db, "users", user.uid), (snap) => {
    if (!snap.exists()) return;
    state.me = { uid: user.uid, ...snap.data() };
    state.profiles.set(user.uid, state.me);
    renderMe();
  }));

  startPresence();
  subscribeChats();
});

function renderMe() {
  if (!state.me) return;
  $("myAvatar").src = avatarOf(state.me);
  $("myUsername").textContent = "@" + (state.me.username || "");
  $("profileAvatar").src = avatarOf(state.me);
  $("profileName").value = state.me.name || "";
  $("profileUsername").value = "@" + (state.me.username || "");
}

/** Сбрасываем подписки при выходе. */
function teardown() {
  Object.values(state.unsub).forEach((u) => { if (typeof u === "function") u(); });
  state.unsub.profiles.forEach((u) => u());
  state.unsub = { chats: null, messages: null, chat: null, profiles: new Map() };
  stopPresence();
  state.chats = [];
  state.chatId = null;
  state.chat = null;
  state.messages = [];
  state.profiles.clear();
  $("chatList").innerHTML = "";
  $("messages").innerHTML = "";
  $("chatInner").hidden = true;
  $("chatPlaceholder").hidden = false;
  appScreen.classList.remove("show-chat");
}

// ------------------------------------------------------------
//  Присутствие: онлайн / был в сети
// ------------------------------------------------------------

let presenceTimer = null;

async function heartbeat(online = true) {
  if (!state.user) return;
  try {
    await updateDoc(doc(db, "users", state.user.uid), { online, lastSeen: serverTimestamp() });
  } catch { /* офлайн — не страшно */ }
}

function startPresence() {
  heartbeat(true);
  presenceTimer = setInterval(() => {
    if (document.visibilityState === "visible") heartbeat(true);
  }, 45_000);
}

function stopPresence() {
  clearInterval(presenceTimer);
  presenceTimer = null;
}

const setOffline = () => heartbeat(false);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") heartbeat(true);
  else setOffline();
});
window.addEventListener("pagehide", setOffline);

// ------------------------------------------------------------
//  Профиль: имя и аватар
// ------------------------------------------------------------

$("myAvatarBtn").addEventListener("click", () => openModal("profileModal"));

$("profileAvatarInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    toast("Загружаем аватар…");
    const { url } = await uploadToCloudinary(file, "image");
    await updateDoc(doc(db, "users", state.user.uid), { avatar: thumb(url, 256) });
    toast("Аватар обновлён");
  } catch (err) {
    toast(err.message);
  }
});

$("profileSave").addEventListener("click", async () => {
  const name = $("profileName").value.trim();
  if (!name) return toast("Имя не может быть пустым");
  await updateDoc(doc(db, "users", state.user.uid), { name });
  toast("Сохранено");
  closeModals();
});

// ============================================================
//  Модалки
// ============================================================

function openModal(id) {
  $("modalRoot").hidden = false;
  ["profileModal", "groupModal", "infoModal"].forEach((m) => { $(m).hidden = m !== id; });
}
function closeModals() {
  $("modalRoot").hidden = true;
  ["profileModal", "groupModal", "infoModal"].forEach((m) => { $(m).hidden = true; });
}
document.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModals));
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("lightbox").hidden) return ($("lightbox").hidden = true);
  if (!$("modalRoot").hidden) return closeModals();
});

$("lightbox").addEventListener("click", () => { $("lightbox").hidden = true; });

// ============================================================
//  ШАГ 2. Список чатов, поиск людей, личные чаты
// ============================================================

function subscribeChats() {
  // Без orderBy — сортируем на клиенте, чтобы не заводить составной индекс.
  const q = query(collection(db, "chats"), where("members", "array-contains", state.user.uid), limit(100));
  state.unsub.chats = onSnapshot(q, (snap) => {
    state.chats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.chats.forEach((c) => (c.members || []).forEach(watchProfile));
    state.chats.sort((a, b) => {
      const ta = toDate(a.updatedAt)?.getTime() || 0;
      const tb = toDate(b.updatedAt)?.getTime() || 0;
      return tb - ta;
    });
    renderChatList();
  }, (err) => toast("Чаты не загрузились: " + err.message));
}

/** Заголовок и аватар чата с точки зрения текущего пользователя. */
function chatView(chat) {
  if (chat.type === "group") {
    return {
      title: chat.name || "Группа",
      avatar: chat.avatar ? safeUrl(chat.avatar) || DEFAULT_AVATAR : DEFAULT_AVATAR,
      subtitle: `${(chat.members || []).length} участников`,
      online: false,
      peer: null,
    };
  }
  const peerId = (chat.members || []).find((m) => m !== state.user.uid);
  const peer = profileOf(peerId);
  return {
    title: peer ? peer.name || "@" + peer.username : "Пользователь",
    avatar: avatarOf(peer),
    subtitle: peer ? lastSeenStr(peer) : "",
    online: isOnline(peer),
    peer,
  };
}

function lastMessagePreview(chat) {
  const lm = chat.lastMessage;
  if (!lm) return "Нет сообщений";
  const who = lm.senderId === state.user.uid ? "Вы: " : chat.type === "group" ? (profileOf(lm.senderId)?.name || "") + ": " : "";
  let body = lm.text || "";
  if (lm.type === "image") body = "📷 Фото";
  if (lm.type === "voice") body = "🎤 Голосовое";
  return who + body;
}

function isUnread(chat) {
  const lm = chat.lastMessage;
  if (!lm || lm.senderId === state.user.uid) return false;
  const lmAt = toDate(lm.at)?.getTime() || 0;
  const readAt = toDate(chat.read?.[state.user.uid])?.getTime() || 0;
  return lmAt > readAt;
}

function renderChatList() {
  if (!state.user) return;
  const box = $("chatList");
  const html = state.chats.map((chat) => {
    const v = chatView(chat);
    const time = listTimeStr(toDate(chat.updatedAt));
    const unread = isUnread(chat) && chat.id !== state.chatId;
    return `
      <button class="row ${chat.id === state.chatId ? "active" : ""}" data-chat="${esc(chat.id)}" type="button">
        <span class="avatar-wrap">
          <img class="av" src="${v.avatar}" alt="" />
          ${v.online ? '<span class="dot-online"></span>' : ""}
        </span>
        <span class="row-main">
          <span class="row-top"><strong>${esc(v.title)}</strong><span class="row-time">${esc(time)}</span></span>
          <span class="row-sub">${esc(lastMessagePreview(chat))}${unread ? '<span class="badge">•</span>' : ""}</span>
        </span>
      </button>`;
  }).join("");
  box.innerHTML = html;
  $("chatListEmpty").hidden = state.chats.length > 0;
  box.querySelectorAll("[data-chat]").forEach((el) =>
    el.addEventListener("click", () => openChat(el.dataset.chat))
  );
}

// ------------------------------------------------------------
//  Поиск людей по юзернейму
// ------------------------------------------------------------

async function searchUsers(text) {
  const q = normUsername(text);
  if (q.length < 2) return [];
  const snap = await getDocs(query(
    collection(db, "users"),
    where("username", ">=", q),
    where("username", "<=", q + ""),
    limit(15)
  ));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((u) => u.uid !== state.user.uid);
}

function renderUserRows(container, users, onPick, emptyText = "Никого не нашли") {
  if (!users.length) {
    container.innerHTML = `<p class="empty">${esc(emptyText)}</p>`;
    return;
  }
  container.innerHTML = users.map((u) => `
    <button class="row" data-uid="${esc(u.uid)}" type="button">
      <span class="avatar-wrap">
        <img class="av" src="${avatarOf(u)}" alt="" />
        ${isOnline(u) ? '<span class="dot-online"></span>' : ""}
      </span>
      <span class="row-main">
        <span class="row-top"><strong>${esc(u.name || "Без имени")}</strong></span>
        <span class="row-sub">@${esc(u.username || "")}</span>
      </span>
    </button>`).join("");
  container.querySelectorAll("[data-uid]").forEach((el) =>
    el.addEventListener("click", () => onPick(users.find((u) => u.uid === el.dataset.uid)))
  );
}

let searchTimer = null;
$("searchInput").addEventListener("input", (e) => {
  const text = e.target.value.trim();
  clearTimeout(searchTimer);
  if (text.length < 2) {
    $("searchResults").hidden = true;
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const users = await searchUsers(text);
      users.forEach((u) => state.profiles.set(u.uid, u));
      $("searchResults").hidden = false;
      renderUserRows($("searchResults"), users, (user) => {
        $("searchInput").value = "";
        $("searchResults").hidden = true;
        openPrivateChat(user);
      });
    } catch (err) {
      toast("Поиск не сработал: " + err.message);
    }
  }, 300);
});

/** Личный чат: id детерминированный, чтобы не плодить дубли. */
function privateChatId(a, b) {
  return [a, b].sort().join("__");
}

async function openPrivateChat(user) {
  if (!user) return;
  const id = privateChatId(state.user.uid, user.uid);
  const ref = doc(db, "chats", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      type: "private",
      members: [state.user.uid, user.uid].sort(),
      createdBy: state.user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: null,
      read: {},
      typing: {},
    });
  }
  state.profiles.set(user.uid, user);
  watchProfile(user.uid);
  openChat(id);
}

// ============================================================
//  ШАГ 3. Сообщения в реальном времени
// ============================================================

const messagesBox = $("messages");

function openChat(chatId) {
  if (state.chatId === chatId) {
    appScreen.classList.add("show-chat");
    return;
  }
  // отписываемся от прошлого чата
  state.unsub.messages?.();
  state.unsub.chat?.();
  state.unsub.messages = null;
  state.unsub.chat = null;

  state.chatId = chatId;
  state.chat = null;
  state.messages = [];
  clearReply();
  messagesBox.innerHTML = "";

  $("chatPlaceholder").hidden = true;
  $("chatInner").hidden = false;
  appScreen.classList.add("show-chat");
  syncComposerButtons();
  renderChatList();

  state.unsub.chat = onSnapshot(doc(db, "chats", chatId), (snap) => {
    if (!snap.exists()) return;
    state.chat = { id: snap.id, ...snap.data() };
    (state.chat.members || []).forEach(watchProfile);
    renderChatHeader();
    renderMessages();
  });

  const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt"), limitToLast(200));
  state.unsub.messages = onSnapshot(q, (snap) => {
    const atBottom = messagesBox.scrollHeight - messagesBox.scrollTop - messagesBox.clientHeight < 120;
    state.messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderMessages();
    if (atBottom) scrollToBottom();
    markRead();
  }, (err) => toast("Сообщения не загрузились: " + err.message));

  markRead();
}

$("backBtn").addEventListener("click", () => appScreen.classList.remove("show-chat"));

function scrollToBottom(smooth = false) {
  messagesBox.scrollTo({ top: messagesBox.scrollHeight, behavior: smooth ? "smooth" : "auto" });
}

function renderChatHeader() {
  if (!state.chat) return;
  const v = chatView(state.chat);
  $("chatAvatar").src = v.avatar;
  $("chatTitle").textContent = v.title;

  const typers = typingUsers();
  const status = $("chatStatus");
  if (typers.length) {
    status.textContent = state.chat.type === "group"
      ? `${typers.map((u) => u.name || "@" + u.username).join(", ")} печатает…`
      : "печатает…";
    status.className = "muted small status-online";
  } else {
    status.textContent = v.subtitle;
    status.className = "muted small" + (v.online ? " status-online" : "");
  }
}

// ------------------------------------------------------------
//  Отрисовка сообщений
// ------------------------------------------------------------

const TYPING_TTL = 6000;

function typingUsers() {
  const t = state.chat?.typing || {};
  const now = Date.now();
  return Object.entries(t)
    .filter(([uid, at]) => uid !== state.user.uid && now - Number(at || 0) < TYPING_TTL)
    .map(([uid]) => profileOf(uid))
    .filter(Boolean);
}

/** Прочитано ли собеседниками сообщение (для галочек). */
function isReadByOthers(msg) {
  const at = toDate(msg.createdAt)?.getTime();
  if (!at) return false;
  const read = state.chat?.read || {};
  return (state.chat?.members || [])
    .filter((m) => m !== state.user.uid)
    .some((m) => (toDate(read[m])?.getTime() || 0) >= at);
}

function bodyHtml(msg) {
  if (msg.deleted) return `<span class="muted">сообщение удалено</span>`;
  if (msg.type === "image") {
    const url = safeUrl(msg.url);
    if (!url) return "";
    return `<img class="photo" src="${thumb(url, 640)}" data-full="${url}" alt="фото" loading="lazy" />`;
  }
  if (msg.type === "voice") {
    const url = safeUrl(msg.url);
    if (!url) return "";
    return `<audio controls preload="none" src="${url}"></audio>`;
  }
  return esc(msg.text || "");
}

function renderMessages() {
  if (!state.chat) return;
  const me = state.user.uid;
  const isGroup = state.chat.type === "group";
  let lastDay = "";
  let prevSender = null;

  const html = state.messages.map((msg) => {
    const out = msg.senderId === me;
    const date = toDate(msg.createdAt);
    let block = "";

    const day = date ? dayStr(date) : "";
    if (day && day !== lastDay) {
      block += `<div class="day-sep">${esc(day)}</div>`;
      lastDay = day;
      prevSender = null;
    }

    const same = prevSender === msg.senderId;
    prevSender = msg.senderId;

    const author = profileOf(msg.senderId);
    const media = msg.type === "image" || msg.type === "voice";
    const reply = msg.replyTo
      ? `<span class="msg-reply" data-goto="${esc(msg.replyTo.id)}">
           <strong>${esc(msg.replyTo.name || "")}</strong>
           <span>${esc(msg.replyTo.preview || "")}</span>
         </span>`
      : "";

    const ticks = out && !msg.deleted
      ? `<span class="ticks ${isReadByOthers(msg) ? "read" : ""}">${isReadByOthers(msg) ? "✓✓" : "✓"}</span>`
      : "";

    const actions = msg.deleted ? "" : `
      <span class="msg-actions">
        <button type="button" data-reply="${esc(msg.id)}">Ответить</button>
        ${out ? `<button type="button" data-del="${esc(msg.id)}">Удалить</button>` : ""}
      </span>`;

    block += `
      <div class="msg ${out ? "out" : "in"} ${same ? "same" : ""} ${msg.deleted ? "deleted" : ""}" id="m-${esc(msg.id)}">
        <div class="bubble ${media && !msg.deleted ? "media" : ""}">
          ${isGroup && !out && !same ? `<span class="msg-author">${esc(author?.name || "@" + (author?.username || ""))}</span>` : ""}
          ${reply}
          ${bodyHtml(msg)}
          <span class="msg-meta">${esc(timeStr(date))}${ticks}</span>
        </div>
        ${actions}
      </div>`;
    return block;
  }).join("");

  const typers = typingUsers();
  const typingLine = typers.length
    ? `<div class="typing-line">${esc(typers.map((u) => u.name || "@" + u.username).join(", "))} печатает…</div>`
    : "";

  messagesBox.innerHTML = html + typingLine;

  messagesBox.querySelectorAll("[data-full]").forEach((img) =>
    img.addEventListener("click", () => {
      $("lightboxImg").src = img.dataset.full;
      $("lightbox").hidden = false;
    })
  );
  messagesBox.querySelectorAll("[data-reply]").forEach((b) =>
    b.addEventListener("click", () => setReply(b.dataset.reply))
  );
  messagesBox.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => deleteMessage(b.dataset.del))
  );
  messagesBox.querySelectorAll("[data-goto]").forEach((b) =>
    b.addEventListener("click", () => {
      const target = $("m-" + b.dataset.goto);
      if (!target) return toast("Сообщение выше по истории");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("msg-highlight");
      setTimeout(() => target.classList.remove("msg-highlight"), 1300);
    })
  );
}

// ------------------------------------------------------------
//  Прочтение
// ------------------------------------------------------------

async function markRead() {
  if (!state.chatId || !state.user) return;
  if (document.visibilityState !== "visible") return;
  try {
    await updateDoc(doc(db, "chats", state.chatId), {
      [`read.${state.user.uid}`]: serverTimestamp(),
    });
  } catch { /* не критично */ }
}
window.addEventListener("focus", markRead);
messagesBox.addEventListener("scroll", () => {
  if (messagesBox.scrollHeight - messagesBox.scrollTop - messagesBox.clientHeight < 60) markRead();
});

// ------------------------------------------------------------
//  Ответ на сообщение
// ------------------------------------------------------------

function previewOf(msg) {
  if (msg.type === "image") return "📷 Фото";
  if (msg.type === "voice") return "🎤 Голосовое";
  return (msg.text || "").slice(0, 80);
}

function setReply(msgId) {
  const msg = state.messages.find((m) => m.id === msgId);
  if (!msg) return;
  const author = profileOf(msg.senderId);
  state.replyTo = {
    id: msg.id,
    name: msg.senderId === state.user.uid ? "Вы" : author?.name || "@" + (author?.username || ""),
    preview: previewOf(msg),
  };
  $("replyName").textContent = state.replyTo.name;
  $("replyPreview").textContent = state.replyTo.preview;
  $("replyBar").hidden = false;
  $("messageInput").focus();
}

function clearReply() {
  state.replyTo = null;
  $("replyBar").hidden = true;
}
$("replyCancel").addEventListener("click", clearReply);

async function deleteMessage(msgId) {
  const msg = state.messages.find((m) => m.id === msgId);
  if (!msg || msg.senderId !== state.user.uid) return;
  if (!confirm("Удалить сообщение?")) return;
  try {
    await deleteDoc(doc(db, "chats", state.chatId, "messages", msgId));
  } catch (err) {
    toast("Не удалось удалить: " + err.message);
  }
}

// ------------------------------------------------------------
//  Отправка
// ------------------------------------------------------------

async function sendMessage(payload) {
  if (!state.chatId) return;
  const base = {
    senderId: state.user.uid,
    createdAt: serverTimestamp(),
    replyTo: state.replyTo || null,
    ...payload,
  };
  clearReply();
  await addDoc(collection(db, "chats", state.chatId, "messages"), base);
  await updateDoc(doc(db, "chats", state.chatId), {
    updatedAt: serverTimestamp(),
    lastMessage: {
      text: payload.type === "text" ? String(payload.text).slice(0, 120) : "",
      type: payload.type,
      senderId: state.user.uid,
      at: serverTimestamp(),
    },
    [`typing.${state.user.uid}`]: 0,
    [`read.${state.user.uid}`]: serverTimestamp(),
  });
  scrollToBottom(true);
}

const messageInput = $("messageInput");

function syncComposerButtons() {
  const hasText = messageInput.value.trim().length > 0;
  $("sendBtn").hidden = !hasText;
  $("micBtn").hidden = hasText;
  messageInput.style.height = "auto";
  const h = messageInput.scrollHeight;
  if (h) messageInput.style.height = Math.min(Math.max(h, 42), 120) + "px";
}

messageInput.addEventListener("input", () => {
  syncComposerButtons();
  pingTyping();
});

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 821px)").matches) {
    e.preventDefault();
    submitText();
  }
});

$("sendBtn").addEventListener("click", submitText);

async function submitText() {
  const text = messageInput.value.trim();
  if (!text) return;
  messageInput.value = "";
  syncComposerButtons();
  try {
    await sendMessage({ type: "text", text });
  } catch (err) {
    toast("Не отправилось: " + err.message);
    messageInput.value = text;
    syncComposerButtons();
  }
}

/** «Печатает…» — обновляем метку не чаще раза в 3 секунды. */
function pingTyping() {
  if (!state.chatId) return;
  const now = Date.now();
  if (now - state.typingSentAt < 3000) return;
  state.typingSentAt = now;
  updateDoc(doc(db, "chats", state.chatId), { [`typing.${state.user.uid}`]: now }).catch(() => {});
}

// ============================================================
//  ШАГ 4. Групповые чаты
// ============================================================

let groupMode = "create"; // create | add

$("newGroupBtn").addEventListener("click", () => {
  groupMode = "create";
  state.groupDraft = { members: new Map(), avatar: "" };
  $("groupModalTitle").textContent = "Новая группа";
  $("groupCreateFields").hidden = false;
  $("groupName").value = "";
  $("groupAvatar").src = DEFAULT_AVATAR;
  $("groupSearch").value = "";
  $("groupResults").innerHTML = "";
  $("groupCreateBtn").textContent = "Создать группу";
  renderGroupChips();
  openModal("groupModal");
});

$("addMembersBtn").addEventListener("click", () => {
  groupMode = "add";
  state.groupDraft = { members: new Map(), avatar: "" };
  $("groupModalTitle").textContent = "Добавить людей";
  $("groupCreateFields").hidden = true;
  $("groupSearch").value = "";
  $("groupResults").innerHTML = "";
  $("groupCreateBtn").textContent = "Добавить";
  renderGroupChips();
  openModal("groupModal");
});

$("groupAvatarInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    toast("Загружаем аватар…");
    const { url } = await uploadToCloudinary(file, "image");
    state.groupDraft.avatar = thumb(url, 256);
    $("groupAvatar").src = state.groupDraft.avatar;
    toast("Готово");
  } catch (err) {
    toast(err.message);
  }
});

function renderGroupChips() {
  const chips = [...state.groupDraft.members.values()];
  $("groupChips").innerHTML = chips.map((u) => `
    <span class="chip">
      <img src="${avatarOf(u)}" alt="" />
      ${esc(u.name || "@" + u.username)}
      <button type="button" data-rm="${esc(u.uid)}" aria-label="Убрать">×</button>
    </span>`).join("");
  $("groupChips").querySelectorAll("[data-rm]").forEach((b) =>
    b.addEventListener("click", () => {
      state.groupDraft.members.delete(b.dataset.rm);
      renderGroupChips();
    })
  );
}

let groupSearchTimer = null;
$("groupSearch").addEventListener("input", (e) => {
  const text = e.target.value.trim();
  clearTimeout(groupSearchTimer);
  if (text.length < 2) return ($("groupResults").innerHTML = "");
  groupSearchTimer = setTimeout(async () => {
    try {
      let users = await searchUsers(text);
      if (groupMode === "add" && state.chat) {
        users = users.filter((u) => !(state.chat.members || []).includes(u.uid));
      }
      renderUserRows($("groupResults"), users, (user) => {
        state.groupDraft.members.set(user.uid, user);
        state.profiles.set(user.uid, user);
        $("groupSearch").value = "";
        $("groupResults").innerHTML = "";
        renderGroupChips();
      });
    } catch (err) {
      toast("Поиск не сработал: " + err.message);
    }
  }, 300);
});

$("groupCreateBtn").addEventListener("click", async () => {
  const picked = [...state.groupDraft.members.keys()];

  if (groupMode === "add") {
    if (!picked.length) return toast("Выбери хотя бы одного человека");
    try {
      await updateDoc(doc(db, "chats", state.chatId), { members: arrayUnion(...picked) });
      toast("Добавлено");
      closeModals();
    } catch (err) {
      toast("Не получилось: " + err.message);
    }
    return;
  }

  const name = $("groupName").value.trim();
  if (!name) return toast("Впиши название группы");
  if (!picked.length) return toast("Добавь хотя бы одного участника");

  try {
    const ref = await addDoc(collection(db, "chats"), {
      type: "group",
      name,
      avatar: state.groupDraft.avatar || "",
      members: [state.user.uid, ...picked],
      owner: state.user.uid,
      createdBy: state.user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: null,
      read: {},
      typing: {},
    });
    closeModals();
    openChat(ref.id);
  } catch (err) {
    toast("Не получилось создать группу: " + err.message);
  }
});

// ------------------------------------------------------------
//  Инфо о чате
// ------------------------------------------------------------

$("chatInfoBtn").addEventListener("click", openInfo);
$("chatAvatarBtn").addEventListener("click", openInfo);

function openInfo() {
  if (!state.chat) return;
  const v = chatView(state.chat);
  $("infoAvatar").src = v.avatar;
  $("infoTitle").textContent = v.title;
  $("infoSubtitle").textContent = state.chat.type === "group"
    ? `${(state.chat.members || []).length} участников`
    : v.peer ? "@" + (v.peer.username || "") + " · " + lastSeenStr(v.peer) : "";

  const members = (state.chat.members || []).map(profileOf).filter(Boolean);
  $("infoMembers").innerHTML = state.chat.type === "group"
    ? members.map((u) => `
        <div class="row">
          <span class="avatar-wrap">
            <img class="av" src="${avatarOf(u)}" alt="" />
            ${isOnline(u) ? '<span class="dot-online"></span>' : ""}
          </span>
          <span class="row-main">
            <span class="row-top"><strong>${esc(u.name || "")}</strong></span>
            <span class="row-sub">@${esc(u.username || "")}${u.uid === state.chat.owner ? " · создатель" : ""}</span>
          </span>
        </div>`).join("")
    : "";
  $("addMembersBtn").hidden = state.chat.type !== "group";
  openModal("infoModal");
}

// ============================================================
//  ШАГ 5. Медиа: фото и голосовые
// ============================================================

$("attachBtn").addEventListener("click", () => $("photoInput").click());

$("photoInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) return toast("Фото больше 10 МБ");
  showUpload("Загружаем фото…");
  try {
    const { url } = await uploadToCloudinary(file, "image");
    await sendMessage({ type: "image", url, text: "" });
  } catch (err) {
    toast("Фото не ушло: " + err.message);
  } finally {
    hideUpload();
  }
});

function showUpload(text) {
  $("uploadText").textContent = text;
  $("uploadBar").hidden = false;
}
function hideUpload() { $("uploadBar").hidden = true; }

// ------------------------------------------------------------
//  Голосовые: зажал кнопку — пишет, отпустил — отправилось
// ------------------------------------------------------------

const rec = { recorder: null, chunks: [], startedAt: 0, timer: null, cancelled: false, stream: null };
const micBtn = $("micBtn");

function pickMime() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return options.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || "";
}

async function startRecording() {
  if (!state.chatId || rec.recorder) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    return toast("Браузер не умеет записывать голосовые");
  }
  try {
    rec.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return toast("Нет доступа к микрофону");
  }
  const mime = pickMime();
  rec.recorder = new MediaRecorder(rec.stream, mime ? { mimeType: mime } : undefined);
  rec.chunks = [];
  rec.cancelled = false;
  rec.startedAt = Date.now();

  rec.recorder.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
  rec.recorder.onstop = onRecordingStop;
  rec.recorder.start();

  micBtn.classList.add("recording");
  $("recOverlay").hidden = false;
  $("recOverlay").classList.remove("cancel");
  $("recTime").textContent = "0:00";
  rec.timer = setInterval(() => {
    const sec = (Date.now() - rec.startedAt) / 1000;
    $("recTime").textContent = fmtDuration(sec);
    if (sec > 120) stopRecording(false); // максимум 2 минуты
  }, 200);
  if (navigator.vibrate) navigator.vibrate(12);
}

function stopRecording(cancelled) {
  if (!rec.recorder) return;
  rec.cancelled = cancelled;
  clearInterval(rec.timer);
  micBtn.classList.remove("recording");
  $("recOverlay").hidden = true;
  try { rec.recorder.stop(); } catch { /* уже остановлен */ }
}

async function onRecordingStop() {
  rec.stream?.getTracks().forEach((t) => t.stop());
  const chunks = rec.chunks;
  const duration = (Date.now() - rec.startedAt) / 1000;
  const cancelled = rec.cancelled;
  rec.recorder = null;
  rec.chunks = [];
  rec.stream = null;

  if (cancelled || duration < 0.6 || !chunks.length) return;

  const blob = new Blob(chunks, { type: chunks[0].type || "audio/webm" });
  const ext = (blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm");
  const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type });

  showUpload("Отправляем голосовое…");
  try {
    const up = await uploadToCloudinary(file, "voice");
    await sendMessage({ type: "voice", url: up.url, duration: Math.round(up.duration || duration), text: "" });
  } catch (err) {
    toast("Голосовое не ушло: " + err.message);
  } finally {
    hideUpload();
  }
}

micBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  micBtn.setPointerCapture?.(e.pointerId);
  micBtn._y = e.clientY;
  startRecording();
});
micBtn.addEventListener("pointermove", (e) => {
  if (!rec.recorder) return;
  const willCancel = micBtn._y - e.clientY > 70;
  $("recOverlay").classList.toggle("cancel", willCancel);
  micBtn._cancel = willCancel;
});
micBtn.addEventListener("pointerup", () => { if (rec.recorder) stopRecording(!!micBtn._cancel); micBtn._cancel = false; });
micBtn.addEventListener("pointercancel", () => stopRecording(true));
micBtn.addEventListener("contextmenu", (e) => e.preventDefault());

// ============================================================
//  Запуск
// ============================================================

document.getElementById("bgLayer").style.setProperty(
  "--bg-image", backgroundImage ? `url("${backgroundImage}")` : "none"
);

// каждые 10 секунд освежаем «в сети / печатает…»
setInterval(() => {
  if (!state.user) return;
  renderChatList();
  if (state.chat) {
    renderChatHeader();
    const typers = typingUsers().length;
    if (typers !== renderMessages._typers) {
      renderMessages._typers = typers;
      renderMessages();
    }
  }
}, 10_000);

syncComposerButtons();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
