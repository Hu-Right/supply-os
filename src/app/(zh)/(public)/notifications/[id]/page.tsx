/**
 * /notifications/[id] — 通知详情
 *
 * @module app/(public)/notifications/[id]/page
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "通知详情",
  robots: { index: false, follow: false },
};

export default async function NotificationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notifId = Number(id);
  if (!Number.isFinite(notifId) || notifId <= 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-secondary-500">
        无效的通知编号 {/* i18n-allow: 纯防御分支（非法 id 服务端兜底，无 locale 上下文；客户端有完整错误态） */}
      </div>
    );
  }
  return <PageClient id={notifId} />;
}
