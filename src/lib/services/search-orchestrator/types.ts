/**
 * 统一搜索编排器 — 类型定义
 * Unified search orchestrator - type definitions
 *
 * @module server/services/search-orchestrator/types
 * @description 三种搜索模式（default/prefs/recommended）的统一参数与结果类型。
 *              对应《搜索链路架构级统一重构方案》第三节设计。
 *              crm_users.user_key 列退役收尾：身份参数仅保留 userId。
 */

/** 搜索模式：default=全量搜索 / prefs=行业精准匹配 / recommended=行为推荐 */
export type SearchMode = "default" | "prefs" | "recommended";

/** 统一搜索参数（已由 params.ts 校验归一化） */
export interface UnifiedSearchParams {
  mode: SearchMode;
  /** 内部用户 ID（user_id 迁移后为唯一身份锚点；未登录时为 undefined） */
  userId?: number;
  page: number;
  pageSize: number;
  locale: string;
  q: string;
  country: string;
  agency: string;
  deadlineFrom: string;
  deadlineTo: string;
  deadlineWithinDays: number;
  noticeType: string;
  featuredOnly: boolean;
  sort: "deadline" | "latest" | "deadline_farthest";
  /** UNSPSC 类目 ID（default 模式来自 URL code_id） */
  codeId: number;
}

/** 统一搜索结果（与前端 NoticeResponse 对齐） */
export interface UnifiedSearchResult {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  /** 推荐模式 A/B 桶标记 */
  variant?: string;
  /** no_prefs=无行业偏好 / no_match=无匹配 / mysql_degraded=MySQL 应急降级 / none=正常 */
  fallback?: "no_prefs" | "no_match" | "mysql_degraded" | "none";
}

/** Meilisearch filter 计划（filter-builder 输出） */
export interface FilterPlan {
  /** Meilisearch filter 数组（数组元素间 AND 连接） */
  meiliFilters: string[];
  /** MySQL 方言 WHERE 片段（降级路径使用，与 meiliFilters 同语义） */
  mysqlWhere: string[];
  /** mysqlWhere 的参数 */
  mysqlParams: unknown[];
  /** FORCE_COUNTRY 矛盾等冲突标记：true 时直接返回空结果 */
  conflictEmpty: boolean;
  /** filter 摘要（结构化日志用） */
  digest: string;
}

/** Meilisearch 查询结果 */
export interface MeiliHitResult {
  ids: number[];
  total: number;
  totalIsPrecise: boolean;
}

/** 检索执行路径（日志/指标用） */
export type SearchPath = "meili" | "mysql" | "ref-exact" | "reco-delegate";
