/**
 * /membership — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "会员套餐 — 解锁高级功能 | 云境·国际采购平台",
  description: "云境·国际采购平台会员套餐：解锁更多采购公告、供应商数据、CRM 功能，助力企业高效拓展全球采购业务。",
  openGraph: {
    title: "会员套餐 | 云境·国际采购平台",
    description: "解锁更多采购公告、供应商数据、CRM 功能，助力全球业务拓展。",
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
