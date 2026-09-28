/**
 * 匹配放宽说明条 — 硬 AND 零结果自动放宽为 OR 时的诚实告知
 * Match Relaxed Hint
 *
 * @module features/procurement/components/MatchRelaxedHint
 * @description match_relaxed=true 时显示。必须明说两件事：
 *              ① 未找到同时包含全部关键词的公告（不粉饰为「有结果」）；
 *              ② 下列列表里的公告只包含其中部分关键词。
 *              位置必须贴着结果列表（而非搜索面板上方），否则用户先看到「共 N 条」再看到解释。
 *              放宽闸口仅在 AND total=0 时触发（非「结果过少」），文案需与此口径一致。
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
