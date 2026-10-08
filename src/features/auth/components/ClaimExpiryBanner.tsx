/**
 * 认领待完善倒计时横幅
 * Claim Expiry Banner
 *
 * @module features/auth/components/ClaimExpiryBanner
 * @description 认领后须在限时内上传营业执照并保存，逾期由后台清扫器自动解除绑定。
 *              账户设置页与企业信息页原先各写一份中文横幅（文案还略有差异，且靠
 *              比对「已过期」中文字符串判断状态），这里收敛成单一来源：状态由
 *              useClaimExpiry 的结构化字段决定，文案全部走 i18n。
 */
import { AlertTriangle, Clock } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { CountdownResult } from "@/shared/utils/countdown";

interface ClaimExpiryBannerProps {
  /** 剩余时长（来自 useClaimExpiry，内部复用 shared/utils/countdown）；为空表示无待完善认领 */
  remaining: CountdownResult | null;
  /** 认领是否已到期（到期即绑定已被自动解除） */
  expired: boolean;
  /** 是否显示「前往完善」按钮（已在本页的企业信息页不需要） */
  withCta?: boolean;
  onCta?: () => void;
}

export function ClaimExpiryBanner({ remaining, expired, withCta, onCta }: ClaimExpiryBannerProps) {
  const { t } = useLocale();

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
