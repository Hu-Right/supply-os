/**
 * /settings/notifications — 旧入口兼容：通知触达策略由平台统一决定，不做用户偏好配置
 * @module app/(public)/settings/notifications/page
 */
import { redirect } from "next/navigation";

export default function NotificationSettingsPage() {
  redirect("/settings");
}
