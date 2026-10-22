/**
 * 中标情报页 · 视图模型（页面唯一取数口径）
 * Award Intelligence · View Model
 *
 * @module features/procurement/awards/awardViewModel
 * @description 把 useAwardsData 的真实返回（stats/topWinners/recentAwards）派生成页面各
 *              板块可直接渲染的视图模型；任何维度无真数据即置 present=false 并给 reason，
 *              绝不注入硬编码假数。纯函数、无副作用、可单测。
 */
import type { AwardsData } from "@/features/procurement/hooks/useAwardsData";

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
export interface InfoCard { title: string; value: string; sub: string; badge: string; link: string }
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
}

/** 金额紧凑显示：>=1e9→B, >=1e6→M, >=1e3→K（仅金额可用时调用） */
function compactUsd(n: number): string {
  if (n >= 1e9) return `US$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `US$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `US$${(n / 1e3).toFixed(0)}K`;
  return `US$${n.toFixed(0)}`;
}

/** 由真实中标数据派生页面视图模型（纯函数）。 */
export function buildAwardViewModel(data: AwardsData): AwardViewModel {
  const stats = data.stats;
  const hasReal = data.hasRealData;
  const monthsDesc = stats?.by_month ?? []; // 服务端返回按 month DESC
  const monthsAsc = [...monthsDesc].reverse().slice(-12);
  const sources = [...new Set(data.recentAwards.map((r) => r.source_platform).filter(Boolean))];
  const countries = (stats?.by_country ?? []).map((c) => c.country);
  const totalValueUsd = stats?.total_value_usd ?? 0;
  const amountAvailable = totalValueUsd > 0;

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
          { label: "中标记录", value: stats.total.toLocaleString(), sub: monthsDesc[0] ? `本月 +${monthsDesc[0].count}` : "" },
          { label: "采购机构档案", value: String(stats.by_agency.length), sub: `覆盖 ${countries.length} 个国家` },
          { label: "可追踪竞争对手", value: `${data.topWinners.length}`, sub: "持续更新中" },
          { label: "数据追踪", value: coverage.earliestYear ? `${coverage.earliestYear}年起` : "—", sub: "持续更新中" },
        ]
      : [];

  // 速览动作卡：真实派生，保留四个动作链接（查看趋势/品类/名单/提醒）
  const infoCards: InfoCard[] =
    hasReal && stats
      ? [
          { title: "数据来源", value: sources.join("、") || "接入中", sub: `${coverage.recordCount.toLocaleString()} 条记录`, badge: "覆盖", link: "查看趋势" },
          { title: "金额", value: amountAvailable ? compactUsd(totalValueUsd) : "未公开", sub: amountAvailable ? "已按币种折算合计" : "来源未提供中标金额", badge: "金额", link: "查看品类" },
          { title: "主要中标商", value: `${data.topWinners.length} 家可追踪`, sub: "", badge: "竞争情报", link: "查看名单" },
          { title: "时间跨度", value: coverage.earliestYear && coverage.latestYear ? `${coverage.earliestYear}–${coverage.latestYear}` : "—", sub: "", badge: "趋势", link: "设置提醒" },
        ]
      : [];

  const trend: Section<TrendSeries> =
    monthsAsc.length > 0
      ? {
          present: true,
          data: {
            months: monthsAsc.map((m) => m.month),
            counts: monthsAsc.map((m) => m.count),
            amountsUsd: amountAvailable ? monthsAsc.map((m) => m.total_usd) : null,
          },
        }
      : { present: false, reason: "暂无按月中标数据，接入中" };

  // S0：买家画像无可靠真实来源 → 诚实空态（S1 起接归一后的 agency 画像）
  const buyerProfile: Section<ProfileRow[]> = { present: false, reason: "买家画像需多来源积累，S1（TED）起接入" };

  // 品类：有 category 原值才聚合，否则诚实空态
  const categories: Section<CategoryRow[]> = data.recentAwards.some((r) => r.category)
    ? { present: true, data: aggregateCategories(data.recentAwards) }
    : { present: false, reason: "品类分布待来源补齐品类字段后接入" };

  const topWinners: Section<WinnerRow[]> =
    data.topWinners.length > 0
      ? {
          present: true,
          data: [...data.topWinners]
            .sort((a, b) => b.count - a.count || b.total_usd - a.total_usd)
            .slice(0, 5)
            .map((w, i) => ({ rank: i + 1, name: w.name, country: w.country, count: w.count, totalUsd: w.total_usd })),
        }
      : { present: false, reason: "暂无中标商数据" };

  const recentAwards: RecentRow[] = data.recentAwards.map((r) => ({
    id: r.id,
    title: r.title,
    titleCn: r.title_cn,
    agency: r.agency,
    country: r.country,
    awardDate: r.award_date,
    contractValueUsd: r.contract_value_usd,
    currency: r.currency,
  }));

  const srcLabel = sources.join("、") || "公开来源";
  const copy = {
    heroTitle: "中标结果 / 买家情报",
    heroSubtitle: `聚合${srcLabel}中标数据 · 已覆盖 ${countries.length} 国 · 持续接入全球更多公开来源`,
    cnCasesNote: "以下为中国企业联合国采购中标精选案例（人工核验官方公示，非平台聚合数据）",
  };

  return { coverage, statsCards, infoCards, trend, buyerProfile, topWinners, categories, recentAwards, copy };
}

function aggregateCategories(rows: AwardsData["recentAwards"]): CategoryRow[] {
  const m = new Map<string, number>();
  for (const r of rows) if (r.category) m.set(r.category, (m.get(r.category) ?? 0) + 1);
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}
