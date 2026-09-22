/**
 * AI 智能匹配结果卡片（Top N 供应商推荐排行）
 * Ai Match Card
 *
 * @module features/procurement/components/AiMatchCard
 * @description 从用户供应商资源库中推荐 Top 3 最匹配公告的供应商。
 *              每个供应商卡片显示：排名 + 公司名 + 综合分 + 等级标签。
 *              可展开查看 7 维度进度条 + 评判标准 + 评分依据。
 */
import { useState } from "react";
import { Target, RefreshCw, AlertTriangle, Sparkles, ChevronDown, Info, ArrowRight, Building2, Lock } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { AiMatchData, MatchedSupplier } from "../api/ai-match";
import { parseVipRank, rankToTierKey } from "../api/notice-gate";

export interface AiMatchCardProps {
  data: AiMatchData | null;
  loading: boolean;
  /** 历史缓存回读中（true 且无数据时显示骨架屏，避免引导按钮闪烁） */
  cacheLoading?: boolean;
  error: string | null;
  onStart: () => void;
  onRegenerate: () => void;
  onGoToPool: () => void;
}

interface DimensionDef {
  key: string;
  labelKey: string;
  labelDefault: string;
  criteriaKey: string;
  criteriaDefault: string;
}

const DIMENSIONS: DimensionDef[] = [
  { key: "qualification", labelKey: "aiScoreQualification", labelDefault: "资质匹配",
    criteriaKey: "aiScoreCriteriaQualification", criteriaDefault: "企业营业执照、行业资质 vs 公告投标门槛的覆盖程度" },
  { key: "experience", labelKey: "aiScoreExperience", labelDefault: "经验匹配",
    criteriaKey: "aiScoreCriteriaExperience", criteriaDefault: "主营产品/业务经验 vs 采购内容的相关性与业绩积累" },
  { key: "certification", labelKey: "aiScoreCertification", labelDefault: "认证覆盖",
    criteriaKey: "aiScoreCriteriaCertification", criteriaDefault: "ISO/CE 等体系认证 vs 公告强制认证要求的匹配度" },
  { key: "region", labelKey: "aiScoreRegion", labelDefault: "地域适配",
    criteriaKey: "aiScoreCriteriaRegion", criteriaDefault: "企业所在地 vs 采购国/交付地/本地化或属地要求" },
  { key: "scale", labelKey: "aiScoreScale", labelDefault: "规模匹配",
    criteriaKey: "aiScoreCriteriaScale", criteriaDefault: "注册资本/成立年限/企业体量 vs 项目预算规模" },
  { key: "delivery", labelKey: "aiScoreDelivery", labelDefault: "交期适配",
    criteriaKey: "aiScoreCriteriaDelivery", criteriaDefault: "产能与交付能力 vs 公告交付周期/里程碑要求" },
  { key: "price", labelKey: "aiScorePrice", labelDefault: "价格竞争力",
    criteriaKey: "aiScoreCriteriaPrice", criteriaDefault: "经营类型(工厂/贸易商)与成本结构 vs 采购预算/价格敏感度" },
];

