export type CategoryId = "a" | "b" | "c" | "d" | "e" | "f";

export interface Category {
  id: CategoryId;
  label: string;
  cover: string;
}

export const CATEGORIES: Category[] = [
  { id: "a", label: "Личное", cover: "cover-a" },
  { id: "b", label: "Работа", cover: "cover-b" },
  { id: "c", label: "Здоровье", cover: "cover-c" },
  { id: "d", label: "Учёба", cover: "cover-d" },
  { id: "e", label: "Финансы", cover: "cover-e" },
  { id: "f", label: "Быт", cover: "cover-f" },
];

export type RepeatMode = "none" | "daily" | "weekly";

export interface Reminder {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  category: CategoryId;
  repeat: RepeatMode;
  done: boolean;
  liked: boolean;
  createdAt: number;
}
