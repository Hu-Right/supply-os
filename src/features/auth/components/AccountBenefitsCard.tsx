/**
 * 账号权益卡片
 * Account Benefits Card
 *
 * @module features/auth/components/AccountBenefitsCard
 * @description 账号弹窗中的权益展示：显示总可用解锁次数与分层明细。
 *              Compact benefits display in auth modal: shows total unlocks and breakdown.
 */

import { useEffect, useState } from "react";
// Infinity 图标重命名避免遮蔽全局 Infinity（no-shadow-restricted-names）
import { Crown, Zap, Lock, Clock, Infinity as InfinityIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { fetchMembershipStatus } from "@/core/api/membership";
import type { MembershipStatus } from "@/types";

export interface AccountBenefitsCardProps {
  /** 点击"查看套餐"时的回调（可选） */
  onViewPlans?: () => void;
}

/** 格式化日期为短格式（含年份） */
function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export function AccountBenefitsCard({ onViewPlans }: AccountBenefitsCardProps) {
  const { t } = useLocale();
  const { authUser } = useAuth();
  const router = useRouter();
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authUser) {
      setLoading(false);
      return;
    }
    fetchMembershipStatus()
      .then(setMembership)
      .catch(() => setMembership(null))
      .finally(() => setLoading(false));
  }, [authUser]);

  if (loading || !authUser) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-3 animate-pulse">
        <div className="h-3 bg-slate-200 rounded w-1/3 mb-2" />
        <div className="h-4 bg-slate-200 rounded w-2/3" />
      </div>
    );
  }

  if (!membership) {
    // 数据加载失败，显示无权益状态
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-3">
        <div className="flex items-center gap-1.5 text-slate-500 mb-1">
          <Lock className="w-3.5 h-3.5" />
          <p className="font-black text-xs">{t("statusPanelNoEntitlement")}</p>
        </div>
        <Button
          onClick={() => onViewPlans ? onViewPlans() : router.push("/membership")}
          variant="link"
          size="sm"
          className="px-0 text-amber-600 hover:text-amber-700 text-xs"
        >
          {t("statusPanelUpgradeBtn")} →
        </Button>
      </div>
    );
  }

  const entitlements = membership.entitlements ?? [];
  const subscriptions = membership.active_subscriptions ?? [];
  const paidRemaining = Number(membership.paid_quota_remaining || 0);
  // 注意：paidRemaining（paid_quota_remaining）由后端从 entitlements 汇总得出，
  // 已包含所有单次解锁卡的剩余配额，不应再额外加 entitlementRemaining，否则会重复计算
  const totalRemaining = paidRemaining;
  // 过滤出真正的单次解锁卡（plan_code 以 single_ 开头），排除订阅制会员的配额
  const singleCards = entitlements.filter(e => e.plan_code.startsWith('single_'));
  const hasSubscription = subscriptions.length > 0;
  const hasSingleCard = singleCards.length > 0;
  // singleCardRemaining 仅用于显示，不参与 totalRemaining 计算
  const singleCardRemaining = singleCards.reduce((sum, e) => sum + Number(e.quota_remaining || 0), 0);

  const handleViewPlans = () => {
    if (onViewPlans) {
      onViewPlans();
    } else {
      router.push("/membership");
    }
  };

  // 根据最佳权益类型决定主色调
  const themeIcon = hasSubscription ? Crown : hasSingleCard ? Zap : Lock;
  const themeColor = hasSubscription ? "text-amber-600" : hasSingleCard ? "text-blue-600" : "text-slate-500";
  const themeBg = hasSubscription
    ? "from-amber-50 to-orange-50 border-amber-200/60"
    : hasSingleCard
      ? "from-blue-50 to-cyan-50 border-blue-200/60"
      : "bg-white border-slate-200";

  return (
    <div className={`bg-gradient-to-br ${themeBg} border rounded-lg p-3`}>
      {/* 顶部：总可用次数 */}
      <div className="flex items-center gap-1.5 mb-2">
        {(() => {
          const Icon = themeIcon;
          return <Icon className={`w-3.5 h-3.5 ${themeColor}`} />;
        })()}
        <p className="font-black text-xs text-slate-600">{t("statusPanelTotalUnlocks")}</p>
      </div>
      <div className="flex items-baseline gap-1 mb-2">
        <span className={`text-xl font-extrabold ${totalRemaining > 0 ? "text-slate-900" : "text-red-600"}`}>
          {totalRemaining}
        </span>
        <span className="text-xs text-slate-500">{t("statusPanelTimes")}</span>
      </div>

      {/* 分层明细 */}
      <div className="space-y-1 pt-2 border-t border-slate-200/40">
        {/* 订阅会员 */}
        {hasSubscription && (
          <div className="flex items-center gap-1.5 text-3xs">
            <Crown className="w-3 h-3 text-amber-500 flex-shrink-0" />
            <span className="font-bold text-slate-700">{t("statusPanelSubscriptionTitle")}</span>
            <span className="text-slate-600 truncate">{subscriptions[0].plan_name || subscriptions[0].plan_code}</span>
            {subscriptions[0].expires_at ? (
              <span className="flex items-center gap-0.5 text-slate-400 ml-auto">
                <Clock className="w-2.5 h-2.5" />
                {formatDateShort(subscriptions[0].expires_at)}
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-emerald-600 ml-auto">
                <InfinityIcon className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
        )}

        {/* 单次解锁卡（汇总） */}
        {hasSingleCard && (
          <div className="flex items-center gap-1.5 text-3xs">
            <Zap className="w-3 h-3 text-blue-500 flex-shrink-0" />
            <span className="font-bold text-slate-700">
              {t("statusPanelEntitlementCards", { count: singleCards.length })}
            </span>
            <span className="text-slate-600">{singleCardRemaining} {t("statusPanelTimes")}</span>
            {singleCards.some(e => !e.expires_at) ? (
              <span className="flex items-center gap-0.5 text-emerald-600 ml-auto">
                <InfinityIcon className="w-2.5 h-2.5" />
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-slate-400 ml-auto">
                <Clock className="w-2.5 h-2.5" />
                {formatDateShort(singleCards[0].expires_at!)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 升级引导 */}
      {totalRemaining === 0 && (
        <Button
          onClick={handleViewPlans}
          variant="link"
          size="sm"
          className="w-full mt-2 px-0 text-amber-600 hover:text-amber-700 text-center"
        >
          {t("statusPanelUpgradeBtn")} →
        </Button>
      )}
    </div>
  );
}

AccountBenefitsCard.displayName = "AccountBenefitsCard";
