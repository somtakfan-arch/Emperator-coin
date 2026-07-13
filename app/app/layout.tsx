import type { Metadata } from "next";
import BottomNav from "@/components/app/BottomNav";
import AddReminderFab from "@/components/app/AddReminderFab";

export const metadata: Metadata = {
  title: "Приложение",
};

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-1 flex-col bg-bg">
      <div className="flex-1 px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
        {children}
      </div>
      <AddReminderFab />
      <BottomNav />
    </div>
  );
}
