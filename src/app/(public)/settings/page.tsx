/**
 * /settings — 默认重定向到 AI 模型配置
 * @module app/(public)/settings/page
 */
import { redirect } from "next/navigation";

export default function SettingsIndexPage() {
  redirect("/settings/ai-model");
}
