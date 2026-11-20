// i18n-allow-file: SEO 国别落地页（ISR 3600），中文为主站索引语言；本地化需 locale 化路由架构
/**
 * /procurement/country/[slug] — 国别聚合落地页
 *
 * 每条公告只能覆盖一个公告词，「巴西 招标」这类国别词需要稳定的聚合入口。
 * 计数与筛选口径 = 检索侧的国别别名归一 + ACTIVE_NOTICE_WHERE，不另写一套。
 * 公告数过少的国家（< THIN_PAGE_MIN）仍可访问，但 noindex：避免薄页被收录。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { jsonLdScript, SITE_ENTITY } from "@/lib/services/seo/json-ld";
import {
  listCountryLandings,
  findCountryLanding,
  fetchCountryNotices,
  type CountryLanding,
  type CountryNoticeRow,
} from "@/lib/services/seo/landing";
import { formatNoticeCstDate, formatNoticeDate } from "@/shared/utils/notice-datetime/format";
import { getServerLocale } from "@/lib/i18n/server";

export const revalidate = 3600;

/** 低于该公告数的国别页不进索引（薄页），但保留页面承接外链 */
const THIN_PAGE_MIN = 5;
/** 落地页列出的公告条数 */
const LIST_LIMIT = 24;

type PageProps = { params: Promise<{ slug: string }> };

function countryLabel(c: CountryLanding, isZh: boolean): string {
  return isZh ? c.nameZh ?? c.name : c.name;
}

function deadlineLabel(sec: number | null, isZh: boolean): string {
  if (!sec) return isZh ? "长期有效" : "Open-ended";
  return isZh ? `截止 ${formatNoticeCstDate(sec)}` : `Deadline ${formatNoticeCstDate(sec)}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const country = await findCountryLanding(slug).catch(() => null);
  if (!country) return {};

  const locale = await getServerLocale();
  const isZh = locale === "zh";
  const label = countryLabel(country, isZh);
  const url = absoluteUrl(`/procurement/country/${country.slug}`);
  const title = isZh ? `${label}政府采购与招标公告` : `${label} government procurement and tender notices`;
  const description = isZh
    ? `${label}当前有 ${country.count.toLocaleString("zh-CN")} 条有效采购公告（联合国机构、政府与国际组织），按更新时间倒序展示最新商机与截止时间。`
    : `${country.count.toLocaleString("en-US")} active procurement notices for ${label} (UN agencies, governments and international organisations), ordered by latest update with deadlines.`;

  return {
    title,
    description,
    alternates: { canonical: url },
    ...(country.count < THIN_PAGE_MIN ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: `${SITE_ENTITY.name} | ${title}`,
      description,
      url,
      type: "website",
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function CountryLandingPage({ params }: PageProps) {
  const { slug } = await params;
  const country = await findCountryLanding(slug).catch(() => null);
  if (!country) notFound();

  const locale = await getServerLocale();
  const isZh = locale === "zh";
  const num = (n: number) => n.toLocaleString(isZh ? "zh-CN" : "en-US");

  let notices: CountryNoticeRow[] = [];
  try {
    notices = await fetchCountryNotices(country.name, LIST_LIMIT);
  } catch (err) {
    console.error("[country] 国别公告列表装载失败:", (err as Error).message);
  }

  const [all] = await Promise.all([listCountryLandings().catch(() => [] as CountryLanding[])]);
  const related = all.filter((c) => c.slug !== country.slug && c.count >= THIN_PAGE_MIN).slice(0, 12);

  const url = absoluteUrl(`/procurement/country/${country.slug}`);
  const label = countryLabel(country, isZh);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: isZh ? "首页" : "Home", item: absoluteUrl("") },
        { "@type": "ListItem", position: 2, name: isZh ? "全球商机" : "Global opportunities", item: absoluteUrl("/procurement") },
        { "@type": "ListItem", position: 3, name: isZh ? "按国家浏览" : "By country", item: absoluteUrl("/procurement/countries") },
        { "@type": "ListItem", position: 4, name: label, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: isZh ? `${label}政府采购与招标公告` : `${label} government procurement and tender notices`,
      url,
      isPartOf: { "@type": "WebSite", name: SITE_ENTITY.name, url: SITE_ENTITY.url },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: notices.length,
        itemListElement: notices.map((n, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: n.title,
          url: absoluteUrl(`/procurement/notice/${n.id}`),
        })),
      },
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <nav aria-label={isZh ? "面包屑" : "Breadcrumb"} className="text-sm text-slate-500">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="hover:text-training-green">{isZh ? "首页" : "Home"}</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/procurement" className="hover:text-training-green">{isZh ? "全球商机" : "Global opportunities"}</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/procurement/countries" className="hover:text-training-green">{isZh ? "按国家浏览" : "By country"}</Link></li>
          <li aria-hidden>/</li>
          <li className="text-slate-700">{label}</li>
        </ol>
      </nav>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          {isZh ? `${label}政府采购与招标公告` : `${label} government procurement and tender notices`}
        </h1>
        <p className="text-sm leading-relaxed text-slate-600">
          {isZh
            ? `当前涉及该国的有效公告 ${num(country.count)} 条（${country.name}）。下方按入库时间列出最新一批，可在`
            : `${num(country.count)} active notices currently involve this country (${country.name}). The latest batch is listed below; continue filtering in`}
          <Link
            href={`/procurement?country=${encodeURIComponent(country.name)}`}
            className="mx-1 text-training-green hover:underline"
          >
            {isZh ? "公告搜索" : "notice search"}
          </Link>
          {isZh ? "中按品目、机构、截止时间继续筛选。" : "by commodity, agency and deadline."}
        </p>
        {notices.length < Math.min(country.count, LIST_LIMIT) && (
          <p className="text-xs text-slate-400">
            {isZh
              ? "差额部分为「多国联合发布」的公告：国家字段是一串国家名，无法单独定位到某一国，可在公告搜索中按关键词查看。"
              : "The difference comes from multi-country notices whose country field lists several countries; search by keyword to find them."}
          </p>
        )}
      </header>

      {notices.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          {isZh ? "该国家当前没有可展示的有效公告，可先浏览其他国别。" : "No active notices for this country right now; browse other countries instead."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {notices.map((n) => (
            <li key={n.id} className="px-5 py-4">
              <Link
                href={`/procurement/notice/${n.id}`}
                className="block text-sm font-semibold leading-snug text-slate-800 hover:text-training-green"
              >
                {n.title}
              </Link>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                {n.agency && <span>{n.agency}</span>}
                <span>{deadlineLabel(n.deadline_sec, isZh)}</span>
                {n.published_date && <span>{isZh ? "发布" : "Published"} {formatNoticeDate(n.published_date)}</span>}
              </p>
            </li>
          ))}
        </ul>
      )}

      {related.length > 0 && (
        <section aria-labelledby="related-countries" className="space-y-2">
          <h2 id="related-countries" className="text-base font-bold text-slate-900">{isZh ? "其他国家" : "Other countries"}</h2>
          <ul className="flex flex-wrap gap-2">
            {related.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/procurement/country/${c.slug}`}
                  className="inline-block rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-training-green/40 hover:text-training-green"
                >
                  {countryLabel(c, isZh)} · {num(c.count)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
