/**
 * UNSPSC 桥接表全量同步服务
 * UNSPSC Bridge Table Full Sync Service
 *
 * @module server/services/bridge-sync/full-sync
 * @description 全量回填 bridge 表：跳过已有记录，分批处理所有数据，避免内存溢出。
 *              专为后台异步调用设计，不阻塞服务启动。
 *
 *              性能优化：启动时加载 UNSPSC 类目树到内存缓存，消除逐行 N+1 查询。
 *              缓存加载失败时自动降级到逐行查询模式。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  type UnspscCodeRow,
  normalizeUnspscCodes,
  getUnspscPath,
  loadUnspscCache,
  getPathFromCache,
  getCodeIdFromCache,
  getUnspscLevelFromCache,
} from "../unspsc/index";

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
 */
export async function syncUnspscBridgeFull(dbPool: any, source: "opportunity" | "notice"): Promise<{ processed: number; skipped: number }> {
  const sourceTable = source === "opportunity" ? "crm_bid_opportunities" : "crm_bid_notices";
  const bridgeTable = source === "opportunity" ? "crm_bid_opportunity_unspsc_codes" : "crm_bid_notice_unspsc_codes";
  const fk = source === "opportunity" ? "opportunity_id" : "notice_id";
  const BATCH = 200;
  let processed = 0;
  let skipped = 0;
  let cursorId = 0; // P1-20 安全修复：改用游标推进，防止写入失败时死循环

  console.log(`[BridgeSync] 开始全量回填 ${source} bridge 表...`);

  // 加载 UNSPSC 类目树到内存（消除 N+1：每码 7 次 SQL → 0 次 SQL）
  const cacheLoaded = await loadUnspscCache(dbPool);
  if (cacheLoaded) {
    console.log(`[BridgeSync] ${source}: 使用内存缓存模式（批量写入）`);
  } else {
    console.log(`[BridgeSync] ${source}: 缓存不可用，降级到逐行查询模式`);
  }

  while (true) {
    // P1-20 安全修复：用游标 `s.id > ?` 推进，而非 LEFT JOIN 无游标查询
    // 确保即使某批写入失败，游标仍向前推进，不会死循环
    const [rows] = await dbPool.query(
      `SELECT s.id, s.notice_id, s.unspsc_codes
       FROM ${sourceTable} s
       WHERE s.id > ? AND s.unspsc_codes IS NOT NULL
       ORDER BY s.id ASC
       LIMIT ${BATCH}`,
      [cursorId]
    );

    if ((rows as RowDataPacket[]).length === 0) break;

    // 更新游标到本批最后一行
    cursorId = (rows as RowDataPacket[])[(rows as RowDataPacket[]).length - 1].id;

    if (cacheLoaded) {
      // ── 快速路径：缓存 + 批量写入 ──
      const allBridgeRows: BridgeRowToInsert[] = [];
      for (const row of rows as RowDataPacket[]) {
        try {
          const bridgeRows = prepareBridgeRowsFromCache(row, fk);
          allBridgeRows.push(...bridgeRows);
          processed++;
        } catch (err: unknown) {
          skipped++;
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[BridgeSync] 跳过 ${source} id=${row.id}: ${msg}`);
        }
      }
      if (allBridgeRows.length > 0) {
        try {
          await batchUpsertBridgeRows(dbPool, bridgeTable, fk, allBridgeRows);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[BridgeSync] 批量写入失败，跳过本批 ${allBridgeRows.length} 行: ${msg}`);
        }
      }
    } else {
      // ── 降级路径：逐行查询（缓存不可用时） ──
      for (const row of rows as RowDataPacket[]) {
        try {
          await syncUnspscBridgeRow(dbPool, bridgeTable, fk, row);
          processed++;
        } catch (err: unknown) {
          skipped++;
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[BridgeSync] 跳过 ${source} id=${row.id}: ${msg}`);
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
