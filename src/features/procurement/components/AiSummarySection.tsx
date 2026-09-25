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
  Lock,
} from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useEffect, useState } from "react";

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
  /** 公告处于锁定态（未解锁）：不开放"开始分析"，改为引导解锁 */
  locked?: boolean;
  /** 点击"解锁查看"的回调 */
  onRequestUnlock?: () => void;
  /** 已解锁但当前档位不含 AI 摘要权益（低档只看原文）：引导升级 */
  upgradeLocked?: boolean;
  /** 当前展示为服务端脱敏 teaser（低档 ai_summary=1）：底部内联"升级看完整"提示 */
  masked?: boolean;
  /** 点击"升级解锁 AI 能力"的回调 */
  onUpgrade?: () => void;
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
  locked = false,
  onRequestUnlock,
  upgradeLocked = false,
  masked = false,
  onUpgrade,
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

  // 分析中计时器（让用户明确感知在工作）
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [loading]);

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

  // 加载中：明确的"分析中"动效面板（旋转+计时），而非静态骨架屏
  if (loading && !hasData) {
    return (
      <section className="rounded-2xl border border-teal-200 bg-teal-50/40 p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 text-teal-600 animate-spin shrink-0" />
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              {t("detail_aiSummaryTitle") || "AI 拆标摘要"}
              <span className="ml-2 text-sm font-bold text-teal-700">
                {t("detail_aiSummaryAnalyzing") || "AI 正在分析中"}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {t("detail_aiSummaryAnalyzingHint") || "正在阅读公告原文并结合企业画像生成 6 维度分析，通常需要 20-60 秒，请稍候…"}
              <span className="ml-1 font-mono text-teal-600">{elapsed}s</span>
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-2 animate-pulse">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-3 rounded bg-teal-100/70" style={{ width: `${90 - i * 15}%` }} />
          ))}
        </div>
      </section>
    );
  }

  // 低档已解锁但无 AI 权益：引导升级（区别于未解锁的"引导解锁"）。
  if (upgradeLocked && !hasData) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-5 h-5 text-slate-400" />
          <h3 className="text-base font-extrabold text-slate-900">
            {t("detail_aiSummaryTitle") || "AI 拆标摘要"}
          </h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          {t("detail_aiSummaryUpgradeHint") || "当前套餐仅支持查看公告原文，升级至专业版及以上可解锁 AI 拆标摘要与中文译文。"}
        </p>
        <button
          type="button"
          onClick={onUpgrade}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 text-sm font-bold transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          {t("detail_aiSummaryUpgradeCta") || "升级解锁 AI 能力"} →
        </button>
      </section>
    );
  }

  // 锁定态：AI 摘要端点强制"登录+解锁"，锁定必 403 core_locked。
  // 与翻译一致（ARCH-P0）：锁定态不开放"开始分析"，改为引导解锁，避免"点了才报错"。
  if (locked && !hasData) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-5 h-5 text-slate-400" />
          <h3 className="text-base font-extrabold text-slate-900">
            {t("detail_aiSummaryTitle") || "AI 拆标摘要"}
          </h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          {t("detail_aiSummaryErrorLocked") || "请先解锁本公告，再进行 AI 分析。"}
        </p>
        <button
          type="button"
          onClick={onRequestUnlock}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 text-sm font-bold transition-colors"
        >
          <Lock className="w-4 h-4" />
          {t("procurement_unlockToViewFull") || "解锁查看完整信息"}
        </button>
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
}
