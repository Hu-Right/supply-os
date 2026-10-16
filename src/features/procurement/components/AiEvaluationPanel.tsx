/**
 * 供应商 × 公告 适配评估面板 — 容器
 * Ai Evaluation Panel
 *
 * @module features/procurement/components/AiEvaluationPanel
 * @description 详情页「AI 匹配/评分」Tab 的统一入口：候选 = {我绑定的自己} ∪ {资源库工厂/友商}，
 *              同一 7 维引擎打分后统一呈现。self 置顶高亮，其余按综合分排名；两者都有结果时给出对比小结。
 *              取代此前并排的 AiScoreCard + AiMatchCard 两张卡（ADR-0004：同一评估能力的两种用法）。
 *              数据由后端统一评估接口经 useAiMatch 提供（见 NoticeDetail）。
 *
 *              2026-10 组件化拆分（300→约 130 行）：8 段状态屏/披露条见 ./ai-evaluation/states，
 *              本文件只做状态判定编排与结果列表装配。
 */
import { Target, RefreshCw } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { AiMatchData } from "../api/ai-match";
import type { ErrorClassification } from "@/core/http";
import { AiEvaluationRow } from "./AiEvaluationRow";
import { SkeletonPanel, GatePanel, StartGuidePanel, ErrorPanel, AllFailedPanel, EmptyGuidePanel, ScopeDisclosure, CompareSummary, DiagPendingHint } from "./ai-evaluation/states";

export interface AiEvaluationPanelProps {
  data: AiMatchData | null;
  loading: boolean;
  /** 历史缓存回读中：true 且无数据时显示骨架屏，避免引导按钮闪烁 */
  cacheLoading: boolean;
  error: ErrorClassification | null;
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
  /** 已解锁但当前档位不含 ai_match 权益（低档走法②）：进 Tab 即显示升级引导，不露任何评分数据 */
  upgradeLocked?: boolean;
}

export function AiEvaluationPanel({
  data, loading, cacheLoading, error, onStart, onRegenerate, onGoToPool, onGoToEnterprise, onEditDiag,
  upgradeLocked = false,
}: AiEvaluationPanelProps) {
  const { t } = useLocale();

  // 低档无 ai_match 权益（走法②）：进 Tab 即升级引导，不发请求、不露候选/分数
  if (upgradeLocked && !data) {
    return <GatePanel gateRank={null} />;
  }

  // 缓存回读中：与评估中共用骨架屏，避免"先闪引导按钮再出结果"
  if (cacheLoading && !data && !loading && !error) {
    return <SkeletonPanel />;
  }

  // 未触发：引导
  if (!data && !loading && !error) {
    return <StartGuidePanel onStart={onStart} />;
  }

  // 评估中
  if (loading) return <SkeletonPanel />;

  // 档位不足（V2）：琥珀色「需升级」引导卡（专业版起享）
  const gateRank = error?.kind === "vipGate" ? error.requiredRank ?? null : null;
  if (gateRank !== null) {
    return <GatePanel gateRank={gateRank} />;
  }

  // 错误
  if (error) {
    return <ErrorPanel error={error} onRegenerate={onRegenerate} />;
  }

  // 空结果：既未绑定企业、资源库也为空 → 引导二选一（或都做）
  if (!data || data.top.length === 0) {
    const failed = data?.failed ?? 0;
    if (failed > 0) {
      return <AllFailedPanel failed={failed} onRegenerate={onRegenerate} />;
    }
    return <EmptyGuidePanel onGoToEnterprise={onGoToEnterprise} onGoToPool={onGoToPool} />;
  }

  // 有结果：self 置顶高亮 + 候选按综合分排名
  const selfRow = data.top.find((s) => s.isSelf) ?? null;
  const poolRows = data.top.filter((s) => !s.isSelf);
  const bestPool = poolRows.length > 0 ? poolRows[0] : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      {/* 头部 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-50">
            <Target className="w-4 h-4 text-purple-600" />
          </span>
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
      <ScopeDisclosure poolSize={data.poolSize} evaluated={data.evaluated} failed={data.failed} cached={!!data.cached} />

      {/* 对比小结：你自己 vs 最佳候选 */}
      {selfRow && bestPool && (
        <CompareSummary selfScore={selfRow.overall} bestCompany={bestPool.company || ""} bestScore={bestPool.overall} />
      )}

      {/* 候选缺诊断补全提示 */}
      {data.diagPending != null && data.diagPending > 0 && (
        <DiagPendingHint count={data.diagPending} onGoToPool={onGoToPool} />
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
