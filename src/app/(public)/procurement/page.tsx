// i18n-allow-file: SEO 落地页（ISR 3600）在服务端渲染「最新公告」内链区块，中文为主站索引语言；本地化需 locale 化路由架构，见 i18n 覆盖报告
/**
 * /procurement — ISR (revalidate: 3600)
 *
 * 交互搜索层由客户端接管（PageClient），但页面不是纯 CSR：
 * 下方 LatestNoticeLinks 在服务端直查最新有效公告并渲染真实 <a> 内链，
 * 让爬虫（尤其不执行 JS 的百度蜘蛛）在列表页就能拿到公告标题与详情入口。
 * 此前页面只有骨架占位，/procurement/notice/* 除 sitemap 外无任何可爬入口。
 */
import type { Metadata } from "next";
import Link from "next/link";
import PageClient from "./page-client";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { BROWSER_TITLE } from "@/lib/i18n/metadata";
import { fetchLatestActiveNotices, type LatestNoticeRow } from "@/lib/services/seo/latest-notices";
import { formatNoticeCstDate } from "@/shared/utils/notice-datetime/format";

export const revalidate = 3600;

export const metadata: Metadata = {
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
    languages: { "x-default": absoluteUrl("/procurement") },
  },
};

/** 服务端内链区块条数（足够形成爬虫入口，又不至于把页面撑得过大） */
const SSR_LATEST_LIMIT = 30;

function DeadlineLabel({ row }: { row: LatestNoticeRow }) {
  // deadline_sec=0/NULL 是「无截止日期」语义（与 ACTIVE_NOTICE_WHERE 同口径）
  return <>{row.deadline_sec ? `截止 ${formatNoticeCstDate(row.deadline_sec)}` : "长期有效"}</>;
}

async function LatestNoticeLinks() {
  // 构建期无数据库（CI 只做静态产物），直接跳过；运行时 ISR 再生成时写入真实内链
  if (process.env.NEXT_PHASE === "phase-production-build") return null;

  let rows: LatestNoticeRow[];
  try {
    rows = await fetchLatestActiveNotices(undefined, SSR_LATEST_LIMIT);
  } catch (err) {
    // 内链区块是增量能力，失败不得拖垮整页（搜索区由客户端接管仍可用）
    console.error("[procurement] 最新公告内链区块生成失败:", (err as Error).message);
    return null;
  }
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="latest-notices" className="mx-auto w-full max-w-7xl space-y-3 px-1 pb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="latest-notices" className="text-lg font-bold text-slate-900">
          最新国际采购公告
        </h2>
        <p className="text-xs text-slate-500">按更新时间排序，每小时刷新</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const meta = [row.agency, row.country].filter(Boolean).join(" · ");
          return (
            <li key={row.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <Link
                href={`/procurement/notice/${row.id}`}
                className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800 hover:text-training-green"
              >
                {row.title}
              </Link>
              <p className="mt-1 truncate text-xs text-slate-500">
                {meta ? `${meta} · ` : ""}
                <DeadlineLabel row={row} />
              </p>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-400">
        更多公告可在上方搜索区按国家、机构、品目分类与关键词检索；每条公告均有独立详情页。
      </p>
    </section>
  );
}

export default function ProcurementPage() {
  return (
    <>
      <PageClient />
      <LatestNoticeLinks />
    </>
  );
}
