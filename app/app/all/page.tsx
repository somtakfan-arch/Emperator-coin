"use client";

import { AnimatePresence } from "framer-motion";
import { useAppData } from "@/lib/AppDataContext";
import ReminderCard from "@/components/app/ReminderCard";
import EmptyState from "@/components/app/EmptyState";

const MONTHS = [
  "янв", "фев", "мар", "апр", "мая", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function tomorrowStr() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function formatGroupLabel(date: string) {
  if (date === todayStr()) return "Сегодня";
  if (date === tomorrowStr()) return "Завтра";
  const d = new Date(date);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export default function AllPage() {
  const { reminders, ready } = useAppData();

  const sorted = [...reminders].sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
  );
  const map = new Map<string, typeof sorted>();
  for (const r of sorted) {
    const arr = map.get(r.date) ?? [];
    arr.push(r);
    map.set(r.date, arr);
  }
  const groups = Array.from(map.entries());

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold">Все напоминания</h1>

      {!ready ? null : groups.length === 0 ? (
        <EmptyState title="Пока пусто" subtitle="Добавьте напоминание, чтобы увидеть его здесь" />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([date, items]) => (
            <div key={date}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                {formatGroupLabel(date)}
              </p>
              <ul className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {items.map((r) => (
                    <ReminderCard key={r.id} reminder={r} />
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
