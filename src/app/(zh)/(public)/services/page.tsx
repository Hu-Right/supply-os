/**
 * /services — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { BROWSER_TITLE } from "@/lib/i18n/metadata";
import { jsonLdScript, SITE_ENTITY } from "@/lib/services/seo/json-ld";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  // 只写页面名：网站名由根 layout 的 title.template 拼在首位
  title: "供应链服务 · 投标辅助与国际物流",
  description: "云境·国际采购平台服务生态：投标辅助、国际物流、产品认证、翻译服务等供应链相关服务，一站式对接专业服务商。",
  openGraph: {
    title: BROWSER_TITLE.zh,
    description: "投标辅助、国际物流、产品认证等供应链服务一站式对接。",
    url: absoluteUrl("/services"),
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
  alternates: {
    canonical: absoluteUrl("/services"),
    languages: { "x-default": absoluteUrl("/services") },
  },
};

/** 服务生态结构化数据（Service + 服务目录）：不写价格，只列页面已明示的服务项 */
const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "供应链服务生态",
  description: "面向国际公共采购的一站式供应链服务：投标辅助、国际物流、产品认证与翻译本地化，由平台对接专业服务商。", // i18n-allow: JSON-LD 结构化数据面向中文搜索来源，与页面 <h1> 同口径
  url: absoluteUrl("/services"),
  provider: SITE_ENTITY,
  areaServed: "Worldwide",
  serviceType: ["投标辅助", "国际物流", "产品认证", "翻译与本地化"],
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "供应链服务",
    itemListElement: ["投标辅助", "国际物流", "产品认证", "翻译与本地化"].map((name) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name },
    })),
  },
};

export default function ServicesPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(serviceJsonLd) }} />
      <PageClient />
    </>
  );
}
