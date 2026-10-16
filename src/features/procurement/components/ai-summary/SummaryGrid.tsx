/**
 * AI 拆标摘要 — 结果网格（6 维度卡片 + 脱敏 teaser + 重新分析），自 AiSummarySection.tsx 拆出，JSX 逐字不变。
 *
 * buildSummaryItems 为纯映射函数（数据结构 → 展示结构），单测友好。
 *
 * @module features/procurement/components/ai-summary/SummaryGrid
 */
import { memo } from "react";
import { Loader2, Sparkles, Package, ShieldCheck, Banknote, TrendingUp, Target, AlertTriangle } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { AiSummaryData } from "../AiSummarySection";

export interface SummaryItem {
  icon: typeof Package;
  iconColor: string;
  titleKey: string;
  titleDefault: string;
  content?: string;
}

/** 6 维度定义（图标/配色/文案 key 与数据字段的唯一映射处） */
const DIMENSIONS = [
  { icon: Package, iconColor: "text-teal-600", titleKey: "detail_coreDeliverables", titleDefault: "核心交付", field: "coreDeliverables" },
  { icon: ShieldCheck, iconColor: "text-blue-600", titleKey: "detail_keyQualifications", titleDefault: "资质门槛", field: "keyQualifications" },
  { icon: Banknote, iconColor: "text-amber-600", titleKey: "detail_paymentCycle", titleDefault: "商务要素", field: "paymentAndCycle" },
  { icon: TrendingUp, iconColor: "text-purple-600", titleKey: "detail_competitiveLandscape", titleDefault: "竞争格局", field: "competitiveLandscape" },
  { icon: Target, iconColor: "text-indigo-600", titleKey: "detail_bidStrategy", titleDefault: "投标策略", field: "bidStrategy" },
  { icon: AlertTriangle, iconColor: "text-rose-600", titleKey: "detail_riskAlerts", titleDefault: "风险提示", field: "riskAlerts" },
] as const;

export function buildSummaryItems(data?: AiSummaryData | null): SummaryItem[] {
  return DIMENSIONS.map((d) => ({
    icon: d.icon,
    iconColor: d.iconColor,
    titleKey: d.titleKey,
    titleDefault: d.titleDefault,
    content: data?.[d.field],
  }));
}

export const SummaryGrid = memo(function SummaryGrid({
  items,
  streaming,
  masked,
  onUpgrade,
  onRegenerate,
}: {
  items: SummaryItem[];
  streaming: boolean;
  masked: boolean;
  onUpgrade?: () => void;
  onRegenerate?: () => void;
}) {
  const { t } = useLocale();
  const hasData = items.some((item) => item.content);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-teal-600" />
          <h3 className="text-base font-extrabold text-slate-900">
            {t("detail_aiSummaryTitle") || "AI 拆标摘要"}
          </h3>
          <span className="text-2xs text-slate-400 font-normal">
            {t("detail_aiSummaryBy") || "由 OS AI 分析生成"}
          </span>
          {streaming && (
            <span className="inline-flex items-center gap-1 text-2xs text-teal-600 font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t("detail_aiSummaryStreaming") || "分析中…"}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.titleDefault}
            className={`rounded-xl border p-4 transition-colors ${
              item.content
                ? "border-slate-100 bg-slate-50/70"
                : streaming
                  ? "border-slate-100 bg-slate-50/30"
                  : "border-slate-100 bg-slate-50/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <item.icon className={`w-4 h-4 ${item.content ? item.iconColor : "text-slate-300"}`} />
              <h4 className={`text-sm font-extrabold ${item.content ? "text-slate-900" : "text-slate-400"}`}>
                {t(item.titleKey) || item.titleDefault}
              </h4>
            </div>
            {item.content ? (
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{item.content}</p>
            ) : streaming ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-300" />
                <span className="text-sm text-slate-300">
                  {t("detail_aiSummaryGenerating") || "正在生成…"}
                </span>
              </div>
            ) : (
              <p className="text-sm text-slate-300">—</p>
            )}
          </div>
        ))}
      </div>

      {/* 脱敏 teaser：内联"升级看完整"提示（低档 ai_summary=1） */}
      {masked && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3">
          <p className="text-xs text-teal-800 font-medium">
            {t("detail_aiSummaryTeaserHint") || "以上为部分内容预览，升级至无限版解锁完整六维分析与中文译文。"}
          </p>
          <button
            type="button"
            onClick={onUpgrade}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 text-xs font-bold transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {t("detail_aiSummaryUpgradeCta") || "升级解锁 AI 能力"}
          </button>
        </div>
      )}

      {/* 底部操作：重新分析 */}
      {!streaming && hasData && (
        <div className="mt-4 flex items-center justify-end">
          <button
            type="button"
            onClick={onRegenerate}
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
          >
            {t("procurement_aiSummaryRegenerate") || "重新分析"}
          </button>
        </div>
      )}
    </section>
  );
});
