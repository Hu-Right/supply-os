/**
 * /showroom — ISR (revalidate: 3600)
 *
 * SSR 内容：在 <noscript> 中渲染展厅数据，确保搜索引擎爬虫可读取完整内容。
 * 实际交互 UI 由 PageClient（dynamic import）在客户端加载。
 */
import type { Metadata } from "next";
import PageClient from "./page-client";
import { EXHIBITION_HALLS } from "@/data";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Global Showrooms | Supply OS",
  description: "Browse global supply chain resources and exhibition information across 6 locations: Frankfurt, Dubai, Nairobi, Sao Paulo, Los Angeles, Ho Chi Minh City.",
  alternates: {
    canonical: "https://osneosmart.com/showroom",
    languages: { "x-default": "https://osneosmart.com/showroom" },
  },
};

export default function ShowroomPage() {
  return (
    <>
      {/* SSR 可索引内容：搜索引擎爬虫可直接读取展厅数据 */}
      <noscript>
        <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
          <h1>Global Supply Chain Showrooms</h1>
          <p>Browse our 6 exhibition halls worldwide for procurement and business matching.</p>
          {EXHIBITION_HALLS.map((eh) => (
            <article key={eh.id} style={{ marginBottom: "1.5rem" }}>
              <h2>{eh.nameEn}</h2>
              <p>{eh.descriptionEn}</p>
              <p><strong>Location:</strong> {eh.cityEn}, {eh.countryEn} ({eh.regionEn})</p>
              <p><strong>Capacity:</strong> {eh.capacityValue}</p>
              <p><strong>Featured Products:</strong> {eh.featuredProductsEn.join(", ")}</p>
            </article>
          ))}
        </div>
      </noscript>
      {/* 客户端交互层 */}
      <PageClient />
    </>
  );
}
