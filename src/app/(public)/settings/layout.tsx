/**
 * 设置中心共享布局
 * @module app/(public)/settings/layout
 * @description 左侧导航菜单 + 右侧内容区。移动端导航折叠为顶部横向 Tab。
 */
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cpu, User, Building2, Package, AlertTriangle, ClipboardList } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { cn } from "@/shared/utils/cn";
import { useEnterpriseInfo } from "@/shared/hooks/useEnterpriseInfo";
import { useHasSupplierPool } from "@/shared/hooks/useHasSupplierPool";
import { useUserId } from "@/core/auth/useUserId";

const NAV_ITEMS = [
  { href: "/settings/profile", labelKey: "settingsProfile", icon: User },
  { href: "/settings/rfq", labelKey: "settingsMyRfq", icon: ClipboardList },
  { href: "/settings/enterprise", labelKey: "settingsEnterprise", icon: Building2 },
  { href: "/settings/supplier-pool", labelKey: "settingsSupplierPool", icon: Package },
  { href: "/settings/ai-model", labelKey: "settingsAiModel", icon: Cpu },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useLocale();
  const userId = useUserId();
  const { bound, loading: entLoading, error: entError } = useEnterpriseInfo();
  const { hasPool, loading: poolLoading, error: poolError } = useHasSupplierPool(userId);

  // 身份未确定（loading/error）期间不弹引导横幅，避免闪现。
  const identityUncertain = entLoading || poolLoading || !!entError || !!poolError;
  // 未选择身份状态：两者都未绑定且身份状态已确定，才显示引导横幅
  const isUncommitted = !identityUncertain && !bound && !hasPool && !!userId;

  return (
    // 居左布局：侧栏固定左侧，内容区向右铺满（参考智谱用户中心），不居中不限宽
    <div className="w-full px-6 lg:px-10 py-8">
      <h1 className="text-lg font-semibold text-foreground mb-6">{t("settingsTitle") || "账户设置"}</h1>

      {/* 身份选择引导横幅 */}
      {isUncommitted && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="text-sm font-bold text-blue-900">
                {t("settingsIdentityChoice") || "请选择您的身份"}
              </p>
              <p className="text-xs text-blue-700 leading-5">
                {t("settingsIdentityChoiceDesc") || "您需要选择以哪种身份使用平台："}
                <strong>{t("settingsIdentityEnterprise") || "企业用户"}</strong>
                {t("settingsIdentityEnterpriseDesc") || "（我有自己的工厂/公司，评估我的企业是否适合投标）或 "}
                <strong>{t("settingsIdentityAgent") || "外贸员"}</strong>
                {t("settingsIdentityAgentDesc") || "（我代理多家工厂，帮他们匹配采购机会）。"}
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-8">
        {/* 左侧导航（移动端横向 Tab） */}
        <nav className="flex md:flex-col gap-1 overflow-x-auto">
          <p className="hidden md:block text-2xs text-muted-foreground px-3 mb-2">{t("settingsNavGroup") || "设置"}</p>
          {NAV_ITEMS.map((item) => {
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
