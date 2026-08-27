/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 管理运维数据访问层
 * Admin Repository
 *
 * @module repos/admin.repo
 */
import "server-only";
import type { Pool, RowDataPacket } from "mysql2/promise";

export class AdminRepo {
  constructor(private pool: Pool) {}

  /** 查询近 N 天质量快照 */
  async listQualitySnapshots(days: number): Promise<RowDataPacket[]> {
    const [rows] = await this.pool.query(
      `SELECT snapshot_date, total_notices, missing_value, missing_country, missing_deadline,
              unlinked_unspsc, expired_but_active, dup_notice_cnt, created_at
       FROM crm_data_quality_snapshot
       ORDER BY snapshot_date DESC
       LIMIT ?`,
      [days],
    );
    return rows as RowDataPacket[];
  }

  /** 金额缓存回填剩余量 */
  async countAmountBackfillRemaining(parseVersion: number): Promise<number> {
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS remaining FROM crm_bid_notices n
       LEFT JOIN crm_notice_amount_cache c ON c.notice_id = n.id AND c.parse_version = ?
       WHERE c.notice_id IS NULL`,
      [parseVersion],
    );
    return Number((rows as RowDataPacket[])[0]?.remaining || 0);
  }

  /** 浏览量日汇总统计 */
  async getViewRollupStats(): Promise<{ rows_total: number; latest_day: string | null }> {
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS rows_total, MAX(stat_day) AS latest_day FROM crm_notice_view_daily`,
    );
    const stat = (rows as RowDataPacket[])[0];
    return { rows_total: Number(stat?.rows_total || 0), latest_day: stat?.latest_day || null };
  }

  /** A/B 推荐指标按 variant 聚合 */
  async listRecoAbMetrics(sinceDays: number): Promise<RowDataPacket[]> {
    const [rows] = await this.pool.query(
      `SELECT
         COALESCE(variant, 'control') AS variant,
         COUNT(DISTINCT user_key) AS users,
         SUM(action = 'impression') AS impressions,
         SUM(action = 'click') AS clicks,
         SUM(action = 'unlock') AS unlocks,
         SUM(action = 'dismiss') AS dismisses,
         ROUND(SUM(action = 'click') / NULLIF(SUM(action = 'impression'), 0), 4) AS ctr,
         ROUND(SUM(action = 'unlock') / NULLIF(SUM(action = 'impression'), 0), 4) AS unlock_rate,
         ROUND(SUM(action = 'dismiss') / NULLIF(SUM(action = 'impression'), 0), 4) AS dismiss_rate,
         ROUND(AVG(CASE WHEN action = 'unlock' THEN position END), 2) AS avg_unlock_position
       FROM crm_user_reco_feedback
       WHERE created_at >= NOW() - INTERVAL ? DAY
       GROUP BY COALESCE(variant, 'control')
       ORDER BY variant`,
      [sinceDays],
    );
    return rows as RowDataPacket[];
  }

  /** 检查指定表是否存在 */
  async listExistingTables(tables: string[]): Promise<Set<string>> {
    const [rows] = await this.pool.query(
      `SELECT TABLE_NAME AS table_name
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${tables.map(() => "?").join(",")})`,
      tables,
    );
    return new Set((rows as RowDataPacket[]).map((r) => r.table_name));
  }

  /** 检查指定表的列信息 */
  async listTableColumns(tables: string[]): Promise<Map<string, Set<string>>> {
    const [rows] = await this.pool.query(
      `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${tables.map(() => "?").join(",")})`,
      tables,
    );
    const columnsByTable = new Map<string, Set<string>>();
    for (const row of rows as RowDataPacket[]) {
      if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Set());
      columnsByTable.get(row.table_name)?.add(row.column_name);
    }
    return columnsByTable;
  }

  /** P3-6 安全修复：表名插值白名单——仅允许字母/数字/下划线，阻断 SQL 注入 */
  private static readonly TABLE_NAME_RE = /^[A-Za-z0-9_]+$/;

  /** 统计指定表的行数 */
  async countTableRows(table: string): Promise<number> {
    if (!AdminRepo.TABLE_NAME_RE.test(table)) {
      throw new Error(`INVALID_TABLE_NAME: ${table}`);
    }
    const [rows] = await this.pool.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
    return Number((rows as RowDataPacket[])[0]?.total || 0);
  }
}
