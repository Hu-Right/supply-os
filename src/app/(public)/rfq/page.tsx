/**
 * RFQ 采购需求发布页（骨架）
 * RFQ Page (Skeleton)
 *
 * @module app/(public)/rfq
 * @description P0 占位页面 — 后续填充发布表单、RFQ 列表、供应商响应等模块。
 *              Placeholder page — to be filled with publish form, RFQ list, supplier responses.
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "采购需求发布 / RFQ | 供应商快速响应",
  description: "一键发布采购需求，获取优质供应商报价与平台顾问支持",
  alternates: {
    canonical: absoluteUrl("/rfq"),
    languages: { "x-default": absoluteUrl("/rfq") },
  },
};

export default function RFQPage() {
  return <PageClient />;
}
