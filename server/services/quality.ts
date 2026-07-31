/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type UnspscCodeRow, normalizeUnspscCodes, getUnspscPath } from "./unspsc";

export async function syncUnspscBridge(dbPool: any, source: "opportunity" | "notice") {
  const sourceTable = source === "opportunity" ? "crm_bid_opportunities" : "crm_bid_notices";
  const bridgeTable = source === "opportunity" ? "crm_bid_opportunity_unspsc_codes" : "crm_bid_notice_unspsc_codes";
  const fk = source === "opportunity" ? "opportunity_id" : "notice_id";
  // 口径说明：桥接表 notice_id 关联的是主表 notice_id（外部编号），非 id（自增主键）。
  // 因此源查询需同时取 notice_id，写入桥接表时用 row.notice_id。
  const [rows] = await dbPool.query(
    `SELECT id, notice_id, unspsc_codes FROM ${sourceTable} WHERE unspsc_codes IS NOT NULL ORDER BY id DESC LIMIT 500`
  );

  for (const row of rows as any[]) {
    await syncUnspscBridgeRow(dbPool, bridgeTable, fk, row);
  }
}

/**
 * 单行写入 bridge 表的公共逻辑，供快速同步和全量回填复用
 */
async function syncUnspscBridgeRow(dbPool: any, bridgeTable: string, fk: string, row: any) {
  const codes = normalizeUnspscCodes(row.unspsc_codes);
  for (const item of codes) {
    const rawCode = String(item?.code || item || "").replace(/\D/g, "").slice(0, 8);
    if (!rawCode) continue;
    const [codeRows] = await dbPool.query(
      "SELECT id, code, level FROM crm_unspsc_codes WHERE code = ? LIMIT 1",
      [rawCode]
    );
    const codeRow = (codeRows as UnspscCodeRow[])[0];
    // 勘误（线 B）：桥接表 level1_id~level5_id 存的是 crm_unspsc_codes.id（varchar），
    // 不是码串前缀。此前用 rawCode.slice(0,N) 写码前缀，与读侧 buildNoticeUnspscFilter
    // 的 id 等值口径不一致，是脏数据的产生源。改为复用 getUnspscPath 沿 parent_id
    // 回溯填祖先类目 id，并用类目自身 level（不再靠 ceil(len/2) 猜）。
    if (!codeRow) continue; // 类目树查不到该码：跳过，不再制造 code_id=null 的脏行
    const path = await getUnspscPath(dbPool, codeRow.id);

    await dbPool.execute(
      `INSERT IGNORE INTO ${bridgeTable}
        (${fk}, code_id, code, level, level1_id, level2_id, level3_id, level4_id, level5_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.notice_id ?? row.id,
        codeRow.id,
        rawCode,
        codeRow.level,
        path.level1_id,
        path.level2_id,
        path.level3_id,
        path.level4_id,
        path.level5_id,
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
  let offset = 0;
  let processed = 0;
  let skipped = 0;

  console.log(`[BridgeSync] 开始全量回填 ${source} bridge 表...`);

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

    if ((rows as any[]).length === 0) break;

    for (const row of rows as any[]) {
      try {
        await syncUnspscBridgeRow(dbPool, bridgeTable, fk, row);
        processed++;
      } catch (err: any) {
        // 单条失败不中断批次，记录跳过
        skipped++;
        console.warn(`[BridgeSync] 跳过 ${source} id=${row.id}: ${err.message}`);
      }
    }

    offset += (rows as any[]).length;
    console.log(`[BridgeSync] ${source} 进度: 已处理 ${processed} 条，跳过 ${skipped} 条`);

    // 每批次短暂让出事件循环，避免长时间占用连接池
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.log(`[BridgeSync] ${source} 全量回填完成: 共处理 ${processed} 条，跳过 ${skipped} 条`);
  return { processed, skipped };
}

// 本地差异 #8：C.3.5 数据质量快照采集——对外部表 crm_bid_notices/桥接表只读扫描，
// 结果 UPSERT 进自有表 crm_data_quality_snapshot（同日重跑覆盖）。无定时器，仅 admin 端点手动触发。
// 实施注记：初版单条巨型 SQL（逐行相关 NOT EXISTS）在 10.8 万 × 58 万行上实测 20 分钟不返回，
// 已拆为三条简单查询：主表单遍聚合 + 派生表 LEFT JOIN（走桥接 uk_notice_code 索引）+ 独立去重统计
export async function captureDataQualitySnapshot(dbPool: any) {
  // deadline_ts 秒/毫秒混存（G.8 勘误 1），比较前统一折算成秒
  const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
  // ① 主表单遍聚合（无子查询）
  const [baseRows] = await dbPool.query(
    `SELECT
       COUNT(*) AS total_notices,
       SUM(n.estimated_value IS NULL OR TRIM(n.estimated_value) = '') AS missing_value,
       SUM(n.country IS NULL OR TRIM(n.country) = '') AS missing_country,
       SUM(n.deadline_ts IS NULL) AS missing_deadline,
       SUM((n.is_expired = 0 OR n.is_expired IS NULL)
         AND n.deadline_ts IS NOT NULL
         AND ${deadlineSecExpr} < UNIX_TIMESTAMP(NOW())) AS expired_but_active
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
  const base = (baseRows as any[])[0] || {};
  const metrics = {
    total_notices: Number(base.total_notices || 0),
    missing_value: Number(base.missing_value || 0),
    missing_country: Number(base.missing_country || 0),
    missing_deadline: Number(base.missing_deadline || 0),
    unlinked_unspsc: Number((unlinkedRows as any[])[0]?.unlinked_unspsc || 0),
    expired_but_active: Number(base.expired_but_active || 0),
    dup_notice_cnt: Number((dupRows as any[])[0]?.dup_notice_cnt || 0),
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
