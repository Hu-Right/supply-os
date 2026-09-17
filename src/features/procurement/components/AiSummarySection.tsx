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
  /** 点击"开始分析"的回调 */
  onStart?: () => void;
  onRegenerate?: () => void;
  /** 查看完整 AI 分析报告（下载 docx） */
  onViewReport?: () => void;
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
  onStart,
  onRegenerate,
  onViewReport,
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

  /** 将原始错误信息映射为用户友好的提示 */
  const friendlyError = (raw: string): string => {
    if (raw.includes("401") || raw.includes("Unauthorized") || raw.includes("LLM_NOT_CONFIGURED"))
      return t("detail_aiSummaryErrorAuth") || "登录已过期，请重新登录后再试。";
    if (raw.includes("403") || raw.includes("Forbidden") || raw.includes("core_locked"))
      return t("detail_aiSummaryErrorLocked") || "请先解锁本公告，再进行 AI 分析。";
    if (raw.includes("LLM_HTTP_429") || raw.includes("rate"))
      return t("detail_aiSummaryErrorRate") || "AI 服务请求过于频繁，请稍后再试。";
    if (raw.includes("LLM_HTTP_5") || raw.includes("timeout") || raw.includes("network"))
      return t("detail_aiSummaryErrorNetwork") || "AI 服务暂时不可用，请稍后重试。";
    if (raw.includes("LLM_BAD_JSON") || raw.includes("LLM_BAD_SHAPE") || raw.includes("LLM_EMPTY"))
      return t("detail_aiSummaryErrorFormat") || "AI 返回结果格式异常，请重试或检查模型配置。";
    if (raw.includes("NOTICE_NOT_FOUND"))
      return t("detail_aiSummaryErrorNotice") || "公告不存在或已下架。";
    return t("detail_aiSummaryErrorGeneric") || "AI 分析过程中出现错误，请稍后重试。";
  };

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
        <p className="text-sm text-rose-700 mb-4">{friendlyError(error)}</p>
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

  // 无数据占位：已配置 LLM 时显示"开始分析"按钮
  if (!hasData) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-teal-600" />
          <h3 className="text-base font-extrabold text-slate-900">
            {t("detail_aiSummaryTitle") || "AI 拆标摘要"}
          </h3>
        </div>
        {llmConfigured ? (
          <div>
            <p className="text-sm text-slate-500 mb-3">
              {t("detail_aiSummaryClickStart") || "点击按钮，AI 将结合您的企业画像生成本标 6 维度适配分析。"}
            </p>
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 text-sm font-bold transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              {t("detail_aiSummaryStart") || "开始 AI 分析"}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-500 mb-3">
              {t("procurement_aiSummaryNeedConfig") || "配置您的 AI 模型后，即可结合企业画像生成 6 维度投标适配分析。"}
            </p>
            <button
              type="button"
              onClick={onConfigure}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 text-sm font-bold transition-colors"
            >
              {t("procurement_aiSummaryGoConfig") || "去配置 AI 模型"} →
            </button>
          </div>
        )}
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

      {/* 底部操作：重新分析 + 查看完整报告 */}
      {!streaming && hasData && (
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onRegenerate}
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
          >
            {t("procurement_aiSummaryRegenerate") || "重新分析"}
          </button>
          {onViewReport && (
            <button
              type="button"
              onClick={onViewReport}
              className="inline-flex items-center gap-1 text-sm font-bold text-teal-700 hover:text-teal-900 transition-colors"
            >
              {t("detail_viewFullReport") || "查看完整AI分析报告"} →
            </button>
          )}
        </div>
      )}
    </section>
  );
}
