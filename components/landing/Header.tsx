import Link from "next/link";

export default function Header() {
  return (
    <header className="glass sticky top-0 z-30 border-b border-border">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="h-6 w-6 rounded-lg cover-a" />
          Remindly
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
          <a href="#features" className="hover:text-text">Возможности</a>
          <a href="#demo" className="hover:text-text">Попробовать</a>
          <a href="#growth" className="hover:text-text">Почему это сработает</a>
        </nav>

        <Link
          href="/app"
          className="rounded-full bg-surface-2 px-4 py-2 text-sm font-medium hover:bg-surface-3"
        >
          Открыть приложение
        </Link>
      </div>
    </header>
  );
}
