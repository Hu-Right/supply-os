/**
 * 商机静态数据
 * Opportunity Static Data
 *
 * @module data/opportunities
 * @description 3 条预置采购商机（建材/医疗/电子领域），含预算、截止日期和订阅数
 *              Pre-seeded procurement opportunities (3 records) across construction, medical, and electronics sectors
 */

import type { Opportunity } from "@/types";

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: "opp-01",
    titleZh: "东非难民营2026年度移动板房及拼装卫浴集采商机",
    titleEn: "Mobile prefabricated houses and assembled bathroom sets procurement opportunity for the East African refugee camp in 2026",
    industryZh: "建材",
    industryEn: "Construction",
    countryZh: "肯尼亚",
    countryEn: "Kenya",
    budget: "$2,800,000 USD",
    deadline: "2026-08-30",
    descriptionZh: "本次代办集采由两部分组成：第一部分为2500套应急快装拉铆模块化集成瓦房；第二部分为1200套内嵌高附着防腐拼装复合板无水生物降解卫生箱卫浴间。",
    descriptionEn: "Joint Procurement opportunity composed of two lots: Lot 1 consists of 2,500 emergency clip-lock steel panel housing blocks; Lot 2 consists of 1,200 dry-system biodegradable latrine bathroom modules.",
    subscribersCount: 46
  },
  {
    id: "opp-02",
    titleZh: "红十字援助委便携式多维数字健康心电监护设备专项招标",
    titleEn: "NGO Bid Invitation: Multi-lead Portable Digital ECG Monitoring Devices for Rural Health Deployments",
    industryZh: "医疗",
    industryEn: "Medical",
    countryZh: "阿联酋",
    countryEn: "UAE",
    budget: "$1,450,000 USD",
    deadline: "2026-07-15",
    descriptionZh: "计划大规模援助多国边远社区诊所。要求供应商设备具有内置5G微卡与低频电离防雷特性、内置太阳能自给背夹蓄电配置。提供三方EN60601-2安规报告。",
    descriptionEn: "Aimed at deploying medical units globally to marginalized health structures. Requirements include solar battery-clips, rugged IP54 shells, and integrated 5G modules. Tested with EN60601-2 standards.",
    subscribersCount: 32
  },
  {
    id: "opp-03",
    titleZh: "迪拜智慧园区智慧LED光能一体多边照明路灯集采计划",
    titleEn: "Dubai Smart Park Integrated Photovoltaic street pole & smart LED illuminating system procurement",
    industryZh: "电子",
    industryEn: "Electronics",
    countryZh: "阿联酋",
    countryEn: "UAE",
    budget: "$4,200,000 USD",
    deadline: "2026-10-10",
    descriptionZh: "总数2400基。要求微处理网关芯片支持Zigbee及Wi-Fi通导协议双重热备，抗沙尘及长期55℃恶劣运行环境下保持高流明输出与长效散热可靠度。",
    descriptionEn: "Total need of 2,400 poles. Micro-controller gates must support dual Zigbee + Wi-Fi mesh hot standbys. Must run under continuous 55 degree desert thermal test with sandstorm protection.",
    subscribersCount: 59
  }
];
