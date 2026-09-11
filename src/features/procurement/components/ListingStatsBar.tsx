/**
 * 采购列表页 — 浅色规模条
 * Listing Stats Bar — Light-themed pool statistics
 *
 * @module features/procurement/components/ListingStatsBar
 * @description 模块02 规模条：实时规模指标（样图 2-全球采购机会库）。
 *              消费 useListingStats hook，纯展示组件。
 *              淡色调设计，融入页面白色卡片体系，不突兀。
 *              包含保存搜索/设置提醒按钮（当前为 coming soon）。
 */
import { Star, Bell, TrendingUp } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { GREEN } from "@/shared/constants/colors";
import type { ListingStats } from "../hooks/useListingStats";

interface ListingStatsBarProps {
  stats: ListingStats | null;
}

/** 计算环比百分比，yesterdayNew 为 0 时返回 null */
function calcChangeRate(todayNew: number, yesterdayNew: number): number | null {
  if (yesterdayNew === 0) return null;
  return Number((((todayNew - yesterdayNew) / yesterdayNew) * 100).toFixed(1));
}

/** 四个统计卡片的配色方案（淡色背景 + 品牌色点缀） */
const CARD_THEMES = [
  { bg: "bg-teal-50", border: "border-teal-100", accent: "text-teal-700", icon: "text-teal-500" },
  { bg: "bg-blue-50", border: "border-blue-100", accent: "text-blue-700", icon: "text-blue-500" },
  { bg: "bg-violet-50", border: "border-violet-100", accent: "text-violet-700", icon: "text-violet-500" },
  { bg: "bg-amber-50", border: "border-amber-100", accent: "text-amber-700", icon: "text-amber-500" },
];

export function ListingStatsBar({ stats }: ListingStatsBarProps) {
  const { t } = useLocale();

  // 计算今日新增的环比变化
  const changeRate = stats ? calcChangeRate(stats.todayNew, stats.yesterdayNew) : null;
  const changeLabel = changeRate !== null
    ? (changeRate >= 0 ? `+${changeRate}%` : `${changeRate}%`)
    : "—";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 sm:px-6 py-6 shadow-xs">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 flex items-center flex-wrap gap-3">
            {t("procurement_poolTitleNew")}
            {stats && (
              <span className="px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold">
                {stats.active.toLocaleString()}+ {t("procurement_searchableBadge")}
              </span>
            )}
          </h2>
          <p className="text-slate-500 text-sm mt-1.5">{t("procurement_poolDescNew")}</p>
        </div>
        {/* 右侧操作按钮：保存搜索 + 设置提醒 */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => alert(t("procurement_comingSoon"))}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:border-teal-300 hover:text-teal-700 transition-colors"
          >
            <Star className="w-3.5 h-3.5 text-amber-500" />
            {t("procurement_saveSearch")}
          </button>
          <button
            type="button"
            onClick={() => alert(t("procurement_comingSoon"))}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:border-teal-300 hover:text-teal-700 transition-colors"
          >
            <Bell className="w-3.5 h-3.5" style={{ color: GREEN }} />
            {t("procurement_setReminder")}
          </button>
        </div>
      </div>
      {stats && (
        <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[
            { value: stats.active, label: t("procurement_statSearchableNew"), sub: t("procurement_statSearchableSub") },
            {
              value: stats.todayNew,
              label: t("procurement_statTodayNewDesc"),
              sub: `${t("procurement_statTodayNewSub")} ${changeLabel}`,
              changeRate,
            },
            { value: stats.deadline_in_30d, label: t("procurement_statDeadline30Desc"), sub: t("procurement_statDeadline30Sub") },
            { value: stats.with_original_docs, label: t("procurement_statWithDocsDesc"), sub: t("procurement_statWithDocsSub") },
          ].map((s, i) => {
            const theme = CARD_THEMES[i] ?? CARD_THEMES[0];
            return (
              <div
                key={s.label}
                className={`rounded-xl border px-4 py-3 ${theme.bg} ${theme.border}`}
              >
                <p className={`text-xl font-extrabold ${theme.accent}`}>{s.value.toLocaleString()}</p>
                <p className="text-xs mt-0.5 font-bold text-slate-700">{s.label}</p>
                <p className="text-2xs mt-0.5 flex items-center gap-1 text-slate-400">
                  {"changeRate" in s && s.changeRate != null && s.changeRate > 0 && (
                    <TrendingUp className="w-3 h-3" style={{ color: GREEN }} />
                  )}
                  {s.sub}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
