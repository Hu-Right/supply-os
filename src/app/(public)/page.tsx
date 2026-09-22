/**
 * 新首页（重构版）
 * New Homepage (Restructured)
 *
 * @module app/(public)/page
 * @description 全球公共采购与供应链机会平台首页。
 *              双搜索 Hero + 实时数字墙 + 三栏内容 + 会员升级横幅。
 *              Global public procurement & supply chain opportunity platform homepage.
 *              Dual-search Hero + real-time stats wall + 3-column content + membership banner.
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "全球公共采购与跨境供应链机会平台",
  description:
    "聚合全球公共与大型机构采购机会，数据实时更新。100,000+ 可检索商机，20+ 数据源，16+ 海外展厅节点。",
  alternates: {
    canonical: absoluteUrl("/"),
    languages: { "x-default": absoluteUrl("/") },
  },
};

export default function HomePage() {
  return <PageClient />;
}
