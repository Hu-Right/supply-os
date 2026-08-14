/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Pool, RowDataPacket } from "mysql2/promise";
import { type UnspscCodeRow, normalizeUnspscCodes, getUnspscPath, loadUnspscCache, getPathFromCache, getCodeIdFromCache, getUnspscLevelFromCache } from "./unspsc";

// ── 桥接表批量写入类型（消除 N+1 查询）──
interface BridgeRowToInsert {
  fkValue: string;
  codeId: number;
  code: string;
  level: number;
  level1_id: number | null;
  level2_id: number | null;
  level3_id: number | null;
  level4_id: number | null;
  level5_id: number | null;
}

/** 从内存缓存准备单条源记录的桥接行（0 次 SQL） */
function prepareBridgeRowsFromCache(row: RowDataPacket, fk: string): BridgeRowToInsert[] {
  const codes = normalizeUnspscCodes(row.unspsc_codes);
  const result: BridgeRowToInsert[] = [];
  for (const item of codes) {
    const rawCode = String(item?.code || item || "").replace(/\D/g, "").slice(0, 8);
    if (!rawCode) continue;
    const codeId = getCodeIdFromCache(rawCode);
    if (codeId === undefined) continue;
    const level = getUnspscLevelFromCache(codeId);
    if (level === undefined) continue;
    const path = getPathFromCache(codeId);
    result.push({
      fkValue: String(row.notice_id ?? row.id),
      codeId, code: rawCode, level,
      ...path,
    });
  }
  return result;
}

/** 批量 upsert 桥接表（单条 SQL 替代 N 次逐行 INSERT） */
async function batchUpsertBridgeRows(
  dbPool: any, bridgeTable: string, fk: string, rows: BridgeRowToInsert[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const BATCH = 500;
  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
    const params: any[] = [];
    for (const row of batch) {
      params.push(row.fkValue, row.codeId, row.code, row.level,
        row.level1_id, row.level2_id, row.level3_id, row.level4_id, row.level5_id);
    }
    await dbPool.query(
      `INSERT INTO ${bridgeTable}
        (${fk}, code_id, code, level, level1_id, level2_id, level3_id, level4_id, level5_id)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         code_id = VALUES(code_id), code = VALUES(code), level = VALUES(level),
         level1_id = VALUES(level1_id), level2_id = VALUES(level2_id),
         level3_id = VALUES(level3_id), level4_id = VALUES(level4_id), level5_id = VALUES(level5_id)`,
      params,
    );
    total += batch.length;
  }
  return total;
}

/**
 * 单行写入 bridge 表（降级路径：缓存不可用时逐行查询）
 * 每码需 7 次 SQL（1 次码查找 + 6 次路径回溯 + 1 次写入），已被批量路径替代
 */
async function syncUnspscBridgeRow(dbPool: any, bridgeTable: string, fk: string, row: RowDataPacket) {
  const codes = normalizeUnspscCodes(row.unspsc_codes);
  for (const item of codes) {
    const rawCode = String(item?.code || item || "").replace(/\D/g, "").slice(0, 8);
    if (!rawCode) continue;
    const [codeRows] = await dbPool.query(
      "SELECT id, code, level FROM crm_unspsc_codes WHERE code = ? LIMIT 1",
      [rawCode]
    );
    const codeRow = (codeRows as UnspscCodeRow[])[0];
    if (!codeRow) continue;
    const path = await getUnspscPath(dbPool, codeRow.id);
    await dbPool.execute(
      `INSERT INTO ${bridgeTable}
        (${fk}, code_id, code, level, level1_id, level2_id, level3_id, level4_id, level5_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         code_id = VALUES(code_id), code = VALUES(code), level = VALUES(level),
         level1_id = VALUES(level1_id), level2_id = VALUES(level2_id),
         level3_id = VALUES(level3_id), level4_id = VALUES(level4_id), level5_id = VALUES(level5_id)`,
      [
        row.notice_id ?? row.id,
        codeRow.id, rawCode, codeRow.level,
        path.level1_id, path.level2_id, path.level3_id, path.level4_id, path.level5_id,
      ]
    );
  }
}

