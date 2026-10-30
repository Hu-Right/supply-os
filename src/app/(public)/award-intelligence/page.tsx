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
import { getPool } from "@/lib/db/pool";
import { getAwardsPageSnapshot, type AwardsPageSnapshot } from "@/lib/services/awards.service";
import PageClient from "./page-client";

export const metadata: Metadata = {
  // 只写页面名（网站名由根 layout 模板拼在首位）；“历史数据变商业情报”等卖点归入 description
  title: "中标情报 / 买家情报",
  description: "将历史中标数据变成商业情报：追踪买家采购周期、竞争格局与价格趋势，辅助投标决策",
  alternates: {
    canonical: absoluteUrl("/award-intelligence"),
    languages: { "x-default": absoluteUrl("/award-intelligence") },
  },
};

/** 服务端直出首屏快照；任何失败（含 build 期无库）降级为 undefined，不阻断渲染 */
async function loadInitialAwards(): Promise<AwardsPageSnapshot | undefined> {
  try {
    return await getAwardsPageSnapshot(getPool());
  } catch (err) {
    console.warn("[awards] 服务端快照不可用，降级为客户端取数:", (err as Error).message);
    return undefined;
  }
}

export default async function AwardIntelligencePage() {
  const initialAwards = await loadInitialAwards();
  return <PageClient initialAwards={initialAwards} />;
}
