/**
 * Sitemap — Next.js App Router 动态生成
 *
 * @module app/sitemap
 * @description 动态 URL 数据由 lib/services/seo/sitemap-sources 提供
 *              （单一事实源：真实表名 + ACTIVE_NOTICE_WHERE 权威过滤器）。
 *              公告/供应商两段独立容错 —— 任一段失败只降级该段并 console.error
 *              报警，不再静默吞掉全部动态 URL（2026-08-28 根治性修复）。
 */
import type { MetadataRoute } from "next";
import {
  fetchSitemapNotices,
  fetchSitemapSuppliers,
} from "@/lib/services/seo/sitemap-sources";

const BASE_URL = process.env.SITE_URL || "https://osneosmart.com";

/**
 * ISR 解冻（2026-08-29 P0 修复）：
 * metadata 路由默认静态化 —— 构建期 NEXT_PHASE 守卫返回纯静态段后，
 * 生产运行时永远不再执行下方 DB 查询，线上 sitemap 冻结在 8 条 URL
 * （curl 实测 1389 字节 / 0 条公告）。导出 revalidate 后：构建期照旧
 * 短路（CI 无 DB），上线 1 小时后在生产运行时重新生成完整 sitemap。
 */
export const revalidate = 3600;

function isoOrNull(v: Date | string | number | null): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  // crm_bid_notices.update_time / supplier.addtime 实际为 Unix 秒时间戳（数字）
  const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString();

  // ── 静态页面 ──
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/showroom`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/procurement`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/supplier`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/training`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/membership`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/services`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/learning`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/procurement/qualification`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  // ── 构建阶段跳过动态查询（CI 环境无数据库访问）──
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return staticPages;
  }

  // ── 动态公告段（独立容错：失败仅降级本段并报警）──
  let noticePages: MetadataRoute.Sitemap = [];
  try {
    const rows = await fetchSitemapNotices();
    noticePages = rows.map((row) => ({
      url: `${BASE_URL}/procurement?notice_id=${row.id}`,
      lastModified: isoOrNull(row.update_time) ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch (err) {
    console.error("[sitemap] 公告段生成失败，动态公告 URL 已降级为空:", (err as Error).message);
  }

  // ── 动态供应商段（独立容错）──
  let supplierPages: MetadataRoute.Sitemap = [];
  try {
    const rows = await fetchSitemapSuppliers();
    supplierPages = rows.map((row) => ({
      url: `${BASE_URL}/supplier?supplier_id=${row.id}`,
      lastModified: isoOrNull(row.addtime) ?? now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch (err) {
    console.error("[sitemap] 供应商段生成失败，动态供应商 URL 已降级为空:", (err as Error).message);
  }

  // ── 静默失效防线：DB 可达但两段皆空视为异常（表结构变更/权限问题的早期信号）──
  if (noticePages.length === 0 && supplierPages.length === 0) {
    console.error("[sitemap] 警告：动态段全部为空 —— 请检查 sitemap-sources 查询与数据库可用性");
  }

  return [...staticPages, ...noticePages, ...supplierPages];
}
