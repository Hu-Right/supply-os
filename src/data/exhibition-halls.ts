/**
 * 海外展厅静态数据
 * Exhibition Hall Static Data
 *
 * @module data/exhibition-halls
 * @description 六大海外展厅的陈列数据（法兰克福/迪拜/内罗毕/圣保罗/洛杉矶/胡志明）
 *              Pre-seeded exhibition hall records across 6 locations
 */

import type { ExhibitionHall } from "@/types";

export const EXHIBITION_HALLS: ExhibitionHall[] = [
  {
    id: "eh-01",
    nameZh: "中国智能制造及医疗器械（德国法兰克福）展厅",
    nameEn: "Sino Intelligent Manufacturing & Medical Devices Exhibition Hall (Frankfurt, Germany)",
    regionZh: "欧洲",
    regionEn: "Europe",
    countryZh: "德国",
    countryEn: "Germany",
    cityZh: "法兰克福",
    cityEn: "Frankfurt",
    descriptionZh: "旨在将中国顶尖的自动化机械及中高端医疗器械直连欧洲采购商，常年提供样机展示与商机配对服务。",
    descriptionEn: "Aims to connect top-tier automated machinery and mid-to-high-end medical devices from China directly with European buyers, offering year-round physical demos and business matchmaking.",
    bannerUrl: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80",
    featuredProductsZh: ["智能机械手臂", "高精度心电图机", "微创耗材"],
    featuredProductsEn: ["Robotic Arms", "High-Precision ECG Machines", "Minimally Invasive Consumables"],
    capacityValue: "3,500 ㎡"
  },
  {
    id: "eh-02",
    nameZh: "中东新能源及电力设备（阿联酋迪拜）展厅",
    nameEn: "Middle East New Energy & Power Equipment Hall (Dubai, UAE)",
    regionZh: "中东",
    regionEn: "Middle East",
    countryZh: "阿联酋",
    countryEn: "UAE",
    cityZh: "迪拜",
    cityEn: "Dubai",
    descriptionZh: "聚焦于光伏组件、储能系统及智慧电网解决方案在中东多国项目的工程落地与配套采购。",
    descriptionEn: "Focusing on the engineered deployment and supporting procurement of PV modules, battery energy storage systems (BESS), and smart grid solutions across multiple Middle Eastern countries.",
    bannerUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80",
    featuredProductsZh: ["双面单晶硅光伏组件", "集装箱式储能电池柜", "防沙智能清扫机器人"],
    featuredProductsEn: ["Bifacial Solar PV Modules", "Containerized Battery Energy Storage", "Anti-dust Smart Cleaning Robots"],
    capacityValue: "5,000 ㎡"
  },
  {
    id: "eh-03",
    nameZh: "中非基础设施及民生农机（肯尼亚内罗毕）展厅",
    nameEn: "Sino-Africa Infrastructure & Agricultural Machinery Hall (Nairobi, Kenya)",
    regionZh: "非洲",
    regionEn: "Africa",
    countryZh: "肯尼亚",
    countryEn: "Kenya",
    cityZh: "内罗毕",
    cityEn: "Nairobi",
    descriptionZh: "立足东非，辐射非洲公采，提供灌溉农机、低成本建材与联合国援助物资常态化入库联络处。",
    descriptionEn: "Based in East Africa and radiating into 国际公共采购-based joint procurement, providing irrigation machinery, budget building materials, and a liaison office for UN humanitarian aid supplies.",
    bannerUrl: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&q=80",
    featuredProductsZh: ["柴油多功能拖拉机", "模块化活动板房", "水旱两用播种机"],
    featuredProductsEn: ["Diesel Multi-use Tractors", "Modular Prefab Housing Units", "Dual-use Wet/Dry Seeders"],
    capacityValue: "2,200 ㎡"
  },
  {
    id: "eh-04",
    nameZh: "中拉绿色建材及家居软装（巴西圣保罗）展厅",
    nameEn: "Sino-Latin America Green Building Materials & Home Furnishing Hall (Sao Paulo, Brazil)",
    regionZh: "南美",
    regionEn: "South America",
    countryZh: "巴西",
    countryEn: "Brazil",
    cityZh: "圣保罗",
    cityEn: "Sao Paulo",
    descriptionZh: "面向拉丁美洲新兴城市建设，精选绿色低碳建筑材料、高装配度轻钢、轻质隔墙板及现代家居办公展出。",
    descriptionEn: "Serving Latin American urban builders with green low-carbon materials, prefabricated light steel structures, partition panels, and modern office/home furnishing showrooms.",
    bannerUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80",
    featuredProductsZh: ["轻复合环保外墙板", "轻钢别墅装配单元", "智能静音办公隔音舱"],
    featuredProductsEn: ["Eco Composite Siding Panels", "Light Steel Villa Frames", "Smart Silent Office Cubicles"],
    capacityValue: "4,000 ㎡"
  },
  {
    id: "eh-05",
    nameZh: "北美智能家居与跨境电商生态（美国洛杉矶）展厅",
    nameEn: "North America Smart Home & Cross-Border E-Commerce Hall (Los Angeles, USA)",
    regionZh: "北美",
    regionEn: "North America",
    countryZh: "美国",
    countryEn: "USA",
    cityZh: "洛杉矶",
    cityEn: "Los Angeles",
    descriptionZh: "为北美分销商、大型电商及跨国民用采购商展示前沿IoT物联网设备、智慧安防系统与柔性供应链产品包。",
    descriptionEn: "Displaying cutting-edge IoT smart home products, modern safety/monitoring equipment, and highly customized supply-chain kits for North American retail giants and e-commerce companies.",
    bannerUrl: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80",
    featuredProductsZh: ["4K无线太阳能安防头", "多模Wi-Fi 7智能网关", "全自动宠物智能喂食舱"],
    featuredProductsEn: ["4K Wireless Solar Cameras", "Multi-mode Wi-Fi 7 Smart Gateways", "Automated Smart Pet Feeders"],
    capacityValue: "6,000 ㎡"
  },
  {
    id: "eh-06",
    nameZh: "东盟电子元件与工业辅料（越南胡志明）展厅",
    nameEn: "ASEAN Electronic Components & Industrial Accoutrements Hall (Ho Chi Minh, Vietnam)",
    regionZh: "亚洲",
    regionEn: "Asia",
    countryZh: "越南",
    countryEn: "Vietnam",
    cityZh: "胡志明市",
    cityEn: "Ho Chi Minh",
    descriptionZh: "针对东南亚迅猛发展的电子装配及轻工制造，展示电子元器件精密接插件、配套线束及高强度五金件。",
    descriptionEn: "Fulfilling Southeast Asia's skyrocketing light manufacturing demands with premium precision connectors, wire harnesses, and industrial fasteners on seamless supply pipelines.",
    bannerUrl: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80",
    featuredProductsZh: ["SMD贴片高寿命连接器", "柔性耐折工业线束组", "防强碱耐腐蚀电镀件"],
    featuredProductsEn: ["SMD High-durability Connectors", "Flexible Industrial Wire Harness", "Anti-corrosion Metal Electroplated Spares"],
    capacityValue: "2,800 ㎡"
  }
];
