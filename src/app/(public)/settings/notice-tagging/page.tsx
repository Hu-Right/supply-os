import type { Metadata } from "next";
import NoticeTaggingPageClient from "./page-client";

export const metadata: Metadata = { title: "公告打标" };

export default function NoticeTaggingPage() {
  return <NoticeTaggingPageClient />;
}
