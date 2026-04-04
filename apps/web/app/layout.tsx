import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#000000",
  initialScale: 1,
  width: "device-width",
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "LMS Platform",
  description: "Kurumsal Eğitim Yönetim Sistemi",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LMS Platform",
  },
};

import I18nProvider from "../components/I18nProvider";
import LanguageSwitcher from "../components/LanguageSwitcher";
import Shell from "../components/Shell";
import ThemeProvider, { ThemeToggle } from "./components/ThemeProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <I18nProvider>
            <Shell>
              <header className="topbar">
                <div className="brand">
                  <span style={{ fontSize: '1.5rem' }}>🎓</span>
                  LMS WEB
                </div>
                <div className="topbar-actions">
                  <ThemeToggle />
                  <LanguageSwitcher />
                </div>
              </header>
              {children}
            </Shell>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
