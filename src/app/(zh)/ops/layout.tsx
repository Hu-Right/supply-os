// i18n-allow-file: 运营后台（内部页面，仅白名单账号；不对外，无需 7 语言）
/**
 * 运营后台布局（/ops）
 *
 * @module app/(zh)/ops/layout
 * @description 独立的内部后台外壳：不套用前台 LayoutShell（无商城导航/页脚），
 *              只给运营/财务使用。入口不对外暴露，页面 noindex，接口由
 *              BILLING_OPS_USER_IDS 白名单控制。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ReceiptText, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "运营后台",
  robots: { index: false, follow: false, nocache: true },
};

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-secondary-50">
      <header className="border-b border-secondary-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <span className="flex items-center gap-2 text-sm font-black text-secondary-900">
            <ShieldCheck className="h-4 w-4 text-primary-600" />
            运营后台
          </span>
          <span className="text-xs text-secondary-400">内部使用 · 不对外</span>
          <nav className="ml-4 flex items-center gap-1 text-xs font-semibold">
            <Link href="/ops" className="rounded-md px-2.5 py-1.5 text-secondary-600 hover:bg-secondary-50">总览</Link>
            <Link href="/ops/invoices" className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-secondary-600 hover:bg-secondary-50">
              <ReceiptText className="h-3.5 w-3.5" />发票处理
            </Link>
          </nav>
          <Link href="/" className="ml-auto flex items-center gap-1 text-xs font-semibold text-secondary-500 hover:text-secondary-700">
            <ArrowLeft className="h-3.5 w-3.5" />返回前台
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
