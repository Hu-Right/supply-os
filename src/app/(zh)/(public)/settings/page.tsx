/**
 * /settings — 账号概览（账号中心首页）
 * @module app/(public)/settings/page
 */
import type { Metadata } from "next";
import { AccountOverview } from "@/features/auth/components/AccountOverview";

export const metadata: Metadata = {
  title: "账号中心",
  description: "账号状态、身份认证、安全设置与费用入口。",
  robots: { index: false, follow: false },
};

export default function SettingsIndexPage() {
  return <AccountOverview />;
}
