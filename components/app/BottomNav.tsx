"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Heart, ListChecks, User } from "lucide-react";

const TABS = [
  { href: "/app", label: "Сегодня", icon: ListChecks },
  { href: "/app/all", label: "Все", icon: CalendarDays },
  { href: "/app/favorites", label: "Избранное", icon: Heart },
  { href: "/app/profile", label: "Профиль", icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-20 border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md items-stretch justify-between px-2">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px]"
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.4 : 1.8}
                className={active ? "text-accent" : "text-muted"}
              />
              <span className={active ? "text-accent" : "text-muted"}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
