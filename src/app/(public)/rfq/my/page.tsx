/**
 * 我的采购需求 — 管理页
 * My RFQs — Management Page
 *
 * @module app/(public)/rfq/my
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import MyRfqPageClient from "./page-client";

export const metadata: Metadata = {
  title: "我的采购需求 | RFQ 管理",
  description: "查看和管理您发布的采购需求",
  robots: { index: false, follow: false },
  alternates: { canonical: absoluteUrl("/rfq/my") },
};

export default function MyRfqPage() {
  return <MyRfqPageClient />;
}
