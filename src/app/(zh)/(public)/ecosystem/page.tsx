/**
 * /ecosystem — 第三方服务生态（独立一级模块）ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { BROWSER_TITLE } from "@/lib/i18n/metadata";
import { jsonLdScript, SITE_ENTITY } from "@/lib/services/seo/json-ld";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  // 只写页面名：网站名由根 layout 的 title.template 拼在首位
  title: "第三方服务生态",
  description: "云境·国际采购平台第三方服务生态：研修培训、合规准入、履约交付、售后服务、本地化运营等第三方专业服务，邀约入驻，一站对接。",
  openGraph: {
    title: BROWSER_TITLE.zh,
    description: "研修培训与合规、履约、售后、本地化运营第三方伙伴，一站对接。",
    url: absoluteUrl("/ecosystem"),
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
  alternates: {
    canonical: absoluteUrl("/ecosystem"),
    languages: { "x-default": absoluteUrl("/ecosystem") },
  },
};

/** 服务生态结构化数据（Service + 服务目录）：只列页面已明示的服务项 */
const ecosystemJsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "第三方服务生态",
  description: "面向国际公共采购的第三方专业服务生态：研修培训、合规准入、履约交付、售后服务与本地化运营，邀约入驻伙伴一站对接。", // i18n-allow: JSON-LD 面向中文搜索来源，与页面 <h1> 同口径
  url: absoluteUrl("/ecosystem"),
  provider: SITE_ENTITY,
  areaServed: "Worldwide",
  serviceType: ["研修培训", "合规准入", "履约交付", "售后服务", "本地化运营"],
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "第三方服务",
    itemListElement: ["研修培训", "合规准入", "履约交付", "售后服务", "本地化运营"].map((name) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name },
    })),
  },
};

export default function EcosystemPageRoute() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ecosystemJsonLd) }} />
      <PageClient />
    </>
  );
}
