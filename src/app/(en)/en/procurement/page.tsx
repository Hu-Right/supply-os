/**
 * /en/procurement — 英文公告列表（SEO 落地页，ISR 3600）
 *
 * 与中文 /procurement 同一数据源（最新有效公告，ACTIVE_NOTICE_WHERE 口径），
 * 服务端直出真实内链，供无 JS 渲染能力的爬虫抓取。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { EnglishShell } from "../../shell";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { fetchLatestActiveNotices, type LatestNoticeRow } from "@/lib/services/seo/latest-notices";
import { formatNoticeCstDate } from "@/shared/utils/notice-datetime/format";

export const revalidate = 3600;

const LIST_LIMIT = 30;

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

function deadlineLabel(sec: number | null): string {
  return sec ? `Deadline ${formatNoticeCstDate(sec)}` : "No fixed deadline";
}

async function loadNotices(): Promise<LatestNoticeRow[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") return [];
  try {
    return await fetchLatestActiveNotices(undefined, LIST_LIMIT);
  } catch (err) {
    console.error("[en/procurement] notices failed:", (err as Error).message);
    return [];
  }
}

export default async function EnglishProcurementPage() {
  const notices = await loadNotices();

  return (
    <EnglishShell>
      <header className="space-y-2 py-4">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Live government and UN procurement notices</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          The latest {notices.length} active notices, newest first. For country, category and deadline filters,
          use the{" "}
          <Link href="/procurement" className="text-training-green hover:underline">
            full search
          </Link>
          .
        </p>
      </header>

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
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                {n.agency && <span>{n.agency}</span>}
                {n.country && <span>{n.country}</span>}
                <span>{deadlineLabel(n.deadline_sec)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </EnglishShell>
  );
}
