/**
 * 金额缓存回填服务
 * Amount Cache Backfill Service
 *
 * @module server/services/amount/cache-backfill
 * @description 本地差异 #10：金额缓存回填。noticeIds 给定=懒填充（推荐当页缺失行，量小）；
 *              未给定=admin 批量回填一批（≤batchLimit 行，短事务、可中断续跑——按缓存缺失/过版续扫）
 */
import type { RowDataPacket } from "mysql2/promise";
import { AMOUNT_PARSE_VERSION, parseEstimatedValue } from "./parser";

/**
 * 回填公告金额缓存
 *
 * @param dbPool - 数据库连接池
 * @param noticeIds - 指定公告 ID（可选，不指定则批量回填）
 * @param batchLimit - 批量限制（默认 2000）
 * @returns 处理结果
 */
export async function backfillNoticeAmountCache(dbPool: any, noticeIds?: number[], batchLimit = 2000): Promise<{ processed: number }> {
  const idFilter = noticeIds && noticeIds.length ? `AND n.id IN (${noticeIds.map(() => "?").join(",")})` : "";
  const [rows] = await dbPool.query(
    `SELECT n.id, n.estimated_value, n.country
     FROM crm_bid_notices n
     LEFT JOIN crm_notice_amount_cache c ON c.notice_id = n.id AND c.parse_version = ?
     WHERE c.notice_id IS NULL ${idFilter}
     LIMIT ?`,
    [AMOUNT_PARSE_VERSION, ...(noticeIds || []), batchLimit]
  );
  const pending = rows as RowDataPacket[];
  if (!pending.length) return { processed: 0 };
  const values: any[] = [];
  for (const row of pending) {
    const parsed = parseEstimatedValue(row.estimated_value, row.country);
    values.push(
      Number(row.id),
      parsed?.amount ?? null,
      parsed?.currency ?? null,
      parsed?.amountUsd ?? null,
      parsed?.inferred ? 1 : 0,
      AMOUNT_PARSE_VERSION
    );
  }
  await dbPool.query(
    `INSERT INTO crm_notice_amount_cache (notice_id, amount, currency, amount_usd, inferred, parse_version)
     VALUES ${pending.map(() => "(?,?,?,?,?,?)").join(",")}
     ON DUPLICATE KEY UPDATE amount=VALUES(amount), currency=VALUES(currency), amount_usd=VALUES(amount_usd),
       inferred=VALUES(inferred), parse_version=VALUES(parse_version), parsed_at=CURRENT_TIMESTAMP`,
    values
  );
  return { processed: pending.length };
}
