"use strict";
/**
 * daily-sync 内容对账的纯 SQL / 判定构件（零副作用叶子模块）
 * Daily-sync content-reconciliation pure SQL / decision fragments (dependency leaf)
 *
 * 为什么单独成 .cjs 叶子（与 src/lib/services/search-sync/crawler-sync-sql.ts 同构的理由）：
 *   1. 无 env、无 DB、无 process.exit —— 可被单测直接 require 断言
 *      （daily-sync.cjs 顶层会读环境变量并可能 fatal 退出，测试无法安全 import 整个脚本）；
 *   2. 把「无副作用的 SQL 文本生成 / 差异判定」与「跨库编排」分离，编排层只发语句、不算口径。
 *
 * 背景（本次修复的根因）：daily-sync 增量只按 `id > 水位 OR update_time > 水位` 拉取，
 *   接不住「documents / procurement_files / external_links 等被外部/爬虫管道补写、但 update_time
 *   纹丝不动」的行 —— 本库实测踩过同款坑（见 notices-shadow-phase2-cutover.mjs 第 9-13 行、
 *   notices-slim-common.mjs 第 169-173 行：10-15 实测 documents 被补写 194 行、水位不动，
 *   旧「水位列 + 应用侧可写列」判据报「差异 0 行」）。因此补一条按**全列行指纹**逐片找差异行的
 *   对账链路，其判据必须与影子表 findDirtyRows 完全同口径（尤其 NULL 与空串必须可区分）。
 */

/** update_time 可能为数值列（存 Unix 秒，如 crm_bid_notices）或 DATETIME 列；数值列的判型口径 */
const NUMERIC_TYPES = new Set([
  "tinyint", "smallint", "mediumint", "int", "bigint", "float", "double", "decimal",
]);

/**
 * 单列指纹项：NULL 与空串必须可区分。
 * 每列前置一个标记字节 —— NULL 走 CHAR(1)、非空走 CHAR(2)+值本体。
 * 若省掉标记直接用 CONCAT_WS，MySQL 会跳过 NULL 参数 ⇒ NULL 与 '' 同码 ⇒ 对账假通过
 * （影子表阶段一实测口径，此处逐字对齐 notices-slim-common.mjs rowFingerprintExpr 的 term()）。
 */
function fingerprintTerm(col) {
  return (
    "IF(`" + col + "` IS NULL, CHAR(1 USING utf8mb4), " +
    "CONCAT(CHAR(2 USING utf8mb4), IFNULL(CAST(`" + col + "` AS CHAR), '')))"
  );
}

/** 逐行指纹：CRC32(CONCAT(带标记的列…))。下钻定位「哪一行内容变了」时用。 */
function buildRowFingerprintExpr(cols) {
  return "CRC32(CONCAT(" + cols.map(fingerprintTerm).join(", ") + "))";
}

/**
 * 逐片聚合指纹：SUM(CRC32(CONCAT(同口径列)))。先以「片级」粗筛（一次聚合比较整片有没有差异），
 * 只在指纹/行数不等的片上下钻到行 —— 与影子表 reconcile/findDirtyRows 同一省法。
 * SUM 与行序无关（可交换），故跨库两侧只要「行集合 × 行指纹」相同即相等。
 */
function buildSliceFingerprintExpr(cols) {
  return "SUM(" + buildRowFingerprintExpr(cols) + ")";
}

/**
 * 源 ∩ 目标 交集列（保持源列序，剔除目标缺失列）。
 * 生成列已由调用方的 information_schema 查询（EXTRA NOT LIKE '%GENERATED%'）过滤掉。
 * 指纹与补写只能走交集列：引用目标不存在的列会直接 Unknown column 中断整片对账。
 */
function computeEffectiveColumns(sourceCols, targetCols) {
  const targetSet = new Set(targetCols.map((c) => c.COLUMN_NAME));
  return sourceCols.map((c) => c.COLUMN_NAME).filter((n) => targetSet.has(n));
}

/**
 * 给定同一 id 窗口内源、目标两侧的 (id → 行指纹)，挑出「需要重新同步」的行 id。
 *   - 目标缺该 id（新增行 / 此前被水位线漏掉的行）→ 拾出；
 *   - 指纹不等（内容漂移，含 documents 被改写而 update_time 没动）→ 拾出；
 *   - 仅目标多出、源没有的行（orphan）→ 不拾：daily-sync 语义「只增不删」，与既有 ODKU 一致，
 *     删除类处置不属本对账链路职责。
 * fp 一律按字符串比较：mysql2 对 CRC32 回 number、对 SUM(CRC32) 可能回 BIGINT 字符串，两侧口径不同。
 */
function selectDriftIds(sourceRows, targetRows) {
  const targetMap = new Map(targetRows.map((r) => [Number(r.id), String(r.fp)]));
  const ids = [];
  for (const r of sourceRows) {
    const id = Number(r.id);
    const tfp = targetMap.get(id);
    if (tfp === undefined || tfp !== String(r.fp)) ids.push(id);
  }
  return ids;
}

/**
 * ODKU 的 UPDATE 子句：与 daily-sync 增量同步**完全同一覆盖语义**，务必共享而非各写一份
 * （「看着一样其实不一样」是最坏的漂移 —— 见 notices-slim-common.mjs 头部红线）。
 *   - 非破坏列（人工/官方收录侧拥有）：数值列仅 NULL 算未提供（0 是合法业务值）；
 *     字符串列额外把空串视作未提供 —— 源为空则保留目标值，否则覆盖；
 *   - 其余列：源库直通覆盖 `col = VALUES(col)`；
 *   - 无更新列：退化为主键自等（幂等空更新，不改变任何值）。
 */
function buildOdkuUpdateClause(updateCols, colTypes, keepCols, pkCol) {
  if (updateCols.length === 0) return "`" + pkCol + "` = VALUES(`" + pkCol + "`)";
  return updateCols
    .map((c) => {
      if (!keepCols.has(c)) return "`" + c + "` = VALUES(`" + c + "`)";
      const emptyTest = NUMERIC_TYPES.has(colTypes[c])
        ? "VALUES(`" + c + "`) IS NULL"
        : "(VALUES(`" + c + "`) IS NULL OR VALUES(`" + c + "`) = '')";
      return "`" + c + "` = IF(" + emptyTest + ", `" + c + "`, VALUES(`" + c + "`))";
    })
    .join(", ");
}

module.exports = {
  NUMERIC_TYPES,
  fingerprintTerm,
  buildRowFingerprintExpr,
  buildSliceFingerprintExpr,
  computeEffectiveColumns,
  selectDriftIds,
  buildOdkuUpdateClause,
};
