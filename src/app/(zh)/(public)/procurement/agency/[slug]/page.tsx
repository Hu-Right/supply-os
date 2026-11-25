// i18n-allow-file: 中文 SEO 聚合页，文案随案例/机构固定
/**
 * /procurement/agency/[slug] — 采购机构聚合页（GEO 可引用资产）
 *
 * @description 机构介绍 + 最新有效公告 + 官网入口，承接「UNICEF 采购公告」类提问。
 *              机构名作为 slug（URL 编码）；只展示公开列表字段。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPool } from "@/lib/db/pool";
import { searchUnified } from "@/lib/services/search-orchestrator";
import { toNoticeListView } from "@/lib/services/notice-public/view";
import { maskTranslationFieldList } from "@/lib/services/notice-public/translation-access";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { jsonLdScript } from "@/lib/services/seo/json-ld";
import { formatNoticeCstDate } from "@/shared/utils/notice-datetime/format";
import { getServerLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

function decodeAgency(slug: string): string {
  try {
    return decodeURIComponent(slug).replace(/\+/g, " ").trim();
  } catch {
    return "";
  }
}

async function loadAgency(agency: string) {
  const result = await searchUnified(getPool(), {
    mode: "default",
    agency,
    page: 1,
    pageSize: 20,
    sort: "latest",
    locale: "zh",
  });
  const items = toNoticeListView(result.items);
  maskTranslationFieldList(items);
  return { items, total: result.total };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const agency = decodeAgency(slug);
  const title = agency ? `${agency} 采购公告` : "采购机构";
  const description = agency
    ? `查看 ${agency} 的最新有效采购公告、采购品类与截止时间。数据来自公开采购门户，官方公告为准。`
    : "按采购机构浏览全球采购公告。";
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(`/procurement/agency/${encodeURIComponent(agency)}`) },
    openGraph: {
      title: `${title} | 云境·国际采购平台`,
      description,
      url: absoluteUrl(`/procurement/agency/${encodeURIComponent(agency)}`),
      type: "website",
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function AgencyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agency = decodeAgency(slug);
  if (!agency) notFound();
  const isZh = (await getServerLocale()) === "zh";
  const { items, total } = await loadAgency(agency).catch(() => ({ items: [], total: 0 }));
  if (total === 0) notFound();

  const url = absoluteUrl(`/procurement/agency/${encodeURIComponent(agency)}`);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${agency} 采购公告`,
    url,
    inLanguage: "zh",
    isPartOf: { "@type": "WebSite", name: "云境·国际采购平台", url: absoluteUrl("") },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: total,
      itemListElement: items.slice(0, 20).map((n, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: n.titleCn || n.title,
        url: absoluteUrl(`/procurement/notice/${n.noticePk}`),
      })),
    },
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <nav aria-label={isZh ? "面包屑" : "Breadcrumb"} className="text-sm text-slate-500">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="hover:text-training-green">{isZh ? "首页" : "Home"}</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/procurement" className="hover:text-training-green">{isZh ? "全球商机" : "Notices"}</Link></li>
          <li aria-hidden>/</li>
          <li className="text-slate-700">{agency}</li>
        </ol>
      </nav>

      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-training-green">{isZh ? "采购机构" : "Buyer agency"}</p>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{agency} 采购公告</h1>
        <p className="text-sm leading-relaxed text-slate-600">
          当前有 <strong>{total.toLocaleString("zh-CN")}</strong> 条有效公告。以下为最新 20 条；点击进入公告页查看要点、截止时间与公开摘要。
        </p>
      </header>

      <section className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {items.map((n) => {
          const title = n.titleCn || n.title;
          const deadline = n.deadlineTs ? formatNoticeCstDate(Number(n.deadlineTs), true) : "无固定截止";
          return (
            <article key={n.noticePk} className="px-4 py-3">
              <Link href={`/procurement/notice/${n.noticePk}`} className="text-sm font-bold leading-snug text-slate-900 hover:text-training-green">
                {title}
              </Link>
              <p className="mt-1 text-xs text-slate-500">
                {[n.buyerName, n.countryCode, `截止 ${deadline}`].filter(Boolean).join(" · ")}
              </p>
            </article>
          );
        })}
      </section>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href={`/procurement?agency=${encodeURIComponent(agency)}`} className="rounded-lg bg-training-green px-4 py-2 font-bold text-white hover:bg-training-green-hover">
          在商机库中筛选该机构
        </Link>
        <Link href="/procurement" className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-bold text-slate-700 hover:border-training-green/40 hover:text-training-green">
          浏览全部公告
        </Link>
      </div>
    </div>
  );
}
