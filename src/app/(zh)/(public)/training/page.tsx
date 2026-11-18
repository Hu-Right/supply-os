/**
 * /training — ISR (revalidate: 3600)
 *
 * 交互 UI 由 PageClient（dynamic import）在客户端接管。
 */
import type { Metadata } from "next";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { BROWSER_TITLE } from "@/lib/i18n/metadata";
import { jsonLdScript, SITE_ENTITY } from "@/lib/services/seo/json-ld";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  // 只写页面名：网站名由根 layout 的 title.template 拼在首位
  title: "国际采购研修班",
  description: "云境·国际采购平台研修班：国际公共采购实战培训，联合国采购流程、投标技巧、供应商管理，行业专家手把手教学。",
  openGraph: {
    title: BROWSER_TITLE.zh,
    description: "联合国采购实战培训，行业专家手把手教学，助力企业掌握国际投标技能。",
    url: absoluteUrl("/training"),
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
  alternates: {
    canonical: absoluteUrl("/training"),
    languages: { "x-default": absoluteUrl("/training") },
  },
};

/** 研修班结构化数据（Course）：只写页面已明示的事实，不编造价格/开课日期 */
const courseJsonLd = {
  "@context": "https://schema.org",
  "@type": "Course",
  name: "国际采购研修班",
  description:
    "国际公共采购实战培训：联合国及各国政府采购流程、投标文件编制、供应商管理与合规交付，行业专家手把手教学。", // i18n-allow: JSON-LD 结构化数据面向中文搜索来源，与页面 <h1> 同口径
  url: absoluteUrl("/training"),
  inLanguage: "zh-CN",
  provider: SITE_ENTITY,
  teaches: ["联合国采购流程", "国际投标文件编制", "供应商管理", "合规与交付风险"],
};

export default function TrainingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(courseJsonLd) }} />
      <PageClient />
    </>
  );
}
