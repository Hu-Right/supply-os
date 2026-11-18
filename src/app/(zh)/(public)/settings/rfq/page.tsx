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
  // 只写页面名：网站名由根 layout 的 title.template 拼在首位
  title: "我的采购需求",
  description: "查看和管理您发布的采购需求",
  robots: { index: false, follow: false },
  alternates: { canonical: absoluteUrl("/settings/rfq") },
};

export default function MyRfqSettingsPage() {
  return <MyRfqSettingsClient />;
}
