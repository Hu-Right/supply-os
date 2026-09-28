/**
 * 匹配放宽提示条 — 硬 AND 结果过少自动放宽为 OR 后的轻量引导
 * Match Relaxed Hint
 *
 * @module features/procurement/components/MatchRelaxedHint
 * @description match_relaxed=true 时显示：结果已从「全部命中」放宽为「任一命中」。
 *              配色用 sky（蓝）区别于高级语法降级的 amber（橙）引导条，避免语义混淆。
 */
import { Info } from "lucide-react";
import { useLocale } from "@/core/i18n";

export function MatchRelaxedHint() {
  const { t } = useLocale();
  return (
    <div
      data-testid="match-relaxed-hint"
      className="rounded-xl border border-sky-200 bg-sky-50/60 px-5 py-3 flex items-center gap-2"
    >
      <Info className="w-4 h-4 text-sky-600 shrink-0" />
      <p className="text-xs text-sky-800 flex-1">{t("procurement_matchRelaxedHint")}</p>
    </div>
  );
}
