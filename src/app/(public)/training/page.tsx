/**
 * /training — ISR (revalidate: 3600)
 *
 * 首屏 SEO 内容：课程核心信息以真实 HTML 渲染（原 <noscript> 反模式已移除）。
 * 交互 UI 由 PageClient（dynamic import）在客户端接管。
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Training Camp | Supply OS",
  description: "Professional supply chain training camp: global procurement, supplier management, international trade practices, UN procurement bidding. Hands-on workshops with industry experts.",
  alternates: {
    canonical: absoluteUrl("/training"),
    languages: { "x-default": absoluteUrl("/training") },
  },
};

function TrainingIntroSection() {
  return (
    <section
      className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      aria-label="Training program overview"
    >
      <h2 className="text-lg font-bold text-slate-900">Supply Chain Training Camp</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Professional training program for foreign trade professionals. Master global
        procurement, supplier management, international trade practices, and UN
        procurement bidding through hands-on workshops led by industry experts.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Course highlights: UN procurement opportunity analysis, supplier performance
        evaluation, contract delivery risk management, technical response writing,
        and quotation cost calculation.
      </p>
    </section>
  );
}

export default function TrainingPage() {
  return (
    <>
      {/* 客户端交互层 */}
      <PageClient />
      {/* 服务端 SEO 内容区：课程核心信息，真实 HTML */}
      <TrainingIntroSection />
    </>
  );
}
