import type { Metadata } from "next";
import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "供应商主体",
  description: "查看与管理您绑定的供应商主体信息。",
};

export default function EnterpriseSettingsPage() {
  return <PageClient />;
}

