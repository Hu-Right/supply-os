/**
 * /notifications — 站内通知收件箱
 *
 * @module app/(public)/notifications/page
 * @description 铃铛的「查看全部通知」落点。标题只写页面名，网站名由根 layout 的 template 拼在首位。
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "站内通知",
  description: "采购需求核验结论、发布结果与主体认证进展的站内留痕。",
  robots: { index: false, follow: false },
};

export default function NotificationsPage() {
  return <PageClient />;
}
