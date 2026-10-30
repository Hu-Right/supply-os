/**
 * 新首页（重构版）
 * New Homepage (Restructured)
 *
 * @module app/(public)/page
 * @description 全球公共采购与供应链机会平台首页。
 *              双搜索 Hero + 实时数字墙 + 三栏内容 + 会员升级横幅。
 *              Global public procurement & supply chain opportunity platform homepage.
 *              Dual-search Hero + real-time stats wall + 3-column content + membership banner.
 *              服务端壳按其它公开页同一口径 ISR（revalidate=3600），渲染期直出
 *              首页快照（lib/services/home-snapshot）：数字墙/地图初值进静态 HTML，
 *              客户端 hook 接管后续刷新；DB 不可达时降级为「不带初值」。
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import { getPool } from "@/lib/db/pool";
import { getHomeSnapshot, getHomeContentSnapshot, type HomeContentSnapshot } from "@/lib/services/home-snapshot";
import PageClient from "./page-client";
import type { HomeStatsData } from "@/features/home";

/** 与其它 (public) 页一致：公开页 1 小时 ISR，数字新鲜度由客户端 10 分钟轮询兼顾 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "全球公共采购与跨境供应链机会平台",
  description:
    "聚合全球公共与大型机构采购机会，数据实时更新。100,000+ 可检索商机，20+ 数据源，16+ 海外展厅节点。",
  alternates: {
    canonical: absoluteUrl("/"),
    languages: { "x-default": absoluteUrl("/") },
  },
};

/** 服务端直出首页快照；任何失败（含 build 期无库）降级为 undefined，不阻断渲染 */
async function loadInitialHome(): Promise<HomeStatsData | undefined> {
  try {
    return await getHomeSnapshot(getPool());
  } catch (err) {
    console.warn("[home] 服务端快照不可用，降级为客户端取数:", (err as Error).message);
    return undefined;
  }
}

/** 服务端直出三栏内容快照（内部逐列降级，整体失败则回退客户端取数） */
async function loadInitialContent(): Promise<HomeContentSnapshot | undefined> {
  try {
    return await getHomeContentSnapshot(getPool());
  } catch (err) {
    console.warn("[home] 三栏内容快照不可用，降级为客户端取数:", (err as Error).message);
    return undefined;
  }
}

export default async function HomePage() {
  const [initialHome, initialContent] = await Promise.all([loadInitialHome(), loadInitialContent()]);
  return <PageClient initialHome={initialHome} initialContent={initialContent} />;
}
