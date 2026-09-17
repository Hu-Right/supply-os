/**
 * 设置中心共享布局
 * @module app/(public)/settings/layout
 * @description 左侧导航菜单 + 右侧内容区。移动端导航折叠为顶部横向 Tab。
 */
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cpu, User } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { cn } from "@/shared/utils/cn";

const NAV_ITEMS = [
  { href: "/settings/profile", labelKey: "settingsProfile", icon: User },
  { href: "/settings/ai-model", labelKey: "settingsAiModel", icon: Cpu },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useLocale();
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-xl font-extrabold text-slate-900 mb-6">{t("settingsTitle") || "账户设置"}</h1>
      <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-6">
        {/* 左侧导航（移动端横向 Tab） */}
        <nav className="flex md:flex-col gap-2 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold whitespace-nowrap transition-colors",
                  active ? "bg-teal-50 text-teal-700" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
        {/* 右侧内容区 */}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
