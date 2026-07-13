"use client";

import { useState, useSyncExternalStore } from "react";
import { Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

function subscribeInstalled(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia("(display-mode: standalone)");
  const onChange = () => listener();
  media.addEventListener("change", onChange);

  const onBeforeInstall = (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
  };
  window.addEventListener("beforeinstallprompt", onBeforeInstall);

  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  };
}

function getInstalledSnapshot() {
  return window.matchMedia("(display-mode: standalone)").matches;
}

function getInstalledServerSnapshot() {
  return false;
}

export default function InstallPromptButton({ className }: { className?: string }) {
  const installed = useSyncExternalStore(
    subscribeInstalled,
    getInstalledSnapshot,
    getInstalledServerSnapshot
  );
  const [showIOSHint, setShowIOSHint] = useState(false);

  async function handleClick() {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      await prompt.prompt();
      await prompt.userChoice;
      return;
    }
    const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    if (isIOS) {
      setShowIOSHint(true);
      return;
    }
    window.location.href = "/app";
  }

  if (installed) return null;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={handleClick}
        className={
          className ??
          "inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-bg active:scale-95 transition-transform"
        }
      >
        <Download size={18} />
        Установить приложение
      </button>

      {showIOSHint && (
        <div className="absolute left-1/2 top-full z-10 mt-3 w-64 -translate-x-1/2 rounded-xl bg-surface-2 p-3 text-left text-xs text-muted shadow-xl">
          В Safari нажмите «Поделиться» → «На экран «Домой»», чтобы установить Remindly.
          <button
            type="button"
            onClick={() => setShowIOSHint(false)}
            className="mt-2 block text-accent"
          >
            Понятно
          </button>
        </div>
      )}
    </div>
  );
}
