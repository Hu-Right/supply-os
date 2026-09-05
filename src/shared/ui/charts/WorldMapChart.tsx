"use client";

/**
 * 全球商机地图 — ECharts 世界地图
 * Global Opportunities World Map
 *
 * @module shared/ui/charts/WorldMapChart
 * @description 展示各国未过期商机数量，鼠标悬停显示国家名和商机数。
 *              参考 portal.ungpa.com 的地图实现。
 */

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { GeoComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { MapChart } from "echarts/charts";
import { CanvasRenderer } from "echarts/renderers";
import { COUNTRY_NAME_CN } from "./countryNameMap";

echarts.use([GeoComponent, TooltipComponent, VisualMapComponent, MapChart, CanvasRenderer]);

interface CountryData {
  country: string;
  count: number;
}

export function WorldMapChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!chartRef.current) return;

      try {
        // 获取国家数据
        const res = await fetch("/api/notices/countries");
        if (!res.ok) throw new Error("Failed to fetch country data");
        const countryData: CountryData[] = await res.json();

        if (cancelled) return;

        // 获取世界地图 GeoJSON
        const mapRes = await fetch("/world-map.json");
        if (!mapRes.ok) throw new Error("Failed to fetch world map");
        const worldGeoJSON = await mapRes.json();

        if (cancelled) return;

        // 注册地图
        echarts.registerMap("world", worldGeoJSON);

        // 构建国家名→商机数映射
        const countryCountMap = new Map<string, number>();
        let maxCount = 0;
        for (const item of countryData) {
          countryCountMap.set(item.country, item.count);
          if (item.count > maxCount) maxCount = item.count;
        }

        // 初始化图表
        const chart = echarts.init(chartRef.current);
        chartInstance.current = chart;

        chart.setOption({
          tooltip: {
            trigger: "item",
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            borderColor: "#e2e8f0",
            borderWidth: 1,
            textStyle: { color: "#1e293b", fontSize: 13 },
            formatter: (params: any) => {
              const enName = params.name;
              const cnName = COUNTRY_NAME_CN[enName] || enName;
              const count = countryCountMap.get(enName) || 0;
              return `
                <div style="padding: 4px 8px;">
                  <div style="font-weight: 700; margin-bottom: 4px; font-size: 14px;">${cnName}</div>
                  <div style="color: #0d9488; font-weight: 600;">${count.toLocaleString()} 条商机</div>
                </div>
              `;
            },
          },
          visualMap: {
            min: 0,
            max: Math.max(maxCount, 1000),
            left: "left",
            bottom: "20",
            text: ["高", "低"],
            calculable: true,
            inRange: {
              color: ["#e2e8f0", "#93c5fd", "#2dd4bf", "#fbbf24", "#f97316", "#ef4444"],
            },
            textStyle: { color: "#64748b", fontSize: 11 },
            itemWidth: 12,
            itemHeight: 80,
          },
          geo: {
            map: "world",
            roam: true,
            zoom: 1.2,
            scaleLimit: { min: 1, max: 5 },
            center: [0, 20],
            label: { show: false },
            itemStyle: {
              areaColor: "#e2e8f0",
              borderColor: "#ffffff",
              borderWidth: 0.5,
            },
            emphasis: {
              itemStyle: {
                areaColor: "#2dd4bf",
                borderColor: "#0d9488",
                borderWidth: 1,
              },
              label: { show: false },
            },
          },
          series: [
            {
              type: "map",
              geoIndex: 0,
              data: countryData.map(item => ({
                name: item.country,
                value: item.count,
              })),
            },
          ],
        });

        setLoading(false);

        // 响应式
        const handleResize = () => chart.resize();
        window.addEventListener("resize", handleResize);

        return () => {
          window.removeEventListener("resize", handleResize);
          chart.dispose();
        };
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载地图失败");
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      chartInstance.current?.dispose();
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 bg-slate-50 rounded-2xl border border-slate-200">
        <p className="text-sm text-rose-600">地图加载失败：{error}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[500px]">
      {/* 加载遮罩 */}
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-200">
          <div className="text-center">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-teal-200 border-t-teal-600 mb-3" />
            <p className="text-sm text-slate-500">加载世界地图...</p>
          </div>
        </div>
      )}
      {/* 图表容器 */}
      <div
        ref={chartRef}
        className="w-full h-full rounded-2xl border border-slate-200 bg-white"
      />
    </div>
  );
}
