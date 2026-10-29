/**
 * /membership — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import { BROWSER_TITLE } from "@/lib/i18n/metadata";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  // 只写页面名：网站名由根 layout 的 title.template 拼在首位
  title: "会员套餐与权益",
  description: "云境·国际采购平台会员套餐：查看完整采购公告、供应商数据与 AI 投标工具，助力企业高效拓展全球采购业务。",
  openGraph: {
    title: BROWSER_TITLE.zh,
    description: "查看完整采购公告、供应商数据与 AI 投标工具，助力全球业务拓展。",
    type: "website",
  },
  alternates: {
    canonical: absoluteUrl("/membership"),
    languages: { "x-default": absoluteUrl("/membership") },
  },
};

export default function MembershipPage() {
  return <PageClient />;
}
