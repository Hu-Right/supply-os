/**
 * /en/procurement — English notice search (server-rendered)
 *
 * @description 英文用户可用的公告列表：服务端按 q/country/page 查询，
 *              输出真实公告标题、采购方、国家、截止时间与详情页链接；
 *              不依赖客户端 JS，AI/爬虫可直接读取。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { EnglishShell } from "../../shell";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { getPool } from "@/lib/db/pool";
import { searchUnified } from "@/lib/services/search-orchestrator";
import { toNoticeListView } from "@/lib/services/notice-public/view";
import { countryName } from "@/shared/constants/countries";
import { formatNoticeCstDate } from "@/shared/utils/notice-datetime/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live government and UN procurement notices",
  description:
    "Browse live government, UN and multilateral procurement notices. Each listing shows the buyer agency, country and submission deadline, with a dedicated page per notice.",
  alternates: {
    canonical: absoluteUrl("/en/procurement"),
    languages: {
      en: absoluteUrl("/en/procurement"),
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

const PAGE_SIZE = 20;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function EnglishProcurementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = first(sp.q).slice(0, 120).trim();
  const country = first(sp.country).slice(0, 40).trim();
  const page = Math.max(1, Number(first(sp.page)) || 1);

  let items: Awaited<ReturnType<typeof toNoticeListView>> = [];
  let total = 0;
  try {
    const result = await searchUnified(getPool(), {
      mode: "default",
      page,
      pageSize: PAGE_SIZE,
      sort: "latest",
      locale: "en",
      q: q || undefined,
      country: country || undefined,
    });
    items = toNoticeListView(result.items);
    total = result.total;
  } catch (err) {
    console.error("[en/procurement] 列表查询失败:", (err as Error).message);
  }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const linkFor = (nextPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (country) params.set("country", country);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return `/en/procurement${qs ? `?${qs}` : ""}`;
  };

  return (
    <EnglishShell>
      <header className="space-y-3 py-6">
        <h1 className="text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
          Live government and UN procurement notices
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-slate-600">
          Search live tenders from UN agencies, multilateral banks, national governments and international
          organisations. Open any notice for buyer, deadline and document details.
        </p>
      </header>

      <form action="/en/procurement" method="get" className="flex flex-wrap gap-2 py-4">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Keyword, buyer or reference"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-training-green"
        />
        <input
          type="text"
          name="country"
          defaultValue={country}
          placeholder="Country code (e.g. KE)"
          className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-training-green"
        />
        <button
          type="submit"
          className="rounded-lg bg-training-green px-5 py-2.5 text-sm font-bold text-white hover:bg-training-green-hover"
        >
          Search
        </button>
      </form>

      <p className="border-b border-slate-200 pb-3 text-sm text-slate-500">
        {total.toLocaleString("en-US")} active notices{q ? ` for “${q}”` : ""}
      </p>

      {items.length === 0 ? (
        <p className="py-10 text-sm text-slate-500">
          No notices found. Try a broader keyword or remove the country filter.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {items.map((n) => {
            const title = n.titleEn || n.title;
            const buyer = n.buyerName || "";
            const countryText = n.countryCode ? countryName(n.countryCode, "en") : "";
            const deadline = n.deadlineTs
              ? formatNoticeCstDate(Number(n.deadlineTs), true)
              : "No fixed deadline";
            const summary = (n.descriptionEn || n.description || "").replace(/\s+/g, " ").trim().slice(0, 180);
            return (
              <li key={n.noticePk} className="py-4">
                <Link
                  href={`/en/procurement/notice/${n.noticePk}`}
                  className="text-base font-bold leading-snug text-slate-900 hover:text-training-green"
                >
                  {title}
                </Link>
                <p className="mt-1 text-xs text-slate-500">
                  {[buyer, countryText, `Deadline: ${deadline}`].filter(Boolean).join(" · ")}
                </p>
                {summary ? <p className="mt-2 text-sm leading-relaxed text-slate-600">{summary}…</p> : null}
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav className="flex items-center justify-between py-6 text-sm">
          {page > 1 ? (
            <Link href={linkFor(page - 1)} className="font-bold text-training-green hover:underline">
              ← Previous
            </Link>
          ) : <span />}
          <span className="text-slate-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={linkFor(page + 1)} className="font-bold text-training-green hover:underline">
              Next →
            </Link>
          ) : <span />}
        </nav>
      ) : null}
    </EnglishShell>
  );
}
