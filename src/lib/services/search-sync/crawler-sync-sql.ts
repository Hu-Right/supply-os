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

/**
 * 单调上升列（云端拥有的布尔型运营标记）：任一侧为 1 即保留 1，只允许 0→1、禁止 1→0。
 *
 * 为什么不能走 keepCols（「源空则保留目标」）：源库对这类列有**合法的非空值 0**，
 * 直通覆盖会把云端刚标的精选抹掉。实测坐实：
 * 5 行 `is_featured` 云端=1 / 源库=0，且两侧 update_time 完全相等 ⇒ 值不是源库推的，
 * 是云端后写的运营动作，因此它属于「云端拥有」。
 *
 * 反过来，商机表 `status/audit_status/review_status/is_qualified` 实测方向相反
 * （源库=approved/1 且 update_time 更新，云端仍是 draft/0）⇒ 审核结论是**源库→云端**的正向
 * 流入，绝不能登记进本表，否则会把审核结果永久堵在门外（同测试文件里有反向断言）。
 */
export const MONOTONE_RISE_COLUMNS: Record<string, string[]> = {
  crm_bid_notices: ["is_featured"],
};

/**
 * 平台行整行免疫的挂点：值命中 `column = value` 的目标行，源库一行都不许改。
 *
 * 机理（docs/reviews/2026-10-17-RFQ覆盖P0修复报告.md §1 的铁证 + 本轮复测）：平台自建 RFQ
 * 用主表自增 id 作主键，而云端 `AUTO_INCREMENT` 恰等于源库 `MAX(id)+1` ⇒ 新建 RFQ 会占用
 * 爬虫库下一个 id；源行带显式 id 撞进同一主键时，ODKU 就地把它改写成爬虫公告行。
 *
 * 为什么是「写集前置过滤」而不是给每列套 `IF(entry_source='platform', …)`：
 * ODKU 的赋值**从左到右求值**，列序里位于 `entry_source` 之后的列读到的是已被改写的
 * 新值（'crawl'），护栏会只覆盖前半截列 ⇒ 产出「爬虫内容 + 平台附件」的缝合行。
 * 整行过滤与列序无关，且让免疫行完全不参与写入（与后台 syncRunner 的净效果一致）。
 */
export const PLATFORM_IMMUNE = { table: "crm_bid_notices", column: "entry_source", value: "platform" } as const;

/**
 * 目标优先列（已存在行不让源值覆盖，仅当目标为空才写）—— 本路径**故意留空**。
 *
 * 与手动兜底脚本 scripts/tools/daily-sync-sql.cjs 的有意不对称（那边登记了 title）：
 * 本路径是应用内正式写入者，写入前会用 SSOT 纯函数 normalizeTitle 清洗 title
 * （见 crawler-sync.ts 的行级归一入口；实测可逐字复现现网已清洗值），
 * 所给的是「清洗后的源值」，不存在回退问题 ⇒ 源值照旧直通覆盖，标题更新能正常流入。
 * daily-sync 没有那一步清洗，只能靠目标优先防回退。不变式是**净效果一致**：
 * 两路都不会把已清洗的标题打回原形。两道断言一起写在
 * tests/unit/lib/services/search-sync/crawler-sync-ownership.test.ts。
 */
export const TARGET_WINS_COLUMNS: Record<string, string[]> = {};

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

/**
 * 构造 ODKU 的 UPDATE 子句：非破坏列走 IF(源空, 保留目标, 覆盖)，单调上升列走 GREATEST 合并，
 * 其余列源库直通覆盖。
 * ⚠ 与 scripts/tools/daily-sync-sql.cjs 的同名构件**逐字同口径**，由
 *   tests/unit/lib/services/search-sync/crawler-sync-ownership.test.ts 断言相等（改一边必须改两边）。
 */
export function buildOdkuClause(
  colNames: string[],
  pkCols: string[],
  colTypes: Record<string, string>,
  keepCols: Set<string>,
  pkCol: string,
  opts: { monotoneCols?: Set<string>; targetWins?: Set<string> } = {},
): string {
  const monotone = opts.monotoneCols ?? new Set<string>();
  const targetWins = opts.targetWins ?? new Set<string>();
  const updateCols = colNames.filter((c) => !pkCols.includes(c));
  if (updateCols.length === 0) return `\`${pkCol}\` = VALUES(\`${pkCol}\`)`;
  return updateCols
    .map((c) => {
      // 单调上升优先于 keepCols：合并语义比「源空保留」更强，且两者不该同时命中
      if (monotone.has(c)) return monotoneRiseExpr(c);
      // 目标优先：本侧无等价清洗时的防回退档（见 TARGET_WINS_COLUMNS 注）
      if (targetWins.has(c)) return targetWinsExpr(c);
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

/** 单调上升合并式（NULL 安全：NULL 视作 0，两侧都 0 才落 0） */
export function monotoneRiseExpr(c: string): string {
  return `\`${c}\` = GREATEST(IFNULL(\`${c}\`, 0), IFNULL(VALUES(\`${c}\`), 0))`;
}

/** 目标优先式：目标已有非空值就不动，空了才接源值 */
export function targetWinsExpr(c: string): string {
  return `\`${c}\` = IF(\`${c}\` IS NULL OR \`${c}\` = '', VALUES(\`${c}\`), \`${c}\`)`;
}

/** 构造水位线对象：无 update_time 列时退化为纯 id 水位线 */
export function buildWatermark(hasUpdateTime: boolean, maxId: number, maxUpdateTime: string | null): Watermark {
  return { id: maxId, time: hasUpdateTime ? (maxUpdateTime || null) : null };
}
