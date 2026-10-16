/**
 * AI 适配评估面板 — 状态分支与披露条集合（自 AiEvaluationPanel.tsx 拆出，JSX 逐字不变）。
 *
 * 全部为展示组件（React.memo）：状态判定编排留在容器。
 *
 * @module features/procurement/components/ai-evaluation/states
 */
import { memo } from "react";
import { Target, RefreshCw, AlertTriangle, Sparkles, Lock, ArrowRight, Building2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { resolveErrorText, type ErrorClassification } from "@/core/http";
import { rankToTierKey } from "../../api/notice-gate";

/** 骨架屏：回读缓存 / 评估中共用 */
export const SkeletonPanel = memo(function SkeletonPanel() {
  const { t } = useLocale();
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-purple-600" />
        <h3 className="text-base font-extrabold text-slate-900">{t("aiEvalTitle") || "供应商 × 公告 适配评估"}</h3>
      </div>
      <div className="animate-pulse space-y-3">
        <div className="h-20 rounded-xl bg-slate-100" />
        <div className="h-20 rounded-xl bg-slate-100" />
        <div className="h-20 rounded-xl bg-slate-100" />
      </div>
    </section>
  );
});

/** 档位不足（V2）：琥珀色「需升级」引导卡（专业版起享）；gateRank 为 null 时用固定文案（低档走法②） */
export const GatePanel = memo(function GatePanel({ gateRank }: { gateRank: number | null }) {
  const { t } = useLocale();
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 text-center">
      <Lock className="w-8 h-8 text-amber-600 mx-auto mb-3" />
      <h3 className="text-base font-extrabold text-amber-800 mb-2">{t("aiGateMatchTitle")}</h3>
      <p className="text-sm text-amber-700 mb-4">
        {gateRank !== null
          ? t("aiGateUpgradeSummary", { tier: t(rankToTierKey(gateRank)) })
          : t("aiEvalUpgradeHint") || "当前套餐仅支持查看公告原文，升级至无限版及以上可解锁 AI 适配评估。"}
      </p>
      <a href="/membership" className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 text-sm font-bold transition-colors">
        {t("aiGateViewPlans")}
      </a>
    </section>
  );
});

/** 未触发：引导 */
export const StartGuidePanel = memo(function StartGuidePanel({ onStart }: { onStart: () => void }) {
  const { t } = useLocale();
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <Target className="w-10 h-10 text-purple-400 mx-auto mb-3" />
      <h3 className="text-base font-extrabold text-slate-900 mb-2">
        {t("aiEvalTitle") || "供应商 × 公告 适配评估"}
      </h3>
      <p className="text-sm text-slate-500 mb-4">
        {t("aiEvalIntro") || "从 7 个维度评估「你自己的公司」与「资源库工厂/友商」承接本标的的适配度，并排名对比。"}
      </p>
      <button
        type="button"
        onClick={onStart}
        className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 text-sm font-bold transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        {t("aiEvalStart") || "开始评估"}
      </button>
    </section>
  );
});

/** 错误 */
export const ErrorPanel = memo(function ErrorPanel({ error, onRegenerate }: { error: ErrorClassification; onRegenerate: () => void }) {
  const { t } = useLocale();
  return (
    <section className="rounded-2xl border border-rose-200 bg-rose-50/50 p-6 text-center">
      <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
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

/** 全部候选评估失败 */
export const AllFailedPanel = memo(function AllFailedPanel({ failed, onRegenerate }: { failed: number; onRegenerate: () => void }) {
  const { t } = useLocale();
  return (
    <section className="rounded-2xl border border-rose-200 bg-rose-50/50 p-6 text-center">
      <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
      <p className="text-sm text-rose-700 mb-4">
        {(t("aiEvalAllFailed") || "{n} 家候选评估失败，请稍后重试").replace("{n}", String(failed))}
      </p>
      <button
        type="button"
        onClick={onRegenerate}
        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 px-4 py-2 text-sm font-bold transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        {t("procurement_aiSummaryRetry") || "重试"}
      </button>
    </section>
  );
});

/** 空结果：既未绑定企业、资源库也为空 → 引导二选一（或都做） */
export const EmptyGuidePanel = memo(function EmptyGuidePanel({ onGoToEnterprise, onGoToPool }: {
  onGoToEnterprise: () => void;
  onGoToPool: () => void;
}) {
  const { t } = useLocale();
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
      <p className="text-sm text-slate-500 mb-4">
        {t("aiEvalEmpty") || "还没有可评估的对象：完善企业信息（评估你自己），或在资源库添加工厂/友商后再来评估。"}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onGoToEnterprise}
          className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 text-sm font-bold transition-colors"
        >
          {t("aiEvalGoEnterprise") || "完善企业信息"}
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onGoToPool}
          className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300 bg-white hover:bg-purple-50 text-purple-700 px-4 py-2 text-sm font-bold transition-colors"
        >
          {t("aiEvalGoPool") || "建立资源库"}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
});

/** 评估范围与失败披露（粗筛说明 + 部分失败提示） */
export const ScopeDisclosure = memo(function ScopeDisclosure({ poolSize, evaluated, failed, cached }: {
  poolSize: number;
  evaluated: number;
  failed: number;
  cached: boolean;
}) {
  const { t } = useLocale();
  const showPrefilterNote = !cached && poolSize > evaluated;
  const showPartialFailed = !cached && failed > 0;
  if (!showPrefilterNote && !showPartialFailed) return null;
  return (
    <div className="mb-3 space-y-1">
      {showPrefilterNote && (
        <p className="text-2xs text-slate-500 flex items-center gap-1">
          {(t("aiMatchPrefilterNote") || "候选共 {total} 家，已按行业相关性筛选 {evaluated} 家参与评估")
            .replace("{total}", String(poolSize))
            .replace("{evaluated}", String(evaluated))}
        </p>
      )}
      {showPartialFailed && (
        <p className="text-2xs text-amber-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
          {(t("aiMatchPartialFailed") || "{n} 家评估失败已跳过，可重新评估").replace("{n}", String(failed))}
        </p>
      )}
    </div>
  );
});

/** 对比小结：你自己 vs 最佳候选 */
export const CompareSummary = memo(function CompareSummary({ selfScore, bestCompany, bestScore }: {
  selfScore: number;
  bestCompany: string;
  bestScore: number;
}) {
  const { t } = useLocale();
  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
      <p className="text-2xs text-slate-600 leading-4">
        {(t("aiEvalCompare") || "你自己 {self} 分 · 最佳候选「{best}」{bestScore} 分")
          .replace("{self}", String(selfScore))
          .replace("{best}", bestCompany || "—")
          .replace("{bestScore}", String(bestScore))}
      </p>
    </div>
  );
});

/** 候选缺诊断补全提示 */
export const DiagPendingHint = memo(function DiagPendingHint({ count, onGoToPool }: { count: number; onGoToPool: () => void }) {
  const { t } = useLocale();
  return (
    <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
      <p className="text-2xs text-amber-700 flex-1 leading-4">
        {(t("aiMatchDiagHint") || "有 {n} 家合作工厂未完善诊断信息，补全后匹配更精准").replace("{n}", String(count))}
      </p>
      <button
        type="button"
        onClick={onGoToPool}
        className="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 text-2xs font-bold text-amber-700 hover:bg-amber-50 transition-colors"
      >
        {t("aiMatchDiagAction") || "去完善"}
      </button>
    </div>
  );
});
