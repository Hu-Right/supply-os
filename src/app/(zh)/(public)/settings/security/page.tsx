/**
 * /settings/security — 账号安全
 * @module app/(public)/settings/security/page
 */
import type { Metadata } from "next";
import { SecuritySettings } from "@/features/auth/components/SecuritySettings";

export const metadata: Metadata = {
  title: "账号安全",
  description: "登录密码、手机/邮箱绑定、登录设备与账号注销。",
  robots: { index: false, follow: false },
};

export default function SecuritySettingsPage() {
  return <SecuritySettings />;
}
