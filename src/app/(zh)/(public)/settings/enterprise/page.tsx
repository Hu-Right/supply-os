import type { Metadata } from "next";
import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "供应商主体认证",
  description: "完成供应商主体认证，维护企业主体信息、主营产品与能力档案。",
};

export default function EnterpriseSettingsPage() {
  return <PageClient />;
}

