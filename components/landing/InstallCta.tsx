import InstallPromptButton from "@/components/InstallPromptButton";

export default function InstallCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <div className="cover-a noise-overlay flex flex-col items-center gap-5 rounded-3xl px-6 py-16 text-center text-bg">
        <h2 className="text-3xl font-black sm:text-4xl">
          Установите Remindly за 5 секунд
        </h2>
        <p className="max-w-md text-bg/80">
          Без App Store и Google Play — приложение ставится прямо из браузера
          и работает как настоящее нативное приложение.
        </p>
        <InstallPromptButton className="inline-flex items-center gap-2 rounded-full bg-bg px-7 py-3.5 text-sm font-semibold text-text active:scale-95 transition-transform" />
      </div>
    </section>
  );
}
