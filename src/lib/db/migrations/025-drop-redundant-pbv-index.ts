/**
 * 迁移 025 · 删除主体核验留痕表的冗余索引
 *
 * @module server/db/migrations/025-drop-redundant-pbv-index
 * @description `procurement_buyer_verifications` 上的 `idx_pbv_buyer (buyer_id, kind)`
 *              没有任何代码路径会用它，本地库 EXPLAIN 三重验证：
 *
 *                1. 唯一的列表查询 `WHERE buyer_id = ? ORDER BY id DESC LIMIT 20`
 *                   → 优化器选 `uq_buyer_verify_callback` 的 buyer_id 左前缀，不选本索引；
 *                2. 幂等去重 `WHERE buyer_id = ? AND callback_id = ?`
 *                   → 常量表查找，同样不走本索引；
 *                3. **即使假设**按 kind 过滤 `WHERE buyer_id = ? AND kind = ?`
 *                   → 优化器依然选唯一键左前缀（单买家留痕通常个位数，复合索引不值得），
 *                   本索引仍被忽略。
 *
 *              也就是说它是纯写入开销：每次核验 INSERT 多维护一棵 B+ 树，读取零收益。
 *              唯一键 `uq_buyer_verify_callback (buyer_id, callback_id)` 的左前缀
 *              已覆盖所有 `buyer_id` 过滤，删本索引不产生全表扫描。
 *
 *              回滚（如需恢复）：
 *                ALTER TABLE procurement_buyer_verifications ADD KEY idx_pbv_buyer (buyer_id, kind);
 *              但恢复它只会让写入变慢，读取性能不变——除非将来真的出现「按 kind 统计
 *              单买家各维度核验次数」这类查询，届时再按实际 WHERE 建更合适的索引。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const TABLE = "procurement_buyer_verifications";
const INDEX = "idx_pbv_buyer";

export const migration: Migration = {
  version: 25,
  name: "drop_redundant_pbv_index",
  async up(dbPool: Pool): Promise<void> {
    const [rows] = await dbPool.query(
      "SELECT 1 FROM information_schema.STATISTICS " +
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1",
      [TABLE, INDEX],
    );
    if ((rows as RowDataPacket[]).length === 0) return; // 已删则跳过，重跑幂等
    await dbPool.query(`ALTER TABLE \`${TABLE}\` DROP INDEX \`${INDEX}\``);
  },
};
