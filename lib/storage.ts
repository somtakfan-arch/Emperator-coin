import type { Reminder } from "./types";

const REMINDERS_KEY = "remindly:reminders";
const STREAK_KEY = "remindly:streak";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function demoReminders(): Reminder[] {
  const today = todayStr();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return [
    {
      id: crypto.randomUUID(),
      title: "Выпить воды",
      date: today,
      time: "09:00",
      category: "c",
      repeat: "daily",
      done: false,
      liked: true,
      createdAt: Date.now(),
    },
    {
      id: crypto.randomUUID(),
      title: "Созвон с командой",
      date: today,
      time: "14:30",
      category: "b",
      repeat: "weekly",
      done: false,
      liked: false,
      createdAt: Date.now(),
    },
    {
      id: crypto.randomUUID(),
      title: "Оплатить интернет",
      date: tomorrow,
      time: "12:00",
      category: "e",
      repeat: "none",
      done: false,
      liked: false,
      createdAt: Date.now(),
    },
  ];
}

export function loadReminders(): Reminder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REMINDERS_KEY);
    if (!raw) {
      const seeded = demoReminders();
      saveReminders(seeded);
      return seeded;
    }
    return JSON.parse(raw) as Reminder[];
  } catch {
    return [];
  }
}

export function saveReminders(reminders: Reminder[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
}

export interface StreakData {
  count: number;
  lastCompletedDate: string | null;
}

export function loadStreak(): StreakData {
  if (typeof window === "undefined") return { count: 0, lastCompletedDate: null };
  try {
    const raw = window.localStorage.getItem(STREAK_KEY);
    if (!raw) return { count: 0, lastCompletedDate: null };
    return JSON.parse(raw) as StreakData;
  } catch {
    return { count: 0, lastCompletedDate: null };
  }
}

export function saveStreak(data: StreakData) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STREAK_KEY, JSON.stringify(data));
}
