/**
 * 统一搜索编排器 — 服务表 MySQL 应急降级路径
 * Unified search orchestrator — service-table MySQL emergency fallback
 *
 * @module server/services/search-orchestrator/mysql-fallback
 * @description 仅在 Meilisearch 完全不可用时启用。筛选语义直接复用 filter-builder
 *              的 MySQL 方言（双方言同源，杜绝语义漂移）。
 *
 *              [2026-11-18 收口] 全链路只读服务表（notice_public / notice_search），
 *              主表 bid_notices 不参与：
 *              · 关键词：notice_search 无 FULLTEXT，改走 title/reference/description
 *                （含 zh 译文列）的 LIKE 子串匹配；布尔 +/-/短语语义由 LIKE 组合表达，
 *                不再有相关度排序（降级态按 id/截止时间排序）。
 *              · 时效与平台准入：notice_public.deadline_ts/deadline_state 为准；
 *                平台未发布 RFQ 在构建期已由 PUBLIC_ADMIT_SQL 拦住，不再逐行回主表判定。
 *              15s 超时保护，超时返回空结果。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { UnifiedSearchParams, FilterPlan } from "./types";
import { escapeLikeWildcard } from "../../utils/normalize";
import { parseAdvancedQuery, hasAdvancedSyntax, toBooleanModeQuery } from "../../../shared/utils/advanced-syntax";

const MYSQL_TIMEOUT_MS = 15000;

/** 服务表时效口径：无截止（NULL/0）视为长期有效，与 Meili 索引侧同语义 */
const SERVICE_ACTIVE_WHERE = "(p.deadline_ts IS NULL OR p.deadline_ts = 0 OR p.deadline_ts >= UNIX_TIMESTAMP(NOW()))";

/** 关键词命中的列：原文标题/编号/正文 + 中文译文列（notice_search 已冗余存储） */
const KW_COLUMNS = ["title", "reference", "description", "title_zh", "description_zh"] as const;

function likeValue(t: string): string {
  return `%${escapeLikeWildcard(t)}%`;
}

/**
 * 关键词谓词（作用于 notice_search 别名 s，单表零 JOIN）。
 *
 * 语义对齐 Meili 主路径：
 * · 普通查询：按空格切词，matchMode=all 逐词 AND、any 逐词 OR；
 * · 高级语法：包含词/短语按同一连接词组合，排除词 NOT LIKE 全部命中列。
 * 差异（可接受）：LIKE 无词干/相关度，命中判定为子串包含。
 */
export function buildKeywordWhere(
  q: string,
  matchMode: "all" | "any" = "all",
): { sql: string; params: unknown[] } {
  const conj = matchMode === "any" ? " OR " : " AND ";
  const posSql = `(${KW_COLUMNS.map((c) => `s.${c} LIKE ?`).join(" OR ")})`;
  const negSql = `(${KW_COLUMNS.map((c) => `s.${c} NOT LIKE ?`).join(" AND ")})`;
  const posParams = (t: string) => KW_COLUMNS.map(() => likeValue(t));

  if (!hasAdvancedSyntax(q)) {
    const tokens = q.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return { sql: "", params: [] };
    return {
      sql: tokens.map(() => posSql).join(conj),
      params: tokens.flatMap(posParams),
    };
  }

  const parsed = parseAdvancedQuery(q);
  const posTokens = [...parsed.includes, ...parsed.phrases];
  const parts: string[] = [];
  if (posTokens.length) parts.push(posTokens.map(() => posSql).join(conj));
  if (parsed.excludes.length) parts.push(parsed.excludes.map(() => negSql).join(" AND "));
  if (parts.length === 0) return { sql: "", params: [] };
  return {
    sql: parts.map((s) => `(${s})`).join(" AND "),
    params: [...posTokens.flatMap(posParams), ...parsed.excludes.flatMap(posParams)],
  };
}

/** ORDER BY 映射（与 Meilisearch 排序语义对齐）
 * deadline_sec=0（长期有效/无截止日）的排序策略：
 *   - deadline（最近截止）：(=0) ASC → permanent 在后
 *   - deadline_farthest（截至最远）：(=0) ASC → permanent 在后
 *     有截止日内按 deadline_sec DESC 降序，最远截止日排最前；permanent 排末尾
 */
export function buildOrderBy(p: UnifiedSearchParams): string {
  // MySQL 默认开启反斜杠转义：必须先转义 \ 再转义 '，否则 q 含 \ 时
  // 字符串字面量被破坏（查询必坏，且构成 ORDER BY 注入面）
  const refLiteral = String(p.q ?? "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''");
  // 服务表口径：无截止（deadline_ts NULL/0）排最后，其余按截止远近；id 用 notice_pk
  const refBoost = p.q ? `(UPPER(REPLACE(COALESCE(p.reference,''),' ','')) = '${refLiteral}') DESC, ` : "";
  const noDeadline = "(p.deadline_ts IS NULL OR p.deadline_ts = 0)";
  if (p.sort === "deadline") {
    return `${refBoost}${noDeadline} ASC, p.deadline_ts ASC, p.notice_pk DESC`;
  }
  if (p.sort === "deadline_farthest") {
    return `${refBoost}${noDeadline} ASC, p.deadline_ts DESC, p.notice_pk DESC`;
  }
  // latest：无截止日期的公告始终排在最后（与 deadline/deadline_farthest 口径一致）
  return `${refBoost}${noDeadline} ASC, p.notice_pk DESC`;
}

