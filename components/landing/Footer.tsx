import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-muted sm:flex-row">
        <div className="flex items-center gap-2 font-semibold text-text">
          <span className="h-5 w-5 rounded-md cover-a" />
          Remindly
        </div>
        <p>© {new Date().getFullYear()} Remindly. Сделано с заботой о вашем времени.</p>
        <Link href="/app" className="text-text hover:text-accent">
          Открыть приложение →
        </Link>
      </div>
    </footer>
  );
}
