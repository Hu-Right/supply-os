// i18n-allow-file: ISR SEO 详情页（revalidate=3600），页面文案与 generateMetadata 同为中文口径；本地化需 locale 化路由架构，见 i18n 覆盖报告
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
 *              仅渲染公开字段集 —— 主路径读服务表 notice_public（单表零 JOIN），
 *              描述与搜索列表同口径截断 LEFT(description, 300) teaser；
 *              服务表未命中（已清退的过期行/未投影的新行）才回退主表。
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
import { countryParam } from "@/lib/services/seo/country-slug";
import { noticeTypeCodeLabel } from "@/shared/utils/notice-type";
import { countryName } from "@/shared/constants/countries";
import { formatNoticeUTCDate, formatNoticeDate, formatNoticeCstDate, resolveNoticeDeadlineTs, UNPUBLISHED_LABEL } from "@/shared/utils/notice-datetime/format";

export const revalidate = 3600;

/**
 * 是否已过截止时间（与 sitemap 的 ACTIVE_NOTICE_WHERE 同语义）。
 *
 * 过期公告仍保留 200 + 内容（外链/用户收藏不能 404），但必须 noindex：
 * 否则截止多年的公告会长期被收录，形成大量「已失效」低质页并稀释抓取预算。
 * 截止时间未知（state 非 known / 无值）时按未过期处理，避免误伤。
 */
function isExpired(row: NoticeSeoRow): boolean {
  const ts = resolveNoticeDeadlineTs({
    state: row.deadline_state,
    effectiveTs: row.effective_ts,
    fallbackSec: row.deadline_sec,
  });
  return ts !== null && ts <= Math.floor(Date.now() / 1000);
}

interface NoticeSeoRow extends RowDataPacket {
  id: number;
  notice_id: string;
  reference: string | null;
  title: string;
  notice_type: string | null;
  agency: string | null;
  agency_full: string | null;
  /** 服务表只有 ISO2 国别码，展示名在页面侧用 Intl 推导 */
  country_code: string | null;
  deadline: string | null;
  deadline_ts: number | null;
  deadline_sec: number | null;
  deadline_state: string | null;
  deadline_type: string | null;
  effective_ts: number | null;
  deadline_timezone: string | null;
  timezone_source: string | null;
  estimated_value: string | null;
  published_date: string | null;
  description: string | null;
}

/**
 * 只读服务表 notice_public（单表零 JOIN，无回退）：与列表卡片、预览/详情接口同源，
 * 主表归一前的原始列在服务表都有等价列，页面侧推导即可。
 */
async function fetchNotice(id: number): Promise<NoticeSeoRow | null> {
  return (await getContext().notice.detailRepo.findSeoDetailFromPublic(id)) as NoticeSeoRow | null;
}

/** 国别展示：服务表只有 ISO2 码，按中文名渲染 */
function countryLabel(row: NoticeSeoRow): string | null {
  return row.country_code ? countryName(row.country_code, "zh") || null : null;
}

function parseNoticeId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 && id <= 0xffffffff ? id : null;
}

/**
 * 截止日期：统一走语义层口径（resolveNoticeDeadlineTs），并按全站统一时区
 * （北京时间）展示，与列表卡片/详情组件同一数值——此前这里只取 UTC 日期，
 * 跨日时会比卡片差一天。
 * 例外：源文本有时分但无时区令牌（timezone_source=assumed_utc）时，ts 即原文
 * 墙上时间，按 UTC 还原，不做 +8。
 * 粒度：源带真实时刻（时分非零）→ 显示到分（与 SEO/导出链路同一口径）；
 * 纯日期源只显示日期，绝不臆造 00:00（2026-11-13 前详情页硬编码到日，与
 * format.ts 锁定规范「有真实时刻即显示 HH:mm」相悖）。
 * 非 known（unknown/placeholder/typo_suspect/invalid）→「未公布」。
 */
function formatDeadline(row: NoticeSeoRow): string {
  const ts = resolveNoticeDeadlineTs({
    state: row.deadline_state,
    effectiveTs: row.effective_ts,
    fallbackSec: row.deadline_sec,
  });
  if (!ts) return UNPUBLISHED_LABEL;
  const d = new Date(ts * 1000);
  const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
  const wallTime = String(row.timezone_source ?? "").trim() === "assumed_utc" && !row.deadline_timezone;
  return wallTime ? formatNoticeUTCDate(ts, hasTime) : formatNoticeCstDate(ts, hasTime);
}

