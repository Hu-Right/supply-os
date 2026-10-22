"use client";

/**
 * 采购趋势图（ECharts 柱线组合）— 数据由父级注入真实 TrendSeries。
 * Procurement Trend Chart
 *
 * @module app/(public)/award-intelligence/TrendChart
 * @description 遵循 WorldMapChart 模式：动态 import echarts、resize 监听、dispose 清理。
 *              数据来自视图模型（真实 by_month）；金额不可用时仅画计数柱并提示。
 */
import { useCallback, useEffect, useRef } from "react";
import type { TrendSeries } from "@/features/procurement/awards/awardViewModel";

export function TrendChart({ series }: { series: TrendSeries }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  const initChart = useCallback((): Promise<(() => void) | undefined> => {
    if (!chartRef.current) return Promise.resolve(undefined);

    // 动态导入 echarts（不阻塞首屏）
    return import("echarts/core").then(async (echarts) => {
      const charts = await import("echarts/charts");
      const components = await import("echarts/components");
      const renderers = await import("echarts/renderers");

      echarts.use([charts.BarChart, charts.LineChart, components.GridComponent, components.TooltipComponent, components.LegendComponent, renderers.CanvasRenderer]);

      const chart = echarts.init(chartRef.current!);
      chartInstance.current = chart;

      const hasAmount = Array.isArray(series.amountsUsd);
      const maxCount = Math.max(...series.counts, 1);
      const yMaxCount = Math.ceil(maxCount / 10) * 10;

      const seriesArr: any[] = [
        { name: "中标项目数", type: "bar", barWidth: "50%", itemStyle: { color: "rgba(20,184,166,0.75)", borderRadius: [2, 2, 0, 0] }, emphasis: { itemStyle: { color: "rgba(20,184,166,0.9)" } }, data: series.counts },
      ];

      if (hasAmount) {
        const amounts = series.amountsUsd as number[];
        seriesArr.push({ name: "中标金额(USD)", type: "line", yAxisIndex: 1, symbol: "circle", symbolSize: 6, lineStyle: { color: "#60a5fa", width: 2 }, itemStyle: { color: "#60a5fa" }, data: amounts.map((v) => +(v / 1e9).toFixed(2)) });
        chart.setOption({
          tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
          legend: { data: ["中标项目数", "中标金额(USD)"], bottom: 0, textStyle: { fontSize: 11, color: "#64748b" }, itemWidth: 12, itemHeight: 8 },
          grid: { left: 44, right: 44, top: 8, bottom: 36 },
          xAxis: { type: "category", data: series.months, axisLine: { lineStyle: { color: "#e2e8f0" } }, axisTick: { show: false }, axisLabel: { fontSize: 10, color: "#94a3b8" } },
          yAxis: [
            { type: "value", max: yMaxCount, axisLabel: { fontSize: 10, color: "#94a3b8" }, splitLine: { lineStyle: { color: "#f1f5f9", type: "dashed" } } },
            { type: "value", name: "B", axisLabel: { fontSize: 10, color: "#94a3b8", formatter: "{value}B" }, splitLine: { show: false } },
          ],
          series: seriesArr,
        });
      } else {
        chart.setOption({
          tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
          grid: { left: 44, right: 16, top: 8, bottom: 24 },
          xAxis: { type: "category", data: series.months, axisLine: { lineStyle: { color: "#e2e8f0" } }, axisTick: { show: false }, axisLabel: { fontSize: 10, color: "#94a3b8" } },
          yAxis: [{ type: "value", max: yMaxCount, axisLabel: { fontSize: 10, color: "#94a3b8" }, splitLine: { lineStyle: { color: "#f1f5f9", type: "dashed" } } }],
          series: seriesArr,
        });
      }

      const handleResize = () => chart.resize();
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        chart.dispose();
      };
    });
  }, [series]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initChart().then((fn) => { if (fn) cleanup = fn; });
    return () => {
      cleanup?.();
      chartInstance.current?.dispose();
    };
  }, [initChart]);

  return (
    <div className="w-full">
      <div ref={chartRef} className="w-full" style={{ height: "200px" }} />
      {!Array.isArray(series.amountsUsd) && (
        <p className="text-2xs text-slate-400 mt-1 text-center">金额未公开（来源未提供中标金额），仅展示中标项目数</p>
      )}
    </div>
  );
}
