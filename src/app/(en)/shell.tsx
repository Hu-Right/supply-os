"use client";

// i18n-allow-file: 英文站点，语言切换器显示各语言母语名（含中文「中文」）
/**
 * 英文站点共用外壳（/en/*）
 *
 * 英文分组是独立根布局，不复用中文 (public)/layout-shell（那套导航与文案是中文且依赖登录体系）。
 * 这里只保留 SEO 必需的品牌、导航与语言切换。
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { LanguageSwitcher } from "@/shared/layout/LanguageSwitcher";

export function EnglishShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/en" className="flex items-center gap-2">
            <img src="/images/brand-icon.svg" alt="Yunjing" className="h-9 w-9" />
            <span className="text-base font-bold text-slate-900">Yunjing Procurement</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-slate-600">
            <Link href="/en/procurement" className="hover:text-training-green">Notices</Link>
            <Link href="/procurement" className="hover:text-training-green">Full search</Link>
            <LanguageSwitcher />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-slate-500">
          <span>© 2026 Yunjing International Procurement Platform</span>
          <span className="flex gap-3">
            <Link href="/terms" className="hover:underline">Terms</Link>
            <Link href="/privacy" className="hover:underline">Privacy</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
