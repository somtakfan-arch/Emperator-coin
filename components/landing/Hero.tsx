"use client";

import { motion } from "framer-motion";
import { Check, Heart, Repeat } from "lucide-react";
import InstallPromptButton from "@/components/InstallPromptButton";

const PREVIEW_ITEMS = [
  { title: "Выпить воды", time: "09:00", cover: "cover-c", done: true, liked: true, repeat: true },
  { title: "Созвон с командой", time: "14:30", cover: "cover-b", done: false, liked: false, repeat: true },
  { title: "Оплатить интернет", time: "18:00", cover: "cover-e", done: false, liked: false, repeat: false },
];

export default function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-14 md:grid-cols-2 md:items-center md:pt-24">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <p className="mb-4 inline-block rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">
          Устанавливается прямо из браузера — без сторов
        </p>
        <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
          Напоминалка,
          <br />
          которую <span className="gradient-text">хочется</span> открывать
        </h1>
        <p className="mt-5 max-w-md text-[17px] text-muted">
          Remindly помогает не забывать важное: умные напоминания, стрики за
          регулярность и дизайн уровня любимых музыкальных приложений — без
          лишних экранов и настроек.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <InstallPromptButton />
          <a
            href="#demo"
            className="text-sm font-medium text-text underline decoration-muted underline-offset-4 hover:decoration-text"
          >
            Сначала попробовать →
          </a>
        </div>
        <div className="mt-10 flex gap-8 text-sm">
          <div>
            <p className="text-xl font-bold">100%</p>
            <p className="text-muted">офлайн-режим</p>
          </div>
          <div>
            <p className="text-xl font-bold">&lt; 1 сек</p>
            <p className="text-muted">открытие приложения</p>
          </div>
          <div>
            <p className="text-xl font-bold">0 ₽</p>
            <p className="text-muted">без подписок</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="mx-auto w-full max-w-[300px]"
      >
        <div className="noise-overlay rounded-[2.5rem] border border-border bg-surface p-3 shadow-2xl">
          <div className="rounded-[2rem] bg-bg p-4">
            <p className="mb-1 text-xs text-muted">Воскресенье, 13 июля</p>
            <h2 className="mb-3 text-xl font-bold">
              Сегодня <span className="gradient-text">1/3</span>
            </h2>
            <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]" />
            </div>
            <ul className="flex flex-col gap-2">
              {PREVIEW_ITEMS.map((item) => (
                <li
                  key={item.title}
                  className="flex items-center gap-2.5 rounded-xl bg-surface px-2.5 py-2.5"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${item.cover}`}
                  >
                    {item.done && <Check size={14} strokeWidth={3} className="text-bg" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-[13px] font-medium ${
                        item.done ? "text-muted line-through" : "text-text"
                      }`}
                    >
                      {item.title}
                    </p>
                    <div className="flex items-center gap-1 text-[10px] text-muted">
                      <span>{item.time}</span>
                      {item.repeat && <Repeat size={9} />}
                    </div>
                  </div>
                  <Heart
                    size={15}
                    fill={item.liked ? "var(--accent-2)" : "none"}
                    stroke={item.liked ? "var(--accent-2)" : "var(--muted)"}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
