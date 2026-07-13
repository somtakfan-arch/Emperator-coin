"use client";

import { useSyncExternalStore } from "react";
import type { Reminder, RepeatMode, CategoryId } from "./types";
import {
  loadReminders,
  saveReminders,
  loadStreak,
  saveStreak,
  type StreakData,
} from "./storage";

interface NewReminderInput {
  title: string;
  date: string;
  time: string;
  category: CategoryId;
  repeat: RepeatMode;
}

interface StoreSnapshot {
  reminders: Reminder[];
  streak: StreakData;
  ready: boolean;
}

const SERVER_SNAPSHOT: StoreSnapshot = {
  reminders: [],
  streak: { count: 0, lastCompletedDate: null },
  ready: false,
};

let snapshot: StoreSnapshot = SERVER_SNAPSHOT;
let initialized = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function ensureInitialized() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  snapshot = { reminders: loadReminders(), streak: loadStreak(), ready: true };
}

function setSnapshot(next: Partial<StoreSnapshot>) {
  snapshot = { ...snapshot, ...next };
  if (next.reminders) saveReminders(next.reminders);
  if (next.streak) saveStreak(next.streak);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  ensureInitialized();
  return snapshot;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function evaluateStreak(reminders: Reminder[]) {
  const today = todayStr();
  const todays = reminders.filter((r) => r.date === today);
  if (todays.length === 0 || !todays.every((r) => r.done)) return;
  if (snapshot.streak.lastCompletedDate === today) return;

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const continued = snapshot.streak.lastCompletedDate === yesterday;
  setSnapshot({
    streak: {
      count: continued ? snapshot.streak.count + 1 : 1,
      lastCompletedDate: today,
    },
  });
}

function addReminder(input: NewReminderInput) {
  const next = [
    {
      id: crypto.randomUUID(),
      done: false,
      liked: false,
      createdAt: Date.now(),
      ...input,
    },
    ...snapshot.reminders,
  ];
  setSnapshot({ reminders: next });
}

function toggleDone(id: string) {
  const next = snapshot.reminders.map((r) => (r.id === id ? { ...r, done: !r.done } : r));
  setSnapshot({ reminders: next });
  evaluateStreak(next);
}

function toggleLike(id: string) {
  const next = snapshot.reminders.map((r) => (r.id === id ? { ...r, liked: !r.liked } : r));
  setSnapshot({ reminders: next });
}

function removeReminder(id: string) {
  const next = snapshot.reminders.filter((r) => r.id !== id);
  setSnapshot({ reminders: next });
}

export function useAppData() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    reminders: state.reminders,
    ready: state.ready,
    streak: state.streak,
    addReminder,
    toggleDone,
    toggleLike,
    removeReminder,
  };
}
