/**
 * /training — ISR (revalidate: 3600)
 *
 * SSR 内容：在 <noscript> 中渲染课程核心信息，确保搜索引擎爬虫可读取。
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Training Camp | Supply OS",
  description: "Professional supply chain training camp: global procurement, supplier management, international trade practices, UN procurement bidding. Hands-on workshops with industry experts.",
  alternates: {
    canonical: "https://osneosmart.com/training",
    languages: { "x-default": "https://osneosmart.com/training" },
  },
};

export default function TrainingPage() {
  return (
    <>
      {/* SSR 可索引内容：搜索引擎爬虫可读取课程核心信息 */}
      <noscript>
        <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
          <h1>Supply Chain Training Camp</h1>
          <p>
            Professional training program for foreign trade professionals. Master global
            procurement, supplier management, international trade practices, and UN
            procurement bidding through hands-on workshops led by industry experts.
          </p>
          <p>
            Course highlights: UN procurement opportunity analysis, supplier performance
            evaluation, contract delivery risk management, technical response writing,
            and quotation cost calculation.
          </p>
          <p>
            Enable JavaScript to access the full interactive training page with
            instructor profiles, course gallery, and online registration.
          </p>
        </div>
      </noscript>
      {/* 客户端交互层 */}
      <PageClient />
    </>
  );
}
