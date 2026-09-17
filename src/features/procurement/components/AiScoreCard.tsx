/**
 * AI 适配评分卡片（ECharts 雷达图 + 总分）
 * Ai Score Card
 *
 * @module features/procurement/components/AiScoreCard
 * @description 7 维度雷达图 + 中央总分 + 各维度分数列表。
 *              遵循 WorldMapChart 模式：动态导入 echarts、resize 监听、dispose 清理。
 */
import { useEffect, useRef } from "react";
import { Target, RefreshCw, AlertTriangle, Sparkles } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { AiScoreData } from "../api/ai-score";

export interface AiScoreCardProps {
  data: AiScoreData | null;
  loading: boolean;
  error: string | null;
  onStart: () => void;
  onRegenerate: () => void;
}

const DIMENSIONS: { key: keyof Omit<AiScoreData, "overall" | "reasons" | "cached">; labelKey: string; labelDefault: string }[] = [
  { key: "qualification", labelKey: "aiScoreQualification", labelDefault: "资质匹配" },
  { key: "experience", labelKey: "aiScoreExperience", labelDefault: "经验匹配" },
  { key: "certification", labelKey: "aiScoreCertification", labelDefault: "认证覆盖" },
  { key: "region", labelKey: "aiScoreRegion", labelDefault: "地域适配" },
  { key: "scale", labelKey: "aiScoreScale", labelDefault: "规模匹配" },
  { key: "delivery", labelKey: "aiScoreDelivery", labelDefault: "交期适配" },
  { key: "price", labelKey: "aiScorePrice", labelDefault: "价格竞争力" },
];

export function AiScoreCard({ data, loading, error, onStart, onRegenerate }: AiScoreCardProps) {
  const { t } = useLocale();
  const chartRef = useRef<HTMLDivElement>(null);
  const echartsRef = useRef<any>(null);

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
          radius: "65%",
          axisName: { color: "#64748b", fontSize: 11 },
          splitArea: { areaStyle: { color: ["#f8fafc", "#f1f5f9"] } },
        },
        series: [{
          type: "radar",
          data: [{
            value: values,
            name: t("aiScoreOverall") || "综合适配",
            areaStyle: { color: "rgba(20,184,166,0.25)" },
            lineStyle: { color: "#14b8a6", width: 2 },
            itemStyle: { color: "#14b8a6" },
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

  // 有数据：雷达图 + 总分 + 维度列表
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
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

      {/* 雷达图 + 总分 */}
      <div className="flex items-center gap-6">
        <div ref={chartRef} className="w-56 h-48 shrink-0" />
        <div className="text-center">
          <p className="text-4xl font-black text-purple-600">{data!.overall}</p>
          <p className="text-xs text-slate-500 mt-1">{t("aiScoreOverall") || "综合适配分"}</p>
        </div>
      </div>

      {/* 维度分数列表 */}
      <div className="mt-4 space-y-2">
        {DIMENSIONS.map((d) => (
          <div key={d.key} className="flex items-center gap-3">
            <span className="text-xs text-slate-600 w-20 shrink-0">
              {t(d.labelKey) || d.labelDefault}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-purple-500 transition-all"
                style={{ width: `${data![d.key] as number}%` }}
              />
            </div>
            <span className="text-xs font-bold text-slate-700 w-8 text-right">
              {data![d.key] as number}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
