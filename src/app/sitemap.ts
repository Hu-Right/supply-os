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
import { fetchSitemapNotices } from "@/lib/services/seo/sitemap-sources";
import { SITE_URL } from "@/lib/services/seo/site";

const BASE_URL = SITE_URL;

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
  // 不带 lastModified：每次 ISR 再生成都会刷新的"构建时刻"是不诚实的新鲜度
  // 信号，搜索引擎会学会忽略本站全部 lastmod（连带动态段的真数据一起失信）。
  // 动态段保留真实 update_time。
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/showroom`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/procurement`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/supplier`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/training`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/membership`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/services`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/learning`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/procurement/qualification`, changeFrequency: "monthly", priority: 0.5 },
  ];

  // ── 构建阶段跳过动态查询（CI 环境无数据库访问）──
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return staticPages;
  }

  // ── 动态公告段（独立容错：失败仅降级本段并报警）──
  // URL 模板 = SEO 详情路由（每条公告独立 title/description/canonical）。
  // 旧模板 /procurement?notice_id=X 共享 /procurement 的静态 canonical，
  // 搜索引擎将其全部判定为重复页 —— 提交零收录收益、白耗抓取预算。
  let noticePages: MetadataRoute.Sitemap = [];
  try {
    const rows = await fetchSitemapNotices();
    noticePages = rows.map((row) => ({
      url: `${BASE_URL}/procurement/notice/${row.id}`,
      lastModified: isoOrNull(row.update_time) ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch (err) {
    console.error("[sitemap] 公告段生成失败，动态公告 URL 已降级为空:", (err as Error).message);
  }

  // ── 供应商段已移除（2026-08-29）──
  // /supplier?supplier_id=X 与公告段同理共享 /supplier canonical（重复页）。
  // 待 /supplier/[id] 详情路由建成后再恢复（fetchSitemapSuppliers 保留在
  // sitemap-sources 作为数据源）。

  // ── 静默失效防线：DB 可达但公告段为空视为异常（表结构变更/权限问题的早期信号）──
  if (noticePages.length === 0) {
    console.error("[sitemap] 警告：动态公告段为空 —— 请检查 sitemap-sources 查询与数据库可用性");
  }

  return [...staticPages, ...noticePages];
}
