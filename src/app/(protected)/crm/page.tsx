/**
 * /crm — 纯 CSR（受保护页面）
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "CRM 客户管理 | Supply OS",
    description: "管理您的客户关系与销售线索",
    alternates: {
      canonical: "https://osneosmart.com/crm",
      languages: { "x-default": "https://osneosmart.com/crm" },
    },
  };
}

export default function CrmPage() {
  return <PageClient />;
}
