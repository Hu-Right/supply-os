/**
 * 导航配置单一来源
 * Single Source of Truth for Navigation Config
 *
 * @module shared/layout/nav-tabs
 * @description 桌面导航 / 移动菜单 / 移动端底栏三处共用的导航配置，消除
 *              App.tsx 中三处硬编码不一致；以路由 path 为唯一 key，不再有
 *              数字 id 间接层。
 *              Shared nav config consumed by the desktop nav, the mobile
 *              menu and the mobile bottom bar; the route path is the single
 *              key (no numeric-id indirection).
 */
import {
  Globe, Building2, Users, Briefcase, BookOpen, Crown, LayoutGrid,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { LocaleKey } from "@/core/i18n";

export interface NavTab {
  path: string;
  labelKey: LocaleKey;
  /** 移动端底栏短标签（缺省回退 labelKey） Mobile bottom-bar short label */
  shortLabelKey?: LocaleKey;
  icon: LucideIcon;
  alert?: boolean;
  highlight?: boolean;
  /** 是否出现在移动端底栏 Shown in mobile bottom bar */
  mobile?: boolean;
}

export const NAV_TABS: NavTab[] = [
  { path: "/showroom", labelKey: "navShowrooms", shortLabelKey: "navShortShowrooms", icon: Building2, mobile: true },
  { path: "/procurement", labelKey: "navJointProcure", shortLabelKey: "navShortProcure", icon: Globe, mobile: true },
  { path: "/supplier", labelKey: "navSuppliers", shortLabelKey: "navShortSuppliers", icon: Users, mobile: true },
  { path: "/crm", labelKey: "navCRM", shortLabelKey: "navShortCRM", icon: Briefcase, alert: true, mobile: true },
  { path: "/services", labelKey: "navServices", icon: LayoutGrid },
  { path: "/learning", labelKey: "navLearning", shortLabelKey: "navShortLearning", icon: BookOpen, mobile: true },
  { path: "/membership", labelKey: "navMembership", icon: Crown, highlight: true },
];
