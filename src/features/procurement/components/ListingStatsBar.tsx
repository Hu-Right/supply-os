/**
 * 采购列表页 — 深色页头 + 实时规模条
 * Listing Stats Bar — Dark header with real-time pool statistics
 *
 * @module features/procurement/components/ListingStatsBar
 * @description 模块02 深色页头：库存感 + 实时规模指标（样图 2-全球采购机会库）。
 *              消费 useListingStats hook，纯展示组件。
 *              配色基于品牌色 NAVY #022049 / GREEN #0CAF8C，保持深色层次感。
 *              包含保存搜索/设置提醒按钮（当前为 coming soon）。
 */
import { Star, Bell, TrendingUp } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { NAVY, GREEN } from "@/shared/constants/colors";
import type { ListingStats } from "../hooks/useListingStats";

interface ListingStatsBarProps {
  stats: ListingStats | null;
}

/** 计算环比百分比，yesterdayNew 为 0 时返回 null */
function calcChangeRate(todayNew: number, yesterdayNew: number): number | null {
  if (yesterdayNew === 0) return null;
  return Number((((todayNew - yesterdayNew) / yesterdayNew) * 100).toFixed(1));
}

export function ListingStatsBar({ stats }: ListingStatsBarProps) {
  const { t } = useLocale();

  // 计算今日新增的环比变化
  const changeRate = stats ? calcChangeRate(stats.todayNew, stats.yesterdayNew) : null;
  const changeLabel = changeRate !== null
    ? (changeRate >= 0 ? `+${changeRate}%` : `${changeRate}%`)
    : "—";

  return (
    <section
      className="rounded-2xl px-5 sm:px-6 py-6"
      style={{
        background: `linear-gradient(135deg, ${NAVY} 0%, #062d5e 50%, #0a3d5c 100%)`,
      }}
    >
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold text-white flex items-center flex-wrap gap-3">
            {t("procurement_poolTitleNew")}
            {stats && (
              <span
                className="px-2.5 py-1 rounded-full text-xs font-bold"
                style={{
                  background: "rgba(12,175,140,0.15)",
                  border: "1px solid rgba(12,175,140,0.4)",
                  color: "#5eead4",
                }}
              >
                {stats.active.toLocaleString()}+ {t("procurement_searchableBadge")}
              </span>
            )}
          </h2>
          <p className="text-sm mt-1.5" style={{ color: "rgba(255,255,255,0.65)" }}>
            {t("procurement_poolDescNew")}
          </p>
        </div>
        {/* 右侧操作按钮：保存搜索 + 设置提醒 */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => alert(t("procurement_comingSoon"))}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors"
            style={{
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
          >
            <Star className="w-3.5 h-3.5" style={{ color: "#fbbf24" }} />
            {t("procurement_saveSearch")}
          </button>
          <button
            type="button"
            onClick={() => alert(t("procurement_comingSoon"))}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors"
            style={{
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
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
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl px-4 py-3"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <p className="text-xl font-extrabold text-white">{s.value.toLocaleString()}</p>
              <p className="text-xs mt-0.5 font-bold" style={{ color: "rgba(255,255,255,0.75)" }}>
                {s.label}
              </p>
              <p className="text-2xs mt-0.5 flex items-center gap-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                {"changeRate" in s && s.changeRate != null && s.changeRate > 0 && (
                  <TrendingUp className="w-3 h-3" style={{ color: GREEN }} />
                )}
                {s.sub}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
