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

export const revalidate = 3600;

/** 低于该公告数的国别页不进索引（薄页），但保留页面承接外链 */
const THIN_PAGE_MIN = 5;
/** 落地页列出的公告条数 */
const LIST_LIMIT = 24;

type PageProps = { params: Promise<{ slug: string }> };

function countryLabel(c: CountryLanding): string {
  return c.nameZh ?? c.name;
}

function deadlineLabel(sec: number | null): string {
  return sec ? `截止 ${formatNoticeCstDate(sec)}` : "长期有效";
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const country = await findCountryLanding(slug).catch(() => null);
  if (!country) return {};

  const label = countryLabel(country);
  const url = absoluteUrl(`/procurement/country/${country.slug}`);
  const title = `${label}政府采购与招标公告`;
  const description = `${label}当前有 ${country.count.toLocaleString("zh-CN")} 条有效采购公告（联合国机构、政府与国际组织），按更新时间倒序展示最新商机与截止时间。`;

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

  let notices: CountryNoticeRow[] = [];
  try {
    notices = await fetchCountryNotices(country.name, LIST_LIMIT);
  } catch (err) {
    console.error("[country] 国别公告列表装载失败:", (err as Error).message);
  }

  const [all] = await Promise.all([listCountryLandings().catch(() => [] as CountryLanding[])]);
  const related = all.filter((c) => c.slug !== country.slug && c.count >= THIN_PAGE_MIN).slice(0, 12);

  const url = absoluteUrl(`/procurement/country/${country.slug}`);
  const label = countryLabel(country);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首页", item: absoluteUrl("") },
        { "@type": "ListItem", position: 2, name: "全球商机", item: absoluteUrl("/procurement") },
        { "@type": "ListItem", position: 3, name: "按国家浏览", item: absoluteUrl("/procurement/countries") },
        { "@type": "ListItem", position: 4, name: label, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${label}政府采购与招标公告`,
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

      <nav aria-label="面包屑" className="text-sm text-slate-500">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="hover:text-training-green">首页</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/procurement" className="hover:text-training-green">全球商机</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/procurement/countries" className="hover:text-training-green">按国家浏览</Link></li>
          <li aria-hidden>/</li>
          <li className="text-slate-700">{label}</li>
        </ol>
      </nav>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{label}政府采购与招标公告</h1>
        <p className="text-sm leading-relaxed text-slate-600">
          当前涉及该国的有效公告 {country.count.toLocaleString("zh-CN")} 条（{country.name}）。
          下方按入库时间列出最新一批，可在
          <Link
            href={`/procurement?country=${encodeURIComponent(country.name)}`}
            className="mx-1 text-training-green hover:underline"
          >
            公告搜索
          </Link>
          中按品目、机构、截止时间继续筛选。
        </p>
        {notices.length < Math.min(country.count, LIST_LIMIT) && (
          <p className="text-xs text-slate-400">
            差额部分为「多国联合发布」的公告：国家字段是一串国家名，无法单独定位到某一国，
            可在公告搜索中按关键词查看。
          </p>
        )}
      </header>

      {notices.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          该国家当前没有可展示的有效公告，可先浏览其他国别。
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
                <span>{deadlineLabel(n.deadline_sec)}</span>
                {n.published_date && <span>发布 {formatNoticeDate(n.published_date)}</span>}
              </p>
            </li>
          ))}
        </ul>
      )}

      {related.length > 0 && (
        <section aria-labelledby="related-countries" className="space-y-2">
          <h2 id="related-countries" className="text-base font-bold text-slate-900">其他国家</h2>
          <ul className="flex flex-wrap gap-2">
            {related.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/procurement/country/${c.slug}`}
                  className="inline-block rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-training-green/40 hover:text-training-green"
                >
                  {countryLabel(c)} · {c.count.toLocaleString("zh-CN")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
