/**
 * /en — 英文站点首页（SEO 落地页）
 *
 * 英文版本期只做「可索引的英文入口」：说明平台能力、给出内部链接与最新公告，
 * 不做中文首页的整站翻译（中文业务页仍由 (zh) 分组提供）。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { EnglishShell } from "../shell";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { fetchLatestActiveNotices, type LatestNoticeRow } from "@/lib/services/seo/latest-notices";

export const revalidate = 3600;

export const metadata: Metadata = {
  description:
    "Search UN, World Bank and government procurement notices worldwide. Browse live tender opportunities, buyer agencies and deadlines, and manage your bids in one place.",
  alternates: {
    canonical: absoluteUrl("/en"),
    languages: {
      "en": absoluteUrl("/en"),
      "zh-CN": absoluteUrl("/"),
      "x-default": absoluteUrl("/"),
    },
  },
  openGraph: {
    title: "Yunjing · International Procurement Platform",
    description: "Global government and UN procurement notices, suppliers and tender opportunities.",
    url: absoluteUrl("/en"),
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

async function loadLatest(): Promise<LatestNoticeRow[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") return [];
  try {
    return await fetchLatestActiveNotices(undefined, 10);
  } catch (err) {
    console.error("[en] latest notices failed:", (err as Error).message);
    return [];
  }
}

export default async function EnglishHomePage() {
  const notices = await loadLatest();

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
            href="/en/procurement"
            className="rounded-lg bg-training-green px-5 py-2.5 text-sm font-bold text-white hover:bg-training-green-hover"
          >
            Browse live notices
          </Link>
          <Link
            href="/procurement"
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-training-green/40 hover:text-training-green"
          >
            Full search &amp; filters
          </Link>
        </div>
      </section>

      <section aria-labelledby="latest" className="space-y-3 py-4">
        <h2 id="latest" className="text-xl font-bold text-slate-900">Latest procurement notices</h2>
        {notices.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            No live notices available right now.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {notices.map((n) => (
              <li key={n.id} className="px-5 py-4">
                <Link
                  href={`/en/procurement/notice/${n.id}`}
                  className="block text-sm font-semibold leading-snug text-slate-800 hover:text-training-green"
                >
                  {n.title}
                </Link>
                <p className="mt-1 text-xs text-slate-500">
                  {[n.agency, n.country].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
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
