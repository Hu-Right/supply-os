/**
 * /procurement — ISR (revalidate: 3600)
 *
 * SSR 内容：在 <noscript> 中渲染页面描述，确保搜索引擎爬虫可读取关键信息。
 * 采购公告列表数据来自 API 动态查询，无法在服务端预渲染。
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Procurement Search | Supply OS",
  description: "Search global bidding and procurement notices from UN agencies, governments, and international organizations. Filter by country, industry (UNSPSC), and institution.",
  alternates: {
    canonical: "https://osneosmart.com/procurement",
    languages: { "x-default": "https://osneosmart.com/procurement" },
  },
};

export default function ProcurementPage() {
  return (
    <>
      {/* SSR 可索引内容：搜索引擎爬虫可读取页面核心描述 */}
      <noscript>
        <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
          <h1>Global Procurement Notice Search</h1>
          <p>
            Search and browse procurement notices from global organizations including
            United Nations agencies, government procurement offices, and international
            development banks. Filter by country, industry category (UNSPSC), and
            procuring institution to find relevant bidding opportunities.
          </p>
          <p>
            Features: real-time search, UNSPSC industry classification, country and
            agency filters, featured procurement pool, and AI-powered industry matching.
          </p>
          <p>
            Enable JavaScript to access the full interactive search experience.
          </p>
        </div>
      </noscript>
      {/* 客户端交互层 */}
      <PageClient />
    </>
  );
}
