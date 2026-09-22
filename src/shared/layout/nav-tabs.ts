/**
 * 导航配置单一来源
 * Single Source of Truth for Navigation Config
 *
 * @module shared/layout/nav-tabs
 * @description 桌面导航 / 移动菜单 / 移动端顶部标签栏三处共用的导航配置。
 *              以路由 path 为唯一 key，不再有数字 id 间接层。
 *              Shared nav config consumed by the desktop nav, the mobile
 *              menu and the mobile top tab bar; the route path is the single
 *              key (no numeric-id indirection).
 */
import {
  Home, Globe, Trophy, Users, LayoutGrid, FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { LocaleKey } from "@/core/i18n";

export interface NavTab {
  path: string;
  labelKey: LocaleKey;
  /** 移动端标签栏短标签（缺省回退 labelKey） Mobile tab bar short label */
  shortLabelKey?: LocaleKey;
  icon: LucideIcon;
  alert?: boolean;
  highlight?: boolean;
}

export const NAV_TABS: NavTab[] = [
  { path: "/", labelKey: "navHome", shortLabelKey: "navShortHome", icon: Home, highlight: true },
  { path: "/procurement", labelKey: "navGlobalOpportunities", shortLabelKey: "navShortOpportunities", icon: Globe },
  { path: "/award-intelligence", labelKey: "navAwardIntelligence", shortLabelKey: "navShortAwardIntelligence", icon: Trophy },
  { path: "/supplier", labelKey: "navSupplierLibrary", shortLabelKey: "navShortSuppliers", icon: Users },
  { path: "/services", labelKey: "navBiddingServices", icon: LayoutGrid },
  { path: "/rfq", labelKey: "navRFQ", shortLabelKey: "navShortRFQ", icon: FileText },
  // ── 暂时下架：知识中心 /learning、研修班 /training、工作台 /crm ──
  // 按需求不在页面导航挂载（工作台尚未完善）；页面文件与直接网址均保留，未删除。
  // 恢复方式：取消以下三行注释，并把 BookOpen / GraduationCap / Briefcase 补回上方 lucide-react 导入。
  // { path: "/learning", labelKey: "navKnowledgeCenter", shortLabelKey: "navShortKnowledge", icon: BookOpen },
  // { path: "/training", labelKey: "navTraining", shortLabelKey: "navShortTraining", icon: GraduationCap },
  // { path: "/crm", labelKey: "navWorkbench", shortLabelKey: "navShortWorkbench", icon: Briefcase, alert: true },
];
