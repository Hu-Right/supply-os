"use client";

/**
 * 认领倒计时横幅（三态）
 * Claim Expiry Banner
 *
 * @module features/auth/components/ClaimExpiryBanner
 * @description 认领后的待办分三段，文案必须跟着状态走（2026-11-23 修）：
 *              - 未上传执照：1 小时限时上传，逾期由后台清扫器自动解绑；
 *              - 已上传执照：后端把到期时间延长到 7 天等人工审核，此时不能再提示
 *                「请上传营业执照」，否则页面会出现「上面让上传、下面显示已上传」
 *                的自相矛盾（用户截图事故）；
 *              - 已通过（approved）：即使 expires_at 未清也不再显示倒计时。
 *              状态由 useClaimExpiry 的结构化字段决定，文案全部走 i18n。
 */
import { AlertTriangle, ClipboardCheck, Clock } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { CountdownResult } from "@/shared/utils/countdown";

interface ClaimExpiryBannerProps {
  /** 剩余时长（来自 useClaimExpiry，内部复用 shared/utils/countdown）；为空表示无待办认领 */
  remaining: CountdownResult | null;
  /** 认领是否已到期（到期即绑定已被自动解除） */
  expired: boolean;
  /** 认领状态：pending / approved；approved 直接不渲染 */
  status?: string | null;
  /** 营业执照是否已上传：已上传时光看 expiresAt 会被误判成「待上传」 */
  hasLicense?: boolean;
  /** 是否显示「前往完善」按钮（已在本页的企业信息页不需要） */
  withCta?: boolean;
  onCta?: () => void;
}

export function ClaimExpiryBanner({
  remaining,
  expired,
  status,
  hasLicense,
  withCta,
  onCta,
}: ClaimExpiryBannerProps) {
  const { t } = useLocale();

  // 已通过：后台可能只改 claim.status、没清 expires_at，不能继续显示倒计时
  if (status === "approved") return null;

  if (expired) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3 text-sm text-danger-700">
        <Clock className="w-4 h-4 shrink-0" />
        <span>{t("authClaimExpiredBanner") || "认领已过期，绑定已自动解除。如需绑定请重新认领。"}</span>
      </div>
    );
  }

  if (!remaining) return null;

  const time = (t("authClaimCountdown") || "{d}天 {h}小时 {m}分钟")
    .replace("{d}", String(remaining.days))
    .replace("{h}", String(remaining.hours))
    .replace("{m}", String(remaining.minutes));

  // 已上传执照 → 7 天审核窗口：提示「审核中」，不再要求上传
  if (hasLicense) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-sky-50 border border-sky-200 px-4 py-3 text-sm text-sky-700">
        <ClipboardCheck className="w-4 h-4 shrink-0" />
        <span className="font-medium shrink-0">{t("authClaimReviewingTitle") || "企业认领审核中"}</span>
        <span className="text-xs text-sky-600">
          {(t("authClaimReviewingDesc") ||
            "营业执照已提交，正在人工审核；审核通过前绑定保持有效，{time} 内未完成审核将自动解除绑定。")
            .replace("{time}", time)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="font-medium shrink-0">{t("authClaimBannerTitle") || "企业认领待完善"}</span>
      <span className="text-xs text-amber-600">
        {(t("authClaimBannerDesc") || "请在 {time} 内前往企业信息页上传营业执照并保存，逾期将自动解除绑定")
          .replace("{time}", time)}
      </span>
      {withCta && (
        <button
          type="button"
          onClick={onCta}
          className="ml-auto text-xs font-medium text-amber-700 hover:text-amber-900 underline shrink-0"
        >
          {t("authClaimBannerCta") || "前往完善"}
        </button>
      )}
    </div>
  );
}
