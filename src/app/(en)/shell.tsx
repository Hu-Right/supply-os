// i18n-allow-file: 英文站点外壳，品牌与导航为英文固定文案
/**
 * 英文站点共用外壳（/en/*）
 *
 * 英文分组是独立根布局，但视觉语言与中文站保持同一套：
 * 白色品牌头 + 深海军蓝导航 + 浅灰页脚，避免“英文站像另一个产品”。
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { LanguageSwitcher } from "@/shared/layout/LanguageSwitcher";
import { Brand } from "@/shared/layout/Brand";
import { cn } from "@/shared/utils";

const EN_NAV = [
  { href: "/en/procurement", label: "Notices" },
  { href: "/en/supplier", label: "Suppliers" },
  { href: "/en/services", label: "Services" },
  { href: "/en/about", label: "About" },
  { href: "/en/contact", label: "Contact" },
];

export function EnglishShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-secondary-50">
      <header className="sticky top-0 z-40 border-b border-secondary-200/80 bg-white/95 shadow-xs backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <Brand name="Yunjing · International Procurement Platform" href="/en" />
          <div className="flex shrink-0 items-center gap-3">
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <nav className="hidden bg-secondary-900 text-secondary-200 md:block">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-1 px-4 py-2 sm:px-6 lg:px-8">
          {EN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                "hover:bg-secondary-800 hover:text-white",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>

      <footer className="border-t border-secondary-200 bg-secondary-100 py-6 text-xs text-secondary-400">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
          <span>© 2026 Yunjing International Procurement Platform</span>
          <span className="flex gap-4">
            <Link href="/en" className="transition-colors hover:text-secondary-600 hover:underline">
              Home
            </Link>
            <Link href="/terms" className="transition-colors hover:text-secondary-600 hover:underline">
              Terms
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-secondary-600 hover:underline">
              Privacy
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
