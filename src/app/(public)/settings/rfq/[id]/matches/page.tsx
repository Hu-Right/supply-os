import { redirect } from "next/navigation";

/**
 * 旧地址兼容：匹配名单已内联进发布页（`/rfq/[id]/publish#matches`）。
 * 保留跳转，避免工作台旧链接与书签 404。
 */
export default async function LegacyMatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/rfq/${id}/publish#matches`);
}
