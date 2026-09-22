/**
 * RFQ 编辑页 — 旧门户路由
 * @module app/(public)/rfq/[id]/edit
 * @description 编辑功能已迁入账户设置 /settings/rfq/[id]/edit，此处仅做跳转，
 *              兼容历史链接。
 */
import { redirect } from "next/navigation";

export default async function RfqEditLegacyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/settings/rfq/${id}/edit`);
}
