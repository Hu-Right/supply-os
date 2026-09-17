/**
 * AI 拆标摘要区 v2
 * AI Bid Summary Section
 *
 * @module features/procurement/components/AiSummarySection
 * @description 6 维度流式展示：核心交付/资质门槛/商务要素/竞争格局/投标策略/风险提示。
 *              支持 SSE 逐字流式渲染 + 缓存命中即时展示。
 */
import {
  Package,
  ShieldCheck,
  Banknote,
  TrendingUp,
  Target,
  AlertTriangle,
  Sparkles,
  Loader2,
} from "lucide-react";
import { useLocale } from "@/core/i18n";

/** AI 拆标摘要数据结构（6 维度） */
export interface AiSummaryData {
  coreDeliverables?: string;
  keyQualifications?: string;
  paymentAndCycle?: string;
  competitiveLandscape?: string;
  bidStrategy?: string;
  riskAlerts?: string;
}

export interface AiSummarySectionProps {
  data?: AiSummaryData | null;
  loading?: boolean;
  streaming?: boolean;
  error?: string | null;
  llmConfigured?: boolean;
  onConfigure?: () => void;
  onRegenerate?: () => void;
}

interface SummaryItem {
  icon: typeof Package;
  iconColor: string;
  titleKey: string;
  titleDefault: string;
  content?: string;
}

export function AiSummarySection({
  data,
  loading = false,
  streaming = false,
  error = null,
  llmConfigured = false,
  onConfigure,
  onRegenerate,
}: AiSummarySectionProps) {
  const { t } = useLocale();

  const items: SummaryItem[] = [
    { icon: Package, iconColor: "text-teal-600", titleKey: "detail_coreDeliverables", titleDefault: "核心交付", content: data?.coreDeliverables },
    { icon: ShieldCheck, iconColor: "text-blue-600", titleKey: "detail_keyQualifications", titleDefault: "资质门槛", content: data?.keyQualifications },
    { icon: Banknote, iconColor: "text-amber-600", titleKey: "detail_paymentCycle", titleDefault: "商务要素", content: data?.paymentAndCycle },
    { icon: TrendingUp, iconColor: "text-purple-600", titleKey: "detail_competitiveLandscape", titleDefault: "竞争格局", content: data?.competitiveLandscape },
    { icon: Target, iconColor: "text-indigo-600", titleKey: "detail_bidStrategy", titleDefault: "投标策略", content: data?.bidStrategy },
    { icon: AlertTriangle, iconColor: "text-rose-600", titleKey: "detail_riskAlerts", titleDefault: "风险提示", content: data?.riskAlerts },
  ];

  const hasData = items.some((item) => item.content);

  // 加载中骨架屏
  if (loading && !hasData) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-teal-600" />
          <h3 className="text-base font-extrabold text-slate-900">
            {t("detail_aiSummaryTitle") || "AI 拆标摘要"}
          </h3>
        </div>
        <div className="space-y-3 animate-pulse">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="h-4 w-24 bg-slate-200 rounded mb-2" />
              <div className="h-3 w-full bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // 未配置 LLM 且无数据
  if (!llmConfigured && !hasData) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-teal-600" />
          <h3 className="text-base font-extrabold text-slate-900">
            {t("detail_aiSummaryTitle") || "AI 拆标摘要"}
          </h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          {t("procurement_aiSummaryNeedConfig") || "配置您的 AI 模型后，即可结合企业画像生成 6 维度投标适配分析。"}
        </p>
        <button
          type="button"
          onClick={onConfigure}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 text-sm font-bold transition-colors"
        >
          {t("procurement_aiSummaryGoConfig") || "去配置 AI 模型"} →
        </button>
      </section>
    );
  }

  // 错误态
  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-5 h-5 text-rose-600" />
          <h3 className="text-base font-extrabold text-rose-800">
            {t("procurement_aiSummaryError") || "AI 分析失败"}
          </h3>
        </div>
        <p className="text-sm text-rose-700 mb-4">{error}</p>
        <button
          type="button"
          onClick={onRegenerate}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 px-4 py-2 text-sm font-bold transition-colors"
        >
          {t("procurement_aiSummaryRetry") || "重试"}
        </button>
      </section>
    );
  }

  // 无数据占位
  if (!hasData) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-teal-600" />
          <h3 className="text-base font-extrabold text-slate-900">
            {t("detail_aiSummaryTitle") || "AI 拆标摘要"}
          </h3>
        </div>
        <p className="text-sm text-slate-500">
          {t("procurement_aiSummaryUnavailable") || "AI 分析正在生成中，请稍后刷新查看。"}
        </p>
      </section>
    );
  }

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

      {/* 底部操作：重新分析 */}
      {!streaming && (
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
}
