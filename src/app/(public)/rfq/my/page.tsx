/**
 * 我的采购需求 — 旧门户路由
 * @module app/(public)/rfq/my
 * @description 管理功能已迁入账户设置 /settings/rfq，此处仅做永久跳转，
 *              兼容历史链接（wizard 旧版、外部收藏、后台通知文案）。
 */
import { redirect } from "next/navigation";

export default function MyRfqLegacyPage() {
  redirect("/settings/rfq");
}
