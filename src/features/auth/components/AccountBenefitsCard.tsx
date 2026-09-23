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
import { Crown, Lock, Clock, Infinity as InfinityIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { formatDateShort } from "@/shared/utils/format";
import { unlockRemaining } from "@/shared/utils/membership-view";
import { fetchMembershipStatus } from "@/core/api/membership";
import type { MembershipStatus } from "@/types";

export interface AccountBenefitsCardProps {
  /** 点击"查看套餐"时的回调（可选） */
  onViewPlans?: () => void;
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
      <div className="bg-secondary-50 border border-border rounded-xl p-4 animate-pulse">
        <div className="h-3 bg-secondary-200 rounded w-1/3 mb-2" />
        <div className="h-4 bg-secondary-200 rounded w-2/3" />
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
  // 总可用解锁：读额度账本 notice_view 池（“不限”归一为 9999）
  const totalRemaining = unlockRemaining(membership.quotas);

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
    <div className="bg-secondary-50 border border-border rounded-xl p-4">
      {/* 顶部：总可用次数 */}
      <div className="flex items-center gap-1.5 mb-2">
        {(() => {
          const Icon = themeIcon;
          return <Icon className={`w-3.5 h-3.5 ${themeColor}`} />;
        })()}
        <p className="font-medium text-xs text-muted-foreground">{t("statusPanelTotalUnlocks")}</p>
      </div>
      <div className="flex items-baseline gap-1 mb-2">
        {totalRemaining >= 9999 ? (
          <span className="text-xl font-semibold text-foreground">{t("membershipUnlimited")}</span>
        ) : (
          <>
            <span className={`text-xl font-semibold ${totalRemaining > 0 ? "text-foreground" : "text-danger-600"}`}>
              {totalRemaining}
            </span>
            <span className="text-xs text-muted-foreground">{t("statusPanelTimes")}</span>
          </>
        )}
      </div>

      {/* 分层明细：当前有效订阅（普通用户无订阅则不展示） */}
      <div className="space-y-1 pt-2 border-t border-border">
        {hasSubscription && subscription && (
          <div className="flex items-center gap-1.5 text-3xs">
            <Crown className="w-3 h-3 text-accent-500 flex-shrink-0" />
            <span className="font-medium text-foreground">{t("statusPanelSubscriptionTitle")}</span>
            <span className="text-muted-foreground truncate">{plan.name_zh}</span>
            {subscription.expires_at ? (
              <span className="flex items-center gap-0.5 text-muted-foreground ml-auto">
                <Clock className="w-2.5 h-2.5" />
                {formatDateShort(subscription.expires_at)}
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-success-600 ml-auto">
                <InfinityIcon className="w-2.5 h-2.5" />
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
          className="w-full mt-2 px-0 text-primary-600 hover:text-primary-700 text-center"
        >
          {t("statusPanelUpgradeBtn")} →
        </Button>
      )}
    </div>
  );
}

AccountBenefitsCard.displayName = "AccountBenefitsCard";