function buildSummary(row: NoticeSeoRow): string {
  const nt = noticeTypeCodeLabel(row.notice_type);
  const parts = [
    row.agency || row.agency_full,
    countryLabel(row),
    nt ? `${nt} 采购公告` : "国际采购公告",
  ].filter(Boolean);
  const head = parts.join(" · ");
  const teaser = (row.description || "").replace(/\s+/g, " ").trim().slice(0, 160);
  return teaser ? `${head}. ${teaser}…` : head;
}

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id: raw } = await params;
  const id = parseNoticeId(raw);
  // 软 404 修复（2026-11-24）：存在性判断必须发生在 metadata 阶段。
  // 页面正文是流式输出的，等 page 组件里 await 完再 notFound()，200 状态码
  // 已经随 shell 发出去了，搜索引擎/AI 只能看到一个「存在但空」的 200 页。
  if (!id) notFound();
  const row = await fetchNotice(id);
  if (!row) notFound();

  const url = absoluteUrl(`/procurement/notice/${id}`);
  const summary = buildSummary(row);
  const expired = isExpired(row);
  return {
    title: row.title,
    description: summary,
    alternates: {
      canonical: url,
      languages: {
        "zh-CN": url,
        "en": absoluteUrl(`/en/procurement/notice/${id}`),
        "x-default": url,
      },
    },
    // 过期公告只去索引、保留链接权重（follow），不再贡献低质收录
    ...(expired ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: row.title,
      description: summary,
      url,
      type: "article",
      siteName: "云境·国际采购平台",
      ...(row.published_date ? { publishedTime: row.published_date } : {}),
      // 分享卡（og:image）由同目录 opengraph-image.tsx 文件约定生成：1200×630 动态卡，
      // 文件式 metadata 优先级高于这里，故不再写死默认图。
    },
    twitter: {
      card: "summary_large_image",
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
  const expired = isExpired(row);
  const country = countryLabel(row);
  // 国别链接统一用国家码：与 /procurement?country= 的 canonical 逐字一致，
  // 避免同一国别出现「链接写中文名、canonical 写码」的两个 URL
  const countryHref = row.country_code
    ? `/procurement?country=${encodeURIComponent(countryParam(row.country_code))}`
    : null;
  const summary = buildSummary(row);
  // 同国家相关公告：详情页是 4 万条公告的入口，必须给出「下一步」，不能只进不出。
  const related = row.country_code
    ? await getContext()
        .notice.detailRepo.findRelatedByCountry(id, row.country_code, 6)
        .catch((err) => {
          console.error("[notice] 相关公告装载失败:", (err as Error).message);
          return [];
        })
    : [];

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首页", item: absoluteUrl("") },
        { "@type": "ListItem", position: 2, name: "全球商机", item: absoluteUrl("/procurement") },
        { "@type": "ListItem", position: 3, name: row.title, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: row.title,
      name: row.title,
      url,
      description: buildSummary(row),
      // 采购公告是强时效内容，显式给出发布/更新时间便于结果页与 AI 判断时效
      ...(row.published_date ? { datePublished: row.published_date, dateModified: row.published_date } : {}),
      publisher: {
        "@type": "Organization",
        name: "云境·国际采购平台",
        url: absoluteUrl(""),
        logo: absoluteUrl("/logo.png"),
      },
      mainEntityOfPage: url,
      isPartOf: { "@type": "WebSite", name: "云境·国际采购平台", url: absoluteUrl("") },
    },
  ];

  return (
    <article className="mx-auto max-w-4xl space-y-6 py-4">
      {/* JSON-LD 防注入（审查 F43）：标题等来自采集数据，`</script>` 可闭合标签
          执行任意 JS；JSON.stringify 不转义 <，必须替换为 unicode 转义 */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      {/* 面包屑 */}
      <nav aria-label="面包屑" className="text-sm text-slate-500">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="hover:text-training-green">首页</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/procurement" className="hover:text-training-green">全球商机</Link></li>
          <li aria-hidden>/</li>
          {country && countryHref && (
            <>
              <li>
                <Link
                  href={countryHref}
                  className="hover:text-training-green"
                >
                  {country}
                </Link>
              </li>
              <li aria-hidden>/</li>
            </>
          )}
          <li className="max-w-[16rem] truncate text-slate-700" title={row.title}>公告 #{row.id}</li>
        </ol>
      </nav>

      {/* 标题 + 类型徽标 */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {noticeTypeCodeLabel(row.notice_type) && (
            <span className="inline-block rounded-full bg-training-green/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-training-green">
              {noticeTypeCodeLabel(row.notice_type)}
            </span>
          )}
          {expired && (
            <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
              已截止
            </span>
          )}
        </div>
        <h1 dir="auto" className="text-2xl font-bold leading-snug text-slate-900 sm:text-3xl">{row.title}</h1>
      </header>

      {/* 要点（AI 可直接摘录的结构化事实）：采购方 / 国家 / 类型 / 截止 / 预算 / 编号 */}
      <section aria-labelledby="notice-key-points" className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h2 id="notice-key-points" className="text-base font-bold text-slate-900">要点</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{summary}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {row.agency ? `采购方为 ${row.agency}` : "采购方未公开"}
          {country ? `，位于 ${country}` : ""}
          {noticeTypeCodeLabel(row.notice_type) ? `，公告类型为 ${noticeTypeCodeLabel(row.notice_type)}` : ""}
          ，截止时间 ${deadline}
          {row.estimated_value ? `，预算/金额 ${row.estimated_value}` : ""}
          {row.reference ? `，公告编号 ${row.reference}` : ""}
          ，来源编号 {row.notice_id}。完整描述、采购方联系方式与采购文件需登录后查看；公告原文以官方采购系统为准。
        </p>
      </section>

      {/* 公开元信息 */}
      <dl className="grid grid-cols-2 gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-3">
        <MetaItem label="采购方" value={row.agency || row.agency_full} />
        <MetaItem label="机构全称" value={row.agency && row.agency_full && row.agency_full !== row.agency ? row.agency_full : null} />
        <MetaItem label="国家/地区" value={countryLabel(row)} />
        <MetaItem label="截止时间" value={deadline} />
        <MetaItem label="发布时间" value={formatNoticeDate(row.published_date)} />
        <MetaItem label="公告编号" value={row.reference} />
        <MetaItem label="预算/金额" value={row.estimated_value} />
        <MetaItem label="来源编号" value={row.notice_id} />
      </dl>

      {/* 公开 teaser（与搜索列表 300 字符同口径） */}
      {row.description && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-slate-900">公告概况</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{row.description}</p>
        </section>
      )}

      {/* 登录 CTA —— 完整公告内容/联系人/文档需登录后查看（2026-10-29：不再用「解锁」旧口径） */}
      <section className="rounded-2xl border border-training-green/20 bg-training-green/5 p-6">
        <h2 className="text-base font-bold text-slate-900">查看完整公告</h2>
        <p className="mt-1 text-sm text-slate-600">
          完整描述、联系方式与采购文件需登录后查看。
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/procurement/notice/${row.id}/detail?from=${encodeURIComponent(`/procurement/notice/${row.id}`)}`}
            className="rounded-lg bg-training-green px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-training-green-hover"
          >
            打开公告详情
          </Link>
          <Link
            href="/procurement"
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:border-training-green/40 hover:text-training-green"
          >
            搜索全部公告
          </Link>
        </div>
      </section>

      {/* 相关公告：把单条公告接回同国别关系网，给 AI 与用户「下一步」 */}
      {related.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">同国家/地区的其他公告</h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {related.map((item) => {
              const ts = Number(item.deadline_ts) || 0;
              return (
                <li key={String(item.id)} className="px-5 py-3">
                  <Link
                    href={`/procurement/notice/${item.id}`}
                    className="block text-sm font-semibold leading-snug text-slate-800 hover:text-training-green"
                  >
                    {String(item.title)}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">
                    {ts > 0 ? `截止 ${formatNoticeCstDate(ts)}` : "长期有效"}
                  </p>
                </li>
              );
            })}
          </ul>
          {country && countryHref && (
            <Link
              href={countryHref}
              className="inline-block text-sm font-semibold text-training-green hover:underline"
            >
              查看 {country} 全部公告 →
            </Link>
          )}
        </section>
      )}
    </article>
  );
}
