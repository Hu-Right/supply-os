/**
 * 分层匹配查询构造（Tier 0~3）
 * Tiered matching query builder (Tier 0~3)
 *
 * @module server/services/industry-match/filter
 * @description 基于用户行业画像生成"单等值分层召回"计划：
 *              每层一个等值条件，各自命中 (levelN_id, notice_id) 复合索引，
 *              层间精细度递减、天然排序；实测单等值层查询远快于 OR 合并条件
 *              （OR 触发 index_merge 破坏索引去重，L2 等值 102ms vs OR 1.6s+）。
 *              层划分（分数随层递减）：
 *              T0 精确码 code_id 等值    → 5 分
 *              T1 等深 level{deepest} 等值 → 4 分
 *              T2.. 上溯各级等值           → 3/2 分（每级一层）
 *              Tn 码前缀 code LIKE        → 1 分
 *
 *              口径提醒（历史勘误）：
 *              - 桥接表 levelN_id 存的是 crm_unspsc_codes.id（VARCHAR），参数必须字符串化；
 *              - 桥接表 notice_id 关联主表外部编号，JOIN 必须用 n.notice_id；
 *              - 桥接行携带完整祖先路径，等值条件天然覆盖该分支下全部深层公告。
 */
import { MATCH_SCORE, type UserIndustryProfile, type IndustryMatchFilters } from "./types";
import { ACTIVE_NOTICE_WHERE, DEADLINE_SEC_EXPR } from "../../utils/notice-expired";
import { toBeijingUnixTs } from "../meilisearch/index";

export { ACTIVE_NOTICE_WHERE, DEADLINE_SEC_EXPR };

/** 日期格式校验正则 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 公告卡片基础字段 SQL 片段（分层查询与模糊兜底共用） */
export const NOTICE_SELECT_FIELDS = `n.id, n.notice_id, n.reference, n.title, n.notice_type, n.country,
       n.deadline, n.deadline_ts, n.estimated_value, n.is_featured, n.agency,
       LEFT(n.description, 300) AS description, n.documents, n.procurement_files,
       GROUP_CONCAT(DISTINCT b.code) AS codes_concat`;

/** 层内排序：无截止日期在前，其次截止时间近者优先 */
export const DEADLINE_ORDER = "(n.deadline_ts IS NULL) DESC, n.deadline_sec, n.id DESC";

/** 单层召回计划：桥接表单等值条件 + 该层固定分数 */
export interface TierQuery {
  /** 桥接表单等值/前缀条件（无外层括号，供 WHERE 拼接） */
  clause: string;
  /** clause 的参数 */
  params: unknown[];
  /** 该层匹配分（常量，层内无需再打分） */
  score: number;
}

/**
 * 生成单等值分层召回计划（T0 → T1 → ... 精细度递减）。
 */
export function buildIndustryMatchTiers(profile: UserIndustryProfile): TierQuery[] {
  const tiers: TierQuery[] = [];
  const deepest = profile.deepestLevel;

  // T0 精确码：公告标签与用户最深级类目完全同码
  if (profile.deepestId) {
    tiers.push({
      clause: "b.code_id = ?",
      params: [profile.deepestId],
      score: MATCH_SCORE.EXACT_CODE,
    });
  }

  // T1 等深匹配：最深级等值（子树全覆盖）
  const deepestId = profile.levelIds[deepest - 1];
  if (deepestId) {
    tiers.push({
      clause: `b.level${deepest}_id = ?`,
      params: [String(deepestId)],
      score: MATCH_SCORE.SAME_LEVEL,
    });
  }

  // T2.. 上溯匹配：每浅一级独立一层（N-1 级 3 分，更浅级 2 分）
  for (let level = deepest - 1; level >= 1; level -= 1) {
    const id = profile.levelIds[level - 1];
    if (!id) continue;
    tiers.push({
      clause: `b.level${level}_id = ?`,
      params: [String(id)],
      score: level === deepest - 1 ? MATCH_SCORE.UPPER_LEVEL : MATCH_SCORE.UPPER_LEVEL_COARSE,
    });
  }

  // 末层 码前缀兜底：覆盖 levelN_id 缺失的存量标签行
  if (profile.branchPrefix) {
    tiers.push({
      clause: "b.code LIKE ?",
      params: [`${profile.branchPrefix}%`],
      score: MATCH_SCORE.PREFIX,
    });
  }

  return tiers;
}

/**
 * 构建行业匹配叠加筛选的 WHERE 条件（国家/机构/日期/采购类型/精选）。
 * 关键词（q）不在此处处理——需由调用方通过两阶段 ID 查询单独处理。
 * 返回 { conditions, params }，调用方拼接到 WHERE 子句即可。
 */
export function buildIndustryFilterConditions(
  filters: IndustryMatchFilters | undefined,
  agencyExpandedClauses: { clause: string; params: unknown[] } | null,
): { conditions: string[]; params: unknown[] } {
  if (!filters) return { conditions: [], params: [] };

  const conditions: string[] = [];
  const params: unknown[] = [];

  // 国家筛选（与 search-pipeline 一致：展开国家别名）
  if (filters.country) {
    // agencyExpandedClauses 可能已包含国家条件（FORCE_COUNTRY 场景），避免重复
    if (!agencyExpandedClauses?.clause.includes("UPPER(n.country)")) {
      conditions.push("UPPER(n.country) = ?");
      params.push(filters.country.toUpperCase());
    }
  }

  // 机构筛选
  if (filters.agency && agencyExpandedClauses) {
    conditions.push(agencyExpandedClauses.clause);
    params.push(...agencyExpandedClauses.params);
  } else if (filters.agency) {
    conditions.push("n.agency = ?");
    params.push(filters.agency);
  }

  // 日期范围
  if (filters.deadlineFrom && DATE_RE.test(filters.deadlineFrom)) {
    const ts = toBeijingUnixTs(filters.deadlineFrom, "00:00:00");
    conditions.push(`${DEADLINE_SEC_EXPR} >= ?`);
    params.push(ts);
  }
  if (filters.deadlineTo && DATE_RE.test(filters.deadlineTo)) {
    const ts = toBeijingUnixTs(filters.deadlineTo, "23:59:59");
    conditions.push(`${DEADLINE_SEC_EXPR} <= ?`);
    params.push(ts);
  }
  if (filters.deadlineWithinDays && filters.deadlineWithinDays > 0) {
    const futureTs = Math.floor(Date.now() / 1000) + filters.deadlineWithinDays * 86400;
    conditions.push(`n.deadline_ts IS NOT NULL AND ${DEADLINE_SEC_EXPR} <= ?`);
    params.push(futureTs);
  }

  // 采购类型
  if (filters.noticeType) {
    conditions.push("n.notice_type = ?");
    params.push(filters.noticeType);
  }

  // 精选
  if (filters.featuredOnly) {
    conditions.push("n.is_featured = 1");
  }

  return { conditions, params };
}