/**
 * 关键词 id 子查询（只读服务表，主表不参与）。
 *
 * 两路取并集（UNION 去重）：
 * 1. notice_search 原文列 LIKE：title / reference / description / title_zh / description_zh
 *    （原文列覆盖未翻译行；LIKE 无相关度，降级态按 id/截止排序）
 * 2. notice_translations 译文 FULLTEXT：标题/正文译文命中（zh 用户 46.5 万行、en 40.9 万行译文，
 *    notice_search.title_zh 只填了 17.9 万行，靠这一路补中文召回）。译文表不是公告主表。
 *
 * 返回空 sql 表示查询无有效词（调用方直接给空集）。
 */
export function buildKeywordSource(
  q: string,
  matchMode: "all" | "any" = "all",
): { sql: string; params: unknown[] } {
  const kw = buildKeywordWhere(q, matchMode);
  if (!kw.sql) return { sql: "", params: [] };

  const isChinese = /[一-鿿]/.test(q);
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  const boolQ = hasAdvancedSyntax(q)
    ? matchMode === "any"
      ? (() => {
          const parsed = parseAdvancedQuery(q);
          return [
            ...parsed.includes,
            ...parsed.phrases.map((p) => `"${p.replace(/"/g, "")}"`),
            ...parsed.excludes.map((w) => `-${w.replace(/"/g, "")}`),
          ].join(" ");
        })()
      : toBooleanModeQuery(parseAdvancedQuery(q))
    : matchMode === "any"
      ? q.trim()
      : tokens.map((t) => `+${t}`).join(" ");

  return {
    sql:
      `(SELECT s.id FROM notice_search s` +
      ` WHERE (s.deadline_sec = 0 OR s.deadline_sec >= UNIX_TIMESTAMP(NOW())) AND ${kw.sql}` +
      ` UNION SELECT t.notice_id FROM notice_translations t WHERE t.lang = ?` +
      ` AND MATCH(t.title_tr, t.description_tr) AGAINST(? IN BOOLEAN MODE))`,
    params: [...kw.params, isChinese ? "zh" : "en", boolQ],
  };
}

/**
 * MySQL 应急降级搜索（只读服务表，主表不参与）。
 * @returns { ids: 当前页 ID, total: 总数 }；超时返回空
 */
export async function mysqlFallback(
  pool: Pool,
  p: UnifiedSearchParams,
  plan: FilterPlan,
): Promise<{ ids: number[]; total: number; degraded?: boolean }> {
  const offset = (p.page - 1) * p.pageSize;
  const whereSql = [
    SERVICE_ACTIVE_WHERE,
    ...plan.mysqlWhere,
    "p.deadline_state IN ('known','unknown')",
  ].join(" AND ");

  const queryParams: unknown[] = [];
  let fromSql: string;
  if (p.q) {
    // 关键词：服务表原文 LIKE + 译文 FULLTEXT 并集出 id，再以主键等值连服务表取行（不碰 bid_notices）
    const kw = buildKeywordSource(p.q, p.matchMode ?? "all");
    if (!kw.sql) return { ids: [], total: 0 };
    fromSql = `${kw.sql} _kw JOIN notice_public p ON p.notice_pk = _kw.id`;
    queryParams.push(...kw.params);
  } else {
    fromSql = "notice_public p";
  }
  queryParams.push(...plan.mysqlParams);

  const countSql = `SELECT COUNT(*) AS total FROM ${fromSql} WHERE ${whereSql}`;
  const idSql = `SELECT p.notice_pk AS id FROM ${fromSql} WHERE ${whereSql} ORDER BY ${buildOrderBy(p)} LIMIT ? OFFSET ?`;
  const idParams = [...queryParams, p.pageSize, offset];

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`MySQL fallback timeout after ${MYSQL_TIMEOUT_MS}ms`)), MYSQL_TIMEOUT_MS));

    const [countResult, idResult] = await Promise.all([
      Promise.race([pool.query(countSql, queryParams), timeout]),
      Promise.race([pool.query(idSql, idParams), timeout]),
    ]);

    const total = Number((countResult[0] as RowDataPacket[])[0]?.total || 0);
    const ids = (idResult[0] as RowDataPacket[]).map((r) => Number(r.id)).filter(Boolean);
    return { ids, total };
  } catch (err) {
    console.warn(`[search-orchestrator] mysqlFallback 失败: ${(err as Error).message}`);
    // degraded=true：失败被吞成空集（2026-11-11 事故：该空集若按正常结果缓存
    // 5 分钟，用户会在 Meili 恢复后仍持续看到空列表），编排器据此只给短 TTL。
    return { ids: [], total: 0, degraded: true };
  }
}


