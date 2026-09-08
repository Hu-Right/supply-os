/**
 * 采购列表页 — 深色页头 + 实时规模条
 * Listing Stats Bar — Dark header with real-time pool statistics
 *
 * @module features/procurement/components/ListingStatsBar
 * @description 模块02 深色页头：库存感 + 实时规模指标（样图 2-全球采购机会库）。
 *              消费 useListingStats hook，纯展示组件。
 *              包含保存搜索/设置提醒按钮（当前为 coming soon）。
 */
import { Star, Bell } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { ListingStats } from "../hooks/useListingStats";

interface ListingStatsBarProps {
  stats: ListingStats | null;
}

export function ListingStatsBar({ stats }: ListingStatsBarProps) {
  const { t } = useLocale();

  return (
    <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 rounded-2xl px-5 sm:px-6 py-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold text-white flex items-center flex-wrap gap-3">
            {t("procurement_poolTitleNew")}
            {stats && (
              <span className="px-2.5 py-1 rounded-full bg-teal-500/20 border border-teal-400/40 text-teal-300 text-xs font-bold">
                {stats.active.toLocaleString()}+ {t("procurement_searchableBadge")}
              </span>
            )}
          </h2>
          <p className="text-slate-300 text-sm mt-1.5">{t("procurement_poolDescNew")}</p>
        </div>
        {/* 右侧操作按钮：保存搜索 + 设置提醒 */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => alert(t("procurement_comingSoon"))}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/20 bg-white/5 text-white text-xs font-bold hover:bg-white/10 transition-colors"
          >
            <Star className="w-3.5 h-3.5 text-amber-400" />
            {t("procurement_saveSearch")}
          </button>
          <button
            type="button"
            onClick={() => alert(t("procurement_comingSoon"))}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/20 bg-white/5 text-white text-xs font-bold hover:bg-white/10 transition-colors"
          >
            <Bell className="w-3.5 h-3.5 text-teal-400" />
            {t("procurement_setReminder")}
          </button>
        </div>
      </div>
      {stats && (
        <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[
            { value: stats.active, label: t("procurement_statSearchableNew"), sub: t("procurement_statSearchableSub") },
            { value: stats.todayNew, label: t("procurement_statTodayNewDesc"), sub: t("procurement_statTodayNewSub") },
            { value: stats.deadline_in_30d, label: t("procurement_statDeadline30Desc"), sub: t("procurement_statDeadline30Sub") },
            { value: stats.with_original_docs, label: t("procurement_statWithDocsDesc"), sub: t("procurement_statWithDocsSub") },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
              <p className="text-xl font-extrabold text-white">{s.value.toLocaleString()}</p>
              <p className="text-xs text-slate-300 mt-0.5 font-bold">{s.label}</p>
              <p className="text-2xs text-slate-400 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
