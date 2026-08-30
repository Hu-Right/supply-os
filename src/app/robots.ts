/**
 * Robots.txt — Next.js App Router（单一事实源）
 *
 * @module app/robots
 * @description 搜索引擎爬虫指引。public/robots.txt 已删除 —— 双源共存时
 *              生产环境静默由静态文件获胜（app/robots.ts 成死代码），
 *              Next 16 dev 则直接 500（conflicting public file and page file）。
 *
 *              规则设计注意：不要为具体 UA（如 Googlebot）建只有 Allow 的
 *              独立规则组 —— robots 协议按最长 user-agent 匹配生效，该 UA
 *              将绕过 `*` 组的全部 Disallow（/crm、/api/ 反而可爬）。
 */
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/services/seo/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // 默认即允许，无需逐路径白名单；仅排除无索引价值区域
        allow: "/",
        disallow: [
          "/crm", // 登录后工作台，无搜索价值
          "/api/", // 数据接口
          "/r/", // 推荐短链（写 Cookie 后 302，无内容）
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
