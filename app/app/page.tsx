"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useAppData } from "@/lib/AppDataContext";
import ReminderCard from "@/components/app/ReminderCard";
import EmptyState from "@/components/app/EmptyState";

const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function TodayPage() {
  const { reminders, ready, streak } = useAppData();
  const today = todayStr();
  const now = new Date();

  const todays = reminders
    .filter((r) => r.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));

  const doneCount = todays.filter((r) => r.done).length;
  const progress = todays.length ? Math.round((doneCount / todays.length) * 100) : 0;

  return (
    <div>
      <header className="mb-5">
        <p className="text-sm text-muted capitalize">
          {WEEKDAYS[now.getDay()]}, {now.getDate()} {MONTHS[now.getMonth()]}
        </p>
        <h1 className="mt-1 text-2xl font-bold">
          Сегодня <span className="gradient-text">{doneCount}/{todays.length || 0}</span>
        </h1>
        {streak.count > 0 && (
          <p className="mt-1 text-xs text-muted">🔥 Стрик: {streak.count} {streak.count === 1 ? "день" : "дня"} подряд</p>
        )}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </header>

      {!ready ? null : todays.length === 0 ? (
        <EmptyState
          title="На сегодня ничего не запланировано"
          subtitle="Нажмите на + внизу справа, чтобы добавить первое напоминание"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {todays.map((r) => (
              <ReminderCard key={r.id} reminder={r} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
