"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { useAppData } from "@/lib/AppDataContext";
import { CATEGORIES, type CategoryId, type RepeatMode } from "@/lib/types";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function AddReminderFab() {
  const { addReminder } = useAppData();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState("09:00");
  const [category, setCategory] = useState<CategoryId>("a");
  const [repeat, setRepeat] = useState<RepeatMode>("none");

  function reset() {
    setTitle("");
    setDate(todayStr());
    setTime("09:00");
    setCategory("a");
    setRepeat("none");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    addReminder({ title: title.trim(), date, time, category, repeat });
    reset();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Добавить напоминание"
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-bg shadow-[0_8px_24px_rgba(233,255,77,0.35)] active:scale-90 transition-transform"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-40 flex items-end justify-center bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.form
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleSubmit}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}
              className="w-full max-w-md rounded-t-3xl bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Новое напоминание</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Закрыть"
                  className="text-muted"
                >
                  <X size={20} />
                </button>
              </div>

              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Что напомнить?"
                className="mb-3 w-full rounded-xl bg-surface-2 px-4 py-3 text-[15px] outline-none placeholder:text-muted"
              />

              <div className="mb-3 grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-xl bg-surface-2 px-3 py-3 text-sm outline-none"
                />
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="rounded-xl bg-surface-2 px-3 py-3 text-sm outline-none"
                />
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-opacity ${
                      category === c.id ? "opacity-100" : "opacity-40"
                    } bg-surface-2`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${c.cover}`} />
                    {c.label}
                  </button>
                ))}
              </div>

              <div className="mb-5 flex gap-2">
                {(
                  [
                    { id: "none", label: "Один раз" },
                    { id: "daily", label: "Каждый день" },
                    { id: "weekly", label: "Каждую неделю" },
                  ] as { id: RepeatMode; label: string }[]
                ).map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => setRepeat(r.id)}
                    className={`rounded-full px-3 py-1.5 text-xs ${
                      repeat === r.id ? "bg-accent text-bg" : "bg-surface-2 text-muted"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-accent py-3.5 text-center text-[15px] font-semibold text-bg active:scale-[0.98] transition-transform"
              >
                Добавить
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
