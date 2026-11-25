// i18n-allow-file: SEO 落地页（ISR 3600）的 title/description 以中文主站语言硬编码；本地化需 locale 化路由架构，见 i18n 覆盖报告
/**
 * /procurement — ISR (revalidate: 3600)
 *
 * 交互搜索层由客户端接管（PageClient）。
 *
 * [2026-11-18 移除] 底部曾有一个「最新国际采购公告」服务端内链区块
 * （LatestNoticeLinks，按主表 `update_time DESC` 取 30 条）。删除原因：
 * 1) `bid_notices.update_time` 存在 `YYYYMMDDHHMMSS` 形态脏值（如 20261030012753），
 *    按它倒序会把 BOAMP 的「动态采购系统/框架协议」行（截止 2031~2037 年）顶到最前，
 *    页面看起来像“最新公告全是法国 2033 年截标的”，实际是排序字段错误；
 * 2) 该区块与上方搜索区内容重复，且页面已有 sitemap 与详情页入口，SEO 收益有限。
 * 若后续要恢复内链区块，必须先修正 update_time 口径（改用 create_time/发布时间）再上线。
 */
import type { Metadata } from "next";
import PageClient from "./page-client";
import { loadProcurementInitial } from "./initial-data";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { BROWSER_TITLE } from "@/lib/i18n/metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // 只写页面名：网站名由根 layout 的 title.template 拼在首位
  title: "全球采购公告搜索",
  description: "云境·国际采购平台：搜索联合国机构、各国政府及国际组织的招标与采购公告，支持按国家、行业（品目分类）、机构筛选。",
  openGraph: {
    title: BROWSER_TITLE.zh,
    description: "联合国、世界银行、各国政府招标信息一站式搜索，按国家/行业/机构精准筛选。",
    url: absoluteUrl("/procurement"),
    type: "website",
    siteName: "云境·国际采购平台",
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: BROWSER_TITLE.zh,
    description: "联合国、世界银行、各国政府招标信息一站式搜索，按国家/行业/机构精准筛选。",
    images: [DEFAULT_OG_IMAGE.url],
  },
  alternates: {
    canonical: absoluteUrl("/procurement"),
    languages: {
      "zh-CN": absoluteUrl("/procurement"),
      "en": absoluteUrl("/en/procurement"),
      "x-default": absoluteUrl("/procurement"),
    },
  },
};

export default async function ProcurementPage() {
  const initialResults = await loadProcurementInitial();
  return <PageClient initialResults={initialResults} />;
}
