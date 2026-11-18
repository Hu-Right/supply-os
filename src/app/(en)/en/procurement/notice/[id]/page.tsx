// i18n-allow-file: 英文站点，语言切换标签/中文对照按钮必须显示目标语言原文
/**
 * /en/procurement/notice/[id] — 英文公告详情（SEO 详情页，ISR 3600）
 *
 * 与中文详情页同一数据源与同一公开字段集（findSeoDetail：仅 preview 口径 + 300 字 teaser），
 * 独立 canonical + 与中文页双向 hreflang；过期公告 noindex。
 */
import type { Metadata } from "next";
import type { RowDataPacket } from "mysql2/promise";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnglishShell } from "../../../../shell";
import { getContext } from "@/lib/db/context";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { jsonLdScript } from "@/lib/services/seo/json-ld";
import { noticeTypeCodeLabel } from "@/shared/utils/notice-type";
import {
  formatNoticeCstDate,
  formatNoticeDate,
  resolveNoticeDeadlineTs,
  UNPUBLISHED_LABEL,
} from "@/shared/utils/notice-datetime/format";

export const revalidate = 3600;

interface NoticeSeoRow extends RowDataPacket {
  id: number;
  notice_id: string;
  reference: string | null;
  title: string;
  notice_type: string | null;
  agency: string | null;
  agency_full: string | null;
  country: string | null;
  deadline: string | null;
  deadline_ts: number | null;
  deadline_sec: number | null;
  deadline_state: string | null;
  effective_ts: number | null;
  deadline_timezone: string | null;
  timezone_source: string | null;
  estimated_value: string | null;
  published_date: string | null;
  description: string | null;
}

type PageProps = { params: Promise<{ id: string }> };

async function fetchNotice(id: number): Promise<NoticeSeoRow | null> {
  return (await getContext().notice.detailRepo.findSeoDetail(id)) as NoticeSeoRow | null;
}

function parseNoticeId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 && id <= 0xffffffff ? id : null;
}

function isExpired(row: NoticeSeoRow): boolean {
  const ts = resolveNoticeDeadlineTs({
    state: row.deadline_state,
    effectiveTs: row.effective_ts,
    fallbackSec: row.deadline_sec,
  });
  return ts !== null && ts <= Math.floor(Date.now() / 1000);
}

function deadlineLabel(row: NoticeSeoRow): string {
  const ts = resolveNoticeDeadlineTs({
    state: row.deadline_state,
    effectiveTs: row.effective_ts,
    fallbackSec: row.deadline_sec,
  });
  if (!ts) return UNPUBLISHED_LABEL;
  const d = new Date(ts * 1000);
  return formatNoticeCstDate(ts, d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0);
}

function summaryOf(row: NoticeSeoRow): string {
  const head = [row.agency || row.agency_full, row.country, noticeTypeCodeLabel(row.notice_type)]
    .filter(Boolean)
    .join(" · ");
  const teaser = (row.description || "").replace(/\s+/g, " ").trim().slice(0, 160);
  return teaser ? `${head}. ${teaser}…` : head;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id: raw } = await params;
  const id = parseNoticeId(raw);
  if (!id) return {};
  const row = await fetchNotice(id);
  if (!row) return {};

  const url = absoluteUrl(`/en/procurement/notice/${id}`);
  const summary = summaryOf(row);
  return {
    title: row.title,
    description: summary,
    alternates: {
      canonical: url,
      languages: {
        "en": url,
        "zh-CN": absoluteUrl(`/procurement/notice/${id}`),
        "x-default": absoluteUrl(`/procurement/notice/${id}`),
      },
    },
    ...(isExpired(row) ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: row.title,
      description: summary,
      url,
      type: "article",
      siteName: "Yunjing International Procurement Platform",
      ...(row.published_date ? { publishedTime: row.published_date } : {}),
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: row.title, description: summary, images: [DEFAULT_OG_IMAGE.url] },
  };
}

function MetaItem({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-800">{value}</dd>
    </div>
  );
}

export default async function EnglishNoticePage({ params }: PageProps) {
  const { id: raw } = await params;
  const id = parseNoticeId(raw);
  if (!id) notFound();

  const row = await fetchNotice(id);
  if (!row) notFound();

  const expired = isExpired(row);
  const url = absoluteUrl(`/en/procurement/notice/${id}`);
  const zhUrl = absoluteUrl(`/procurement/notice/${id}`);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/en") },
        { "@type": "ListItem", position: 2, name: "Procurement notices", item: absoluteUrl("/en/procurement") },
        { "@type": "ListItem", position: 3, name: row.title, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: row.title,
      url,
      description: summaryOf(row),
      inLanguage: "en",
      ...(row.published_date ? { datePublished: row.published_date } : {}),
      isPartOf: { "@type": "WebSite", name: "Yunjing International Procurement Platform", url: absoluteUrl("/en") },
    },
  ];

  return (
    <EnglishShell>
      <article className="mx-auto max-w-4xl space-y-6 py-2">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

        <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
          <ol className="flex flex-wrap items-center gap-2">
            <li><Link href="/en" className="hover:text-training-green">Home</Link></li>
            <li aria-hidden>/</li>
            <li><Link href="/en/procurement" className="hover:text-training-green">Procurement notices</Link></li>
            <li aria-hidden>/</li>
            <li className="max-w-[16rem] truncate text-slate-700" title={row.title}>Notice #{row.id}</li>
          </ol>
        </nav>

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {noticeTypeCodeLabel(row.notice_type) && (
              <span className="inline-block rounded-full bg-training-green/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-training-green">
                {noticeTypeCodeLabel(row.notice_type)}
              </span>
            )}
            {expired && (
              <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                Closed
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold leading-snug text-slate-900 sm:text-3xl">{row.title}</h1>
        </header>

        <dl className="grid grid-cols-2 gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-3">
          <MetaItem label="Buyer" value={row.agency || row.agency_full} />
          <MetaItem label="Buyer (full)" value={row.agency_full && row.agency_full !== row.agency ? row.agency_full : null} />
          <MetaItem label="Country" value={row.country} />
          <MetaItem label="Deadline" value={deadlineLabel(row)} />
          <MetaItem label="Published" value={formatNoticeDate(row.published_date)} />
          <MetaItem label="Notice reference" value={row.reference} />
          <MetaItem label="Budget / value" value={row.estimated_value} />
          <MetaItem label="Source ID" value={row.notice_id} />
        </dl>

        {row.description && (
          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">Summary</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{row.description}</p>
          </section>
        )}

        <section className="rounded-2xl border border-training-green/20 bg-training-green/5 p-6">
          <h2 className="text-base font-bold text-slate-900">View the full notice</h2>
          <p className="mt-1 text-sm text-slate-600">
            The complete description, contact details and procurement documents are available after signing in.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/procurement?notice_id=${row.id}`}
              className="rounded-lg bg-training-green px-5 py-2.5 text-sm font-bold text-white hover:bg-training-green-hover"
            >
              Open full notice
            </Link>
            <Link
              href="/en/procurement"
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-training-green/40 hover:text-training-green"
            >
              All notices
            </Link>
            <a
              href={zhUrl}
              hrefLang="zh-CN"
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-training-green/40 hover:text-training-green"
            >
              中文页面
            </a>
          </div>
        </section>
      </article>
    </EnglishShell>
  );
}
