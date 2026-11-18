import { redirect } from "next/navigation";

/**
 * 旧地址兼容：授权书页已内联进发布页（`/rfq/[id]/publish`），第 4/5 步不再离开发布域。
 * 保留 301 语义的跳转，避免工作台旧链接/书签/正在填的人 404。
 */
export default async function LegacyAuthorizationLetterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/rfq/${id}/publish`);
}
