/**
 * UNSPSC 父链回溯（降级路径）
 * UNSPSC ancestor-path fallback
 *
 * @module server/services/unspsc/filter
 * @description 缓存不可用时的逐行 SQL 回溯。
 *              原「UNSPSC 类目筛选 SQL 构建」（buildNoticeUnspscFilter）已随 R3'
 *              断读者删除：LSP + git grep 双证实全仓零调用者，类目筛选的替代通路
 *              是品目树 group_code / commodity_code（见 specs §4 第 10 行）。
 */
import type { Pool } from "mysql2/promise";
import type { UnspscCodeRow } from "./parser";

/**
 * 逐行查询回溯 UNSPSC 类目路径（降级路径：缓存不可用时使用）
 * 每码需 6 次 SQL，已被批量路径（getPathFromCache）替代
 */
export async function getUnspscPath(dbPool: Pool, codeId: number) {
  const path: Record<string, number | null> = {
    level1_id: null,
    level2_id: null,
    level3_id: null,
    level4_id: null,
    level5_id: null,
  };

  let currentId: number | null = codeId;
  for (let i = 0; i < 6 && currentId; i += 1) {
    // A2 strict 修复：显式断言查询结果类型，消除 TS7022（rows/row 隐式 any
    // 自引用推断），同时让行结构对下游可见。
    const [rows] = await dbPool.query(
      "SELECT id, parent_id, level FROM crm_unspsc_codes WHERE id = ? LIMIT 1",
      [currentId]
    ) as [UnspscCodeRow[], unknown];
    const row: UnspscCodeRow | undefined = rows[0];
    if (!row) break;
    if (row.level >= 1 && row.level <= 5) {
      path[`level${row.level}_id`] = row.id;
    }
    currentId = row.parent_id || null;
  }

  return path;
}
