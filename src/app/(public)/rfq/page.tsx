/**
 * RFQ 采购需求发布页
 * RFQ Publish Page
 *
 * @module app/(public)/rfq
 * @description 发布向导 + 需求广场 + 响应流程时间线。
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
