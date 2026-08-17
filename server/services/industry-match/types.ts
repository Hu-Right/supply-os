/**
 * 行业匹配领域类型定义
 * Industry matching domain types
 *
 * @module server/services/industry-match/types
 */

/** 用户五级行业画像（由 resolve.ts 解析） */
export interface UserIndustryProfile {
  userKey: string;
  /** 最深非空级（1~5） */
  deepestLevel: number;
  /** 各级类目 id（下标 0 = level1，未选级为 null） */
  levelIds: (number | null)[];
  /** 最深级类目 id */
  deepestId: number | null;
  /** 行业分支码前缀（如 '4214'，用于 Tier3 码前缀兜底） */
  branchPrefix: string | null;
  /** 行业中文名（Tier4 类目推断的关键词源） */
  industryTitleZh: string | null;
}

/** 公告匹配分（数值越大越精细，排序依据） */
export const MATCH_SCORE = {
  /** Tier0 精确码：公告标签与用户行业完全同码 */
  EXACT_CODE: 5,
  /** Tier1 等深匹配：公告挂在该 N 级分支下（子树全覆盖） */
  SAME_LEVEL: 4,
  /** Tier2 上溯匹配：退到 N-1 级大类 */
  UPPER_LEVEL: 3,
  /** Tier2 更浅上溯：退到 N-2 级或更浅 */
  UPPER_LEVEL_COARSE: 2,
  /** Tier3 码前缀兜底：levelN_id 缺失时的容错 */
  PREFIX: 1,
  /** Tier4 类目推断：通过 smartInferUnspsc 在类目树中推断相关类目，按 code 前缀精确召回 */
  INFERRED_CATEGORY: 0.5,
} as const;

/** 匹配档次标签（按 match_score 映射，供展示推荐理由） */
export type MatchTierLabel =
  | "exact_code"
  | "same_level"
  | "upper_level"
  | "prefix"
  | "inferred_category"
  | "unmatched";

/** 行业匹配叠加筛选参数（与 /api/notices 对齐） */
export interface IndustryMatchFilters {
  q?: string;
  country?: string;
  agency?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  deadlineWithinDays?: number;
  noticeType?: string;
  featuredOnly?: boolean;
  sort?: string;
}

/** 行业匹配查询结果 */
export interface IndustryMatchResult {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  /** no_prefs=无行业偏好 / no_match=无匹配结果 / none=正常 */
  fallback: "no_prefs" | "no_match" | "none";
}
