/**
 * 我的报价 — 供应商视角页面壳
 * @module app/(public)/rfq/my-quotes
 * @description 薄壳：渲染客户端列表（数据走 /api/rfq/my-quotes）。不索引（登录态私有）。
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "我的报价 | 采购需求",
  robots: "noindex, follow",
};

export default function MyQuotesPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <PageClient />
    </div>
  );
}
