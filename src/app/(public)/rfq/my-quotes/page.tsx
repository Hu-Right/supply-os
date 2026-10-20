/**
 * 我的报价 — 供应商视角页面壳
 * @module app/(public)/rfq/my-quotes
 * @description 薄壳：渲染客户端列表（数据走 /api/rfq/my-quotes）。不索引（登录态私有）。
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const metadata: Metadata = {
  // 只写页面名：网站名由根 layout 的 title.template 拼在首位
  title: "我的报价",
  robots: "noindex, follow",
};

export default function MyQuotesPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <PageClient />
    </div>
  );
}
