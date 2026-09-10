"use client";

/**
 * 全球商机地图 — ECharts 世界地图（懒加载版）
 * Global Opportunities World Map — Lazy-loaded ECharts
 *
 * @module shared/ui/charts/WorldMapChart
 * @description 展示各国未过期商机数量，鼠标悬停显示国家名和商机数。
 *              使用 IntersectionObserver 实现视口感知，仅在进入视口时
 *              动态加载 echarts 库和请求数据，避免阻塞首屏渲染。
 *              ECharts 通过 await import() 动态导入，不进入首屏 bundle。
 *              countries 数据由外部传入，避免与 useHomeStats 重复请求。
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { getCountryDisplayName } from "@/shared/data/countryNames";

interface CountryData {
  country: string;
  count: number;
}

interface WorldMapChartProps {
  /** 国家商机数据，由父组件通过 useHomeStats 统一提供 */
  countries?: CountryData[];
}

export function WorldMapChart({ countries }: WorldMapChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  // 视口感知：进入视口后才开始加载
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }, // 提前 200px 开始加载
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const initChart = useCallback(async () => {
    if (!chartRef.current) return;
    setLoading(true);

    try {
      // 动态导入 echarts（不阻塞首屏）
      const echarts = await import("echarts/core");
      const { GeoComponent, TooltipComponent, VisualMapComponent } = await import("echarts/components");
      const { MapChart } = await import("echarts/charts");
      const { CanvasRenderer } = await import("echarts/renderers");

      echarts.use([GeoComponent, TooltipComponent, VisualMapComponent, MapChart, CanvasRenderer]);

      // 获取国家数据：优先使用 props，否则 fallback 到 API
      let countryData: CountryData[] = countries ?? [];
      if (!countries?.length) {
        const res = await fetch("/api/notices/countries");
        if (!res.ok) throw new Error("Failed to fetch country data");
        countryData = await res.json();
      }

      // 获取世界地图 GeoJSON
      const mapRes = await fetch("/world-map.json");
      if (!mapRes.ok) throw new Error("Failed to fetch world map");
      const worldGeoJSON = await mapRes.json();

      // 转换 GeoJSON：将 feature name 改为中文，并移除南极洲
      if (worldGeoJSON.features) {
        worldGeoJSON.features = worldGeoJSON.features
          .filter((feature: any) => {
            const enName = feature.properties.NAME || feature.properties.ADMIN || feature.properties.SOVEREIGNT || "";
            return enName !== "Antarctica";
          })
          .map((feature: any) => {
            const enName = feature.properties.NAME || feature.properties.ADMIN || feature.properties.SOVEREIGNT || "";
            const cnName = getCountryDisplayName(enName, "zh");
            return {
              ...feature,
              properties: {
                ...feature.properties,
                name: cnName,
                _enName: enName,
              },
            };
          });
      }

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
            const displayName = params.name;
            const enName = params.data?._enName || displayName;
            const count = countryCountMap.get(enName) || 0;
            return `
              <div style="padding: 4px 8px;">
                <div style="font-weight: 700; margin-bottom: 4px; font-size: 14px;">${displayName}</div>
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
          roam: false,
          zoom: 1.2,
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
              name: getCountryDisplayName(item.country, "zh"),
              value: item.count,
              _enName: item.country,
            })),
          },
        ],
      });

      setLoading(false);

      const handleResize = () => chart.resize();
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        chart.dispose();
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载地图失败");
      setLoading(false);
    }
  }, [countries]);

  // 可见时初始化图表
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    initChart().then((cleanup) => {
      if (cancelled) cleanup?.();
    });

    return () => {
      cancelled = true;
      chartInstance.current?.dispose();
    };
  }, [visible, initChart]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 bg-slate-50 rounded-2xl border border-slate-200">
        <p className="text-sm text-rose-600">地图加载失败：{error}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-[400px] md:h-[500px]">
      {!visible && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-200">
          <p className="text-sm text-slate-400">向下滚动加载地图</p>
        </div>
      )}
      {visible && loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-200">
          <div className="text-center">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-teal-200 border-t-teal-600 mb-3" />
            <p className="text-sm text-slate-500">加载世界地图...</p>
          </div>
        </div>
      )}
      <div
        ref={chartRef}
        className="w-full h-full"
      />
    </div>
  );
}
