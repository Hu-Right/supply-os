/**
 * 宽表对账逻辑
 * Wide Table Reconciliation
 *
 * @module server/services/search-sync/wide-row-reconcile
 * @description 检测并修复宽表与主表之间的数据不一致：
 *              - deadline_sec 对账（主表 VIRTUAL 列 vs 宽表静态拷贝）
 *              - Ghost 行清理（主表删除后宽表残留）
 *              - is_featured 对账（精选标注同步）
 *              - 译文对账（翻译表滞后修复）
 *              - 精准码对账（approved 候选码变更感知）
 *              - 内容漂移对账（title/description 外部更新修复）
 *
 *              从 wide-row-builder.ts 拆出，职责单一：只负责对账，不负责数据构建。
 */
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

/**
 * deadline_sec 对账：检测主表与宽表之间的 deadline_sec 不一致并修复
 *
 * 解决问题：主表 deadline_sec 是 VIRTUAL 生成列（自动跟随 deadline 计算），
 * 宽表 deadline_sec 是普通列（静态拷贝）。当主表 deadline 变更时，
 * 宽表 deadline_sec 不会自动更新，导致已过期的记录被误判为"无截止日期"(0)。
 *
 * [修复 030]：宽表 deadline_sec 已扩容为 BIGINT UNSIGNED，不再需要 INT UNSIGNED
 * 溢出截断。仅保留负值保护（GREATEST(..., 0)），防止主表生成列异常负值传入。
 *
 * 对账逻辑：循环检测并修复不一致记录（每轮最多 5000 条，最多 10 轮），
 * 返回所有变更 ID 供上层同步到 Meilisearch。
 */
export async function reconcileDeadlineSec(pool: Pool): Promise<number[]> {
  const allIds: number[] = [];
  const MAX_ROUNDS = 10;
  const SAFE_EXPR = `GREATEST(COALESCE(n.deadline_sec, 0), 0)`;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const [mismatchRows] = await pool.query(
        `SELECT n.id, ${SAFE_EXPR} AS deadline_sec
         FROM crm_bid_notices n
         INNER JOIN crm_notice_search ns ON ns.id = n.id
         WHERE ns.deadline_sec != ${SAFE_EXPR}
         LIMIT 5000`,
      );
      const mismatches = mismatchRows as RowDataPacket[];
      if (mismatches.length === 0) break;

      const ids = mismatches.map(r => Number(r.id));
      allIds.push(...ids);
      const BATCH = 1000;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const ph = batch.map(() => "?").join(",");
        await pool.query(
          `UPDATE crm_notice_search ns
           INNER JOIN crm_bid_notices n ON n.id = ns.id
           SET ns.deadline_sec = ${SAFE_EXPR}
           WHERE ns.id IN (${ph})`,
          batch,
        );
      }
      if (mismatches.length < 5000) break;
    }
    if (allIds.length > 0) {
      reconcileLog("deadline", allIds.length, `[wide-table] deadline_sec 对账修复 ${allIds.length} 条不一致记录`);
    }
    return allIds;
  } catch (e) {
    console.warn(`[wide-table] deadline_sec 对账失败（静默降级）:`, (e as Error).message);
    return allIds;
  }
}

/**
 * Ghost 行清理：删除宽表中主表已不存在的记录
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

/**
 * is_featured 对账：同步主表的 is_featured 状态到宽表
 */
export async function reconcileIsFeatured(pool: Pool): Promise<number[]> {
  const allIds: number[] = [];
  const MAX_ROUNDS = 10;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const [mismatchRows] = await pool.query(
        `SELECT n.id, n.is_featured
         FROM crm_bid_notices n
         INNER JOIN crm_notice_search ns ON ns.id = n.id
         WHERE ns.is_featured != n.is_featured
         LIMIT 5000`,
      );
      const mismatches = mismatchRows as RowDataPacket[];
      if (mismatches.length === 0) break;

      const ids = mismatches.map(r => Number(r.id));
      allIds.push(...ids);
      const BATCH = 1000;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const ph = batch.map(() => "?").join(",");
        await pool.query(
          `UPDATE crm_notice_search ns
           INNER JOIN crm_bid_notices n ON n.id = ns.id
           SET ns.is_featured = n.is_featured
           WHERE ns.id IN (${ph})`,
          batch,
        );
      }
      if (mismatches.length < 5000) break;
    }
    if (allIds.length > 0) {
      reconcileLog("featured", allIds.length, `[wide-table] is_featured 对账修复 ${allIds.length} 条不一致记录`);
    }
    return allIds;
  } catch (e) {
    console.warn(`[wide-table] is_featured 对账失败（静默降级）:`, (e as Error).message);
    return allIds;
  }
}

/**
 * 译文对账：检测宽表 title_zh 与翻译表 title_tr（lang='zh'）不一致的行。
 */
export async function reconcileTranslations(pool: Pool): Promise<number[]> {
  try {
    const [mismatchRows] = await pool.query(
      `SELECT ns.id
       FROM crm_notice_search ns
       INNER JOIN crm_notice_translations t
         ON t.notice_id = ns.id AND t.lang = 'zh'
       WHERE NOT (COALESCE(ns.title_zh, '') = COALESCE(t.title_tr, ''))
       LIMIT 200`,
    );
    const ids = (mismatchRows as RowDataPacket[]).map((r) => Number(r.id)).filter(Boolean);
    if (ids.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const ph = batch.map(() => "?").join(",");
        await pool.query(
          `UPDATE crm_notice_search ns
           INNER JOIN crm_notice_translations t
             ON t.notice_id = ns.id AND t.lang = 'zh'
           SET ns.title_zh = LEFT(COALESCE(t.title_tr, ''), 1000),
               ns.description_zh = LEFT(COALESCE(t.description_tr, ''), 2000)
           WHERE ns.id IN (${ph})`,
          batch,
        );
      }
      reconcileLog("translation", ids.length, `[wide-table] 译文对账修复 ${ids.length} 条 title_zh 滞后记录`);
    }
    return ids;
  } catch (e) {
    console.warn(`[wide-table] 译文对账失败（静默降级）:`, (e as Error).message);
    return [];
  }
}

