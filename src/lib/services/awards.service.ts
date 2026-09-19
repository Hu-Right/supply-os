/**
 * 中标情报服务编排
 * Awards Intelligence Service
 *
 * @module lib/services/awards.service
 * @description 承载中标记录分页/统计/排行的编排逻辑（分页元数据计算等），
 *              供 app/api/awards/** 薄壳路由委托。ARCH 分层红线：route 不再
 *              直接 new/使用 AwardsRepo，业务编排下沉本 service。
 *              依赖方向：route → service → repo → pool。
 */
import type { Pool } from "mysql2/promise";
import { AwardsRepo, type AwardRow, type AwardStats } from "../repos/awards.repo";
import { NoticeDetailRepo } from "../repos/notices/index";
import { normalizeUnspscCodes, unspscPrefixFromCode } from "./unspsc/parser";

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

export interface AwardListResult {
  items: AwardRow[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AwardWinnerRow {
  name: string;
  country: string | null;
  count: number;
  total_usd: number;
}

export interface AwardTopResult {
  items: AwardWinnerRow[];
  total: number;
}

/** 分页查询中标记录，补全分页元数据（total_pages） */
export async function listAwards(pool: Pool, params: AwardListParams): Promise<AwardListResult> {
  const repo = new AwardsRepo(pool);
  const { page, pageSize, ...filters } = params;
  const { items, total } = await repo.list({ page, pageSize, ...filters });
  return {
    items,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(total / pageSize),
  };
}

/** 中标统计摘要（仪表板数据） */
export function getAwardStats(pool: Pool): Promise<AwardStats> {
  return new AwardsRepo(pool).getStats();
}

/** 中标商排行榜 */
export async function getTopWinners(pool: Pool, limit: number): Promise<AwardTopResult> {
  const items = await new AwardsRepo(pool).topWinners(limit);
  return { items, total: items.length };
}

/** 公告同类品类的历史中标聚合（含匹配的 UNSPSC 前缀） */
export type NoticeAwardHistory = Awaited<ReturnType<AwardsRepo["getByUnspscCodes"]>> & {
  unspsc_matched: string[];
};

/** 空历史（公告无 UNSPSC 码时） */
const EMPTY_HISTORY = {
  total: 0,
  total_value_usd: 0,
  by_country: [],
  top_winners: [],
  recent_awards: [],
};

/**
 * 按公告查同类品类历史中标数据：公告取 UNSPSC → 去重前缀 → 查 awards。
 * 公告不存在返回 null（路由据此发 404）；无码时返回零值历史。
 */
export async function getAwardHistoryForNotice(
  pool: Pool,
  noticeId: number,
): Promise<NoticeAwardHistory | null> {
  const notice = await new NoticeDetailRepo(pool).findById(noticeId);
  if (!notice) return null;

  const codes = normalizeUnspscCodes(notice.unspsc_codes);
  if (codes.length === 0) {
    return { ...EMPTY_HISTORY, unspsc_matched: [] } as NoticeAwardHistory;
  }

  // 提取前缀（去重）
  const prefixSet = new Set<string>();
  for (const item of codes) {
    const prefix = unspscPrefixFromCode(item.code);
    if (prefix) prefixSet.add(prefix);
  }
  const prefixes = Array.from(prefixSet);

  const result = await new AwardsRepo(pool).getByUnspscCodes(prefixes);
  return { ...result, unspsc_matched: prefixes };
}
