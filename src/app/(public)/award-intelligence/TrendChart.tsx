"use client";

/**
 * 采购金额趋势图（ECharts 柱线组合）
 * Procurement Trend Chart
 *
 * @module app/(public)/award-intelligence/TrendChart
 * @description 遵循 WorldMapChart 模式：动态 import echarts、resize 监听、dispose 清理。
 *              从 990 行 page-client 拆出，聚焦单一图表职责。
 */
import { useCallback, useEffect, useRef } from "react";
import { TREND_DATA } from "./curatedData";

export function TrendChart() {
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

      const maxAmount = Math.max(...TREND_DATA.map((d) => d.amount));
      const maxCount = Math.max(...TREND_DATA.map((d) => d.count));
      const yMaxAmount = Math.ceil(maxAmount);
      const yMaxCount = Math.ceil(maxCount / 10) * 10;

      chart.setOption({
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          backgroundColor: "rgba(255, 255, 255, 0.96)",
          borderColor: "#e2e8f0",
          borderWidth: 1,
          textStyle: { color: "#1e293b", fontSize: 12 },
          formatter: (params: any[]) => {
            const bar = params.find((p) => p.seriesType === "bar");
            const line = params.find((p) => p.seriesType === "line");
            return '<div style="padding:2px 4px;">' +
              '<div style="font-weight:700;margin-bottom:4px;">' + (bar?.name ?? "") + "</div>" +
              (bar ? '<div style="color:#60a5fa;">采购金额：US$' + bar.value + "B</div>" : "") +
              (line ? '<div style="color:#14b8a6;">中标项目：' + line.value + " 项</div>" : "") +
              "</div>";
          },
        },
        legend: {
          data: ["采购金额（USD）", "中标项目数"],
          bottom: 0,
          textStyle: { fontSize: 11, color: "#64748b" },
          itemWidth: 12,
          itemHeight: 8,
        },
        grid: {
          left: 48,
          right: 48,
          top: 8,
          bottom: 36,
        },
        xAxis: {
          type: "category",
          data: TREND_DATA.map((d) => d.month),
          axisLine: { lineStyle: { color: "#e2e8f0" } },
          axisTick: { show: false },
          axisLabel: { fontSize: 10, color: "#94a3b8" },
        },
        yAxis: [
          {
            type: "value",
            name: "B",
            nameTextStyle: { fontSize: 10, color: "#94a3b8", padding: [0, 0, 0, -16] },
            min: 0,
            max: yMaxAmount,
            interval: Math.round(yMaxAmount * 0.25),
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { lineStyle: { color: "#f1f5f9", type: "dashed" } },
            axisLabel: { fontSize: 10, color: "#94a3b8", formatter: "{value}B" },
          },
          {
            type: "value",
            name: "项",
            nameTextStyle: { fontSize: 10, color: "#94a3b8", padding: [0, -16, 0, 0] },
            min: 0,
            max: yMaxCount,
            interval: Math.round(yMaxCount * 0.25),
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { fontSize: 10, color: "#94a3b8" },
          },
        ],
        series: [
          {
            name: "采购金额（USD）",
            type: "bar",
            barWidth: "50%",
            itemStyle: { color: "rgba(96, 165, 250, 0.7)", borderRadius: [2, 2, 0, 0] },
            emphasis: { itemStyle: { color: "rgba(96, 165, 250, 0.9)" } },
            data: TREND_DATA.map((d) => d.amount),
          },
          {
            name: "中标项目数",
            type: "line",
            yAxisIndex: 1,
            symbol: "circle",
            symbolSize: 6,
            lineStyle: { color: "#14b8a6", width: 2 },
            itemStyle: { color: "#14b8a6", borderWidth: 2, borderColor: "#fff" },
            data: TREND_DATA.map((d) => d.count),
          },
        ],
      });

      const handleResize = () => chart.resize();
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        chart.dispose();
      };
    });
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initChart().then((fn) => { if (fn) cleanup = fn; });
    return () => {
      cleanup?.();
      chartInstance.current?.dispose();
    };
  }, [initChart]);

  return <div ref={chartRef} className="w-full" style={{ height: "200px" }} />;
}
