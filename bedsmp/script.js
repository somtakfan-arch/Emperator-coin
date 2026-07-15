(() => {
  const SERVER_IP = "bedsmp.pro";

  const toastEl = document.getElementById("toast");
  let toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
  }

  function copyIp() {
    const done = () => toast("IP скопирован: " + SERVER_IP);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(SERVER_IP).then(done).catch(() => fallbackCopy(done));
    } else {
      fallbackCopy(done);
    }
  }

  function fallbackCopy(done) {
    const ta = document.createElement("textarea");
    ta.value = SERVER_IP;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      done();
    } catch (e) {
      toast("Адрес сервера: " + SERVER_IP);
    }
    document.body.removeChild(ta);
  }

  [
    "copy-ip-header",
    "copy-ip-mobile",
    "copy-ip-hero",
    "copy-ip-box",
    "copy-ip-cta",
    "copy-ip-stat",
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener("click", copyIp);
  });

  // Mobile nav toggle
  const navToggle = document.getElementById("nav-toggle");
  const mobileMenu = document.getElementById("mobile-menu");
  navToggle?.addEventListener("click", () => {
    const open = mobileMenu.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
  });
  mobileMenu?.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => mobileMenu.classList.remove("open"));
  });

  // Live server status (public Minecraft server status API)
  const onlineEl = document.getElementById("stat-online");
  const versionEl = document.getElementById("stat-version");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");

  if (onlineEl || versionEl || statusDot) {
    fetch("https://api.mcsrvstat.us/3/" + SERVER_IP)
      .then((r) => r.json())
      .then((data) => {
        if (data.online) {
          if (onlineEl) onlineEl.textContent = `${data.players?.online ?? "—"}/${data.players?.max ?? "—"}`;
          if (versionEl) versionEl.textContent = data.version || "—";
          if (statusDot) statusDot.classList.remove("offline");
          if (statusText) statusText.textContent = "Сервер онлайн";
        } else {
          if (onlineEl) onlineEl.textContent = "—";
          if (versionEl) versionEl.textContent = "—";
          if (statusDot) statusDot.classList.add("offline");
          if (statusText) statusText.textContent = "Сервер оффлайн";
        }
      })
      .catch(() => {
        if (onlineEl) onlineEl.textContent = "—";
        if (versionEl) versionEl.textContent = "—";
        if (statusDot) statusDot.classList.add("offline");
        if (statusText) statusText.textContent = "Статус недоступен";
      });
  }
})();
