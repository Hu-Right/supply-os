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
import { Button, Skeleton } from "@/shared/ui";
import { GREEN } from "@/shared/constants/colors";
import { useCountUp } from "@/shared/hooks/useCountUp";
import type { ListingStats } from "../hooks/useListingStats";

interface ListingStatsBarProps {
  stats: ListingStats;
  /** 首次统计取数中：用骨架替代 0，避免“空库”错觉 */
  loading?: boolean;
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

export function ListingStatsBar({ stats, loading = false }: ListingStatsBarProps) {
  const { t } = useLocale();

  // 数字从 0 缓动到真实值（与首页 StatsWall 一致）
  const animActive = useCountUp(stats.active);
  const animTodayNew = useCountUp(stats.todayNew);
  const animDeadline30 = useCountUp(stats.deadlineIn30d);
  const animWithDocs = useCountUp(stats.withOriginalDocs);

  // 计算今日新增的环比变化
  const changeRate = calcChangeRate(stats.todayNew, stats.yesterdayNew);
  const changeLabel = changeRate !== null
    ? (changeRate >= 0 ? `+${changeRate}%` : `${changeRate}%`)
    : "—";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-4 sm:px-5 md:px-6 py-3.5 sm:py-6 shadow-xs">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-base sm:text-xl md:text-2xl font-extrabold text-slate-900 flex items-center flex-wrap gap-2 sm:gap-3">
            {t("procurement_poolTitleNew")}
            {!loading && stats.active > 0 && (
              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-2xs sm:text-xs font-bold">
                {animActive.toLocaleString()}+ {t("procurement_searchableBadge")}
              </span>
            )}
          </h1>
          <p className="hidden sm:block text-slate-500 text-sm mt-1.5">{t("procurement_poolDescNew")}</p>
          {/* 移动端（阶段2 首屏减法）：4 张统计卡收成一行摘要，保留信息量但只占 1 行高度 */}
          {loading ? (
            <Skeleton className="mt-1.5 sm:hidden" width={220} height={12} />
          ) : (
            <p className="sm:hidden mt-1 text-2xs text-slate-500 truncate">
              {animTodayNew.toLocaleString()} {t("procurement_statTodayNewDesc")}（{changeLabel}）· {animDeadline30.toLocaleString()} {t("procurement_statDeadline30Desc")} · {animWithDocs.toLocaleString()} {t("procurement_statWithDocsDesc")}
            </p>
          )}
        </div>
        {/* 右侧操作按钮：保存搜索 + 设置提醒（当前为敬请期待占位，移动端不占首屏） */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => alert(t("procurement_comingSoon"))}
          >
            <Star className="w-3.5 h-3.5 text-accent-500" />
            {t("procurement_saveSearch")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => alert(t("procurement_comingSoon"))}
          >
            <Bell className="w-3.5 h-3.5" style={{ color: GREEN }} />
            {t("procurement_setReminder")}
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="hidden sm:grid mt-5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2.5 rounded-xl border border-secondary-200 bg-white px-4 py-3">
              <Skeleton width={64} height={20} />
              <Skeleton width={96} height={12} />
              <Skeleton width={120} height={10} />
            </div>
          ))}
        </div>
      ) : (
        <div className="hidden sm:grid mt-5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[
            { value: animActive, label: t("procurement_statSearchableNew"), sub: t("procurement_statSearchableSub") },
            {
              value: animTodayNew,
              label: t("procurement_statTodayNewDesc"),
              sub: `${t("procurement_statTodayNewSub")} ${changeLabel}`,
              changeRate,
            },
            { value: animDeadline30, label: t("procurement_statDeadline30Desc"), sub: t("procurement_statDeadline30Sub") },
            { value: animWithDocs, label: t("procurement_statWithDocsDesc"), sub: t("procurement_statWithDocsSub") },
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
