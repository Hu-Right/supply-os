/**
 * 中标情报页 · 视图模型（页面唯一取数口径）
 * Award Intelligence · View Model
 *
 * @module features/procurement/awards/awardViewModel
 * @description 把 useAwardsData 的真实返回（stats/topWinners/recentAwards）派生成页面各
 *              板块可直接渲染的视图模型；任何维度无真数据即置 present=false 并给 reason，
 *              绝不注入硬编码假数。纯函数、无副作用、可单测。
 *              i18n：所有用户可见文案经注入的 t()（第二参）产出，键统一 award 前缀；
 *              InfoCard.link 改为稳定动作码（trend/category/winners/reminder）供分发，
 *              展示文案由 linkLabelKey 经渲染层 t() 出。
 */
import type { AwardsData } from "@/features/procurement/hooks/useAwardsData";

/** t 的最小结构签名（与 useLocale().t 一致）；VM 保持纯函数，不依赖 React 上下文 */
export type AwardTranslateFn = (key: string, params?: Record<string, string | number>) => string;

export interface CoverageInfo {
  sources: string[];
  recordCount: number;
  countries: string[];
  earliestYear: string | null;
  latestYear: string | null;
  amountAvailable: boolean;
  totalValueUsd: number;
}
export interface StatCard { label: string; value: string; sub: string }
/** link 兼任动作分发键 → 改为稳定码；展示文案由 linkLabelKey 经渲染层 t() 出 */
export type InfoCardAction = "trend" | "category" | "winners" | "reminder";
export interface InfoCard { title: string; value: string; sub: string; badge: string; link: InfoCardAction; linkLabelKey: string }
export interface ProfileRow { label: string; value: string }
export interface WinnerRow { rank: number; name: string; country: string | null; count: number; totalUsd: number }
export interface CategoryRow { name: string; count: number }
export interface TrendSeries { months: string[]; counts: number[]; amountsUsd: number[] | null }
export interface RecentRow { id: number; title: string; titleCn: string | null; agency: string | null; country: string | null; awardDate: string | null; contractValueUsd: number | null; currency: string }

export type Section<T> = { present: true; data: T } | { present: false; reason: string };

export interface AwardViewModel {
  coverage: CoverageInfo;
  statsCards: StatCard[];
  infoCards: InfoCard[];
  trend: Section<TrendSeries>;
  buyerProfile: Section<ProfileRow[]>;
  topWinners: Section<WinnerRow[]>;
  categories: Section<CategoryRow[]>;
  recentAwards: RecentRow[];
  copy: { heroTitle: string; heroSubtitle: string; cnCasesNote: string };
  /** 取数三态透传：页面据此铺骨架（loading）/渲染错误重试（error 且无真数据）/诚实空态 */
  loading: boolean;
  error: boolean;
}

/** 金额紧凑显示：>=1e9→B, >=1e6→M, >=1e3→K（仅金额可用时调用） */
function compactUsd(n: number): string {
  if (n >= 1e9) return `US$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `US$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `US$${(n / 1e3).toFixed(0)}K`;
  return `US$${n.toFixed(0)}`;
}

