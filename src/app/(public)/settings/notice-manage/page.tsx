import type { Metadata } from "next";
import NoticeManagePageClient from "./page-client";

export const metadata: Metadata = { title: "公告管理" };

export default function NoticeManagePage() {
  return <NoticeManagePageClient />;
}
