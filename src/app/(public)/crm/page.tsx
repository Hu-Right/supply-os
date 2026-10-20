/**
 * /crm — public page (open to all users)
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import { BROWSER_TITLE } from "@/lib/i18n/metadata";
import PageClient from "./page-client";

export const metadata: Metadata = {
  // 只写页面名：网站名由根 layout 的 title.template 拼在首位
  title: "CRM 采购商机工作台",
  description: "云境·国际采购平台 CRM 系统：管理客户关系、跟踪采购商机、记录投标进展，助力外贸团队高效协同。",
  openGraph: {
    title: BROWSER_TITLE.zh,
    description: "采购商机跟踪、客户关系管理、投标进展记录一站式 CRM。",
    type: "website",
  },
  alternates: {
    canonical: absoluteUrl("/crm"),
    languages: { "x-default": absoluteUrl("/crm") },
  },
};

export default function CrmPage() {
  return <PageClient />;
}
