import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://remindly.app"),
  title: {
    default: "Remindly — напоминалка, которую хочется открывать каждый день",
    template: "%s · Remindly",
  },
  description:
    "Remindly — быстрое и красивое приложение-напоминалка с умными уведомлениями, стриками и виджетами. Устанавливается как настоящее приложение — прямо из браузера.",
  applicationName: "Remindly",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Remindly",
  },
  openGraph: {
    title: "Remindly — напоминалка, которую хочется открывать каждый день",
    description:
      "Умные напоминания, стрики и красивый дизайн. Установи Remindly в один тап.",
    type: "website",
    locale: "ru_RU",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-text">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
