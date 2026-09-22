/**
 * 统一搜索编排器 — MySQL FULLTEXT 应急降级路径
 * Unified search orchestrator — MySQL FULLTEXT emergency fallback
 *
 * @module server/services/search-orchestrator/mysql-fallback
 * @description 仅在 Meilisearch 完全不可用时启用。筛选语义直接复用 filter-builder
 *              的 MySQL 方言（双方言同源，杜绝语义漂移）。关键词走 FULLTEXT + 中文 LIKE 兜底。
 *              15s 超时保护，超时返回空结果。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { UnifiedSearchParams, FilterPlan } from "./types";
import { ACTIVE_NOTICE_WHERE, ACTIVE_NOTICE_WHERE_NO_ALIAS } from "../../utils/notice-expired";
import { escapeLikeWildcard } from "../../utils/normalize";

const MYSQL_TIMEOUT_MS = 15000;

/** 关键词 UNION 子查询（中文 FULLTEXT + 译文 LIKE 兜底；英文三路 FULLTEXT）
 * 注意：子查询内表别名为 n2/sn，必须用无别名版 ACTIVE 口径；
 *       派生表无法引用外层别名 n，否则报 Unknown column 'n.deadline_ts' */
function buildKeywordUnion(q: string): { sql: string; params: unknown[] } {
  const isChinese = /[一-鿿]/.test(q);
  const likeQ = `%${escapeLikeWildcard(q)}%`;
  if (isChinese) {
    return {
      sql:
        "SELECT n2.id FROM crm_bid_notices n2 WHERE " + ACTIVE_NOTICE_WHERE_NO_ALIAS +
        " AND MATCH(n2.title, n2.reference, n2.description) AGAINST(? IN BOOLEAN MODE)" +
        " UNION " +
        "SELECT qzh.notice_id FROM crm_notice_translations qzh WHERE qzh.lang = 'zh' AND (qzh.title_tr LIKE ? OR qzh.description_tr LIKE ?)",
      params: [q, likeQ, likeQ],
    };
  }
  return {
    sql:
      "SELECT n2.id FROM crm_bid_notices n2 WHERE " + ACTIVE_NOTICE_WHERE_NO_ALIAS +
      " AND MATCH(n2.title, n2.reference) AGAINST(? IN BOOLEAN MODE)" +
      " UNION " +
      "SELECT sn.id FROM crm_bid_notices sn WHERE " + ACTIVE_NOTICE_WHERE_NO_ALIAS +
      " AND MATCH(sn.description) AGAINST(? IN BOOLEAN MODE)" +
      " UNION " +
      "SELECT qen.notice_id FROM crm_notice_translations qen WHERE qen.lang = 'en' AND MATCH(qen.title_tr, qen.description_tr) AGAINST(? IN BOOLEAN MODE)",
    params: [q, q, q],
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
  const refBoost = p.q ? `(UPPER(REPLACE(COALESCE(n.reference,''),' ','')) = '${refLiteral}') DESC, ` : "";
  if (p.sort === "deadline") {
    return `${refBoost}(n.deadline_sec = 0) ASC, n.deadline_sec ASC, n.id DESC`;
  }
  if (p.sort === "deadline_farthest") {
    return `${refBoost}(n.deadline_sec = 0) ASC, n.deadline_sec DESC, n.id DESC`;
  }
  // latest：无截止日期的公告始终排在最后（与 deadline/deadline_farthest 口径一致）
  return `${refBoost}(n.deadline_sec = 0) ASC, n.id DESC`;
}

/**
 * MySQL 应急降级搜索。
 * @returns { ids: 当前页 ID, total: 总数 }；超时返回空
 */
export async function mysqlFallback(
  pool: Pool,
  p: UnifiedSearchParams,
  plan: FilterPlan,
): Promise<{ ids: number[]; total: number }> {
  const offset = (p.page - 1) * p.pageSize;
  const whereSql = [ACTIVE_NOTICE_WHERE, ...plan.mysqlWhere].join(" AND ");

  let fromSql: string;
  const queryParams: unknown[] = [];
  if (p.q) {
    const kw = buildKeywordUnion(p.q);
    fromSql = `crm_bid_notices n INNER JOIN (${kw.sql}) _kw ON _kw.id = n.id`;
    queryParams.push(...kw.params);
  } else {
    fromSql = "crm_bid_notices n";
  }
  queryParams.push(...plan.mysqlParams);

  const countSql = `SELECT COUNT(DISTINCT n.id) AS total FROM ${fromSql} WHERE ${whereSql}`;
  const idSql = `SELECT n.id FROM ${fromSql} WHERE ${whereSql} ORDER BY ${buildOrderBy(p)} LIMIT ? OFFSET ?`;
  const idParams = [...queryParams, p.pageSize, offset];

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`MySQL fallback timeout after ${MYSQL_TIMEOUT_MS}ms`)), MYSQL_TIMEOUT_MS));

    const [countResult, idResult] = await Promise.all([
      Promise.race([pool.query(countSql, queryParams), timeout]),
      Promise.race([pool.query(idSql, idParams), timeout]),
    ]) as [any, any];

    const total = Number((countResult[0] as RowDataPacket[])[0]?.total || 0);
    const ids = (idResult[0] as RowDataPacket[]).map((r) => Number(r.id)).filter(Boolean);
    return { ids, total };
  } catch (err) {
    console.warn(`[search-orchestrator] mysqlFallback 失败: ${(err as Error).message}`);
    return { ids: [], total: 0 };
  }
}
