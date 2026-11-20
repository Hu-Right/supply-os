// i18n-allow-file: SEO 品目聚合落地页（ISR 3600），中文为主站索引语言；本地化需 locale 化路由架构
/**
 * /procurement/industries — 品目大类聚合索引页
 *
 * 数据源 = hot-topics 的骨架 L1「包含」口径（标称数 = 点进去搜索能兑现的条数），
 * 不新写聚合 SQL，也不退回旧品类字典。点击进入 /procurement?commodity=CODE 组合筛选。
 *
 * 为什么不给每个品目做独立详情页：notice_search.backbone_path 无可用索引，
 * 单条详情页需要对该列做全表 FIND_IN_SET 扫描（实测 3.3s/次），
 * 数量级上不适合按页缓存；列表能力已由 /procurement 承担。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { jsonLdScript, SITE_ENTITY } from "@/lib/services/seo/json-ld";
import { listIndustryLandings } from "@/lib/services/seo/landing";
import { getServerLocale } from "@/lib/i18n/server";
import type { HotGroupItem } from "@/lib/services/notice-search/hot-topics";

export const revalidate = 3600;

const HUB_PATH = "/procurement/industries";

export const metadata: Metadata = {
  title: "按品目分类浏览全球采购公告",
  description:
    "按品目大类（工程、货物、服务等 32 个骨架分类）浏览有效国际采购公告，展示每个大类当前在挂公告数量，可直接进入对应品目的商机列表。",
  alternates: { canonical: absoluteUrl(HUB_PATH) },
  openGraph: {
    title: "云境·国际采购平台 | 按品目分类浏览采购公告",
    description: "32 个品目大类，实时展示每类在挂公告数量。",
    url: absoluteUrl(HUB_PATH),
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

async function loadGroups(): Promise<HotGroupItem[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") return [];
  try {
    return await listIndustryLandings();
  } catch (err) {
    console.error("[industries] 品目聚合页装载失败:", (err as Error).message);
    return [];
  }
}

export default async function IndustriesHubPage() {
  const locale = await getServerLocale();
  const isZh = locale === "zh";
  const num = (n: number) => n.toLocaleString(isZh ? "zh-CN" : "en-US");
  const groups = await loadGroups();
  const total = groups.reduce((sum, g) => sum + g.count, 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: isZh ? "按品目分类浏览全球采购公告" : "Browse global procurement notices by commodity category",
    url: absoluteUrl(HUB_PATH),
    isPartOf: { "@type": "WebSite", name: SITE_ENTITY.name, url: SITE_ENTITY.url },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: groups.length,
      itemListElement: groups.map((g, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: g.nameZh,
        url: absoluteUrl(`/procurement?commodity=${encodeURIComponent(g.code)}`),
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
          <li><Link href="/procurement" className="hover:text-training-green">{isZh ? "全球商机" : "Global opportunities"}</Link></li>
          <li aria-hidden>/</li>
          <li className="text-slate-700">{isZh ? "按品目分类浏览" : "By commodity"}</li>
        </ol>
      </nav>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          {isZh ? "按品目分类浏览全球采购公告" : "Browse global procurement notices by commodity category"}
        </h1>
        <p className="text-sm leading-relaxed text-slate-600">
          {isZh
            ? `共 ${num(groups.length)} 个品目大类、${num(total)} 条在挂公告。数量按「包含」口径统计：一条公告挂在多个大类下时，每个大类都会计入，点进任一大类看到的就是该数字对应的公告。`
            : `${num(groups.length)} commodity groups, ${num(total)} active notices. Counts use the "contains" basis: a notice attached to multiple groups counts in each, and clicking a group shows exactly those notices.`}
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          {isZh ? "暂无品目聚合数据，请稍后刷新。" : "No commodity data is available yet. Please refresh later."}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {groups.map((g) => (
            <li key={g.code} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <Link
                href={`/procurement?commodity=${encodeURIComponent(g.code)}`}
                className="flex items-baseline justify-between gap-2 text-sm font-semibold text-slate-800 hover:text-training-green"
              >
                <span>{g.nameZh}</span>
                <span className="shrink-0 text-xs font-normal text-slate-500">
                  {num(g.count)} {isZh ? "条" : "notices"}
                </span>
              </Link>
              <p className="mt-0.5 text-xs text-slate-400">{g.code}</p>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-slate-400">
        {isZh
          ? "品目分类采用平台骨架编码（UGT-），与公告搜索的品目级联筛选同源。"
          : "Commodity categories use the platform backbone codes (UGT-), the same source as the notice search commodity filter."}
      </p>
    </div>
  );
}
