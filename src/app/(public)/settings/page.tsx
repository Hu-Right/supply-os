/**
 * /settings — 默认重定向到个人信息
 * @module app/(public)/settings/page
 */
import { redirect } from "next/navigation";

export default function SettingsIndexPage() {
  redirect("/settings/profile");
}
