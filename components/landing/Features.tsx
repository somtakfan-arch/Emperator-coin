import { Bell, Flame, Layers, Palette, Share2, Wifi } from "lucide-react";

const FEATURES = [
  {
    icon: Bell,
    cover: "cover-a",
    title: "Умные напоминания",
    desc: "Повторы по дням и неделям, категории и время — без лишних настроек.",
  },
  {
    icon: Flame,
    cover: "cover-c",
    title: "Стрики за регулярность",
    desc: "Выполняйте все задачи за день — счётчик стрика мотивирует не бросать.",
  },
  {
    icon: Palette,
    cover: "cover-b",
    title: "Дизайн как у любимой музыки",
    desc: "Тёмная тема, крупная типографика и градиентные обложки категорий.",
  },
  {
    icon: Wifi,
    cover: "cover-e",
    title: "Работает офлайн",
    desc: "Это PWA — данные хранятся на устройстве, интернет не нужен.",
  },
  {
    icon: Layers,
    cover: "cover-d",
    title: "Избранное в один тап",
    desc: "Сердечко с приятной анимацией закрепляет важное наверху.",
  },
  {
    icon: Share2,
    cover: "cover-f",
    title: "Устанавливается сразу",
    desc: "Без сторов и модерации — иконка на экране «Домой» за 5 секунд.",
  },
];

export default function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-20">
      <h2 className="mb-2 text-3xl font-bold">Всё нужное, ничего лишнего</h2>
      <p className="mb-10 max-w-xl text-muted">
        Каждая функция сделана так, чтобы возвращаться в приложение снова —
        именно это отличает топовые продукты от забытых на второй день.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, cover, title, desc }) => (
          <div key={title} className="rounded-2xl bg-surface p-5">
            <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${cover}`}>
              <Icon size={18} className="text-bg" />
            </div>
            <h3 className="mb-1.5 font-semibold">{title}</h3>
            <p className="text-sm text-muted">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
