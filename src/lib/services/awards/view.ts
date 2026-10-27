/**
 * 中标情报对外视图 mapper —— 命名红线② 在本域的收口点
 *
 * @module lib/services/awards/view
 * @description /api/awards、/api/awards/stats、/api/awards/top 原先把 repo 行 /
 *              聚合结果整块 json 出去，响应键就是 crm_bid_awards 的列名与 SQL 别名。
 *              本模块把它们收成一个显式契约：键名 camelCase，值原样透传。
 *
 *              为什么这里的记录视图是**显式列字段**而不是整行机械改名：
 *              本端点无认证、可公开翻页，而行里有三类不该出网的东西——
 *              `raw_data`（爬虫原始载荷，内容不受本系统约束）、
 *              `source_url` / `external_id` / `source_notice_id` / `crawl_time`
 *              （采集溯源与内部关联键，前端一个都没在读）。
 *              整行改名会把这些一起改名后继续公开下发，所以这里按契约列举；
 *              新增列要对外必须先显式登记，这是有意的摩擦。
 */
import type { AwardRow, AwardStats } from "@/lib/repos/awards.repo";
import { toCamelKeys, type RowLike } from "@/shared/utils/case-keys";

/** 中标记录对外形状（/api/awards 的 items 元素） */
export interface AwardView {
  id: number;
  title: string;
  titleCn: string | null;
  reference: string | null;
  contractNo: string | null;
  agency: string | null;
  agencyFull: string | null;
  country: string | null;
  awardDate: string | null;
  contractValue: number | null;
  contractValueUsd: number | null;
  currency: string;
  description: string | null;
  descriptionCn: string | null;
  category: string | null;
  industry: string | null;
  sourcePlatform: string;
}

/** 行 → 视图：只改名与裁剪，不改任何值 */
export function awardViewOf(row: AwardRow): AwardView {
  return {
    id: row.id,
    title: row.title,
    titleCn: row.title_cn,
    reference: row.reference,
    contractNo: row.contract_no,
    agency: row.agency,
    agencyFull: row.agency_full,
    country: row.country,
    awardDate: row.award_date,
    contractValue: row.contract_value,
    contractValueUsd: row.contract_value_usd,
    currency: row.currency,
    description: row.description,
    descriptionCn: row.description_cn,
    category: row.category,
    industry: row.industry,
    sourcePlatform: row.source_platform,
  };
}

export const awardsViewOf = (rows: readonly AwardRow[]): AwardView[] => rows.map(awardViewOf);

/** 排行榜行（/api/awards/top 的 items 元素；由 SQL 别名构成，无内部列） */
export interface AwardWinnerView {
  name: string;
  country: string | null;
  count: number;
  totalUsd: number;
}

/** 统计摘要（/api/awards/stats 响应体） */
export interface AwardStatsView {
  total: number;
  totalValueUsd: number;
  byAgency: Array<{ agency: string; count: number; totalUsd: number }>;
  byCountry: Array<{ country: string; count: number }>;
  byMonth: Array<{ month: string; count: number; totalUsd: number }>;
  topWinners: Array<{ name: string; count: number; totalUsd: number; country: string | null }>;
}

/** 聚合数组的元素也是别名键，同样要改名（新增别名自动进入契约） */
const camelRows = <T>(rows: readonly unknown[]): T[] =>
  rows.map((r) => toCamelKeys(r as RowLike) as unknown as T);

/**
 * 聚合结果 → 视图。
 * @remarks 顶层与各分组都走机械改名：这里的键都是 repo 里 SQL 的聚合别名，
 *          不是表列，也没有需要裁剪的内部字段，改名规则复用 shared/utils/case-keys。
 */
export function awardStatsViewOf(stats: AwardStats): AwardStatsView {
  const view = toCamelKeys(stats) as unknown as AwardStatsView;
  view.byAgency = camelRows<AwardStatsView["byAgency"][number]>(stats.by_agency);
  view.byCountry = camelRows<AwardStatsView["byCountry"][number]>(stats.by_country);
  view.byMonth = camelRows<AwardStatsView["byMonth"][number]>(stats.by_month);
  view.topWinners = camelRows<AwardStatsView["topWinners"][number]>(stats.top_winners);
  return view;
}

/** 排行榜行改名（同一规则，不另起口径） */
export const winnerViewsOf = (rows: readonly unknown[]): AwardWinnerView[] =>
  rows.map((r) => toCamelKeys(r as RowLike) as unknown as AwardWinnerView);
