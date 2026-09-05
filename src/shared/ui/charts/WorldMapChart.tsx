"use client";

/**
 * 全球商机地图 — ECharts 世界地图
 * Global Opportunities World Map
 *
 * @module shared/ui/charts/WorldMapChart
 * @description 展示各国未过期商机数量，鼠标悬停显示国家名和商机数。
 */

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { GeoComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { MapChart } from "echarts/charts";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([GeoComponent, TooltipComponent, VisualMapComponent, MapChart, CanvasRenderer]);

/** 国家英文名 → 中文名映射 */
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
  "Czech Republic": "捷克", Czechia: "捷克", Hungary: "匈牙利", Bulgaria: "保加利亚", Serbia: "塞尔维亚",
  Croatia: "克罗地亚", Slovakia: "斯洛伐克", Slovenia: "斯洛文尼亚",
  "New Zealand": "新西兰", "Sri Lanka": "斯里兰卡", Myanmar: "缅甸",
  Cambodia: "柬埔寨", Laos: "老挝", Mongolia: "蒙古", Kazakhstan: "哈萨克斯坦",
  Uzbekistan: "乌兹别克斯坦", Ethiopia: "埃塞俄比亚", Ghana: "加纳", Tanzania: "坦桑尼亚",
  "United Republic of Tanzania": "坦桑尼亚",
  Uganda: "乌干达", Morocco: "摩洛哥", Algeria: "阿尔及利亚", Tunisia: "突尼斯",
  Libya: "利比亚", Sudan: "苏丹", Angola: "安哥拉", Mozambique: "莫桑比克",
  Zambia: "赞比亚", Zimbabwe: "津巴布韦", Botswana: "博茨瓦纳", Namibia: "纳米比亚",
  Senegal: "塞内加尔", "Ivory Coast": "科特迪瓦", "Cote d'Ivoire": "科特迪瓦", "Côte d'Ivoire": "科特迪瓦", Cameroon: "喀麦隆",
  "Democratic Republic of the Congo": "刚果民主共和国", "Republic of the Congo": "刚果共和国",
  "Dem. Rep. Congo": "刚果民主共和国", "Republic of Congo": "刚果共和国", Congo: "刚果共和国",
  Madagascar: "马达加斯加", Mauritius: "毛里求斯", Rwanda: "卢旺达",
  Afghanistan: "阿富汗", Nepal: "尼泊尔", Bhutan: "不丹", Maldives: "马尔代夫",
  Yemen: "也门", Oman: "阿曼", Qatar: "卡塔尔", Kuwait: "科威特",
  Bahrain: "巴林", Lebanon: "黎巴嫩", Syria: "叙利亚", Cyprus: "塞浦路斯",
  Georgia: "格鲁吉亚", Armenia: "亚美尼亚", Azerbaijan: "阿塞拜疆",
  Belarus: "白俄罗斯", Lithuania: "立陶宛", Latvia: "拉脱维亚", Estonia: "爱沙尼亚",
  Moldova: "摩尔多瓦", Albania: "阿尔巴尼亚", "Bosnia and Herzegovina": "波黑", "Bosnia and Herz.": "波黑",
  Montenegro: "黑山", "North Macedonia": "北马其顿", Kosovo: "科索沃",
  Iceland: "冰岛", Ireland: "爱尔兰", Luxembourg: "卢森堡", Malta: "马耳他",
  Andorra: "安道尔", Monaco: "摩纳哥", "San Marino": "圣马力诺",
  Guatemala: "危地马拉", Honduras: "洪都拉斯", "El Salvador": "萨尔瓦多",
  Nicaragua: "尼加拉瓜", "Costa Rica": "哥斯达黎加", Panama: "巴拿马",
  Cuba: "古巴", "Dominican Republic": "多米尼加", "Dominican Rep.": "多米尼加", Haiti: "海地",
  Jamaica: "牙买加", "Puerto Rico": "波多黎各", "Trinidad and Tobago": "特立尼达和多巴哥",
  Bahamas: "巴哈马", Barbados: "巴巴多斯",
  Ecuador: "厄瓜多尔", Bolivia: "玻利维亚", Paraguay: "巴拉圭", Uruguay: "乌拉圭",
  Guyana: "圭亚那", Suriname: "苏里南", "French Guiana": "法属圭亚那",
  "Papua New Guinea": "巴布亚新几内亚", Fiji: "斐济", "Solomon Islands": "所罗门群岛", "Solomon Is.": "所罗门群岛",
  Vanuatu: "瓦努阿图", "New Caledonia": "新喀里多尼亚",
  Greenland: "格陵兰", "Faroe Islands": "法罗群岛",
  "W. Sahara": "西撒哈拉", "Western Sahara": "西撒哈拉",
  Brunei: "文莱", Belize: "伯利兹", "Central African Rep.": "中非", "Eq. Guinea": "赤道几内亚",
  "Falkland Is.": "福克兰群岛", "Fr. S. Antarctic Lands": "法属南部领地",
  Guinea: "几内亚", "Guinea-Bissau": "几内亚比绍", Kyrgyzstan: "吉尔吉斯斯坦",
  Lesotho: "莱索托", Liberia: "利比里亚", Mali: "马里", Mauritania: "毛里塔尼亚",
  "N. Cyprus": "北塞浦路斯", Niger: "尼日尔", "North Korea": "朝鲜",
  Palestine: "巴勒斯坦", "S. Sudan": "南苏丹", "Sierra Leone": "塞拉利昂",
  Somalia: "索马里", Somaliland: "索马里兰", Tajikistan: "塔吉克斯坦",
  "Timor-Leste": "东帝汶", Togo: "多哥", Turkmenistan: "土库曼斯坦",
  Malawi: "马拉维", Djibouti: "吉布提", Eritrea: "厄立特里亚",
  Gambia: "冈比亚", Gabon: "加蓬", "Burkina Faso": "布基纳法索",
  Burundi: "布隆迪", Chad: "乍得", Comoros: "科摩罗", "Cape Verde": "佛得角",
  "Sao Tome and Principe": "圣多美和普林西比", Seychelles: "塞舌尔",
  Antigua: "安提瓜和巴布达", "Antigua and Barbuda": "安提瓜和巴布达",
  "Dem. Rep. Korea": "朝鲜", "Korea": "韩国", "Rep. of Korea": "韩国",
  Taiwan: "台湾", "N. Mariana Is.": "北马里亚纳群岛",
  "U.S. Virgin Is.": "美属维尔京群岛", "American Samoa": "美属萨摩亚", Guam: "关岛",
  "Cayman Is.": "开曼群岛", "British Virgin Is.": "英属维尔京群岛",
  "Cook Is.": "库克群岛", "Fr. Polynesia": "法属波利尼西亚",
  "Samoa": "萨摩亚", Tonga: "汤加", Kiribati: "基里巴斯",
  Palau: "帕劳", "Marshall Is.": "马绍尔群岛", "Micronesia": "密克罗尼西亚",
  "Isle of Man": "马恩岛", Jersey: "泽西岛", Guernsey: "根西岛",
  "Faeroe Is.": "法罗群岛", Svalbard: "斯瓦尔巴群岛", "Svalbard Is.": "斯瓦尔巴群岛",
  "Heard I. and McDonald Is.": "赫德岛和麦克唐纳群岛",
  "Indian Ocean Ter.": "英属印度洋领地",
  "Norfolk Island": "诺福克岛", "Christmas Island": "圣诞岛",
  "Cocos (Keeling) Is.": "科科斯群岛",
  Antarctica: "南极洲", "eSwatini": "斯威士兰", Swaziland: "斯威士兰", Benin: "贝宁",
  "West Bank": "约旦河西岸", Bougainville: "布干维尔",
  Vatican: "梵蒂冈", "Federated States of Micronesia": "密克罗尼西亚",
  "Marshall Islands": "马绍尔群岛", "Northern Mariana Islands": "北马里亚纳群岛",
  "United States Virgin Islands": "美属维尔京群岛",
  "South Georgia and the Islands": "南乔治亚岛",
  "British Indian Ocean Territory": "英属印度洋领地",
  "Saint Helena": "圣赫勒拿", "Pitcairn Islands": "皮特凯恩群岛",
  Anguilla: "安圭拉", "Falkland Islands": "福克兰群岛",
  "Cayman Islands": "开曼群岛", Bermuda: "百慕大",
  "British Virgin Islands": "英属维尔京群岛",
  "Turks and Caicos Islands": "特克斯和凯科斯群岛",
  Montserrat: "蒙特塞拉特", "East Timor": "东帝汶",
  "South Sudan": "南苏丹", "Republic of Serbia": "塞尔维亚",
  "São Tomé and Principe": "圣多美和普林西比",
  "Saint Vincent and the Grenadines": "圣文森特和格林纳丁斯",
  "Saint Lucia": "圣卢西亚", "Saint Kitts and Nevis": "圣基茨和尼维斯",
  Niue: "纽埃", "Cook Islands": "库克群岛",
  Aruba: "阿鲁巴", Curaçao: "库拉索",
  Nauru: "瑙鲁", Liechtenstein: "列支敦士登",
  Grenada: "格林纳达", "Saint Pierre and Miquelon": "圣皮埃尔和密克隆",
  "Wallis and Futuna": "瓦利斯和富图纳",
  "Saint Martin": "圣马丁", "Saint Barthelemy": "圣巴泰勒米",
  "French Polynesia": "法属波利尼西亚",
  "French Southern and Antarctic Lands": "法属南部领地",
  Aland: "奥兰群岛", "Equatorial Guinea": "赤道几内亚",
  Dominica: "多米尼克", "Northern Cyprus": "北塞浦路斯",
  "Macao S.A.R": "中国澳门", "Hong Kong S.A.R.": "中国香港",
  "Central African Republic": "中非共和国",
  "Cabo Verde": "佛得角", "The Bahamas": "巴哈马",
  "Indian Ocean Territories": "印度洋领地",
  "Heard Island and McDonald Islands": "赫德岛和麦克唐纳群岛",
  "Ashmore and Cartier Islands": "阿什莫尔和卡捷群岛",
  "Siachen Glacier": "锡亚琴冰川", "Sint Maarten": "圣马丁",
  Tuvalu: "图瓦卢",
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

        // 转换 GeoJSON：将 feature name 改为中文
        if (worldGeoJSON.features) {
          worldGeoJSON.features = worldGeoJSON.features.map((feature: any) => {
            const enName = feature.properties.NAME || feature.properties.ADMIN || feature.properties.SOVEREIGNT || "";
            const cnName = COUNTRY_NAME_CN[enName] || enName;
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
              const enName = params.data?._enName || Object.keys(COUNTRY_NAME_CN).find(k => COUNTRY_NAME_CN[k] === displayName) || displayName;
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
                name: COUNTRY_NAME_CN[item.country] || item.country,
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
    <div className="relative w-full" style={{ height: 800 }}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-200">
          <div className="text-center">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-teal-200 border-t-teal-600 mb-3" />
            <p className="text-sm text-slate-500">加载世界地图...</p>
          </div>
        </div>
      )}
      <div
        ref={chartRef}
        className="w-full h-full rounded-2xl border border-slate-200 bg-white"
      />
    </div>
  );
}
