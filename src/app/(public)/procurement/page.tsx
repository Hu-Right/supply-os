/**
 * /procurement — ISR (revalidate: 3600)
 *
 * 首屏 SEO 内容：服务端直查最新有效公告渲染内链区块（真实 HTML，非
 * <noscript> 反模式），为 /procurement/notice/[id] 详情页提供站内发现
 * 路径（12.7 万长尾页仅靠 sitemap 发现会被降权）。
 * 交互搜索层仍由客户端接管（PageClient）。
 */
import type { Metadata } from "next";
import Link from "next/link";
import PageClient from "./page-client";
import { absoluteUrl } from "@/lib/services/seo/site";
import { fetchLatestActiveNotices, type LatestNoticeRow } from "@/lib/services/seo/latest-notices";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Procurement Search | Supply OS",
  description: "Search global bidding and procurement notices from UN agencies, governments, and international organizations. Filter by country, industry (UNSPSC), and institution.",
  alternates: {
    canonical: absoluteUrl("/procurement"),
    languages: { "x-default": absoluteUrl("/procurement") },
  },
};

/** 构建期（CI 无 DB）返回空数组，ISR 运行时重新生成时填充真实数据 */
async function latestNotices(): Promise<LatestNoticeRow[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") return [];
  try {
    return await fetchLatestActiveNotices(undefined, 10);
  } catch (err) {
    // SEO 区块降级为空 —— 不阻断主搜索功能
    console.error("[procurement] 最新公告 SSR 区块生成失败:", (err as Error).message);
    return [];
  }
}

function formatDeadline(sec: number | null): string {
  if (!sec || sec <= 0) return "Open";
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

function LatestNoticesSection({ notices }: { notices: LatestNoticeRow[] }) {
  if (notices.length === 0) return null;
  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-label="Latest procurement notices">
      <h2 className="text-lg font-bold text-slate-900">Latest Procurement Notices</h2>
      <p className="mt-1 text-sm text-slate-500">
        Recently updated bidding opportunities from UN agencies, governments and international organizations.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {notices.map((n) => (
          <li key={n.id}>
            <Link
              href={`/procurement/notice/${n.id}`}
              className="group block h-full rounded-xl border border-slate-100 p-3.5 transition-colors hover:border-[#0CAF8C]/40 hover:bg-[#0CAF8C]/5"
            >
              <div className="flex items-center gap-2 text-xs text-slate-400">
                {n.notice_type && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{n.notice_type}</span>
                )}
                {n.country && <span>{n.country}</span>}
                <span className="ml-auto shrink-0">Due {formatDeadline(n.deadline_sec)}</span>
              </div>
              <span className="mt-1.5 block text-sm font-semibold leading-snug text-slate-800 group-hover:text-[#0CAF8C]">
                {n.title}
              </span>
              {n.agency && <span className="mt-1 block text-xs text-slate-400">{n.agency}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function ProcurementPage() {
  const notices = await latestNotices();

  return (
    <>
      {/* 客户端交互搜索层 */}
      <PageClient />
      {/* 服务端 SEO 内链区块：真实 HTML 内容，供爬虫与无 JS 环境 */}
      <LatestNoticesSection notices={notices} />
    </>
  );
}
