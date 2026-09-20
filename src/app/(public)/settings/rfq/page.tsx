/**
 * 我的采购需求 — 账户设置子页（Server Shell）
 *
 * @module app/(public)/settings/rfq
 * @description 采购方审批进展查看与调整入口，从门户 /rfq/my 迁入。不索引。
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import MyRfqSettingsClient from "./page-client";

export const metadata: Metadata = {
  title: "我的采购需求 | 账户设置",
  description: "查看和管理您发布的采购需求",
  robots: { index: false, follow: false },
  alternates: { canonical: absoluteUrl("/settings/rfq") },
};

export default function MyRfqSettingsPage() {
  return <MyRfqSettingsClient />;
}
