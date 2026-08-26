/**
 * 系统配置公开端点
 * Public system config endpoints (no auth required)
 *
 * @module routes/system.routes
 */
import { Router } from "express";
import fs from "fs";
import path from "path";
import type { AppContext } from "../context";

/** 构建时生成的版本号文件（dist/version.json） */
function readBuildVersion(): string {
  try {
    const versionFile = path.join(process.cwd(), "dist", "version.json");
    const data = JSON.parse(fs.readFileSync(versionFile, "utf-8"));
    return data.version || "";
  } catch {
    // 开发环境或 version.json 不存在时，用 package.json 版本号 + 时间戳
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );
      return `${pkg.version || "0.0.0"}-dev`;
    } catch {
      return "unknown";
    }
  }
}

export function createSystemRouter(ctx: AppContext): Router {
  const router = Router();
  const { systemRepo } = ctx;

  // ICP 备案号准静态，服务端内存缓存 10 分钟，避免每次穿透 DB
  let icpCache: { bah: string; ts: number } | null = null;
  const ICP_CACHE_TTL = 10 * 60 * 1000;

  router.get("/api/system/icp", async (_req, res) => {
    try {
      const now = Date.now();
      if (icpCache && now - icpCache.ts < ICP_CACHE_TTL) {
        res.setHeader("Cache-Control", "public, max-age=600");
        return res.json(icpCache);
      }
      const bah = await systemRepo.getIcpBah();
      icpCache = { bah, ts: now };
      res.setHeader("Cache-Control", "public, max-age=600");
      res.json(icpCache);
    } catch {
      res.json({ bah: "" });
    }
  });

  // ── 底部社交媒体链接（crm.link 表，iconfont 字体图标渲染）──
  // 服务端内存缓存 30 分钟，链接数据变更频率极低
  let linksCache: { items: FooterLink[]; ts: number } | null = null;
  const LINKS_CACHE_TTL = 30 * 60 * 1000;

  interface FooterLink {
    id: number;
    name: string;
    url: string;
    icon: string;
  }

  router.get("/api/system/links", async (_req, res) => {
    try {
      const now = Date.now();
      if (linksCache && now - linksCache.ts < LINKS_CACHE_TTL) {
        res.setHeader("Cache-Control", "public, max-age=1800");
        return res.json(linksCache.items);
      }
      const rows = await systemRepo.listFooterLinks();
      const items: FooterLink[] = (rows || []).map((r) => ({
        id: Number(r.id),
        name: String(r.name || ""),
        url: String(r.url || ""),
        icon: String(r.icon || ""),
      }));
      linksCache = { items, ts: now };
      res.setHeader("Cache-Control", "public, max-age=1800");
      res.json(items);
    } catch {
      res.json([]);
    }
  });

  // 获取当前部署版本号（前端轮询比对，检测新版本）
  // 不缓存，确保前端始终拿到最新版本号
  router.get("/api/system/version", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.json({ version: readBuildVersion() });
  });

  // ─ Sitemap.xml 动态生成（SEO 核心基础设施）──
  // 缓存 1 小时，页面结构变更频率低
  // 包含所有公开页面，帮助搜索引擎快速发现和索引
  let sitemapCache: { xml: string; ts: number } | null = null;
  const SITEMAP_CACHE_TTL = 60 * 60 * 1000; // 1 小时

  /** 公开页面列表（不含需要认证的页面） */
  const PUBLIC_PAGES = [
    { path: "/", priority: "1.0", changefreq: "daily" },
    { path: "/showroom", priority: "0.9", changefreq: "daily" },
    { path: "/procurement", priority: "0.8", changefreq: "hourly" },
    { path: "/supplier", priority: "0.8", changefreq: "daily" },
    { path: "/services", priority: "0.7", changefreq: "weekly" },
    { path: "/learning", priority: "0.7", changefreq: "weekly" },
    { path: "/training", priority: "0.8", changefreq: "weekly" },
    { path: "/procurement/qualification", priority: "0.6", changefreq: "monthly" },
  ];

  router.get("/sitemap.xml", (_req, res) => {
    const now = Date.now();

    // 使用缓存（1 小时内）
    if (sitemapCache && now - sitemapCache.ts < SITEMAP_CACHE_TTL) {
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(sitemapCache.xml);
    }

    // 生成 sitemap XML
    const baseUrl = process.env.SITE_URL || "https://osneosmart.com";
    const lastmod = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const urls = PUBLIC_PAGES.map(
      (page) =>
        `  <url>
    <loc>${baseUrl}${page.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
    ).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    // 更新缓存
    sitemapCache = { xml, ts: now };

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(xml);
  });

  return router;
}
