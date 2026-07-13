"use client";

import { Check, Repeat, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import type { Reminder } from "@/lib/types";
import { CATEGORIES } from "@/lib/types";
import { useAppData } from "@/lib/AppDataContext";
import LikeButton from "./LikeButton";

export default function ReminderCard({ reminder }: { reminder: Reminder }) {
  const { toggleDone, toggleLike, removeReminder } = useAppData();
  const category = CATEGORIES.find((c) => c.id === reminder.category) ?? CATEGORIES[0];

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.25 }}
      className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-3"
    >
      <button
        type="button"
        onClick={() => toggleDone(reminder.id)}
        aria-label={reminder.done ? "Отменить выполнение" : "Отметить выполненным"}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${category.cover} ${
          reminder.done ? "animate-pop" : ""
        }`}
      >
        {reminder.done && (
          <Check size={18} strokeWidth={3} className="text-bg" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-[15px] font-medium ${
            reminder.done ? "text-muted line-through" : "text-text"
          }`}
        >
          {reminder.title}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <span>{reminder.time}</span>
          <span>·</span>
          <span>{category.label}</span>
          {reminder.repeat !== "none" && (
            <Repeat size={12} className="text-muted" />
          )}
        </div>
      </div>

      <LikeButton liked={reminder.liked} onToggle={() => toggleLike(reminder.id)} />

      <button
        type="button"
        aria-label="Удалить напоминание"
        onClick={() => removeReminder(reminder.id)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted/60 transition-colors hover:text-accent-2 active:scale-90"
      >
        <Trash2 size={16} />
      </button>
    </motion.li>
  );
}
