/**
 * 中标情报页 — 策展展示数据（降级兜底）
 * Award Intelligence — Curated presentation data
 *
 * @module app/(public)/award-intelligence/curatedData
 * @description 爬虫数据入库后 useAwardsData 返回真实数据优先展示；本模块为
 *              页面结构所需的策展数据（UN ASR 2025 / UNICEF 报告口径）。
 *              与页面 JSX 解耦，纯数据 + 无副作用（拆分 990 行 god 组件）。
 */
import { DollarSign, PieChart, Users, Bell } from "lucide-react";

/** 近 12 个月月份标签（"YY.M月"） */
export function getLast12Months(): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear() % 100}.${d.getMonth() + 1}月`);
  }
  return months;
}

/** 策展 STATS（降级兜底） */
export const CURATED_STATS = [
  { label: "中标记录", value: "12,847", sub: "本月 +128" },
  { label: "采购机构档案", value: "386", sub: "覆盖 193 个国家" },
  { label: "可追踪竞争对手", value: "2,150+", sub: "持续更新中" },
  { label: "数据追踪", value: "2016年起", sub: "持续更新中" },
];

export const INFO_CARDS = [
  { title: "采购总额", value: "US$22.7B", sub: "UN 2024年度采购总额（ASR）", badge: "覆盖 193 个国家", badgeColor: "text-emerald-600 bg-emerald-50", link: "查看趋势", icon: DollarSign, iconColor: "text-blue-500", borderColor: "border-l-blue-500" },
  { title: "高频品类", value: "医疗耗材 / PPE\n检验设备", sub: "", badge: "UNSPSC", badgeColor: "text-teal-600 bg-teal-50", link: "查看品类", icon: PieChart, iconColor: "text-teal-500", borderColor: "border-l-teal-500" },
  { title: "主要中标商", value: "2,150+ 家可追踪", sub: "", badge: "竞争情报", badgeColor: "text-amber-600 bg-amber-50", link: "查看名单", icon: Users, iconColor: "text-orange-500", borderColor: "border-l-orange-500" },
  { title: "下一次机会", value: "平均 45 天周期", sub: "", badge: "采购周期", badgeColor: "text-emerald-600 bg-emerald-50", link: "设置提醒", icon: Bell, iconColor: "text-emerald-500", borderColor: "border-l-emerald-500" },
];

export const BUYER_PROFILE = [
  { label: "机构名称", value: "联合国儿童基金会 (UNICEF)" },
  { label: "国家/地区", value: "美国（总部位于纽约）" },
  { label: "机构类型", value: "联合国专门机构" },
  { label: "主要资金来源", value: "成员国自愿捐助 / 政府拨款" },
  { label: "常采购品类", value: "疫苗 / 医疗耗材 / 营养品" },
  { label: "2025年采购总额", value: "US$5.677B" },
  { label: "供应商网络", value: "12,000+ 家 / 178 国" },
  { label: "活跃度", value: "★★★★★", isStar: true },
];

export const TREND_DATA = getLast12Months().map((month, i) => {
  const amounts = [1.72, 1.65, 1.58, 1.83, 1.91, 1.76, 2.05, 2.18, 1.95, 2.31, 2.44, 2.12];
  const counts = [182, 175, 168, 195, 203, 187, 218, 232, 208, 246, 259, 225];
  return { month, amount: amounts[i], count: counts[i] };
});

export const CYCLE_HINTS = [
  { quarter: "Q1 1-3月", status: "偏低" },
  { quarter: "Q2 4-6月", status: "上升" },
  { quarter: "Q3 7-9月", status: "高峰" },
  { quarter: "Q4 10-12月", status: "预计再次采购" },
];

export const TOP5_WINNERS = [
  { rank: 1, name: "Siemens Healthineers AG", category: "医疗设备", level: "UNGM L2" },
  { rank: 2, name: "McKesson Corporation", category: "药品分销", level: "UNGM L2" },
  { rank: 3, name: "Cardinal Health Inc.", category: "医疗用品", level: "UNGM L1" },
  { rank: 4, name: "B. Braun Melsungen AG", category: "医疗器械", level: "UNGM L2" },
  { rank: 5, name: "Medtronic plc", category: "医疗设备", level: "UNGM L2" },
];

/** TOP5_WINNERS 元素类型（供弹窗/主页面复用具名类型，替代散落的 typeof 内联） */
export type TopWinner = (typeof TOP5_WINNERS)[number];
/** 选中供应商：TopWinner + 可选资质/覆盖国家（弹窗扩展字段） */
export type SelectedSupplier = TopWinner & { certs?: string[]; countries?: string };
