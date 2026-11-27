// i18n-allow-file: SEO 落地页的 title/description 以中文主站语言硬编码；本地化需 locale 化路由架构，见 i18n 覆盖报告
/**
 * /procurement — 动态渲染（force-dynamic）
 *
 * 交互搜索层由客户端接管（PageClient）。
 *
 * 国别入口（2026-11-25 · GEO B 路线）：`?country=` 单独出现时，本页就是该国的国别页——
 * 输出独立的 title/description，并把 canonical 指向归一后的国家名（德国 / DE / Germany
 * 三种写法都收敛到同一个 URL）。这样做的前提是「搜索页自己可被收录」，从而不必再维护
 * 一套并行的 /procurement/country/{slug} 落地页（那 109 个页将 301 到本页后下线）。
 * 叠加任一其他筛选（关键词/品目/截止/预算…）即退回泛化 metadata，避免组合筛选进入索引。
 *
 * [2026-11-18 移除] 底部曾有一个「最新国际采购公告」服务端内链区块
 * （LatestNoticeLinks，按主表 `update_time DESC` 取 30 条）。删除原因：
 * 1) `bid_notices.update_time` 存在 `YYYYMMDDHHMMSS` 形态脏值（如 20261030012753），
 *    按它倒序会把 BOAMP 的「动态采购系统/框架协议」行（截止 2031~2037 年）顶到最前，
 *    页面看起来像“最新公告全是法国 2033 年截标的”，实际是排序字段错误；
 * 2) 该区块与上方搜索区内容重复，且页面已有 sitemap 与详情页入口，SEO 收益有限。
 * 若后续要恢复内链区块，必须先修正 update_time 口径（改用 create_time/发布时间）再上线。
 */
import type { Metadata } from "next";
import PageClient from "./page-client";
import { loadProcurementInitial } from "./initial-data";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { BROWSER_TITLE } from "@/lib/i18n/metadata";
import { countryName, guessCountryCode } from "@/shared/constants/countries";
import { countryParam } from "@/lib/services/seo/country-slug";
import { getContext } from "@/lib/db/context";
import { buildCountryNameMaps } from "@/lib/services/country/alias-store";
import type { SearchResultsInitial } from "@/features/procurement/hooks/search/useSearchResults";

export const dynamic = "force-dynamic";

/**
 * 会与 country 组合的筛选键：任一存在即视为「组合筛选页」，不做国别化。
 *
 * `sort` / `match_mode` 不在此列——它们只改变顺序与匹配方式，不改变「这一页是哪国」的语义。
 */
const OTHER_FILTER_KEYS = [
  "q",
  "deadline_from",
  "deadline_to",
  "deadline_within_days",
  "notice_type",
  "featured",
  "budget_min",
  "budget_max",
  "commodity",
] as const;

type SearchParamsRecord = Record<string, string | string[] | undefined>;

/**
 * 判定这一页算不算「国别页」，是则返回 ISO2 码。
 *
 * 用静态别名表 `guessCountryCode` 归一（德国 / DE / Germany → DE），不查库：
 * generateMetadata 里加一次 DB 往返会让每个请求都多一跳，而这张表已覆盖中英与 ISO 码。
 * 归一不出国家（如德国语的 Deutschland）一律返回 null —— 宁可当泛化页，也不编造 canonical。
 */
function soleCountryOf(params: SearchParamsRecord): string | null {
  if (OTHER_FILTER_KEYS.some((key) => params[key])) return null;
  const raw = params.country;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return guessCountryCode(raw);
}

/** 国别化 metadata 的标题后缀：根 layout 的 title.template 会把站名拼在前面 */
const countryTitle = (nameZh: string) => `${nameZh}政府采购与招标公告`;

