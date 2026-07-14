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
    return {
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
      notifiedLog: {},
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return seedState();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.reminders)) return seedState();
      parsed.notifiedLog = parsed.notifiedLog || {};
      return parsed;
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

  function remindersDueOn(dateStr) {
    return state.reminders
      .filter((r) => isDueOn(r, dateStr))
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  function categoryInfo(id) {
    return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
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

  function decayStreakIfMissed() {
    const today = todayStr();
    const yesterday = addDaysStr(today, -1);
    const last = state.streak.lastCompleteDate;
    if (last && last !== today && last !== yesterday) {
      state.streak.count = 0;
    }
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

  function reminderRow(reminder, dateStr) {
    const done = isDoneOn(reminder, dateStr);
    const cat = categoryInfo(reminder.category);
    const row = document.createElement("div");
    row.className = `reminder-row${done ? " done" : ""}`;
    row.dataset.id = reminder.id;

    const check = document.createElement("button");
    check.className = `reminder-check ${cat.cls}`;
    check.setAttribute("aria-label", "Отметить выполненным");
    check.innerHTML = checkSvg();
    check.addEventListener("click", () => {
      setDoneOn(reminder, dateStr, !isDoneOn(reminder, dateStr));
      recalcStreak();
      saveState();
      renderAll();
    });

    const info = document.createElement("div");
    info.className = "reminder-info";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = reminder.title;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<span>${reminder.time}</span><span>·</span><span>${cat.label}</span>${
      reminder.repeat !== "none" ? `<span class="repeat-icon">${repeatSvg()}</span>` : ""
    }`;
    info.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "reminder-actions";

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

    actions.append(likeBtn, delBtn);
    row.append(check, info, actions);
    return row;
  }

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

    const siteLink = document.createElement("a");
    siteLink.className = "profile-row";
    siteLink.href = "/";
    siteLink.innerHTML = `<span class="left">← На сайт Remindly</span>`;

    container.append(streakCard, statGrid, notifRow, siteLink);
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
    els.viewTitle.textContent = { all: "Все напоминания", favorites: "Избранное", profile: "Профиль" }[view] || "";
  }

  function renderAll() {
    decayStreakIfMissed();
    renderToday();
    renderAllList();
    renderFavorites();
    renderProfile();
    updateTopbar(currentView);
  }

  function switchView(view) {
    currentView = view;
    Object.entries(els.views).forEach(([key, el]) => {
      el.hidden = key !== view;
    });
    els.navBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
    updateTopbar(view);
    window.scrollTo({ top: 0 });
  }

  els.navBtns.forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));

  // ---------- add sheet ----------
  let selectedCategory = "health";
  let selectedRepeat = "none";
  let selectedWeekdays = new Set([todayDate().getDay()]);

  function buildCategoryChips() {
    const row = document.getElementById("f-category");
    row.innerHTML = "";
    CATEGORIES.forEach((cat) => {
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

  function openSheet() {
    els.form.reset();
    selectedCategory = "health";
    selectedRepeat = "none";
    selectedWeekdays = new Set([todayDate().getDay()]);
    document.getElementById("f-date").value = todayStr();
    document.getElementById("f-time").value = "09:00";
    document.getElementById("f-date-field").style.display = "block";
    document.getElementById("f-weekdays-field").style.display = "none";
    buildCategoryChips();
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

  els.fab.addEventListener("click", openSheet);
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
      new Notification("Remindly", { body: r.title, icon: "/icons/icon-192.png" });
    });
  }
  setInterval(checkDueNotifications, 20000);

  // ---------- init ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  saveState();
  renderAll();
})();
