import type { Metadata } from "next";
import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "企业信息",
  description: "查看与管理您绑定的企业信息（来源：企业表）。",
};

export default function EnterpriseSettingsPage() {
  return <PageClient />;
}
