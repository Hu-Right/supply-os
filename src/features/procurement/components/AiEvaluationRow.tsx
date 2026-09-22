/**
 * 统一评估 —— 单实体行视图
 * Ai Evaluation Row (EntityScoreView)
 *
 * @module features/procurement/components/AiEvaluationRow
 * @description 渲染「供应商 × 公告 适配评估」中的单个候选（自己 / 工厂 / 友商）：
 *              排名 + 公司名 + self 高亮徽标 + 综合分 + 可展开（推理 / 优势短板 / 7 维进度条 / 证据）。
 *              行内按数据权限给入口：self 可「编辑基本信息」；友商/工厂仅可「编辑诊断表」。
 *              画像不完整时给补全提示。采用与旧匹配卡一致的进度条式行渲染（逐行多实体不宜各挂雷达）。
 */
import { useState } from "react";
import { ChevronDown, Info, Sparkles, Building2, Pencil, Star } from "lucide-react";
import type { MatchedSupplier } from "../api/ai-match";

/** 7 维度定义（与评分链路同一套，label/criteria 复用既有 i18n 键） */
export const EVAL_DIMENSIONS = [
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
] as const;

/** 分数 → 颜色/等级 */
export function evalScoreStyle(score: number) {
  if (score >= 70) return { color: "text-emerald-600", bar: "bg-emerald-500", label: "优", labelCls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (score >= 40) return { color: "text-amber-600", bar: "bg-amber-500", label: "中", labelCls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { color: "text-rose-600", bar: "bg-rose-500", label: "弱", labelCls: "bg-rose-50 text-rose-700 border-rose-200" };
}

/** 排名徽章颜色 */
function evalRankBadge(rank: number) {
  if (rank === 1) return "bg-amber-400 text-white";
  if (rank === 2) return "bg-slate-300 text-white";
  return "bg-amber-700/60 text-white";
}

export interface AiEvaluationRowProps {
  supplier: MatchedSupplier;
  /** 排名（1 起）；self 行不参与名次展示时传 0 */
  rank: number;
  t: (key: string) => string;
  /** self：跳转编辑基本信息（企业页） */
  onEditBase?: () => void;
  /** 友商/工厂：跳转编辑诊断表（资源库页） */
  onEditDiag?: () => void;
}

export function AiEvaluationRow({ supplier, rank, t, onEditBase, onEditDiag }: AiEvaluationRowProps) {
  const [open, setOpen] = useState(false);
  const [dimOpen, setDimOpen] = useState<Record<string, boolean>>({});
  const toggleDim = (k: string) => setDimOpen((s) => ({ ...s, [k]: !s[k] }));

  const overallStyle = evalScoreStyle(supplier.overall);
  const isSelf = supplier.isSelf;

  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        isSelf ? "border-teal-300 bg-teal-50/40 ring-1 ring-teal-200" : "border-slate-100 bg-slate-50/50"
      }`}
    >
      {/* 头部：排名/self 徽标 + 公司名 + 完整度提示 + 综合分 */}
      <div className="w-full flex items-center gap-3 px-4 py-3">
        {isSelf ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-600 text-white px-2 py-0.5 text-2xs font-bold shrink-0">
            <Star className="w-3 h-3" />
            {t("aiEvalSelfBadge") || "你自己的公司"}
          </span>
        ) : (
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${evalRankBadge(rank)}`}>
            {rank}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{supplier.company || t("aiEvalUnknownCompany") || "未命名企业"}</p>
          {!isSelf && !supplier.baseComplete && (
            <p className="text-2xs text-slate-400 truncate">{t("aiEvalBaseReadonly") || "基本信息以平台目录为准"}</p>
          )}
          {!supplier.diagComplete && (
            <p className="text-2xs text-amber-600 truncate">{t("aiEvalDiagIncomplete") || "诊断未完善，补全后评分更精准"}</p>
          )}
        </div>
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className={`text-2xl font-black ${overallStyle.color}`}>{supplier.overall}</span>
          <span className="text-2xs text-slate-400">/100</span>
          <span className={`px-1.5 py-0.5 rounded border text-2xs font-bold ${overallStyle.labelCls}`}>{overallStyle.label}</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 p-1 text-slate-400 hover:text-slate-600"
          aria-label={open ? "collapse" : "expand"}
        >
          <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* 展开：权限入口 + 推理 + 优势/短板 + 7 维明细 */}
      <div className={`grid transition-all duration-300 ease-in-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-2 space-y-2.5 border-t border-slate-100">
            {/* 数据权限入口：self 改基本信息；友商/工厂仅改诊断表 */}
            {(isSelf ? onEditBase : onEditDiag) && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={isSelf ? onEditBase : onEditDiag}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1 text-2xs font-bold transition-colors"
                >
                  {isSelf ? <Building2 className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                  {isSelf ? (t("aiEvalEditBase") || "编辑基本信息") : (t("aiEvalEditDiag") || "编辑诊断表")}
                </button>
              </div>
            )}

            {supplier.reasoning && (
              <div className="rounded-md bg-purple-50/60 border border-purple-100 px-2.5 py-2">
                <p className="text-2xs font-bold text-purple-700 mb-1">{t("aiScoreReasoning") || "AI 分析推理过程"}</p>
                <p className="text-2xs text-slate-600 leading-4 whitespace-pre-wrap">{supplier.reasoning}</p>
              </div>
            )}

            {/* 核心优势 / 主要短板 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              <div className="rounded-md bg-emerald-50/60 border border-emerald-100 px-2.5 py-2">
                <p className="text-2xs font-bold text-emerald-700 mb-1">{t("aiMatchStrengths") || "核心优势"}</p>
                <ul className="space-y-0.5">
                  {EVAL_DIMENSIONS.slice(0, 3).map((d) => {
                    const detail = supplier.details?.[d.key];
                    const score = (supplier as unknown as Record<string, number>)[d.key];
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
              <div className="rounded-md bg-rose-50/60 border border-rose-100 px-2.5 py-2">
                <p className="text-2xs font-bold text-rose-700 mb-1">{t("aiMatchGaps") || "主要短板"}</p>
                <ul className="space-y-0.5">
                  {EVAL_DIMENSIONS.slice(0, 3).map((d) => {
                    const detail = supplier.details?.[d.key];
                    const score = (supplier as unknown as Record<string, number>)[d.key];
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

            {/* 7 维度进度条 + 评判标准 + 证据 */}
            {EVAL_DIMENSIONS.map((d) => {
              const score = (supplier as unknown as Record<string, number>)[d.key];
              const st = evalScoreStyle(score);
              const detail = supplier.details?.[d.key];
              const dOpen = !!dimOpen[d.key];
              return (
                <div key={d.key} className="rounded-lg border border-slate-100 bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleDim(d.key)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-50 transition-colors text-left"
                  >
                    <span className="text-2xs font-bold text-slate-600 w-16 shrink-0">{t(d.labelKey) || d.labelDefault}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
                      <div className={`h-full rounded-full ${st.bar} transition-all duration-500`} style={{ width: `${score}%` }} />
                    </div>
                    <span className={`text-2xs font-black w-6 text-right ${st.color}`}>{score}</span>
                    <ChevronDown className={`w-3 h-3 text-slate-400 shrink-0 transition-transform duration-300 ${dOpen ? "rotate-180" : ""}`} />
                  </button>
                  {dOpen && detail && (
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
