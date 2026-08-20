/**
 * 数据质量快照采集服务
 * Data Quality Snapshot Service
 *
 * @module server/services/quality-monitor/snapshot
 * @description 对外部表 crm_bid_notices/桥接表只读扫描，结果 UPSERT 进自有表 crm_data_quality_snapshot
 *              （同日重跑覆盖）。无定时器，仅 admin 端点手动触发。
 *
 *              实施注记：初版单条巨型 SQL（逐行相关 NOT EXISTS）在 10.8 万 × 58 万行上实测 20 分钟不返回，
 *              已拆为三条简单查询：主表单遍聚合 + 派生表 LEFT JOIN（走桥接 uk_notice_code 索引）+ 独立去重统计
 */
import type { RowDataPacket } from "mysql2/promise";

/**
 * 采集数据质量快照
 *
 * @param dbPool - 数据库连接池
 * @returns 采集的指标数据
 */
export async function captureDataQualitySnapshot(dbPool: any) {
  // P1 性能优化：使用生成列 deadline_sec 替代表达式
  // ① 主表单遍聚合（无子查询）
  const [baseRows] = await dbPool.query(
    `SELECT
       COUNT(*) AS total_notices,
       SUM(n.estimated_value IS NULL OR TRIM(n.estimated_value) = '') AS missing_value,
       SUM(n.country IS NULL OR TRIM(n.country) = '') AS missing_country,
       SUM(n.deadline_sec = 0) AS missing_deadline,
       SUM((n.is_expired = 0 OR n.is_expired IS NULL)
         AND n.deadline_sec > 0
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
