/**
 * UNSPSC 筛选器 SQL 构建
 * UNSPSC filter SQL builder
 *
 * @module server/services/unspsc/filter
 * @description 构建公告搜索的 UNSPSC 类目筛选 SQL 片段，
 *              以及降级路径查询（缓存不可用时的逐行 SQL 回溯）。
 */
import type { UnspscCodeRow } from "./parser";

/**
 * 构建公告搜索的 UNSPSC 类目筛选 SQL JOIN 片段
 *
 * 勘误（与 /api/notices/recommended 口径一致）：crm_bid_notice_unspsc_codes 的
 * level1_id~level5_id 存的是 crm_unspsc_codes.id（varchar），不是码串前缀。
 * 因此按类目自身 level 定位对应列做等值匹配；一告多码由 DISTINCT 去重，
 * 跨大类公告在其挂到的每个类目下均可命中（OR 语义）。
 *
 * 注意：桥接表 notice_id 存储的是主表 crm_bid_notices.notice_id（外部编号），
 * 而非 id（自增主键），JOIN 口径必须用 n.notice_id。
 * 实测验证：n.notice_id JOIN 命中 60,492 条公告，n.id JOIN 仅命中 5,907 条（丢失 90%）。
 */
export async function buildNoticeUnspscFilter(dbPool: any, codeId: number) {
  if (!codeId) return { sql: "", params: [] as unknown[] };

  const [codeRows] = await dbPool.query(
    "SELECT id, code, level FROM crm_unspsc_codes WHERE id = ? LIMIT 1",
    [codeId]
  );
  const code = (codeRows as UnspscCodeRow[])[0];
  if (!code) return { sql: "INNER JOIN (SELECT NULL AS notice_id) filtered_notices ON 1=0", params: [] as unknown[] };

  const level = Number(code.level) || 0;
  if (level >= 1 && level <= 5) {
    return {
      sql: `INNER JOIN (
        SELECT DISTINCT notice_id
        FROM crm_bid_notice_unspsc_codes
        WHERE level${level}_id = ?
      ) filtered_notices ON filtered_notices.notice_id = n.notice_id`,
      params: [String(code.id)],
    };
  }

  // level 6/7 的异常深层节点（全树仅数条）：无对应 levelN_id 列，用 code_id 兜底
  return {
    sql: `INNER JOIN (
      SELECT DISTINCT notice_id
      FROM crm_bid_notice_unspsc_codes
      WHERE code_id = ?
    ) filtered_notices ON filtered_notices.notice_id = n.notice_id`,
    params: [code.id],
  };
}

/**
 * 逐行查询回溯 UNSPSC 类目路径（降级路径：缓存不可用时使用）
 * 每码需 6 次 SQL，已被批量路径（getPathFromCache）替代
 */
export async function getUnspscPath(dbPool: any, codeId: number) {
  const path: Record<string, number | null> = {
    level1_id: null,
    level2_id: null,
    level3_id: null,
    level4_id: null,
    level5_id: null,
  };

  let currentId: number | null = codeId;
  for (let i = 0; i < 6 && currentId; i += 1) {
    const [rows] = await dbPool.query(
      "SELECT id, parent_id, level FROM crm_unspsc_codes WHERE id = ? LIMIT 1",
      [currentId]
    );
    const row = (rows as UnspscCodeRow[])[0];
    if (!row) break;
    if (row.level >= 1 && row.level <= 5) {
      path[`level${row.level}_id`] = row.id;
    }
    currentId = row.parent_id || null;
  }

  return path;
}
