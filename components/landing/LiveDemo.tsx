"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import LikeButton from "@/components/app/LikeButton";

interface DemoItem {
  id: string;
  title: string;
  time: string;
  cover: string;
  done: boolean;
  liked: boolean;
}

const INITIAL: DemoItem[] = [
  { id: "1", title: "Растяжка перед сном", time: "22:30", cover: "cover-c", done: false, liked: false },
  { id: "2", title: "Позвонить маме", time: "19:00", cover: "cover-a", done: false, liked: true },
  { id: "3", title: "Сдать отчёт", time: "11:00", cover: "cover-b", done: true, liked: false },
];

export default function LiveDemo() {
  const [items, setItems] = useState(INITIAL);

  function toggleDone(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }
  function toggleLike(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, liked: !i.liked } : i)));
  }

  return (
    <section id="demo" className="mx-auto max-w-6xl px-5 py-20">
      <div className="mx-auto max-w-md text-center">
        <h2 className="mb-2 text-3xl font-bold">Попробуйте прямо здесь</h2>
        <p className="mb-8 text-muted">
          Нажмите на кружок, чтобы отметить готово, и на сердечко — чтобы
          почувствовать анимацию лайка.
        </p>
      </div>

      <div className="mx-auto max-w-md rounded-3xl bg-surface p-4">
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-3"
            >
              <button
                type="button"
                onClick={() => toggleDone(item.id)}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.cover} ${
                  item.done ? "animate-pop" : ""
                }`}
              >
                {item.done && <Check size={18} strokeWidth={3} className="text-bg" />}
              </button>
              <div className="min-w-0 flex-1 text-left">
                <p className={`truncate text-[15px] font-medium ${item.done ? "text-muted line-through" : "text-text"}`}>
                  {item.title}
                </p>
                <p className="text-xs text-muted">{item.time}</p>
              </div>
              <LikeButton liked={item.liked} onToggle={() => toggleLike(item.id)} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
