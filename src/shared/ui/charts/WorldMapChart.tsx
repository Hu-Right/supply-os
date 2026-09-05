"use client";

/**
 * 全球商机地图 — react-simple-maps 世界地图
 * Global Opportunities World Map
 *
 * @module shared/ui/charts/WorldMapChart
 * @description 展示各国未过期商机数量，鼠标悬停显示国家名和商机数。
 *              使用 react-simple-maps + Natural Earth 50m GeoJSON。
 */

import { useEffect, useState, useCallback } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";
import { COUNTRY_NAME_CN } from "./countryNameMap";

interface CountryData {
  country: string;
  count: number;
}

interface TooltipState {
  name: string;
  count: number;
  x: number;
  y: number;
}

const GEO_URL = "/world-map.json";

// 颜色比例尺（从浅到深）
const COLORS = ["#f0fdfa", "#99f6e4", "#5eead4", "#14b8a6", "#0d9488", "#0f766e"];

// 使用对数比例尺，避免极大值压缩其他国家的颜色差异
function getColor(value: number, max: number): string {
  if (value === 0) return "#e2e8f0"; // 无数据：灰色
  if (max <= 1) return COLORS[COLORS.length - 1];
  // 对数缩放：log(1)=0, log(max)=1
  const logMax = Math.log10(max);
  const logValue = Math.log10(value);
  const ratio = logValue / logMax;
  const idx = Math.min(Math.floor(ratio * COLORS.length), COLORS.length - 1);
  return COLORS[idx];
}

export function WorldMapChart() {
  const [countryData, setCountryData] = useState<CountryData[]>([]);
  const [countryCountMap, setCountryCountMap] = useState<Map<string, number>>(new Map());
  const [maxCount, setMaxCount] = useState(1000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [position, setPosition] = useState<{ coordinates: [number, number]; zoom: number }>({ coordinates: [0, 20], zoom: 1 });

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        const res = await fetch("/api/notices/countries");
        if (!res.ok) throw new Error("Failed to fetch country data");
        const data: CountryData[] = await res.json();

        if (cancelled) return;

        const map = new Map<string, number>();
        let max = 0;
        for (const item of data) {
          map.set(item.country, item.count);
          if (item.count > max) max = item.count;
        }

        setCountryData(data);
        setCountryCountMap(map);
        setMaxCount(Math.max(max, 1000));
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载地图失败");
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleMouseEnter = useCallback(
    (geo: any, evt: React.MouseEvent) => {
      const enName = geo.properties.ADMIN || geo.properties.NAME || "";
      const cnName = COUNTRY_NAME_CN[enName] || enName;
      const count = countryCountMap.get(enName) || 0;
      setTooltip({
        name: cnName,
        count,
        x: evt.clientX,
        y: evt.clientY,
      });
    },
    [countryCountMap],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleMoveEnd = useCallback((pos: { coordinates: [number, number]; zoom: number }) => {
    setPosition(pos);
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

      {/* 地图 */}
      <ComposableMap
        projection="geoNaturalEarth1"
        projectionConfig={{ scale: 160 }}
        width={800}
        height={450}
        className="w-full"
        style={{ width: "100%", height: "auto" }}
      >
        <ZoomableGroup
          center={position.coordinates}
          zoom={position.zoom}
          onMoveEnd={handleMoveEnd}
          minZoom={1}
          maxZoom={5}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }: { geographies: any[] }) =>
              geographies.map((geo: any) => {
                const enName = geo.properties.ADMIN || geo.properties.NAME || "";
                const count = countryCountMap.get(enName) || 0;
                const fillColor = getColor(count, maxCount);

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fillColor}
                    stroke="#ffffff"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: "none" },
                      hover: { outline: "none", fill: "#5eead4", stroke: "#0d9488", strokeWidth: 1 },
                      pressed: { outline: "none" },
                    }}
                    onMouseEnter={(evt: React.MouseEvent) => handleMouseEnter(geo, evt)}
                    onMouseLeave={handleMouseLeave}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-white/95 border border-slate-200 rounded-lg shadow-lg px-3 py-2"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 10,
          }}
        >
          <div className="font-bold text-sm text-slate-900">{tooltip.name}</div>
          <div className="text-teal-600 font-semibold text-sm">
            {tooltip.count.toLocaleString()} 条商机
          </div>
        </div>
      )}
    </div>
  );
}
