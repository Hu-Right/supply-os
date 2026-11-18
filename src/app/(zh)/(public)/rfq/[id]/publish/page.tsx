/**
 * /rfq/[id]/publish — 发布流程（第 2~7 步同一页）
 *
 * @module app/(public)/rfq/[id]/publish/page
 * @description 2026-11 流程收口：发布过程不再散到设置中心（授权书页/工作台），
 *              由客户端壳按项目状态渲染。第 1 步主体认证仍在 /settings/buyer。
 *              标题只写页面名，网站名由根 layout 的 template 拼在首位。
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "发布采购需求",
  description: "填写需求、生成并签署授权书、跟踪云境核验进度，全程在同一页面完成。",
  robots: { index: false, follow: false },
};

export default async function PublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-secondary-500">
        无效的需求编号 {/* i18n-allow: 纯防御分支（非法 id 在服务端兜底，此处无 locale 上下文，客户端壳有完整错误态） */}
      </div>
    );
  }
  return <PageClient projectId={projectId} />;
}
