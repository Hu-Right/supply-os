/**
 * 买家数据变更后的投影刷新编排
 *
 * @module lib/services/buyer/refresh
 * @description 2026-10-31 机构口径收敛后的「买家主数据改名/合并」传播链。
 *
 *              旧链（已退役）：`onAgencyAliasesChanged` → 失效 agency alias 缓存 → 全量重算
 *              宽表 → Meili 全量重建。旧链的问题是：① 它只处理 agency_aliases，不处理
 *              buyer/buyer_alias/name_zh；② 全量重算宽表对一次改名过重；③ 服务表投影
 *              本身不会因买家改名而重建（--changed 水位看不见），导致投影长期停在旧值。
 *
 *              新链顺序（不可颠倒）：
 *              ① 圈定受影响的 notice_pk（按 buyer_id 反查，或运维直接给 noticeIds）；
 *              ② 唯一写入者链路重建服务表投影（buyer_id / buyer_name / buyer_name_cn /
 *                 buyer_group 快照）——`notice-public/rebuild.rebuildPublicRowsByIds`；
 *              ③ 按同一批 id 重算宽表（buyer_name/buyer_group 投影面）——`syncWideIds`；
 *              ④ 失效搜索结果缓存（宽表/Meili 级联由 syncWideIds 内部完成）。
 *
 *              调用方：运维改名/合并脚本收尾、`buyer-name-zh-seed --apply` 之后、
 *              人工补别名后。常规爬虫 tick 不走这里（它们走 --changed 水位）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { rebuildPublicRowsByIds } from "../notice-public/rebuild";
import { syncWideIds } from "../search-sync/sync-scheduler";
import { invalidateSearchCache } from "../search-common/sync-events";

/** 单次 IN 查询上限（notice_pk 无 buyer_id 索引时也避免构造超长语句） */
const BUYER_IDS_CHUNK = 1000;

export interface BuyerRefreshResult {
  /** 实际参与重建的公告 id（去重后） */
  noticeIds: number[];
  /** 服务表重写行数（不可准入行会被丢弃，可能小于 noticeIds.length） */
  rewritten: number;
  /** 宽表重算行数（含被删除的 ghost 行时由 syncWideIds 内部处理） */
  wideSynced: number;
}

/** 按 buyer_id 反查其名下公告 id（分块 IN，避免超长 SQL） */
async function noticeIdsOfBuyers(pool: Pool, buyerIds: number[]): Promise<number[]> {
  const ids = new Set<number>();
  for (let i = 0; i < buyerIds.length; i += BUYER_IDS_CHUNK) {
    const chunk = buyerIds.slice(i, i + BUYER_IDS_CHUNK);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT notice_pk FROM notice_public WHERE buyer_id IN (${chunk.map(() => "?").join(",")})`,
      chunk,
    );
    for (const r of rows) ids.add(Number(r.notice_pk));
  }
  return [...ids];
}

/**
 * 买家数据变更后刷新服务表投影 + 宽表 + 搜索缓存。
 *
 * @param opts.buyerIds buyer 实体 id（改名/合并/补中文名后）
 * @param opts.noticeIds 直接指定公告 id（按别名反查、或批量修数时）
 *                      两者都为空则不做任何事（不隐式全表重建）。
 */
export async function refreshBuyerProjection(
  pool: Pool,
  opts: { buyerIds?: number[]; noticeIds?: number[] } = {},
): Promise<BuyerRefreshResult> {
  const noticeIds = new Set<number>(opts.noticeIds ?? []);
  if (opts.buyerIds && opts.buyerIds.length > 0) {
    for (const id of await noticeIdsOfBuyers(pool, [...new Set(opts.buyerIds)])) noticeIds.add(id);
  }
  const ids = [...noticeIds];
  if (ids.length === 0) {
    return { noticeIds: [], rewritten: 0, wideSynced: 0 };
  }

  // ① 服务表投影（唯一写入者链路；buyer_id/name/name_cn/group 由 buildPublicRow 重新求值）
  const rewritten = await rebuildPublicRowsByIds(pool, ids);
  // ② 宽表投影（buyer_name/buyer_group 从服务表读；内部级联 Meili 增量同步）
  const { synced } = await syncWideIds(pool, ids);
  // ③ 搜索结果缓存失效（内存缓存不感知宽表写入）
  invalidateSearchCache();

  console.log(
    `[buyer-refresh] 买家数据变更回填：公告 ${ids.length} · 服务表 ${rewritten} · 宽表 ${synced}`,
  );
  return { noticeIds: ids, rewritten, wideSynced: synced };
}
