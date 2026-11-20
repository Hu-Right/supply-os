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
import { fetchSitemapNotices, fetchSitemapCountries, fetchSitemapSuppliers } from "@/lib/services/seo/sitemap-sources";
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
  // bid_notices.create_time / supplier.addtime 实际为 Unix 秒时间戳（数字）
  const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString();

  // ── 静态页面 ──
  // 不带 lastModified：每次 ISR 再生成都会刷新的"构建时刻"是不诚实的新鲜度
  // 信号，搜索引擎会学会忽略本站全部 lastmod（连带动态段的真数据一起失信）。
  // 动态段保留真实 create_time（2026-11-18 由 update_time 改：该列有 YYYYMMDDHHMMSS 脏值）。
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/procurement`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/procurement/countries`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/procurement/industries`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/supplier`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/award-intelligence`, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/training`, changeFrequency: "weekly", priority: 0.7 },
    // /learning（知识中心）暂时下架，不再对搜索引擎公开收录（页面文件仍保留、直接网址可达）。
    { url: `${BASE_URL}/membership`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/services`, changeFrequency: "monthly", priority: 0.7 },
    // 第三方服务生态（2026-11-20 独立一级模块：研修培训 + 邀约入驻伙伴墙）
    { url: `${BASE_URL}/ecosystem`, changeFrequency: "weekly", priority: 0.7 },
    // /procurement/diagnosis 页面自带 robots noindex，不列入 sitemap（否则搜索台报「已提交但被 noindex 排除」）
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/refund-policy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/account-cancellation`, changeFrequency: "yearly", priority: 0.2 },
    // 英文站点（app/(en)/en）只保留首页与公告入口页（2026-11-18 移除动态公告列表后，英文详情页不再有列表内链）
    { url: `${BASE_URL}/en`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/en/procurement`, changeFrequency: "daily", priority: 0.7 },
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
      lastModified: isoOrNull(row.create_time) ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch (err) {
    console.error("[sitemap] 公告段生成失败，动态公告 URL 已降级为空:", (err as Error).message);
  }

  // ── 国别聚合落地页（独立容错：失败只降级本段）──
  // 只提交有效公告数达到阈值的国家，薄页留页面但不进 sitemap。
  let countryPages: MetadataRoute.Sitemap = [];
  try {
    const countries = await fetchSitemapCountries();
    countryPages = countries.map((c) => ({
      url: `${BASE_URL}/procurement/country/${c.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));
  } catch (err) {
    console.error("[sitemap] 国别段生成失败，国别落地页 URL 已降级为空:", (err as Error).message);
  }

  // ── 供应商详情段（/supplier/[id] 与 /en/supplier/[id] 已上线）──
  let supplierPages: MetadataRoute.Sitemap = [];
  try {
    const rows = await fetchSitemapSuppliers();
    supplierPages = rows.map((row) => ({
      url: `${BASE_URL}/supplier/${row.id}`,
      lastModified: isoOrNull(row.addtime) ?? now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
      alternates: {
        languages: {
          zh: `${BASE_URL}/supplier/${row.id}`,
          en: `${BASE_URL}/en/supplier/${row.id}`,
        },
      },
    }));
  } catch (err) {
    console.error("[sitemap] 供应商段生成失败，供应商详情 URL 已降级为空:", (err as Error).message);
  }

  // ── 静默失效防线：DB 可达但公告段为空视为异常（表结构变更/权限问题的早期信号）──
  if (noticePages.length === 0) {
    console.error("[sitemap] 警告：动态公告段为空 —— 请检查 sitemap-sources 查询与数据库可用性");
  }

  return [...staticPages, ...countryPages, ...supplierPages, ...noticePages];
}
