/**
 * 浏览量日汇总服务
 * View Daily Rollup Service
 *
 * @module server/services/amount/view-rollup
 * @description 本地差异 #12：T-E2 浏览量日汇总聚合（E.2）。覆盖式写入（ON DUPLICATE KEY UPDATE 取 VALUES）
 *              保证幂等——重跑同日不翻倍。默认全量重算（当前 views 表仅数百行）；量大后传 sinceDays 增量：
 *              注意增量窗口必须覆盖整天（DATE(viewed_at) 粒度），否则边界日会被窗口内的部分计数覆盖
 */
import type { RowDataPacket } from "mysql2/promise";

/**
 * 汇总公告日浏览量
 *
 * @param dbPool - 数据库连接池
 * @param sinceDays - 汇总最近 N 天（默认 0 表示全量）
 * @returns 影响行数
 */
export async function rollupNoticeViewDaily(dbPool: any, sinceDays = 0): Promise<{ affected: number }> {
  const windowWhere = sinceDays > 0 ? "AND viewed_at >= CURDATE() - INTERVAL ? DAY" : "";
  const params = sinceDays > 0 ? [sinceDays] : [];
  const [result] = await dbPool.query(
    `INSERT INTO crm_notice_view_daily (notice_id, stat_day, view_cnt, uniq_user_cnt)
     SELECT notice_id, DATE(viewed_at), COUNT(*), COUNT(DISTINCT user_key)
     FROM crm_user_notice_views
     WHERE notice_id IS NOT NULL ${windowWhere}
     GROUP BY notice_id, DATE(viewed_at)
     ON DUPLICATE KEY UPDATE view_cnt = VALUES(view_cnt), uniq_user_cnt = VALUES(uniq_user_cnt)`,
    params
  );
  return { affected: Number((result as RowDataPacket)?.affectedRows || 0) };
}
