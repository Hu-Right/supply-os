/**
 * 高级语法降级提示条 — 无权益用户结果列表顶部琥珀引导
 * Advanced Syntax Degraded Banner
 *
 * @module features/procurement/components/AdvancedDegradedBanner
 * @description advanced_degraded=true 时显示：高级语法未生效 + 升级 CTA。
 *              配色对齐 AiEvaluationPanel 的琥珀卡（amber-200/50/600）。
 */
import { Lock } from "lucide-react";
import { useLocale } from "@/core/i18n";

export function AdvancedDegradedBanner() {
  const { t } = useLocale();
  return (
    <div
      data-testid="advanced-degraded-banner"
      className="rounded-2xl border border-amber-200 bg-amber-50/50 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3"
    >
      <Lock className="w-4 h-4 text-amber-600 shrink-0" />
      <p className="text-sm text-amber-800 flex-1">{t("procurement_advancedDegradedHint")}</p>
      <a
        href="/membership"
        className="inline-flex items-center justify-center rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-xs font-bold transition-colors shrink-0"
      >
        {t("procurement_advancedDegradedCta")}
      </a>
    </div>
  );
}
