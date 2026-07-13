"use client";

import Link from "next/link";
import { Flame, ListChecks, Heart, ArrowLeft } from "lucide-react";
import { useAppData } from "@/lib/AppDataContext";

export default function ProfilePage() {
  const { reminders, streak } = useAppData();

  const stats = {
    total: reminders.length,
    done: reminders.filter((r) => r.done).length,
    liked: reminders.filter((r) => r.liked).length,
  };

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold">Профиль</h1>

      <div className="mb-4 rounded-2xl cover-b p-5">
        <div className="flex items-center gap-2 text-bg">
          <Flame size={22} />
          <span className="text-lg font-bold">{streak.count}</span>
          <span className="text-sm font-medium">
            {streak.count === 1 ? "день подряд" : "дней подряд"}
          </span>
        </div>
        <p className="mt-1 text-xs text-bg/70">
          Выполняйте все напоминания за день, чтобы не терять стрик
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface p-4">
          <ListChecks size={18} className="mb-2 text-accent" />
          <p className="text-xl font-bold">{stats.done}/{stats.total}</p>
          <p className="text-xs text-muted">выполнено всего</p>
        </div>
        <div className="rounded-2xl bg-surface p-4">
          <Heart size={18} className="mb-2 text-accent-2" />
          <p className="text-xl font-bold">{stats.liked}</p>
          <p className="text-xs text-muted">в избранном</p>
        </div>
      </div>

      <Link
        href="/"
        className="flex items-center justify-center gap-2 rounded-xl bg-surface py-3 text-sm text-muted"
      >
        <ArrowLeft size={16} />
        На сайт Remindly
      </Link>
    </div>
  );
}
