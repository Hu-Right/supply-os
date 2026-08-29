/**
 * /showroom — ISR (revalidate: 3600)
 *
 * 首屏 SEO 内容：展厅静态数据以真实 HTML 渲染（原 <noscript> 反模式已移除
 * —— noscript 内容对 Google 属二等信号；可见内容才是可索引内容）。
 * 交互 UI 由 PageClient（dynamic import）在客户端接管。
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import PageClient from "./page-client";
import { EXHIBITION_HALLS } from "@/data";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Global Showrooms | Supply OS",
  description: "Browse global supply chain resources and exhibition information across 6 locations: Frankfurt, Dubai, Nairobi, Sao Paulo, Los Angeles, Ho Chi Minh City.",
  alternates: {
    canonical: absoluteUrl("/showroom"),
    languages: { "x-default": absoluteUrl("/showroom") },
  },
};

function ExhibitionHallsSection() {
  return (
    <section
      className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      aria-label="Global exhibition halls"
    >
      <h2 className="text-lg font-bold text-slate-900">Global Supply Chain Showrooms</h2>
      <p className="mt-1 text-sm text-slate-500">
        Browse our 6 exhibition halls worldwide for procurement and business matching.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {EXHIBITION_HALLS.map((eh) => (
          <article key={eh.id} className="rounded-xl border border-slate-100 p-4">
            <h3 className="text-sm font-bold text-slate-800">{eh.nameEn}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{eh.descriptionEn}</p>
            <p className="mt-2 text-xs text-slate-400">
              <span className="font-semibold text-slate-500">Location:</span> {eh.cityEn}, {eh.countryEn} ({eh.regionEn})
            </p>
            <p className="mt-1 text-xs text-slate-400">
              <span className="font-semibold text-slate-500">Capacity:</span> {eh.capacityValue}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              <span className="font-semibold text-slate-500">Featured:</span> {eh.featuredProductsEn.join(", ")}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function ShowroomPage() {
  return (
    <>
      {/* 客户端交互层 */}
      <PageClient />
      {/* 服务端 SEO 内容区：静态展厅数据，真实 HTML */}
      <ExhibitionHallsSection />
    </>
  );
}
