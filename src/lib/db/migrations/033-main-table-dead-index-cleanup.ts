/**
 * 033: 主表死索引清理
 * crm_bid_notices dead index cleanup
 *
 * @module server/db/migrations/033-main-table-dead-index-cleanup
 * @description 搜索性能优化报告 T1 修复：
 *              搜索路径已全切 deadline_sec 口径，以下两个索引挂在写入最频繁的主表上，
 *              搜索链路零引用却拖慢外部管道批量导入：
 *              - idx_search_composite (is_active, deadline_sec, country, notice_type)
 *                搜索链路不再引用 is_active，该索引最左前缀无搜索路径命中
 *              - idx_bid_notices_active_deadline_id (is_expired, deadline_ts, id)
 *                搜索链路已切 deadline_sec，deadline_ts 索引无搜索路径命中
 *
 *              安全说明：
 *              - DROP INDEX 为 InnoDB ALGORITHM=INPLACE, LOCK=NONE，秒级完成
 *              - 执行前 SET lock_wait_timeout=5 防止 MDL 排队雪崩
 *              - 仅删索引不删列（is_active/is_expired 有外部管道写入，不可删）
 *              - 幂等安全：索引不存在时跳过
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const DEAD_INDEXES = [
  "idx_search_composite",
  "idx_bid_notices_active_deadline_id",
];

export const migration: Migration = {
  version: 33,
  name: "main-table-dead-index-cleanup",
  async up(dbPool: Pool) {
    const TABLE = "crm_bid_notices";

    // 安全检查：表不存在则跳过
    const [tables] = await dbPool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
      [TABLE],
    );
    if ((tables as RowDataPacket[]).length === 0) {
      console.log("[migration-033] crm_bid_notices 不存在，跳过");
      return;
    }

    // 防 MDL 排队：拿不到锁立刻失败退出，不让后续查询无限排队
    await dbPool.query("SET SESSION lock_wait_timeout = 5");

    for (const indexName of DEAD_INDEXES) {
      const [rows] = await dbPool.query(
        `SELECT COUNT(*) AS total
         FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
        [TABLE, indexName],
      );
      const count = Number((rows as RowDataPacket[])[0]?.total || 0);
      if (count === 0) {
        console.log(`[migration-033] ${indexName} 不存在，跳过`);
        continue;
      }
      await dbPool.query(`ALTER TABLE \`${TABLE}\` DROP INDEX \`${indexName}\``);
      console.log(`[migration-033] 已删除死索引 ${indexName}`);
    }

    console.log("[migration-033] 主表死索引清理完成");
  },
};
