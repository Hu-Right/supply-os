/**
 * /procurement/notice/[id] — 公告 SEO 详情页
 *
 * @module app/(public)/procurement/notice/[id]
 * @description 12.7 万公告的自然流量入口：每条公告获得独立路径 + 独立
 *              title/description/OG + JSON-LD，取代 sitemap 中共享 canonical
 *              的 /procurement?notice_id=X 查询参数 URL（全部被搜索引擎视为
 *              /procurement 的重复页）。
 *
 *              付费边界（SSR HTML 对爬虫与未登录用户可见，必须守住）：
 *              仅渲染 findSeoDetail 字段集 —— preview 口径公开字段 +
 *              与搜索列表同口径的 LEFT(description, 300) teaser。
 *              全文描述/联系人/文档档位内容只存在于解锁后的 API 路径。
 *
 *              无 generateStaticParams：12.7 万条按需生成（dynamicParams
 *              默认 true），ISR 3600s。
 */
import type { Metadata } from "next";
import type { RowDataPacket } from "mysql2/promise";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/db/context";
import { absoluteUrl } from "@/lib/services/seo/site";

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
  estimated_value: string | null;
  published_date: string | null;
  description: string | null;
}

async function fetchNotice(id: number): Promise<NoticeSeoRow | null> {
  const ctx = getContext();
  return (await ctx.notice.detailRepo.findSeoDetail(id)) as NoticeSeoRow | null;
}

function parseNoticeId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 && id <= 0xffffffff ? id : null;
}

/** 截止日期：优先源数据原始串（含时区语义最完整），回退 deadline_sec 格式化 */
function formatDeadline(row: NoticeSeoRow): string {
  if (row.deadline && row.deadline.trim()) return row.deadline.trim();
  if (row.deadline_sec && row.deadline_sec > 0) {
    return new Date(row.deadline_sec * 1000).toISOString().slice(0, 10);
  }
  return "No deadline (open)";
}

function buildSummary(row: NoticeSeoRow): string {
  const parts = [
    row.agency || row.agency_full,
    row.country,
    row.notice_type ? `${row.notice_type} notice` : "procurement notice",
  ].filter(Boolean);
  const head = parts.join(" · ");
  const teaser = (row.description || "").replace(/\s+/g, " ").trim().slice(0, 160);
  return teaser ? `${head}. ${teaser}…` : head;
}

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id: raw } = await params;
  const id = parseNoticeId(raw);
  if (!id) return {};
  const row = await fetchNotice(id);
  if (!row) return {};

  const url = absoluteUrl(`/procurement/notice/${id}`);
  const summary = buildSummary(row);
  return {
    title: row.title,
    description: summary,
    alternates: { canonical: url },
    openGraph: {
      title: row.title,
      description: summary,
      url,
      type: "article",
      siteName: "Supply OS",
    },
    twitter: {
      card: "summary",
      title: row.title,
      description: summary,
    },
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

export default async function NoticeSeoPage({ params }: PageProps) {
  const { id: raw } = await params;
  const id = parseNoticeId(raw);
  if (!id) notFound();

  const row = await fetchNotice(id);
  if (!row) notFound();

  const deadline = formatDeadline(row);
  const url = absoluteUrl(`/procurement/notice/${id}`);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/showroom") },
        { "@type": "ListItem", position: 2, name: "Procurement Notices", item: absoluteUrl("/procurement") },
        { "@type": "ListItem", position: 3, name: row.title, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: row.title,
      url,
      description: buildSummary(row),
      isPartOf: { "@type": "WebSite", name: "Supply OS", url: absoluteUrl("") },
    },
  ];

  return (
    <article className="mx-auto max-w-4xl space-y-6 py-4">
      {/* JSON-LD 防注入（审查 F43）：标题等来自采集数据，`</script>` 可闭合标签
          执行任意 JS；JSON.stringify 不转义 <，必须替换为 unicode 转义 */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      {/* 面包屑 */}
      <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/showroom" className="hover:text-training-green">Home</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/procurement" className="hover:text-training-green">Procurement Notices</Link></li>
          <li aria-hidden>/</li>
          <li className="max-w-[16rem] truncate text-slate-700" title={row.title}>Notice #{row.id}</li>
        </ol>
      </nav>

      {/* 标题 + 类型徽标 */}
      <header className="space-y-3">
        {row.notice_type && (
          <span className="inline-block rounded-full bg-training-green/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-training-green">
            {row.notice_type}
          </span>
        )}
        <h1 className="text-2xl font-bold leading-snug text-slate-900 sm:text-3xl">{row.title}</h1>
      </header>

      {/* 公开元信息 */}
      <dl className="grid grid-cols-2 gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-3">
        <MetaItem label="Agency" value={row.agency || row.agency_full} />
        <MetaItem label="Full Agency" value={row.agency_full && row.agency_full !== row.agency ? row.agency_full : null} />
        <MetaItem label="Country" value={row.country} />
        <MetaItem label="Deadline" value={deadline} />
        <MetaItem label="Published" value={row.published_date} />
        <MetaItem label="Reference" value={row.reference} />
        <MetaItem label="Est. Value" value={row.estimated_value} />
        <MetaItem label="Source ID" value={row.notice_id} />
      </dl>

      {/* 公开 teaser（与搜索列表 300 字符同口径） */}
      {row.description && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-slate-900">Notice Overview</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{row.description}</p>
        </section>
      )}

      {/* 解锁 CTA —— 完整公告内容/联系人/文档需登录解锁 */}
      <section className="rounded-2xl border border-training-green/20 bg-training-green/5 p-6">
        <h2 className="text-base font-bold text-slate-900">View the full notice</h2>
        <p className="mt-1 text-sm text-slate-600">
          Full description, contacts and procurement documents are available to signed-in members.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/procurement?notice_id=${row.id}`}
            className="rounded-lg bg-training-green px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-training-green-hover"
          >
            Open notice details
          </Link>
          <Link
            href="/procurement"
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:border-training-green/40 hover:text-training-green"
          >
            Search all notices
          </Link>
        </div>
      </section>
    </article>
  );
}
