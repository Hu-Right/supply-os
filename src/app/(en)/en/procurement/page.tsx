/**
 * /en/procurement — 英文公告入口（SEO 落地页，ISR 3600）
 *
 * [2026-11-18 移除] 原页面的动态公告列表（“Live government and UN procurement
 * notices”，按主表 `update_time DESC` 取 30 条）：`bid_notices.update_time` 混入
 * `YYYYMMDDHHMMSS` 形态脏值（仅 BOAMP 83 行），倒序会把法国动态采购系统/框架协议
 * （截止 2031~2037 年）永久顶在最前，展示成“最新公告全是 2033 年截标”。
 * 与中文 /procurement 的「最新国际采购公告」区块一并删除；英文页只保留入口，
 * 真实检索引导到中文主站的搜索页（筛选能力完整）。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { EnglishShell } from "../../shell";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Live government and UN procurement notices",
  description:
    "Browse live government, UN and multilateral procurement notices. Each listing shows the buyer agency, country and submission deadline, with a dedicated page per notice.",
  alternates: {
    canonical: absoluteUrl("/en/procurement"),
    languages: {
      "en": absoluteUrl("/en/procurement"),
      "zh-CN": absoluteUrl("/procurement"),
      "x-default": absoluteUrl("/procurement"),
    },
  },
  openGraph: {
    title: "Live government and UN procurement notices",
    description: "Live tenders from UN agencies, governments and international organisations.",
    url: absoluteUrl("/en/procurement"),
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default function EnglishProcurementPage() {
  return (
    <EnglishShell>
      <header className="space-y-2 py-4">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Live government and UN procurement notices</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          Search live tenders from UN agencies, multilateral banks, national governments and international
          organisations. Filter by country, buyer agency, commodity category, notice type and deadline.
        </p>
      </header>

      <div className="flex flex-wrap gap-3 py-4">
        <Link
          href="/procurement"
          className="rounded-lg bg-training-green px-5 py-2.5 text-sm font-bold text-white hover:bg-training-green-hover"
        >
          Open the full notice search
        </Link>
        <Link
          href="/procurement/countries"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-training-green/40 hover:text-training-green"
        >
          Browse by country
        </Link>
        <Link
          href="/procurement/industries"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-training-green/40 hover:text-training-green"
        >
          Browse by category
        </Link>
      </div>
    </EnglishShell>
  );
}
