// i18n-allow-file: 国别页服务端直出摘要（SEO 首屏），站点为单语言中文站（ADR-0024），文案不随界面语言切换
/**
 * 国别筛选页摘要块（`/procurement?country=XX`）
 *
 * @description 2026-11-26：让国别 URL 的服务端直出内容名副其实。
 *              纯展示组件，无 hooks，可被服务端渲染。
 */
import type { CountrySummary } from "@/lib/services/seo/country-summary";

const fmt = (n: number) => n.toLocaleString("zh-CN");

export function CountrySummarySection({ summary }: { summary: CountrySummary }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <h2 className="text-base font-bold text-slate-900">{summary.nameZh}政府采购与招标公告</h2>
      <p className="mt-1 text-sm text-slate-600">
        当前在挂 <strong className="text-slate-900">{fmt(summary.active)}</strong> 条；
        7 天内截止 {fmt(summary.deadline7)} 条，30 天内截止 {fmt(summary.deadline30)} 条。
      </p>

      {summary.types.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500">采购类型</span>
          {summary.types.map((t) => (
            <span key={t.code} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {t.label} {fmt(t.count)}
            </span>
          ))}
        </div>
      ) : null}

      {summary.buyers.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-bold text-slate-500">主要采购方</p>
          <ul className="mt-1 space-y-0.5">
            {summary.buyers.map((b) => (
              <li key={b.name} className="flex items-baseline justify-between gap-3 text-sm text-slate-700">
                <span className="line-clamp-1">{b.name}</span>
                <span className="shrink-0 text-xs text-slate-400">{fmt(b.count)} 条</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-3 text-2xs text-slate-400">
        数据来自各国官方采购门户与联合国机构公开渠道，每日同步；以采购机构原文为准。
      </p>
    </section>
  );
}
