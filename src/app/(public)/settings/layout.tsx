/**
 * 设置中心共享布局
 * @module app/(public)/settings/layout
 * @description 左侧导航菜单 + 右侧内容区。移动端导航折叠为顶部横向 Tab。
 */
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cpu, User, Building2, Package } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { cn } from "@/shared/utils/cn";
import { useEnterpriseInfo } from "@/features/auth/hooks/useEnterpriseInfo";
import { useHasSupplierPool } from "@/features/procurement/hooks/useHasSupplierPool";
import { useUserId } from "@/core/auth/useUserId";

const NAV_ITEMS = [
  { href: "/settings/profile", labelKey: "settingsProfile", icon: User },
  { href: "/settings/enterprise", labelKey: "settingsEnterprise", icon: Building2, exclusive: "enterprise" as const },
  { href: "/settings/supplier-pool", labelKey: "settingsSupplierPool", icon: Package, exclusive: "pool" as const },
  { href: "/settings/ai-model", labelKey: "settingsAiModel", icon: Cpu },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useLocale();
  const userId = useUserId();
  const { bound, loading: entLoading } = useEnterpriseInfo();
  const { hasPool, loading: poolLoading } = useHasSupplierPool(userId);

  // 互斥逻辑：绑定了企业→隐藏资源库；添加了供应商→隐藏企业信息；都没做→都显示
  const filterNav = (item: typeof NAV_ITEMS[number]) => {
    if (item.exclusive === "enterprise" && hasPool) return false;
    if (item.exclusive === "pool" && bound) return false;
    return true;
  };

  return (
    // 居左布局：侧栏固定左侧，内容区向右铺满（参考智谱用户中心），不居中不限宽
    <div className="w-full px-6 lg:px-10 py-8">
      <h1 className="text-lg font-semibold text-foreground mb-6">{t("settingsTitle") || "账户设置"}</h1>
      <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-8">
        {/* 左侧导航（移动端横向 Tab） */}
        <nav className="flex md:flex-col gap-1 overflow-x-auto">
          <p className="hidden md:block text-2xs text-muted-foreground px-3 mb-2">{t("settingsNavGroup") || "设置"}</p>
          {NAV_ITEMS.filter(filterNav).map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "bg-secondary-100 text-foreground font-medium"
                    : "text-muted-foreground hover:bg-secondary-50 hover:text-foreground",
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
