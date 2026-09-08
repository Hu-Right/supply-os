/**
 * /supplier — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import { BROWSER_TITLE } from "@/lib/i18n/metadata";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: BROWSER_TITLE.zh,
  description: "云境·国际采购平台供应商目录：查询全球认证供应商信息，按行业、地区、资质筛选，助力精准匹配采购合作伙伴。",
  openGraph: {
    title: BROWSER_TITLE.zh,
    description: "全球认证供应商查询，按行业/地区/资质精准筛选。",
    type: "website",
  },
  alternates: {
    canonical: absoluteUrl("/supplier"),
    languages: { "x-default": absoluteUrl("/supplier") },
  },
};

export default function SupplierPage() {
  return <PageClient />;
}
