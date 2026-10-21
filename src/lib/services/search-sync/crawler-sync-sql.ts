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

/** 同步表顺序：旧公告桥表已随小表剥离移出同步清单
 *  （2026-10-14）——公告归属唯一事实源是落点表，桥表进入只出不进的封存态。 */
export const SYNC_TABLES = [
  "crm_bid_notices",
  "crm_bid_opportunities",
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
 *
 * 2026-10-12 清空：原 crm_bid_opportunities 的 17 个国际采购列整族退役，
 * 云端已无人读且全库仅 1 行有值（那行还贴错了行），保护它们没有意义。
 * 待删列清单见 scripts/tools/opp-slim-plan.mjs；列删后同步走「源∩目标」交集，
 * 源库多出的列自动跳过并告警，不报错。若将来重新引入人工精编列，必须在这里登记。
 */
export const NON_DESTRUCTIVE_COLUMNS: Record<string, string[]> = {
  // 附件/外链是采集与外部文档管道补齐的字段；源库为空数组时不得把云端已有值抹掉
  // （2026-10-21：实测 daily-sync 用源库 [] 覆盖了主表 documents，附件 URL 丢失）
  crm_bid_notices: ["documents", "procurement_files", "external_links"],
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
  // JSON 列：mysql2 二进制协议（execute）自动把 JSON 解析为 JS object/array，
  // 必须 JSON.stringify 还原为合法 JSON 文本；直接 String(object) 得到
  // "[object Object]" → 下游 JSON.parse 失败 → 写成 NULL → 数据丢失。
  if (dataType === "json") {
    const str = (typeof val === "object") ? JSON.stringify(val) : String(val);
    try { JSON.parse(str); } catch { return "NULL"; }
    return `'${str.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  }
  const str = String(val);
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
        : colTypes[c] === "json"
          ? `(VALUES(\`${c}\`) IS NULL OR JSON_LENGTH(VALUES(\`${c}\`)) = 0)`
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
