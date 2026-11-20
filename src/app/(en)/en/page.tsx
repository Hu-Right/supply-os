/**
 * /en — 英文站点首页（SEO 落地页）
 *
 * 英文版本期只做「可索引的英文入口」：说明平台能力与内部链接，
 * 不做中文首页的整站翻译（中文业务页仍由 (zh) 分组提供）。
 *
 * [2026-11-18 移除] “Latest procurement notices” 动态列表区块：其数据源
 * （seo/latest-notices）按主表 `update_time DESC` 取数，但该列混入
 * `YYYYMMDDHHMMSS` 形态脏值（如 20261030012753，仅 BOAMP 83 行），
 * 倒序会把法国动态采购系统/框架协议（截止 2031~2037）顶到最前；
 * 该区块与 /en/procurement 列表同坑，一并清理，英文站只保留静态入口。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { EnglishShell } from "../shell";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";

export const revalidate = 3600;

export const metadata: Metadata = {
  description:
    "Focused on UNGM, UN and government procurement: opportunity analysis, market-access compliance and bid enablement — connecting China's best suppliers with global buyers.",
  alternates: {
    canonical: absoluteUrl("/en"),
    languages: {
      "en": absoluteUrl("/en"),
      "zh-CN": absoluteUrl("/"),
      "x-default": absoluteUrl("/"),
    },
  },
  openGraph: {
    title: "Yunjing · Chinese Supply Chain Going Global",
    description:
      "Global public procurement opportunities, market-access compliance and bid enablement for Chinese suppliers.",
    url: absoluteUrl("/en"),
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default function EnglishHomePage() {
  return (
    <EnglishShell>
      <section className="space-y-4 py-6">
        <h1 className="text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
          Global procurement notices, in one place
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-slate-600">
          Yunjing aggregates live tenders and procurement notices published by UN agencies, the World Bank,
          national governments and international organisations. Filter by country, buyer, category and deadline,
          then track each opportunity through your bid pipeline.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/procurement"
            className="rounded-lg bg-training-green px-5 py-2.5 text-sm font-bold text-white hover:bg-training-green-hover"
          >
            Browse live notices
          </Link>
          <Link
            href="/supplier"
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-training-green/40 hover:text-training-green"
          >
            Supplier directory
          </Link>
        </div>
      </section>

      <section className="grid gap-3 py-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold text-slate-900">Coverage</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            UN agencies, multilateral banks and national procurement portals across more than 190 countries.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold text-slate-900">Filters</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Country, buyer agency, commodity category, notice type and deadline window.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold text-slate-900">Workflow</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Save opportunities, record bid progress and keep buyer contacts in one place.
          </p>
        </div>
      </section>
    </EnglishShell>
  );
}