const BASE_METADATA: Metadata = {
  // 只写页面名：网站名由根 layout 的 title.template 拼在首位
  title: "全球采购公告搜索",
  description: "云境·国际采购平台：搜索联合国机构、各国政府及国际组织的招标与采购公告，支持按国家、行业（品目分类）、机构筛选。",
  openGraph: {
    title: BROWSER_TITLE.zh,
    description: "联合国、世界银行、各国政府招标信息一站式搜索，按国家/行业/机构精准筛选。",
    url: absoluteUrl("/procurement"),
    type: "website",
    siteName: "云境·国际采购平台",
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: BROWSER_TITLE.zh,
    description: "联合国、世界银行、各国政府招标信息一站式搜索，按国家/行业/机构精准筛选。",
    images: [DEFAULT_OG_IMAGE.url],
  },
  alternates: {
    canonical: absoluteUrl("/procurement"),
    // 全站单语（ADR-0024）：/en 已下线，仅保留 zh-CN 与 x-default
    languages: {
      "zh-CN": absoluteUrl("/procurement"),
      "x-default": absoluteUrl("/procurement"),
    },
  },
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}): Promise<Metadata> {
  const code = soleCountryOf(await searchParams);
  if (!code) return BASE_METADATA;

  const nameZh = countryName(code, "zh");
  const nameEn = countryName(code, "en");
  if (!nameZh || !nameEn) return BASE_METADATA;

  // 取值用国家码（PS/CD 例外给标准名，见 country-slug）：站内所有国别链接与 canonical 逐字一致
  const url = absoluteUrl(`/procurement?country=${encodeURIComponent(countryParam(code))}`);
  const title = countryTitle(nameZh);
  const description = `浏览 ${nameZh}（${nameEn}）当前有效的政府采购、联合国机构与国际组织招标公告，可按品目、采购方式、预算与截止时间筛选。公告内容以采购机构官方原文为准。`;

  return {
    title,
    description,
    // 只声明自身：英文站的国别筛选并没有对应页面，声明 en 会制造悬空 hreflang
    alternates: { canonical: url },
    openGraph: {
      title: `${title} | 云境·国际采购平台`,
      description,
      url,
      type: "website",
      siteName: "云境·国际采购平台",
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_OG_IMAGE.url],
    },
  };
}

/**
 * 国别页的 CollectionPage + ItemList 结构化数据。
 *
 * 只描述页面上**已经存在**的东西：页面标题里的国别名、canonical URL、服务端直出的前 10 条公告。
 * 不承载任何统计字段（在挂量/截止量/采购类型/主要采购方）——那些数据要么页面上有，
 * 要么就不该出现在 JSON 里；不能为了补结构化数据反过来往页面加区块。
 */
function buildCountryJsonLd(
  nameZh: string,
  code: string,
  initial: SearchResultsInitial,
  url: string,
): string {
  const payload = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${nameZh}政府采购与招标公告`,
    url,
    about: { "@type": "Place", name: nameZh, addressCountry: code },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: initial.total,
      itemListElement: initial.items.slice(0, 10).map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(`/procurement/notice/${item.noticePk}`),
        name: item.title,
      })),
    },
  };
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}

export default async function ProcurementPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const code = soleCountryOf(await searchParams);
  const country = code ? countryParam(code) : undefined;
  const nameZh = code ? countryName(code, "zh") : "";

  // 国别页：首屏直出该国公告；非国别页保持原行为（全球最新）
  // ★ 国名映射 SSR 快照（2026-11-27 水合修复）：alias-store 带 TTL 内存缓存，
  // 非首调基本零成本；经 props 进 PageClient 灌共享缓存，SSR 与客户端首帧的国名逐字一致。
  // 与首屏直出并行发起（同一事务池），不串行叠加隧道延迟。
  const [initialResults, countryMaps] = await Promise.all([
    loadProcurementInitial(country),
    buildCountryNameMaps(getContext().dbPool),
  ]);

  const jsonLd =
    code && nameZh && initialResults
      ? buildCountryJsonLd(
          nameZh,
          code,
          initialResults,
          absoluteUrl(`/procurement?country=${encodeURIComponent(countryParam(code))}`),
        )
      : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
      ) : null}
      <PageClient initialResults={initialResults} countryMaps={countryMaps} />
    </>
  );
}
