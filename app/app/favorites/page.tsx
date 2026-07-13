"use client";

import { AnimatePresence } from "framer-motion";
import { useAppData } from "@/lib/AppDataContext";
import ReminderCard from "@/components/app/ReminderCard";
import EmptyState from "@/components/app/EmptyState";

export default function FavoritesPage() {
  const { reminders, ready } = useAppData();

  const liked = reminders
    .filter((r) => r.liked)
    .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold">Избранное</h1>

      {!ready ? null : liked.length === 0 ? (
        <EmptyState
          title="Нет избранных напоминаний"
          subtitle="Нажмите на сердечко у напоминания, чтобы закрепить его здесь"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {liked.map((r) => (
              <ReminderCard key={r.id} reminder={r} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
