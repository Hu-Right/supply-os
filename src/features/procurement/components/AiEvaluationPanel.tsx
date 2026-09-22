/**
 * 供应商 × 公告 适配评估面板
 * Ai Evaluation Panel
 *
 * @module features/procurement/components/AiEvaluationPanel
 * @description 详情页「AI 匹配/评分」Tab 的统一入口：候选 = {我绑定的自己} ∪ {资源库工厂/友商}，
 *              同一 7 维引擎打分后统一呈现。self 置顶高亮，其余按综合分排名；两者都有结果时给出对比小结。
 *              取代此前并排的 AiScoreCard + AiMatchCard 两张卡（ADR-0004：同一评估能力的两种用法）。
 *              数据由后端统一评估接口经 useAiMatch 提供（见 NoticeDetail）。
 */
import { Target, RefreshCw, AlertTriangle, Sparkles, Lock, ArrowRight, Building2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { AiMatchData } from "../api/ai-match";
import { parseVipRank, rankToTierKey } from "../api/notice-gate";
import { AiEvaluationRow } from "./AiEvaluationRow";

export interface AiEvaluationPanelProps {
  data: AiMatchData | null;
  loading: boolean;
  /** 历史缓存回读中：true 且无数据时显示骨架屏，避免引导按钮闪烁 */
  cacheLoading: boolean;
  error: string | null;
  /** 未生成：引导触发 */
  onStart: () => void;
  /** 重新评估（forceRegenerate） */
  onRegenerate: () => void;
  /** 空态：去建立资源库 */
  onGoToPool: () => void;
  /** self 行：去企业页编辑基本信息 */
  onGoToEnterprise: () => void;
  /** 友商/工厂行：去资源库补全诊断表 */
  onEditDiag: () => void;
}

export function AiEvaluationPanel({
  data, loading, cacheLoading, error, onStart, onRegenerate, onGoToPool, onGoToEnterprise, onEditDiag,
}: AiEvaluationPanelProps) {
  const { t } = useLocale();

  /** 错误映射：限流/解锁/通用（档位不足由上方琥珀引导卡接管） */
  const friendlyError = (raw: string): string => {
    if (raw.includes("429") || raw.includes("rate")) return t("aiScoreErrorRate") || "AI 服务请求过于频繁，请稍后再试。";
    if (raw.includes("403") || raw.includes("core_locked") || raw.includes("锁定") || raw.includes("解锁"))
      return t("aiScoreErrorLocked") || "请先解锁本公告，再进行 AI 评估。";
    if (raw.includes("401") || raw.includes("LLM_NOT_CONFIGURED"))
      return t("aiScoreErrorAuth") || "登录已过期或未配置 AI 模型，请检查后再试。";
    return t("aiScoreErrorGeneric") || "AI 评估过程中出现错误，请稍后重试。";
  };

  // 缓存回读中：与评估中共用骨架屏，避免"先闪引导按钮再出结果"
  if (cacheLoading && !data && !loading && !error) {
    return <SkeletonPanel t={t} />;
  }

  // 未触发：引导
  if (!data && !loading && !error) {
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
  }

  // 评估中
  if (loading) return <SkeletonPanel t={t} />;

  // 档位不足（V2）：琥珀色「需升级」引导卡（专业版起享）
  const gateRank = error ? parseVipRank(error) : null;
  if (gateRank !== null) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 text-center">
        <Lock className="w-8 h-8 text-amber-600 mx-auto mb-3" />
        <h3 className="text-base font-extrabold text-amber-800 mb-2">{t("aiGateMatchTitle")}</h3>
        <p className="text-sm text-amber-700 mb-4">
          {t("aiGateUpgradeSummary", { tier: t(rankToTierKey(gateRank)) })}
        </p>
        <a href="/membership" className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 text-sm font-bold transition-colors">
          {t("aiGateViewPlans")}
        </a>
      </section>
    );
  }

  // 错误
  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50/50 p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
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

  // 空结果：既未绑定企业、资源库也为空 → 引导二选一（或都做）
  if (!data || data.top.length === 0) {
    const failed = data?.failed ?? 0;
    if (failed > 0) {
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
    }
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
  }

  // 有结果：self 置顶高亮 + 候选按综合分排名
  const selfRow = data.top.find((s) => s.isSelf) ?? null;
  const poolRows = data.top.filter((s) => !s.isSelf);
  const bestPool = poolRows.length > 0 ? poolRows[0] : null;
  const showCompare = selfRow && bestPool;
  const showPrefilterNote = !data.cached && data.poolSize > data.evaluated;
  const showPartialFailed = !data.cached && data.failed > 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-start gap-2">
          <Target className="w-5 h-5 text-purple-600 mt-0.5" />
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              {t("aiEvalTitle") || "供应商 × 公告 适配评估"}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {t("aiEvalScopeHint") || "统一评估你自己与资源库候选，同一 7 维标准可直接比较"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          {t("aiEvalRegenerate") || "重新评估"}
        </button>
      </div>

      {/* 评估范围与失败披露 */}
      {(showPrefilterNote || showPartialFailed) && (
        <div className="mb-3 space-y-1">
          {showPrefilterNote && (
            <p className="text-2xs text-slate-500 flex items-center gap-1">
              {(t("aiMatchPrefilterNote") || "候选共 {total} 家，已按行业相关性筛选 {evaluated} 家参与评估")
                .replace("{total}", String(data.poolSize))
                .replace("{evaluated}", String(data.evaluated))}
            </p>
          )}
          {showPartialFailed && (
            <p className="text-2xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
              {(t("aiMatchPartialFailed") || "{n} 家评估失败已跳过，可重新评估").replace("{n}", String(data.failed))}
            </p>
          )}
        </div>
      )}

      {/* 对比小结：你自己 vs 最佳候选 */}
      {showCompare && selfRow && bestPool && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
          <p className="text-2xs text-slate-600 leading-4">
            {(t("aiEvalCompare") || "你自己 {self} 分 · 最佳候选「{best}」{bestScore} 分").replace("{self}", String(selfRow.overall))
              .replace("{best}", bestPool.company || "—")
              .replace("{bestScore}", String(bestPool.overall))}
          </p>
        </div>
      )}

      {/* 候选缺诊断补全提示 */}
      {data.diagPending != null && data.diagPending > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <p className="text-2xs text-amber-700 flex-1 leading-4">
            {(t("aiMatchDiagHint") || "有 {n} 家合作工厂未完善诊断信息，补全后匹配更精准").replace("{n}", String(data.diagPending))}
          </p>
          <button
            type="button"
            onClick={onGoToPool}
            className="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 text-2xs font-bold text-amber-700 hover:bg-amber-50 transition-colors"
          >
            {t("aiMatchDiagAction") || "去完善"}
          </button>
        </div>
      )}

      {/* 列表：self 置顶 + 候选排名 */}
      <div className="space-y-3">
        {selfRow && (
          <AiEvaluationRow
            supplier={selfRow}
            rank={0}
            t={t}
            onEditBase={onGoToEnterprise}
          />
        )}
        {poolRows.map((s, idx) => (
          <AiEvaluationRow
            key={`${s.pool_id ?? "x"}-${s.supplier_id}`}
            supplier={s}
            rank={idx + 1}
            t={t}
            onEditDiag={onEditDiag}
          />
        ))}
      </div>

      <p className="text-2xs text-slate-400 mt-3 text-center">
        {t("aiEvalDisclaimer") || "评估结果由 AI 基于公告要求与企业画像自动生成，仅供参考。"}
      </p>
    </section>
  );
}

/** 骨架屏：回读缓存 / 评估中共用 */
function SkeletonPanel({ t }: { t: (key: string) => string }) {
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
}
