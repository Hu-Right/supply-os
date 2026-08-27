/**
 * Robots.txt — Next.js App Router
 *
 * @module app/robots
 * @description 搜索引擎爬虫指引。允许所有公开页面，禁止爬取后台和 API。
 */
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.SITE_URL || "https://osneosmart.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/showroom",
          "/procurement",
          "/supplier",
          "/services",
          "/learning",
          "/training",
          "/procurement/qualification",
        ],
        disallow: [
          "/crm",
          "/membership",
          "/api/",
          "/assets/",
        ],
      },
      {
        userAgent: "Googlebot",
        allow: "/",
      },
      {
        userAgent: "Baiduspider",
        allow: "/",
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
