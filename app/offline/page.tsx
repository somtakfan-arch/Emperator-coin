export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center text-text">
      <div className="cover-b h-16 w-16 rounded-2xl" />
      <h1 className="text-xl font-semibold">Нет соединения</h1>
      <p className="max-w-xs text-sm text-muted">
        Remindly работает и офлайн — но эту страницу ещё нужно один раз открыть при подключении к интернету.
      </p>
    </main>
  );
}