/** 由真实中标数据派生页面视图模型（纯函数）；所有用户可见文案经 t() 产出。 */
export function buildAwardViewModel(data: AwardsData, t: AwardTranslateFn): AwardViewModel {
  const stats = data.stats;
  const hasReal = data.hasRealData;
  const monthsDesc = stats?.byMonth ?? []; // 服务端返回按 month DESC
  const monthsAsc = [...monthsDesc].reverse().slice(-12);
  const sources = [...new Set(data.recentAwards.map((r) => r.sourcePlatform).filter(Boolean))];
  const countries = (stats?.byCountry ?? []).map((c) => c.country);
  const totalValueUsd = stats?.totalValueUsd ?? 0;
  const amountAvailable = totalValueUsd > 0;
  const enumSep = t("awardEnumSep");

  const coverage: CoverageInfo = {
    sources,
    recordCount: stats?.total ?? 0,
    countries,
    earliestYear: monthsDesc.length ? monthsDesc[monthsDesc.length - 1].month.slice(0, 4) : null,
    latestYear: monthsDesc.length ? monthsDesc[0].month.slice(0, 4) : null,
    amountAvailable,
    totalValueUsd,
  };

  // STATS 顶栏：有真数据才派生
  const statsCards: StatCard[] =
    hasReal && stats
      ? [
          { label: t("awardStatRecords"), value: stats.total.toLocaleString(), sub: monthsDesc[0] ? t("awardStatLatestMonth", { n: monthsDesc[0].count }) : "" },
          { label: t("awardStatAgencies"), value: String(stats.byAgency.length), sub: t("awardStatCountries", { n: countries.length }) },
          { label: t("awardStatCompetitors"), value: `${data.topWinners.length}`, sub: t("awardStatOngoing") },
          { label: t("awardStatTracking"), value: coverage.earliestYear ? t("awardStatSinceYear", { y: coverage.earliestYear }) : "—", sub: t("awardStatOngoing") },
        ]
      : [];

  // 速览动作卡：真实派生，保留四个动作码（趋势/品类/名单/提醒），文案经 linkLabelKey 出
  const infoCards: InfoCard[] =
    hasReal && stats
      ? [
          { title: t("awardInfoSourcesTitle"), value: sources.join(enumSep) || t("awardConnecting"), sub: t("awardRecordsCount", { n: coverage.recordCount.toLocaleString() }), badge: t("awardBadgeCoverage"), link: "trend", linkLabelKey: "awardCardLinkTrend" },
          { title: t("awardInfoAmountTitle"), value: amountAvailable ? compactUsd(totalValueUsd) : t("awardAmountNotPublic"), sub: amountAvailable ? t("awardAmountConvertedSub") : t("awardAmountMissingSub"), badge: t("awardBadgeAmount"), link: "category", linkLabelKey: "awardCardLinkCategory" },
          { title: t("awardInfoWinnersTitle"), value: t("awardWinnersTrackable", { n: data.topWinners.length }), sub: "", badge: t("awardBadgeIntel"), link: "winners", linkLabelKey: "awardCardLinkWinners" },
          { title: t("awardInfoTimespanTitle"), value: coverage.earliestYear && coverage.latestYear ? `${coverage.earliestYear}–${coverage.latestYear}` : "—", sub: "", badge: t("awardBadgeTrend"), link: "reminder", linkLabelKey: "awardCardLinkReminder" },
        ]
      : [];

  const trend: Section<TrendSeries> =
    monthsAsc.length > 0
      ? {
          present: true,
          data: {
            months: monthsAsc.map((m) => m.month),
            counts: monthsAsc.map((m) => m.count),
            amountsUsd: amountAvailable ? monthsAsc.map((m) => m.totalUsd) : null,
          },
        }
      : { present: false, reason: t("awardReasonNoTrend") };

  // S0：买家画像无可靠真实来源 → 诚实空态（S1 起接归一后的 agency 画像）
  const buyerProfile: Section<ProfileRow[]> = { present: false, reason: t("awardReasonBuyerProfile") };

  // 品类：有 category 原值才聚合，否则诚实空态
  const categories: Section<CategoryRow[]> = data.recentAwards.some((r) => r.category)
    ? { present: true, data: aggregateCategories(data.recentAwards) }
    : { present: false, reason: t("awardReasonNoCategories") };

  // 注：上游 /api/awards/top 现按金额(totalUsd)排序采样，金额缺失时为近期样本、
  //      非全量按次数权威排名（S1 数据层改为按 count 排序 + 全量聚合后再上调用）。
  const topWinners: Section<WinnerRow[]> =
    data.topWinners.length > 0
      ? {
          present: true,
          data: [...data.topWinners]
            .sort((a, b) => b.count - a.count || b.totalUsd - a.totalUsd)
            .slice(0, 10)
            .map((w, i) => ({ rank: i + 1, name: w.name, country: w.country, count: w.count, totalUsd: w.totalUsd })),
        }
      : { present: false, reason: t("awardReasonNoWinners") };

  const recentAwards: RecentRow[] = data.recentAwards.map((r) => ({
    id: r.id,
    title: r.title,
    titleCn: r.titleCn,
    agency: r.agency,
    country: r.country,
    awardDate: r.awardDate,
    contractValueUsd: r.contractValueUsd,
    currency: r.currency,
  }));

  const srcLabel = sources.join(enumSep) || t("awardSourcesPublic");
  const copy = {
    heroTitle: t("awardCopyHeroTitle"),
    heroSubtitle: t("awardCopyHeroSubtitle", { sources: srcLabel, n: countries.length }),
    cnCasesNote: t("awardCopyCnCasesNote"),
  };

  return { coverage, statsCards, infoCards, trend, buyerProfile, topWinners, categories, recentAwards, copy, loading: data.loading, error: data.error };
}

function aggregateCategories(rows: AwardsData["recentAwards"]): CategoryRow[] {
  const m = new Map<string, number>();
  for (const r of rows) if (r.category) m.set(r.category, (m.get(r.category) ?? 0) + 1);
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}