/**
 * precise 对账：检测宽表精准码与 candidates 表实际状态之间的差异。
 * 仅返回实际存在差异的记录 ID（变更感知，非全量扫描）。
 */
export async function reconcilePreciseCodes(pool: Pool): Promise<number[]> {
  try {
    const [rows] = await pool.query(`
      SELECT n.id, n.notice_id,
             ns.precise_level1 AS wide_val,
             (SELECT GROUP_CONCAT(DISTINCT c2.candidate_code ORDER BY c2.candidate_code SEPARATOR ',')
              FROM crm_bid_opportunities o2
              JOIN crm_bid_opportunity_unspsc_candidates c2
                ON c2.opportunity_id = o2.id AND c2.status = 'approved'
              WHERE o2.source_notice_id = n.notice_id
             ) AS expected_val
      FROM crm_bid_notices n
      INNER JOIN crm_notice_search ns ON ns.id = n.id
      WHERE EXISTS (
        SELECT 1 FROM crm_bid_opportunities o
        JOIN crm_bid_opportunity_unspsc_candidates c
          ON c.opportunity_id = o.id AND c.status = 'approved'
        WHERE o.source_notice_id = n.notice_id
      )
      HAVING NOT (
        (wide_val IS NULL AND expected_val IS NULL)
        OR (wide_val IS NOT NULL AND expected_val IS NOT NULL AND wide_val = expected_val)
      )
      LIMIT 2000
    `);
    const ids = (rows as RowDataPacket[]).map((r) => Number(r.id)).filter(Boolean);
    if (ids.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const ph = batch.map(() => "?").join(",");
        await pool.query(
          `UPDATE crm_notice_search ns
           INNER JOIN crm_bid_notices n ON n.id = ns.id
           SET ns.precise_level1 = (
             SELECT GROUP_CONCAT(DISTINCT c2.candidate_code ORDER BY c2.candidate_code SEPARATOR ',')
             FROM crm_bid_opportunities o2
             JOIN crm_bid_opportunity_unspsc_candidates c2
               ON c2.opportunity_id = o2.id AND c2.status = 'approved'
             WHERE o2.source_notice_id = n.notice_id
           )
           WHERE ns.id IN (${ph})`,
          batch,
        );
      }
      reconcileLog("precise", ids.length, `[wide-table] precise 对账修复 ${ids.length} 条精准码实际变更`);
    }
    return ids;
  } catch (e) {
    console.warn(`[wide-table] precise 对账失败（静默降级）:`, (e as Error).message);
    return [];
  }
}

/**
 * 内容漂移对账：检测主表 title/description 变更后宽表滞后的记录并修复
 */
export async function reconcileContentDrift(pool: Pool): Promise<number[]> {
  try {
    const [maxIdRows] = await pool.query(`
      SELECT COALESCE(MAX(id), 0) as max_id FROM crm_notice_search
    `);
    const maxId = Number((maxIdRows as RowDataPacket[])[0]?.max_id || 0);
    if (maxId === 0) return [];

    const BATCH_SIZE = 1000;
    const MAX_BATCHES = 2;
    const allChangedIds: number[] = [];

    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const startId = batch * BATCH_SIZE + 1;
      const endId = startId + BATCH_SIZE - 1;

      const [rows] = await pool.query(`
        SELECT n.id
        FROM crm_bid_notices n
        INNER JOIN crm_notice_search ns ON ns.id = n.id
        WHERE n.id BETWEEN ? AND ?
          AND (
            ns.title != LEFT(n.title, 1000)
            OR ns.description != LEFT(n.description, 2000)
            OR ns.reference != LEFT(n.reference, 200)
          )
        LIMIT 2000
      `, [startId, endId]);

      const ids = (rows as RowDataPacket[]).map((r) => Number(r.id)).filter(Boolean);
      allChangedIds.push(...ids);

      if (ids.length === 0 && endId < maxId) continue;
      if (ids.length > 0 || endId >= maxId) break;
    }

    if (allChangedIds.length > 0) {
      const FIX_BATCH = 500;
      for (let i = 0; i < allChangedIds.length; i += FIX_BATCH) {
        const batchIds = allChangedIds.slice(i, i + FIX_BATCH);
        const ph = batchIds.map(() => "?").join(",");
        await pool.query(
          `UPDATE crm_notice_search ns
           INNER JOIN crm_bid_notices n ON n.id = ns.id
           SET ns.title = LEFT(n.title, 1000),
               ns.description = LEFT(n.description, 2000),
               ns.reference = LEFT(n.reference, 200)
           WHERE ns.id IN (${ph})`,
          batchIds,
        );
      }
      reconcileLog("content_drift", allChangedIds.length, `[wide-table] 内容漂移对账修复 ${allChangedIds.length} 条 title/description 滞后记录`);
    }
    return allChangedIds;
  } catch (e) {
    console.warn(`[wide-table] 内容漂移对账失败（静默降级）:`, (e as Error).message);
    return [];
  }
}
