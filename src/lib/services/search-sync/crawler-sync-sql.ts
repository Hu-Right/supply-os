/**
 * 爬虫同步纯 SQL 构件（叶子模块，无 DB / 无 server-only 依赖）
 * Crawler Sync pure SQL fragments (dependency leaf)
 *
 * @module lib/services/search-sync/crawler-sync-sql
 * @description 从 crawler-sync.ts 抽出的**纯函数**（值转义、ODKU 子句、增量 WHERE、水位线构造）
 *              与常量。单独成叶子模块的原因有二：
 *              1. 可被单测直接断言（crawler-sync.ts 依赖 source-pool/mysql2/server-only，
 *                 jsdom 环境下不可导入测试）；
 *              2. 与 wide-sync-sql.ts 同构——把「无副作用的 SQL 文本生成」与「DB 编排」分离。
 *
 *              语义完全移植自 scripts/daily-sync.cjs，是「爬虫库 → 主表」增量同步的 SQL 单一事实源。
 */

/** 同步表顺序：父表（notices/opportunities）先于子表（unspsc 桥接/候选），
 *  在不关闭外键检查的前提下保证外键引用的父行先落库 */
export const SYNC_TABLES = [
  "crm_bid_notices",
  "crm_bid_opportunities",
  "crm_bid_notice_unspsc_codes",
  "crm_bid_opportunity_unspsc_candidates",
] as const;

/** 公告主表名（其变更 id 需级联到宽表） */
export const NOTICE_TABLE = "crm_bid_notices";

/** update_time 可能为数值列（存 Unix 秒，如 crm_bid_notices）或 DATETIME 列 */
export const NUMERIC_TYPES = new Set([
  "tinyint", "smallint", "mediumint", "int", "bigint", "float", "double", "decimal",
]);

/**
 * 非破坏式合并列（人工/官方收录侧拥有）。
 * 源库补建同名列但值为 NULL/空串时，不得把云端已填好的值整体抹掉。
 * 数值列仅 NULL 算未提供（0 是合法业务值）；字符串列额外把空串视作未提供。
 */
export const NON_DESTRUCTIVE_COLUMNS: Record<string, string[]> = {
  crm_bid_opportunities: [
    "procurement_procedure", "prequalification_required", "lot_structure", "contract_form",
    "consortium_rule", "bid_validity_days", "submission_mode", "submission_requirement",
    "submission_address", "funding_agency", "evaluation_method", "language_requirement",
    "execution_period", "local_content", "eshs_requirements", "eligible_countries", "key_dates",
  ],
};

/** 水位线：id 高水位 + update_time 高水位（字符串，跟随列原生类型；null 表示本批未见到有效值） */
export interface Watermark {
  id: number;
  time: string | null;
}

/** 按本地语义把值转义为 SQL 字面量（JSON 列校验合法性后原样写入） */
export function escapeVal(val: unknown, dataType: string): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (val instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    const s = `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())} ${pad(val.getHours())}:${pad(val.getMinutes())}:${pad(val.getSeconds())}`;
    return `'${s}'`;
  }
  if (Buffer.isBuffer(val)) return `X'${val.toString("hex")}'`;
  const str = String(val);
  if (dataType === "json") {
    try { JSON.parse(str); } catch { return "NULL"; }
  }
  return `'${str.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/** 构造 ODKU 的 UPDATE 子句：非破坏列走 IF(源空, 保留目标, 覆盖)，其余列源库直通覆盖 */
export function buildOdkuClause(
  colNames: string[],
  pkCols: string[],
  colTypes: Record<string, string>,
  keepCols: Set<string>,
  pkCol: string,
): string {
  const updateCols = colNames.filter((c) => !pkCols.includes(c));
  if (updateCols.length === 0) return `\`${pkCol}\` = VALUES(\`${pkCol}\`)`;
  return updateCols
    .map((c) => {
      if (!keepCols.has(c)) return `\`${c}\` = VALUES(\`${c}\`)`;
      const emptyTest = NUMERIC_TYPES.has(colTypes[c])
        ? `VALUES(\`${c}\`) IS NULL`
        : `(VALUES(\`${c}\`) IS NULL OR VALUES(\`${c}\`) = '')`;
      return `\`${c}\` = IF(${emptyTest}, \`${c}\`, VALUES(\`${c}\`))`;
    })
    .join(", ");
}

/**
 * 构造增量 WHERE：新记录（pk > idWm）OR 已更新记录（update_time > timeWm）。
 * 时间条件按列原生类型比较；类型不匹配的旧水位线直接丢弃，退化为纯 id 增量，避免全表条件。
 */
export function buildIncrementalWhere(
  pkCol: string,
  idWm: number,
  timeWmRaw: string | null,
  hasUpdateTime: boolean,
  utIsNumeric: boolean,
): string {
  const whereParts: string[] = [];
  if (idWm > 0) whereParts.push(`\`${pkCol}\` > ${idWm}`);
  if (utIsNumeric) {
    const n = Number(timeWmRaw);
    if (timeWmRaw !== null && Number.isFinite(n) && n > 0) whereParts.push(`\`update_time\` > ${n}`);
  } else if (hasUpdateTime && timeWmRaw) {
    whereParts.push(`\`update_time\` > '${timeWmRaw.replace(/'/g, "''")}'`);
  }
  return whereParts.length > 0 ? `WHERE (${whereParts.join(" OR ")})` : "";
}

/** 构造水位线对象：无 update_time 列时退化为纯 id 水位线 */
export function buildWatermark(hasUpdateTime: boolean, maxId: number, maxUpdateTime: string | null): Watermark {
  return { id: maxId, time: hasUpdateTime ? (maxUpdateTime || null) : null };
}
