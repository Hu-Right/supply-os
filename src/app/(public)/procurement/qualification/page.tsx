/**
 * /procurement/qualification — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import { BROWSER_TITLE } from "@/lib/i18n/metadata";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: BROWSER_TITLE.zh,
  description: "云境·国际采购平台供应商资质认证：申请成为平台认证供应商，获取联合国及全球政府采购投标资格。",
  openGraph: {
    title: BROWSER_TITLE.zh,
    description: "申请成为认证供应商，获取全球政府采购投标资格。",
    type: "website",
  },
  alternates: {
    canonical: absoluteUrl("/procurement/qualification"),
    languages: { "x-default": absoluteUrl("/procurement/qualification") },
  },
};

export default function QualificationPage() {
  return <PageClient />;
}