/** 分数 → 颜色/等级 */
function scoreStyle(score: number) {
  if (score >= 70) return { color: "text-emerald-600", bar: "bg-emerald-500", label: "优", labelCls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (score >= 40) return { color: "text-amber-600", bar: "bg-amber-500", label: "中", labelCls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { color: "text-rose-600", bar: "bg-rose-500", label: "弱", labelCls: "bg-rose-50 text-rose-700 border-rose-200" };
}

/** 排名徽章颜色 */
function rankBadge(rank: number) {
  if (rank === 1) return "bg-amber-400 text-white";
  if (rank === 2) return "bg-slate-300 text-white";
  return "bg-amber-700/60 text-white";
}

export function AiMatchCard({ data, loading, cacheLoading, error, onStart, onRegenerate, onGoToPool }: AiMatchCardProps) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => setExpanded((s) => ({ ...s, [key]: !s[key] }));

  /** 错误映射：限流/解锁/通用，避免直接暴露 HTTP 状态码（档位不足由上方琥珀引导卡接管） */
  const friendlyError = (raw: string): string => {
    if (raw.includes("429") || raw.includes("rate")) {
      return t("aiScoreErrorRate") || "AI 服务请求过于频繁，请稍后再试。";
    }
    if (raw.includes("403") || raw.includes("core_locked") || raw.includes("锁定") || raw.includes("解锁")) {
      return t("aiScoreErrorLocked") || "请先解锁本公告，再进行 AI 匹配。";
    }
    if (raw.includes("401") || raw.includes("LLM_NOT_CONFIGURED")) {
      return t("aiScoreErrorAuth") || "登录已过期或未配置 AI 模型，请检查后再试。";
    }
    return t("aiScoreErrorGeneric") || "AI 匹配过程中出现错误，请稍后重试。";
  };

  // 缓存回读中：与匹配中共用骨架屏，避免"先闪引导按钮再出结果"
  if (cacheLoading && !data && !loading && !error) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-purple-600" />
          <h3 className="text-base font-extrabold text-slate-900">
            {t("aiMatchTitle") || "AI 智能匹配"}
          </h3>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-20 rounded-xl bg-slate-100" />
          <div className="h-20 rounded-xl bg-slate-100" />
        </div>
      </section>
    );
  }

  // 未触发状态：引导按钮
  if (!data && !loading && !error) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <Target className="w-10 h-10 text-purple-400 mx-auto mb-3" />
        <h3 className="text-base font-extrabold text-slate-900 mb-2">
          {t("aiMatchTitle") || "AI 智能匹配"}
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          {t("aiMatchIntro") || "AI 将从你的供应商资源库中推荐最合适的工厂"}
        </p>
        <button
          type="button"
          onClick={onStart}
          className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 text-sm font-bold transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          {t("aiMatchStart") || "开始匹配"}
        </button>
      </section>
    );
  }

  // 加载中
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-purple-600" />
          <h3 className="text-base font-extrabold text-slate-900">
            {t("aiMatchTitle") || "AI 智能匹配"}
          </h3>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-20 rounded-xl bg-slate-100" />
          <div className="h-20 rounded-xl bg-slate-100" />
          <div className="h-20 rounded-xl bg-slate-100" />
        </div>
      </section>
    );
  }

  // 档位不足（V2）：以琥珀色“需升级”引导卡呈现（六语），而非红色错误态
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

  // 空结果三态：资源库为空 / 评估全部失败 / 其他未生成
  if (!data || data.top.length === 0) {
    const poolSize = data?.poolSize ?? 0;
    const failed = data?.failed ?? 0;

    // 资源库为空：引导建立资源库
    if (poolSize === 0) {
      return (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 mb-4">
            {t("aiMatchEmpty") || "你还没有添加合作工厂，去建立资源库"}
          </p>
          <button
            type="button"
            onClick={onGoToPool}
            className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 text-sm font-bold transition-colors"
          >
            {t("aiMatchGoToPool") || "去建立资源库"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </section>
      );
    }

    // 有资源库但全部评估失败：错误态 + 重试
    if (failed > 0) {
      return (
        <section className="rounded-2xl border border-rose-200 bg-rose-50/50 p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
          <p className="text-sm text-rose-700 mb-4">
            {(t("aiMatchAllFailed") || "{n} 家工厂评估失败，请稍后重试").replace("{n}", String(failed))}
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

    // 兜底：有候选但未能生成结果
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500 mb-4">
          {t("aiMatchNoResult") || "未能生成匹配结果，请重新匹配"}
        </p>
        <button
          type="button"
          onClick={onRegenerate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 text-sm font-bold transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t("procurement_aiSummaryRetry") || "重试"}
        </button>
      </section>
    );
  }

  // 评估范围披露：粗筛生效时告知用户实际参与评估的数量（缓存结果无此元数据，不展示）
  const showPrefilterNote = !data.cached && data.poolSize > data.evaluated;
  const showPartialFailed = !data.cached && data.failed > 0;

  // 有结果：Top N 供应商排行
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-start gap-2">
          <Target className="w-5 h-5 text-purple-600 mt-0.5" />
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              {t("aiMatchTitle") || "AI 智能匹配"}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {t("aiMatchScopeHint") || "推荐对象：你资源库里的工厂"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          {t("aiMatchRegenerate") || "重新匹配"}
        </button>
      </div>

      {/* 评估范围与失败披露 */}
      {(showPrefilterNote || showPartialFailed) && (
        <div className="mb-3 space-y-1">
          {showPrefilterNote && (
            <p className="text-2xs text-slate-500 flex items-center gap-1">
              <Info className="w-3 h-3 text-slate-400 shrink-0" />
              {(t("aiMatchPrefilterNote") || "资源库共 {total} 家，已按行业相关性筛选 {evaluated} 家参与评估")
                .replace("{total}", String(data.poolSize))
                .replace("{evaluated}", String(data.evaluated))}
            </p>
          )}
          {showPartialFailed && (
            <p className="text-2xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
              {(t("aiMatchPartialFailed") || "{n} 家工厂评估失败已跳过，可重新匹配").replace("{n}", String(data.failed))}
            </p>
          )}
        </div>
      )}

      {/* 诊断补全提示：池中有工厂缺诊断资料时引导补全（提升后续匹配准确度） */}
      {data.top.length > 0 && (data.diagPending ?? 0) > 0 && (
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

      {/* Top N 供应商列表 */}
      <div className="space-y-3">
        {data.top.map((supplier, idx) => (
          <SupplierCard
            key={supplier.pool_id}
            supplier={supplier}
            rank={idx + 1}
            expanded={expanded}
            toggle={toggle}
            t={t}
          />
        ))}
      </div>

      {/* 底部提示 */}
      <p className="text-2xs text-slate-400 mt-3 text-center">
        {t("aiMatchDisclaimer") || "匹配结果由 AI 基于公告要求与供应商画像自动生成，仅供参考。"}
      </p>
    </section>
  );
}

/** 单个供应商匹配卡片 */
function SupplierCard({
  supplier,
  rank,
  expanded,
  toggle,
  t,
}: {
  supplier: MatchedSupplier;
  rank: number;
  expanded: Record<string, boolean>;
  toggle: (key: string) => void;
  t: (key: string) => string;
}) {
  const overallStyle = scoreStyle(supplier.overall);
  const isExpanded = !!expanded[`supplier-${supplier.pool_id}`];

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 overflow-hidden">
      {/* 头部：排名 + 公司名 + 综合分 */}
      <button
        type="button"
        onClick={() => toggle(`supplier-${supplier.pool_id}`)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-100/60 transition-colors text-left"
      >
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${rankBadge(rank)}`}>
          {rank}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{supplier.company}</p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-2xl font-black ${overallStyle.color}`}>{supplier.overall}</span>
          <span className="text-2xs text-slate-400">/100</span>
          <span className={`px-1.5 py-0.5 rounded border text-2xs font-bold ${overallStyle.labelCls}`}>
            {overallStyle.label}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`} />
      </button>

      {/* 展开：维度明细 */}
      <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-2 space-y-2 border-t border-slate-100">
            {/* 整体推理过程（新缓存才携带；旧缓存无此字段则不展示） */}
            {supplier.reasoning && (
              <div className="rounded-md bg-purple-50/60 border border-purple-100 px-2.5 py-2">
                <p className="text-2xs font-bold text-purple-700 mb-1">
                  {t("aiScoreReasoning") || "AI 分析推理过程"}
                </p>
                <p className="text-2xs text-slate-600 leading-4 whitespace-pre-wrap">{supplier.reasoning}</p>
              </div>
            )}
            {/* 匹配项 + 差距项摘要 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              {/* 核心优势 */}
              <div className="rounded-md bg-emerald-50/60 border border-emerald-100 px-2.5 py-2">
                <p className="text-2xs font-bold text-emerald-700 mb-1">
                  {t("aiMatchStrengths") || "核心优势"}
                </p>
                <ul className="space-y-0.5">
                  {DIMENSIONS.slice(0, 3).map((d) => {
                    const detail = supplier.details?.[d.key];
                    const score = (supplier as any)[d.key] as number;
                    if (score >= 60 && detail?.reason) {
                      return (
                        <li key={d.key} className="text-2xs text-emerald-800 leading-4 truncate">
                          <span className="text-emerald-500 font-black">+</span> {detail.reason}
                        </li>
                      );
                    }
                    return null;
                  })}
                </ul>
              </div>
              {/* 主要短板 */}
              <div className="rounded-md bg-rose-50/60 border border-rose-100 px-2.5 py-2">
                <p className="text-2xs font-bold text-rose-700 mb-1">
                  {t("aiMatchGaps") || "主要短板"}
                </p>
                <ul className="space-y-0.5">
                  {DIMENSIONS.slice(0, 3).map((d) => {
                    const detail = supplier.details?.[d.key];
                    const score = (supplier as any)[d.key] as number;
                    if (score < 60 && detail?.reason) {
                      return (
                        <li key={d.key} className="text-2xs text-rose-800 leading-4 truncate">
                          <span className="text-rose-500 font-black">−</span> {detail.reason}
                        </li>
                      );
                    }
                    return null;
                  })}
                </ul>
              </div>
            </div>

            {/* 7 维度进度条 */}
            {DIMENSIONS.map((d) => {
              const score = (supplier as any)[d.key] as number;
              const st = scoreStyle(score);
              const detail = supplier.details?.[d.key];
              const dimKey = `supplier-${supplier.pool_id}-${d.key}`;
              const dimOpen = !!expanded[dimKey];
              return (
                <div key={d.key} className="rounded-lg border border-slate-100 bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggle(dimKey)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-50 transition-colors text-left"
                  >
                    <span className="text-2xs font-bold text-slate-600 w-16 shrink-0">
                      {t(d.labelKey) || d.labelDefault}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
                      <div className={`h-full rounded-full ${st.bar} transition-all duration-500`} style={{ width: `${score}%` }} />
                    </div>
                    <span className={`text-2xs font-black w-6 text-right ${st.color}`}>{score}</span>
                    <ChevronDown className={`w-3 h-3 text-slate-400 shrink-0 transition-transform duration-300 ${dimOpen ? "rotate-180" : ""}`} />
                  </button>
                  {dimOpen && detail && (
                    <div className="px-2.5 pb-2 pt-1 border-t border-slate-50 space-y-1.5">
                      <div className="flex items-start gap-1">
                        <Info className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                        <p className="text-2xs text-slate-500 leading-3">
                          <span className="font-bold text-slate-600">{t("aiScoreCriteriaLabel") || "评判标准"}：</span>
                          {t(d.criteriaKey) || d.criteriaDefault}
                        </p>
                      </div>
                      {detail.reason && (
                        <div className="flex items-start gap-1">
                          <Sparkles className="w-3 h-3 text-purple-400 shrink-0 mt-0.5" />
                          <p className="text-2xs text-slate-600 leading-3">
                            <span className="font-bold text-purple-600">{t("aiScoreEvidenceLabel") || "评分依据"}：</span>
                            {detail.reason}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
