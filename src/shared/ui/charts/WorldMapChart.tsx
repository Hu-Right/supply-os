"use client";

/**
 * 全球商机地图 — ECharts 世界地图
 * Global Opportunities World Map
 *
 * @module shared/ui/charts/WorldMapChart
 * @description 展示各国未过期商机数量，鼠标悬停显示国家名和商机数。
 *              数据从 /api/notices/countries 获取，使用现有聚合逻辑。
 */

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { GeoComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { MapChart } from "echarts/charts";
import { CanvasRenderer } from "echarts/renderers";
import { useLocale } from "@/core/i18n";

echarts.use([GeoComponent, TooltipComponent, VisualMapComponent, MapChart, CanvasRenderer]);

/** 国家英文名 → 中文名的常用映射（支持 Natural Earth 格式） */
const COUNTRY_NAME_CN: Record<string, string> = {
  Brazil: "巴西", Spain: "西班牙", Poland: "波兰", France: "法国", Germany: "德国",
  "United States": "美国", "United States of America": "美国", USA: "美国",
  Italy: "意大利", "United Kingdom": "英国", India: "印度",
  China: "中国", Japan: "日本", "South Korea": "韩国", Russia: "俄罗斯",
  Canada: "加拿大", Australia: "澳大利亚", Mexico: "墨西哥", Argentina: "阿根廷",
  Turkey: "土耳其", "Saudi Arabia": "沙特阿拉伯", "United Arab Emirates": "阿联酋",
  Egypt: "埃及", "South Africa": "南非", Nigeria: "尼日利亚", Kenya: "肯尼亚",
  Indonesia: "印度尼西亚", Thailand: "泰国", Vietnam: "越南", Philippines: "菲律宾",
  Malaysia: "马来西亚", Singapore: "新加坡", Pakistan: "巴基斯坦", Bangladesh: "孟加拉国",
  Ukraine: "乌克兰", Romania: "罗马尼亚", Netherlands: "荷兰", Belgium: "比利时",
  Sweden: "瑞典", Norway: "挪威", Denmark: "丹麦", Finland: "芬兰",
  Greece: "希腊", Portugal: "葡萄牙", Austria: "奥地利", Switzerland: "瑞士",
  Israel: "以色列", Iran: "伊朗", Iraq: "伊拉克", Jordan: "约旦",
  Chile: "智利", Peru: "秘鲁", Colombia: "哥伦比亚", Venezuela: "委内瑞拉",
  "Czech Republic": "捷克", "Czechia": "捷克", Hungary: "匈牙利", Bulgaria: "保加利亚", Serbia: "塞尔维亚",
  Croatia: "克罗地亚", Slovakia: "斯洛伐克", Slovenia: "斯洛文尼亚",
  "New Zealand": "新西兰", "Sri Lanka": "斯里兰卡", Myanmar: "缅甸",
  Cambodia: "柬埔寨", Laos: "老挝", Mongolia: "蒙古", Kazakhstan: "哈萨克斯坦",
  Uzbekistan: "乌兹别克斯坦", Ethiopia: "埃塞俄比亚", Ghana: "加纳", Tanzania: "坦桑尼亚",
  "United Republic of Tanzania": "坦桑尼亚",
  Uganda: "乌干达", Morocco: "摩洛哥", Algeria: "阿尔及利亚", Tunisia: "突尼斯",
  Libya: "利比亚", Sudan: "苏丹", Angola: "安哥拉", Mozambique: "莫桑比克",
  Zambia: "赞比亚", Zimbabwe: "津巴布韦", Botswana: "博茨瓦纳", Namibia: "纳米比亚",
  Senegal: "塞内加尔", "Ivory Coast": "科特迪瓦", "Cote d'Ivoire": "科特迪瓦", Cameroon: "喀麦隆",
  "Democratic Republic of the Congo": "刚果民主共和国", "Republic of the Congo": "刚果共和国",
  "Dem. Rep. Congo": "刚果民主共和国", "Republic of Congo": "刚果共和国",
  Madagascar: "马达加斯加", Mauritius: "毛里求斯", Rwanda: "卢旺达",
  Afghanistan: "阿富汗", Nepal: "尼泊尔", Bhutan: "不丹", Maldives: "马尔代夫",
  Yemen: "也门", Oman: "阿曼", Qatar: "卡塔尔", Kuwait: "科威特",
  Bahrain: "巴林", Lebanon: "黎巴嫩", Syria: "叙利亚", Cyprus: "塞浦路斯",
  Georgia: "格鲁吉亚", Armenia: "亚美尼亚", Azerbaijan: "阿塞拜疆",
  Belarus: "白俄罗斯", Lithuania: "立陶宛", Latvia: "拉脱维亚", Estonia: "爱沙尼亚",
  Moldova: "摩尔多瓦", Albania: "阿尔巴尼亚", "Bosnia and Herzegovina": "波黑",
  Montenegro: "黑山", "North Macedonia": "北马其顿", Kosovo: "科索沃",
  Iceland: "冰岛", Ireland: "爱尔兰", Luxembourg: "卢森堡", Malta: "马耳他",
  Andorra: "安道尔", Monaco: "摩纳哥", "San Marino": "圣马力诺",
  Guatemala: "危地马拉", Honduras: "洪都拉斯", "El Salvador": "萨尔瓦多",
  Nicaragua: "尼加拉瓜", "Costa Rica": "哥斯达黎加", Panama: "巴拿马",
  Cuba: "古巴", "Dominican Republic": "多米尼加", Haiti: "海地",
  Jamaica: "牙买加", "Puerto Rico": "波多黎各", "Trinidad and Tobago": "特立尼达和多巴哥",
  Bahamas: "巴哈马", Barbados: "巴巴多斯",
  Ecuador: "厄瓜多尔", Bolivia: "玻利维亚", Paraguay: "巴拉圭", Uruguay: "乌拉圭",
  Guyana: "圭亚那", Suriname: "苏里南", "French Guiana": "法属圭亚那",
  "Papua New Guinea": "巴布亚新几内亚", Fiji: "斐济", "Solomon Islands": "所罗门群岛",
  Vanuatu: "瓦努阿图", "New Caledonia": "新喀里多尼亚",
  Greenland: "格陵兰", "Faroe Islands": "法罗群岛",
  "W. Sahara": "西撒哈拉", "Western Sahara": "西撒哈拉",
};

interface CountryData {
  country: string;
  count: number;
}

export function WorldMapChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { locale } = useLocale();

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

        // 获取世界地图 GeoJSON（Natural Earth 格式）
        const mapRes = await fetch("/world-map.json");
        if (!mapRes.ok) throw new Error("Failed to fetch world map");
        const worldGeoJSON = await mapRes.json();

        if (cancelled) return;

        // 转换 GeoJSON：为每个 feature 添加 name 属性（ECharts 需要）
        if (worldGeoJSON.features) {
          worldGeoJSON.features = worldGeoJSON.features.map((feature: any) => ({
            ...feature,
            properties: {
              ...feature.properties,
              name: feature.properties.NAME || feature.properties.ADMIN || feature.properties.SOVEREIGNT || "",
            },
          }));
        }

        // 注册地图
        echarts.registerMap("world", worldGeoJSON);

        // 构建国家名→商机数映射
        const countryCountMap = new Map<string, number>();
        for (const item of countryData) {
          countryCountMap.set(item.country, item.count);
        }

        // 初始化图表
        const chart = echarts.init(chartRef.current);
        chartInstance.current = chart;

        const isZh = locale === "zh";

        chart.setOption({
          tooltip: {
            trigger: "item",
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            borderColor: "#e2e8f0",
            borderWidth: 1,
            textStyle: { color: "#1e293b", fontSize: 13 },
            formatter: (params: any) => {
              const countryEn = params.name;
              const countryCn = COUNTRY_NAME_CN[countryEn] || countryEn;
              const count = countryCountMap.get(countryEn) || 0;
              const displayName = isZh ? countryCn : countryEn;
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
            max: Math.max(...countryData.map(d => d.count), 1000),
            left: "left",
            bottom: "20",
            text: ["高", "低"],
            calculable: true,
            inRange: {
              color: ["#f0fdf4", "#ccfbf1", "#5eead4", "#14b8a6", "#0d9488", "#0f766e"],
            },
            textStyle: { color: "#64748b", fontSize: 11 },
            itemWidth: 12,
            itemHeight: 80,
          },
          geo: {
            map: "world",
            roam: true,
            zoom: 1.2,
            center: [0, 20],
            label: { show: false },
            itemStyle: {
              areaColor: "#f1f5f9",
              borderColor: "#cbd5e1",
              borderWidth: 0.5,
            },
            emphasis: {
              itemStyle: {
                areaColor: "#5eead4",
                borderColor: "#0d9488",
                borderWidth: 1,
              },
              label: { show: false },
            },
            regions: countryData.map(item => ({
              name: item.country,
              itemStyle: {
                areaColor: countryCountMap.get(item.country)
                  ? undefined
                  : "#f8fafc",
              },
            })),
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
  }, [locale]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-slate-50 rounded-2xl border border-slate-200">
        <div className="text-center">
          <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-teal-200 border-t-teal-600 mb-3" />
          <p className="text-sm text-slate-500">加载世界地图...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 bg-slate-50 rounded-2xl border border-slate-200">
        <p className="text-sm text-rose-600">地图加载失败：{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={chartRef}
      className="w-full h-[500px] rounded-2xl border border-slate-200 bg-white"
    />
  );
}
