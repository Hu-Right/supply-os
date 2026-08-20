/**
 * 会员权益状态面板
 * Membership Status Panel
 *
 * @module features/membership/components/MembershipStatusPanel
 * @description 综合展示用户所有权益的汇总与分层明细。
 *              顶部显示总可用解锁次数，下方按优先级分层展示各权益来源。
 *              Displays total unlock count and layered breakdown by benefit source.
 */

// Infinity 图标重命名避免遮蔽全局 Infinity（no-shadow-restricted-names）
import { Crown, Zap, Gift, Clock, Infinity as InfinityIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLocale } from "@/core/i18n";
import type { MembershipStatus } from "@/types";

export interface MembershipStatusPanelProps {
  membership: MembershipStatus | null;
  /** 总可用解锁次数（由 Hook 计算） */
  totalRemaining: number;
  /** 免费额度 */
  freeQuota: number;
  /** 免费剩余 */
  freeRemaining: number;
  /** 是否已登录 */
  isLoggedIn: boolean;
  /** 可选：公告 ID（用于跳转套餐页时携带） */
  noticeId?: number;
  /** 紧凑模式（用于侧边栏） */
  compact?: boolean;
}

/** 格式化日期为本地化短格式（含年份） */
function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export function MembershipStatusPanel({
  membership,
  totalRemaining,
  freeQuota,
  freeRemaining,
  isLoggedIn,
  noticeId,
  compact = false,
}: MembershipStatusPanelProps) {
  const { t } = useLocale();
  const navigate = useNavigate();

  // 未登录或无数据时不展示
  if (!isLoggedIn || !membership) return null;

  const handleGoToPlans = () => {
    navigate(noticeId ? `/membership?notice_id=${noticeId}` : "/membership");
  };

  const entitlements = membership.entitlements ?? [];
  const subscriptions = membership.active_subscriptions ?? [];
  const hasSubscription = subscriptions.length > 0;
  // 过滤出真正的单次解锁卡（plan_code 以 single_ 开头），排除订阅制会员的配额
  const singleCards = entitlements.filter(e => e.plan_code.startsWith('single_'));
  const hasSingleCard = singleCards.length > 0;

  // 根据最佳权益类型决定主色调
  const themeColor = hasSubscription
    ? "amber"
    : hasSingleCard
      ? "blue"
      : "teal";

  const bgGradient = hasSubscription
    ? "from-amber-50 to-orange-50"
    : hasSingleCard
      ? "from-blue-50 to-cyan-50"
      : "from-slate-50 to-teal-50/30";

  const borderColor = hasSubscription
    ? "border-amber-200/60"
    : hasSingleCard
      ? "border-blue-200/60"
      : "border-slate-200/60";

  const iconBg = hasSubscription
    ? "bg-amber-100"
    : hasSingleCard
      ? "bg-blue-100"
      : "bg-teal-100";

  const iconColor = hasSubscription
    ? "text-amber-600"
    : hasSingleCard
      ? "text-blue-600"
      : "text-teal-600";

  const Icon = hasSubscription ? Crown : hasSingleCard ? Zap : Gift;

  return (
    <div className={`rounded-xl border ${borderColor} bg-gradient-to-r ${bgGradient} ${compact ? "p-3" : "p-4"}`}>
      {/* 顶部：总可用解锁次数 */}
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-extrabold ${totalRemaining > 0 ? "text-slate-900" : "text-red-600"}`}>
              {totalRemaining}
            </span>
            <span className="text-xs text-slate-500">{t("statusPanelTotalUnlocks")}</span>
          </div>
          {!compact && totalRemaining === 0 && (
            <button
              onClick={handleGoToPlans}
              className="mt-1 text-xs font-bold text-amber-600 hover:text-amber-700"
            >
              {t("statusPanelUpgradeBtn")} →
            </button>
          )}
        </div>
      </div>

      {/* 分层明细 */}
      <div className="mt-3 pt-3 border-t border-slate-200/40 space-y-1.5">
        {/* 订阅会员 */}
        {hasSubscription && subscriptions.map((sub, idx) => {
          const isExpired = sub.expires_at ? new Date(sub.expires_at) < new Date() : false;
          const displayName = sub.plan_name || sub.plan_code;
          return (
            <div key={`sub-${idx}`} className="flex items-center gap-2 text-xs">
              <Crown className="w-3 h-3 text-amber-500 flex-shrink-0" />
              <span className="font-bold text-slate-700">{t("statusPanelSubscriptionTitle")}</span>
              <span className="text-slate-600">{displayName}</span>
              {sub.expires_at ? (
                <span className="flex items-center gap-0.5 text-slate-400 ml-auto">
                  <Clock className="w-3 h-3" />
                  {formatDate(sub.expires_at)}
                </span>
              ) : (
                <span className="flex items-center gap-0.5 text-emerald-600 ml-auto">
                  <InfinityIcon className="w-3 h-3" />
                  {t("statusPanelPermanent")}
                </span>
              )}
              {isExpired && (
                <span className="px-1 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                  {t("statusPanelExpired")}
                </span>
              )}
            </div>
          );
        })}

        {/* 单次解锁卡（汇总显示） */}
        {hasSingleCard && (
          <div className="flex items-center gap-2 text-xs">
            <Zap className="w-3 h-3 text-blue-500 flex-shrink-0" />
            <span className="font-bold text-slate-700">
              {t("statusPanelEntitlementCards", { count: singleCards.length })}
            </span>
            <span className="text-slate-600">
              {singleCards.reduce((sum, e) => sum + Number(e.quota_remaining || 0), 0)} {t("statusPanelTimes")}
            </span>
            {/* 显示有效期范围 */}
            {(() => {
              const permanentCount = singleCards.filter(e => !e.expires_at).length;
              const datedCards = singleCards.filter(e => e.expires_at);
              if (permanentCount > 0) {
                return (
                  <span className="flex items-center gap-0.5 text-emerald-600 ml-auto">
                    <InfinityIcon className="w-3 h-3" />
                    {permanentCount > 1 ? `${permanentCount} ${t("statusPanelPermanent")}` : t("statusPanelPermanent")}
                  </span>
                );
              }
              if (datedCards.length > 0) {
                const earliest = datedCards.reduce((min, e) =>
                  e.expires_at && (!min || e.expires_at < min) ? e.expires_at : min, null as string | null);
                return (
                  <span className="flex items-center gap-0.5 text-slate-400 ml-auto">
                    <Clock className="w-3 h-3" />
                    {formatDate(earliest!)}
                  </span>
                );
              }
              return null;
            })()}
          </div>
        )}

        {/* 免费额度 */}
        <div className="flex items-center gap-2 text-xs">
          <Gift className="w-3 h-3 text-teal-500 flex-shrink-0" />
          <span className="font-bold text-slate-700">{t("statusPanelFreeTitle")}</span>
          <span className={freeRemaining > 0 ? "text-slate-600" : "text-red-600"}>
            {freeRemaining} / {freeQuota} {t("statusPanelTimes")}
          </span>
        </div>
      </div>
    </div>
  );
}

MembershipStatusPanel.displayName = "MembershipStatusPanel";
