/**
 * /settings/notifications — 通知与偏好
 * @module app/(public)/settings/notifications/page
 */
import type { Metadata } from "next";
import { NotificationSettings } from "@/features/auth/components/NotificationSettings";

export const metadata: Metadata = {
  title: "通知设置",
  description: "站内信、邮件与短信通知偏好。",
  robots: { index: false, follow: false },
};

export default function NotificationSettingsPage() {
  return <NotificationSettings />;
}
