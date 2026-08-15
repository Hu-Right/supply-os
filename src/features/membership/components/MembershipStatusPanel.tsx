/**
 * 会员权益状态面板
 * Membership Status Panel
 *
 * @module features/membership/components/MembershipStatusPanel
 * @description 综合展示用户当前最优权益：订阅 > 单次卡 > 免费额度。
 *              用于会员中心页面顶部和公告详情页侧边栏。
 *              Displays the user's best available benefit: subscription > single card > free quota.
 *              Used in membership page top and notice detail sidebar.
 */

import { Crown, Zap, Gift, Clock, Infinity } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLocale } from "@/core/i18n";
import type { MembershipStatus } from "@/types";

export interface MembershipStatusPanelProps {
  membership: MembershipStatus | null;
  /** 当前最优权益类型（由 Hook 计算） */
  bestBenefitType: "subscription" | "entitlement" | "free";
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

/** 格式化日期为本地化短格式 */
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
  bestBenefitType,
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

  // ── 订阅制会员展示 ──
  if (bestBenefitType === "subscription" && membership.active_subscriptions?.length) {
    const sub = membership.active_subscriptions[0];
    const isExpired = sub.expires_at ? new Date(sub.expires_at) < new Date() : false;

    return (
      <div className={`rounded-xl border border-amber-200/60 bg-gradient-to-r from-amber-50 to-orange-50 ${compact ? "p-3" : "p-4"}`}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-amber-100">
            <Crown className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className={`font-bold text-slate-900 ${compact ? "text-sm" : "text-base"}`}>
                {t("statusPanelSubscriptionTitle")}
              </h4>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${isExpired ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                {isExpired ? t("statusPanelExpired") : t("statusPanelActive")}
              </span>
            </div>
            {!compact && (
              <p className="text-xs text-slate-500 mb-2">{t("statusPanelSubscriptionDesc")}</p>
            )}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">{t("statusPanelPlanCode")}:</span>
                <span className="font-mono font-bold text-slate-800">{sub.plan_code}</span>
              </div>
              {sub.expires_at && (
                <div className="flex items-center gap-2 text-xs">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span className="text-slate-500">{t("statusPanelExpiresAt")}:</span>
                  <span className="font-bold text-slate-800">{formatDate(sub.expires_at)}</span>
                </div>
              )}
              {!sub.expires_at && (
                <div className="flex items-center gap-2 text-xs">
                  <Infinity className="w-3 h-3 text-slate-400" />
                  <span className="font-bold text-emerald-600">{t("statusPanelPermanent")}</span>
                </div>
              )}
            </div>
            {/* 付费配额展示（如果有） */}
            {membership.paid_quota_total != null && membership.paid_quota_total > 0 && (
              <div className="mt-2 pt-2 border-t border-amber-200/40">
                <QuotaBar
                  total={membership.paid_quota_total}
                  used={membership.paid_quota_used ?? 0}
                  remaining={membership.paid_quota_remaining ?? 0}
                  t={t}
                  compact={compact}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── 单次解锁卡展示 ──
  if (bestBenefitType === "entitlement" && membership.entitlements?.length) {
    const ent = membership.entitlements[0];
    const isExpired = ent.expires_at ? new Date(ent.expires_at) < new Date() : false;
    const isPermanent = !ent.expires_at;

    return (
      <div className={`rounded-xl border border-blue-200/60 bg-gradient-to-r from-blue-50 to-cyan-50 ${compact ? "p-3" : "p-4"}`}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-blue-100">
            <Zap className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className={`font-bold text-slate-900 ${compact ? "text-sm" : "text-base"}`}>
                {t("statusPanelEntitlementTitle")}
              </h4>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${isExpired ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                {isExpired ? t("statusPanelExpired") : t("statusPanelActive")}
              </span>
            </div>
            {!compact && (
              <p className="text-xs text-slate-500 mb-2">{t("statusPanelEntitlementDesc")}</p>
            )}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">{t("statusPanelPlanCode")}:</span>
                <span className="font-mono font-bold text-slate-800">{ent.plan_code}</span>
              </div>
              {ent.expires_at && (
                <div className="flex items-center gap-2 text-xs">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span className="text-slate-500">{t("statusPanelExpiresAt")}:</span>
                  <span className="font-bold text-slate-800">{formatDate(ent.expires_at)}</span>
                </div>
              )}
              {isPermanent && (
                <div className="flex items-center gap-2 text-xs">
                  <Infinity className="w-3 h-3 text-slate-400" />
                  <span className="font-bold text-emerald-600">{t("statusPanelPermanent")}</span>
                </div>
              )}
            </div>
            {/* 配额进度条 */}
            <div className="mt-2 pt-2 border-t border-blue-200/40">
              <QuotaBar
                total={ent.quota_total}
                used={ent.quota_used}
                remaining={ent.quota_remaining}
                t={t}
                compact={compact}
              />
            </div>
            {/* 如果有多张卡，展示汇总 */}
            {membership.entitlements.length > 1 && (
              <div className="mt-2 text-xs text-slate-500">
                +{membership.entitlements.length - 1} {t("statusPanelEntitlementTitle")}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── 免费额度展示 ──
  return (
    <div className={`rounded-xl border border-slate-200/60 bg-gradient-to-r from-slate-50 to-teal-50/30 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-teal-100">
          <Gift className="w-5 h-5 text-teal-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className={`font-bold text-slate-900 ${compact ? "text-sm" : "text-base"}`}>
              {t("statusPanelFreeTitle")}
            </h4>
          </div>
          {!compact && (
            <p className="text-xs text-slate-500 mb-2">{t("statusPanelFreeDesc")}</p>
          )}
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-500">
              {t("statusPanelQuotaRemaining")}:{" "}
              <span className={`font-bold ${freeRemaining > 0 ? "text-teal-700" : "text-red-600"}`}>
                {freeRemaining}
              </span>
              {" / "}
              <span className="font-bold text-slate-700">{freeQuota}</span>
              {" "}{t("statusPanelTimes")}
            </div>
          </div>
          {/* 免费额度进度条 */}
          {freeQuota > 0 && (
            <div className="mt-2">
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${freeRemaining > 0 ? "bg-teal-500" : "bg-red-400"}`}
                  style={{ width: `${Math.max(0, (freeRemaining / freeQuota) * 100)}%` }}
                />
              </div>
            </div>
          )}
          {/* 升级引导 */}
          <button
            onClick={handleGoToPlans}
            className="mt-2 text-xs font-bold text-amber-600 hover:text-amber-700 transition-colors"
          >
            {t("statusPanelUpgradeBtn")} →
          </button>
        </div>
      </div>
    </div>
  );
}

/** 配额进度条子组件 */
function QuotaBar({
  total,
  used,
  remaining,
  t,
  compact,
}: {
  total: number;
  used: number;
  remaining: number;
  t: (key: string) => string;
  compact?: boolean;
}) {
  const percent = total > 0 ? Math.max(0, (remaining / total) * 100) : 0;
  const isLow = percent < 20;

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-500">
          {t("statusPanelQuotaRemaining")}:{" "}
          <span className={`font-bold ${isLow ? "text-red-600" : "text-emerald-700"}`}>
            {remaining}
          </span>
          {" / "}
          <span className="font-bold text-slate-700">{total}</span>
          {" "}{t("statusPanelTimes")}
        </span>
        {!compact && (
          <span className="text-slate-400">
            {t("statusPanelQuotaUsed")}: {used}
          </span>
        )}
      </div>
      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isLow ? "bg-red-400" : "bg-emerald-500"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

MembershipStatusPanel.displayName = "MembershipStatusPanel";
