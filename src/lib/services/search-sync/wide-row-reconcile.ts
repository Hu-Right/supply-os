/**
 * 宽表对账层 —— 只检测，不修复
 * Wide Table Reconciliation (detect-only)
 *
 * @module server/services/search-sync/wide-row-reconcile
 * @description 本层每个函数都只返回「需要重建的 id」，修复一律走
 *              syncWideIds（→ buildWideRow → upsertWideRows）。
 *
 *              历史形态是「检测 + 手写 UPDATE 就地修复」，5 段 UPDATE 各自维护一份字段
 *              口径，与构建路径分叉后已实测造成：
 *              - 描述来源不一致：宽表被改回主表描述，而详情页展示机会表描述（8,367 行）；
 *              - 列语义污染风险：candidate_code 原码写进语义为 UNSPSC ID 的列；
 *              - 优先级被抹：精选公告人工拆解的 description_cn 遭机器译文覆盖；
 *              - 窗口算法缺陷：只扫 id ≤ 2000，而现网 id 为 Unix 时间戳量级 → 生产几乎不生效。
 *              现在宽表的唯一写入者是 buildWideRow，内容一致性判据由源指纹承担
 *              （见 wide-fingerprint.ts），本层只保留两类**指纹覆盖不到**的判据：
 *              - deadline_sec：主表生成列 vs 宽表静态拷贝，需分钟级感知（搜索活跃度过滤依赖它）；
 *              - 行存在性：ghost 行清理与平台公告可见性集合差。
 */
import { RFQ_STATUS } from "@/shared/constants/rfq";
import type { Pool, RowDataPacket } from "mysql2/promise";

// ── 对账日志节流（同一类型 30 分钟内不重复输出，避免高频刷屏）──
const RECONCILE_LOG_TTL = 30 * 60 * 1000;
const _reconcileLogLast: Map<string, { ts: number; count: number }> = new Map();
function reconcileLog(type: string, count: number, msg: string): void {
  const now = Date.now();
  const prev = _reconcileLogLast.get(type);
  if (prev && now - prev.ts < RECONCILE_LOG_TTL) return;
  _reconcileLogLast.set(type, { ts: now, count });
  console.log(msg);
}

/** deadline_sec 安全表达式：与 buildWideRow 的 NaN/负值保护同口径（宽表列为 BIGINT UNSIGNED） */
export const WIDE_DEADLINE_EXPR = `GREATEST(COALESCE(n.deadline_sec, 0), 0)`;

/**
 * deadline_sec 漂移检测（60 秒高频，只检测）。
 *
 * 为何不用指纹覆盖：deadline_sec 决定公告在搜索侧是否「活跃」，主表是生成列、宽表是
 * 静态拷贝；指纹轮转是全表小时级覆盖，过期状态若等指纹会滞后过久，故保留分钟级独立检测。
 * 修复仍走 syncWideIds（内容 + 指纹一并重建），不在此处写宽表列。
 */
export async function detectDeadlineDrift(pool: Pool, limit = 5000): Promise<number[]> {
  const [rows] = await pool.query(
    `SELECT n.id
     FROM crm_bid_notices n
     INNER JOIN crm_notice_search ns ON ns.id = n.id
     WHERE ns.deadline_sec != ${WIDE_DEADLINE_EXPR}
     LIMIT ${limit}`,
  );
  const ids = (rows as RowDataPacket[]).map((r) => Number(r.id)).filter(Boolean);
  if (ids.length > 0) {
    reconcileLog("deadline", ids.length, `[wide-table] deadline_sec 漂移待重建 ${ids.length} 条`);
  }
  return ids;
}

/**
 * Ghost 行清理：删除宽表中主表已不存在、或平台行已不可公开可见的记录。
 * 这是宽表允许的删除出口之一（另一个是 search-visibility/purgeNoticeSearch）。
 */
export async function reconcileGhostRows(pool: Pool): Promise<number[]> {
  const allDeletedIds: number[] = [];
  const MAX_ROUNDS = 10;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const [ghostRows] = await pool.query(
        `SELECT ns.id FROM crm_notice_search ns
         LEFT JOIN crm_bid_notices n ON n.id = ns.id
         WHERE n.id IS NULL
            OR (n.entry_source = 'platform' AND IFNULL(n.rfq_status, '') <> ${JSON.stringify(RFQ_STATUS.PUBLISHED)})
         LIMIT 5000`,
      );
      const ghosts = ghostRows as RowDataPacket[];
      if (ghosts.length === 0) break;

      const ids = ghosts.map(r => Number(r.id));
      allDeletedIds.push(...ids);
      const BATCH = 1000;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const ph = batch.map(() => "?").join(",");
        await pool.query(`DELETE FROM crm_notice_search WHERE id IN (${ph})`, batch);
      }
      if (ghosts.length < 5000) break;
    }
    if (allDeletedIds.length > 0) {
      console.log(`[wide-table] ghost 行清理: 删除 ${allDeletedIds.length} 条主表已不存在的记录`);
    }
    return allDeletedIds;
  } catch (e) {
    console.warn(`[wide-table] ghost 行清理失败（静默降级）:`, (e as Error).message);
    return allDeletedIds;
  }
}

/** 平台公告状态漂移检测结果：toSync 应公开可见但宽表缺行；toPurge 不可见但宽表残留 */
export interface PlatformDrift {
  toSync: number[];
  toPurge: number[];
}

/**
 * 平台公告状态漂移检测（D2 修复，只检测不修复 —— I1）
 *
 * 背景：宽表增量同步是 `id > watermark` 的纯新行扫描，而审核通过由站外后台直接写库
 *      （红线 5 允许的「受控后台直接维护数据」），老行 rfq_status 变 published 后
 *      其 id 早已在水位之下，永远不会被增量拉取。
 *
 * 口径：可见性 = `entry_source='platform'` 且 `rfq_status='published'`，与
 *      lib/utils/notice-expired 的 PLATFORM_PUBLISHED_ONLY 完全一致；
 *      过期不改变可见性（过期行由 deadline_sec 在查询侧过滤），故不纳入本检测。
 *
 * 成本：走 idx_entry_source（迁移 069），平台行数量为「用户发布量」级（远小于爬虫存量）。
 */
export async function detectPlatformStatusDrift(pool: Pool): Promise<PlatformDrift> {
  const [rows] = await pool.query(
    `SELECT n.id, ns.id AS wide_id
     FROM crm_bid_notices n
     LEFT JOIN crm_notice_search ns ON ns.id = n.id
     WHERE n.entry_source = 'platform'
       AND (
         (IFNULL(n.rfq_status, '') = ${JSON.stringify(RFQ_STATUS.PUBLISHED)} AND ns.id IS NULL)
         OR (IFNULL(n.rfq_status, '') <> ${JSON.stringify(RFQ_STATUS.PUBLISHED)} AND ns.id IS NOT NULL)
       )
     LIMIT 500`,
  );
  const toSync: number[] = [];
  const toPurge: number[] = [];
  for (const r of rows as RowDataPacket[]) {
    if (r.wide_id == null) toSync.push(Number(r.id));
    else toPurge.push(Number(r.id));
  }
  return { toSync, toPurge };
}
