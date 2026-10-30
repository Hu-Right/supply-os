/**
 * 中标情报服务编排
 * Awards Intelligence Service
 *
 * @module lib/services/awards.service
 * @description 承载中标记录分页/统计/排行的编排逻辑（分页元数据计算等），
 *              供 app/api/awards/** 薄壳路由委托。ARCH 分层红线：route 不再
 *              直接 new/使用 AwardsRepo，业务编排下沉本 service。
 *              依赖方向：route → service → repo → pool。
 *
 *              小表剥离（2026-10-14）：getAwardHistoryForNotice（按公告旧品类码
 *              LIKE 匹配历史中标）整链下线——bid_awards 的旧码列全表
 *              0 行非空，该功能自上线起恒返回空态，属零数据空转；中标库浏览
 *              （listAwards/stats/top）不受影响。
 */
import type { Pool } from "mysql2/promise";
import { AwardsRepo, type AwardStats } from "../repos/awards.repo";
import {
  awardsViewOf,
  awardStatsViewOf,
  winnerViewsOf,
  type AwardStatsView,
  type AwardView,
  type AwardWinnerView,
} from "./awards/view";

export interface AwardListParams {
  page: number;
  pageSize: number;
  agency?: string;
  country?: string;
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  sortBy?: "award_date" | "contract_value_usd";
  sortDir?: "asc" | "desc";
}

/**
 * 列表响应体（被 GET /api/awards 直接 json 透出）。
 * items 是对外视图（红线② camelCase）；page/page_size/total_pages 是分页元数据，
 * 按口径保留现有名字（它们不是实体字段）。
 */
export interface AwardListResult {
  items: AwardView[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AwardTopResult {
  items: AwardWinnerView[];
  total: number;
}

/** 分页查询中标记录，补全分页元数据（total_pages） */
export async function listAwards(pool: Pool, params: AwardListParams): Promise<AwardListResult> {
  const repo = new AwardsRepo(pool);
  const { page, pageSize, ...filters } = params;
  const { items, total } = await repo.list({ page, pageSize, ...filters });
  return {
    items: awardsViewOf(items),
    total,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(total / pageSize),
  };
}

/** 中标统计摘要（仪表板数据）：聚合别名经视图后对外 camelCase */
export async function getAwardStats(pool: Pool): Promise<AwardStatsView> {
  const stats: AwardStats = await new AwardsRepo(pool).getStats();
  return awardStatsViewOf(stats);
}

/** 中标商排行榜 */
export async function getTopWinners(pool: Pool, limit: number): Promise<AwardTopResult> {
  const items = winnerViewsOf(await new AwardsRepo(pool).topWinners(limit));
  return { items, total: items.length };
}

/** 中标情报页首屏快照：stats + top10 + 近期 10 条（与三个 /api/awards* 端点同一条 service 口径） */
export interface AwardsPageSnapshot {
  stats: AwardStatsView | null;
  topWinners: AwardWinnerView[];
  recentAwards: AwardView[];
}

/**
 * 组装中标情报页快照（ISR/渲染期直出，客户端 useAwardsData 挂载后照常刷新）。
 * 三路独立：单路失败该路落空值留 warn，不拖垮其余两路（与 hook 的逐请求兜底同语义）。
 */
export async function getAwardsPageSnapshot(pool: Pool): Promise<AwardsPageSnapshot> {
  const [stats, top, list] = await Promise.allSettled([
    getAwardStats(pool),
    getTopWinners(pool, 10),
    listAwards(pool, { page: 1, pageSize: 10 }),
  ]);
  const settled = <T,>(r: PromiseSettledResult<T>, label: string, fallback: T): T => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`[awards] 快照 ${label} 失败，该路降级为空:`, (r.reason as Error)?.message);
    return fallback;
  };
  const statsV = settled(stats, "stats", null);
  const topV = settled(top, "topWinners", { items: [], total: 0 });
  const listV = settled(list, "recentAwards", { items: [], total: 0, page: 1, page_size: 10, total_pages: 0 });
  return { stats: statsV, topWinners: topV.items, recentAwards: listV.items };
}
