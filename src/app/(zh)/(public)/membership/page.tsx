/**
 * /membership — 动态渲染（force-dynamic，禁止构建期预渲染）
 *
 * RSC 直出：套餐对比矩阵是公开数据（/api/membership/plans 同源，与登录态无关），
 * 每次请求服务端直取后随首屏 HTML 下发，客户端 hook 只补登录态的订阅状态/年包抵扣单；
 * DB 不可达（含 build 期）降级为不带初值，回退客户端拉取。
 */
import type { Metadata } from "next";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { BROWSER_TITLE } from "@/lib/i18n/metadata";
import { getContext } from "@/lib/db/context";
import { tieredComparisonViewOf } from "@/lib/services/membership/view";
import type { ComparisonView } from "@/types";
import PageClient from "./page-client";

/**
 * 动态渲染，禁止构建期预渲染。
 *
 * 正文依赖 DB（权益矩阵），而 CI 构建机无库：预渲染出来是一张空壳
 * （2026-11-25 线上实测 364 字符、无 H1、无价格），且 ISR 回源在冷连接下要
 * 20–30s，常被 nginx 超时打断，缓存因此永远换不掉——连续 24h 返回同一份空壳。
 * 与首页 6dab2c0b 同一处置：宁可每请求查库，也不让构建期空数据被缓存。
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // 只写页面名：网站名由根 layout 的 title.template 拼在首位
  title: "会员套餐与权益",
  description: "云境·国际采购平台会员套餐：解锁完整采购公告与标讯详情、供应商数据与 AI 投标工具，助力企业高效拓展全球采购业务。",
  openGraph: {
    title: BROWSER_TITLE.zh,
    description: "解锁完整标讯与供应商数据、AI 投标工具，助力全球业务拓展。",
    url: absoluteUrl("/membership"),
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
  alternates: {
    canonical: absoluteUrl("/membership"),
    languages: { "x-default": absoluteUrl("/membership") },
  },
};

/** 服务端直出对比矩阵；任何失败（含 build 期无库/挂起）降级为 undefined，不阻断渲染。
 *  超时竞速同首页口径：挂起比异常更危险，静态生成的页面预算会被下游降级链撑爆。 */
async function loadInitialComparison(): Promise<ComparisonView | undefined> {
  try {
    const table = await Promise.race([
      getContext().benefitSystemRepo.buildComparisonTable(),
      new Promise<undefined>((resolve) =>
        setTimeout(() => {
          console.warn("[membership] 对比矩阵装载超过 8s，降级为客户端取数");
          resolve(undefined);
        }, 8_000),
      ),
    ]);
    return table ? tieredComparisonViewOf(table) : undefined;
  } catch (err) {
    console.warn("[membership] 服务端对比矩阵不可用，降级为客户端取数:", (err as Error).message);
    return undefined;
  }
}

export default async function MembershipPage() {
  const initialComparison = await loadInitialComparison();
  return <PageClient initialComparison={initialComparison} />;
}