/**
 * 全量回填 bridge 表：跳过已有记录，分批处理所有数据，避免内存溢出
 * 专为后台异步调用设计，不阻塞服务启动
 *
 * 性能优化：启动时加载 UNSPSC 类目树到内存缓存，消除逐行 N+1 查询。
 * 缓存加载失败时自动降级到逐行查询模式（getUnspscPath + syncUnspscBridgeRow）。
 */
export async function syncUnspscBridgeFull(dbPool: any, source: "opportunity" | "notice"): Promise<{ processed: number; skipped: number }> {
  const sourceTable = source === "opportunity" ? "crm_bid_opportunities" : "crm_bid_notices";
  const bridgeTable = source === "opportunity" ? "crm_bid_opportunity_unspsc_codes" : "crm_bid_notice_unspsc_codes";
  const fk = source === "opportunity" ? "opportunity_id" : "notice_id";
  const BATCH = 200;
  let processed = 0;
  let skipped = 0;

  console.log(`[BridgeSync] 开始全量回填 ${source} bridge 表...`);

  // 加载 UNSPSC 类目树到内存（消除 N+1：每码 7 次 SQL → 0 次 SQL）
  const cacheLoaded = await loadUnspscCache(dbPool);
  if (cacheLoaded) {
    console.log(`[BridgeSync] ${source}: 使用内存缓存模式（批量写入）`);
  } else {
    console.log(`[BridgeSync] ${source}: 缓存不可用，降级到逐行查询模式`);
  }

  while (true) {
    // 只取尚未写入 bridge 表的记录，减少重复处理
    const [rows] = await dbPool.query(
      `SELECT s.id, s.notice_id, s.unspsc_codes
       FROM ${sourceTable} s
       LEFT JOIN ${bridgeTable} b ON b.${fk} = s.notice_id
       WHERE s.unspsc_codes IS NOT NULL AND b.id IS NULL
       ORDER BY s.id ASC
       LIMIT ${BATCH}`
    );

    if ((rows as RowDataPacket[]).length === 0) break;

    if (cacheLoaded) {
      // ── 快速路径：缓存 + 批量写入 ──
      const allBridgeRows: BridgeRowToInsert[] = [];
      for (const row of rows as RowDataPacket[]) {
        try {
          const bridgeRows = prepareBridgeRowsFromCache(row, fk);
          allBridgeRows.push(...bridgeRows);
          processed++;
        } catch (err: any) {
          skipped++;
          console.warn(`[BridgeSync] 跳过 ${source} id=${row.id}: ${err.message}`);
        }
      }
      if (allBridgeRows.length > 0) {
        try {
          await batchUpsertBridgeRows(dbPool, bridgeTable, fk, allBridgeRows);
        } catch (err: any) {
          console.warn(`[BridgeSync] 批量写入失败，跳过本批 ${allBridgeRows.length} 行: ${err.message}`);
        }
      }
    } else {
      // ── 降级路径：逐行查询（缓存不可用时） ──
      for (const row of rows as RowDataPacket[]) {
        try {
          await syncUnspscBridgeRow(dbPool, bridgeTable, fk, row);
          processed++;
        } catch (err: any) {
          skipped++;
          console.warn(`[BridgeSync] 跳过 ${source} id=${row.id}: ${err.message}`);
        }
      }
    }

    console.log(`[BridgeSync] ${source} 进度: 已处理 ${processed} 条，跳过 ${skipped} 条`);

    // 每批次短暂让出事件循环，避免长时间占用连接池
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.log(`[BridgeSync] ${source} 全量回填完成: 共处理 ${processed} 条，跳过 ${skipped} 条` +
    (cacheLoaded ? "（缓存模式）" : "（逐行模式）"));
  return { processed, skipped };
}

// 本地差异 #8：C.3.5 数据质量快照采集——对外部表 crm_bid_notices/桥接表只读扫描，
// 结果 UPSERT 进自有表 crm_data_quality_snapshot（同日重跑覆盖）。无定时器，仅 admin 端点手动触发。
// 实施注记：初版单条巨型 SQL（逐行相关 NOT EXISTS）在 10.8 万 × 58 万行上实测 20 分钟不返回，
// 已拆为三条简单查询：主表单遍聚合 + 派生表 LEFT JOIN（走桥接 uk_notice_code 索引）+ 独立去重统计
export async function captureDataQualitySnapshot(dbPool: any) {
  // P1 性能优化：使用生成列 deadline_sec 替代表达式
  // ① 主表单遍聚合（无子查询）
  const [baseRows] = await dbPool.query(
    `SELECT
       COUNT(*) AS total_notices,
       SUM(n.estimated_value IS NULL OR TRIM(n.estimated_value) = '') AS missing_value,
       SUM(n.country IS NULL OR TRIM(n.country) = '') AS missing_country,
       SUM(n.deadline_ts IS NULL) AS missing_deadline,
       SUM((n.is_expired = 0 OR n.is_expired IS NULL)
         AND n.deadline_ts IS NOT NULL
         AND n.deadline_sec < UNIX_TIMESTAMP(NOW())) AS expired_but_active
     FROM crm_bid_notices n`
  );
  // ② 未桥接数：DISTINCT 派生表走索引，再与主表 hash join，避免逐行探测
  const [unlinkedRows] = await dbPool.query(
    `SELECT COUNT(*) AS unlinked_unspsc
     FROM crm_bid_notices n
     LEFT JOIN (SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes) b ON b.notice_id = n.notice_id
     WHERE b.notice_id IS NULL`
  );
  // ③ F.5 重复检测：external notice_id 非空行的重复数（NULL/空串不计入）
  const [dupRows] = await dbPool.query(
    `SELECT COUNT(*) - COUNT(DISTINCT d.notice_id) AS dup_notice_cnt
     FROM crm_bid_notices d
     WHERE d.notice_id IS NOT NULL AND TRIM(d.notice_id) <> ''`
  );
  const base = (baseRows as RowDataPacket[])[0] || ({} as RowDataPacket);
  const metrics = {
    total_notices: Number(base.total_notices || 0),
    missing_value: Number(base.missing_value || 0),
    missing_country: Number(base.missing_country || 0),
    missing_deadline: Number(base.missing_deadline || 0),
    unlinked_unspsc: Number((unlinkedRows as RowDataPacket[])[0]?.unlinked_unspsc || 0),
    expired_but_active: Number(base.expired_but_active || 0),
    dup_notice_cnt: Number((dupRows as RowDataPacket[])[0]?.dup_notice_cnt || 0),
  };
  await dbPool.execute(
    `INSERT INTO crm_data_quality_snapshot
       (snapshot_date, total_notices, missing_value, missing_country, missing_deadline, unlinked_unspsc, expired_but_active, dup_notice_cnt)
     VALUES (CURDATE(), ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       total_notices = VALUES(total_notices), missing_value = VALUES(missing_value),
       missing_country = VALUES(missing_country), missing_deadline = VALUES(missing_deadline),
       unlinked_unspsc = VALUES(unlinked_unspsc), expired_but_active = VALUES(expired_but_active),
       dup_notice_cnt = VALUES(dup_notice_cnt)`,
    [
      metrics.total_notices,
      metrics.missing_value,
      metrics.missing_country,
      metrics.missing_deadline,
      metrics.unlinked_unspsc,
      metrics.expired_but_active,
      metrics.dup_notice_cnt,
    ]
  );
  return metrics;
}
