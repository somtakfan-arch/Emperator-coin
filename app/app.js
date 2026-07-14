(() => {
  "use strict";

  const STORAGE_KEY = "remindly_state_v1";

  const CATEGORIES = [
    { id: "health", label: "Здоровье", cls: "cat-green" },
    { id: "work", label: "Работа", cls: "cat-blue" },
    { id: "finance", label: "Финансы", cls: "cat-finance" },
    { id: "personal", label: "Личное", cls: "cat-personal" },
    { id: "study", label: "Учёба", cls: "cat-study" },
    { id: "other", label: "Другое", cls: "cat-other" },
  ];

  const REPEAT_OPTIONS = [
    { id: "none", label: "Никогда" },
    { id: "daily", label: "Каждый день" },
    { id: "weekly", label: "Раз в неделю" },
  ];

  const WEEKDAY_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const MONTH_LABELS = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];

  const BASE_COINS = 5;
  const STREAK_TIERS = [
    [30, 3],
    [14, 2],
    [7, 1.5],
    [3, 1.2],
    [0, 1],
  ];
  function streakMultiplier(count) {
    for (const [min, mult] of STREAK_TIERS) {
      if (count >= min) return mult;
    }
    return 1;
  }

  const FREEZE_COST = 30;
  const CATEGORY_SLOT_BASE_COST = 60;
  const CATEGORY_SLOT_STEP = 30;
  const CUSTOM_CATEGORY_CLASSES = ["cat-custom-0", "cat-custom-1", "cat-custom-2", "cat-custom-3"];

  const THEME_DEFS = [
    { id: "lime", label: "Классика", cost: 0, accent: "#d7ff3a", gradient: "linear-gradient(135deg, #ff4d8d, #ff9a3c 55%, #ffd52e)" },
    { id: "ocean", label: "Океан", cost: 40, accent: "#4dd9ff", gradient: "linear-gradient(135deg, #4d8dff, #4dd9ff 55%, #6be6d8)" },
    { id: "violet", label: "Виолет", cost: 40, accent: "#c58bff", gradient: "linear-gradient(135deg, #8a5cff, #c58bff 55%, #ff8ad4)" },
    { id: "sunset", label: "Закат", cost: 40, accent: "#ff8a3c", gradient: "linear-gradient(135deg, #ff3c5f, #ff8a3c 55%, #ffd52e)" },
  ];
  function themeInfo(id) {
    return THEME_DEFS.find((t) => t.id === id) || THEME_DEFS[0];
  }

  const PRIORITY_DEFS = [
    { id: "high", label: "Высокий", color: "#ff5470" },
    { id: "medium", label: "Средний", color: "#ffb020" },
    { id: "low", label: "Низкий", color: "#4d8dff" },
  ];
  function priorityInfo(id) {
    return PRIORITY_DEFS.find((p) => p.id === id) || null;
  }

  // ---------- date helpers ----------
  function pad(n) { return String(n).padStart(2, "0"); }
  function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function todayDate() { return new Date(); }
  function todayStr() { return toDateStr(todayDate()); }
  function addDaysStr(dateStr, n) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d + n);
    return toDateStr(dt);
  }
  function weekdayOf(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
  }
  function formatFullDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return `${WEEKDAY_LABELS[dt.getDay()]}, ${d} ${MONTH_LABELS[m - 1]}`.replace(/^./, (c) => c.toUpperCase());
  }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- state ----------
  function seedState() {
    const today = todayStr();
    const tomorrow = addDaysStr(today, 1);
    return migrateState({
      reminders: [
        {
          id: "seed-1",
          title: "Выпить воды",
          time: "09:00",
          category: "health",
          repeat: "daily",
          date: null,
          weekdays: [],
          done: false,
          completions: {},
          favorite: true,
          createdAt: Date.now(),
        },
        {
          id: "seed-2",
          title: "Созвон с командой",
          time: "14:30",
          category: "work",
          repeat: "weekly",
          date: null,
          weekdays: [weekdayOf(today)],
          done: false,
          completions: {},
          favorite: false,
          createdAt: Date.now(),
        },
        {
          id: "seed-3",
          title: "Оплатить интернет",
          time: "12:00",
          category: "finance",
          repeat: "none",
          date: tomorrow,
          weekdays: [],
          done: false,
          completions: {},
          favorite: false,
          createdAt: Date.now(),
        },
      ],
      streak: { count: 0, lastCompleteDate: null },
      notificationsEnabled: false,
      customCategories: [],
      categorySlotsPurchased: 0,
      orgFolders: [],
      orgGroups: [],
      notes: [],
    });
  }

  function migrateState(parsed) {
    parsed.notifiedLog = parsed.notifiedLog || {};
    parsed.coins = parsed.coins ?? 0;
    parsed.coinLog = parsed.coinLog || {};
    parsed.streakFreezes = parsed.streakFreezes ?? 0;
    parsed.unlockedThemes = parsed.unlockedThemes || ["lime"];
    parsed.activeTheme = parsed.activeTheme || "lime";
    parsed.customCategories = parsed.customCategories || [];
    parsed.categorySlotsPurchased = parsed.categorySlotsPurchased ?? 0;
    parsed.orgFolders = parsed.orgFolders || [];
    parsed.orgGroups = parsed.orgGroups || [];
    parsed.notes = parsed.notes || [];
    parsed.lifetimeCoins = parsed.lifetimeCoins ?? parsed.coins ?? 0;
    parsed.unlockedBadges = parsed.unlockedBadges || [];
    parsed.reminders.forEach((r) => {
      if (typeof r.note !== "string") r.note = "";
      if (r.groupId === undefined) r.groupId = null;
      if (r.folderId === undefined) r.folderId = null;
      if (r.priority === undefined) r.priority = "none";
      if (!Array.isArray(r.subtasks)) r.subtasks = [];
      if (r.snoozedUntil === undefined) r.snoozedUntil = null;
    });
    parsed.notes.forEach((n) => {
      if (n.pinned === undefined) n.pinned = false;
      if (n.color === undefined) n.color = null;
      if (!Array.isArray(n.checklist)) n.checklist = [];
    });
    return parsed;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return seedState();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.reminders)) return seedState();
      return migrateState(parsed);
    } catch {
      return seedState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();

  // ---------- due logic ----------
  function isDueOn(reminder, dateStr) {
    if (reminder.repeat === "daily") return true;
    if (reminder.repeat === "weekly") return (reminder.weekdays || []).includes(weekdayOf(dateStr));
    return reminder.date === dateStr;
  }

  function isDoneOn(reminder, dateStr) {
    if (reminder.repeat === "none") return !!reminder.done;
    return !!reminder.completions[dateStr];
  }

  function setDoneOn(reminder, dateStr, value) {
    if (reminder.repeat === "none") {
      reminder.done = value;
    } else {
      if (value) reminder.completions[dateStr] = true;
      else delete reminder.completions[dateStr];
    }
  }

  function isSnoozed(reminder) {
    return !!(reminder.snoozedUntil && Date.now() < reminder.snoozedUntil);
  }

  function remindersDueOn(dateStr) {
    return state.reminders
      .filter((r) => isDueOn(r, dateStr) && !(dateStr === todayStr() && isSnoozed(r)))
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  function allCategories() {
    return CATEGORIES.concat(state.customCategories);
  }

  function categoryInfo(id) {
    return allCategories().find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
  }

  // ---------- organizer: folders / groups / notes ----------
  function genId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function folderById(id) {
    return state.orgFolders.find((f) => f.id === id);
  }
  function groupById(id) {
    return state.orgGroups.find((g) => g.id === id);
  }
  function noteById(id) {
    return state.notes.find((n) => n.id === id);
  }
  function groupsInFolder(folderId) {
    return state.orgGroups.filter((g) => g.folderId === folderId).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }
  function notesInGroup(groupId) {
    return state.notes.filter((n) => n.groupId === groupId).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  function remindersInGroup(groupId) {
    return state.reminders.filter((r) => r.groupId === groupId);
  }
  function remindersInFolderDirect(folderId) {
    return state.reminders.filter((r) => r.folderId === folderId && !r.groupId);
  }

  function addFolder(name) {
    const folder = { id: genId("folder"), name, createdAt: Date.now() };
    state.orgFolders.push(folder);
    saveState();
    return folder;
  }

  function addGroup(folderId, name) {
    const group = { id: genId("group"), folderId, name, createdAt: Date.now() };
    state.orgGroups.push(group);
    saveState();
    return group;
  }

  function addNote(groupId, title) {
    const note = { id: genId("note"), groupId, title: title || "Новая заметка", body: "", createdAt: Date.now(), updatedAt: Date.now() };
    state.notes.push(note);
    saveState();
    return note;
  }

  function deleteFolder(id) {
    const groupIds = groupsInFolder(id).map((g) => g.id);
    state.notes = state.notes.filter((n) => !groupIds.includes(n.groupId));
    state.reminders.forEach((r) => {
      if (groupIds.includes(r.groupId)) r.groupId = null;
      if (r.folderId === id) r.folderId = null;
    });
    state.orgGroups = state.orgGroups.filter((g) => g.folderId !== id);
    state.orgFolders = state.orgFolders.filter((f) => f.id !== id);
    saveState();
  }

  function deleteGroup(id) {
    state.notes = state.notes.filter((n) => n.groupId !== id);
    state.reminders.forEach((r) => {
      if (r.groupId === id) r.groupId = null;
    });
    state.orgGroups = state.orgGroups.filter((g) => g.id !== id);
    saveState();
  }

  function deleteNote(id) {
    state.notes = state.notes.filter((n) => n.id !== id);
    saveState();
  }

  // ---------- streak ----------
  function isDayFullyComplete(dateStr) {
    const due = remindersDueOn(dateStr);
    if (due.length === 0) return null;
    return due.every((r) => isDoneOn(r, dateStr));
  }

  function recalcStreak() {
    const today = todayStr();
    const yesterday = addDaysStr(today, -1);
    const complete = isDayFullyComplete(today);
    if (complete === true) {
      if (state.streak.lastCompleteDate !== today) {
        state.streak.count = state.streak.lastCompleteDate === yesterday ? state.streak.count + 1 : 1;
        state.streak.lastCompleteDate = today;
      }
    } else if (state.streak.lastCompleteDate === today) {
      state.streak.count = Math.max(0, state.streak.count - 1);
      state.streak.lastCompleteDate = addDaysStr(today, -2);
    }
  }

  function daysDiff(fromStr, toStr) {
    const [fy, fm, fd] = fromStr.split("-").map(Number);
    const [ty, tm, td] = toStr.split("-").map(Number);
    const from = new Date(fy, fm - 1, fd);
    const to = new Date(ty, tm - 1, td);
    return Math.round((to - from) / 86400000);
  }

  function decayStreakIfMissed() {
    const today = todayStr();
    const last = state.streak.lastCompleteDate;
    if (!last) return;
    const gap = daysDiff(last, today);
    if (gap <= 1) return;
    if (gap === 2 && state.streakFreezes > 0) {
      state.streakFreezes -= 1;
      state.streak.lastCompleteDate = addDaysStr(today, -1);
      saveState();
      toast("Стрик спасён заморозкой 🧊");
      return;
    }
    state.streak.count = 0;
    saveState();
  }

  // ---------- rendering ----------
  const els = {
    dateLabel: document.getElementById("date-label"),
    viewTitle: document.getElementById("view-title"),
    viewFrac: document.getElementById("view-frac"),
    progressTrack: document.getElementById("progress-track"),
    progressFill: document.getElementById("progress-fill"),
    views: {
      today: document.getElementById("view-today"),
      all: document.getElementById("view-all"),
      favorites: document.getElementById("view-favorites"),
      notes: document.getElementById("view-notes"),
      profile: document.getElementById("view-profile"),
    },
    navBtns: document.querySelectorAll(".nav-btn"),
    fab: document.getElementById("fab-add"),
    overlay: document.getElementById("sheet-overlay"),
    sheet: document.getElementById("add-sheet"),
    form: document.getElementById("add-form"),
    toast: document.getElementById("toast"),
  };

  let currentView = "today";
  let toastTimer = null;

  function applyTheme() {
    const t = themeInfo(state.activeTheme);
    document.documentElement.style.setProperty("--lime", t.accent);
    document.documentElement.style.setProperty("--gradient-cta", t.gradient);
  }

  function updateCoinBadge() {
    const el = document.getElementById("coin-count");
    if (el) el.textContent = state.coins;
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2400);
  }

  function heartSvg(filled) {
    return `<svg viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-4.35-9.5-8.5C.6 9 2 5 5.6 5c2 0 3.4 1.1 4.4 2.6C11 6.1 12.4 5 14.4 5 18 5 19.4 9 17.5 12.5 15 16.65 12 21 12 21z"/></svg>`;
  }
  function trashSvg() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"/></svg>`;
  }
  function checkSvg() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
  }
  function repeatSvg() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
  }
  function moreSvg() {
    return `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`;
  }
  function backSvg() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;
  }
  function folderSvg() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z"/></svg>`;
  }
  function groupSvg() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`;
  }
  function noteSvg() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M14 4v5h5M8 13h8M8 17h5"/></svg>`;
  }
  function checklistSvg() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 7 2 2 3-3"/><path d="M11 7h9"/><path d="m4 15 2 2 3-3"/><path d="M11 15h9"/></svg>`;
  }
  function trophySvg() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3a3 3 0 0 1-3 5M7 5H4a3 3 0 0 0 3 5"/></svg>`;
  }

  function reminderRow(reminder, dateStr) {
    const done = isDoneOn(reminder, dateStr);
    const cat = categoryInfo(reminder.category);
    const row = document.createElement("div");
    row.className = `reminder-row${done ? " done" : ""}`;
    row.dataset.id = reminder.id;
    const prio = reminder.priority && reminder.priority !== "none" ? priorityInfo(reminder.priority) : null;
    if (prio) row.style.borderLeft = `3px solid ${prio.color}`;

    const check = document.createElement("button");
    check.className = `reminder-check ${cat.cls}`;
    check.setAttribute("aria-label", "Отметить выполненным");
    check.innerHTML = checkSvg();
    check.addEventListener("click", () => {
      const wasDone = isDoneOn(reminder, dateStr);
      setDoneOn(reminder, dateStr, !wasDone);
      recalcStreak();
      const coinKey = `${reminder.id}|${dateStr}`;
      if (!wasDone) {
        const amount = Math.round(BASE_COINS * streakMultiplier(state.streak.count));
        state.coins += amount;
        state.coinLog[coinKey] = amount;
        toast(`+${amount} 🪙`);
      } else {
        const amount = state.coinLog[coinKey] || 0;
        state.coins = Math.max(0, state.coins - amount);
        delete state.coinLog[coinKey];
      }
      saveState();
      renderAll();
    });

    const info = document.createElement("div");
    info.className = "reminder-info";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = reminder.title;
    const group = reminder.groupId ? groupById(reminder.groupId) : null;
    const directFolder = !group && reminder.folderId ? folderById(reminder.folderId) : null;
    const subtaskDone = (reminder.subtasks || []).filter((s) => s.done).length;
    const subtaskTotal = (reminder.subtasks || []).length;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<span>${reminder.time}</span><span>·</span><span>${cat.label}</span>${
      reminder.repeat !== "none" ? `<span class="repeat-icon">${repeatSvg()}</span>` : ""
    }${group ? `<span class="meta-group"><span>·</span>${groupSvg()}${group.name}</span>` : ""}${
      directFolder ? `<span class="meta-group"><span>·</span>${folderSvg()}${directFolder.name}</span>` : ""
    }${prio ? `<span class="meta-priority" style="color:${prio.color}">🚩 ${prio.label}</span>` : ""}${
      subtaskTotal ? `<span class="meta-group"><span>·</span>${checklistSvg()}${subtaskDone}/${subtaskTotal}</span>` : ""
    }${isSnoozed(reminder) ? `<span class="meta-note">⏰</span>` : ""}${
      reminder.note ? `<span class="meta-note">${noteSvg()}</span>` : ""
    }`;
    info.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "reminder-actions";

    const moreBtn = document.createElement("button");
    moreBtn.className = "icon-btn";
    moreBtn.setAttribute("aria-label", "Ещё");
    moreBtn.innerHTML = moreSvg();
    moreBtn.addEventListener("click", () => openReminderMore(reminder));

    const likeBtn = document.createElement("button");
    likeBtn.className = `icon-btn${reminder.favorite ? " liked" : ""}`;
    likeBtn.setAttribute("aria-label", "В избранное");
    likeBtn.innerHTML = heartSvg(reminder.favorite);
    likeBtn.addEventListener("click", () => {
      reminder.favorite = !reminder.favorite;
      saveState();
      likeBtn.classList.add("pop");
      renderAll();
    });

    const delBtn = document.createElement("button");
    delBtn.className = "icon-btn";
    delBtn.setAttribute("aria-label", "Удалить");
    delBtn.innerHTML = trashSvg();
    delBtn.addEventListener("click", () => {
      state.reminders = state.reminders.filter((r) => r.id !== reminder.id);
      saveState();
      toast("Напоминание удалено");
      renderAll();
    });

    actions.append(moreBtn, likeBtn, delBtn);
    row.append(check, info, actions);
    return row;
  }

  // ---------- reminder "more" (note + group) ----------
  const moreEls = {
    overlay: document.getElementById("sheet-overlay"),
    moreSheet: document.getElementById("reminder-more-sheet"),
    moreTitle: document.getElementById("more-sheet-title"),
    noteSheet: document.getElementById("reminder-note-sheet"),
    noteText: document.getElementById("reminder-note-text"),
    groupSheet: document.getElementById("reminder-group-sheet"),
    groupChips: document.getElementById("reminder-group-chips"),
    prioritySheet: document.getElementById("reminder-priority-sheet"),
    priorityChips: document.getElementById("reminder-priority-chips"),
    subtasksSheet: document.getElementById("reminder-subtasks-sheet"),
    subtasksList: document.getElementById("reminder-subtasks-list"),
    snoozeSheet: document.getElementById("reminder-snooze-sheet"),
  };
  let activeReminderForMore = null;

  function closeAllMiniSheets() {
    moreEls.overlay.classList.remove("show");
    [
      moreEls.moreSheet,
      moreEls.noteSheet,
      moreEls.groupSheet,
      moreEls.prioritySheet,
      moreEls.subtasksSheet,
      moreEls.snoozeSheet,
    ].forEach((s) => s.classList.remove("show"));
  }

  function openReminderMore(reminder) {
    activeReminderForMore = reminder;
    moreEls.moreTitle.textContent = reminder.title;
    moreEls.overlay.classList.add("show");
    moreEls.moreSheet.classList.add("show");
  }

  document.getElementById("more-sheet-close").addEventListener("click", closeAllMiniSheets);

  document.getElementById("more-note-row").addEventListener("click", () => {
    if (!activeReminderForMore) return;
    moreEls.noteText.value = activeReminderForMore.note || "";
    moreEls.moreSheet.classList.remove("show");
    moreEls.noteSheet.classList.add("show");
    setTimeout(() => moreEls.noteText.focus(), 200);
  });

  document.getElementById("reminder-note-cancel").addEventListener("click", closeAllMiniSheets);

  document.getElementById("reminder-note-save").addEventListener("click", () => {
    if (!activeReminderForMore) return;
    activeReminderForMore.note = moreEls.noteText.value.trim();
    saveState();
    closeAllMiniSheets();
    toast("Заметка сохранена");
    renderAll();
  });

  function buildReminderGroupChips() {
    moreEls.groupChips.innerHTML = "";
    const noneChip = document.createElement("button");
    noneChip.type = "button";
    noneChip.className = `chip${!activeReminderForMore.groupId && !activeReminderForMore.folderId ? " selected" : ""}`;
    noneChip.textContent = "Без папки";
    noneChip.addEventListener("click", () => {
      activeReminderForMore.groupId = null;
      activeReminderForMore.folderId = null;
      saveState();
      buildReminderGroupChips();
      renderAll();
    });
    moreEls.groupChips.appendChild(noneChip);

    state.orgFolders.forEach((folder) => {
      const folderChip = document.createElement("button");
      folderChip.type = "button";
      folderChip.className = `chip${!activeReminderForMore.groupId && activeReminderForMore.folderId === folder.id ? " selected" : ""}`;
      folderChip.innerHTML = `${folderSvg()} ${folder.name}`;
      folderChip.addEventListener("click", () => {
        activeReminderForMore.groupId = null;
        activeReminderForMore.folderId = folder.id;
        saveState();
        buildReminderGroupChips();
        renderAll();
      });
      moreEls.groupChips.appendChild(folderChip);

      groupsInFolder(folder.id).forEach((g) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `chip${activeReminderForMore.groupId === g.id ? " selected" : ""}`;
        chip.textContent = `${folder.name} / ${g.name}`;
        chip.addEventListener("click", () => {
          activeReminderForMore.groupId = g.id;
          activeReminderForMore.folderId = null;
          saveState();
          buildReminderGroupChips();
          renderAll();
        });
        moreEls.groupChips.appendChild(chip);
      });
    });

    if (state.orgFolders.length === 0) {
      const hint = document.createElement("p");
      hint.className = "demo-hint";
      hint.style.width = "100%";
      hint.textContent = "Папок пока нет — создайте их во вкладке «Заметки».";
      moreEls.groupChips.appendChild(hint);
    }
  }

  document.getElementById("more-group-row").addEventListener("click", () => {
    if (!activeReminderForMore) return;
    buildReminderGroupChips();
    moreEls.moreSheet.classList.remove("show");
    moreEls.groupSheet.classList.add("show");
  });

  document.getElementById("reminder-group-close").addEventListener("click", closeAllMiniSheets);

  function buildPriorityChips() {
    moreEls.priorityChips.innerHTML = "";
    const noneChip = document.createElement("button");
    noneChip.type = "button";
    noneChip.className = `chip${!activeReminderForMore.priority || activeReminderForMore.priority === "none" ? " selected" : ""}`;
    noneChip.textContent = "Без приоритета";
    noneChip.addEventListener("click", () => {
      activeReminderForMore.priority = "none";
      saveState();
      buildPriorityChips();
      renderAll();
    });
    moreEls.priorityChips.appendChild(noneChip);

    PRIORITY_DEFS.forEach((p) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `chip${activeReminderForMore.priority === p.id ? " selected" : ""}`;
      chip.innerHTML = `<span class="dot" style="background:${p.color}"></span>${p.label}`;
      chip.addEventListener("click", () => {
        activeReminderForMore.priority = p.id;
        saveState();
        buildPriorityChips();
        renderAll();
      });
      moreEls.priorityChips.appendChild(chip);
    });
  }

  document.getElementById("more-priority-row").addEventListener("click", () => {
    if (!activeReminderForMore) return;
    buildPriorityChips();
    moreEls.moreSheet.classList.remove("show");
    moreEls.prioritySheet.classList.add("show");
  });
  document.getElementById("reminder-priority-close").addEventListener("click", closeAllMiniSheets);

  function buildSubtasksList() {
    moreEls.subtasksList.innerHTML = "";
    const subtasks = activeReminderForMore.subtasks || [];
    if (subtasks.length === 0) {
      const p = document.createElement("p");
      p.className = "demo-hint";
      p.textContent = "Подзадач пока нет.";
      moreEls.subtasksList.appendChild(p);
    }
    subtasks.forEach((s) => {
      const row = document.createElement("div");
      row.className = `reminder-row subtask-row${s.done ? " done" : ""}`;
      const check = document.createElement("button");
      check.className = "reminder-check cat-other";
      check.innerHTML = checkSvg();
      check.addEventListener("click", () => {
        s.done = !s.done;
        saveState();
        buildSubtasksList();
        renderAll();
      });
      const info = document.createElement("div");
      info.className = "reminder-info";
      info.innerHTML = `<div class="title">${s.text}</div>`;
      const delBtn = document.createElement("button");
      delBtn.className = "icon-btn";
      delBtn.innerHTML = trashSvg();
      delBtn.addEventListener("click", () => {
        activeReminderForMore.subtasks = subtasks.filter((x) => x.id !== s.id);
        saveState();
        buildSubtasksList();
        renderAll();
      });
      row.append(check, info, delBtn);
      moreEls.subtasksList.appendChild(row);
    });
  }

  document.getElementById("more-subtasks-row").addEventListener("click", () => {
    if (!activeReminderForMore) return;
    buildSubtasksList();
    moreEls.moreSheet.classList.remove("show");
    moreEls.subtasksSheet.classList.add("show");
  });
  document.getElementById("reminder-subtasks-close").addEventListener("click", closeAllMiniSheets);
  document.getElementById("subtask-add-btn").addEventListener("click", () => {
    const input = document.getElementById("subtask-new-input");
    const text = input.value.trim();
    if (!text || !activeReminderForMore) return;
    if (!Array.isArray(activeReminderForMore.subtasks)) activeReminderForMore.subtasks = [];
    activeReminderForMore.subtasks.push({ id: genId("sub"), text, done: false });
    saveState();
    input.value = "";
    buildSubtasksList();
    renderAll();
  });

  function snoozeUntil(ms) {
    if (!activeReminderForMore) return;
    activeReminderForMore.snoozedUntil = Date.now() + ms;
    saveState();
    closeAllMiniSheets();
    toast("Задача отложена");
    renderAll();
  }

  document.getElementById("more-snooze-row").addEventListener("click", () => {
    if (!activeReminderForMore) return;
    moreEls.moreSheet.classList.remove("show");
    moreEls.snoozeSheet.classList.add("show");
  });
  document.getElementById("snooze-1h").addEventListener("click", () => snoozeUntil(60 * 60 * 1000));
  document.getElementById("snooze-3h").addEventListener("click", () => snoozeUntil(3 * 60 * 60 * 1000));
  document.getElementById("snooze-tomorrow").addEventListener("click", () => {
    if (!activeReminderForMore) return;
    const now = new Date();
    const tomorrow9am = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0);
    activeReminderForMore.snoozedUntil = tomorrow9am.getTime();
    saveState();
    closeAllMiniSheets();
    toast("Отложено до завтра");
    renderAll();
  });
  document.getElementById("reminder-snooze-close").addEventListener("click", closeAllMiniSheets);

  moreEls.overlay.addEventListener("click", () => {
    if (
      moreEls.moreSheet.classList.contains("show") ||
      moreEls.noteSheet.classList.contains("show") ||
      moreEls.groupSheet.classList.contains("show") ||
      moreEls.prioritySheet.classList.contains("show") ||
      moreEls.subtasksSheet.classList.contains("show") ||
      moreEls.snoozeSheet.classList.contains("show")
    ) {
      closeAllMiniSheets();
    }
  });

  function emptyState(emoji, text) {
    const div = document.createElement("div");
    div.className = "empty-state";
    div.innerHTML = `<div class="emoji">${emoji}</div><p>${text}</p>`;
    return div;
  }

  function renderToday() {
    const container = els.views.today;
    container.innerHTML = "";
    const today = todayStr();
    const due = remindersDueOn(today);

    if (due.length === 0) {
      container.appendChild(emptyState("✨", "На сегодня ничего не запланировано.<br>Нажмите + чтобы добавить напоминание."));
      return;
    }
    due.forEach((r) => container.appendChild(reminderRow(r, today)));
  }

  function renderAllList() {
    const container = els.views.all;
    container.innerHTML = "";

    const today = todayStr();
    const tomorrow = addDaysStr(today, 1);
    const todayDue = remindersDueOn(today);
    const tomorrowDue = remindersDueOn(tomorrow);

    const laterOneOff = state.reminders
      .filter((r) => r.repeat === "none" && r.date && r.date > tomorrow)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    if (todayDue.length === 0 && tomorrowDue.length === 0 && laterOneOff.length === 0) {
      container.appendChild(emptyState("🗒️", "Пока нет ни одного напоминания.<br>Нажмите + чтобы создать первое."));
      return;
    }

    if (todayDue.length) {
      const label = document.createElement("div");
      label.className = "section-label";
      label.textContent = "Сегодня";
      container.appendChild(label);
      todayDue.forEach((r) => container.appendChild(reminderRow(r, today)));
    }
    if (tomorrowDue.length) {
      const label = document.createElement("div");
      label.className = "section-label";
      label.textContent = "Завтра";
      container.appendChild(label);
      tomorrowDue.forEach((r) => container.appendChild(reminderRow(r, tomorrow)));
    }
    if (laterOneOff.length) {
      const label = document.createElement("div");
      label.className = "section-label";
      label.textContent = "Позже";
      container.appendChild(label);
      laterOneOff.forEach((r) => container.appendChild(reminderRow(r, r.date)));
    }
  }

  function renderFavorites() {
    const container = els.views.favorites;
    container.innerHTML = "";

    const favs = state.reminders
      .filter((r) => r.favorite)
      .sort((a, b) => a.time.localeCompare(b.time));

    if (favs.length === 0) {
      container.appendChild(emptyState("♡", "Отмечайте сердечком важные напоминания —<br>они появятся здесь."));
      return;
    }
    const today = todayStr();
    favs.forEach((r) => container.appendChild(reminderRow(r, r.repeat === "none" ? (r.date || today) : today)));
  }

  // ---------- notes tab ----------
  let notesScreen = { type: "root" };

  function contextDateFor(reminder) {
    const today = todayStr();
    return reminder.repeat === "none" ? reminder.date || today : today;
  }

  function backRow(title, onBack) {
    const row = document.createElement("div");
    row.className = "notes-back-row";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-btn";
    btn.innerHTML = backSvg();
    btn.addEventListener("click", onBack);
    const h = document.createElement("div");
    h.className = "notes-back-title";
    h.textContent = title;
    row.append(btn, h);
    return row;
  }

  function inlineAddRow(placeholder, buttonLabel, onSubmit) {
    const row = document.createElement("div");
    row.className = "category-add-row";
    row.innerHTML = `
      <input class="text-input" type="text" placeholder="${placeholder}" maxlength="40" />
      <button type="button" class="btn btn-primary">${buttonLabel}</button>
    `;
    const input = row.querySelector("input");
    const btn = row.querySelector("button");
    const submit = () => {
      const value = input.value.trim();
      if (!value) {
        toast("Введите название");
        return;
      }
      onSubmit(value);
      input.value = "";
    };
    btn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    });
    return row;
  }

  function notesListRow(icon, title, subtitle, onOpen, onDelete) {
    const row = document.createElement("div");
    row.className = "notes-list-row";
    row.innerHTML = `<span class="notes-list-icon">${icon}</span>`;
    const info = document.createElement("div");
    info.className = "notes-list-info";
    info.innerHTML = `<div class="title">${title}</div>${subtitle ? `<div class="meta"><span>${subtitle}</span></div>` : ""}`;
    row.appendChild(info);
    row.addEventListener("click", onOpen);
    if (onDelete) {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn";
      delBtn.innerHTML = trashSvg();
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        onDelete();
      });
      row.appendChild(delBtn);
    }
    return row;
  }

  function renderNotesRoot(container) {
    const unsorted = state.notes.filter((n) => !n.groupId).sort((a, b) => b.updatedAt - a.updatedAt);
    const label1 = document.createElement("div");
    label1.className = "section-label";
    label1.textContent = "Быстрые заметки";
    container.appendChild(label1);

    if (unsorted.length === 0) {
      const p = document.createElement("p");
      p.className = "demo-hint";
      p.textContent = "Заметок без папки пока нет.";
      container.appendChild(p);
    } else {
      unsorted.forEach((n) => {
        container.appendChild(
          notesListRow(
            noteSvg(),
            n.title || "Без названия",
            n.body ? n.body.slice(0, 40) : "",
            () => {
              notesScreen = { type: "note", id: n.id, back: { type: "root" } };
              renderAll();
            },
            () => {
              deleteNote(n.id);
              toast("Заметка удалена");
              renderAll();
            }
          )
        );
      });
    }
    container.appendChild(
      inlineAddRow("Название заметки", "Добавить", (name) => {
        const n = addNote(null, name);
        toast("Заметка создана");
        notesScreen = { type: "note", id: n.id, back: { type: "root" } };
        renderAll();
      })
    );

    const label2 = document.createElement("div");
    label2.className = "section-label";
    label2.textContent = "Папки";
    container.appendChild(label2);

    if (state.orgFolders.length === 0) {
      const p = document.createElement("p");
      p.className = "demo-hint";
      p.textContent = "Папок пока нет — создайте первую ниже.";
      container.appendChild(p);
    } else {
      state.orgFolders
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "ru"))
        .forEach((f) => {
          const groupCount = groupsInFolder(f.id).length;
          container.appendChild(
            notesListRow(
              folderSvg(),
              f.name,
              `${groupCount} ${groupWord(groupCount)}`,
              () => {
                notesScreen = { type: "folder", id: f.id };
                renderAll();
              },
              () => {
                deleteFolder(f.id);
                toast("Папка удалена");
                renderAll();
              }
            )
          );
        });
    }
    container.appendChild(
      inlineAddRow("Название папки", "Создать", (name) => {
        addFolder(name);
        toast("Папка создана");
        renderAll();
      })
    );
  }

  function renderNotesFolder(container, folderId) {
    const folder = folderById(folderId);
    if (!folder) {
      notesScreen = { type: "root" };
      renderNotesRoot(container);
      return;
    }
    container.appendChild(backRow(folder.name, () => { notesScreen = { type: "root" }; renderAll(); }));

    const groups = groupsInFolder(folderId);
    if (groups.length === 0) {
      const p = document.createElement("p");
      p.className = "demo-hint";
      p.textContent = "Групп в этой папке пока нет.";
      container.appendChild(p);
    } else {
      groups.forEach((g) => {
        const noteCount = notesInGroup(g.id).length;
        const taskCount = remindersInGroup(g.id).length;
        container.appendChild(
          notesListRow(
            groupSvg(),
            g.name,
            `${noteCount} ${noteWord(noteCount)} · ${taskCount} ${taskWord(taskCount)}`,
            () => {
              notesScreen = { type: "group", id: g.id, folderId };
              renderAll();
            },
            () => {
              deleteGroup(g.id);
              toast("Группа удалена");
              renderAll();
            }
          )
        );
      });
    }
    container.appendChild(
      inlineAddRow("Название группы", "Создать", (name) => {
        addGroup(folderId, name);
        toast("Группа создана");
        renderAll();
      })
    );

    const label2 = document.createElement("div");
    label2.className = "section-label";
    label2.textContent = "Задачи в папке";
    container.appendChild(label2);

    const directTasks = remindersInFolderDirect(folderId);
    if (directTasks.length === 0) {
      const p = document.createElement("p");
      p.className = "demo-hint";
      p.textContent = "Задач прямо в папке пока нет.";
      container.appendChild(p);
    } else {
      directTasks.forEach((r) => container.appendChild(reminderRow(r, contextDateFor(r))));
    }
    const addTaskBtn = document.createElement("button");
    addTaskBtn.type = "button";
    addTaskBtn.className = "btn btn-secondary";
    addTaskBtn.style.width = "100%";
    addTaskBtn.textContent = "+ Добавить задачу в папку";
    addTaskBtn.addEventListener("click", () => openSheet(null, folderId));
    container.appendChild(addTaskBtn);
  }

  function renderNotesGroup(container, groupId, folderId) {
    const group = groupById(groupId);
    if (!group) {
      notesScreen = { type: "folder", id: folderId };
      renderNotesFolder(container, folderId);
      return;
    }
    container.appendChild(backRow(group.name, () => { notesScreen = { type: "folder", id: folderId }; renderAll(); }));

    const label1 = document.createElement("div");
    label1.className = "section-label";
    label1.textContent = "Заметки";
    container.appendChild(label1);

    const notes = notesInGroup(groupId);
    if (notes.length === 0) {
      const p = document.createElement("p");
      p.className = "demo-hint";
      p.textContent = "Заметок в группе пока нет.";
      container.appendChild(p);
    } else {
      notes.forEach((n) => {
        container.appendChild(
          notesListRow(
            noteSvg(),
            n.title || "Без названия",
            n.body ? n.body.slice(0, 40) : "",
            () => {
              notesScreen = { type: "note", id: n.id, back: { type: "group", id: groupId, folderId } };
              renderAll();
            },
            () => {
              deleteNote(n.id);
              toast("Заметка удалена");
              renderAll();
            }
          )
        );
      });
    }
    container.appendChild(
      inlineAddRow("Название заметки", "Добавить", (name) => {
        const n = addNote(groupId, name);
        toast("Заметка создана");
        notesScreen = { type: "note", id: n.id, back: { type: "group", id: groupId, folderId } };
        renderAll();
      })
    );

    const label2 = document.createElement("div");
    label2.className = "section-label";
    label2.textContent = "Задачи";
    container.appendChild(label2);

    const tasks = remindersInGroup(groupId);
    if (tasks.length === 0) {
      const p = document.createElement("p");
      p.className = "demo-hint";
      p.textContent = "Задач в группе пока нет.";
      container.appendChild(p);
    } else {
      tasks.forEach((r) => container.appendChild(reminderRow(r, contextDateFor(r))));
    }
    const addTaskBtn = document.createElement("button");
    addTaskBtn.type = "button";
    addTaskBtn.className = "btn btn-secondary";
    addTaskBtn.style.width = "100%";
    addTaskBtn.textContent = "+ Добавить задачу в группу";
    addTaskBtn.addEventListener("click", () => openSheet(groupId));
    container.appendChild(addTaskBtn);
  }

  let noteSaveTimer = null;
  function renderNoteEditor(container, noteId) {
    const note = noteById(noteId);
    if (!note) {
      notesScreen = { type: "root" };
      renderNotesRoot(container);
      return;
    }
    const back = notesScreen.back || { type: "root" };
    container.appendChild(
      backRow("Заметка", () => {
        notesScreen = back;
        renderAll();
      })
    );

    const titleInput = document.createElement("input");
    titleInput.className = "text-input note-title-input";
    titleInput.type = "text";
    titleInput.placeholder = "Название";
    titleInput.value = note.title;

    const body = document.createElement("textarea");
    body.className = "text-input note-textarea note-editor-body";
    body.placeholder = "Текст заметки…";
    body.rows = 10;
    body.value = note.body;

    const scheduleSave = () => {
      clearTimeout(noteSaveTimer);
      noteSaveTimer = setTimeout(() => {
        note.title = titleInput.value.trim() || "Без названия";
        note.body = body.value;
        note.updatedAt = Date.now();
        saveState();
      }, 400);
    };
    titleInput.addEventListener("input", scheduleSave);
    body.addEventListener("input", scheduleSave);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn-secondary";
    delBtn.style.width = "100%";
    delBtn.style.marginTop = "14px";
    delBtn.textContent = "Удалить заметку";
    delBtn.addEventListener("click", () => {
      clearTimeout(noteSaveTimer);
      deleteNote(note.id);
      toast("Заметка удалена");
      notesScreen = back;
      renderAll();
    });

    container.append(titleInput, body, delBtn);
  }

  function renderNotes() {
    const container = els.views.notes;
    container.innerHTML = "";
    if (notesScreen.type === "folder") renderNotesFolder(container, notesScreen.id);
    else if (notesScreen.type === "group") renderNotesGroup(container, notesScreen.id, notesScreen.folderId);
    else if (notesScreen.type === "note") renderNoteEditor(container, notesScreen.id);
    else renderNotesRoot(container);
  }

  function pluralRu(n, one, few, many) {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return many;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  }
  function groupWord(n) { return pluralRu(n, "группа", "группы", "групп"); }
  function noteWord(n) { return pluralRu(n, "заметка", "заметки", "заметок"); }
  function taskWord(n) { return pluralRu(n, "задача", "задачи", "задач"); }

  function renderProfile() {
    const container = els.views.profile;
    container.innerHTML = "";

    const total = state.reminders.length;
    const today = todayStr();
    const doneTotal = state.reminders.filter((r) => isDoneOn(r, r.repeat === "none" ? (r.date || today) : today)).length;
    const favCount = state.reminders.filter((r) => r.favorite).length;

    const streakCard = document.createElement("div");
    streakCard.className = "streak-card";
    streakCard.innerHTML = `
      <div class="flame-row">🔥 ${state.streak.count} ${daysWord(state.streak.count)} подряд</div>
      <p>Выполняйте все напоминания за день, чтобы не терять стрик</p>
    `;

    const statGrid = document.createElement("div");
    statGrid.className = "stat-grid";
    statGrid.innerHTML = `
      <div class="stat-card">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 12 5 5L20 6"/></svg>
        <div class="num">${doneTotal}/${total}</div>
        <div class="label">выполнено всего</div>
      </div>
      <div class="stat-card">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.35-9.5-8.5C.6 9 2 5 5.6 5c2 0 3.4 1.1 4.4 2.6C11 6.1 12.4 5 14.4 5 18 5 19.4 9 17.5 12.5 15 16.65 12 21 12 21z"/></svg>
        <div class="num">${favCount}</div>
        <div class="label">в избранном</div>
      </div>
    `;

    const notifRow = document.createElement("button");
    notifRow.type = "button";
    notifRow.className = "profile-row";
    notifRow.innerHTML = `
      <span class="left">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        Уведомления
      </span>
      <span class="switch ${state.notificationsEnabled ? "on" : ""}"></span>
    `;
    notifRow.addEventListener("click", async () => {
      if (!state.notificationsEnabled) {
        if (!("Notification" in window)) {
          toast("Браузер не поддерживает уведомления");
          return;
        }
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          toast("Уведомления не разрешены в браузере");
          return;
        }
        state.notificationsEnabled = true;
        toast("Уведомления включены — пока приложение открыто");
      } else {
        state.notificationsEnabled = false;
        toast("Уведомления выключены");
      }
      saveState();
      renderProfile();
    });

    const shop = buildShop();
    const dataTools = buildDataTools();

    const siteLink = document.createElement("a");
    siteLink.className = "profile-row";
    siteLink.href = "../";
    siteLink.innerHTML = `<span class="left">← На сайт Remindly</span>`;

    container.append(streakCard, statGrid, shop, notifRow, dataTools, siteLink);
  }

  function buildDataTools() {
    const wrap = document.createElement("div");
    wrap.appendChild(shopHeader("Данные"));

    const exportRow = document.createElement("button");
    exportRow.type = "button";
    exportRow.className = "profile-row";
    exportRow.innerHTML = `<span class="left">⬇️ Экспортировать данные</span>`;
    exportRow.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `remindly-backup-${todayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Файл сохранён");
    });
    wrap.appendChild(exportRow);

    const importRow = document.createElement("button");
    importRow.type = "button";
    importRow.className = "profile-row";
    importRow.innerHTML = `<span class="left">⬆️ Импортировать данные</span>`;
    importRow.addEventListener("click", () => {
      document.getElementById("import-file-input").click();
    });
    wrap.appendChild(importRow);

    return wrap;
  }

  document.getElementById("import-file-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.reminders)) throw new Error("bad format");
        state = migrateState(parsed);
        saveState();
        applyTheme();
        renderAll();
        toast("Данные восстановлены");
      } catch {
        toast("Не удалось прочитать файл");
      }
    };
    reader.readAsText(file);
  });

  function shopHeader(text) {
    const label = document.createElement("div");
    label.className = "section-label";
    label.style.marginTop = "6px";
    label.textContent = text;
    return label;
  }

  function buildShop() {
    const wrap = document.createElement("div");

    const coinCard = document.createElement("div");
    coinCard.className = "coin-summary-card";
    coinCard.innerHTML = `🪙 <span class="coin-summary-num">${state.coins}</span> монет`;
    wrap.appendChild(coinCard);

    wrap.appendChild(shopHeader("Магазин"));

    // Streak freeze
    const freezeRow = document.createElement("button");
    freezeRow.type = "button";
    freezeRow.className = "profile-row shop-row";
    freezeRow.innerHTML = `
      <span class="left">🧊 Заморозка стрика<span class="shop-sub">У вас: ${state.streakFreezes}</span></span>
      <span class="shop-price">${FREEZE_COST} 🪙</span>
    `;
    freezeRow.addEventListener("click", () => {
      if (state.coins < FREEZE_COST) {
        toast("Недостаточно монет");
        return;
      }
      state.coins -= FREEZE_COST;
      state.streakFreezes += 1;
      saveState();
      toast("Заморозка куплена");
      renderAll();
    });
    wrap.appendChild(freezeRow);

    // Themes
    const themeRow = document.createElement("div");
    themeRow.className = "theme-row";
    THEME_DEFS.forEach((t) => {
      const owned = state.unlockedThemes.includes(t.id);
      const active = state.activeTheme === t.id;
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = `theme-swatch${active ? " active" : ""}${owned ? "" : " locked"}`;
      swatch.style.background = t.gradient;
      swatch.innerHTML = owned
        ? active
          ? `<span class="theme-check">${checkSvg()}</span>`
          : ""
        : `<span class="theme-lock">${t.cost}🪙</span>`;
      swatch.title = t.label;
      swatch.addEventListener("click", () => {
        if (owned) {
          state.activeTheme = t.id;
          saveState();
          applyTheme();
          renderAll();
          return;
        }
        if (state.coins < t.cost) {
          toast("Недостаточно монет");
          return;
        }
        state.coins -= t.cost;
        state.unlockedThemes.push(t.id);
        state.activeTheme = t.id;
        saveState();
        applyTheme();
        toast(`Тема «${t.label}» открыта`);
        renderAll();
      });
      themeRow.appendChild(swatch);
    });
    wrap.appendChild(shopHeader("Темы оформления"));
    wrap.appendChild(themeRow);

    // Custom categories
    const slotCost = CATEGORY_SLOT_BASE_COST + state.categorySlotsPurchased * CATEGORY_SLOT_STEP;
    const unfilledSlots = state.categorySlotsPurchased - state.customCategories.length;

    wrap.appendChild(shopHeader("Свои категории"));

    if (unfilledSlots > 0) {
      const addRow = document.createElement("div");
      addRow.className = "category-add-row";
      addRow.innerHTML = `
        <input class="text-input" type="text" placeholder="Название категории" maxlength="20" />
        <button type="button" class="btn btn-primary">Добавить</button>
      `;
      const input = addRow.querySelector("input");
      const btn = addRow.querySelector("button");
      btn.addEventListener("click", () => {
        const name = input.value.trim();
        if (!name) {
          toast("Введите название");
          return;
        }
        const cls = CUSTOM_CATEGORY_CLASSES[state.customCategories.length % CUSTOM_CATEGORY_CLASSES.length];
        state.customCategories.push({ id: `custom-${Date.now()}`, label: name, cls });
        saveState();
        toast("Категория добавлена");
        renderAll();
      });
      wrap.appendChild(addRow);
    }

    const slotRow = document.createElement("button");
    slotRow.type = "button";
    slotRow.className = "profile-row shop-row";
    slotRow.innerHTML = `
      <span class="left">🏷️ Слот категории<span class="shop-sub">Открыто: ${state.categorySlotsPurchased}</span></span>
      <span class="shop-price">${slotCost} 🪙</span>
    `;
    slotRow.addEventListener("click", () => {
      if (state.coins < slotCost) {
        toast("Недостаточно монет");
        return;
      }
      state.coins -= slotCost;
      state.categorySlotsPurchased += 1;
      saveState();
      toast("Слот открыт — придумайте название ниже");
      renderAll();
    });
    wrap.appendChild(slotRow);

    if (state.customCategories.length) {
      const list = document.createElement("div");
      list.className = "chip-row";
      list.style.marginTop = "10px";
      state.customCategories.forEach((c) => {
        const chip = document.createElement("span");
        chip.className = "chip selected";
        chip.innerHTML = `<span class="dot ${c.cls}"></span>${c.label}`;
        list.appendChild(chip);
      });
      wrap.appendChild(list);
    }

    return wrap;
  }

  function daysWord(n) {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return "дней";
    if (last === 1) return "день";
    if (last >= 2 && last <= 4) return "дня";
    return "дней";
  }

  function updateTopbar(view) {
    if (view === "today") {
      const today = todayStr();
      const due = remindersDueOn(today);
      const doneCount = due.filter((r) => isDoneOn(r, today)).length;
      els.dateLabel.textContent = capitalize(formatFullDate(today));
      els.viewTitle.textContent = "Сегодня";
      els.viewFrac.innerHTML = due.length ? `<span class="done">${doneCount}</span>/${due.length}` : "";
      els.progressTrack.style.display = due.length ? "block" : "none";
      els.progressFill.style.width = due.length ? `${(doneCount / due.length) * 100}%` : "0%";
      return;
    }
    els.dateLabel.textContent = "";
    els.viewFrac.textContent = "";
    els.progressTrack.style.display = "none";
    els.viewTitle.textContent = { all: "Все напоминания", favorites: "Избранное", notes: "Заметки", profile: "Профиль" }[view] || "";
  }

  function renderAll() {
    decayStreakIfMissed();
    renderToday();
    renderAllList();
    renderFavorites();
    renderNotes();
    renderProfile();
    updateTopbar(currentView);
    updateCoinBadge();
  }

  function switchView(view) {
    currentView = view;
    Object.entries(els.views).forEach(([key, el]) => {
      el.hidden = key !== view;
    });
    els.navBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
    els.fab.style.display = view === "notes" ? "none" : "flex";
    updateTopbar(view);
    window.scrollTo({ top: 0 });
  }

  els.navBtns.forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));

  // ---------- add sheet ----------
  let selectedCategory = "health";
  let selectedRepeat = "none";
  let selectedWeekdays = new Set([todayDate().getDay()]);
  let selectedGroupId = null;
  let selectedFolderId = null;
  let selectedPriority = "none";

  function buildPriorityFormChips() {
    const row = document.getElementById("f-priority");
    row.innerHTML = "";
    const noneChip = document.createElement("button");
    noneChip.type = "button";
    noneChip.className = `chip${selectedPriority === "none" ? " selected" : ""}`;
    noneChip.textContent = "Нет";
    noneChip.addEventListener("click", () => {
      selectedPriority = "none";
      buildPriorityFormChips();
    });
    row.appendChild(noneChip);
    PRIORITY_DEFS.forEach((p) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `chip${selectedPriority === p.id ? " selected" : ""}`;
      chip.innerHTML = `<span class="dot" style="background:${p.color}"></span>${p.label}`;
      chip.addEventListener("click", () => {
        selectedPriority = p.id;
        buildPriorityFormChips();
      });
      row.appendChild(chip);
    });
  }

  function buildGroupChips() {
    const row = document.getElementById("f-group");
    row.innerHTML = "";
    const noneChip = document.createElement("button");
    noneChip.type = "button";
    noneChip.className = `chip${!selectedGroupId && !selectedFolderId ? " selected" : ""}`;
    noneChip.textContent = "Без папки";
    noneChip.addEventListener("click", () => {
      selectedGroupId = null;
      selectedFolderId = null;
      buildGroupChips();
    });
    row.appendChild(noneChip);

    state.orgFolders.forEach((folder) => {
      const folderChip = document.createElement("button");
      folderChip.type = "button";
      folderChip.className = `chip${!selectedGroupId && selectedFolderId === folder.id ? " selected" : ""}`;
      folderChip.innerHTML = `${folderSvg()} ${folder.name}`;
      folderChip.addEventListener("click", () => {
        selectedGroupId = null;
        selectedFolderId = folder.id;
        buildGroupChips();
      });
      row.appendChild(folderChip);

      groupsInFolder(folder.id).forEach((g) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `chip${selectedGroupId === g.id ? " selected" : ""}`;
        chip.textContent = `${folder.name} / ${g.name}`;
        chip.addEventListener("click", () => {
          selectedGroupId = g.id;
          selectedFolderId = null;
          buildGroupChips();
        });
        row.appendChild(chip);
      });
    });
  }

  function buildCategoryChips() {
    const row = document.getElementById("f-category");
    row.innerHTML = "";
    allCategories().forEach((cat) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `chip${cat.id === selectedCategory ? " selected" : ""}`;
      chip.innerHTML = `<span class="dot ${cat.cls}"></span>${cat.label}`;
      chip.addEventListener("click", () => {
        selectedCategory = cat.id;
        buildCategoryChips();
      });
      row.appendChild(chip);
    });
  }

  function buildRepeatChips() {
    const row = document.getElementById("f-repeat");
    row.innerHTML = "";
    REPEAT_OPTIONS.forEach((opt) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `chip${opt.id === selectedRepeat ? " selected" : ""}`;
      chip.textContent = opt.label;
      chip.addEventListener("click", () => {
        selectedRepeat = opt.id;
        buildRepeatChips();
        document.getElementById("f-date-field").style.display = selectedRepeat === "none" ? "block" : "none";
        document.getElementById("f-weekdays-field").style.display = selectedRepeat === "weekly" ? "block" : "none";
      });
      row.appendChild(chip);
    });
  }

  function buildWeekdayChips() {
    const row = document.getElementById("f-weekdays");
    row.innerHTML = "";
    WEEKDAY_LABELS.forEach((label, idx) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `chip day${selectedWeekdays.has(idx) ? " selected" : ""}`;
      chip.textContent = label;
      chip.addEventListener("click", () => {
        if (selectedWeekdays.has(idx)) selectedWeekdays.delete(idx);
        else selectedWeekdays.add(idx);
        buildWeekdayChips();
      });
      row.appendChild(chip);
    });
  }

  function openSheet(presetGroupId, presetFolderId) {
    els.form.reset();
    selectedCategory = "health";
    selectedRepeat = "none";
    selectedWeekdays = new Set([todayDate().getDay()]);
    selectedGroupId = presetGroupId || null;
    selectedFolderId = presetFolderId || null;
    selectedPriority = "none";
    document.getElementById("f-date").value = todayStr();
    document.getElementById("f-time").value = "09:00";
    document.getElementById("f-date-field").style.display = "block";
    document.getElementById("f-weekdays-field").style.display = "none";
    buildCategoryChips();
    buildGroupChips();
    buildPriorityFormChips();
    buildRepeatChips();
    buildWeekdayChips();
    els.overlay.classList.add("show");
    els.sheet.classList.add("show");
    setTimeout(() => document.getElementById("f-title").focus(), 250);
  }

  function closeSheet() {
    els.overlay.classList.remove("show");
    els.sheet.classList.remove("show");
  }

  els.fab.addEventListener("click", () => openSheet());
  els.overlay.addEventListener("click", closeSheet);
  document.getElementById("f-cancel").addEventListener("click", closeSheet);

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = document.getElementById("f-title").value.trim();
    const time = document.getElementById("f-time").value || "09:00";
    if (!title) return;

    if (selectedRepeat === "weekly" && selectedWeekdays.size === 0) {
      toast("Выберите хотя бы один день недели");
      return;
    }

    const reminder = {
      id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      time,
      category: selectedCategory,
      repeat: selectedRepeat,
      date: selectedRepeat === "none" ? (document.getElementById("f-date").value || todayStr()) : null,
      weekdays: selectedRepeat === "weekly" ? Array.from(selectedWeekdays) : [],
      done: false,
      completions: {},
      favorite: false,
      note: "",
      groupId: selectedGroupId,
      folderId: selectedFolderId,
      priority: selectedPriority,
      subtasks: [],
      snoozedUntil: null,
      createdAt: Date.now(),
    };
    state.reminders.push(reminder);
    saveState();
    closeSheet();
    toast("Напоминание добавлено");
    renderAll();
  });

  // ---------- foreground notifications ----------
  function checkDueNotifications() {
    if (!state.notificationsEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
    const today = todayStr();
    const now = new Date();
    const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    remindersDueOn(today).forEach((r) => {
      if (isDoneOn(r, today)) return;
      if (r.time !== hhmm) return;
      const key = `${r.id}-${today}`;
      if (state.notifiedLog[key]) return;
      state.notifiedLog[key] = true;
      saveState();
      new Notification("Remindly", { body: r.title, icon: "../icons/icon-192.png" });
    });
  }
  setInterval(checkDueNotifications, 20000);

  // ---------- update banner ----------
  const updateBanner = document.getElementById("update-banner");
  function showUpdateBanner() {
    if (!updateBanner) return;
    updateBanner.hidden = false;
  }
  document.getElementById("update-reload-btn")?.addEventListener("click", () => {
    window.location.reload();
  });

  // ---------- init ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("../sw.js")
        .then((reg) => {
          if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner();
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                showUpdateBanner();
              }
            });
          });
          setInterval(() => reg.update(), 60000);
        })
        .catch(() => {});
    });
  }

  applyTheme();
  saveState();
  renderAll();

  // ---------- app shortcuts (from manifest) ----------
  (() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    if (view && els.views[view]) switchView(view);
    if (params.get("action") === "new") {
      setTimeout(() => openSheet(), 300);
    }
    if (view || params.has("action")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  })();
})();
