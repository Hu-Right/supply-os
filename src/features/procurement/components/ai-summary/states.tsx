/**
 * AI 拆标摘要 — 状态分支面板集合（自 AiSummarySection.tsx 拆出，JSX 逐字不变）。
 *
 * 全部为展示组件（React.memo）：状态判定与计时留在容器，本文件只管呈现。
 * 拆分动因：原容器内 6 段 if-return 状态屏占 180+ 行，淹没主面板编排。
 *
 * @module features/procurement/components/ai-summary/states
 */
import { memo } from "react";
import { Loader2, Lock, Sparkles, AlertTriangle } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { resolveErrorText, type ErrorClassification } from "@/core/http";

/** 分析中：旋转 + 计时 + 进度骨架 */
export const AnalyzingPanel = memo(function AnalyzingPanel({ elapsed }: { elapsed: number }) {
  const { t } = useLocale();
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
});

/** 低档已解锁但无 AI 权益：引导升级（区别于未解锁的"引导解锁"） */
export const UpgradeGatePanel = memo(function UpgradeGatePanel({ onUpgrade }: { onUpgrade?: () => void }) {
  const { t } = useLocale();
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
});

/** 锁定态（未解锁）：不开放"开始分析"，改为引导解锁，避免"点了才报错" */
export const LockedPanel = memo(function LockedPanel({ onRequestUnlock }: { onRequestUnlock?: () => void }) {
  const { t } = useLocale();
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-3">
        <Lock className="w-5 h-5 text-slate-400" />
        <h3 className="text-base font-extrabold text-slate-900">
          {t("detail_aiSummaryTitle") || "AI 拆标摘要"}
        </h3>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        {t("detail_aiSummaryErrorLocked") || "升级会员后可进行 AI 分析。"}
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
});

/** 未配置 LLM 且无数据 */
export const NeedConfigPanel = memo(function NeedConfigPanel({ onConfigure }: { onConfigure?: () => void }) {
  const { t } = useLocale();
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
});

/** 错误态 */
export const ErrorPanel = memo(function ErrorPanel({ error, onRegenerate }: { error: ErrorClassification; onRegenerate?: () => void }) {
  const { t } = useLocale();
  return (
    <section className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-5 h-5 text-rose-600" />
        <h3 className="text-base font-extrabold text-rose-800">
          {t("procurement_aiSummaryError") || "AI 分析失败"}
        </h3>
      </div>
      <p className="text-sm text-rose-700 mb-4">{resolveErrorText(error, t)}</p>
      <button
        type="button"
        onClick={onRegenerate}
        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 px-4 py-2 text-sm font-bold transition-colors"
      >
        {t("procurement_aiSummaryRetry") || "重试"}
      </button>
    </section>
  );
});

/** 无数据占位：已配置 LLM 时显示"开始分析"，否则引导配置 */
export const StartPanel = memo(function StartPanel({ llmConfigured, onStart, onConfigure }: {
  llmConfigured: boolean;
  onStart?: () => void;
  onConfigure?: () => void;
}) {
  const { t } = useLocale();
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
});
