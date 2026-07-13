const PRINCIPLES = [
  {
    title: "Ретеншн, а не разовая установка",
    desc: "Стрики и прогресс за день возвращают пользователя каждые 24 часа — именно retention решает место в топе, а не число загрузок.",
  },
  {
    title: "Первые 10 секунд решают всё",
    desc: "Ни регистрации, ни онбординга из десяти экранов — приложение открывается сразу на нужном экране с уже понятным интерфейсом.",
  },
  {
    title: "ASO с самого начала",
    desc: "Название, описание и скриншоты для сторов пишутся под поисковые запросы вроде «напоминалка», «to do список», «планировщик дня».",
  },
  {
    title: "Честные отзывы вместо накруток",
    desc: "Рейтинг растёт за счёт запроса отзыва в удачный момент (после закрытого стрика), а не платных ботов — так магазины не банят аккаунт.",
  },
];

export default function GrowthEngine() {
  return (
    <section id="growth" className="border-y border-border bg-surface/40 py-20">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="mb-2 text-3xl font-bold">Почему это реально может выстрелить</h2>
        <p className="mb-10 max-w-2xl text-muted">
          Топ-1 в App Store или Google Play — это не переключатель в коде, а
          результат месяцев удержания, отзывов и продвижения. Мы закладываем
          для этого честный фундамент:
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="rounded-2xl bg-surface p-5">
              <h3 className="mb-2 font-semibold">{p.title}</h3>
              <p className="text-sm text-muted">{p.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-xs text-muted">
          В разработке: нативные push-уведомления, виджет на главный экран и
          публикация в App Store / Google Play после сбора первых отзывов.
        </p>
      </div>
    </section>
  );
}
