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
 * 非破坏式合并列（人工/官方收录侧拥有）—— 与应用内正式写入者 crawler-sync-sql.ts 同一份登记。
 * 源库补建同名列但值为 NULL/空串时，不得把云端已填好的值整体抹掉。
 * 数值列仅 NULL 算未提供（0 是合法业务值）；字符串列额外把空串视作未提供。
 *
 * 2026-10-12 清空：原先登记的迁移 088 的 17 个国际采购列整族退役（云端零消费、
 * 全库仅 1 行有值且那行内容贴错），待删列清单见 scripts/tools/opp-slim-plan.mjs。
 * 列删后本脚本无需改动：按「源∩目标」交集写列，源库多出的列自动跳过并告警。
 */
const NON_DESTRUCTIVE_COLUMNS = {
  // 附件/外链是采集与外部文档管道补齐的字段；源库为空数组时不得把云端已有值抹掉
  // （2026-10-21：实测 daily-sync 用源库 [] 覆盖了主表 documents，附件 URL 丢失）
  crm_bid_notices: ["documents", "procurement_files", "external_links"],
};

/**
 * 单调上升列（云端拥有的布尔型运营标记）：任一侧为 1 即保留 1，只允许 0→1、禁止 1→0。
 * 实测依据：5 行 is_featured 云端=1 / 源库=0 且两侧 update_time 相等
 * ⇒ 精选是云端后写的运营动作，不能被源库的非空值 0 抹掉（那种情况 keepCols「源空才保留」不生效）。
 * 商机表审核四列方向相反（源库较新、要往云端流），不得登记进本表。
 */
const MONOTONE_RISE_COLUMNS = {
  crm_bid_notices: ["is_featured"],
};

/**
 * 平台行整行免疫挂点：目标行 `column = value` 命中时，源库一行都不许改。
 * 采用「写集前置过滤」而非逐列套 IF(entry_source='platform', …)：ODKU 赋值从左到右求值，
 * 列序在 entry_source 之后的列读到的是已改写的值，逐列护栏会只护住前半截列（缝合行）。
 * 机理与铁证见 docs/reviews/2026-10-17-RFQ覆盖P0修复报告.md §1。
 */
const PLATFORM_IMMUNE = { table: "crm_bid_notices", column: "entry_source", value: "platform" };

/**
 * 目标优先列（已存在行不让源值覆盖，仅当目标为空才写）。
 *
 * 为何只有本脚本需要这一档（与应用内 crawler-sync 的有意不对称，两道测试各自钉死）：
 * 后台正式写入者在入库前对 title 做过 normalizeTitle 清洗（实测 1,106/1,106 行本仓
 * normalizeTitle 可逐字复现云端值），而本脚本没有那一步；
 * 若让源值直通覆盖，会把云端已清洗的标题打回带 `&amp;`/双空格的原始值（样本 5.6%，
 * 按 70 万行量级外推近 4 万行）。更坑的是这些行两侧 update_time 相等 ⇒ 内容对账
 * 每轮都会重新判差异、每轮都回退，**永不对齐**。目标优先保证：新行照旧带源标题入库，
 * 已存在行不回退。
 * 代价（必须知道）：源库真改了标题时，这一路不跟进；标题更新依赖后台正式写入者或
 * 人工 `node scripts/ops/notice-public-v2.ts --ids=…` 重算。
 */
const TARGET_WINS_COLUMNS = {
  crm_bid_notices: ["title"],
};

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
 *   - 单调上升列：GREATEST 合并（任一侧 1 即 1，NULL 安全）；
 *   - 非破坏列（人工/官方收录侧拥有）：数值列仅 NULL 算未提供（0 是合法业务值）；
 *     字符串列额外把空串视作未提供 —— 源为空则保留目标值，否则覆盖；
 *   - 其余列：源库直通覆盖 `col = VALUES(col)`；
 *   - 无更新列：退化为主键自等（幂等空更新，不改变任何值）。
 * ⚠ 与 src/lib/services/search-sync/crawler-sync-sql.ts 的 buildOdkuClause 逐字同口径，
 *   由 tests/unit/lib/services/search-sync/crawler-sync-ownership.test.ts 断言相等。
 */
function buildOdkuUpdateClause(updateCols, colTypes, keepCols, pkCol, opts) {
  const monotone = (opts && opts.monotoneCols) || new Set();
  const targetWins = (opts && opts.targetWins) || new Set();
  if (updateCols.length === 0) return "`" + pkCol + "` = VALUES(`" + pkCol + "`)";
  return updateCols
    .map((c) => {
      // 单调上升优先于 keepCols：合并语义比「源空保留」更强，且两者不该同时命中
      if (monotone.has(c)) return monotoneRiseExpr(c);
      // 目标优先：本侧无等价清洗时的防回退档（见 TARGET_WINS_COLUMNS 注）
      if (targetWins.has(c)) return targetWinsExpr(c);
      if (!keepCols.has(c)) return "`" + c + "` = VALUES(`" + c + "`)";
      const emptyTest = NUMERIC_TYPES.has(colTypes[c])
        ? "VALUES(`" + c + "`) IS NULL"
        : colTypes[c] === "json"
          ? "(VALUES(`" + c + "`) IS NULL OR JSON_LENGTH(VALUES(`" + c + "`)) = 0)"
          : "(VALUES(`" + c + "`) IS NULL OR VALUES(`" + c + "`) = '')";
      return "`" + c + "` = IF(" + emptyTest + ", `" + c + "`, VALUES(`" + c + "`))";
    })
    .join(", ");
}

/** 单调上升合并式（NULL 安全：NULL 视作 0，两侧都 0 才落 0） */
function monotoneRiseExpr(c) {
  return "`" + c + "` = GREATEST(IFNULL(`" + c + "`, 0), IFNULL(VALUES(`" + c + "`), 0))";
}

/** 目标优先式：目标已有非空值就不动，空了才接源值 */
function targetWinsExpr(c) {
  return "`" + c + "` = IF(`" + c + "` IS NULL OR `" + c + "` = '', VALUES(`" + c + "`), `" + c + "`)";
}

module.exports = {
  NUMERIC_TYPES,
  NON_DESTRUCTIVE_COLUMNS,
  MONOTONE_RISE_COLUMNS,
  TARGET_WINS_COLUMNS,
  PLATFORM_IMMUNE,
  fingerprintTerm,
  buildRowFingerprintExpr,
  buildSliceFingerprintExpr,
  computeEffectiveColumns,
  selectDriftIds,
  monotoneRiseExpr,
  targetWinsExpr,
  buildOdkuUpdateClause,
};
