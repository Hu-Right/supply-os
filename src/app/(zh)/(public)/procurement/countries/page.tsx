// i18n-allow-file: SEO 国别聚合落地页（ISR 3600），中文为主站索引语言；本地化需 locale 化路由架构
/**
 * /procurement/countries — 国别聚合索引页
 *
 * 承接「巴西 招标 / 法国 政府采购」这类稳定国别词，并把权重分发到
 * /procurement/country/[slug] 与公告详情页（此前这些页面之间没有任何内链）。
 * 计数与检索侧同口径（country_aliases 归一后的有效公告数）。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { jsonLdScript, SITE_ENTITY } from "@/lib/services/seo/json-ld";
import { listCountryLandings, type CountryLanding } from "@/lib/services/seo/landing";
import { getServerLocale } from "@/lib/i18n/server";

export const revalidate = 3600;

const HUB_PATH = "/procurement/countries";

export const metadata: Metadata = {
  title: "按国家浏览全球采购公告",
  description:
    "按国家浏览联合国、世界银行及各国政府的有效招标与采购公告，实时统计各国有多少条在挂公告，可直接进入国别列表查看最新商机。",
  alternates: { canonical: absoluteUrl(HUB_PATH) },
  openGraph: {
    title: "云境·国际采购平台 | 按国家浏览全球采购公告",
    description: "按国家浏览有效招标公告，实时统计各国在挂公告数量。",
    url: absoluteUrl(HUB_PATH),
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

async function loadCountries(): Promise<CountryLanding[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") return [];
  try {
    return await listCountryLandings();
  } catch (err) {
    console.error("[countries] 国别聚合页装载失败:", (err as Error).message);
    return [];
  }
}

function countryLabel(c: CountryLanding, isZh: boolean): string {
  if (!isZh) return c.name;
  return c.nameZh ? `${c.nameZh}（${c.name}）` : c.name;
}

export default async function CountriesHubPage() {
  const locale = await getServerLocale();
  const isZh = locale === "zh";
  const num = (n: number) => n.toLocaleString(isZh ? "zh-CN" : "en-US");
  const countries = await loadCountries();
  const total = countries.reduce((sum, c) => sum + c.count, 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: isZh ? "按国家浏览全球采购公告" : "Browse global procurement notices by country",
    url: absoluteUrl(HUB_PATH),
    isPartOf: { "@type": "WebSite", name: SITE_ENTITY.name, url: SITE_ENTITY.url },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: countries.length,
      itemListElement: countries.slice(0, 20).map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: countryLabel(c, isZh),
        url: absoluteUrl(`/procurement/country/${c.slug}`),
      })),
    },
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <nav aria-label={isZh ? "面包屑" : "Breadcrumb"} className="text-sm text-slate-500">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="hover:text-training-green">{isZh ? "首页" : "Home"}</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/procurement" className="hover:text-training-green">{isZh ? "全球商机" : "Global opportunities"}</Link></li>
          <li aria-hidden>/</li>
          <li className="text-slate-700">{isZh ? "按国家浏览" : "By country"}</li>
        </ol>
      </nav>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          {isZh ? "按国家浏览全球采购公告" : "Browse global procurement notices by country"}
        </h1>
        <p className="text-sm leading-relaxed text-slate-600">
          {isZh
            ? `共 ${num(countries.length)} 个国家/地区，国别计数合计 ${num(total)} 条（同一公告涉及多国时按国别重复计入）。点击国家可查看该国最新公告，也可回到`
            : `${num(countries.length)} countries/regions, ${num(total)} country-level counts (a notice spanning multiple countries is counted in each). Click a country to view its latest notices, or go back to`}
          <Link href="/procurement" className="mx-1 text-training-green hover:underline">
            {isZh ? "公告搜索" : "notice search"}
          </Link>
          {isZh ? "按品目、机构、截止时间组合筛选。" : "to filter by commodity, agency and deadline."}
        </p>
      </header>

      {countries.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          {isZh ? "暂无可展示的国别数据，请稍后刷新。" : "No country data is available yet. Please refresh later."}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {countries.map((c) => (
            <li key={c.slug} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <Link
                href={`/procurement/country/${c.slug}`}
                className="flex items-baseline justify-between gap-2 text-sm font-semibold text-slate-800 hover:text-training-green"
              >
                <span>{countryLabel(c, isZh)}</span>
                <span className="shrink-0 text-xs font-normal text-slate-500">
                  {num(c.count)} {isZh ? "条" : "notices"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-slate-400">
        {isZh
          ? "统计口径：截止时间未过（或无截止日）的已审核公告；同一国家存在多种写法时按国别别名表归一后合并计数。"
          : "Counting basis: reviewed notices whose deadline has not passed (or has no deadline); multiple spellings of the same country are merged through the country alias table."}
      </p>
    </div>
  );
}
