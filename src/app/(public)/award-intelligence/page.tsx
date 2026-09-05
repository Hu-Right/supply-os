/**
 * 中标情报 / 买家情报页（骨架）
 * Award Intelligence / Buyer Intelligence Page (Skeleton)
 *
 * @module app/(public)/award-intelligence
 * @description P1 占位页面 — 后续填充采购画像、趋势图、中标商排名等模块。
 *              Placeholder page — to be filled with buyer profile, trend charts, winner rankings.
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "中标情报 / 买家情报 | 历史数据变商业情报",
  description: "追踪买家采购周期、竞争格局与价格趋势，辅助投标决策",
  alternates: {
    canonical: absoluteUrl("/award-intelligence"),
    languages: { "x-default": absoluteUrl("/award-intelligence") },
  },
};

export default function AwardIntelligencePage() {
  return <PageClient />;
}
