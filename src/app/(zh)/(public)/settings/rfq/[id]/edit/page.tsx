import { redirect } from "next/navigation";

/**
 * 旧地址兼容：编辑/续填统一收进发布页（`/rfq/[id]/publish`，按状态渲染可编辑表单）。
 * 保留跳转，避免工作台旧链接与书签 404。
 */
export default async function LegacyEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/rfq/${id}/publish`);
}
