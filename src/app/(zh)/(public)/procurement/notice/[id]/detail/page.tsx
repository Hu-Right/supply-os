import type { Metadata } from "next";
import PageClient from "./page-client";

/**
 * 用户公告详情页（独立路由）
 *
 * @description 登录后的完整公告详情，从列表卡片/深链进入；公开摘要仍由
 *              `/procurement/notice/[id]` 承担，本页 noindex，避免与 SEO 页重复。
 */
export const metadata: Metadata = {
  title: "公告详情",
  robots: { index: false, follow: true },
};

export default function NoticeDetailRoutePage() {
  return <PageClient />;
}
