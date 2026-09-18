/**
 * AI 适配评分卡片 v2（雷达图 + 总分 + 维度明细含评判标准与证据）
 * Ai Score Card
 *
 * @module features/procurement/components/AiScoreCard
 * @description 7 维度雷达图 + 中央总分 + 各维度进度条。
 *              每个维度可展开查看：评判标准（静态说明）+ 评分依据（LLM 证据）。
 *              分数按区间着色（≥70 绿 / 40-69 黄 / <40 红）+ 等级标签。
 *              遵循 WorldMapChart 模式：动态导入 echarts、resize 监听、dispose 清理。
 */
import { useEffect, useRef, useState } from "react";
import { Target, RefreshCw, AlertTriangle, Sparkles, ChevronDown, Info, ChevronRight } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { AiScoreData } from "../api/ai-score";

export interface AiScoreCardProps {
  data: AiScoreData | null;
  loading: boolean;
  error: string | null;
  onStart: () => void;
  onRegenerate: () => void;
}

interface DimensionDef {
  key: keyof Omit<AiScoreData, "overall" | "reasons" | "cached">;
  labelKey: string;
  labelDefault: string;
  /** 评判标准（静态说明：这个维度评什么） */
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

/** 综合分 → 结论话术 */
function overallVerdict(score: number, t: (k: string) => string): string {
  if (score >= 75) return t("aiScoreVerdictHigh") || "适配度高，建议重点跟进本标，尽快准备投标文件。";
  if (score >= 50) return t("aiScoreVerdictMid") || "适配度中等，建议补齐短板维度后再评估投标可行性。";
  return t("aiScoreVerdictLow") || "适配度偏低，本标与贵司当前能力匹配不足，建议谨慎投入或寻找更匹配的机会。";
}

export function AiScoreCard({ data, loading, error, onStart, onRegenerate }: AiScoreCardProps) {
  const { t } = useLocale();
  const chartRef = useRef<HTMLDivElement>(null);
  const echartsRef = useRef<any>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [reasoningOpen, setReasoningOpen] = useState(false);

  const toggle = (key: string) => setExpanded((s) => ({ ...s, [key]: !s[key] }));

  // ECharts 雷达图初始化
  useEffect(() => {
    if (!data || !chartRef.current) return;
    let disposed = false;

    (async () => {
      const echarts = await import("echarts");
      if (disposed || !chartRef.current) return;

      const chart = echarts.init(chartRef.current);
      echartsRef.current = chart;

      const values = DIMENSIONS.map((d) => data[d.key] as number);
      chart.setOption({
        radar: {
          indicator: DIMENSIONS.map((d) => ({ name: t(d.labelKey) || d.labelDefault, max: 100 })),
          radius: "68%",
          axisName: { color: "#64748b", fontSize: 11 },
          splitArea: { areaStyle: { color: ["#faf5ff", "#f3e8ff"] } },
          splitLine: { lineStyle: { color: "#e9d5ff" } },
          axisLine: { lineStyle: { color: "#e9d5ff" } },
        },
        series: [{
          type: "radar",
          data: [{
            value: values,
            name: t("aiScoreOverall") || "综合适配",
            areaStyle: { color: "rgba(147,51,234,0.2)" },
            lineStyle: { color: "#9333ea", width: 2 },
            itemStyle: { color: "#9333ea" },
          }],
        }],
      });

      const onResize = () => chart.resize();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    })();

    return () => {
      disposed = true;
      echartsRef.current?.dispose();
      echartsRef.current = null;
    };
  }, [data, t]);

  // 未评分：引导按钮
  if (!data && !loading && !error) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <Target className="w-10 h-10 text-purple-400 mx-auto mb-3" />
        <h3 className="text-base font-extrabold text-slate-900 mb-2">
          {t("detail_tabAiScore") || "AI 适配评分"}
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          {t("aiScoreIntro") || "AI 将从 7 个维度评估贵司与本标的适配度，帮助您快速判断投标可行性。"}
        </p>
        <button
          type="button"
          onClick={onStart}
          className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 text-sm font-bold transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          {t("aiScoreStart") || "开始评分"}
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
            {t("detail_tabAiScore") || "AI 适配评分"}
          </h3>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-48 rounded-xl bg-slate-100" />
          <div className="h-4 w-3/4 bg-slate-100 rounded" />
          <div className="h-4 w-1/2 bg-slate-100 rounded" />
        </div>
      </section>
    );
  }

  // 错误
  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50/50 p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
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

  const overallStyle = scoreStyle(data!.overall);

  // 有数据
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-purple-600" />
          <h3 className="text-base font-extrabold text-slate-900">
            {t("detail_tabAiScore") || "AI 适配评分"}
          </h3>
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          {t("aiScoreRegenerate") || "重新评分"}
        </button>
      </div>

      {/* 雷达图 + 总分 + 结论 */}
      <div className="flex flex-col sm:flex-row items-center gap-6 mb-5">
        <div ref={chartRef} className="w-full sm:w-64 h-52 shrink-0" />
        <div className="flex-1 text-center sm:text-left">
          <div className="flex items-baseline justify-center sm:justify-start gap-2">
            <span className={`text-5xl font-black ${overallStyle.color}`}>{data!.overall}</span>
            <span className="text-sm text-slate-400">/ 100</span>
            <span className={`ml-1 px-2 py-0.5 rounded-full border text-xs font-bold ${overallStyle.labelCls}`}>
              {overallStyle.label}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">{t("aiScoreOverall") || "综合适配分"}</p>
          <p className="text-sm text-slate-700 mt-3 leading-6">{overallVerdict(data!.overall, t)}</p>
        </div>
      </div>

      {/* 思维链推理过程 */}
      {data!.reasoning && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setReasoningOpen(!reasoningOpen)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-purple-50/60 border border-purple-100 hover:bg-purple-50 transition-colors text-left"
          >
            <Sparkles className="w-4 h-4 text-purple-500 shrink-0" />
            <span className="text-xs font-bold text-purple-700 flex-1">
              {t("aiScoreReasoning") || "AI 分析推理过程"}
            </span>
            <ChevronRight className={`w-3.5 h-3.5 text-purple-400 transition-transform duration-300 ${reasoningOpen ? "rotate-90" : ""}`} />
          </button>
          <div className={`grid transition-all duration-300 ease-in-out ${reasoningOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden">
              <div className="px-3 pb-3 pt-2">
                <p className="text-xs text-slate-600 leading-5 whitespace-pre-wrap">{data!.reasoning}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 维度明细：进度条 + 可展开的评判标准与证据 */}
      <div className="space-y-1">
        {DIMENSIONS.map((d) => {
          const score = data![d.key] as number;
          const st = scoreStyle(score);
          const detail = data!.details?.[d.key as string];
          const isOpen = !!expanded[d.key as string];
          return (
            <div key={d.key} className="rounded-lg border border-slate-100 bg-slate-50/50 overflow-hidden transition-shadow hover:shadow-sm">
              {/* 行：维度名 + 进度条 + 分数 + 展开箭头 */}
              <button
                type="button"
                onClick={() => toggle(d.key as string)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-100/60 transition-colors text-left"
              >
                <span className="text-xs font-bold text-slate-700 w-20 shrink-0">
                  {t(d.labelKey) || d.labelDefault}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
                  <div className={`h-full rounded-full ${st.bar} transition-all duration-500`} style={{ width: `${score}%` }} />
                </div>
                <span className={`text-sm font-black w-8 text-right ${st.color}`}>{score}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {/* 展开区：grid-rows 平滑动画 + 结构化证据 */}
              <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <div className="px-3 pb-3 pt-2 space-y-2.5 border-t border-slate-100">
                    {/* 评判标准 */}
                    <div className="flex items-start gap-1.5">
                      <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <p className="text-2xs text-slate-500 leading-4">
                        <span className="font-bold text-slate-600">{t("aiScoreCriteriaLabel") || "评判标准"}：</span>
                        {t(d.criteriaKey) || d.criteriaDefault}
                      </p>
                    </div>
                    {/* 评分依据总结 */}
                    {detail?.reason && (
                      <div className="flex items-start gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                        <p className="text-2xs text-slate-600 leading-4">
                          <span className="font-bold text-purple-600">{t("aiScoreEvidenceLabel") || "评分依据"}：</span>
                          {detail.reason}
                        </p>
                      </div>
                    )}
                    {/* 匹配项（加分） */}
                    {detail?.matched && detail.matched.length > 0 && (
                      <div className="rounded-md bg-emerald-50/60 border border-emerald-100 px-2.5 py-2">
                        <p className="text-2xs font-bold text-emerald-700 mb-1">{t("aiScoreMatchedLabel") || "匹配项（加分）"}</p>
                        <ul className="space-y-1">
                          {detail.matched.map((m, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-2xs text-emerald-800 leading-4">
                              <span className="text-emerald-500 font-black shrink-0">+</span>{m}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {/* 差距项（扣分） */}
                    {detail?.gaps && detail.gaps.length > 0 && (
                      <div className="rounded-md bg-rose-50/60 border border-rose-100 px-2.5 py-2">
                        <p className="text-2xs font-bold text-rose-700 mb-1">{t("aiScoreGapsLabel") || "差距项（扣分）"}</p>
                        <ul className="space-y-1">
                          {detail.gaps.map((g, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-2xs text-rose-800 leading-4">
                              <span className="text-rose-500 font-black shrink-0">−</span>{g}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部提示 */}
      <p className="text-2xs text-slate-400 mt-3 text-center">
        {t("aiScoreDisclaimer") || "评分由 AI 基于公告原文与企业画像自动生成，仅供参考，不构成投标决策依据。点击各维度可查看评判标准与评分依据。"}
      </p>
    </section>
  );
}
