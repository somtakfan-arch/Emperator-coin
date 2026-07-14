(() => {
  const toastEl = document.getElementById("toast");
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  // Interactive demo (sandbox, not persisted)
  document.querySelectorAll(".demo-check").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".reminder-row").classList.toggle("done");
    });
  });

  document.querySelectorAll(".demo-like").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("liked");
      const svg = btn.querySelector("svg");
      if (btn.classList.contains("liked")) {
        svg.setAttribute("fill", "currentColor");
        btn.animate(
          [{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }],
          { duration: 320, easing: "ease-out" }
        );
      } else {
        svg.setAttribute("fill", "none");
      }
    });
  });

  // PWA install flow
  let deferredPrompt = null;
  const installButtons = [document.getElementById("install-btn"), document.getElementById("install-btn-2")].filter(Boolean);

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener("appinstalled", () => {
    toast("Remindly установлен 🎉");
    deferredPrompt = null;
  });

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  installButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (isStandalone()) {
        window.location.href = "app/";
        return;
      }
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (outcome === "accepted") {
          toast("Устанавливаем Remindly…");
        }
        return;
      }
      if (isIOS) {
        toast("В Safari: «Поделиться» → «На экран «Домой»»");
        setTimeout(() => (window.location.href = "app/"), 2200);
        return;
      }
      toast("Открываем приложение — установите через меню браузера");
      setTimeout(() => (window.location.href = "app/"), 1200);
    });
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
