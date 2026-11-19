/**
 * 账号权益卡片
 * Account Benefits Card
 *
 * @module features/auth/components/AccountBenefitsCard
 * @description 账号页的权益展示：可查看范围 + 当前有效订阅。
 *              2026-11-19：查看次数限制已取消（各在售档 notice_view 均为不限），
 *              原「总可用查看 / 无限次」改为描述可查看的行业与公告范围。
 */

import { useEffect, useState } from "react";
import { Crown, Lock, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { Button, Skeleton } from "@/shared/ui";
import { formatDateShort } from "@/shared/utils/format";
import { accessRemaining, isUnlimitedQuota } from "@/shared/utils/membership-view";
import { fetchMembershipStatus } from "@/core/api/membership";
import type { MembershipStatusView } from "@/types";

export interface AccountBenefitsCardProps {
  /** 点击"查看套餐"时的回调（可选） */
  onViewPlans?: () => void;
}

export function AccountBenefitsCard({ onViewPlans }: AccountBenefitsCardProps) {
  const { t } = useLocale();
  const { authUser } = useAuth();
  const router = useRouter();
  const [membership, setMembership] = useState<MembershipStatusView | null>(null);
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
      <div className="bg-secondary-50 border border-border rounded-xl p-4" aria-busy="true">
        <Skeleton variant="text" className="h-3 w-1/3 mb-2" />
        <Skeleton variant="text" className="h-4 w-2/3" />
      </div>
    );
  }

  if (!membership) {
    // 数据加载失败，显示无权益状态
    return (
      <div className="bg-secondary-50 border border-border rounded-xl p-4">
        <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
          <Lock className="w-3.5 h-3.5" />
          <p className="font-medium text-xs">{t("statusPanelNoEntitlement")}</p>
        </div>
        <Button
          onClick={() => onViewPlans ? onViewPlans() : router.push("/membership")}
          variant="link"
          size="sm"
          className="px-0 text-primary-600 hover:text-primary-700 text-xs"
        >
          {t("statusPanelUpgradeBtn")} →
        </Button>
      </div>
    );
  }

  const subscription = membership.subscription;
  const plan = membership.plan;
  const hasSubscription = Boolean(subscription);
  // 可查看范围：notice_view 池为不限（quota_total=-1）即全行业全量公告
  const totalRemaining = accessRemaining(membership.quotas);
  const unlimited = isUnlimitedQuota(totalRemaining);

  const handleViewPlans = () => {
    if (onViewPlans) {
      onViewPlans();
    } else {
      router.push("/membership");
    }
  };

  // 根据是否有效订阅决定图标与强调色（单一强调色，不用渐变）
  const themeIcon = hasSubscription ? Crown : Lock;
  const themeColor = hasSubscription ? "text-accent-600" : "text-muted-foreground";

  return (
    <div className="bg-secondary-50 border border-border rounded-xl px-5 py-4">
      {/* 顶部：档位可查看能力（2026-11-19 取消次数限制；同日去掉解释副文案与 ∞ 标识） */}
      <div className="flex items-center gap-1.5 mb-1.5">
        {(() => {
          const Icon = themeIcon;
          return <Icon className={`w-3.5 h-3.5 ${themeColor}`} />;
        })()}
        <p className="text-xs font-medium text-muted-foreground">{t("statusPanelScope")}</p>
      </div>
      <p className="text-lg font-semibold leading-7 text-foreground">
        {unlimited
          ? t("statusPanelScopeAll")
          : totalRemaining > 0
            ? `${totalRemaining} ${t("statusPanelTimes")}`
            : t("statusPanelScopeFree")}
      </p>

      {/* 分层明细：当前有效订阅（普通用户无订阅则不展示） */}
      {hasSubscription && subscription && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs">
          <Crown className="w-3.5 h-3.5 shrink-0 text-accent-500" />
          <span className="font-medium text-foreground">{t("statusPanelSubscriptionTitle")}</span>
          <span className="min-w-0 truncate text-muted-foreground">{plan.nameZh}</span>
          {subscription.expiresAt ? (
            <span className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground">
              <Clock className="w-3 h-3" />
              {formatDateShort(subscription.expiresAt)}
            </span>
          ) : (
            <span className="ml-auto shrink-0 text-muted-foreground">{t("statusPanelPermanent")}</span>
          )}
        </div>
      )}

      {/* 升级引导 */}
      {totalRemaining === 0 && (
        <Button
          onClick={handleViewPlans}
          variant="link"
          size="sm"
          className="w-full mt-3 justify-start px-0 text-primary-600 hover:text-primary-700"
        >
          {t("statusPanelUpgradeBtn")} →
        </Button>
      )}
    </div>
  );
}

AccountBenefitsCard.displayName = "AccountBenefitsCard";
